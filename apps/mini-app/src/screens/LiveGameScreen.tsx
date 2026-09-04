import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket } from '../lib/socket';
import { getRound, getMyCartelas, getRounds, getCalledNumbers, getCartelaGridCached } from '../lib/api';
import { idbGet, idbPut } from '../lib/idb';
import { getJwtFromStorage } from '../lib/auth-storage';
import type {
  RoundDetail,
  NumberCalledPayload,
  RoundStartedPayload,
  RoundWonPayload,
  RoundVoidPayload,
  RoundCancelledPayload,
  PlayerJoinedPayload,
  WinRejectedPayload,
} from '../lib/api';
import { WIN_PATTERN_LABELS, WinPattern } from '@fidel/shared';

const COLS = ['B', 'I', 'N', 'G', 'O'];
const COL_COLORS = [
  '#3b82f6', // B — deep blue
  '#8b5cf6', // I — purple
  '#22c55e', // N — green
  '#f59e0b', // G — amber
  '#ef4444', // O — red
];

type GamePhase = 'waiting' | 'active' | 'won' | 'void' | 'cancelled';

interface GameState {
  phase: GamePhase;
  calledNumbers: Set<number>;
  calledOrder: number[];   // ordered list for last-4 display
  lastCalled: number | null;
  playerCount: number;
  derash: number;
  winnerInfo: RoundWonPayload | null;
  endMessage: string | null;
  winningPattern: WinPattern;
}

function getColIndex(n: number) { return Math.floor((n - 1) / 15); }
function getColLabel(n: number) { return COLS[getColIndex(n)] ?? ''; }

export default function LiveGameScreen() {
  const { id: roundId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [round, setRound] = useState<RoundDetail | null>(null);
  const [myCartelas, setMyCartelas] = useState<Array<{ cartelaNumber: number; cartelaGrid: number[] }>>([]);
  const [cartelasLoaded, setCartelasLoaded] = useState(false);
  const [winnerCartelaGrid, setWinnerCartelaGrid] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimPending, setClaimPending] = useState(false);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('soundOn') !== 'false');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  // Keep a ref in sync so socket handlers always read the latest value
  const soundOnRef = useRef(soundOn);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  // Handle responsive resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Buffer NUMBER_CALLED events that arrive before the REST fetch completes
  // so they can be merged into the initial calledOrder without duplicates/gaps
  const pendingNumbers = useRef<NumberCalledPayload[]>([]);

  // Unlock audio context on first user gesture (required by browser autoplay policy)
  const audioUnlocked = useRef(false);
  useEffect(() => {
    const unlock = () => {
      if (audioUnlocked.current) return;
      audioUnlocked.current = true;
      // Play a silent buffer to unlock audio — close the context AFTER it finishes
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.onended = () => { ctx.close().catch(() => {}); };
        src.start(0);
      } catch {}
      // Play+pause the first cached audio element to prime the HTML5 audio pipeline
      // Reduced timeout for faster audio initialization
      setTimeout(() => {
        const first = audioCache.current.get(1);
        if (first) { first.play().catch(() => {}); first.pause(); first.currentTime = 0; }
      }, 20);
    };
    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('click', unlock, { once: true });
    return () => {
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('click', unlock);
    };
  }, []);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    window.location.reload();
  }, []);

  const [game, setGame] = useState<GameState>({
    phase: 'waiting',
    calledNumbers: new Set(),
    calledOrder: [],
    lastCalled: null,
    playerCount: 0,
    derash: 0,
    winnerInfo: null,
    endMessage: null,
    winningPattern: WinPattern.any_line,
  });

  // ─── Preload all 75 number sounds into memory once ──────────────────────
  const audioCache = useRef<Map<number, HTMLAudioElement>>(new Map());

  useEffect(() => {
    // Lazy-load sounds: preload only the first 15 immediately (most likely to be called first),
    // then load the rest in the background in small batches to avoid saturating the network.
    async function preloadSounds() {
      const load = async (n: number) => {
        if (audioCache.current.has(n)) return;
        try {
          let buf = await idbGet<ArrayBuffer>('sounds', n);
          if (!buf) {
            const res = await fetch(`/sounds/${n}.wav`);
            buf = await res.arrayBuffer();
            idbPut('sounds', n, buf).catch(() => {});
          }
          const blob = new Blob([buf], { type: 'audio/wav' });
          const audio = new Audio(URL.createObjectURL(blob));
          audio.preload = 'auto';
          audioCache.current.set(n, audio);
        } catch {
          const audio = new Audio(`/sounds/${n}.wav`);
          audio.preload = 'auto';
          audioCache.current.set(n, audio);
        }
      };

      // Phase 1: load first 20 numbers immediately for instant playback
      await Promise.all(Array.from({ length: 20 }, (_, i) => load(i + 1)));

      // Phase 2: load remaining 55 in background batches of 15 for faster coverage
      // Use shorter delays to ensure sounds are ready when called
      const loadBatch = async (start: number, end: number) => {
        await Promise.all(Array.from({ length: end - start }, (_, i) => load(start + i)));
      };
      const scheduleBatch = (start: number, end: number, delay: number) => {
        setTimeout(() => { loadBatch(start, end).catch(() => {}); }, delay);
      };
      scheduleBatch(21, 36, 200);
      scheduleBatch(36, 51, 400);
      scheduleBatch(51, 66, 600);
      scheduleBatch(66, 76, 800);
    }
    preloadSounds();
  }, []);

  function playSound(num: number) {
    if (!soundOnRef.current) return;
    try {
      const cached = audioCache.current.get(num);
      const audio = cached ?? new Audio(`/sounds/${num}.wav`);
      if (!cached) {
        audio.preload = 'auto';
        audioCache.current.set(num, audio);
      }

      // Prevent overlapping sounds from stacking when the same number is triggered rapidly.
      audio.pause();
      audio.currentTime = 0;

      const p = audio.play();
      if (p) {
        p.catch((err) => {
          // Autoplay blocked — retry once after a short delay
          // (happens when user hasn't interacted with the page yet)
          if (err?.name === 'NotAllowedError') {
            setTimeout(() => {
              audio.pause();
              audio.currentTime = 0;
              audio.play().catch(() => {});
            }, 300);
          }
        });
      }
    } catch {}
  }

  // ─── Load round + player entry ───────────────────────────────────────────
  useEffect(() => {
    if (!roundId) return;

    // ── Instant cache load — show UI immediately with cached round data ────
    const cached = sessionStorage.getItem(`roundCache:${roundId}`);
    if (cached) {
      try {
        const cachedRound = JSON.parse(cached);
        // Only use cache if it's fresh (< 30s old)
        if (Date.now() - cachedRound.timestamp < 30_000) {
          setRound(cachedRound);
          setGame(g => ({
            ...g,
            playerCount: cachedRound.player_count,
            derash: cachedRound.derash,
            phase: 'active',
          }));
          setLoading(false); // Show UI instantly
        }
      } catch {}
    }

    async function load() {
      try {
        // Fetch round and called numbers immediately — don't block on cartelas
        const [r, calledNums] = await Promise.all([
          getRound(roundId!),
          getCalledNumbers(roundId!).catch(() => [] as number[]),
        ]);
        setRound(r);

        // Drain any NUMBER_CALLED events that arrived during the REST fetch.
        const buffered = pendingNumbers.current.splice(0);
        buffered.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
        const restSet = new Set(calledNums);
        const mergedOrder = [...calledNums];
        for (const p of buffered) {
          if (!restSet.has(p.number)) {
            restSet.add(p.number);
            mergedOrder.push(p.number);
          }
        }

        const lastCalled = mergedOrder[mergedOrder.length - 1] ?? null;
        setGame((g) => ({
          ...g,
          calledNumbers: restSet,
          lastCalled,
          playerCount: r.player_count,
          derash: r.derash,
          calledOrder: mergedOrder,
          winningPattern: (r.winning_pattern ?? WinPattern.any_line) as WinPattern,
          phase:
            r.status === 'active' ? 'active'
            : r.status === 'completed' ? 'won'
            : r.status === 'void' ? 'void'
            : r.status === 'cancelled' ? 'cancelled'
            : 'waiting',
        }));

        // Clear round cache after successful load
        sessionStorage.removeItem(`roundCache:${roundId}`);

        if (r.status === 'completed' && r.winner_cartela_number) {
          getCartelaGridCached(roundId!, r.winner_cartela_number)
            .then(res => setWinnerCartelaGrid(res.grid))
            .catch(() => {});
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load game');
      } finally {
        setLoading(false);
      }
    }

    async function loadCartelas() {
      // 1. Try sessionStorage + IDB cache first — instant for players who just joined
      const stored = sessionStorage.getItem(`myCartelaNumbers:${roundId}`);
      if (stored) {
        try {
          const nums: number[] = JSON.parse(stored);
          if (nums.length > 0) {
            const cached = await Promise.all(
              nums.map(async (num) => {
                const idb = await idbGet<{ cartela_number: number; grid: number[]; cachedAt?: number }>('cartelas', `cartela:${num}`);
                const CACHE_TTL_MS = 60 * 60 * 1000;
                if (idb && idb.cachedAt && Date.now() - idb.cachedAt < CACHE_TTL_MS) return { cartelaNumber: num, cartelaGrid: idb.grid };
                try {
                  const fetched = await getCartelaGridCached(roundId!, num);
                  return { cartelaNumber: num, cartelaGrid: fetched.grid };
                } catch { return null; }
              }),
            );
            const resolved = cached.filter((c): c is { cartelaNumber: number; cartelaGrid: number[] } => c !== null && c.cartelaGrid.length > 0);
            if (resolved.length > 0) {
              setMyCartelas(resolved);
              setCartelasLoaded(true);
              return; // done — no API call needed
            }
          }
        } catch {}
      }

      // 2. API call with up to 2 retries (300ms gap) for post-round-start race
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await getMyCartelas(roundId!);
          if (result.cartelas.length > 0) {
            setMyCartelas(result.cartelas);
            setCartelasLoaded(true);
            return;
          }
        } catch {}
        if (attempt < 2) await new Promise(res => setTimeout(res, 300));
      }
      setCartelasLoaded(true); // no cartelas — player is watching
    }

    load();
    loadCartelas();
  }, [roundId]);

  // ─── Socket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roundId) return;
    if (!socket.connected) socket.connect();
    socket.emit('JOIN_ROUND', { roundId, token: getJwtFromStorage() ?? '' });

    // Re-join the round room whenever the socket reconnects so events keep flowing
    // without requiring a manual page refresh.
    const onReconnect = () => {
      socket.emit('JOIN_ROUND', { roundId, token: getJwtFromStorage() ?? '' });
      // Also re-sync state immediately after reconnect to fill any missed events
      Promise.all([
        getRound(roundId!).catch(() => null),
        getCalledNumbers(roundId!).catch(() => [] as number[]),
      ]).then(([r, nums]) => {
        if (!r) return;
        const mergedSet = new Set(nums);
        setGame((g) => {
          if (g.phase === 'won' || g.phase === 'void' || g.phase === 'cancelled') return g;
          const last = nums[nums.length - 1] ?? g.lastCalled;
          const wp = (r.winning_pattern ?? WinPattern.any_line) as WinPattern;
          if (r.status === 'active') {
            return { ...g, phase: 'active', derash: r.derash, playerCount: r.player_count, calledNumbers: mergedSet, calledOrder: nums, lastCalled: last ?? g.lastCalled, winningPattern: wp };
          }
          if (r.status === 'completed') {
            return { ...g, phase: 'won', derash: r.derash, playerCount: r.player_count, calledNumbers: mergedSet, calledOrder: nums, lastCalled: last ?? g.lastCalled, winningPattern: wp };
          }
          if (r.status === 'void' || r.status === 'cancelled') {
            return { ...g, phase: r.status === 'void' ? 'void' : 'cancelled', endMessage: r.status === 'void' ? 'No winner — stake refunded.' : 'Round cancelled — stake refunded.', calledNumbers: mergedSet, calledOrder: nums, lastCalled: last ?? g.lastCalled };
          }
          return g;
        });
      }).catch(() => {});
    };

    socket.on('connect', onReconnect);

    const onNumber = (p: NumberCalledPayload) => {
      setGame((g) => {
        // Ignore any stray NUMBER_CALLED events after the round is over
        if (g.phase === 'won' || g.phase === 'void' || g.phase === 'cancelled') return g;

        // If the REST fetch hasn't loaded yet (phase is still default/waiting from initial state
        // and calledOrder is empty), buffer this event so load() can merge it in order
        if (g.calledOrder.length === 0 && g.phase === 'waiting') {
          pendingNumbers.current.push(p);
          return g;
        }

        // Deduplicate: skip numbers already present (can arrive via REST + WS overlap)
        if (g.calledNumbers.has(p.number)) return g;

        const next = new Set(g.calledNumbers);
        next.add(p.number);
        return { ...g, calledNumbers: next, calledOrder: [...g.calledOrder, p.number], lastCalled: p.number, phase: g.phase === 'waiting' ? 'active' : g.phase };
      });
      playSound(p.number);
    };
    const onStarted = (p: RoundStartedPayload) =>
      setGame((g) => ({ ...g, phase: 'active', derash: p.derash, playerCount: p.playerCount, winningPattern: (p.winningPattern ?? WinPattern.any_line) as WinPattern }));
    const onJoined = (p: PlayerJoinedPayload) =>
      setGame((g) => ({ ...g, playerCount: p.playerCount }));
    const onWon = (p: RoundWonPayload) => {
      setGame((g) => ({ ...g, phase: 'won', winnerInfo: p, derash: p.totalDerash }));
      
      // Play winning sound
      if (soundOnRef.current) {
        try {
          const winAudio = new Audio('/sounds/bingo-win.mp3');
          winAudio.volume = 0.8;
          winAudio.pause();
          winAudio.currentTime = 0;
          winAudio.play().catch(() => {
            // Autoplay blocked - retry after short delay
            setTimeout(() => {
              winAudio.pause();
              winAudio.currentTime = 0;
              winAudio.play().catch(() => {});
            }, 300);
          });
        } catch {}
      }
      
      // Fetch the winning cartela grid so ALL users (including watchers) can see it
      // Retry up to 3 times in case the DB write hasn't propagated yet
      const winnerCartelaNum = p.winners[0]?.cartelaNumber;
      if (winnerCartelaNum && roundId) {
        const fetchGrid = async (retries = 3): Promise<void> => {
          for (let i = 0; i < retries; i++) {
            try {
              const res = await getCartelaGridCached(roundId!, winnerCartelaNum);
              if (res.grid.length > 0) { setWinnerCartelaGrid(res.grid); return; }
            } catch {}
            if (i < retries - 1) await new Promise(r => setTimeout(r, 600));
          }
        };
        void fetchGrid();
      }
    };
    const onVoid = (_p: RoundVoidPayload) =>
      setGame((g) => ({ ...g, phase: 'void', endMessage: 'No winner — stake refunded.' }));
    const onCancelled = (_p: RoundCancelledPayload) =>
      setGame((g) => ({ ...g, phase: 'cancelled', endMessage: 'Round cancelled — stake refunded.' }));
    const onRejected = (p: WinRejectedPayload) => {
      // Handle both payload shapes: { reason } (new) and { code, message } (legacy)
      const reason = p.reason ?? (p as any).code ?? (p as any).message ?? 'UNKNOWN';
      const silentReasons = ['ROUND_NOT_ACTIVE', 'DUPLICATE_CLAIM', 'CLAIM_WINDOW_CLOSED', 'NO_WINNING_LINE'];
      if (!silentReasons.includes(reason)) {
        setClaimError('Win rejected: ' + reason);
      }
      setClaimPending(false);
    };

    socket.on('NUMBER_CALLED', onNumber);
    socket.on('ROUND_STARTED', onStarted);
    socket.on('PLAYER_JOINED', onJoined);
    socket.on('ROUND_WON', onWon);
    socket.on('ROUND_VOID', onVoid);
    socket.on('ROUND_CANCELLED', onCancelled);
    socket.on('WIN_REJECTED', onRejected);
    return () => {
      socket.off('connect', onReconnect);
      socket.off('NUMBER_CALLED', onNumber);
      socket.off('ROUND_STARTED', onStarted);
      socket.off('PLAYER_JOINED', onJoined);
      socket.off('ROUND_WON', onWon);
      socket.off('ROUND_VOID', onVoid);
      socket.off('ROUND_CANCELLED', onCancelled);
      socket.off('WIN_REJECTED', onRejected);
      // Leave the round room so we stop receiving events from this round
      socket.emit('LEAVE_ROUND', { roundId });
    };
  // soundOn intentionally excluded — toggling sound must not reconnect the socket
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  // ─── Re-sync the round from the server while it is active or still waiting ──
  // This prevents the board from freezing if socket events are delayed or missed.
  useEffect(() => {
    if (!roundId || !['waiting', 'active'].includes(game.phase)) return;
    const iv = setInterval(async () => {
      setSyncing(true);
      try {
        const [r, nums] = await Promise.all([
          getRound(roundId),
          getCalledNumbers(roundId).catch(() => [] as number[]),
        ]);

        const mergedSet = new Set(nums);
        setGame((g) => {
          if (g.phase === 'won' || g.phase === 'void' || g.phase === 'cancelled') return g;

          const last = nums[nums.length - 1] ?? g.lastCalled;
          const wp = (r.winning_pattern ?? WinPattern.any_line) as WinPattern;
          if (r.status === 'active') {
            return {
              ...g,
              phase: 'active',
              derash: r.derash,
              playerCount: r.player_count,
              calledNumbers: mergedSet,
              calledOrder: nums,
              lastCalled: last ?? g.lastCalled,
              winningPattern: wp,
            };
          }

          if (r.status === 'completed') {
            return {
              ...g,
              phase: 'won',
              derash: r.derash,
              playerCount: r.player_count,
              calledNumbers: mergedSet,
              calledOrder: nums,
              lastCalled: last ?? g.lastCalled,
              winningPattern: wp,
            };
          }

          if (r.status === 'void' || r.status === 'cancelled') {
            return {
              ...g,
              phase: r.status === 'void' ? 'void' : 'cancelled',
              endMessage: r.status === 'void' ? 'No winner — stake refunded.' : 'Round cancelled — stake refunded.',
              derash: r.derash,
              playerCount: r.player_count,
              calledNumbers: mergedSet,
              calledOrder: nums,
              lastCalled: last ?? g.lastCalled,
            };
          }

          return g;
        });
      } catch {}
      finally {
        setSyncing(false);
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [game.phase, roundId]);
  useEffect(() => {
    if (game.phase !== 'won' && game.phase !== 'void' && game.phase !== 'cancelled') return;
    // Won: show winner cartela for 5 seconds then navigate
    // Void/cancelled: navigate after 3 seconds
    const delay = game.phase === 'won' ? 5 : 3;
    setNextCountdown(delay);
    const iv = setInterval(() => {
      setNextCountdown((p) => { if (p === null || p <= 1) { clearInterval(iv); return 0; } return p - 1; });
    }, 1000);
    return () => clearInterval(iv);
  }, [game.phase]);

  const nextRoundFiredRef = useRef(false);

  useEffect(() => {
    if (nextCountdown !== 0 || nextRoundFiredRef.current) return;
    nextRoundFiredRef.current = true;

    async function go() {
      const stake = Number(round?.stake ?? sessionStorage.getItem('selectedStake') ?? 0);

      for (let i = 0; i < 30; i++) {
        try {
          const allRounds = await getRounds();
          const next = allRounds.find(
            (r) => Number(r.stake) === stake && r.status === 'pending' && r.id !== roundId,
          );
          if (next) {
            sessionStorage.setItem('stakeSelectedForRound', next.id);
            sessionStorage.setItem('selectedRoundId', next.id);
            sessionStorage.setItem('selectedStake', String(next.stake));
            navigate(`/rounds/${next.id}/cartela`, { replace: true });
            return;
          }
        } catch (e) {
          console.error('[LiveGame] getRounds error:', e);
        }
        await new Promise<void>((r) => setTimeout(r, 1500));
      }
      navigate('/', { replace: true });
    }
    void go();
  }, [nextCountdown, navigate]);

  const toggleSound = useCallback(() => {
    setSoundOn((v) => { const n = !v; localStorage.setItem('soundOn', String(n)); return n; });
  }, []);


  const allCartelas = myCartelas;
  const marked = game.calledNumbers;
  const activeCartela = allCartelas[0];
  const grid: number[] = (activeCartela?.cartelaGrid ?? []) as number[];

  function isMarkedForGrid(g: number[], i: number) {
    if (i === 12) return true; // free space
    const v = g[i];
    return v !== undefined && v !== 0 && marked.has(v);
  }

  // Returns the indices that form winning lines for the given pattern
  function getLinesForPattern(p: WinPattern): number[][] {
    const ROWS = [[0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[15,16,17,18,19],[20,21,22,23,24]];
    const COLS = [[0,5,10,15,20],[1,6,11,16,21],[2,7,12,17,22],[3,8,13,18,23],[4,9,14,19,24]];
    switch (p) {
      case WinPattern.row:            return ROWS;
      case WinPattern.column:         return COLS;
      case WinPattern.diagonal_tl_br: return [[0,6,12,18,24]];
      case WinPattern.diagonal_tr_bl: return [[4,8,12,16,20]];
      case WinPattern.corners:        return [[0,4,20,24]];
      case WinPattern.full_house:     return [Array.from({ length: 25 }, (_, i) => i)];
      default:                        return [...ROWS, ...COLS, [0,6,12,18,24], [4,8,12,16,20], [0,4,20,24]];
    }
  }

  function hasWinForGrid(g: number[]) {
    if (!g.length) return false;
    const lines = getLinesForPattern(game.winningPattern);
    return lines.some(line => line.every(i => isMarkedForGrid(g, i)));
  }
  function winCellsForGrid(g: number[]) {
    const w = new Set<number>();
    if (!g.length) return w;
    const lines = getLinesForPattern(game.winningPattern);
    for (const line of lines) {
      if (line.every(i => isMarkedForGrid(g, i))) line.forEach(i => w.add(i));
    }
    return w;
  }

  // Win on ANY cartela
  const playerHasBingo = allCartelas.some((c) => hasWinForGrid(c.cartelaGrid as number[]));
  const winningCartelaNumber = allCartelas.find((c) => hasWinForGrid(c.cartelaGrid as number[]))?.cartelaNumber ?? null;
  const isWatching = cartelasLoaded && myCartelas.length === 0;

  // ─── Auto-claim win as soon as bingo is detected ─────────────────────────
  const autoClaimed = useRef(false);
  useEffect(() => {
    if (!playerHasBingo || game.phase !== 'active' || !roundId || !myCartelas.length || claimPending || autoClaimed.current) return;
    autoClaimed.current = true;
    setClaimPending(true);
    setClaimError(null);
    socket.emit('CLAIM_WIN', { roundId, cartelaId: winningCartelaNumber ?? 0 });
  }, [playerHasBingo, game.phase, roundId, myCartelas, claimPending]);

  if (loading) return (
    <div style={{ height: '100dvh', background: 'linear-gradient(180deg, #0b1220 0%, #111827 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', flexDirection: 'column', gap: 16 }}>
      Loading game...
    </div>
  );
  if (error || !round) return (
    <div style={{ height: '100dvh', background: 'linear-gradient(180deg, #0b1220 0%, #111827 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', padding: 24, textAlign: 'center', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
        {error ?? 'Could not load game'}
      </div>
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        style={{
          padding: '10px 24px',
          fontSize: 14,
          fontWeight: 700,
          borderRadius: 8,
          border: 'none',
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          color: '#fff',
          cursor: refreshing ? 'not-allowed' : 'pointer',
          opacity: refreshing ? 0.7 : 1,
          boxShadow: '0 4px 12px rgba(34,197,94,0.3)',
          transition: 'all 0.3s ease',
        }}
      >
        {refreshing ? '⟳ Refreshing...' : '↻ Refresh Page'}
      </button>
    </div>
  );

  const gameEnded = game.phase === 'won' || game.phase === 'void' || game.phase === 'cancelled';

  // Exact column colors from the image
  const HDR = ['#3b6fe8', '#1db47a', '#8b3fd9', '#d97706', '#c0392b'] as const;

  // ── image col colors: B=blue, I=green, N=purple, G=amber, O=red ──
  const colBg = (ci: number, called: boolean, isLast: boolean) => {
    if (isLast) return '#f5c518';
    if (!called) return 'rgba(255,255,255,0.06)';
    return `${HDR[ci]}`;
  };
  void colBg; // used below

  return (
    <div style={{ height: '100dvh', background: '#0e1726', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>



      {/* ── STATS ROW ── */}
      <div style={{ background: '#132033', borderBottom: '1px solid rgba(255,255,255,0.09)', flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)' }}>
        {[
          { label: 'GAME ID',   value: round.id.slice(-6).toUpperCase() },
          { label: 'PLAYERS',  value: game.playerCount },
          { label: 'BET',      value: round.stake },
          { label: 'DERASH',   value: Math.round(game.derash) },
          { label: 'CALLED',   value: game.calledNumbers.size },
        ].map(({ label, value }, i) => (
          <div key={label} style={{ textAlign: 'center', padding: '7px 3px', borderRight: i < 4 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
            <div style={{ fontSize: 8, color: '#7a95b8', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#f0f4ff' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── PATTERN BADGE — hidden ── */}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.5; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
@keyframes lastCalledPulse { 0% { transform: scale(1); } 50% { transform: scale(1.08); } 100% { transform: scale(1); } }
@keyframes winnerPulse { 0%, 100% { transform: scale(1) rotate(0deg); } 50% { transform: scale(1.15) rotate(5deg); } }
@keyframes slideIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes shine { from { transform: translateX(-100%); } to { transform: translateX(100%); } }`}</style>

      {/* ── MAIN: LEFT board + RIGHT panel ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ══ LEFT: 1–75 bingo board ══ */}
        <div style={{ width: '44%', flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', borderRight: '1px solid rgba(255,255,255,0.08)', background: '#0d1a2d' }}>

          {/* B I N G O headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2, padding: '4px 3px 2px', flexShrink: 0 }}>
            {COLS.map((c, ci) => (
              <div key={c} style={{ textAlign: 'center', padding: '5px 0', borderRadius: 5, fontWeight: 900, fontSize: 13, background: HDR[ci], color: '#fff', letterSpacing: 0.5 }}>{c}</div>
            ))}
          </div>

          {/* Numbers 1–75: row-by-row under each column header */}
          {/* Row 0: 1,16,31,46,61 | Row 1: 2,17,32,47,62 | ... | Row 14: 15,30,45,60,75 */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gridTemplateRows: 'repeat(15, minmax(22px, 1fr))', gap: 2, padding: '2px 3px 3px' }}>
            {Array.from({ length: 15 }, (_, row) =>
              Array.from({ length: 5 }, (_, col) => {
                const num = col * 15 + row + 1; // B:1-15, I:16-30, N:31-45, G:46-60, O:61-75
                const called = game.calledNumbers.has(num);
                const isLast = num === game.lastCalled;
                return (
                  <div key={num} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 4,
                    background: isLast ? '#f5c518' : called ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.055)',
                    color: isLast ? '#0e1726' : called ? '#fff' : '#4a6080',
                    fontSize: 10, fontWeight: isLast ? 900 : called ? 800 : 500,
                    border: isLast ? '2px solid #fff' : called ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.07)',
                    minHeight: 22,
                    aspectRatio: '1', transition: 'background 0.18s',
                    boxShadow: isLast ? '0 0 10px rgba(245,197,24,0.6)' : 'none',
                  } as React.CSSProperties}>
                    {num}
                  </div>
                );
              })
            ).flat()}
          </div>

          {/* ── LEAVE / REFRESH buttons ── */}
          <div style={{ display: 'flex', gap: 6, padding: '6px 6px', flexShrink: 0, background: '#0d1a2d', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer',
                boxShadow: '0 3px 10px rgba(239,68,68,0.4)',
              }}
            >
              Leave
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                background: 'rgba(255,255,255,0.1)',
                color: refreshing ? '#4a6080' : '#94a3b8', fontWeight: 700, fontSize: 13,
                cursor: refreshing ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              <span style={{ display: 'inline-block', fontSize: 14, transform: refreshing ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>↻</span>
              Refresh
            </button>
          </div>
        </div>

        {/* ══ RIGHT PANEL ══ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0e1726' }}>

          {/* LAST CALLED */}
          <div style={{ padding: '10px 12px 8px', flexShrink: 0, background: '#132033', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: '#7a95b8', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Last Called</span>
              <button type="button" onClick={toggleSound} style={{ background: 'none', border: 'none', color: '#7a95b8', fontSize: 14, cursor: 'pointer', padding: 0 }}>{soundOn ? '🔊' : '🔇'}</button>
            </div>
            {game.lastCalled != null ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                  background: HDR[getColIndex(game.lastCalled)],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 14, color: '#fff',
                  animation: 'lastCalledPulse 0.6s ease-in-out infinite',
                }}>
                  {getColLabel(game.lastCalled)}
                </div>
                <div style={{ fontSize: 48, fontWeight: 900, color: '#ffffff', lineHeight: 1, fontVariantNumeric: 'tabular-nums', animation: 'lastCalledPulse 0.6s ease-in-out infinite' }}>
                  {game.lastCalled}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 14, color: '#4a6080', padding: '8px 0' }}>
                {game.phase === 'waiting' ? 'Starting…' : '—'}
              </div>
            )}

          </div>

          {/* CALLED chips */}
          <div style={{ padding: '7px 10px 6px', flexShrink: 0, background: '#0d1a2d', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 10, color: '#7a95b8', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5 }}>
              Called ({game.calledOrder.length}/75)
            </div>
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
              {game.calledOrder.length === 0
                ? <span style={{ color: '#4a6080', fontSize: 11 }}>—</span>
                : [...game.calledOrder].reverse().slice(0, 10).map((num, idx) => {
                    const ci = getColIndex(num);
                    const isFirst = idx === 0;
                    return (
                      <div key={`chip-${num}`} style={{
                        flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
                        background: isFirst ? HDR[ci] : 'rgba(255,255,255,0.1)',
                        border: isFirst ? `2px solid ${HDR[ci]}` : '1px solid rgba(255,255,255,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700,
                        color: isFirst ? '#fff' : '#7a95b8',
                        boxShadow: isFirst ? `0 0 10px ${HDR[ci]}88` : 'none',
                      }}>
                        {num}
                      </div>
                    );
                  })
              }
            </div>
          </div>

          {/* CARTELA CARDS — scrollable */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px 10px', display: 'flex', flexDirection: 'column', gap: 6, scrollbarWidth: 'none', alignItems: 'center' }}>
            {!isWatching && allCartelas.length > 0 ? (
              allCartelas.map((cartela, cardIdx) => {
                const cGrid = cartela.cartelaGrid as number[];
                const winCells = winCellsForGrid(cGrid);
                const hasBingo = hasWinForGrid(cGrid);
                return (
                  <div key={cartela.cartelaNumber} style={{
                    flexShrink: 0,
                    width: '100%',
                    maxWidth: 220,
                    background: '#132033',
                    borderRadius: 6,
                    overflow: 'hidden',
                    border: hasBingo ? '1.5px solid #22c55e' : '1px solid rgba(255,255,255,0.09)',
                  }}>
                    {/* Card label */}
                    <div style={{ padding: '2px 4px', background: '#0d1a2d', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ fontSize: 7.5, fontWeight: 800, color: '#f5c518', letterSpacing: 0.4 }}>#{cartela.cartelaNumber}</span>
                      {hasBingo && <span style={{ fontSize: 7.5, fontWeight: 700, color: '#22c55e' }}>✓ BINGO</span>}
                      {game.phase === 'active' && claimPending && hasBingo && <span style={{ fontSize: 7.5, color: '#f59e0b' }}>⏳ Claiming…</span>}
                    </div>

                    {/* BINGO column headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 1, padding: '1px 1px 1px' }}>
                      {COLS.map((c, ci) => (
                        <div key={c} style={{ textAlign: 'center', padding: '1px 0', borderRadius: 2, fontWeight: 800, fontSize: 6.5, background: HDR[ci], color: '#fff' }}>{c}</div>
                      ))}
                    </div>

                    {/* 5×5 grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 0.5, padding: '1px 1px 1px' }}>
                      {cGrid.map((val, idx) => {
                        const isFree = idx === 12;
                        const isM = isFree || (val !== 0 && marked.has(val));
                        const isW = winCells.has(idx);
                        return (
                          <div key={idx} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            aspectRatio: '1', borderRadius: 2,
                            background: isW ? 'linear-gradient(135deg,#f59e0b,#d97706)' : isM ? '#3b82f6cc' : 'rgba(255,255,255,0.05)',
                            color: isW || isM ? '#fff' : '#4a6080',
                            fontSize: 6.5, fontWeight: isW ? 900 : isM ? 700 : 500,
                            border: isW ? '1px solid #fcd34d' : isFree && !isM ? '1px solid rgba(245,197,24,0.4)' : 'none',
                            boxShadow: isW ? '0 0 6px rgba(245,158,11,0.6)' : 'none',
                            transition: 'background 0.15s',
                          }}>
                            {val ? <span style={{ fontSize: '6.5px' }}>{val}</span> : isFree ? <span style={{ fontSize: '7.5px' }}>★</span> : ''}
                            {isFree && val ? <span style={{ fontSize: '5px', opacity: 0.7 }}>●</span> : ''}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : isWatching ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#4a6080', textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>👁</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Watching</div>
              </div>
            ) : (
              Array.from({ length: 2 }, (_, i) => (
                <div key={i} style={{ width: '100%', maxWidth: 220, background: '#132033', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', padding: '10px 8px', opacity: 0.4 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2, marginBottom: 4 }}>
                    {COLS.map((c, ci) => <div key={c} style={{ height: 20, borderRadius: 3, background: HDR[ci], opacity: 0.5 }} />)}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2 }}>
                    {Array.from({ length: 25 }, (_, j) => <div key={j} style={{ height: 28, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />)}
                  </div>
                </div>
              ))
            )}
            {claimError && <div style={{ color: '#f87171', fontSize: 11, textAlign: 'center', padding: '4px 0' }}>{claimError}</div>}
          </div>
        </div>
      </div>

      {/* ── WINNER OVERLAY ── */}
      {game.phase === 'won' && game.winnerInfo && (() => {
        const wi = game.winnerInfo;
        const winCartelaNum = wi.winners[0]?.cartelaNumber ?? null;
        const winGrid: number[] = winnerCartelaGrid.length > 0
          ? winnerCartelaGrid
          : (allCartelas.find(c => c.cartelaNumber === winCartelaNum)?.cartelaGrid ?? []) as number[];
        const winCells = winCellsForGrid(winGrid);
        const shown = wi.winners.slice(0, 2);
        const extra = wi.winners.length - shown.length;
        const primaryWinner = shown[0];

        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'radial-gradient(ellipse at 50% 0%, rgba(80,113,170,0.26) 0%, rgba(9,14,26,0.98) 48%, #070d18 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            boxSizing: 'border-box',
            color: '#f8fafc',
            padding: '10px',
          }}>
            <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  fontSize: 28, fontWeight: 900, lineHeight: 1,
                  color: '#f7c84d', textShadow: '0 0 14px rgba(247,200,77,0.6)',
                  marginBottom: 3,
                }}>🏆 BINGO! 🏆</div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 11, color: '#f8fafc' }}>
                  <span>{wi.winnerCount} WINNER{wi.winnerCount !== 1 ? 'S' : ''}!</span>
                </div>
              </div>

              {primaryWinner && (
                <div style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 6, padding: '5px 8px', background: 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(59,130,246,0.2))',
                  border: '1px solid rgba(96,165,250,0.4)', borderRadius: 7,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'linear-gradient(135deg, #d946ef, #ec4899)', fontWeight: 900, fontSize: 12,
                      color: '#fff',
                    }}>{(primaryWinner.username ?? '?')[0]?.toUpperCase()}</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.1 }}>{primaryWinner.username}</div>
                      <div style={{ fontSize: 9, color: '#dbeafe' }}>Cartela #{primaryWinner.cartelaNumber}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 16 }}>🏆</div>
                </div>
              )}

              <div style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 8px', background: 'rgba(14, 50, 38, 0.7)',
                border: '1.5px solid rgba(52,211,153,0.7)', borderRadius: 7,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 9, letterSpacing: 0.3, color: '#4ade80' }}>
                  <span style={{ fontSize: 11 }}>🏆</span>
                  <span>WINNING CARTELA</span>
                </div>
                <div style={{
                  minWidth: 34, padding: '2px 5px', borderRadius: 4,
                  background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.2)',
                  color: '#fcd34d', fontWeight: 900, textAlign: 'center', fontSize: 9,
                }}>#{winCartelaNum}</div>
              </div>

              {winGrid.length > 0 && (
                <div style={{
                  width: '100%', maxWidth: 280, margin: '0 auto',
                  background: 'linear-gradient(180deg, rgba(17,25,44,0.9), rgba(12,20,34,0.9))',
                  border: '1.5px solid rgba(52,211,153,0.6)', borderRadius: 8, overflow: 'hidden',
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 0.5, padding: '3px 3px 0.5px' }}>
                    {COLS.map((col, ci) => (
                      <div key={col} style={{
                        textAlign: 'center', padding: '1px 0', borderRadius: 2,
                        fontWeight: 700, fontSize: 8, background: HDR[ci], color: '#fff',
                      }}>{col}</div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 0.5, padding: '0.5px 3px 3px' }}>
                    {winGrid.map((val, idx) => {
                      const isFree = idx === 12;
                      const isM = isFree || (val !== 0 && marked.has(val));
                      const isW = winCells.has(idx);
                      return (
                        <div key={idx} style={{
                          aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 3, fontWeight: isW ? 700 : isM ? 600 : 500,
                          color: isW || isM ? '#fff' : '#52657d',
                          background: isW
                            ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                            : isM
                              ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                              : 'rgba(255,255,255,0.04)',
                          border: isW ? '1px solid #fcd34d' : '0.5px solid rgba(255,255,255,0.05)',
                          boxShadow: isW ? '0 0 8px rgba(245,158,11,0.7)' : 'none',
                          fontSize: 8,
                        }}>
                          {isFree ? '★' : val}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {game.derash > 0 && (
                <div style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 4, padding: '5px 8px',
                  background: 'rgba(251,146,60,0.15)', border: '1.5px solid rgba(251,146,60,0.7)',
                  borderRadius: 7,
                }}>
                  <span style={{ fontSize: 13 }}>💰</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: '#fbbf24', letterSpacing: 0.5 }}>{Math.round(game.derash)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>Birr</span>
                </div>
              )}

              {nextCountdown !== null && (
                <div style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 4, padding: '5px 8px', borderRadius: 7,
                  background: 'linear-gradient(135deg, rgba(30,64,175,0.3), rgba(59,130,246,0.15))',
                  border: '1.5px solid rgba(96,165,250,0.6)', color: '#dbeafe', fontSize: 10, fontWeight: 700,
                }}>
                  <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 5px rgba(74,222,128,0.7)' }} />
                  <span>Next in</span>
                  <span style={{ color: '#f8fafc', fontWeight: 900 }}>{nextCountdown}s</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── VOID / CANCELLED ── */}
      {(game.phase === 'void' || game.phase === 'cancelled') && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'linear-gradient(135deg, rgba(10,14,26,0.98) 0%, rgba(30,20,20,0.98) 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
          <div style={{ fontSize: 56, marginBottom: 8, animation: 'winnerPulse 0.8s ease-in-out infinite' }}>{game.phase === 'void' ? '🔄' : '⚠️'}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', textAlign: 'center', letterSpacing: 0.5 }}>{game.endMessage}</div>
          {nextCountdown !== null && nextCountdown > 0 && (
            <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 12, fontWeight: 600 }}>Returning in {nextCountdown}s…</div>
          )}
        </div>
      )}
    </div>
  );
}
