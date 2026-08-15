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
import { shouldHandleCurrentRoundEvent } from '../lib/round-event-guards';
import type { RoundDetail, CartelaAvailability, PlayerJoinedPayload, RoundStartedPayload, RoundVoidPayload, RoundCancelledPayload } from '../lib/api';

interface ProfileBalances {
  mainWallet: { balance: number };
  playWallet: { balance: number };
}

const TOTAL = 880;
const MAX_SELECT = 2;
const ALL_NUMBERS = Array.from({ length: TOTAL }, (_, i) => i + 1);
const BINGO_COLS = ['B', 'I', 'N', 'G', 'O'];
const COL_COLORS = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f87171'];

interface CartelaCellProps {
  num: number;
  taken: boolean;
  reserved: boolean;
  isPicked: boolean;
  disabled: boolean;
  onClick: (num: number) => void;
}
const CartelaCell = memo(function CartelaCell({ num, taken, reserved, isPicked, disabled, onClick }: CartelaCellProps) {
  const bg = isPicked
    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
    : taken
      ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
      : reserved
        ? 'linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(217,119,6,0.15) 100%)'
        : 'linear-gradient(180deg, rgba(30,41,59,0.9) 0%, rgba(15,23,42,0.95) 100%)';
  const color = isPicked ? '#ecfdf5' : taken ? '#fef2f2' : reserved ? '#d97706' : '#cbd5e1';
  const border = isPicked
    ? '2px solid #6ee7b7'
    : taken
      ? '1px solid rgba(239,68,68,0.5)'
      : reserved
        ? '1.5px solid rgba(245,158,11,0.4)'
        : '1px solid rgba(148,163,184,0.15)';

  const shadow = isPicked 
    ? '0 0 20px rgba(16,185,129,0.4), inset 0 1px 2px rgba(255,255,255,0.1)' 
    : reserved 
      ? '0 0 12px rgba(245,158,11,0.2)' 
      : taken
        ? '0 0 12px rgba(239,68,68,0.15)'
        : '0 2px 8px rgba(0,0,0,0.2)';

  // CRITICAL FIX: Prevent clicks on taken cartelas
  const handleClick = () => {
    if (taken || disabled) return; // Block clicks on taken/disabled cartelas
    onClick(num);
  };

  return (
    <button
      disabled={disabled || taken}
      onClick={handleClick}
      style={{
        padding: '8px 0', borderRadius: 12, border, background: bg, color,
        fontWeight: isPicked || taken ? 800 : 700, fontSize: 16,
        cursor: disabled || taken ? 'not-allowed' : 'pointer',
        opacity: disabled && !taken ? 0.5 : 1,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: isPicked ? 'translateY(-2px) scale(1.08)' : taken ? 'scale(0.98)' : 'translateY(0) scale(1)',
        WebkitAppearance: 'none', appearance: 'none', outline: 'none',
        lineHeight: 1, boxSizing: 'border-box', userSelect: 'none', minHeight: '48px',
        boxShadow: shadow,
        position: 'relative',
        overflow: 'hidden',
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
    // Update every 100ms for smoother countdown animation
    const id = setInterval(tick, 100);
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

  // Local picks — restore from sessionStorage on mount, persist on change
  const [picks, setPicks] = useState<Set<number>>(() => {
    if (!roundId) return new Set();
    try {
      const saved = sessionStorage.getItem(`selectedCartelas:${roundId}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const picksRef = useRef<Set<number>>(new Set());
  useEffect(() => { picksRef.current = picks; }, [picks]);

  // Persist picks to sessionStorage whenever they change
  useEffect(() => {
    if (!roundId) return;
    sessionStorage.setItem(`selectedCartelas:${roundId}`, JSON.stringify([...picks]));
  }, [picks, roundId]);

  // Cartelas being released — keep them out of taken until release API confirms
  const pendingReleaseRef = useRef<Set<number>>(new Set());
  // Cartelas recently released may still be reported as taken by stale server responses
  // for a short time; allow immediate re-selection until the server catches up.
  const recentlyReleasedRef = useRef<Set<number>>(new Set());

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
      // Clear the temporary picks storage after successful commit
      sessionStorage.removeItem(`selectedCartelas:${roundId}`);
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
      
      // INSTANT UPDATE: Also update availability to show cartela as available immediately
      setAvailability(prev => {
        if (!prev) return prev;
        // Move from reserved/taken back to available
        const unreservedSet = new Set(p.cartelaNumbers);
        const newTaken = prev.taken.filter(n => !unreservedSet.has(n));
        const newAvailable = [...new Set([...prev.available, ...p.cartelaNumbers])].sort((a, b) => a - b);
        return {
          taken: newTaken,
          available: newAvailable
        };
      });
    };

    const onStarted = async (_p: RoundStartedPayload) => {
      if (_p.roundId && !shouldHandleCurrentRoundEvent(roundId, _p.roundId)) return;
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

    const onEnded = (p?: RoundVoidPayload | RoundCancelledPayload) => {
      if (p && !shouldHandleCurrentRoundEvent(roundId, p.roundId)) return;
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

    // Poll every 500ms for faster updates — catches missed socket events
    const poll = setInterval(() => {
      // Also fetch round status to catch missed ROUND_STARTED socket events
      Promise.all([
        getCartelaAvailability(roundId!),
        getRound(roundId!),
      ]).then(([fresh, latestRound]) => {
        // If round went active and we haven't joined yet, trigger join flow
        if (latestRound.status === 'active' && !joinedRef.current) {
          joinedRef.current = true;
          clearInterval(poll);
          sessionStorage.setItem('selectedRoundId', roundId!);
          if (picksRef.current.size > 0) {
            commitPicks(picksRef.current).then(() => {
              navigate(`/rounds/${roundId}/game`, { replace: true });
            });
          } else {
            sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
            navigate(`/rounds/${roundId}/game`, { replace: true });
          }
          return;
        }
        // Round ended (void/cancelled) — go home
        if (latestRound.status === 'void' || latestRound.status === 'cancelled') {
          clearInterval(poll);
          sessionStorage.removeItem('stakeSelectedForRound');
          navigate('/', { replace: true });
          return;
        }
        setAvailability(prev => {
          if (!prev) return fresh;
          const localPicks = picksRef.current;
          const pendingRelease = pendingReleaseRef.current;
          const recentlyReleased = recentlyReleasedRef.current;
          // Exclude local picks, cartelas being released, and just-released cartelas from the
          // server-taken set. These can be stale for a few hundred ms after unselect and must
          // not block the user from re-selecting the same cartela immediately.
          const merged = new Set([...prev.taken, ...fresh.taken]);
          const takenFromServer = [...merged].filter(n => !localPicks.has(n) && !pendingRelease.has(n) && !recentlyReleased.has(n));
          const available = [...new Set([...fresh.available, ...Array.from(recentlyReleased)])].filter(n => !localPicks.has(n) && !takenFromServer.includes(n));
          return { taken: takenFromServer, available };
        });
      }).catch(() => {});
    }, 500);

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
      // Clear selected cartelas when leaving the round
      if (roundId) sessionStorage.removeItem(`selectedCartelas:${roundId}`);
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
    (async () => {
      if (joinedRef.current) return;
      joinedRef.current = true;
      sessionStorage.setItem('selectedRoundId', roundId ?? '');
      if (picksRef.current.size > 0) {
        await commitPicks(picksRef.current);
      } else {
        sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
      }
      navigate(`/rounds/${roundId}/game`, { replace: true });
    })();
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
    const wasRecentlyReleased = recentlyReleasedRef.current.has(num);

    // CRITICAL FIX: Block taken cartelas at the handler level unless it was just released
    // by this user and the server is still reporting stale taken state.
    if (availability && availability.taken.includes(num) && !wasRecentlyReleased) {
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

      // INSTANT FEEDBACK: Emit WebSocket event IMMEDIATELY for other players
      if (roundId && socket.connected) {
        socket.emit('CARTELA_UNRESERVE', { roundId, cartelaNumbers: [num] });
      }

      // Update availability immediately - move cartela from taken to available
      setAvailability(prev => {
        if (!prev) return prev;
        return {
          taken: prev.taken.filter(n => n !== num),
          available: [...prev.available, num].sort((a, b) => a - b)
        };
      });

      // Mark as recently released so stale server responses do not re-block the same cartela
      // while the release request is in flight.
      recentlyReleasedRef.current.add(num);
      if (roundId) {
        pendingReleaseRef.current.add(num);
        releaseCartela(roundId, num)
          .catch(err => console.warn('Failed to release cartela reservation:', err))
          .finally(() => {
            pendingReleaseRef.current.delete(num);
            window.setTimeout(() => {
              recentlyReleasedRef.current.delete(num);
            }, 1500);
          });
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

    // CRITICAL FIX: Double-check server-side availability before allowing selection,
    // but never reject the cartela immediately after a user just released it.
    if (!availability?.available.includes(num) && !wasRecentlyReleased) {
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
      // INSTANT FEEDBACK: Emit WebSocket reservation IMMEDIATELY before API call
      if (socket.connected) {
        socket.emit('CARTELA_RESERVE', { roundId, cartelaNumbers: [num] });
      }
      
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
          // Reservation failed - undo WebSocket broadcast
          if (socket.connected) {
            socket.emit('CARTELA_UNRESERVE', { roundId, cartelaNumbers: [num] });
          }
          
          // Show error and refresh availability
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
    <div style={{ height: '100dvh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0a0e1a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 56, height: 56, background: 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(5,150,105,0.15) 100%)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, animation: 'spin 1.5s linear infinite', border: '2px solid rgba(16,185,129,0.3)', boxShadow: '0 0 20px rgba(16,185,129,0.2)' }}>🎲</div>
      <div style={{ color: '#cbd5e1', fontSize: 15, fontWeight: 600 }}>Loading cartelas…</div>
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
  if (!round || !availability) return (
    <div style={{ height: '100dvh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0a0e1a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', padding: 24, textAlign: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 56 }}>🚫</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{error ? 'Failed to Load' : 'Round Not Found'}</div>
      <div style={{ fontSize: 13, color: '#94a3b8' }}>{error || 'Could not load round data'}</div>
    </div>
  );

  const takenSet = new Set(availability.taken);
  const urgent = msLeft > 0 && msLeft < 10_000;
  const canPick = picks.size < MAX_SELECT;
  const picksArr = [...picks].sort((a, b) => a - b);
  // How much vertical space the bingo preview needs
  const previewCount = picksArr.length;

  return (
    <div style={{ height: '100dvh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0a0e1a 100%)', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Professional Header ── */}
      <div style={{ background: 'linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(20,33,47,0.95) 100%)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(148,163,184,0.1)', padding: '10px 14px', flexShrink: 0, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
        {/* Header Top - Title & Timer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate(-1)} style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(99,102,241,0.1) 100%)', border: '1px solid rgba(59,130,246,0.25)', color: '#60a5fa', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, transition: 'all 0.3s', fontWeight: 700 }}>
              ←
            </button>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9' }}>Select Cartelas</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Up to 2 cartelas</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ background: msLeft > 0 && msLeft < 10_000 ? 'linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(220,38,38,0.15) 100%)' : 'linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(217,119,6,0.15) 100%)', border: '1px solid ' + (msLeft > 0 && msLeft < 10_000 ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.3)'), borderRadius: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(8px)' }}>
              <span style={{ fontSize: 14 }}>⏱️</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: msLeft > 0 && msLeft < 10_000 ? '#fca5a5' : '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>
                {msLeft > 0 ? `${Math.ceil(msLeft / 1000)}s` : round?.status === 'active' ? '●' : '⏳'}
              </span>
            </div>
            <button onClick={() => window.location.reload()} style={{ background: 'linear-gradient(135deg, rgba(100,116,139,0.15) 0%, rgba(71,85,105,0.1) 100%)', border: '1px solid rgba(148,163,184,0.25)', color: '#cbd5e1', padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.3s' }}>
              ↻
            </button>
          </div>
        </div>

        {/* Header Bottom - Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
          {[
            { label: '💰 Main', value: balances ? Math.floor(Number(balances.mainWallet.balance)) : 0, color: '#3b82f6' },
            { label: '🎮 Play', value: balances ? Math.floor(Number(balances.playWallet.balance)) : 0, color: '#10b981' },
            { label: '🎯 Stake', value: round ? Number(round.stake) : 0, color: '#f59e0b' },
            { label: '👥 Players', value: round?.player_count ?? 0, color: '#8b5cf6' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: `linear-gradient(135deg, ${color}15 0%, ${color}08 100%)`, border: `1px solid ${color}30`, borderRadius: 10, padding: '8px', textAlign: 'center', backdropFilter: 'blur(8px)' }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#f1f5f9' }}>{value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div style={{ background: 'linear-gradient(90deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.08) 100%)', borderBottom: '1.5px solid rgba(239,68,68,0.25)', color: '#fca5a5', padding: '8px 14px', fontSize: 12, flexShrink: 0, display: 'flex', gap: 10, alignItems: 'center', fontWeight: 500 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* ── Legend/Info Bar ── */}
      <div style={{ padding: '8px 14px', background: 'linear-gradient(180deg, rgba(30,41,59,0.08) 0%, rgba(15,23,42,0.04) 100%)', borderBottom: '1px solid rgba(148,163,184,0.08)', display: 'flex', gap: 16, fontSize: 11, color: '#94a3b8', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 14, height: 14, background: 'linear-gradient(135deg, rgba(30,41,59,0.8) 0%, rgba(20,29,39,0.9) 100%)', border: '1.5px solid rgba(148,163,184,0.25)', borderRadius: 4, display: 'inline-block' }} />
          <span style={{ fontWeight: 600 }}>Available</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 14, height: 14, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderRadius: 4, display: 'inline-block', boxShadow: '0 0 10px rgba(16,185,129,0.5)' }} />
          <span style={{ fontWeight: 600 }}>Selected</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 14, height: 14, background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', borderRadius: 4, display: 'inline-block', boxShadow: '0 0 10px rgba(239,68,68,0.5)' }} />
          <span style={{ fontWeight: 600 }}>Taken</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 14, height: 14, background: 'rgba(245,158,11,0.3)', border: '1.5px solid rgba(245,158,11,0.6)', borderRadius: 4, display: 'inline-block' }} />
          <span style={{ fontWeight: 600 }}>Reserved</span>
        </span>
        {!canPick && <div style={{ marginLeft: 'auto', fontWeight: 800, color: '#10b981', fontSize: 12 }}>✓ {MAX_SELECT} cartelas selected</div>}
      </div>

      {/* ── Number grid (scrollable) ── */}
      <div style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
        gap: 12, padding: '24px 20px', alignContent: 'start',
        background: 'linear-gradient(180deg, rgba(15,23,42,0.7) 0%, rgba(10,14,26,0.8) 100%)',
        borderTop: '1px solid rgba(148,163,184,0.08)',
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
          flexShrink: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(10,14,26,0.9) 100%)',
          borderTop: '1.5px solid rgba(148,163,184,0.1)',
          padding: '10px 10px', gap: 8,
          display: 'grid',
          gridTemplateColumns: picksArr.length === 2 ? '1fr 1fr' : '1fr',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
          maxHeight: '24%',
          overflowY: 'auto',
        }}>
          {picksArr.map(cartelaNum => {
            const grid = pickedGrids.get(cartelaNum);
            return (
              <div key={cartelaNum} style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(5,150,105,0.04) 100%)', border: '1.5px solid rgba(16,185,129,0.25)', borderRadius: 10, padding: '8px 6px 6px', boxShadow: '0 8px 16px rgba(16,185,129,0.12)', backdropFilter: 'blur(8px)' }}>
                <div style={{ textAlign: 'center', fontSize: 13, color: '#10b981', fontWeight: 900, marginBottom: 5 }}>
                  Card #{cartelaNum}
                </div>
                {/* BINGO header row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, marginBottom: 2 }}>
                  {BINGO_COLS.map((col, ci) => (
                    <div key={col} style={{
                      background: `linear-gradient(180deg, ${COL_COLORS[ci]} 0%, rgba(15,23,42,0.9) 100%)`, color: '#fff', fontWeight: 800,
                      fontSize: 7, textAlign: 'center', borderRadius: 3, padding: '2px 0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 2px 6px ${COL_COLORS[ci]}40`
                    }}>{col}</div>
                  ))}
                </div>
                {/* 5×5 grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2 }}>
                  {grid ? grid.map((val, idx) => {
                    const isFree = idx === 12;
                    return (
                      <div key={idx} style={{
                        background: isFree ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, rgba(30,41,59,0.9) 0%, rgba(20,29,39,0.95) 100%)',
                        color: isFree ? '#ecfdf5' : '#cbd5e1',
                        fontWeight: 600, fontSize: 7,
                        textAlign: 'center', borderRadius: 3,
                        border: isFree ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(148,163,184,0.15)',
                        minHeight: '18px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: isFree ? '0 0 12px rgba(16,185,129,0.25)' : 'none'
                      }}>
                        {isFree ? '★' : val}
                      </div>
                    );
                  }) : Array.from({ length: 25 }, (_, i) => (
                    <div key={i} style={{
                      background: 'linear-gradient(135deg, rgba(30,41,59,0.9) 0%, rgba(20,29,39,0.95) 100%)', borderRadius: 3,
                      border: '1px solid rgba(148,163,184,0.15)', minHeight: '18px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, color: '#475569',
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
        <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(135deg, rgba(10,14,26,0.98) 0%, rgba(10,14,26,0.95) 100%)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 18, zIndex: 50 }}>
          <div style={{ width: 72, height: 72, background: 'linear-gradient(135deg, rgba(16,185,129,0.25) 0%, rgba(59,130,246,0.15) 100%)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, animation: 'pulse 2s ease-in-out infinite', border: '2px solid rgba(16,185,129,0.4)', boxShadow: '0 0 24px rgba(16,185,129,0.2)' }}>🎮</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#10b981', fontWeight: 900, fontSize: 20, marginBottom: 10 }}>Starting Game…</div>
            <div style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>
              {picks.size > 0 ? `Joining with cartela ${picksArr.join(' & ')}` : 'Joining as watcher'}
            </div>
          </div>
          <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.15); opacity: 0.85; } }`}</style>
        </div>
      )}

      {/* ── Alert modal (balance/availability errors) ── */}
      {balanceAlert && (() => {
        const isBalanceError = balanceAlert.includes('ቀሪ ሂሳብ') || balanceAlert.toLowerCase().includes('insufficient');
        const isAvailabilityError = balanceAlert.includes('not available') || balanceAlert.includes('taken');
        
        const icon = isBalanceError ? '💳' : isAvailabilityError ? '🎫' : '⚠️';
        const title = isBalanceError ? 'Insufficient Balance' : isAvailabilityError ? 'Cartela Unavailable' : 'Alert';
        const bgColor = isBalanceError ? 'rgba(249,115,22,0.15)' : isAvailabilityError ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)';
        const borderColor = isBalanceError ? 'rgba(249,115,22,0.3)' : isAvailabilityError ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)';
        const titleColor = isBalanceError ? '#fb923c' : isAvailabilityError ? '#fbbf24' : '#f87171';
        
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 20 }}
            onClick={() => setBalanceAlert(null)}>
            <div style={{ background: bgColor, border: `1.5px solid ${borderColor}`, borderRadius: 16, padding: '28px 24px', maxWidth: 360, width: '100%', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 48, marginBottom: 14 }}>{icon}</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: titleColor, marginBottom: 10 }}>{title}</div>
              {balanceAlert.split('\n').map((line, i) => (
                <div key={i} style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 4 }}>{line}</div>
              ))}
              <button onClick={() => setBalanceAlert(null)} style={{ marginTop: 20, width: '100%', padding: '12px', background: titleColor, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s' }}>
                Got it
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Join error modal ── */}
      {joinError && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 20 }}
          onClick={() => setJoinError(null)}>
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1.5px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: '28px 24px', maxWidth: 360, width: '100%', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#f87171', marginBottom: 10 }}>{joinError.title}</div>
            <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 4 }}>{joinError.message}</div>
            <button onClick={() => setJoinError(null)} style={{ marginTop: 20, width: '100%', padding: '12px', background: '#f87171', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
