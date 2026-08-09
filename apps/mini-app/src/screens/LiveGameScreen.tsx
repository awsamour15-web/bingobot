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
// Distinct color per BINGO column — bold but not rainbow
const COL_COLORS = [
  '#1d4ed8', // B — deep blue
  '#0f766e', // I — teal
  '#7c3aed', // N — purple
  '#b45309', // G — amber-brown
  '#be123c', // O — crimson
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
      // Use a short timeout to ensure the preload loop has run first
      setTimeout(() => {
        const first = audioCache.current.get(1);
        if (first) { first.play().catch(() => {}); first.pause(); first.currentTime = 0; }
      }, 50);
    };
    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('pointerdown', unlock);
    };
  }, []);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);

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

      // Phase 1: load first 15 numbers immediately (B column — called first)
      await Promise.all(Array.from({ length: 15 }, (_, i) => load(i + 1)));

      // Phase 2: load remaining 60 in background batches of 10
      // Use requestIdleCallback when available so it doesn't compete with UI
      const loadBatch = async (start: number, end: number) => {
        await Promise.all(Array.from({ length: end - start }, (_, i) => load(start + i)));
      };
      const scheduleBatch = (start: number, end: number, delay: number) => {
        setTimeout(() => { loadBatch(start, end).catch(() => {}); }, delay);
      };
      scheduleBatch(16, 26, 500);
      scheduleBatch(26, 36, 1000);
      scheduleBatch(36, 46, 1500);
      scheduleBatch(46, 56, 2000);
      scheduleBatch(56, 66, 2500);
      scheduleBatch(66, 76, 3000);
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
      audio.currentTime = 0;
      const p = audio.play();
      if (p) {
        p.catch((err) => {
          // Autoplay blocked — retry once after a short delay
          // (happens when user hasn't interacted with the page yet)
          if (err?.name === 'NotAllowedError') {
            setTimeout(() => { audio.currentTime = 0; audio.play().catch(() => {}); }, 300);
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
  const gameEnded = game.phase === 'won' || game.phase === 'void' || game.phase === 'cancelled';

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
    <div style={{ height: '100dvh', background: '#1a1035', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
      Loading game...
    </div>
  );
  if (error || !round) return (
    <div style={{ height: '100dvh', background: '#1a1035', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e53e3e', padding: 24, textAlign: 'center' }}>
      {error ?? 'Could not load game'}
    </div>
  );

  const lastCol = game.lastCalled ? getColLabel(game.lastCalled) : null;
  void lastCol; // kept for potential future use

  return (
    <div style={{ height: '100dvh', background: '#1a1035', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{ background: '#0f0c29', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
        <span style={{ cursor: 'pointer', fontSize: 20 }} onClick={() => { sessionStorage.removeItem('selectedStake'); sessionStorage.removeItem('stakeSelectedForRound'); navigate('/'); }}>✕</span>
        {/* Fidel Bingo header */}
        <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: 1, color: '#f5d06b' }}>Fidel Bingo</span>
        <button onClick={toggleSound} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 18, cursor: 'pointer' }}>
          {soundOn ? '🔊' : '🔇'}
        </button>
      </div>

      {/* ── Stats row ───────────────────────────────────────────────────────── */}
      <div style={{ background: '#2d1b69', display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
        {[
          { label: 'Game ID', value: round.id.slice(-8).toUpperCase() },
          { label: 'Players', value: game.playerCount },
          { label: 'Bet', value: round.stake },
          { label: 'Derash', value: Math.round(game.derash) },
          { label: 'Called', value: game.calledNumbers.size },
        ].map(({ label, value }) => (
          <div key={label} style={{ flex: 1, padding: '8px 4px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 9, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Main split layout ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT: Full 1-75 bingo board */}
        <div style={{ width: '42%', borderRight: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', flexShrink: 0 }}>
            {COLS.map((c, i) => (
              <div key={c} style={{ background: COL_COLORS[i], textAlign: 'center', padding: '6px 0', fontWeight: 900, fontSize: 14 }}>{c}</div>
            ))}
          </div>
          {/* Numbers 1-75 in 5 columns, 15 rows */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gridTemplateRows: 'repeat(15, 1fr)', gap: 1, padding: 2 }}>
            {Array.from({ length: 75 }, (_, i) => {
              // Fill column by column: col 0 = 1-15, col 1 = 16-30, etc.
              const col = i % 5;
              const row = Math.floor(i / 5);
              const num = col * 15 + row + 1;
              const called = game.calledNumbers.has(num);
              const isLast = num === game.lastCalled;
              return (
                <div key={num} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  aspectRatio: '1',
                  background: isLast ? '#f5d06b' : called ? COL_COLORS[col] : 'rgba(255,255,255,0.06)',
                  color: isLast ? '#1a1035' : called ? '#fff' : '#888',
                  borderRadius: 4,
                  fontWeight: called ? 800 : 400,
                  fontSize: 12,
                  transition: 'background 0.2s',
                }}>
                  {num}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Called number + cartela or watching panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ── Last Called — big prominent display ── */}
          <div style={{ padding: '6px 8px 4px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0, textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 9, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: 1 }}>Last Called</span>
              <button onClick={toggleSound} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 13, cursor: 'pointer' }}>
                {soundOn ? '🔊' : '🔇'}
              </button>
            </div>
            {game.lastCalled ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {/* Column letter badge */}
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: COL_COLORS[getColIndex(game.lastCalled)],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 14, color: '#fff', flexShrink: 0,
                }}>
                  {getColLabel(game.lastCalled)}
                </div>
                {/* Big number */}
                <div style={{
                  fontSize: 48, fontWeight: 900, lineHeight: 1,
                  color: '#f5d06b',
                  textShadow: '0 0 20px rgba(245,208,107,0.5)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {game.lastCalled}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#475569', padding: '8px 0' }}>
                {game.phase === 'waiting' ? 'Starting...' : '—'}
              </div>
            )}
          </div>

          {/* ── Called Numbers — scrollable history strip ── */}
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0, padding: '4px 6px 4px' }}>
            <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>
              Called ({game.calledOrder.length}/75)
            </div>
            <div style={{
              display: 'flex', gap: 3, overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              paddingBottom: 2,
              scrollbarWidth: 'none',
            }}>
              {game.calledOrder.length === 0 ? (
                <div style={{ color: '#334155', fontSize: 10, padding: '4px 0' }}>—</div>
              ) : (
                [...game.calledOrder].reverse().map((num, idx) => {
                  const isNewest = idx === 0;
                  const col = getColIndex(num);
                  return (
                    <div key={`h-${num}-${idx}`} style={{
                      flexShrink: 0,
                      width: 26, height: 26, borderRadius: '50%',
                      background: isNewest ? COL_COLORS[col] : `${COL_COLORS[col]}55`,
                      border: `1px solid ${isNewest ? COL_COLORS[col]! : 'rgba(255,255,255,0.08)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: isNewest ? 900 : 600,
                      color: isNewest ? '#fff' : '#94a3b8',
                    }}>
                      {num}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Win overlay — full-screen modal */}
          {game.phase === 'won' && game.winnerInfo && (() => {
            const wi = game.winnerInfo;
            const displayWinner = wi.winners[0];
            const winCartelaNumber = displayWinner?.cartelaNumber ?? null;

            // Use fetched winner grid (works for ALL users including watchers)
            const winGrid: number[] = winnerCartelaGrid.length > 0
              ? winnerCartelaGrid
              : (allCartelas.find(c => c.cartelaNumber === winCartelaNumber)?.cartelaGrid ?? []) as number[];
            const winCells = winCellsForGrid(winGrid);

            // Winner pills — show first 3, collapse the rest into "+N more"
            const MAX_VISIBLE_WINNERS = 3;
            const visibleWinners = wi.winners.slice(0, MAX_VISIBLE_WINNERS);
            const hiddenCount = wi.winners.length - visibleWinners.length;

            return (
              <div style={{
                position: 'fixed', inset: 0, zIndex: 100,
                background: 'rgba(15,12,41,0.97)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
                padding: '28px 20px 20px',
                overflowY: 'auto',
              }}>
                {/* Crown badge */}
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #f5a623, #f5d06b)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 30, marginBottom: 10,
                  boxShadow: '0 0 28px #f5a62366',
                }}>
                  👑
                </div>

                {/* BINGO! */}
                <div style={{ fontSize: 38, fontWeight: 900, color: '#f5d06b', letterSpacing: 2, marginBottom: 4 }}>
                  BINGO!
                </div>

                {/* Winner count */}
                <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 14 }}>
                  🎉 {wi.winnerCount} player{wi.winnerCount !== 1 ? 's' : ''} won!
                </div>

                {/* Winner pills */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 320, marginBottom: 18 }}>
                  {visibleWinners.map((w) => (
                    <div key={w.playerId} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 24, padding: '8px 14px',
                    }}>
                      {/* Avatar circle */}
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 900, fontSize: 14, color: '#fff', flexShrink: 0,
                        textTransform: 'uppercase',
                      }}>
                        {(w.username ?? '?')[0]}
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9', flex: 1 }}>
                        {w.username}
                      </span>
                      <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                        #{w.cartelaNumber}
                      </span>
                    </div>
                  ))}
                  {hiddenCount > 0 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 24, padding: '8px 14px',
                      color: '#94a3b8', fontSize: 13, fontWeight: 600,
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, color: '#94a3b8',
                      }}>👥</div>
                      +{hiddenCount} more
                    </div>
                  )}
                </div>

                {/* Winning cartela card */}
                {winGrid.length > 0 && (
                  <div style={{
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 14, overflow: 'hidden',
                    width: '100%', maxWidth: 320,
                    marginBottom: 20,
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 4px 32px rgba(0,0,0,0.4)',
                  }}>
                    {/* Trophy + cartela number */}
                    <div style={{ textAlign: 'center', padding: '10px 0 6px', fontWeight: 800, fontSize: 13, color: '#f5d06b' }}>
                      🏆 Winning Cartela : {winCartelaNumber}
                    </div>

                    {/* Column headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
                      {COLS.map((c, i) => (
                        <div key={c} style={{
                          background: COL_COLORS[i], textAlign: 'center',
                          padding: '7px 0', fontWeight: 900, fontSize: 15, color: '#fff',
                        }}>{c}</div>
                      ))}
                    </div>

                    {/* Grid cells */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3, padding: 6 }}>
                      {winGrid.map((val, idx) => {
                        const isFree = idx === 12;
                        const isMarkedCell = isFree || (val !== 0 && marked.has(val));
                        const isWinCell = winCells.has(idx);
                        const colIdx = idx % 5;

                        let bg = 'rgba(255,255,255,0.08)';
                        let color = '#ccc';
                        if (isWinCell) { bg = '#22c55e'; color = '#fff'; }
                        else if (isMarkedCell) { bg = COL_COLORS[colIdx]!; color = '#fff'; }

                        return (
                          <div key={idx} style={{
                            aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: bg, color, borderRadius: 6,
                            fontSize: 15, fontWeight: isMarkedCell ? 800 : 400,
                            transition: 'background 0.2s',
                          }}>
                            {isFree ? '✦' : val}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Simple "finding next round" label while navigating */}
                {nextCountdown === 0 && (
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Finding next round...</div>
                )}
              </div>
            );
          })()}

          {(game.phase === 'void' || game.phase === 'cancelled') && (
            <div style={{ background: '#7f1d1d', padding: '10px', textAlign: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {game.endMessage}
            </div>
          )}

          {/* Next round countdown (non-won phases) */}
          {nextCountdown !== null && game.phase !== 'won' && (
            <div style={{ background: '#1e3a5f', padding: '8px', textAlign: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {nextCountdown > 0 ? `Next round in ${nextCountdown}s` : 'Finding next round...'}
            </div>
          )}

          {/* Cartela cards — no scroll, fit both in remaining space */}
          <div style={{ flex: 1, overflow: 'hidden', padding: '3px 4px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {!isWatching && allCartelas.length > 0 ? (
              <>
                {allCartelas.map((cartela) => {
                  const cartelaGrid: number[] = (cartela.cartelaGrid ?? []) as number[];
                  const cartelaWinCells = winCellsForGrid(cartelaGrid);
                  const cartelaHasWin = hasWinForGrid(cartelaGrid);
                  return (
                    <div key={cartela.cartelaNumber} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                      {/* Cartela number label */}
                      <div style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#f5d06b', marginBottom: 1, flexShrink: 0 }}>
                        #{cartela.cartelaNumber}{cartelaHasWin && <span style={{ marginLeft: 5, color: '#22c55e' }}>✓ BINGO</span>}
                      </div>
                      {/* Column headers */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, marginBottom: 2, flexShrink: 0 }}>
                        {COLS.map((c, i) => (
                          <div key={c} style={{
                            background: COL_COLORS[i], textAlign: 'center',
                            borderRadius: 3, padding: '1px 0',
                            fontWeight: 900, fontSize: 9, color: '#fff',
                          }}>{c}</div>
                        ))}
                      </div>
                      {/* 5×5 grid */}
                      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gridTemplateRows: 'repeat(5, 1fr)', gap: 2, minHeight: 0 }}>
                        {cartelaGrid.length > 0 ? cartelaGrid.map((val, idx) => {
                          const isFree = idx === 12;
                          const colIdx = idx % 5;
                          const m = isFree || (val !== 0 && marked.has(val));
                          const wl = cartelaWinCells.has(idx);
                          return (
                            <div key={idx} style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: wl
                                ? 'linear-gradient(135deg, #f5d06b, #f59e0b)'
                                : m
                                ? COL_COLORS[colIdx]
                                : 'rgba(255,255,255,0.07)',
                              color: wl ? '#1a1035' : m ? '#fff' : '#64748b',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: m ? 900 : 500,
                              border: wl ? '1.5px solid #fff' : m ? 'none' : '1px solid rgba(255,255,255,0.06)',
                              boxShadow: wl ? '0 0 6px rgba(245,208,107,0.5)' : 'none',
                              transition: 'background 0.2s',
                            }}>
                              {isFree ? '★' : val}
                            </div>
                          );
                        }) : (
                          Array.from({ length: 25 }).map((_, idx) => (
                            <div key={idx} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 4 }} />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
                {game.phase === 'active' && playerHasBingo && (
                  <div style={{ padding: '6px', background: claimPending ? '#d97706' : '#22c55e', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 900, textAlign: 'center', flexShrink: 0 }}>
                    {claimPending ? '⏳ Claiming…' : '🎉 BINGO!'}
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
