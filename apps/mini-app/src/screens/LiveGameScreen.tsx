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

      {/* ── HEADER ── */}
      <div style={{ background: '#132033', borderBottom: '1px solid rgba(255,255,255,0.09)', padding: '11px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button type="button" onClick={() => { sessionStorage.removeItem('selectedStake'); sessionStorage.removeItem('stakeSelectedForRound'); navigate('/'); }}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1, opacity: 0.85 }}>✕</button>
        <span style={{ fontWeight: 900, fontSize: 18, color: '#ffffff', letterSpacing: 0.3 }}>Fidel Bingo</span>
        <button type="button" onClick={toggleSound}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', padding: 0, opacity: 0.85 }}>
          {soundOn ? '🔊' : '🔇'}
        </button>
      </div>

      {/* ── STATS ROW ── */}
      <div style={{ background: '#132033', borderBottom: '1px solid rgba(255,255,255,0.09)', flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)' }}>
        {[
          { label: 'GAME ID',  value: round.id.slice(-8).toUpperCase() },
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

      {/* ── MAIN: LEFT board + RIGHT panel ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ══ LEFT: 1–75 bingo board ══ */}
        <div style={{ width: '44%', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid rgba(255,255,255,0.08)', background: '#0d1a2d' }}>

          {/* B I N G O headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2, padding: '4px 3px 2px', flexShrink: 0 }}>
            {COLS.map((c, ci) => (
              <div key={c} style={{ textAlign: 'center', padding: '5px 0', borderRadius: 5, fontWeight: 900, fontSize: 13, background: HDR[ci], color: '#fff', letterSpacing: 0.5 }}>{c}</div>
            ))}
          </div>

          {/* Numbers 1–75: row-by-row under each column header */}
          {/* Row 0: 1,16,31,46,61 | Row 1: 2,17,32,47,62 | ... | Row 14: 15,30,45,60,75 */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gridTemplateRows: 'repeat(15,1fr)', gap: 2, padding: '2px 3px 3px' }}>
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
                    aspectRatio: '1', transition: 'background 0.18s',
                    boxShadow: isLast ? '0 0 10px rgba(245,197,24,0.6)' : 'none',
                  } as React.CSSProperties}>
                    {num}
                  </div>
                );
              })
            ).flat()}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: HDR[getColIndex(game.lastCalled)],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 16, color: '#fff',
                }}>
                  {getColLabel(game.lastCalled)}
                </div>
                <div style={{ fontSize: 56, fontWeight: 900, color: '#ffffff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
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
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px 12px', display: 'flex', flexDirection: 'column', gap: 10, scrollbarWidth: 'none' }}>
            {!isWatching && allCartelas.length > 0 ? (
              allCartelas.map((cartela, cardIdx) => {
                const cGrid = cartela.cartelaGrid as number[];
                const winCells = winCellsForGrid(cGrid);
                const hasBingo = hasWinForGrid(cGrid);
                return (
                  <div key={cartela.cartelaNumber} style={{ flexShrink: 0, background: '#132033', borderRadius: 10, overflow: 'hidden', border: hasBingo ? '1.5px solid #22c55e' : '1px solid rgba(255,255,255,0.09)' }}>
                    {/* Card label */}
                    <div style={{ padding: '5px 10px', background: '#0d1a2d', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#f5c518', letterSpacing: 0.5 }}>#{cartela.cartelaNumber}</span>
                      {hasBingo && <span style={{ fontSize: 9, fontWeight: 700, color: '#22c55e' }}>✓ BINGO</span>}
                      {game.phase === 'active' && claimPending && hasBingo && <span style={{ fontSize: 9, color: '#f59e0b' }}>⏳ Claiming…</span>}
                    </div>

                    {/* BINGO column headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2, padding: '5px 5px 2px' }}>
                      {COLS.map((c, ci) => (
                        <div key={c} style={{ textAlign: 'center', padding: '3px 0', borderRadius: 4, fontWeight: 900, fontSize: 10, background: HDR[ci], color: '#fff' }}>{c}</div>
                      ))}
                    </div>

                    {/* 5×5 grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2, padding: '2px 5px 5px' }}>
                      {cGrid.map((val, idx) => {
                        const isFree = idx === 12;
                        const ci = idx % 5;
                        const isM = isFree || (val !== 0 && marked.has(val));
                        const isW = winCells.has(idx);
                        return (
                          <div key={idx} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            height: 34, borderRadius: 5,
                            background: isW ? '#22c55e' : isM ? `${HDR[ci]}cc` : 'rgba(255,255,255,0.05)',
                            color: isW || isM ? '#fff' : '#4a6080',
                            fontSize: 11, fontWeight: isW ? 900 : isM ? 800 : 500,
                            border: isFree && !isM ? '1.5px solid rgba(245,197,24,0.4)' : 'none',
                            transition: 'background 0.15s',
                          }}>
                            {isFree ? '★' : val}
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
                <div key={i} style={{ background: '#132033', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', padding: '10px 8px', opacity: 0.4 }}>
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
        const shown = wi.winners.slice(0, 3);
        const extra = wi.winners.length - shown.length;
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,14,26,0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', padding: '24px 18px 36px' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, marginBottom: 12, boxShadow: '0 0 32px rgba(245,158,11,0.5)' }}>👑</div>
            <div style={{ fontSize: 44, fontWeight: 900, color: '#f59e0b', letterSpacing: 3, marginBottom: 6 }}>BINGO!</div>
            <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 22 }}>🎉 {wi.winnerCount} winner{wi.winnerCount !== 1 ? 's' : ''}!</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 360, marginBottom: 24 }}>
              {shown.map((w) => (
                <div key={w.playerId} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#132033', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '11px 14px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15, color: '#fff', flexShrink: 0 }}>{(w.username ?? '?')[0]?.toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{w.username}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>#{w.cartelaNumber}</div>
                  </div>
                </div>
              ))}
              {extra > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#132033', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '10px 14px', color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>
                  <span style={{ fontSize: 18 }}>👥</span>+{extra} more
                </div>
              )}
            </div>
            {winGrid.length > 0 && (
              <div style={{ background: '#132033', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 12, overflow: 'hidden', width: '100%', maxWidth: 300, marginBottom: 20 }}>
                <div style={{ padding: '8px 12px', background: '#0d1a2d', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: 11, fontWeight: 700, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 6 }}>
                  🏆 Winning Cartela : {winCartelaNum}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2, padding: '5px 5px 2px' }}>
                  {COLS.map((c, ci) => (
                    <div key={c} style={{ textAlign: 'center', padding: '4px 0', borderRadius: 4, fontWeight: 900, fontSize: 11, background: HDR[ci], color: '#fff' }}>{c}</div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2, padding: '2px 5px 6px' }}>
                  {winGrid.map((val, idx) => {
                    const isFree = idx === 12;
                    const ci = idx % 5;
                    const isM = isFree || (val !== 0 && marked.has(val));
                    const isW = winCells.has(idx);
                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 38, borderRadius: 5, fontSize: 12, fontWeight: isW ? 900 : isM ? 800 : 500, background: isW ? '#22c55e' : isM ? `${HDR[ci]}cc` : 'rgba(255,255,255,0.05)', color: isW || isM ? '#fff' : '#4a6080', boxShadow: isW ? '0 0 8px rgba(34,197,94,0.5)' : 'none' }}>
                        {isFree ? '★' : val}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {game.derash > 0 && (
              <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, color: '#f59e0b', marginBottom: 16, textAlign: 'center' }}>
                💰 {Math.round(game.derash)} Birr
              </div>
            )}
            {nextCountdown !== null && nextCountdown > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#132033', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 50, padding: '8px 18px', fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                Auto-starting next game in {nextCountdown}s
              </div>
            )}
            {nextCountdown === 0 && <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>Finding next round…</div>}
            <button type="button" onClick={() => { sessionStorage.removeItem('selectedStake'); sessionStorage.removeItem('stakeSelectedForRound'); navigate('/'); }}
              style={{ background: '#f59e0b', border: 'none', borderRadius: 10, padding: '12px 32px', color: '#000', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
              Back to Home
            </button>
          </div>
        );
      })()}

      {/* ── VOID / CANCELLED ── */}
      {(game.phase === 'void' || game.phase === 'cancelled') && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,14,26,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
          <div style={{ fontSize: 40 }}>{game.phase === 'void' ? '🔄' : '⚠️'}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', textAlign: 'center' }}>{game.endMessage}</div>
          {nextCountdown !== null && nextCountdown > 0 && (
            <div style={{ fontSize: 13, color: '#64748b' }}>Returning in {nextCountdown}s…</div>
          )}
        </div>
      )}
    </div>
  );
}
