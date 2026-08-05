import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket } from '../lib/socket';
import { getRound, getMyCartelas, getRounds, getCalledNumbers } from '../lib/api';
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
// Column ranges: B=1-15, I=16-30, N=31-45, G=46-60, O=61-75
const COL_COLORS = ['#7c3aed', '#2563eb', '#16a34a', '#d97706', '#dc2626'];

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

  useEffect(() => {
    const stakeSelected = sessionStorage.getItem('stakeSelectedForRound');
    if (!stakeSelected) navigate('/', { replace: true });
  }, [navigate]);

  const [round, setRound] = useState<RoundDetail | null>(null);
  const [myCartelas, setMyCartelas] = useState<Array<{ cartelaNumber: number; cartelaGrid: number[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimPending, setClaimPending] = useState(false);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('soundOn') !== 'false');
  // Keep a ref in sync so socket handlers always read the latest value
  const soundOnRef = useRef(soundOn);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

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
    // Load all 75 sounds in parallel — IDB cache when available, otherwise network.
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
      // Fire all 75 in parallel
      await Promise.all(Array.from({ length: 75 }, (_, i) => load(i + 1)));
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
        // Fetch round, my cartelas, and called numbers all in parallel
        const [r, myC, calledNums] = await Promise.all([
          getRound(roundId!),
          getMyCartelas(roundId!).catch(() => ({ cartelas: [] as Array<{ cartelaNumber: number; cartelaGrid: number[] }> })),
          getCalledNumbers(roundId!).catch(() => [] as number[]),
        ]);
        setRound(r);
        if (myC.cartelas.length) setMyCartelas(myC.cartelas);

        const nums = calledNums;
        const existingCalled = new Set(nums);
        const lastCalled = nums[nums.length - 1] ?? null;

        setGame((g) => ({
          ...g,
          calledNumbers: existingCalled,
          lastCalled,
          playerCount: r.player_count,
          derash: r.derash,
          calledOrder: nums,
          phase:
            r.status === 'active' ? 'active'
            : r.status === 'completed' ? 'won'
            : r.status === 'void' ? 'void'
            : r.status === 'cancelled' ? 'cancelled'
            : 'waiting',
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load game');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [roundId]);

  // ─── Socket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roundId) return;
    if (!socket.connected) socket.connect();
    socket.emit('JOIN_ROUND', { roundId, token: localStorage.getItem('jwt') ?? '' });

    const onNumber = (p: NumberCalledPayload) => {
      setGame((g) => {
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
    const onWon = (p: RoundWonPayload) =>
      setGame((g) => ({ ...g, phase: 'won', winnerInfo: p, derash: p.totalDerash }));
    const onVoid = (_p: RoundVoidPayload) =>
      setGame((g) => ({ ...g, phase: 'void', endMessage: 'No winner — stake refunded.' }));
    const onCancelled = (_p: RoundCancelledPayload) =>
      setGame((g) => ({ ...g, phase: 'cancelled', endMessage: 'Round cancelled — stake refunded.' }));
    const onRejected = (p: WinRejectedPayload) => {
      setClaimError('Win rejected: ' + p.reason);
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
    setNextCountdown(10);
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

  const handleClaimWin = useCallback(() => {
    if (!roundId || !myCartelas.length || claimPending) return;
    setClaimPending(true);
    setClaimError(null);
    socket.emit('CLAIM_WIN', { roundId, cartelaId: myCartelas[0]!.cartelaNumber });
  }, [roundId, myCartelas, claimPending]);

  // ─── Cartela win detection (multi-cartela) ───────────────────────────────
  const allCartelas = myCartelas;
  const marked = game.calledNumbers;
  const [activeCartelaIdx, setActiveCartelaIdx] = useState(0);
  const activeCartela = allCartelas[activeCartelaIdx] ?? allCartelas[0];
  const grid: number[] = (activeCartela?.cartelaGrid ?? []) as number[];

  function isMarkedForGrid(g: number[], i: number) {
    if (i === 12) return true;
    const v = g[i];
    return v !== undefined && marked.has(v);
  }
  function hasWinForGrid(g: number[]) {
    if (!g.length) return false;
    for (let r = 0; r < 5; r++) if ([0,1,2,3,4].every((c) => isMarkedForGrid(g, r*5+c))) return true;
    for (let c = 0; c < 5; c++) if ([0,1,2,3,4].every((r) => isMarkedForGrid(g, r*5+c))) return true;
    if ([0,6,12,18,24].every((i) => isMarkedForGrid(g, i))) return true;
    if ([4,8,12,16,20].every((i) => isMarkedForGrid(g, i))) return true;
    return false;
  }
  function winCellsForGrid(g: number[]) {
    const w = new Set<number>();
    if (!g.length) return w;
    for (let r = 0; r < 5; r++) if ([0,1,2,3,4].every((c) => isMarkedForGrid(g, r*5+c))) [0,1,2,3,4].forEach((c) => w.add(r*5+c));
    for (let c = 0; c < 5; c++) if ([0,1,2,3,4].every((r) => isMarkedForGrid(g, r*5+c))) [0,1,2,3,4].forEach((r) => w.add(r*5+c));
    if ([0,6,12,18,24].every((i) => isMarkedForGrid(g, i))) [0,6,12,18,24].forEach((i) => w.add(i));
    if ([4,8,12,16,20].every((i) => isMarkedForGrid(g, i))) [4,8,12,16,20].forEach((i) => w.add(i));
    return w;
  }

  // Win on ANY cartela
  const playerHasBingo = allCartelas.some((c) => hasWinForGrid(c.cartelaGrid as number[]));
  const winningCartelaNumber = allCartelas.find((c) => hasWinForGrid(c.cartelaGrid as number[]))?.cartelaNumber ?? null;
  const wCells = winCellsForGrid(grid);
  const isWatching = myCartelas.length === 0;
  const gameEnded = game.phase === 'won' || game.phase === 'void' || game.phase === 'cancelled';

  // ─── Auto-claim win as soon as bingo is detected ─────────────────────────
  const autoClaimed = useRef(false);
  useEffect(() => {
    if (!playerHasBingo || game.phase !== 'active' || !roundId || !myCartelas.length || claimPending || autoClaimed.current) return;
    autoClaimed.current = true;
    setClaimPending(true);
    setClaimError(null);
    socket.emit('CLAIM_WIN', { roundId, cartelaId: winningCartelaNumber });
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
        {/* BINGO header with column colors */}
        <div style={{ display: 'flex', gap: 2 }}>
          {['B','I','N','G','O'].map((letter, i) => (
            <span key={letter} style={{
              fontWeight: 900, fontSize: 20, letterSpacing: 1,
              color: COL_COLORS[i],
              textShadow: `0 0 8px ${COL_COLORS[i]}99`,
            }}>{letter}</span>
          ))}
        </div>
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

          {/* Last 4 called numbers display */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>Last Called</span>
              <button onClick={toggleSound} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 14, cursor: 'pointer' }}>
                {soundOn ? '🔊' : '🔇'}
              </button>
            </div>
            {/* 4 balls: newest is largest on the right */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 80 }}>
              {game.calledOrder.length === 0 ? (
                <div style={{ color: '#555', fontSize: 13 }}>{game.phase === 'waiting' ? 'Game starting...' : '—'}</div>
              ) : (() => {
                const last4 = game.calledOrder.slice(-4);
                const sizes = [36, 44, 52, 64]; // oldest → newest
                const offsets = last4.length;
                return last4.map((num, idx) => {
                  const displayIdx = 4 - offsets + idx; // align to right slots
                  const sz = sizes[displayIdx] ?? sizes[sizes.length - 1]!;
                  const colIdx = getColIndex(num);
                  const isNewest = idx === last4.length - 1;
                  return (
                    <div key={`${num}-${idx}`} style={{
                      width: sz, height: sz, borderRadius: '50%',
                      background: isNewest
                        ? `radial-gradient(circle at 35% 35%, #fff8, ${COL_COLORS[colIdx]})`
                        : `radial-gradient(circle at 35% 35%, #fff4, ${COL_COLORS[colIdx]}88)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexDirection: 'column',
                      fontWeight: 900,
                      fontSize: sz >= 60 ? 16 : sz >= 50 ? 13 : sz >= 42 ? 11 : 9,
                      color: isNewest ? '#fff' : 'rgba(255,255,255,0.7)',
                      boxShadow: isNewest ? `0 0 16px ${COL_COLORS[colIdx]}99` : 'none',
                      border: `2px solid ${isNewest ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)'}`,
                      transition: 'all 0.2s',
                      lineHeight: 1.1,
                    }}>
                      <span style={{ fontSize: sz >= 50 ? 9 : 7, opacity: 0.8 }}>{getColLabel(num)}</span>
                      {num}
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Win overlay — full-screen modal */}
          {game.phase === 'won' && game.winnerInfo && (() => {
            const wi = game.winnerInfo;
            const isMulti = wi.winnerCount > 1;

            // Pick the cartela to display: winner's cartela if single, or current player's if multi
            const displayWinner = isMulti
              ? (wi.winners[0])
              : wi.winners[0];
            const winCartelaNumber = displayWinner?.cartelaNumber ?? null;

            // Find the winning cartela grid — prefer player's own, fallback to first winner's
            const winnerCartela = allCartelas.find((c) => c.cartelaNumber === winCartelaNumber)
              ?? allCartelas[0];
            const winGrid: number[] = (winnerCartela?.cartelaGrid ?? grid) as number[];
            const winCells = winCellsForGrid(winGrid);

            const winnerName = isMulti
              ? wi.winners.map((w) => `@${w.username}`).join(', ')
              : `${displayWinner?.username ?? 'Winner'}`;

            return (
              <div style={{
                position: 'fixed', inset: 0, zIndex: 100,
                background: 'rgba(15,12,41,0.96)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '24px 20px',
                overflowY: 'auto',
              }}>
                {/* Crown */}
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #f5a623, #f5d06b)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 30, marginBottom: 10,
                  boxShadow: '0 0 24px #f5a62388',
                }}>
                  👑
                </div>

                {/* BINGO! */}
                <div style={{ fontSize: 36, fontWeight: 900, color: '#f5d06b', letterSpacing: 2, marginBottom: 6 }}>
                  BINGO!
                </div>

                {/* Winner name */}
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, color: '#fff' }}>
                  🎉 {winnerName} WON! 🎉
                </div>

                {/* Winning cartela card */}
                {winGrid.length > 0 && (
                  <div style={{
                    background: 'rgba(255,255,255,0.07)',
                    borderRadius: 12, overflow: 'hidden',
                    width: '100%', maxWidth: 320,
                    marginBottom: 16,
                    boxShadow: '0 4px 32px rgba(0,0,0,0.5)',
                  }}>
                    {/* Trophy + cartela number */}
                    <div style={{ textAlign: 'center', padding: '8px 0 4px', fontWeight: 800, fontSize: 14, color: '#f5d06b' }}>
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
                        const isMarked = isFree || marked.has(val);
                        const isWinCell = winCells.has(idx);
                        const colIdx = idx % 5;

                        let bg = 'rgba(255,255,255,0.08)';
                        let color = '#ccc';
                        if (isWinCell) { bg = '#22c55e'; color = '#fff'; }
                        else if (isMarked) { bg = COL_COLORS[colIdx]!; color = '#fff'; }

                        return (
                          <div key={idx} style={{
                            aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: bg, color, borderRadius: 6,
                            fontSize: 15, fontWeight: isMarked ? 800 : 400,
                            transition: 'background 0.2s',
                          }}>
                            {isFree ? '✦' : val}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Prize info for multi-winner */}
                {isMulti && (
                  <div style={{ width: '100%', maxWidth: 320, marginBottom: 12 }}>
                    {wi.winners.map((w) => (
                      <div key={w.playerId} style={{
                        display: 'flex', justifyContent: 'space-between',
                        padding: '4px 8px', fontSize: 13, fontWeight: 700, color: '#a5b4fc',
                      }}>
                        <span>@{w.username}</span>
                        <span>{w.amount} Birr</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Auto-start countdown */}
                {nextCountdown !== null && (
                  <div style={{
                    background: 'rgba(255,255,255,0.1)', borderRadius: 20,
                    padding: '8px 20px', fontSize: 13, fontWeight: 700, color: '#e2e8f0',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f5d06b', display: 'inline-block' }} />
                    {nextCountdown > 0
                      ? `Auto-starting next game in ${nextCountdown}s`
                      : 'Finding next round...'}
                  </div>
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

          {/* Cartela card or watching panel */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {!isWatching && grid.length > 0 ? (
              <>
                {/* Cartela number label */}
                <div style={{ textAlign: 'center', marginBottom: 6, fontSize: 13, fontWeight: 800, color: '#a5b4fc', letterSpacing: 0.5 }}>
                  ካርቴላ #{activeCartela?.cartelaNumber}
                </div>

                {/* Player's cartela grid */}
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', background: 'rgba(255,255,255,0.1)' }}>
                    {COLS.map((c, i) => (
                      <div key={c} style={{ textAlign: 'center', padding: '4px 0', fontWeight: 800, fontSize: 11, color: COL_COLORS[i] }}>{c}</div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, padding: 4 }}>
                    {grid.map((val, idx) => {
                      const isFree = idx === 12;
                      const m = isFree || marked.has(val);
                      const wl = wCells.has(idx);
                      return (
                        <div key={idx} style={{
                          aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: wl ? '#f5d06b' : m ? '#4f46e5' : 'rgba(255,255,255,0.08)',
                          color: wl ? '#1a1035' : m ? '#fff' : '#aaa',
                          borderRadius: 4, fontSize: 11, fontWeight: m ? 800 : 400,
                          transition: 'background 0.2s',
                        }}>
                          {isFree ? '★' : val}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Auto-claim status */}
                {game.phase === 'active' && playerHasBingo && (
                  <div style={{
                    width: '100%', padding: '12px', background: claimPending ? '#d97706' : '#22c55e',
                    color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 900, textAlign: 'center',
                    animation: 'pulse 0.5s infinite alternate',
                  }}>
                    {claimPending ? '⏳ Claiming BINGO…' : '🎉 BINGO!'}
                  </div>
                )}
                {claimError && <div style={{ color: '#fca5a5', fontSize: 12, marginTop: 6, textAlign: 'center' }}>{claimError}</div>}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 12 }}>Watching Only</div>
                <div style={{ fontSize: 13, color: '#a5b4fc', lineHeight: 1.8 }}>
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

      {/* ── Bottom bar ──────────────────────────────────────────────────────── */}
      <div style={{ background: '#0f0c29', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '10px 12px', display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => { sessionStorage.removeItem('selectedStake'); sessionStorage.removeItem('stakeSelectedForRound'); navigate('/'); }}
          style={{ flex: 1, padding: '10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          Leave
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          ↺ Refresh
        </button>
        {!isWatching && !gameEnded && (
          <button
            style={{ flex: 1, padding: '10px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'default', opacity: 0.8 }}
            disabled
          >
            Automatic
          </button>
        )}
      </div>
    </div>
  );
}
