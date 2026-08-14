import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket } from '../lib/socket';
import { getRound, getMyCartelas, getRounds, getCalledNumbers, getCartelaGridCached } from '../lib/api';
import { idbGet, idbPut } from '../lib/idb';
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

const COLS = ['B', 'I', 'N', 'G', 'O'];
const COL_COLORS = [
  '#60a5fa',
  '#2dd4bf',
  '#8b5cf6',
  '#f4b942',
  '#f87171',
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
  // Keep a ref in sync so socket handlers always read the latest value
  const soundOnRef = useRef(soundOn);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

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
  const [showSyncBanner, setShowSyncBanner] = useState(false);
  const lastUpdateRef = useRef<number>(Date.now());
  const bannerShownRef = useRef(false);

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
    async function load() {
      try {
        // Fetch round and called numbers immediately — don't block on cartelas
        const [r, calledNums] = await Promise.all([
          getRound(roundId!),
          getCalledNumbers(roundId!).catch(() => [] as number[]),
        ]);
        setRound(r);

        // Drain any NUMBER_CALLED events that arrived during the REST fetch.
        // Sort by sequenceIndex so the order is authoritative, then deduplicate
        // against what the REST response already contains.
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
          phase:
            r.status === 'active' ? 'active'
            : r.status === 'completed' ? 'won'
            : r.status === 'void' ? 'void'
            : r.status === 'cancelled' ? 'cancelled'
            : 'waiting',
        }));

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
                const idb = await idbGet<{ cartela_number: number; grid: number[] }>('cartelas', `${roundId}:${num}`);
                if (idb) return { cartelaNumber: num, cartelaGrid: idb.grid };
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
    socket.emit('JOIN_ROUND', { roundId, token: localStorage.getItem('jwt') ?? '' });

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
      setGame((g) => ({ ...g, phase: 'active', derash: p.derash, playerCount: p.playerCount }));
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

  // ─── Fallback poll while waiting — catches rounds that started before we connected ──
  useEffect(() => {
    if (game.phase !== 'waiting' || !roundId) return;
    const iv = setInterval(async () => {
      try {
        const r = await getRound(roundId);
        if (r.status === 'active') {
          const nums = await getCalledNumbers(roundId);
          const calledSet = new Set(nums);
          const last = nums[nums.length - 1] ?? null;
          setGame((g) => ({
            ...g,
            phase: 'active',
            derash: r.derash,
            playerCount: r.player_count,
            calledNumbers: calledSet,
            calledOrder: nums,
            lastCalled: last ?? g.lastCalled,
          }));
        } else if (r.status === 'void' || r.status === 'cancelled' || r.status === 'completed') {
          setGame((g) => ({
            ...g,
            phase: r.status === 'completed' ? 'won' : r.status as 'void' | 'cancelled',
            endMessage: r.status === 'void' ? 'No winner — stake refunded.' : 'Round cancelled.',
          }));
        }
      } catch {}
    }, 3000);
    return () => clearInterval(iv);
  }, [game.phase, roundId]);
  useEffect(() => {
    if (game.phase !== 'won' && game.phase !== 'void' && game.phase !== 'cancelled') return;
    // Won: show winner cartela for 5 seconds then navigate
    // Void/cancelled: navigate after 3 seconds
    const delay = game.phase === 'won' ? 10 : 3;
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
  function hasWinForGrid(g: number[]) {
    if (!g.length) return false;
    // Any single row
    for (let r = 0; r < 5; r++) if ([0,1,2,3,4].every((c) => isMarkedForGrid(g, r*5+c))) return true;
    // Any single column
    for (let c = 0; c < 5; c++) if ([0,1,2,3,4].every((r) => isMarkedForGrid(g, r*5+c))) return true;
    // Diagonals
    if ([0,6,12,18,24].every((i) => isMarkedForGrid(g, i))) return true;
    if ([4,8,12,16,20].every((i) => isMarkedForGrid(g, i))) return true;
    // 4 corners
    if ([0,4,20,24].every((i) => isMarkedForGrid(g, i))) return true;
    return false;
  }
  function winCellsForGrid(g: number[]) {
    const w = new Set<number>();
    if (!g.length) return w;
    for (let r = 0; r < 5; r++) if ([0,1,2,3,4].every((c) => isMarkedForGrid(g, r*5+c))) [0,1,2,3,4].forEach((c) => w.add(r*5+c));
    for (let c = 0; c < 5; c++) if ([0,1,2,3,4].every((r) => isMarkedForGrid(g, r*5+c))) [0,1,2,3,4].forEach((r) => w.add(r*5+c));
    if ([0,6,12,18,24].every((i) => isMarkedForGrid(g, i))) [0,6,12,18,24].forEach((i) => w.add(i));
    if ([4,8,12,16,20].every((i) => isMarkedForGrid(g, i))) [4,8,12,16,20].forEach((i) => w.add(i));
    if ([0,4,20,24].every((i) => isMarkedForGrid(g, i))) [0,4,20,24].forEach((i) => w.add(i));
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

  const lastCol = game.lastCalled ? getColLabel(game.lastCalled) : null;
  void lastCol; // kept for potential future use
  const gameEnded = game.phase === 'won' || game.phase === 'void' || game.phase === 'cancelled';

  // Detect stuck game (no updates for 20 seconds)
  useEffect(() => {
    // Update lastUpdate whenever game state changes (called numbers, phase change, etc)
    lastUpdateRef.current = Date.now();
    bannerShownRef.current = false;
    setShowSyncBanner(false);
  }, [game.calledOrder.length, game.phase, game.playerCount]);

  useEffect(() => {
    // Only run detection during active gameplay
    if (game.phase !== 'active' || gameEnded) {
      if (bannerShownRef.current) {
        bannerShownRef.current = false;
        setShowSyncBanner(false);
      }
      return;
    }

    const updateTimer = setInterval(() => {
      const timeSinceUpdate = Date.now() - lastUpdateRef.current;
      const shouldShow = timeSinceUpdate > 20000;
      
      // Only update state if visibility actually changes
      if (shouldShow && !bannerShownRef.current) {
        bannerShownRef.current = true;
        setShowSyncBanner(true);
      } else if (!shouldShow && bannerShownRef.current) {
        bannerShownRef.current = false;
        setShowSyncBanner(false);
      }
    }, 1000);

    return () => clearInterval(updateTimer);
  }, [game.phase, gameEnded]);

  return (
    <div style={{ height: '100dvh', background: 'linear-gradient(180deg, #0b1220 0%, #111827 100%)', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(180deg, rgba(10,14,22,0.96) 0%, rgba(15,23,42,0.92) 100%)', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(148,163,184,0.08)', boxShadow: '0 4px 12px rgba(0,0,0,0.18)', flexShrink: 0 }}>
        <span style={{ cursor: 'pointer', fontSize: 20, color: '#f8fafc' }} onClick={() => { sessionStorage.removeItem('selectedStake'); sessionStorage.removeItem('stakeSelectedForRound'); navigate('/'); }}>✕</span>
        <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: 1, color: '#f8fafc' }}>Fidel Bingo</span>
        <button onClick={toggleSound} style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: 18, cursor: 'pointer' }}>
          {soundOn ? '🔊' : '🔇'}
        </button>
      </div>

      {/* ── Sync/Refresh banner — shows when game is stuck ────────────────── */}
      {showSyncBanner && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(217,119,6,0.1) 100%)',
          border: '1.5px solid rgba(245,158,11,0.3)',
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
          gap: 12,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#fbbf24', flex: 1 }}>
            ⚠️ Connection may be unstable
          </span>
          <button
            onClick={handleRefresh}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 6,
              border: 'none',
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              color: '#0f172a',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(251,191,36,0.3)',
              transition: 'all 0.2s ease',
            }}
          >
            ↻ Sync
          </button>
        </div>
      )}

      {/* ── Stats row ───────────────────────────────────────────────────────── */}
      <div style={{ background: 'rgba(15,23,42,0.75)', display: 'flex', borderBottom: '1px solid rgba(148,163,184,0.08)', flexShrink: 0 }}>
        {[
          { label: 'Game ID', value: round.id.slice(-8).toUpperCase() },
          { label: 'Players', value: game.playerCount },
          { label: 'Bet', value: round.stake },
          { label: 'Derash', value: Math.round(game.derash) },
          { label: 'Called', value: game.calledNumbers.size },
        ].map(({ label, value }) => (
          <div key={label} style={{ flex: 1, padding: '8px 4px', textAlign: 'center', borderRight: '1px solid rgba(148,163,184,0.12)', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontSize: 9, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2, color: '#f8fafc' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Main split layout ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT: Full 1-75 bingo board */}
        <div style={{ flexShrink: 0, width: '46%', borderRight: '1px solid rgba(148,163,184,0.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'linear-gradient(180deg, rgba(15,23,42,0.9) 0%, rgba(15,23,42,0.7) 100%)' }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', flexShrink: 0, gap: 1, padding: '4px 2px 3px' }}>
            {COLS.map((c, i) => (
              <div key={c} style={{ background: 'linear-gradient(180deg, ' + COL_COLORS[i] + ' 0%, rgba(15,23,42,0.82) 100%)', textAlign: 'center', padding: '5px 0', fontWeight: 900, fontSize: 12, borderRadius: 4, minWidth: 0 }}>{c}</div>
            ))}
          </div>
          {/* Numbers 1-75 in 5 columns (B=1-15, I=16-30, N=31-45, G=46-60, O=61-75), row by row */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gridAutoRows: '1fr', gap: 1, padding: '2px', background: 'rgba(2,6,23,0.24)' }}>
            {Array.from({ length: 15 }, (_, rowIdx) =>
              Array.from({ length: 5 }, (_, colIdx) => {
                const num = colIdx * 15 + 1 + rowIdx;
                const called = game.calledNumbers.has(num);
                const isLast = num === game.lastCalled;
                return (
                  <div key={num} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 0, minHeight: 0,
                    background: isLast ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : called ? 'linear-gradient(135deg, rgba(59,130,246,0.34) 0%, rgba(37,99,235,0.22) 100%)' : 'linear-gradient(180deg, rgba(30,41,59,0.96) 0%, rgba(15,23,42,0.84) 100%)',
                    color: isLast || called ? '#f8fafc' : '#cbd5e1',
                    border: isLast ? '2px solid rgba(255,255,255,0.9)' : called ? '1px solid rgba(96,165,250,0.35)' : '1px solid rgba(148,163,184,0.12)',
                    borderRadius: 4,
                    fontWeight: isLast ? 900 : called ? 800 : 600,
                    fontSize: 10,
                    transition: 'background 0.2s ease',
                    boxShadow: isLast ? '0 0 20px rgba(251,191,36,0.45)' : 'none',
                  }}>
                    {num}
                  </div>
                );
              })
            ).flat()}
          </div>
        </div>

        {/* RIGHT: Called number + cartela or watching panel */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ── Last Called — big prominent display ── */}
          <div style={{ padding: '6px 8px 4px', borderBottom: '1px solid rgba(148,163,184,0.12)', flexShrink: 0, textAlign: 'center', background: 'rgba(15,23,42,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 9, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Last Called</span>
              <button onClick={toggleSound} style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: 13, cursor: 'pointer' }}>
                {soundOn ? '🔊' : '🔇'}
              </button>
            </div>
            {game.lastCalled ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: 'linear-gradient(180deg, ' + COL_COLORS[getColIndex(game.lastCalled)] + ' 0%, rgba(15,23,42,0.8) 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 14, color: '#fff', flexShrink: 0,
                  boxShadow: '0 6px 12px rgba(15,23,42,0.2)',
                }}>
                  {getColLabel(game.lastCalled)}
                </div>
                <div style={{
                  fontSize: 48, fontWeight: 900, lineHeight: 1,
                  color: '#f8fafc',
                  textShadow: '0 0 12px rgba(148,163,184,0.4)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {game.lastCalled}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#64748b', padding: '8px 0' }}>
                {game.phase === 'waiting' ? 'Starting...' : '—'}
              </div>
            )}
          </div>

          {/* ── Called Numbers — scrollable history strip ── */}
          <div style={{ borderBottom: '1px solid rgba(148,163,184,0.12)', flexShrink: 0, padding: '6px 6px 4px', background: 'rgba(15,23,42,0.4)' }}>
            <div style={{ fontSize: 9, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3, fontWeight: 700 }}>
              Called ({game.calledOrder.length}/75)
            </div>
            <div style={{
              display: 'flex', gap: 3, overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              paddingBottom: 2,
              scrollbarWidth: 'none',
            }}>
              {game.calledOrder.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: 10, padding: '4px 0' }}>—</div>
              ) : (
                [...game.calledOrder].reverse().map((num, idx) => {
                  const isNewest = idx === 0;
                  const col = getColIndex(num);
                  return (
                    <div key={`h-${num}-${idx}`} style={{
                      flexShrink: 0,
                      width: 26, height: 26, borderRadius: '50%',
                      background: isNewest ? 'linear-gradient(135deg, ' + COL_COLORS[col] + ' 0%, rgba(15,23,42,0.9) 100%)' : 'rgba(148,163,184,0.16)',
                      border: `1px solid ${isNewest ? 'rgba(255,255,255,0.18)' : 'rgba(148,163,184,0.12)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: isNewest ? 900 : 600,
                      color: isNewest ? '#fff' : '#cbd5e1',
                      boxShadow: isNewest ? '0 0 12px rgba(251,191,36,0.2)' : 'none',
                    }}>
                      {num}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* REMOVED: Duplicate fixed modal - using only the flex container below */}

          {game.phase === 'won' && game.winnerInfo && (() => {
            const wi = game.winnerInfo;
            const displayWinner = wi.winners[0];
            const winCartelaNumber = displayWinner?.cartelaNumber ?? null;

            const winGrid: number[] = winnerCartelaGrid.length > 0
              ? winnerCartelaGrid
              : (allCartelas.find(c => c.cartelaNumber === winCartelaNumber)?.cartelaGrid ?? []) as number[];
            const winCells = winCellsForGrid(winGrid);

            const MAX_VISIBLE_WINNERS = 3;
            const visibleWinners = wi.winners.slice(0, MAX_VISIBLE_WINNERS);
            const hiddenCount = wi.winners.length - visibleWinners.length;

            return (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
                padding: '24px 16px', overflowY: 'auto',
                background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f2e 100%)',
              }}>
                {/* Crown badge with animation */}
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #f59e0b 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 44, marginBottom: 16,
                  boxShadow: '0 0 40px rgba(245,158,11,0.6), inset 0 0 20px rgba(255,255,255,0.2)',
                  animation: 'bounce 1s ease-in-out 3',
                  border: '2px solid rgba(255,255,255,0.15)',
                }}>
                  👑
                </div>

                {/* BINGO! with professional gradient */}
                <div style={{ 
                  fontSize: 48, fontWeight: 900, letterSpacing: 3, marginBottom: 8,
                  background: 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 50%, #f59e0b 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  textShadow: '0 0 20px rgba(245,158,11,0.3)',
                }}>
                  BINGO!
                </div>

                {/* Winner count with celebration */}
                <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 24 }}>
                  🎉 {wi.winnerCount} winner{wi.winnerCount !== 1 ? 's' : ''}!
                </div>

                {/* Winner pills - professional styling with consistent design */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 380, marginBottom: 28 }}>
                  {visibleWinners.map((w, idx) => (
                    <div key={w.playerId} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(59,130,246,0.1) 100%)',
                      border: '1.5px solid rgba(139,92,246,0.3)',
                      borderRadius: 12, padding: '12px 16px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                      animation: `slideIn 0.5s ease-out ${idx * 0.1}s both`,
                      transition: 'all 0.3s ease',
                    }}>
                      {/* Avatar circle */}
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #5b21b6 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 900, fontSize: 16, color: '#fff', flexShrink: 0,
                        textTransform: 'uppercase', boxShadow: '0 0 16px rgba(139,92,246,0.4)',
                      }}>
                        {(w.username ?? '?')[0]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9', display: 'block' }}>
                          {w.username}
                        </span>
                        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
                          Cartela #{w.cartelaNumber}
                        </span>
                      </div>
                      <div style={{ fontSize: 18, animation: 'pulse 2s ease-in-out infinite' }}>⭐</div>
                    </div>
                  ))}
                  {hiddenCount > 0 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: 'linear-gradient(135deg, rgba(71,85,105,0.15) 0%, rgba(51,65,85,0.1) 100%)',
                      border: '1.5px solid rgba(71,85,105,0.3)',
                      borderRadius: 12, padding: '12px 16px',
                      color: '#cbd5e1', fontSize: 14, fontWeight: 600,
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(59,130,246,0.15) 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, boxShadow: '0 0 12px rgba(139,92,246,0.2)',
                      }}>👥</div>
                      <span>+{hiddenCount} more winner{hiddenCount !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>

                {/* Winning cartela card - professional styling */}
                {winGrid.length > 0 && (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(16,185,129,0.1) 100%)',
                    border: '1.5px solid rgba(34,197,94,0.4)',
                    borderRadius: 12, overflow: 'hidden',
                    width: '100%', maxWidth: 200,
                    marginBottom: 20,
                    boxShadow: '0 8px 24px rgba(34,197,94,0.15)',
                    animation: 'scaleIn 0.6s ease-out',
                  }}>
                    {/* Trophy header */}
                    <div style={{ 
                      textAlign: 'center', padding: '10px 0 6px', 
                      fontWeight: 800, fontSize: 11, color: '#22c55e', 
                      background: 'rgba(34,197,94,0.1)',
                      borderBottom: '1px solid rgba(34,197,94,0.2)',
                    }}>
                      🏆 Winning Cartela
                    </div>
                    <div style={{ 
                      textAlign: 'center', padding: '6px 0 8px', 
                      fontWeight: 700, fontSize: 13, color: '#f1f5f9',
                    }}>
                      #{winCartelaNumber}
                    </div>

                    {/* Column headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
                      {COLS.map((c, i) => (
                        <div key={c} style={{
                          background: COL_COLORS[i], textAlign: 'center',
                          padding: '4px 0', fontWeight: 900, fontSize: 10, color: '#fff',
                        }}>{c}</div>
                      ))}
                    </div>

                    {/* Grid cells */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, padding: 6 }}>
                      {winGrid.map((val, idx) => {
                        const isFree = idx === 12;
                        const isMarkedCell = isFree || (val !== 0 && marked.has(val));
                        const isWinCell = winCells.has(idx);

                        let bg = 'rgba(255,255,255,0.06)';
                        let color = '#cbd5e1';
                        let border = '1px solid rgba(255,255,255,0.08)';

                        if (isWinCell) { 
                          bg = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'; 
                          color = '#fff'; 
                          border = 'none';
                        } else if (isMarkedCell) { 
                          bg = COL_COLORS[idx % 5]!; 
                          color = '#fff';
                          border = 'none';
                        }

                        return (
                          <div key={idx} style={{
                            aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: bg, color, borderRadius: 4, border,
                            fontSize: 9, fontWeight: isWinCell ? 900 : isMarkedCell ? 800 : 500,
                            boxShadow: isWinCell ? '0 0 8px rgba(34,197,94,0.6)' : 'none',
                            transition: 'all 0.3s ease',
                          }}>
                            {isFree ? '★' : val}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Derash display - professional styling */}
                {game.derash > 0 && (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(217,119,6,0.1) 100%)',
                    border: '1.5px solid rgba(245,158,11,0.3)',
                    borderRadius: 12, padding: '12px 20px',
                    textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#fbbf24',
                    marginBottom: 16, width: '100%', maxWidth: 300,
                    boxShadow: '0 4px 12px rgba(245,158,11,0.15)',
                  }}>
                    💰 Derash: {game.derash} Birr
                  </div>
                )}

                {/* Next round countdown */}
                {nextCountdown !== null && nextCountdown > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(16,185,129,0.1) 100%)',
                    border: '1.5px solid rgba(34,197,94,0.3)',
                    borderRadius: 12, padding: '10px 18px',
                    fontSize: 13, color: '#22c55e', fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(34,197,94,0.15)',
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px #22c55e', animation: 'pulse 1.5s ease-in-out infinite' }} />
                    Auto-starting in {nextCountdown}s
                  </div>
                )}
                {nextCountdown === 0 && (
                  <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, background: '#fbbf24', borderRadius: '50%', animation: 'pulse 1.5s ease-in-out infinite' }} />
                    Finding next round...
                  </div>
                )}

                <style>{`
                  @keyframes bounce { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
                  @keyframes slideIn { 0% { opacity: 0; transform: translateX(-20px); } 100% { opacity: 1; transform: translateX(0); } }
                  @keyframes scaleIn { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
                  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                `}</style>
              </div>
            );
          })()}

          {(game.phase === 'void' || game.phase === 'cancelled') && (
            <div style={{ background: game.phase === 'void' ? 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(220,38,38,0.1) 100%)' : 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(139,92,246,0.1) 100%)', padding: '16px', textAlign: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0, border: `1.5px solid ${game.phase === 'void' ? 'rgba(239,68,68,0.3)' : 'rgba(168,85,247,0.3)'}`, margin: '8px', borderRadius: 12, color: game.phase === 'void' ? '#fca5a5' : '#d8b4fe' }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>{game.phase === 'void' ? '🔄' : '⚠️'}</div>
              {game.endMessage}
            </div>
          )}

          {/* Next round countdown (non-won phases) */}
          {nextCountdown !== null && game.phase !== 'won' && (
            <div style={{ background: 'linear-gradient(180deg, rgba(30,41,59,0.9) 0%, rgba(15,23,42,0.9) 100%)', borderTop: '1px solid rgba(148,163,184,0.08)', padding: '8px', textAlign: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, color: '#cbd5e1' }}>
              {nextCountdown > 0 ? `Next round in ${nextCountdown}s` : 'Finding next round...'}
            </div>
          )}

          {/* Cartela cards — scrollable, each cartela fully visible */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 3px', display: 'flex', flexDirection: 'column', gap: 6, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
            {!isWatching && allCartelas.length > 0 ? (
              <>
                {allCartelas.map((cartela) => {
                  const cartelaGrid: number[] = (cartela.cartelaGrid ?? []) as number[];
                  const cartelaWinCells = winCellsForGrid(cartelaGrid);
                  const cartelaHasWin = hasWinForGrid(cartelaGrid);
                  return (
                    <div key={cartela.cartelaNumber} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(17,24,39,0.86) 100%)', border: '1px solid rgba(245,158,11,0.12)', borderRadius: 10, padding: '6px 4px 4px', boxShadow: '0 8px 18px rgba(15,23,42,0.2)' }}>
                      <div style={{ textAlign: 'center', fontSize: 8, fontWeight: 900, color: '#fbbf24', marginBottom: 2, flexShrink: 0, letterSpacing: '0.04em' }}>
                        #{cartela.cartelaNumber}{cartelaHasWin && <span style={{ marginLeft: 4, color: '#34d399' }}>✓ BINGO</span>}
                      </div>
                      <div style={{ height: 2, flexShrink: 0 }} />
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, marginBottom: 1, flexShrink: 0 }}>
                        {COLS.map((c, i) => (
                          <div key={c} style={{
                            background: 'linear-gradient(180deg, ' + COL_COLORS[i] + ' 0%, rgba(15,23,42,0.82) 100%)', textAlign: 'center',
                            borderRadius: 2, padding: '2px 0',
                            fontWeight: 900, fontSize: 8, color: '#fff',
                          }}>{c}</div>
                        ))}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2 }}>
                        {cartelaGrid.length > 0 ? cartelaGrid.map((val, idx) => {
                          const isFree = idx === 12;
                          const colIdx = idx % 5;
                          const m = isFree || (val !== 0 && marked.has(val));
                          const wl = cartelaWinCells.has(idx);
                          return (
                            <div key={idx} style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              aspectRatio: '1',
                              background: wl
                                ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
                                : m
                                ? 'linear-gradient(135deg, rgba(59,130,246,0.34) 0%, rgba(37,99,235,0.22) 100%)'
                                : 'linear-gradient(180deg, rgba(30,41,59,0.96) 0%, rgba(15,23,42,0.84) 100%)',
                              color: wl ? '#0f172a' : m ? '#f8fafc' : '#e2e8f0',
                              borderRadius: 3,
                              fontSize: 11,
                              fontWeight: 900,
                              border: wl ? '2px solid rgba(255,255,255,0.9)' : m ? '1px solid rgba(96,165,250,0.35)' : '1px solid rgba(148,163,184,0.12)',
                              boxShadow: wl ? '0 0 10px rgba(251,191,36,0.5)' : m ? 'inset 0 1px 0 rgba(255,255,255,0.04)' : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                              transition: 'background 0.2s',
                            }}>
                              {isFree ? '★' : val}
                            </div>
                          );
                        }) : (
                          Array.from({ length: 25 }).map((_, idx) => (
                            <div key={idx} style={{ background: 'linear-gradient(180deg, rgba(30,41,59,0.9) 0%, rgba(15,23,42,0.7) 100%)', borderRadius: 3, aspectRatio: '1', border: '1px solid rgba(148,163,184,0.12)' }} />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
                {game.phase === 'active' && playerHasBingo && (
                  <div style={{ padding: '10px', background: claimPending ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 900, textAlign: 'center', flexShrink: 0, boxShadow: claimPending ? '0 0 20px rgba(245,158,11,0.4)' : '0 0 20px rgba(34,197,94,0.4)', animation: 'pulse 1s ease-in-out infinite' }}>
                    {claimPending ? '⏳ Claiming…' : '🎉 BINGO! 🎉'}
                  </div>
                )}
                {claimError && <div style={{ color: '#fca5a5', fontSize: 10, textAlign: 'center', flexShrink: 0 }}>{claimError}</div>}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>Watching Only</div>
                <div style={{ fontSize: 12, color: '#a5b4fc', lineHeight: 1.8 }}>
                  የዚህ ዙር ጨዋታ<br />
                  ተጀምሯል። አዲስ ዙር<br />
                  እስኪጀምር አዚሁ<br />
                  ይጠብቁ።
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
