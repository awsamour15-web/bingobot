import { useEffect, useState, useRef, memo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getRound, getCartelaAvailability, joinRoundBatch, getProfile } from '../lib/api';
import { initAuth } from '../lib/auth';
import { socket } from '../lib/socket';
import type { RoundDetail, CartelaAvailability, PlayerJoinedPayload, RoundStartedPayload, RoundVoidPayload, RoundCancelledPayload } from '../lib/api';

interface ProfileBalances {
  mainWallet: { balance: number };
  playWallet: { balance: number };
}

const TOTAL = 800;
const MAX_SELECT = 2;
const ALL_NUMBERS = Array.from({ length: TOTAL }, (_, i) => i + 1);

interface CartelaCellProps {
  num: number;
  taken: boolean;
  isPicked: boolean;
  disabled: boolean;
  onClick: (num: number) => void;
}
const CartelaCell = memo(function CartelaCell({ num, taken, isPicked, disabled, onClick }: CartelaCellProps) {
  const bg = isPicked
    ? 'linear-gradient(135deg, #22c55e, #16a34a)'
    : taken
    ? 'rgba(239,68,68,0.25)'
    : 'rgba(255,255,255,0.04)';
  const color = isPicked ? '#fff' : taken ? '#f87171' : '#64748b';
  const border = isPicked ? '1.5px solid #4ade80' : taken ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.07)';
  return (
    <button
      disabled={disabled}
      onClick={() => onClick(num)}
      style={{
        padding: '5px 0', borderRadius: 6,
        border,
        background: bg,
        color,
        fontWeight: isPicked ? 900 : taken ? 600 : 500,
        fontSize: 10,
        cursor: disabled ? 'default' : 'pointer',
        transform: isPicked ? 'scale(1.08)' : 'scale(1)',
        transition: 'transform 0.1s, background 0.12s',
        WebkitAppearance: 'none', appearance: 'none', outline: 'none',
        lineHeight: 1, boxSizing: 'border-box', userSelect: 'none',
        boxShadow: isPicked ? '0 0 8px rgba(34,197,94,0.5)' : 'none',
      }}
    >
      {num}
    </button>
  );
});

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

  const [round, setRound] = useState<RoundDetail | null>(null);
  const [availability, setAvailability] = useState<CartelaAvailability | null>(null);
  const [balances, setBalances] = useState<ProfileBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local picks — purely local until game starts
  const [picks, setPicks] = useState<Set<number>>(new Set());
  const picksRef = useRef<Set<number>>(new Set());
  useEffect(() => { picksRef.current = picks; }, [picks]);

  const [balanceAlert, setBalanceAlert] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<{ title: string; message: string } | null>(null);
  const [committing, setCommitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const joinedRef = useRef(false);
  const countdownStartedRef = useRef(false);
  const [manualTrigger, setManualTrigger] = useState(false);

  const { msLeft, label: countdownLabel, pct } = useServerCountdown(round?.start_time ?? null);

  useEffect(() => {
    if (!roundId) return;
    async function load() {
      try {
        await initAuth();
        const [r, avail, profile] = await Promise.all([
          getRound(roundId!),
          getCartelaAvailability(roundId!),
          getProfile().catch(() => null),
        ]);
        setRound(r);
        setAvailability(avail);
        if (profile) setBalances(profile);
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

  // Commit picks to server — only called when game is about to start
  async function commitPicks(currentPicks: Set<number>): Promise<void> {
    if (currentPicks.size === 0) return;
    setCommitting(true);
    setError(null);
    try {
      const result = await joinRoundBatch(roundId!, [...currentPicks]);
      setBalances({ mainWallet: { balance: result.mainWalletBalance }, playWallet: { balance: result.playWalletBalance } });
      // Store confirmed cartela numbers for the game screen
      sessionStorage.setItem('myCartelaNumbers', JSON.stringify(result.cartelaNumbers));
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'INSUFFICIENT_BALANCE' || e.message?.includes('ቀሪ ሂሳብ')) {
        setBalanceAlert(e.message ?? 'ቀሪ ሂሳብ አይበቃም!\nPlease deposit to continue.');
      } else if (e.code === 'CARTELA_TAKEN' || e.message?.includes('already taken')) {
        setJoinError({ title: 'Cartela Taken', message: 'One of your selected cartelas was just taken. Please pick a different one.' });
        // Clear picks so user re-selects
        setPicks(new Set());
        picksRef.current = new Set();
      } else if (e.code === 'ROUND_NOT_JOINABLE') {
        // Round already started — navigate with empty cartelas (watching)
        sessionStorage.setItem('myCartelaNumbers', JSON.stringify([]));
      } else if (e.code === 'PLAYER_SUSPENDED') {
        setJoinError({ title: 'Account Suspended', message: 'Your account has been suspended. Please contact support.' });
      } else {
        setJoinError({ title: 'Join Failed', message: e.message ?? 'Could not register cartela. Please try again.' });
      }
    } finally {
      setCommitting(false);
    }
  }

  useEffect(() => {
    if (!roundId) return;
    if (!socket.connected) socket.connect();
    socket.emit('JOIN_ROUND', { roundId, token: localStorage.getItem('jwt') ?? '' });

    const onJoined = (p: PlayerJoinedPayload) => {
      setRound(r => r ? { ...r, player_count: p.playerCount } : r);
    };

    const onCartelaTaken = (p: { cartelaNumbers: number[]; playerCount: number }) => {
      setRound(r => r ? { ...r, player_count: p.playerCount } : r);
      setAvailability(prev => {
        if (!prev) return prev;
        const takenSet = new Set([...prev.taken, ...p.cartelaNumbers]);
        return { taken: [...takenSet], available: prev.available.filter(n => !takenSet.has(n)) };
      });
      // Force-deselect any locally picked cartelas that got taken by someone else
      setPicks(prev => {
        const next = new Set(prev);
        let changed = false;
        for (const n of p.cartelaNumbers) {
          if (next.has(n)) { next.delete(n); changed = true; }
        }
        if (changed) picksRef.current = next;
        return changed ? next : prev;
      });
    };

    const onStarted = async (_p: RoundStartedPayload) => {
      if (joinedRef.current) return;
      joinedRef.current = true;
      sessionStorage.setItem('selectedRoundId', roundId!);
      if (picksRef.current.size > 0) {
        await commitPicks(picksRef.current);
      } else {
        sessionStorage.setItem('myCartelaNumbers', JSON.stringify([]));
      }
      navigate(`/rounds/${roundId}/game`, { replace: true });
    };

    const onEnded = () => {
      sessionStorage.removeItem('stakeSelectedForRound');
      navigate('/', { replace: true });
    };

    socket.on('PLAYER_JOINED', onJoined);
    socket.on('CARTELA_TAKEN', onCartelaTaken);
    socket.on('ROUND_STARTED', onStarted);
    socket.on('ROUND_VOID', onEnded as (p: RoundVoidPayload) => void);
    socket.on('ROUND_CANCELLED', onEnded as (p: RoundCancelledPayload) => void);

    // Poll every 2s — catches missed socket events; preserves local picks display
    const poll = setInterval(() => {
      getCartelaAvailability(roundId!).then(fresh => {
        setAvailability(prev => {
          if (!prev) return fresh;
          // Use server's taken list directly — local picks render green via isPicked,
          // so including them in taken has no visual effect (isPicked check wins in render).
          return { taken: fresh.taken, available: fresh.available };
        });
      }).catch(() => {});
    }, 2000);

    return () => {
      socket.off('PLAYER_JOINED', onJoined);
      socket.off('CARTELA_TAKEN', onCartelaTaken);
      socket.off('ROUND_STARTED', onStarted);
      socket.off('ROUND_VOID', onEnded as (p: RoundVoidPayload) => void);
      socket.off('ROUND_CANCELLED', onEnded as (p: RoundCancelledPayload) => void);
      clearInterval(poll);
      socket.emit('LEAVE_ROUND' as any, { roundId });
    };
  }, [roundId, navigate]);

  useEffect(() => { if (msLeft > 0) countdownStartedRef.current = true; }, [msLeft]);

  // Countdown hit 0 — commit picks and navigate
  useEffect(() => {
    if (msLeft !== 0 || !countdownStartedRef.current || joinedRef.current) return;
    const t = setTimeout(async () => {
      if (joinedRef.current) return;
      joinedRef.current = true;
      sessionStorage.setItem('selectedRoundId', roundId ?? '');
      if (picksRef.current.size > 0) {
        await commitPicks(picksRef.current);
      } else {
        sessionStorage.setItem('myCartelaNumbers', JSON.stringify([]));
      }
      navigate(`/rounds/${roundId}/game`, { replace: true });
    }, 3000);
    return () => clearTimeout(t);
  }, [msLeft, roundId, navigate]);

  // Manual "Go to Game" trigger (edge case when countdown already passed)
  useEffect(() => {
    if (!manualTrigger || joinedRef.current || starting) return;
    joinedRef.current = true;
    async function startGame() {
      setStarting(true);
      setError(null);
      try {
        const currentRound = await getRound(roundId!);
        if (currentRound.status === 'void' || currentRound.status === 'cancelled') {
          sessionStorage.removeItem('stakeSelectedForRound');
          navigate('/', { replace: true });
          return;
        }
        sessionStorage.setItem('selectedRoundId', roundId!);
        if (picksRef.current.size > 0 && currentRound.status === 'pending') {
          await commitPicks(picksRef.current);
        } else {
          sessionStorage.setItem('myCartelaNumbers', JSON.stringify([]));
        }
        navigate(`/rounds/${roundId}/game`, { replace: true });
      } catch {
        setStarting(false);
        joinedRef.current = false;
      }
    }
    void startGame();
  }, [manualTrigger, roundId, navigate]);

  function togglePick(num: number) {
    if (picksRef.current.has(num)) {
      const next = new Set(picksRef.current);
      next.delete(num);
      picksRef.current = next;
      setPicks(next);
      return;
    }
    if (picksRef.current.size >= MAX_SELECT) return;
    if (round && balances) {
      const stake = Number(round.stake);
      const total = (picksRef.current.size + 1) * stake;
      const bal = Number(balances.playWallet.balance) + Number(balances.mainWallet.balance);
      if (bal < total) {
        setBalanceAlert(`ቀሪ ሂሳብ አይበቃም!\nNeed ${total} Birr — you have ${bal.toFixed(0)} Birr.\nPlease deposit to continue.`);
        return;
      }
    }
    const next = new Set([...picksRef.current, num]);
    picksRef.current = next;
    setPicks(next);
  }

  const handleCellClick = useCallback((num: number) => togglePick(num), [roundId, round, balances]);

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
  const urgent = msLeft > 0 && msLeft < 10_000;
  const canPick = picks.size < MAX_SELECT;
  const picksArr = [...picks];

  return (
    <div style={{ height: '100dvh', background: 'linear-gradient(180deg, #0a0e1a 0%, #0d1320 100%)', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ background: 'rgba(13,27,46,0.95)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '8px 12px', flexShrink: 0, backdropFilter: 'blur(8px)' }}>
        <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
          {[
            { label: 'Main', value: balances ? Math.floor(Number(balances.mainWallet.balance)) : 0 },
            { label: 'Play', value: balances ? Math.floor(Number(balances.playWallet.balance)) : 0 },
            { label: 'Stake', value: round ? Number(round.stake) : 0 },
          ].map(({ label, value }) => (
            <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '5px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginTop: 1 }}>{value}</div>
            </div>
          ))}
          <div style={{ background: urgent ? 'rgba(239,68,68,0.15)' : 'rgba(245,208,107,0.12)', border: `1px solid ${urgent ? 'rgba(239,68,68,0.5)' : 'rgba(245,208,107,0.35)'}`, borderRadius: 8, padding: '5px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 44 }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: urgent ? '#f87171' : '#f5d06b', fontVariantNumeric: 'tabular-nums' }}>
              {msLeft > 0 ? `${Math.ceil(msLeft / 1000)}s` : '—'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span onClick={() => navigate(-1)} style={{ cursor: 'pointer', fontSize: 18, color: '#475569' }}>←</span>
          <button
            onClick={() => window.location.reload()}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 12px', color: '#94a3b8', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* ── Game countdown ── */}
      <div style={{
        background: urgent ? 'rgba(239,68,68,0.12)' : 'rgba(245,208,107,0.06)',
        borderBottom: `2px solid ${urgent ? '#ef4444' : '#f5d06b'}44`,
        padding: '8px 16px', textAlign: 'center', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <div>
            <div style={{ fontSize: 8, color: '#475569', letterSpacing: 1.5, textTransform: 'uppercase' }}>Starts in</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: urgent ? '#ef4444' : '#f5d06b', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {countdownLabel}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ height: '100%', width: `${pct * 100}%`, background: urgent ? '#ef4444' : '#f5d06b', transition: 'width 0.25s linear', borderRadius: 2 }} />
            </div>
            {committing ? (
              <div style={{ fontSize: 11, color: '#f59e0b' }}>Joining game…</div>
            ) : picks.size > 0 ? (
              <div style={{ fontSize: 11, color: '#34d399' }}>✅ #{picksArr.join(' & ')} selected</div>
            ) : (
              <div style={{ fontSize: 11, color: '#475569' }}>Pick up to {MAX_SELECT} cartelas</div>
            )}
          </div>
        </div>

        {!countdownStartedRef.current && msLeft === 0 && !committing && (
          <button onClick={() => { joinedRef.current = false; setManualTrigger(true); }}
            style={{ marginTop: 6, padding: '6px 20px', background: '#f5d06b', color: '#0a0e1a', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
            Go to Game →
          </button>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', padding: '8px 16px', fontSize: 13, flexShrink: 0, borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* ── Legend ── */}
      <div style={{ padding: '4px 10px', display: 'flex', gap: 10, fontSize: 9, color: '#475569', flexShrink: 0, alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <span><span style={{ display: 'inline-block', width: 7, height: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} />Free</span>
        <span><span style={{ display: 'inline-block', width: 7, height: 7, background: '#22c55e', borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} />Selected</span>
        <span><span style={{ display: 'inline-block', width: 7, height: 7, background: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} />Taken</span>
        {!canPick && <span style={{ color: '#f5d06b', fontWeight: 700, marginLeft: 'auto' }}>Max {MAX_SELECT} selected</span>}
      </div>

      {/* ── Number grid ── */}
      <div style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)',
        gap: 3, padding: '0 8px 16px', alignContent: 'start',
      }}>
        {ALL_NUMBERS.map(num => {
          const isPicked = picks.has(num);
          const taken = takenSet.has(num) && !isPicked;
          const disabled = starting || committing || taken || (!isPicked && picks.size >= MAX_SELECT);
          return (
            <CartelaCell key={num} num={num} taken={taken} isPicked={isPicked} disabled={disabled} onClick={handleCellClick} />
          );
        })}
      </div>

      {/* ── Starting overlay ── */}
      {(starting || committing) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, zIndex: 50 }}>
          <div style={{ fontSize: 48 }}>🎮</div>
          <div style={{ color: '#f59e0b', fontWeight: 900, fontSize: 20 }}>Starting game…</div>
          <div style={{ color: '#64748b', fontSize: 14 }}>
            {picks.size > 0 ? `Joining with cartela ${picksArr.join(' & ')}` : 'Joining as watcher'}
          </div>
        </div>
      )}

      {/* ── Insufficient balance modal ── */}
      {balanceAlert && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 24 }}
          onClick={() => setBalanceAlert(null)}>
          <div style={{ background: '#1a1035', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 16, padding: '28px 24px', maxWidth: 320, width: '100%', textAlign: 'center', boxShadow: '0 0 40px rgba(239,68,68,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💳</div>
            <div style={{ fontWeight: 900, fontSize: 18, color: '#f87171', marginBottom: 8 }}>Insufficient Balance</div>
            {balanceAlert.split('\n').map((line, i) => (
              <div key={i} style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>{line}</div>
            ))}
            <button onClick={() => setBalanceAlert(null)} style={{ marginTop: 20, width: '100%', padding: '12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>OK</button>
          </div>
        </div>
      )}

      {/* ── Join error modal ── */}
      {joinError && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 24 }}
          onClick={() => setJoinError(null)}>
          <div style={{ background: '#1a1035', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 16, padding: '28px 24px', maxWidth: 320, width: '100%', textAlign: 'center', boxShadow: '0 0 40px rgba(239,68,68,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 900, fontSize: 18, color: '#f87171', marginBottom: 8 }}>{joinError.title}</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>{joinError.message}</div>
            <button onClick={() => setJoinError(null)} style={{ marginTop: 20, width: '100%', padding: '12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}
