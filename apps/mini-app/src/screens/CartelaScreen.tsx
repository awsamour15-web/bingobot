import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getRound, getCartelaAvailability, joinRound, getProfile } from '../lib/api';
import { socket } from '../lib/socket';
import type { RoundDetail, CartelaAvailability, PlayerJoinedPayload } from '../lib/api';

interface ProfileBalances {
  mainWallet: { balance: number };
  playWallet: { balance: number };
}

// ─── Countdown hook synced to a server timestamp ─────────────────────────────

function useServerCountdown(targetIso: string | null) {
  const [msLeft, setMsLeft] = useState<number>(0);

  useEffect(() => {
    if (!targetIso) return;
    function tick() {
      setMsLeft(Math.max(0, new Date(targetIso!).getTime() - Date.now()));
    }
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [targetIso]);

  const s = Math.ceil(msLeft / 1000);
  const m = Math.floor(s / 60);
  const secs = s % 60;
  return {
    msLeft,
    label: msLeft <= 0 ? 'Starting…' : `${m}:${String(secs).padStart(2, '0')}`,
    pct: targetIso
      ? Math.min(1, msLeft / 10_000) // fraction of 10-second window
      : 0,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

const TOTAL = 800;

export default function CartelaScreen() {
  const { id: roundId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Guard: must come from stake selection
  useEffect(() => {
    const fromGame = sessionStorage.getItem('stakeSelectedForRound');
    if (!fromGame || fromGame !== roundId) {
      navigate('/', { replace: true });
    }
  }, [roundId, navigate]);

  const [round, setRound] = useState<RoundDetail | null>(null);
  const [availability, setAvailability] = useState<CartelaAvailability | null>(null);
  const [balances, setBalances] = useState<ProfileBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);   // chosen but not yet joined
  const [joining, setJoining] = useState(false);
  const [joinedCartela, setJoinedCartela] = useState<number | null>(null); // confirmed join
  const autoNavRef = useRef(false);

  const { msLeft, label: countdownLabel, pct } = useServerCountdown(round?.start_time ?? null);

  // ─── Load initial data ────────────────────────────────────────────────────
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

  // ─── Socket: keep player count fresh ────────────────────────────────────
  useEffect(() => {
    if (!roundId) return;
    if (!socket.connected) socket.connect();
    socket.emit('JOIN_ROUND', { roundId, token: localStorage.getItem('jwt') ?? '' });

    const onJoined = (p: PlayerJoinedPayload) => {
      setRound((r) => r ? { ...r, player_count: p.playerCount } : r);
    };
    socket.on('PLAYER_JOINED', onJoined);
    return () => { socket.off('PLAYER_JOINED', onJoined); };
  }, [roundId]);

  // ─── Auto-navigate when countdown hits 0 and player has joined ────────
  useEffect(() => {
    if (msLeft === 0 && joinedCartela !== null && !autoNavRef.current) {
      autoNavRef.current = true;
      sessionStorage.setItem('selectedRoundId', roundId!);
      navigate(`/rounds/${roundId}/game`, { replace: true });
    }
  }, [msLeft, joinedCartela, roundId, navigate]);

  // ─── Select a cartela (pre-pick before confirming) ────────────────────
  const handleSelect = useCallback((num: number) => {
    if (joining || joinedCartela !== null) return;
    setSelected((prev) => prev === num ? null : num);
    setError(null);
  }, [joining, joinedCartela]);

  // ─── Confirm join ─────────────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (!roundId || selected === null || joining) return;
    setJoining(true);
    setError(null);
    try {
      await joinRound(roundId, selected);
      setJoinedCartela(selected);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'INSUFFICIENT_BALANCE') {
        setError('Insufficient balance to join this round.');
      } else if (e.code === 'CARTELA_TAKEN') {
        setError('That cartela was just taken. Please pick another.');
        setSelected(null);
        getCartelaAvailability(roundId).then(setAvailability).catch(() => null);
      } else {
        setError(e.message ?? 'Failed to join round');
      }
    } finally {
      setJoining(false);
    }
  }, [roundId, selected, joining]);

  // ─── Render ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ height: '100dvh', background: '#0f0c29', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 16 }}>
        Loading cartelas…
      </div>
    );
  }

  if (!round || !availability) {
    return (
      <div style={{ height: '100dvh', background: '#0f0c29', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#e53e3e' }}>
        {error ?? 'Could not load round data'}
      </div>
    );
  }

  const takenSet = new Set(availability.taken);
  const allNumbers = Array.from({ length: TOTAL }, (_, i) => i + 1);
  const urgent = msLeft > 0 && msLeft < 5_000;

  return (
    <div style={{ height: '100dvh', background: '#0f0c29', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span onClick={() => navigate(-1)} style={{ cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>←</span>
          <span style={{ fontWeight: 800, fontSize: 17 }}>Select Your Cartela</span>
        </div>

        {/* Round stats row */}
        <div style={{ marginTop: 10, display: 'flex', gap: 20, fontSize: 13 }}>
          <div><span style={{ opacity: 0.6 }}>Stake </span><strong>{round.stake} Birr</strong></div>
          <div><span style={{ opacity: 0.6 }}>Prize </span><strong style={{ color: '#f5d06b' }}>{round.derash} Birr</strong></div>
          <div><span style={{ opacity: 0.6 }}>Players </span><strong>{round.player_count}/{round.max_players}</strong></div>
        </div>

        {/* Wallet */}
        {balances && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#aaa' }}>
            Play wallet: <strong style={{ color: '#fff' }}>{balances.playWallet.balance.toFixed(2)} Birr</strong>
          </div>
        )}
      </div>

      {/* ── Countdown timer ─────────────────────────────────────────────────── */}
      <div style={{
        background: urgent ? 'rgba(239,68,68,0.15)' : 'rgba(79,70,229,0.2)',
        borderBottom: `2px solid ${urgent ? '#ef4444' : '#4f46e5'}`,
        padding: '16px 20px',
        textAlign: 'center',
      }}>
        {joinedCartela !== null ? (
          <div>
            <div style={{ fontSize: 13, color: '#86efac', marginBottom: 4 }}>✅ Cartela #{joinedCartela} reserved</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: urgent ? '#fca5a5' : '#a5b4fc', letterSpacing: 3 }}>
              {countdownLabel}
            </div>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>Game starts automatically when timer ends</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
              Time to pick
            </div>
            <div style={{ fontSize: 40, fontWeight: 900, color: urgent ? '#ef4444' : '#fff', letterSpacing: 4, fontVariantNumeric: 'tabular-nums' }}>
              {countdownLabel}
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div style={{ marginTop: 10, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${pct * 100}%`,
            background: urgent ? '#ef4444' : '#6366f1',
            transition: 'width 0.25s linear',
          }} />
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', padding: '10px 16px', fontSize: 14, borderBottom: '1px solid rgba(239,68,68,0.3)' }}>
          {error}
        </div>
      )}

      {/* ── Legend ──────────────────────────────────────────────────────────── */}
      <div style={{ padding: '10px 16px', display: 'flex', gap: 16, fontSize: 12, color: '#aaa' }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#4f46e5', borderRadius: 3, marginRight: 4, verticalAlign: 'middle' }} />Available</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#22c55e', borderRadius: 3, marginRight: 4, verticalAlign: 'middle' }} />Selected</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgba(255,255,255,0.1)', borderRadius: 3, marginRight: 4, verticalAlign: 'middle' }} />Taken</span>
        {joinedCartela !== null && (
          <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#f5d06b', borderRadius: 3, marginRight: 4, verticalAlign: 'middle' }} />Yours</span>
        )}
      </div>

      {/* ── Cartela grid ────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: 5,
        padding: '4px 12px 130px',
        alignContent: 'start',
      }}>
        {allNumbers.map((num) => {
          const taken = takenSet.has(num);
          const isSelected = selected === num;
          const isJoined = joinedCartela === num;

          let bg = '#4f46e5';
          let textColor = '#fff';
          let opacity = 1;
          let border = 'none';

          if (isJoined) {
            bg = '#f5d06b'; textColor = '#1a1a1a';
          } else if (isSelected) {
            bg = '#22c55e';
          } else if (taken) {
            bg = 'rgba(255,255,255,0.08)'; textColor = '#555'; opacity = 0.7;
          }

          if (isSelected) border = '2px solid #fff';

          return (
            <button
              key={num}
              disabled={taken || joining || joinedCartela !== null}
              onClick={() => handleSelect(num)}
              style={{
                padding: '9px 0',
                borderRadius: 7,
                border: isSelected ? '2px solid #fff' : '2px solid transparent',
                background: bg,
                color: textColor,
                fontWeight: 700,
                fontSize: 12,
                cursor: (taken || joinedCartela !== null) ? 'default' : 'pointer',
                opacity,
                transition: 'background 0.15s, transform 0.1s',
                transform: isSelected ? 'scale(1.08)' : 'scale(1)',
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

      {/* ── Sticky confirm bar ──────────────────────────────────────────────── */}
      {joinedCartela === null && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '14px 16px',
          background: 'rgba(15,12,41,0.97)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(8px)',
        }}>
          {selected !== null ? (
            <button
              onClick={handleConfirm}
              disabled={joining}
              style={{
                width: '100%',
                padding: '15px',
                background: joining ? '#6b7280' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 800,
                cursor: joining ? 'default' : 'pointer',
                WebkitAppearance: 'none',
                appearance: 'none',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            >
              {joining ? 'Reserving…' : `Confirm Cartela #${selected} — ${round.stake} Birr`}
            </button>
          ) : (
            <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
              Tap a cartela number to select it
            </div>
          )}
        </div>
      )}
    </div>
  );
}
