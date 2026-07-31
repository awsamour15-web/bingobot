import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getRound, getCartelaAvailability, joinRound, getProfile } from '../lib/api';
import { socket } from '../lib/socket';
import type { RoundDetail, CartelaAvailability, PlayerJoinedPayload } from '../lib/api';

interface ProfileBalances {
  mainWallet: { balance: number };
  playWallet: { balance: number };
}

const TOTAL = 800;
const MAX_SELECT = 2; // each user can pick up to 2 cartelas

// ─── Countdown synced to server start_time ───────────────────────────────────

function useServerCountdown(targetIso: string | null) {
  const [msLeft, setMsLeft] = useState(0);

  useEffect(() => {
    if (!targetIso) return;
    const tick = () => setMsLeft(Math.max(0, new Date(targetIso).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [targetIso]);

  const totalSec = Math.ceil(msLeft / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return {
    msLeft,
    label: msLeft <= 0 ? '0:00' : `${m}:${String(s).padStart(2, '0')}`,
    pct: targetIso ? Math.min(1, msLeft / 60_000) : 0,
  };
}

export default function CartelaScreen() {
  const { id: roundId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Guard: must come from stake selection
  useEffect(() => {
    const fromGame = sessionStorage.getItem('stakeSelectedForRound');
    if (!fromGame || fromGame !== roundId) navigate('/', { replace: true });
  }, [roundId, navigate]);

  const [round, setRound] = useState<RoundDetail | null>(null);
  const [availability, setAvailability] = useState<CartelaAvailability | null>(null);
  const [balances, setBalances] = useState<ProfileBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Up to 2 selected cartela numbers (not yet joined — joined when timer ends)
  const [picks, setPicks] = useState<number[]>([]);
  const [joining, setJoining] = useState(false);
  const joinedRef = useRef(false); // prevent double-fire

  const { msLeft, label: countdownLabel, pct } = useServerCountdown(round?.start_time ?? null);

  // ─── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roundId) return;
    async function load() {
      try {
        const [r, avail, profile] = await Promise.all([
          getRound(roundId!),
          getCartelaAvailability(roundId!),
          getProfile(),
        ]);
        setRound(r);
        setAvailability(avail);
        setBalances(profile);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [roundId]);

  // ─── Socket: live player count ───────────────────────────────────────────
  useEffect(() => {
    if (!roundId) return;
    if (!socket.connected) socket.connect();
    socket.emit('JOIN_ROUND', { roundId, token: localStorage.getItem('jwt') ?? '' });
    const onJoined = (p: PlayerJoinedPayload) =>
      setRound((r) => r ? { ...r, player_count: p.playerCount } : r);
    socket.on('PLAYER_JOINED', onJoined);
    return () => { socket.off('PLAYER_JOINED', onJoined); };
  }, [roundId]);

  // ─── When timer hits 0 → join all picked cartelas then go to game ────────
  useEffect(() => {
    if (msLeft > 0 || joinedRef.current || joining) return;
    joinedRef.current = true;

    async function startGame() {
      setJoining(true);
      setError(null);
      try {
        if (picks.length > 0) {
          // Join each selected cartela sequentially
          for (const num of picks) {
            await joinRound(roundId!, num);
          }
        }
        // Navigate to game (as player if joined, watcher if no picks)
        sessionStorage.setItem('selectedRoundId', roundId!);
        navigate(`/rounds/${roundId}/game`, { replace: true });
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        setError(e.message ?? 'Failed to join round');
        setJoining(false);
        joinedRef.current = false;
      }
    }

    void startGame();
  }, [msLeft, picks, joining, roundId, navigate]);

  // ─── Toggle pick ─────────────────────────────────────────────────────────
  function togglePick(num: number) {
    if (joining) return;
    setPicks((prev) => {
      if (prev.includes(num)) return prev.filter((n) => n !== num); // deselect
      if (prev.length >= MAX_SELECT) return prev; // max reached
      return [...prev, num];
    });
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ height: '100dvh', background: '#0f0c29', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 16 }}>
        Loading cartelas…
      </div>
    );
  }

  if (!round || !availability) {
    return (
      <div style={{ height: '100dvh', background: '#0f0c29', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e53e3e', padding: 24, textAlign: 'center' }}>
        {error ?? 'Could not load round data'}
      </div>
    );
  }

  const takenSet = new Set(availability.taken);
  const allNumbers = Array.from({ length: TOTAL }, (_, i) => i + 1);
  const urgent = msLeft > 0 && msLeft < 10_000;
  const canPick = picks.length < MAX_SELECT;

  return (
    <div style={{ height: '100dvh', background: '#0f0c29', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span onClick={() => navigate(-1)} style={{ cursor: 'pointer', fontSize: 20 }}>←</span>
            <span style={{ fontWeight: 800, fontSize: 16 }}>Pick Your Cartela</span>
          </div>
          <span style={{ fontSize: 12, color: '#a5b4fc' }}>
            {picks.length}/{MAX_SELECT} selected
          </span>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 13 }}>
          <div><span style={{ opacity: 0.6 }}>Stake </span><strong>{round.stake} Birr</strong></div>
          <div><span style={{ opacity: 0.6 }}>Prize </span><strong style={{ color: '#f5d06b' }}>{round.derash} Birr</strong></div>
          <div><span style={{ opacity: 0.6 }}>Players </span><strong>{round.player_count}</strong></div>
          {balances && <div><span style={{ opacity: 0.6 }}>Balance </span><strong>{balances.playWallet.balance.toFixed(0)} Birr</strong></div>}
        </div>
      </div>

      {/* ── Countdown ───────────────────────────────────────────────────────── */}
      <div style={{
        background: urgent ? 'rgba(239,68,68,0.2)' : 'rgba(79,70,229,0.2)',
        borderBottom: `2px solid ${urgent ? '#ef4444' : '#4f46e5'}`,
        padding: '10px 20px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, color: '#aaa', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
          Game starts in
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, color: urgent ? '#ef4444' : '#fff', fontVariantNumeric: 'tabular-nums', letterSpacing: 3 }}>
          {countdownLabel}
        </div>
        <div style={{ marginTop: 6, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct * 100}%`, background: urgent ? '#ef4444' : '#6366f1', transition: 'width 0.25s linear' }} />
        </div>
        {picks.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#86efac' }}>
            ✅ Cartela {picks.join(' & ')} reserved — game starts automatically
          </div>
        )}
        {picks.length === 0 && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#aaa' }}>
            Tap a number to pick (up to {MAX_SELECT}) — or watch without a cartela
          </div>
        )}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', padding: '8px 16px', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Legend ──────────────────────────────────────────────────────────── */}
      <div style={{ padding: '6px 16px', display: 'flex', gap: 14, fontSize: 11, color: '#aaa' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#4f46e5', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Available</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#22c55e', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Your pick</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Taken</span>
        {!canPick && <span style={{ color: '#f5d06b' }}>Max {MAX_SELECT} reached</span>}
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: 5,
        padding: '4px 12px 20px',
        alignContent: 'start',
      }}>
        {allNumbers.map((num) => {
          const taken = takenSet.has(num);
          const isPicked = picks.includes(num);
          const disabled = joining || taken || (!isPicked && !canPick);

          const bg = isPicked ? '#22c55e' : taken ? 'rgba(255,255,255,0.07)' : '#3730a3';
          const textColor = taken ? '#444' : '#fff';

          return (
            <button
              key={num}
              disabled={disabled}
              onClick={() => togglePick(num)}
              style={{
                padding: '9px 0',
                borderRadius: 7,
                border: isPicked ? '2px solid #fff' : '2px solid transparent',
                background: bg,
                color: textColor,
                fontWeight: 700,
                fontSize: 12,
                cursor: disabled ? 'default' : 'pointer',
                opacity: taken ? 0.4 : (!isPicked && !canPick) ? 0.5 : 1,
                transform: isPicked ? 'scale(1.08)' : 'scale(1)',
                transition: 'transform 0.1s, background 0.15s',
                WebkitAppearance: 'none',
                appearance: 'none',
                outline: 'none',
                lineHeight: 1,
                boxSizing: 'border-box',
                userSelect: 'none',
              }}
            >
              {num}
            </button>
          );
        })}
      </div>

      {/* ── Joining overlay ─────────────────────────────────────────────────── */}
      {joining && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,12,41,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 14, zIndex: 50,
        }}>
          <div style={{ fontSize: 40 }}>🎮</div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>Starting game…</div>
          <div style={{ color: '#a5b4fc', fontSize: 14 }}>
            {picks.length > 0 ? `Joining with cartela ${picks.join(' & ')}` : 'Joining as watcher'}
          </div>
        </div>
      )}
    </div>
  );
}
