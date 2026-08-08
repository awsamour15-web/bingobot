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
  reserved: boolean;
  isPicked: boolean;
  disabled: boolean;
  onClick: (num: number) => void;
}
const CartelaCell = memo(function CartelaCell({ num, taken, reserved, isPicked, disabled, onClick }: CartelaCellProps) {
  const bg = isPicked ? '#22c55e' : taken ? '#e53e00' : reserved ? 'rgba(234,179,8,0.25)' : '#1e293b';
  const color = isPicked ? '#fff' : taken ? '#fff' : reserved ? '#fbbf24' : '#94a3b8';
  return (
    <button
      disabled={disabled}
      onClick={() => onClick(num)}
      style={{
        padding: '8px 0', borderRadius: 7,
        border: isPicked ? '2px solid #4ade80' : taken ? 'none' : reserved ? '1px solid rgba(234,179,8,0.5)' : '1px solid rgba(255,255,255,0.06)',
        background: bg, color, fontWeight: isPicked ? 900 : taken ? 700 : reserved ? 600 : 500,
        fontSize: 11, cursor: disabled ? 'default' : 'pointer',
        opacity: 1,
        transform: isPicked ? 'scale(1.06)' : 'scale(1)',
        transition: 'transform 0.1s, background 0.15s',
        WebkitAppearance: 'none', appearance: 'none', outline: 'none',
        lineHeight: 1, boxSizing: 'border-box', userSelect: 'none',
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

  // Track cartelas reserved by OTHER users (optimistic, not yet committed to DB)
  const [reservedByOthers, setReservedByOthers] = useState<Set<number>>(new Set());

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

  // Commit picks to server — only called when game is about to start.
  // Returns true if joined as player, false if navigating as watcher (error/no picks).
  async function commitPicks(currentPicks: Set<number>): Promise<boolean> {
    if (currentPicks.size === 0) return false;
    setCommitting(true);
    setError(null);
    try {
      const result = await joinRoundBatch(roundId!, [...currentPicks]);
      setBalances({ mainWallet: { balance: result.mainWalletBalance }, playWallet: { balance: result.playWalletBalance } });
      // Store confirmed cartela numbers for the game screen (scoped to round)
      sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify(result.cartelaNumbers));
      return true;
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'INSUFFICIENT_BALANCE' || e.message?.includes('ቀሪ ሂሳብ')) {
        setBalanceAlert(e.message ?? 'ቀሪ ሂሳብ አይበቃም!\nPlease deposit to continue.');
      } else if (e.code === 'CARTELA_TAKEN' || e.message?.includes('already taken')) {
        // Cartela was taken by someone else — join as watcher instead
        sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
        setPicks(new Set());
        picksRef.current = new Set();
      } else if (e.code === 'ROUND_NOT_JOINABLE') {
        // Round already started — navigate with empty cartelas (watching)
        sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
      } else if (e.code === 'PLAYER_SUSPENDED') {
        setJoinError({ title: 'Account Suspended', message: 'Your account has been suspended. Please contact support.' });
      } else {
        setJoinError({ title: 'Join Failed', message: e.message ?? 'Could not register cartela. Please try again.' });
      }
      return false;
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
        // Only mark as taken if not in our local picks
        const incoming = p.cartelaNumbers.filter(n => !picksRef.current.has(n));
        if (incoming.length === 0) return prev;
        const takenSet = new Set([...prev.taken, ...incoming]);
        return { taken: [...takenSet], available: prev.available.filter(n => !takenSet.has(n)) };
      });
      // Remove from reservedByOthers since it's now officially taken
      setReservedByOthers(prev => {
        const next = new Set(prev);
        p.cartelaNumbers.forEach(n => next.delete(n));
        return next;
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

    const onCartelaReserved = (p: { cartelaNumbers: number[] }) => {
      setReservedByOthers(prev => {
        const next = new Set(prev);
        p.cartelaNumbers.forEach(n => next.add(n));
        return next;
      });
      // Force-deselect if we had locally picked a cartela someone else just reserved
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

    const onCartelaUnreserved = (p: { cartelaNumbers: number[] }) => {
      setReservedByOthers(prev => {
        const next = new Set(prev);
        p.cartelaNumbers.forEach(n => next.delete(n));
        return next;
      });
    };

    const onStarted = async (_p: RoundStartedPayload) => {
      if (joinedRef.current) return;
      joinedRef.current = true;
      sessionStorage.setItem('selectedRoundId', roundId!);
      if (picksRef.current.size > 0) {
        await commitPicks(picksRef.current);
        // commitPicks always sets myCartelaNumbers (player or watcher) — just navigate
      } else {
        sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
      }
      navigate(`/rounds/${roundId}/game`, { replace: true });
    };

    const onEnded = () => {
      sessionStorage.removeItem('stakeSelectedForRound');
      navigate('/', { replace: true });
    };

    socket.on('PLAYER_JOINED', onJoined);
    socket.on('CARTELA_TAKEN', onCartelaTaken);
    socket.on('CARTELA_RESERVED', onCartelaReserved);
    socket.on('CARTELA_UNRESERVED', onCartelaUnreserved);
    socket.on('ROUND_STARTED', onStarted);
    socket.on('ROUND_VOID', onEnded as (p: RoundVoidPayload) => void);
    socket.on('ROUND_CANCELLED', onEnded as (p: RoundCancelledPayload) => void);

    // Poll every 3s — catches missed socket events; never overwrites local picks
    const poll = setInterval(() => {
      getCartelaAvailability(roundId!).then(fresh => {
        setAvailability(prev => {
          if (!prev) return fresh;
          const localPicks = picksRef.current;
          const takenFromServer = fresh.taken.filter(n => !localPicks.has(n));
          const available = fresh.available.filter(n => !localPicks.has(n));
          return { taken: takenFromServer, available };
        });
      }).catch(() => {});
    }, 3000);

    return () => {
      socket.off('PLAYER_JOINED', onJoined);
      socket.off('CARTELA_TAKEN', onCartelaTaken);
      socket.off('CARTELA_RESERVED', onCartelaReserved);
      socket.off('CARTELA_UNRESERVED', onCartelaUnreserved);
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
        // commitPicks always sets myCartelaNumbers (player or watcher) — just navigate
      } else {
        sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
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
          // commitPicks always sets myCartelaNumbers (player or watcher) — just navigate
        } else {
          sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
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
      // Tell others this cartela is no longer reserved by us
      if (roundId) socket.emit('CARTELA_UNRESERVE' as any, { roundId, cartelaNumbers: [num] });
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
    // Tell others this cartela is now reserved by us
    if (roundId) socket.emit('CARTELA_RESERVE' as any, { roundId, cartelaNumbers: [num] });
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
    <div style={{ height: '100dvh', background: '#0a0e1a', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ background: '#0d1b2e', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '10px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {[
            { label: 'Main Wallet', value: balances ? Math.floor(Number(balances.mainWallet.balance)) : 0 },
            { label: 'Play Wallet', value: balances ? Math.floor(Number(balances.playWallet.balance)) : 0 },
            { label: 'Stake', value: round ? Number(round.stake) : 0 },
          ].map(({ label, value }) => (
            <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9', marginTop: 1 }}>{value}</div>
            </div>
          ))}
          <div style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 48 }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#f5d06b', fontVariantNumeric: 'tabular-nums' }}>
              {msLeft > 0 ? `${Math.ceil(msLeft / 1000)}s` : '—'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span onClick={() => navigate(-1)} style={{ cursor: 'pointer', fontSize: 20, color: '#64748b' }}>← Back</span>
          <button
            onClick={() => window.location.reload()}
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 14px', color: '#e2e8f0', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* ── Game countdown ── */}
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

        {/* Selection status */}
        {committing ? (
          <div style={{ marginTop: 6, fontSize: 12, color: '#f59e0b' }}>Joining game…</div>
        ) : picks.size > 0 ? (
          <div style={{ marginTop: 6, fontSize: 12, color: '#34d399' }}>
            ✅ Cartela {picksArr.join(' & ')} selected — will join when game starts
          </div>
        ) : (
          <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>Select up to {MAX_SELECT} cartelas to join</div>
        )}

        {!countdownStartedRef.current && msLeft === 0 && !committing && (
          <button onClick={() => { joinedRef.current = false; setManualTrigger(true); }}
            style={{ marginTop: 8, padding: '8px 24px', background: '#f59e0b', color: '#0a0e1a', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            Go to Game
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
      <div style={{ padding: '6px 12px', display: 'flex', gap: 12, fontSize: 10, color: '#475569', flexShrink: 0, flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#1e293b', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Available</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#22c55e', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Selected</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#e53e00', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Taken</span>
        {!canPick && <span style={{ color: '#f59e0b', fontWeight: 700 }}>Max {MAX_SELECT} reached</span>}
      </div>

      {/* ── Number grid ── */}
      <div style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)',
        gap: 4, padding: '0 10px 20px', alignContent: 'start',
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
