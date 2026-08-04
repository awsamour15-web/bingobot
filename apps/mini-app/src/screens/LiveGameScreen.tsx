import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket } from '../lib/socket';
import { getRound, getHistoryDetail, getRounds, getCalledNumbers } from '../lib/api';
import type {
  RoundDetail,
  HistoryDetail,
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
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
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
      // Play a silent buffer to unlock audio
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      ctx.close();
      // Also play+pause the first cached audio element to prime it
      const first = audioCache.current.get(1);
      if (first) { first.play().catch(() => {}); first.pause(); first.currentTime = 0; }
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
    lastCalled: null,
    playerCount: 0,
    derash: 0,
    winnerInfo: null,
    endMessage: null,
  });

  // ─── Preload all 75 number sounds into memory once ──────────────────────
  const audioCache = useRef<Map<number, HTMLAudioElement>>(new Map());

  useEffect(() => {
    // Preload all 75 sounds immediately on mount regardless of soundOn state
    // so they are ready when needed with no network delay
    for (let n = 1; n <= 75; n++) {
      if (audioCache.current.has(n)) continue;
      const audio = new Audio(`/sounds/${n}.wav`);
      audio.preload = 'auto';
      audioCache.current.set(n, audio);
    }
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
        const [r, d] = await Promise.all([
          getRound(roundId!),
          getHistoryDetail(roundId!).catch(() => null),
        ]);
        setRound(r);
        if (d) setDetail(d);

        // If round is already active, load all called numbers from DB
        let existingCalled = new Set<number>();
        let lastCalled: number | null = null;
        if (r.status === 'active' || r.status === 'completed') {
          const nums = await getCalledNumbers(roundId!);
          existingCalled = new Set(nums);
          lastCalled = nums[nums.length - 1] ?? null;
        }

        setGame((g) => ({
          ...g,
          calledNumbers: existingCalled,
          lastCalled,
          playerCount: r.player_count,
          derash: r.derash,
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
        return { ...g, calledNumbers: next, lastCalled: p.number, phase: g.phase === 'waiting' ? 'active' : g.phase };
      });
      playSound(p.number);
    };
    const onStarted = (p: RoundStartedPayload) =>
      setGame((g) => ({ ...g, phase: 'active', derash: p.derash, playerCount: p.playerCount }));
    const onJoined = (p: PlayerJoinedPayload) =>
      setGame((g) => ({ ...g, playerCount: p.playerCount }));
    const onWon = (p: RoundWonPayload) =>
      setGame((g) => ({ ...g, phase: 'won', winnerInfo: p, derash: p.derash }));
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
  }, [roundId, soundOn]);

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
    if (!roundId || !detail || claimPending) return;
    setClaimPending(true);
    setClaimError(null);
    socket.emit('CLAIM_WIN', { roundId, cartelaId: detail.cartelaNumber });
  }, [roundId, detail, claimPending]);

  // ─── Cartela win detection ───────────────────────────────────────────────
  const grid: number[] = (detail?.cartelaGrid ?? []) as number[];
  const marked = game.calledNumbers;

  function isMarked(i: number) {
    if (i === 12) return true;
    const v = grid[i];
    return v !== undefined && marked.has(v);
  }
  function hasWin() {
    if (!grid.length) return false;
    for (let r = 0; r < 5; r++) if ([0,1,2,3,4].every((c) => isMarked(r*5+c))) return true;
    for (let c = 0; c < 5; c++) if ([0,1,2,3,4].every((r) => isMarked(r*5+c))) return true;
    if ([0,6,12,18,24].every(isMarked)) return true;
    if ([4,8,12,16,20].every(isMarked)) return true;
    return false;
  }
  function winCells() {
    const w = new Set<number>();
    if (!grid.length) return w;
    for (let r = 0; r < 5; r++) if ([0,1,2,3,4].every((c) => isMarked(r*5+c))) [0,1,2,3,4].forEach((c) => w.add(r*5+c));
    for (let c = 0; c < 5; c++) if ([0,1,2,3,4].every((r) => isMarked(r*5+c))) [0,1,2,3,4].forEach((r) => w.add(r*5+c));
    if ([0,6,12,18,24].every(isMarked)) [0,6,12,18,24].forEach((i) => w.add(i));
    if ([4,8,12,16,20].every(isMarked)) [4,8,12,16,20].forEach((i) => w.add(i));
    return w;
  }

  const wCells = winCells();
  const playerHasBingo = hasWin();
  const isWatching = !detail;
  const gameEnded = game.phase === 'won' || game.phase === 'void' || game.phase === 'cancelled';

  // ─── Auto-claim win as soon as bingo is detected ─────────────────────────
  const autoClaimed = useRef(false);
  useEffect(() => {
    if (!playerHasBingo || game.phase !== 'active' || !roundId || !detail || claimPending || autoClaimed.current) return;
    autoClaimed.current = true;
    setClaimPending(true);
    setClaimError(null);
    socket.emit('CLAIM_WIN', { roundId, cartelaId: detail.cartelaNumber });
  }, [playerHasBingo, game.phase, roundId, detail, claimPending]);

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

  return (
    <div style={{ height: '100dvh', background: '#1a1035', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{ background: '#0f0c29', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
        <span style={{ cursor: 'pointer', fontSize: 20 }} onClick={() => { sessionStorage.removeItem('selectedStake'); sessionStorage.removeItem('stakeSelectedForRound'); navigate('/'); }}>✕</span>
        <span style={{ fontWeight: 800, fontSize: 16 }}>Fidel Bingo</span>
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

          {/* Last called number display */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              {game.lastCalled ? (
                <span style={{ background: COL_COLORS[getColIndex(game.lastCalled)], color: '#fff', fontWeight: 800, fontSize: 12, padding: '2px 8px', borderRadius: 12 }}>
                  {lastCol}-{game.lastCalled}
                </span>
              ) : (
                <span style={{ color: '#555', fontSize: 12 }}>Waiting...</span>
              )}
              <button onClick={toggleSound} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 14, cursor: 'pointer' }}>
                {soundOn ? '🔊' : '🔇'}
              </button>
            </div>
            {/* Big ball */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 80 }}>
              {game.lastCalled ? (
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: `radial-gradient(circle at 35% 35%, #fff8, ${COL_COLORS[getColIndex(game.lastCalled)]})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 24, color: '#fff',
                  boxShadow: `0 0 20px ${COL_COLORS[getColIndex(game.lastCalled)]}88`,
                  border: '3px solid rgba(255,255,255,0.3)',
                }}>
                  {lastCol}-{game.lastCalled}
                </div>
              ) : (
                <div style={{ color: '#555', fontSize: 13 }}>{game.phase === 'waiting' ? 'Game starting...' : '—'}</div>
              )}
            </div>
          </div>

          {/* Win/end banners */}
          {game.phase === 'won' && game.winnerInfo && (
            <div style={{ background: isWatching ? '#1e3a5f' : '#065f46', padding: '10px', textAlign: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {!isWatching && game.winnerInfo.cartelaNumber === detail?.cartelaNumber
                ? `🏆 You won ${game.winnerInfo.derash} Birr!`
                : `@${game.winnerInfo.winnerUsername} won ${game.winnerInfo.derash} Birr`}
            </div>
          )}
          {(game.phase === 'void' || game.phase === 'cancelled') && (
            <div style={{ background: '#7f1d1d', padding: '10px', textAlign: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {game.endMessage}
            </div>
          )}

          {/* Next round countdown */}
          {nextCountdown !== null && (
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
                  ካርቴላ #{detail.cartelaNumber}
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
