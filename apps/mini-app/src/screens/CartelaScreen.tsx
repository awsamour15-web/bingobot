import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getRound, getCartelaAvailability, getCartelaGrid, joinRound, getProfile } from '../lib/api';
import { socket } from '../lib/socket';
import type { RoundDetail, CartelaAvailability, PlayerJoinedPayload } from '../lib/api';

interface ProfileBalances {
  mainWallet: { balance: number };
  playWallet: { balance: number };
}

const COLS = ['B', 'I', 'N', 'G', 'O'];
const COL_COLORS = ['#7c3aed', '#2563eb', '#16a34a', '#d97706', '#dc2626'];
const TOTAL = 800;
const MAX_SELECT = 2;

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

// 5×5 cartela preview
function CartelaPreview({ grid, label }: { grid: number[]; label: string }) {
  if (!grid.length) return null;
  return (
    <div style={{ background: '#0d1b2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, overflow: 'hidden', width: '100%' }}>
      {/* Header */}
      <div style={{ background: '#112240', padding: '6px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>
        Cartela #{label}
      </div>
      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {COLS.map((c, i) => (
          <div key={c} style={{ background: COL_COLORS[i], textAlign: 'center', padding: '5px 0', fontWeight: 900, fontSize: 13, color: '#fff' }}>{c}</div>
        ))}
      </div>
      {/* Grid cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, padding: 4 }}>
        {grid.map((val, idx) => {
          const isFree = idx === 12;
          return (
            <div key={idx} style={{
              aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isFree ? '#f59e0b' : '#1a2744',
              color: isFree ? '#0a0e1a' : '#e2e8f0',
              borderRadius: 4, fontSize: 12, fontWeight: isFree ? 900 : 600,
            }}>
              {isFree ? '★' : val}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CartelaScreen() {
  const { id: roundId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    const fromGame = sessionStorage.getItem('stakeSelectedForRound');
    if (!fromGame || fromGame !== roundId) navigate('/', { replace: true });
  }, [roundId, navigate]);

  const [round, setRound] = useState<RoundDetail | null>(null);
  const [availability, setAvailability] = useState<CartelaAvailability | null>(null);
  const [balances, setBalances] = useState<ProfileBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [picks, setPicks] = useState<number[]>([]);
  // Preview grids for selected cartelas
  const [previewGrids, setPreviewGrids] = useState<Record<number, number[]>>({});
  const [previewLoading, setPreviewLoading] = useState<Record<number, boolean>>({});

  const [joining, setJoining] = useState(false);
  const joinedRef = useRef(false);
  const countdownStartedRef = useRef(false);
  const [manualTrigger, setManualTrigger] = useState(false);

  const { msLeft, label: countdownLabel, pct } = useServerCountdown(round?.start_time ?? null);

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
        if (r.status === 'active' || r.status === 'completed') {
          countdownStartedRef.current = true;
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [roundId]);

  useEffect(() => {
    if (!roundId) return;
    if (!socket.connected) socket.connect();
    socket.emit('JOIN_ROUND', { roundId, token: localStorage.getItem('jwt') ?? '' });
    const onJoined = (p: PlayerJoinedPayload) =>
      setRound(r => r ? { ...r, player_count: p.playerCount } : r);
    socket.on('PLAYER_JOINED', onJoined);
    return () => {
      socket.off('PLAYER_JOINED', onJoined);
      socket.emit('LEAVE_ROUND' as any, { roundId });
    };
  }, [roundId]);

  useEffect(() => { if (msLeft > 0) countdownStartedRef.current = true; }, [msLeft]);

  // Fetch cartela grid when a number is picked
  const fetchGrid = useCallback(async (num: number) => {
    if (!roundId || previewGrids[num]) return;
    setPreviewLoading(p => ({ ...p, [num]: true }));
    try {
      const data = await getCartelaGrid(roundId, num);
      setPreviewGrids(p => ({ ...p, [num]: data.grid }));
    } catch {}
    finally { setPreviewLoading(p => ({ ...p, [num]: false })); }
  }, [roundId, previewGrids]);

  // Join + navigate when timer hits 0
  useEffect(() => {
    if (!round || msLeft > 0 || (!countdownStartedRef.current && !manualTrigger) || joinedRef.current || joining) return;
    joinedRef.current = true;

    async function startGame() {
      setJoining(true);
      setError(null);
      try {
        const currentRound = await getRound(roundId!);
        if (currentRound.status === 'void' || currentRound.status === 'cancelled') {
          sessionStorage.removeItem('stakeSelectedForRound');
          navigate('/', { replace: true });
          return;
        }
        if (currentRound.status === 'active' || currentRound.status === 'completed') {
          sessionStorage.setItem('selectedRoundId', roundId!);
          navigate(`/rounds/${roundId}/game`, { replace: true });
          return;
        }
        if (picks.length > 0) {
          for (const num of picks) await joinRound(roundId!, num);
        }
        sessionStorage.setItem('selectedRoundId', roundId!);
        navigate(`/rounds/${roundId}/game`, { replace: true });
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        if (e.message?.includes('not pending') || e.message?.includes('void') || e.message?.includes('cancelled')) {
          sessionStorage.setItem('selectedRoundId', roundId!);
          navigate(`/rounds/${roundId}/game`, { replace: true });
          return;
        }
        setError(e.message ?? 'Failed to join round');
        setJoining(false);
        joinedRef.current = false;
      }
    }
    void startGame();
  }, [msLeft, picks, joining, roundId, navigate, manualTrigger]);

  function togglePick(num: number) {
    if (joining) return;
    if (picks.includes(num)) {
      setPicks(prev => prev.filter(n => n !== num));
      return;
    }
    if (round && balances) {
      const stake = Number(round.stake);
      const playBal = Number(balances.playWallet.balance);
      const mainBal = Number(balances.mainWallet.balance);
      const totalCost = stake * (picks.length + 1);
      if (playBal + mainBal < totalCost) {
        setError(`Insufficient balance. Need ${totalCost} Birr (have ${(playBal + mainBal).toFixed(0)} Birr).`);
        return;
      }
    }
    setError(null);
    setPicks(prev => {
      if (prev.length >= MAX_SELECT) return prev;
      return [...prev, num];
    });
    fetchGrid(num);
  }

  if (loading) return (
    <div style={{ height: '100dvh', background: '#0a0e1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 16 }}>
      Loading cartelas…
    </div>
  );

  if (!round || !availability) return (
    <div style={{ height: '100dvh', background: '#0a0e1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', padding: 24, textAlign: 'center' }}>
      {error ?? 'Could not load round data'}
    </div>
  );

  const takenSet = new Set(availability.taken);
  const allNumbers = Array.from({ length: TOTAL }, (_, i) => i + 1);
  const urgent = msLeft > 0 && msLeft < 10_000;
  const canPick = picks.length < MAX_SELECT;
  const stake = Number(round.stake);
  const playBal = balances ? Number(balances.playWallet.balance) : 0;
  const mainBal = balances ? Number(balances.mainWallet.balance) : 0;
  const canAfford = balances === null || (playBal + mainBal) >= stake;

  return (
    <div style={{ height: '100dvh', background: '#0a0e1a', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ background: '#0d1b2e', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '12px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span onClick={() => navigate(-1)} style={{ cursor: 'pointer', fontSize: 22, color: '#64748b' }}>←</span>
            <span style={{ fontWeight: 900, fontSize: 16, color: '#f1f5f9' }}>Pick Your Cartela</span>
          </div>
          <span style={{ fontSize: 12, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 20, padding: '3px 10px', fontWeight: 700 }}>
            {picks.length}/{MAX_SELECT}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#64748b' }}>
          <span>Stake <strong style={{ color: '#f1f5f9' }}>{round.stake} Birr</strong></span>
          <span>Prize <strong style={{ color: '#f59e0b' }}>{round.derash} Birr</strong></span>
          <span>Players <strong style={{ color: '#f1f5f9' }}>{round.player_count}</strong></span>
          {balances && <span>Balance <strong style={{ color: '#34d399' }}>{(playBal + mainBal).toFixed(0)} Birr</strong></span>}
        </div>
      </div>

      {/* ── Countdown ── */}
      <div style={{
        background: urgent ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.08)',
        borderBottom: `2px solid ${urgent ? '#ef4444' : '#f59e0b'}`,
        padding: '10px 20px', textAlign: 'center', flexShrink: 0,
      }}>
        <div style={{ fontSize: 10, color: '#475569', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>Game starts in</div>
        <div style={{ fontSize: 38, fontWeight: 900, color: urgent ? '#ef4444' : '#f59e0b', fontVariantNumeric: 'tabular-nums', letterSpacing: 2 }}>
          {countdownLabel}
        </div>
        <div style={{ marginTop: 6, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct * 100}%`, background: urgent ? '#ef4444' : '#f59e0b', transition: 'width 0.25s linear' }} />
        </div>
        {picks.length > 0
          ? <div style={{ marginTop: 6, fontSize: 12, color: '#34d399' }}>✅ Cartela {picks.join(' & ')} selected — joining automatically</div>
          : <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>Select up to {MAX_SELECT} cartelas, or watch for free</div>
        }
        {!countdownStartedRef.current && msLeft === 0 && !joining && (
          <button onClick={() => { joinedRef.current = false; setManualTrigger(true); }}
            style={{ marginTop: 8, padding: '8px 24px', background: '#f59e0b', color: '#0a0e1a', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            {picks.length > 0 ? 'Join Now' : 'Watch Game'}
          </button>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', padding: '8px 16px', fontSize: 13, flexShrink: 0, borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* ── No balance warning ── */}
      {!canAfford && (
        <div style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', padding: '8px 16px', fontSize: 12, textAlign: 'center', flexShrink: 0 }}>
          ⚠️ Insufficient balance (need {stake} Birr). You can watch for free.
        </div>
      )}

      {/* ── Main content: grid + previews ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Selected cartela previews */}
        {picks.length > 0 && (
          <div style={{ padding: '10px 12px 0', flexShrink: 0, display: 'grid', gridTemplateColumns: picks.length === 2 ? '1fr 1fr' : '1fr', gap: 8 }}>
            {picks.map(num => (
              <div key={num} style={{ position: 'relative' }}>
                {previewLoading[num]
                  ? <div style={{ background: '#0d1b2e', borderRadius: 12, padding: 20, textAlign: 'center', color: '#475569', fontSize: 12 }}>Loading…</div>
                  : previewGrids[num]
                    ? <CartelaPreview grid={previewGrids[num]!} label={String(num)} />
                    : null
                }
                {/* Remove button */}
                <button onClick={() => setPicks(p => p.filter(n => n !== num))}
                  style={{ position: 'absolute', top: 6, right: 6, background: '#ef4444', border: 'none', borderRadius: '50%', width: 20, height: 20, color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, zIndex: 2 }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        <div style={{ padding: '6px 12px', display: 'flex', gap: 12, fontSize: 10, color: '#475569', flexShrink: 0, flexWrap: 'wrap' }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#3730a3', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Available</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#f59e0b', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Selected</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Taken</span>
          {!canPick && <span style={{ color: '#f59e0b', fontWeight: 700 }}>Max {MAX_SELECT} reached</span>}
        </div>

        {/* Number grid */}
        <div style={{
          flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)',
          gap: 4, padding: '0 10px 20px', alignContent: 'start',
        }}>
          {allNumbers.map(num => {
            const taken = takenSet.has(num);
            const isPicked = picks.includes(num);
            const noBalance = !isPicked && !canAfford;
            const disabled = joining || taken || (!isPicked && !canPick) || noBalance;
            const bg = isPicked ? '#f59e0b' : taken ? 'rgba(255,255,255,0.04)' : noBalance ? 'rgba(255,255,255,0.03)' : '#1e3a5f';
            const color = isPicked ? '#0a0e1a' : taken || noBalance ? '#1e293b' : '#e2e8f0';

            return (
              <button key={num} disabled={disabled} onClick={() => togglePick(num)}
                style={{
                  padding: '8px 0', borderRadius: 7,
                  border: isPicked ? '2px solid #fbbf24' : '1px solid rgba(255,255,255,0.06)',
                  background: bg, color, fontWeight: isPicked ? 900 : 600,
                  fontSize: 11, cursor: disabled ? 'default' : 'pointer',
                  opacity: taken ? 0.3 : noBalance ? 0.2 : 1,
                  transform: isPicked ? 'scale(1.06)' : 'scale(1)',
                  transition: 'transform 0.1s, background 0.15s',
                  WebkitAppearance: 'none', appearance: 'none', outline: 'none',
                  lineHeight: 1, boxSizing: 'border-box', userSelect: 'none',
                }}>
                {num}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Joining overlay ── */}
      {joining && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(10,14,26,0.95)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 14, zIndex: 50,
        }}>
          <div style={{ fontSize: 48 }}>🎮</div>
          <div style={{ color: '#f59e0b', fontWeight: 900, fontSize: 20 }}>Starting game…</div>
          <div style={{ color: '#64748b', fontSize: 14 }}>
            {picks.length > 0 ? `Joining with cartela ${picks.join(' & ')}` : 'Joining as watcher'}
          </div>
        </div>
      )}
    </div>
  );
}
