import { useEffect, useState, useRef, memo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getRound, getCartelaAvailability, joinRoundBatch, getProfile, getCartelaGridCached, reserveCartela, releaseCartela } from '../lib/api';
import cartelaGrids from '../lib/cartela-grids.json';

// Instant local grid lookup — no network needed
function getLocalGrid(num: number): number[] | null {
  const rows = (cartelaGrids as Record<string, number[]>)[String(num)];
  return rows ?? null;
}
import { initAuth } from '../lib/auth';
import { socket } from '../lib/socket';
import type { RoundDetail, CartelaAvailability, PlayerJoinedPayload, RoundStartedPayload, RoundVoidPayload, RoundCancelledPayload } from '../lib/api';

interface ProfileBalances {
  mainWallet: { balance: number };
  playWallet: { balance: number };
}

const TOTAL = 880;
const MAX_SELECT = 2;
const ALL_NUMBERS = Array.from({ length: TOTAL }, (_, i) => i + 1);
const BINGO_COLS = ['B', 'I', 'N', 'G', 'O'];
const COL_COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444'];

interface CartelaCellProps {
  num: number;
  taken: boolean;
  reserved: boolean;
  isPicked: boolean;
  disabled: boolean;
  onClick: (num: number) => void;
}
const CartelaCell = memo(function CartelaCell({ num, taken, reserved, isPicked, disabled, onClick }: CartelaCellProps) {
  const bg = isPicked ? '#22c55e' : taken ? '#e53e3e' : reserved ? 'rgba(234,179,8,0.18)' : '#1e293b';
  const color = isPicked ? '#fff' : taken ? '#fff' : reserved ? '#fbbf24' : '#94a3b8';
  const border = isPicked ? '2px solid #4ade80' : taken ? 'none' : reserved ? '1px solid rgba(234,179,8,0.5)' : '1px solid rgba(255,255,255,0.08)';
  
  // CRITICAL FIX: Prevent clicks on taken cartelas
  const handleClick = () => {
    if (taken) return; // Block clicks on taken cartelas
    onClick(num);
  };
  
  return (
    <button
      disabled={disabled}
      onClick={handleClick}
      style={{
        padding: '4px 0', borderRadius: 4, border, background: bg, color,
        fontWeight: isPicked || taken ? 800 : 500, fontSize: 13,
        cursor: disabled && !taken ? 'default' : taken ? 'not-allowed' : 'pointer',
        opacity: 1,
        transition: 'background 0.1s',
        WebkitAppearance: 'none', appearance: 'none', outline: 'none',
        lineHeight: 1, boxSizing: 'border-box', userSelect: 'none',
      }}
    >
      {num}
    </button>
  );
});

function useServerCountdown(targetIso: string | null) {
  const [msLeft, setMsLeft] = useState(() =>
    targetIso ? Math.max(0, new Date(targetIso).getTime() - Date.now()) : 0
  );
  const totalMsRef = useRef<number>(0);

  useEffect(() => {
    if (!targetIso) return;
    const target = new Date(targetIso).getTime();
    // Record total duration once so pct stays meaningful
    totalMsRef.current = Math.max(1, target - (Date.now() - 100));
    const tick = () => setMsLeft(Math.max(0, target - Date.now()));
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
    pct: totalMsRef.current > 0 ? Math.min(1, msLeft / totalMsRef.current) : 0,
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

  // Cartelas being released — keep them out of taken until release API confirms
  const pendingReleaseRef = useRef<Set<number>>(new Set());

  // Track cartelas reserved by OTHER users (optimistic, not yet committed to DB)
  const [reservedByOthers, setReservedByOthers] = useState<Set<number>>(new Set());

  const [balanceAlert, setBalanceAlert] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<{ title: string; message: string } | null>(null);
  const [committing, setCommitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const joinedRef = useRef(false);
  const countdownStartedRef = useRef(false);
  const [manualTrigger, setManualTrigger] = useState(false);

  // Grids for picked cartelas — fetched on pick
  const [pickedGrids, setPickedGrids] = useState<Map<number, number[]>>(new Map());

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
        // If round is already active/completed, mark countdown as started so
        // the navigate effect can fire immediately
        if (r.status === 'active' || r.status === 'completed') {
          countdownStartedRef.current = true;
        }
        // If start_time is already past, treat countdown as having started
        if (r.start_time && new Date(r.start_time).getTime() <= Date.now()) {
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
    (socket as any).on('CARTELA_RESERVED', onCartelaReserved);
    (socket as any).on('CARTELA_UNRESERVED', onCartelaUnreserved);
    socket.on('ROUND_STARTED', onStarted);
    socket.on('ROUND_VOID', onEnded as (p: RoundVoidPayload) => void);
    socket.on('ROUND_CANCELLED', onEnded as (p: RoundCancelledPayload) => void);

    // Poll every 1s — catches missed socket events; never overwrites local picks
    const poll = setInterval(() => {
      getCartelaAvailability(roundId!).then(fresh => {
        setAvailability(prev => {
          if (!prev) return fresh;
          const localPicks = picksRef.current;
          const pendingRelease = pendingReleaseRef.current;
          // Exclude local picks AND cartelas being released from the taken set.
          // Union prev.taken with server taken so socket-added entries aren't lost
          // if the server response is slightly behind.
          const merged = new Set([...prev.taken, ...fresh.taken]);
          const takenFromServer = [...merged].filter(n => !localPicks.has(n) && !pendingRelease.has(n));
          const available = fresh.available.filter(n => !localPicks.has(n) && !merged.has(n));
          return { taken: takenFromServer, available };
        });
      }).catch(() => {});
    }, 1000); // Increased polling frequency from 3s to 1s

    return () => {
      socket.off('PLAYER_JOINED', onJoined);
      socket.off('CARTELA_TAKEN', onCartelaTaken);
      (socket as any).off('CARTELA_RESERVED', onCartelaReserved);
      (socket as any).off('CARTELA_UNRESERVED', onCartelaUnreserved);
      socket.off('ROUND_STARTED', onStarted);
      socket.off('ROUND_VOID', onEnded as (p: RoundVoidPayload) => void);
      socket.off('ROUND_CANCELLED', onEnded as (p: RoundCancelledPayload) => void);
      clearInterval(poll);
      socket.emit('LEAVE_ROUND' as any, { roundId });
    };
  }, [roundId, navigate]);

  useEffect(() => { if (msLeft > 0) countdownStartedRef.current = true; }, [msLeft]);

  // If round is already active when we arrive (msLeft starts at 0 and never ticks down),
  // navigate to the game immediately after load completes.
  useEffect(() => {
    if (loading || !round || joinedRef.current) return;
    if (round.status !== 'active') return;
    if (joinedRef.current) return;
    joinedRef.current = true;
    sessionStorage.setItem('selectedRoundId', roundId ?? '');
    sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
    navigate(`/rounds/${roundId}/game`, { replace: true });
  }, [loading, round, roundId, navigate]);

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
    // CRITICAL FIX: Block taken cartelas at the handler level
    if (availability && availability.taken.includes(num)) {
      // Provide user feedback
      setBalanceAlert(`Cartela ${num} is already taken by another player.`);
      return; // Cartela is taken - do nothing
    }
    
    if (picksRef.current.has(num)) {
      const next = new Set(picksRef.current);
      next.delete(num);
      picksRef.current = next;
      setPicks(next);
      setPickedGrids(prev => { const m = new Map(prev); m.delete(num); return m; });
      
      // Update availability immediately - move cartela from taken to available
      setAvailability(prev => {
        if (!prev) return prev;
        return {
          taken: prev.taken.filter(n => n !== num),
          available: [...prev.available, num].sort((a, b) => a - b)
        };
      });
      
      // Release reservation via API — guard poll from marking it taken during flight
      if (roundId) {
        pendingReleaseRef.current.add(num);
        releaseCartela(roundId, num)
          .catch(err => console.warn('Failed to release cartela reservation:', err))
          .finally(() => pendingReleaseRef.current.delete(num));
      }
      return;
    }
    if (picksRef.current.size >= MAX_SELECT) return;
    
    // Check balance
    if (round && balances) {
      const stake = Number(round.stake);
      const total = (picksRef.current.size + 1) * stake;
      const bal = Number(balances.playWallet.balance) + Number(balances.mainWallet.balance);
      if (bal < total) {
        setBalanceAlert(`ቀሪ ሂሳብ አይበቃም!\nNeed ${total} Birr — you have ${bal.toFixed(0)} Birr.\nPlease deposit to continue.`);
        return;
      }
    }
    
    // CRITICAL FIX: Double-check server-side availability before allowing selection
    if (!availability?.available.includes(num)) {
      // Cartela is not available - refresh and show message
      setBalanceAlert(`Cartela ${num} is not available. Refreshing...`);
      if (roundId) {
        getCartelaAvailability(roundId).then(fresh => {
          setAvailability(fresh);
        }).catch(() => {});
      }
      return;
    }
    
    // Reserve cartela via API first, then update UI if successful
    if (roundId) {
      reserveCartela(roundId, num)
        .then(() => {
          // Only update UI if reservation was successful
          const next = new Set([...picksRef.current, num]);
          picksRef.current = next;
          setPicks(next);
          
          // Update availability - move cartela from available to taken
          setAvailability(prev => {
            if (!prev) return prev;
            return {
              taken: [...prev.taken, num],
              available: prev.available.filter(n => n !== num)
            };
          });
          
          // Show grid instantly from local lookup, then confirm/update from server cache
          const localGrid = getLocalGrid(num);
          if (localGrid) setPickedGrids(prev => new Map(prev).set(num, localGrid));
          getCartelaGridCached(roundId, num)
            .then(res => setPickedGrids(prev => new Map(prev).set(num, res.grid)))
            .catch(() => {});
        })
        .catch(err => {
          // Reservation failed - show error and refresh availability
          const errorMsg = err.message || 'Failed to reserve cartela';
          if (errorMsg.includes('reserved') || errorMsg.includes('taken')) {
            setBalanceAlert(`Cartela ${num} was just taken by another player. Refreshing...`);
          } else if (err.code === 'MAX_CARTELA_LIMIT_EXCEEDED') {
            setBalanceAlert(`You can only select up to 2 cartelas per round.`);
          } else {
            setBalanceAlert(`Failed to select cartela ${num}: ${errorMsg}`);
          }
          
          // Refresh availability to get current state
          getCartelaAvailability(roundId).then(fresh => {
            setAvailability(fresh);
          }).catch(() => {});
        });
    } else {
      // Fallback for when roundId is not available yet
      const next = new Set([...picksRef.current, num]);
      picksRef.current = next;
      setPicks(next);
      
      const localGrid = getLocalGrid(num);
      if (localGrid) setPickedGrids(prev => new Map(prev).set(num, localGrid));
    }
  }

  const handleCellClick = useCallback((num: number) => togglePick(num), [roundId, round, balances, availability]);

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
  const picksArr = [...picks].sort((a, b) => a - b);
  // How much vertical space the bingo preview needs
  const previewCount = picksArr.length;

  return (
    <div style={{ height: '100dvh', background: '#0a0e1a', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ background: '#0d1b2e', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '6px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
          {[
            { label: 'Main', value: balances ? Math.floor(Number(balances.mainWallet.balance)) : 0 },
            { label: 'Play', value: balances ? Math.floor(Number(balances.playWallet.balance)) : 0 },
            { label: 'Stake', value: round ? Number(round.stake) : 0 },
          ].map(({ label, value }) => (
            <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '4px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#f1f5f9', marginTop: 1 }}>{value}</div>
            </div>
          ))}
          <div style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 6, padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 42 }}>
            <span style={{ fontSize: 15, fontWeight: 900, color: '#f5d06b', fontVariantNumeric: 'tabular-nums' }}>
              {msLeft > 0 ? `${Math.ceil(msLeft / 1000)}s` : round?.status === 'active' ? '▶' : '⏳'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span onClick={() => navigate(-1)} style={{ cursor: 'pointer', fontSize: 16, color: '#64748b' }}>← Back</span>
          <button
            onClick={() => window.location.reload()}
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 10px', color: '#e2e8f0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            ↺ Refresh
          </button>
        </div>
      </div>



      {/* ── Error ── */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', padding: '8px 16px', fontSize: 13, flexShrink: 0, borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* ── Legend ── */}
      <div style={{ padding: '4px 12px', display: 'flex', gap: 14, fontSize: 10, color: '#64748b', flexShrink: 0, alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2, display: 'inline-block' }} />
          Available
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, background: '#22c55e', borderRadius: 2, display: 'inline-block' }} />
          Selected
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, background: '#e53e3e', borderRadius: 2, display: 'inline-block' }} />
          Taken
        </span>
        {!canPick && <span style={{ color: '#f59e0b', fontWeight: 700, marginLeft: 'auto' }}>Max {MAX_SELECT} selected</span>}
      </div>

      {/* ── Number grid (scrollable) ── */}
      <div style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)',
        gap: 2, padding: '3px 6px', alignContent: 'start',
      }}>
        {ALL_NUMBERS.map(num => {
          const isPicked = picks.has(num);
          const taken = takenSet.has(num) && !isPicked;
          const reserved = reservedByOthers.has(num) && !isPicked && !taken;
          const disabled = starting || committing || taken || (!isPicked && picks.size >= MAX_SELECT);
          return (
            <CartelaCell key={num} num={num} taken={taken} reserved={reserved} isPicked={isPicked} disabled={disabled} onClick={handleCellClick} />
          );
        })}
      </div>

      {/* ── Selected cartela BINGO preview ── */}
      {previewCount > 0 && (
        <div style={{
          flexShrink: 0, background: '#0d1220',
          borderTop: '2px solid rgba(255,255,255,0.08)',
          padding: '6px 6px 8px',
          display: 'grid',
          gridTemplateColumns: picksArr.length === 2 ? '1fr 1fr' : '1fr',
          gap: 6,
        }}>
          {picksArr.map(cartelaNum => {
            const grid = pickedGrids.get(cartelaNum);
            return (
              <div key={cartelaNum} style={{ minWidth: 0 }}>
                <div style={{ textAlign: 'center', fontSize: 12, color: '#f59e0b', fontWeight: 900, marginBottom: 4 }}>
                  Cartela No : {cartelaNum}
                </div>
                {/* BINGO header row with better visibility */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, marginBottom: 3 }}>
                  {BINGO_COLS.map((col, ci) => (
                    <div key={col} style={{
                      background: COL_COLORS[ci], color: '#fff', fontWeight: 900,
                      fontSize: 12, textAlign: 'center', borderRadius: 4, padding: '3px 0',
                      minHeight: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{col}</div>
                  ))}
                </div>
                {/* 5×5 grid with improved readability */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2 }}>
                  {grid ? grid.map((val, idx) => {
                    const isFree = idx === 12;
                    return (
                      <div key={idx} style={{
                        background: isFree ? '#22c55e' : '#1e293b',
                        color: isFree ? '#fff' : '#e2e8f0',
                        fontWeight: 900,
                        fontSize: 12,
                        textAlign: 'center', borderRadius: 4,
                        padding: '4px 0', border: '1px solid rgba(255,255,255,0.07)',
                        minWidth: 0, minHeight: '24px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isFree ? '★' : val}
                      </div>
                    );
                  }) : Array.from({ length: 25 }, (_, i) => (
                    <div key={i} style={{
                      background: '#1e293b', borderRadius: 4, padding: '4px 0',
                      border: '1px solid rgba(255,255,255,0.07)', minWidth: 0, minHeight: '24px',
                      fontSize: 12, textAlign: 'center', color: '#334155',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>·</div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

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

      {/* ── Alert modal (balance/availability errors) ── */}
      {balanceAlert && (() => {
        const isBalanceError = balanceAlert.includes('ቀሪ ሂሳብ') || balanceAlert.toLowerCase().includes('insufficient');
        const isAvailabilityError = balanceAlert.includes('not available') || balanceAlert.includes('taken');
        
        const icon = isBalanceError ? '💳' : isAvailabilityError ? '🎫' : '⚠️';
        const title = isBalanceError ? 'Insufficient Balance' : isAvailabilityError ? 'Cartela Unavailable' : 'Alert';
        
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 24 }}
            onClick={() => setBalanceAlert(null)}>
            <div style={{ background: '#1a1035', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 16, padding: '28px 24px', maxWidth: 320, width: '100%', textAlign: 'center', boxShadow: '0 0 40px rgba(239,68,68,0.2)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
              <div style={{ fontWeight: 900, fontSize: 18, color: '#f87171', marginBottom: 8 }}>{title}</div>
              {balanceAlert.split('\n').map((line, i) => (
                <div key={i} style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>{line}</div>
              ))}
              <button onClick={() => setBalanceAlert(null)} style={{ marginTop: 20, width: '100%', padding: '12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>OK</button>
            </div>
          </div>
        );
      })()}

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
