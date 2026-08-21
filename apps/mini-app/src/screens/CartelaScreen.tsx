import { useEffect, useState, useRef, memo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getRound, getCartelaAvailability, joinRoundBatch, leaveRound, getProfile, getCartelaGridCached } from '../lib/api';
import cartelaGrids from '../lib/cartela-grids.json';

// Instant local grid lookup — no network needed
function getLocalGrid(num: number): number[] | null {
  const rows = (cartelaGrids as Record<string, number[]>)[String(num)];
  return rows ?? null;
}
import { initAuth } from '../lib/auth';
import { socket } from '../lib/socket';
import { shouldHandleCurrentRoundEvent } from '../lib/round-event-guards';
import { isRoundStartBlocked } from '../lib/round-start-flow';
import { formatWholeMoney } from '../lib/format';
import type { RoundDetail, CartelaAvailability, PlayerJoinedPayload, RoundStartedPayload, RoundVoidPayload, RoundCancelledPayload } from '../lib/api';

interface ProfileBalances {
  mainWallet?: { balance?: number | string | null } | null;
  playWallet?: { balance?: number | string | null } | null;
}

const asSafeBalance = (wallet?: { balance?: number | string | null } | null) => {
  const value = wallet?.balance ?? 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const TOTAL_CARTELAS = 800;
const BINGO_COLS = ['B', 'I', 'N', 'G', 'O'];
const COL_COLORS = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f87171'];

interface CartelaCellProps {
  num: number;
  taken: boolean;
  isPicked: boolean;
  isConfirmed: boolean;
  disabled: boolean;
  onClick: (num: number) => void;
}
const CartelaCell = memo(function CartelaCell({ num, taken, isPicked, isConfirmed, disabled, onClick }: CartelaCellProps) {
  const bg = isPicked
    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
    : taken
      ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
      : 'linear-gradient(180deg, rgba(30,41,59,0.9) 0%, rgba(15,23,42,0.95) 100%)';
  const color = isPicked ? '#ecfdf5' : taken ? '#fecaca' : '#cbd5e1';
  const border = isPicked
    ? '2px solid #6ee7b7'
    : taken
      ? '2px solid #dc2626'
      : '1px solid rgba(148,163,184,0.15)';
  const shadow = isPicked
    ? '0 0 20px rgba(16,185,129,0.4), inset 0 1px 2px rgba(255,255,255,0.1)'
    : taken
      ? '0 4px 14px rgba(220,38,38,0.3)'
      : '0 2px 8px rgba(0,0,0,0.2)';

  const handleClick = () => {
    if (taken || disabled) return;
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
        opacity: disabled && !taken && !isPicked ? 0.5 : 1,
        transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: isPicked ? 'translateY(-2px) scale(1.08)' : taken ? 'scale(0.98)' : 'translateY(0) scale(1)',
        WebkitAppearance: 'none', appearance: 'none', outline: 'none',
        lineHeight: 1, boxSizing: 'border-box', userSelect: 'none', minHeight: '48px',
        boxShadow: shadow, position: 'relative', overflow: 'hidden',
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}
    >
      {taken ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 14 }}>🔒</span>
          <span style={{ fontSize: 11 }}>{num}</span>
        </div>
      ) : (
        num
      )}
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

  // Local picks — restore from sessionStorage on mount, persist on change.
  // Also re-populate from confirmed joined cartelas so the player's own cartelas
  // show as "selected" (green) instead of "taken by another player" (red) on reload.
  const [picks, setPicks] = useState<Set<number>>(() => {
    if (!roundId) return new Set();
    try {
      const saved = sessionStorage.getItem(`selectedCartelas:${roundId}`);
      if (saved) return new Set(JSON.parse(saved));
      // Fallback: restore from confirmed joined cartelas (e.g. after page reload)
      const confirmed = sessionStorage.getItem(`myCartelaNumbers:${roundId}`);
      return confirmed ? new Set(JSON.parse(confirmed)) : new Set();
    } catch {
      return new Set();
    }
  });
  const picksRef = useRef<Set<number>>(picks);
  // Keep picksRef in sync synchronously — do NOT use useEffect here
  // because there's a render cycle gap where the ref would be stale.
  picksRef.current = picks;

  // Persist picks to sessionStorage whenever they change
  useEffect(() => {
    if (!roundId) return;
    sessionStorage.setItem(`selectedCartelas:${roundId}`, JSON.stringify([...picks]));
  }, [picks, roundId]);

  // Cartelas recently released may still be reported as taken by stale server responses
  const recentlyReleasedRef = useRef<Set<number>>(new Set());

  const [balanceAlert, setBalanceAlert] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<{ title: string; message: string } | null>(null);
  const [committing, setCommitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const joinedRef = useRef(false);
  const countdownStartedRef = useRef(false);
  const startRequestLockRef = useRef(false);
  const [manualTrigger, setManualTrigger] = useState(false);

  // Cartelas currently reserved by other players (transient, not yet taken)
  const [reservedByOthers, setReservedByOthers] = useState<Set<number>>(new Set());

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
        // Strip the current player's own joined cartelas from the taken list so
        // they render as "selected" (green) rather than "taken by others" (red).
        setAvailability(() => {
          const myNums: number[] = (() => {
            try { return JSON.parse(sessionStorage.getItem(`myCartelaNumbers:${roundId}`) ?? '[]'); } catch { return []; }
          })();
          const mySet = new Set(myNums);
          if (mySet.size === 0) return avail;
          return {
            taken: avail.taken.filter(n => !mySet.has(n)),
            available: avail.available,
          };
        });
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

  // Commit picks to server — called when game is about to start.
  // Cartelas are already joined on pick, so just confirm sessionStorage is set.
  async function commitPicks(currentPicks: Set<number>): Promise<boolean> {
    if (currentPicks.size === 0) {
      sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
      return false;
    }

    if (round) {
      sessionStorage.setItem(`roundCache:${roundId}`, JSON.stringify({
        id: round.id, stake: round.stake, derash: round.derash,
        player_count: round.player_count, status: 'active', timestamp: Date.now(),
      }));
    }

    // Cartelas were joined immediately on pick — just confirm sessionStorage
    const stored = sessionStorage.getItem(`myCartelaNumbers:${roundId}`);
    if (stored) return true;

    // Fallback: batch join anything not yet confirmed
    setCommitting(true);
    try {
      const result = await joinRoundBatch(roundId!, [...currentPicks]);
      setBalances({ mainWallet: { balance: result.mainWalletBalance }, playWallet: { balance: result.playWalletBalance } });
      sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify(result.cartelaNumbers));
      sessionStorage.removeItem(`selectedCartelas:${roundId}`);
      return true;
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'CARTELA_TAKEN' || e.code === 'ROUND_NOT_JOINABLE') {
        const fallback = sessionStorage.getItem(`myCartelaNumbers:${roundId}`);
        if (fallback) return true;
        sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
      } else if (e.code === 'INSUFFICIENT_BALANCE' || e.message?.includes('ቀሪ ሂሳብ')) {
        setBalanceAlert(e.message ?? 'ቀሪ ሂሳብ አይበቃም!\nPlease deposit to continue.');
      } else if (e.code === 'PLAYER_SUSPENDED') {
        setJoinError({ title: 'Account Suspended', message: 'Your account has been suspended. Please contact support.' });
      } else {
        sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
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
        // Only add to taken if not our own pick
        const incoming = p.cartelaNumbers.filter(n => !picksRef.current.has(n));
        if (incoming.length === 0) return prev;
        const newTaken = new Set([...prev.taken, ...incoming]);
        return { taken: [...newTaken], available: prev.available.filter(n => !newTaken.has(n)) };
      });
      // Never remove from picks — the picker manages their own state
    };

    const onCartelaReserved = (p: { cartelaNumbers: number[] }) => {
      setAvailability(prev => {
        if (!prev) return prev;
        const incoming = p.cartelaNumbers.filter(n => !picksRef.current.has(n));
        if (incoming.length === 0) return prev;
        const takenSet = new Set([...prev.taken, ...incoming]);
        return { taken: [...takenSet], available: prev.available.filter(n => !takenSet.has(n)) };
      });
    };

    const onCartelaUnreserved = (p: { cartelaNumbers: number[] }) => {
      setAvailability(prev => {
        if (!prev) return prev;
        const released = p.cartelaNumbers.filter(n => !picksRef.current.has(n));
        if (released.length === 0) return prev;
        const releasedSet = new Set(released);
        return {
          taken: prev.taken.filter(n => !releasedSet.has(n)),
          available: [...new Set([...prev.available, ...released])].sort((a, b) => a - b),
        };
      });
    };

    const onStarted = async (_p: RoundStartedPayload) => {
      if (_p.roundId && !shouldHandleCurrentRoundEvent(roundId, _p.roundId)) return;
      if (isRoundStartBlocked({ joined: joinedRef.current, starting, startRequested: startRequestLockRef.current })) return;

      joinedRef.current = true;
      startRequestLockRef.current = true;
      setStarting(true);
      sessionStorage.setItem('selectedRoundId', roundId!);
      
      // Navigate IMMEDIATELY
      navigate(`/rounds/${roundId}/game`, { replace: true });
      
      // Join in background (fire-and-forget)
      if (picksRef.current.size > 0) {
        commitPicks(picksRef.current).catch(() => {
          sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
        });
      } else {
        sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
      }
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

    // Poll every 3s — catches missed socket events without hammering the server
    const poll = setInterval(() => {
      // Also fetch round status to catch missed ROUND_STARTED socket events
      Promise.all([
        getCartelaAvailability(roundId!),
        getRound(roundId!),
      ]).then(([fresh, latestRound]) => {
        // If round went active and we haven't joined yet, navigate IMMEDIATELY
        if (latestRound.status === 'active' && !joinedRef.current) {
          if (isRoundStartBlocked({ joined: joinedRef.current, starting, startRequested: startRequestLockRef.current })) return;
          joinedRef.current = true;
          startRequestLockRef.current = true;
          setStarting(true);
          clearInterval(poll);
          sessionStorage.setItem('selectedRoundId', roundId!);
          // Navigate first, join in background
          navigate(`/rounds/${roundId}/game`, { replace: true });
          if (picksRef.current.size > 0) {
            commitPicks(picksRef.current).catch(() => {
              sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
            });
          } else {
            sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
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
          const recentlyReleased = recentlyReleasedRef.current;
          const myConfirmed: number[] = (() => {
            try { return JSON.parse(sessionStorage.getItem(`myCartelaNumbers:${roundId}`) ?? '[]'); } catch { return []; }
          })();
          const mySet = new Set([...localPicks, ...myConfirmed]);
          // taken = server's fresh taken, minus anything that's ours
          const takenFromServer = fresh.taken.filter(n => !mySet.has(n) && !recentlyReleased.has(n));
          const available = fresh.available.filter(n => !mySet.has(n));
          return { taken: takenFromServer, available };
        });
      }).catch(() => {});
    }, 3000);

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
    if (isRoundStartBlocked({ joined: joinedRef.current, starting, startRequested: startRequestLockRef.current })) return;

    joinedRef.current = true;
    startRequestLockRef.current = true;
    setStarting(true);
    sessionStorage.setItem('selectedRoundId', roundId ?? '');
    sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
    navigate(`/rounds/${roundId}/game`, { replace: true });
  }, [loading, round, roundId, navigate, starting]);

  // Countdown hit 0 — navigate immediately, commit picks in background
  useEffect(() => {
    if (msLeft !== 0 || !countdownStartedRef.current || joinedRef.current) return;
    if (isRoundStartBlocked({ joined: joinedRef.current, starting, startRequested: startRequestLockRef.current })) return;

    (async () => {
      joinedRef.current = true;
      startRequestLockRef.current = true;
      setStarting(true);
      sessionStorage.setItem('selectedRoundId', roundId ?? '');
      
      // Navigate IMMEDIATELY for instant transition
      navigate(`/rounds/${roundId}/game`, { replace: true });
      
      // Join in background (fire-and-forget)
      if (picksRef.current.size > 0) {
        commitPicks(picksRef.current).catch(() => {
          // On error, store empty cartelas so user watches instead of crashing
          sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
        });
      } else {
        sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
      }
    })();
  }, [msLeft, roundId, navigate, starting]);

  // Manual "Go to Game" trigger (edge case when countdown already passed)
  useEffect(() => {
    if (!manualTrigger || joinedRef.current || starting) return;
    if (isRoundStartBlocked({ joined: joinedRef.current, starting, startRequested: startRequestLockRef.current })) return;

    async function startGame() {
      joinedRef.current = true;
      startRequestLockRef.current = true;
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
        // Navigate immediately
        navigate(`/rounds/${roundId}/game`, { replace: true });
        // Join in background
        if (picksRef.current.size > 0 && currentRound.status === 'pending') {
          commitPicks(picksRef.current).catch(() => {
            sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
          });
        } else {
          sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([]));
        }
      } catch {
        setStarting(false);
        joinedRef.current = false;
        startRequestLockRef.current = false;
      }
    }
    void startGame();
  }, [manualTrigger, roundId, navigate, starting]);

  const handleCellClick = useCallback((num: number) => {
    // Own pick — deselect
    if (picksRef.current.has(num)) {
      const next = new Set(picksRef.current);
      next.delete(num);
      picksRef.current = next;
      setPicks(new Set(next));
      setPickedGrids(prev => { const m = new Map(prev); m.delete(num); return m; });
      try {
        const existing: number[] = JSON.parse(sessionStorage.getItem(`myCartelaNumbers:${roundId}`) ?? '[]');
        sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify(existing.filter(n => n !== num)));
      } catch { /* ignore */ }
      recentlyReleasedRef.current.add(num);
      window.setTimeout(() => { recentlyReleasedRef.current.delete(num); }, 1500);
      if (roundId) leaveRound(roundId, num).catch(() => {
        const restored = new Set(picksRef.current);
        restored.add(num);
        picksRef.current = restored;
        setPicks(new Set(restored));
      });
      return;
    }

    // Taken by another player
    if (availability && availability.taken.includes(num) && !recentlyReleasedRef.current.has(num)) {
      setBalanceAlert(`Cartela ${num} is already taken by another player.`);
      return;
    }

    if (picksRef.current.size >= (round?.max_cartelas_per_player ?? 2)) return;

    // Balance check
    if (round && balances) {
      const stake = Number(round.stake);
      const total = (picksRef.current.size + 1) * stake;
      const bal = asSafeBalance(balances?.playWallet) + asSafeBalance(balances?.mainWallet);
      if (bal < total) {
        setBalanceAlert(`ቀሪ ሂሳብ አይበቃም!\nNeed ${total} Birr — you have ${formatWholeMoney(bal)} Birr.\nPlease deposit to continue.`);
        return;
      }
    }

    // Add to picks immediately
    const next = new Set(picksRef.current);
    next.add(num);
    picksRef.current = next;
    setPicks(new Set(next));

    // Load grid for preview
    const localGrid = getLocalGrid(num);
    if (localGrid) {
      setPickedGrids(prev => new Map(prev).set(num, localGrid));
      if (roundId) {
        import('../lib/idb').then(({ idbPut }) => {
          idbPut('cartelas', `${roundId}:${num}`, { cartela_number: num, grid: localGrid }).catch(() => {});
        });
      }
    }

    // Join immediately — CARTELA_TAKEN broadcasts to all other clients (shows red for them)
    if (roundId) {
      joinRoundBatch(roundId, [num])
        .then(result => {
          setBalances({ mainWallet: { balance: result.mainWalletBalance }, playWallet: { balance: result.playWalletBalance } });
          const existing: number[] = (() => { try { return JSON.parse(sessionStorage.getItem(`myCartelaNumbers:${roundId}`) ?? '[]'); } catch { return []; } })();
          sessionStorage.setItem(`myCartelaNumbers:${roundId}`, JSON.stringify([...new Set([...existing, num])]));
        })
        .catch((err: unknown) => {
          const e = err as { code?: string; message?: string };
          const rollback = new Set(picksRef.current);
          rollback.delete(num);
          picksRef.current = rollback;
          setPicks(new Set(rollback));
          setPickedGrids(prev => { const m = new Map(prev); m.delete(num); return m; });
          if (e.code === 'CARTELA_TAKEN') {
            setBalanceAlert(`Cartela ${num} was just taken. Pick another.`);
            if (roundId) getCartelaAvailability(roundId).then(fresh => setAvailability(fresh)).catch(() => {});
          } else if (e.code === 'INSUFFICIENT_BALANCE') {
            setBalanceAlert(e.message ?? 'ቀሪ ሂሳብ አይበቃም!\nPlease deposit to continue.');
          } else if (e.code !== 'ROUND_NOT_JOINABLE') {
            setBalanceAlert(e.message ?? 'Could not join. Please try again.');
          }
        });
    }
  }, [roundId, round, balances, availability]);

  if (loading) return (
    <div style={{ height: '100dvh', background: 'linear-gradient(135deg, #0f172a 0%, #0a0e1a 100%)' }} />
  );
  if (!round || !availability) return (
    <div style={{ height: '100dvh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0a0e1a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', padding: 24, textAlign: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 56 }}>🚫</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{error ? 'Failed to Load' : 'Round Not Found'}</div>
      <div style={{ fontSize: 13, color: '#94a3b8' }}>{error || 'Could not load round data'}</div>
    </div>
  );

  // availability.taken contains ONLY other players' cartelas — never the current player's picks
  const takenSet = new Set(availability.taken);
  const urgent = msLeft > 0 && msLeft < 10_000;
  const maxSelect = round.max_cartelas_per_player ?? 2;
  const canPick = picks.size < maxSelect;
  const poolSize = Math.min(round.active_cartela_count ?? TOTAL_CARTELAS, TOTAL_CARTELAS);
  const allNumbers = Array.from({ length: poolSize }, (_, i) => i + 1);
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
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Up to {round?.max_cartelas_per_player ?? 2} cartela{(round?.max_cartelas_per_player ?? 2) !== 1 ? 's' : ''}</div>
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
            { label: '💰 Main', value: balances ? Math.floor(asSafeBalance(balances.mainWallet)) : 0, color: '#3b82f6' },
            { label: '🎮 Play', value: balances ? Math.floor(asSafeBalance(balances.playWallet)) : 0, color: '#10b981' },
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


      {/* ── Number grid (scrollable) ── */}
      <div style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
        gap: 12, padding: '24px 20px', alignContent: 'start',
        background: 'linear-gradient(180deg, rgba(15,23,42,0.7) 0%, rgba(10,14,26,0.8) 100%)',
        borderTop: '1px solid rgba(148,163,184,0.08)',
      }}>
        {allNumbers.map(num => {
          const isPicked = picks.has(num);
          const taken = takenSet.has(num) && !isPicked;
          const isConfirmed = false;
          const disabled = starting || committing || taken || (!isPicked && picks.size >= maxSelect);
          return (
            <CartelaCell key={num} num={num} taken={taken} isPicked={isPicked} isConfirmed={isConfirmed} disabled={disabled} onClick={handleCellClick} />
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
