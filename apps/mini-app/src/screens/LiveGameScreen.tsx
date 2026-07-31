import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket } from '../lib/socket';
import { getRound, getHistoryDetail, getRounds } from '../lib/api';
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

function BingoCell({
  value,
  marked,
  isFree,
  isWinLine,
}: {
  value: number;
  marked: boolean;
  isFree: boolean;
  isWinLine: boolean;
}) {
  let bg = '#fff';
  let color = '#222';
  if (isFree) { bg = '#4f46e5'; color = '#fff'; }
  else if (isWinLine) { bg = '#fbbf24'; color = '#1a1a1a'; }
  else if (marked) { bg = '#4f46e5'; color = '#fff'; }

  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bg,
        color,
        borderRadius: 6,
        fontWeight: marked || isFree ? 700 : 400,
        fontSize: 14,
        border: '1px solid #e0e0e0',
        transition: 'background 0.2s',
      }}
    >
      {isFree ? '*' : value}
    </div>
  );
}

export default function LiveGameScreen() {
  const { id: roundId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Guard: must come from cartela selection
  useEffect(() => {
    const selectedRound = sessionStorage.getItem('selectedRoundId');
    if (!selectedRound || selectedRound !== roundId) {
      navigate('/', { replace: true });
    }
  }, [roundId, navigate]);

  const [round, setRound] = useState<RoundDetail | null>(null);
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimPending, setClaimPending] = useState(false);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('soundOn') !== 'false');
  const [autoMark] = useState(true);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function playNumberSound(num: number) {
    if (!soundOn) return;
    try {
      // Reuse audio element; swap src only when number changes
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      const audio = audioRef.current;
      audio.pause();
      audio.src = `/boy sound/${num}.wav`;
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Autoplay blocked or file missing — silent fallback
      });
    } catch {
      // Audio not available
    }
  }

  const [game, setGame] = useState<GameState>({
    phase: 'waiting',
    calledNumbers: new Set(),
    lastCalled: null,
    playerCount: 0,
    derash: 0,
    winnerInfo: null,
    endMessage: null,
  });

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
        setGame((g) => ({
          ...g,
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

  useEffect(() => {
    if (!roundId) return;

    if (!socket.connected) socket.connect();
    socket.emit('JOIN_ROUND', { roundId, token: localStorage.getItem('jwt') ?? '' });

    const onNumberCalled = (p: NumberCalledPayload) => {
      setGame((g) => {
        const next = new Set(g.calledNumbers);
        next.add(p.number);
        return {
          ...g,
          calledNumbers: next,
          lastCalled: p.number,
          phase: g.phase === 'waiting' ? 'active' : g.phase,
        };
      });
      if (soundOn) playNumberSound(p.number);
    };

    const onRoundStarted = (p: RoundStartedPayload) => {
      setGame((g) => ({ ...g, phase: 'active', derash: p.derash, playerCount: p.playerCount }));
    };

    const onPlayerJoined = (p: PlayerJoinedPayload) => {
      setGame((g) => ({ ...g, playerCount: p.playerCount }));
    };

    const onRoundWon = (p: RoundWonPayload) => {
      setGame((g) => ({ ...g, phase: 'won', winnerInfo: p, derash: p.derash }));
    };

    const onRoundVoid = (_p: RoundVoidPayload) => {
      setGame((g) => ({ ...g, phase: 'void', endMessage: 'Round ended with no winner. Stake refunded.' }));
    };

    const onRoundCancelled = (_p: RoundCancelledPayload) => {
      setGame((g) => ({ ...g, phase: 'cancelled', endMessage: 'Round was cancelled. Stake refunded.' }));
    };

    const onWinRejected = (p: WinRejectedPayload) => {
      setClaimError('Win rejected: ' + p.reason);
      setClaimPending(false);
    };

    socket.on('NUMBER_CALLED', onNumberCalled);
    socket.on('ROUND_STARTED', onRoundStarted);
    socket.on('PLAYER_JOINED', onPlayerJoined);
    socket.on('ROUND_WON', onRoundWon);
    socket.on('ROUND_VOID', onRoundVoid);
    socket.on('ROUND_CANCELLED', onRoundCancelled);
    socket.on('WIN_REJECTED', onWinRejected);

    return () => {
      socket.off('NUMBER_CALLED', onNumberCalled);
      socket.off('ROUND_STARTED', onRoundStarted);
      socket.off('PLAYER_JOINED', onPlayerJoined);
      socket.off('ROUND_WON', onRoundWon);
      socket.off('ROUND_VOID', onRoundVoid);
      socket.off('ROUND_CANCELLED', onRoundCancelled);
      socket.off('WIN_REJECTED', onWinRejected);
    };
  }, [roundId, soundOn]);


  // ─── Next-round countdown: start when game ends ─────────────────────────
  useEffect(() => {
    if (game.phase !== 'won' && game.phase !== 'void' && game.phase !== 'cancelled') return;

    setNextCountdown(10);
    const interval = setInterval(() => {
      setNextCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [game.phase]);

  // ─── When countdown hits 0, poll for the next pending round ─────────────
  useEffect(() => {
    if (nextCountdown !== 0) return;

    async function goToNextRound() {
      const stake = sessionStorage.getItem('selectedStake');
      let attempts = 0;

      while (attempts < 15) {
        try {
          const rounds = await getRounds();
          // Prefer pending (lobby), fall back to active
          const next =
            rounds.find((r) => String(r.stake) === stake && r.status === 'pending') ??
            rounds.find((r) => String(r.stake) === stake && r.status === 'active');
          if (next) {
            sessionStorage.setItem('stakeSelectedForRound', next.id);
            sessionStorage.setItem('selectedRoundId', next.id);
            if (next.status === 'pending') {
              navigate(`/rounds/${next.id}/cartela`, { replace: true });
            } else {
              navigate(`/rounds/${next.id}/game`, { replace: true });
            }
            return;
          }
        } catch {
          // swallow fetch errors and retry
        }
        await new Promise<void>((res) => setTimeout(res, 2000));
        attempts++;
      }

      navigate('/', { replace: true });
    }

    void goToNextRound();
  }, [nextCountdown, navigate]);

  const toggleSound = useCallback(() => {
    setSoundOn((v) => {
      const next = !v;
      localStorage.setItem('soundOn', String(next));
      return next;
    });
  }, []);

  const handleClaimWin = useCallback(() => {
    if (!roundId || !detail || claimPending) return;
    setClaimPending(true);
    setClaimError(null);
    socket.emit('CLAIM_WIN', { roundId, cartelaId: detail.cartelaNumber });
  }, [roundId, detail, claimPending]);

  const markedSet = game.calledNumbers;
  const grid: number[] = (detail?.cartelaGrid ?? []) as number[];

  function isMarked(i: number): boolean {
    if (i === 12) return true;
    const val = grid[i];
    if (val === undefined) return false;
    return markedSet.has(val);
  }

  function hasWin(): boolean {
    if (!grid.length) return false;
    for (let r = 0; r < 5; r++) {
      if ([0, 1, 2, 3, 4].every((c) => isMarked(r * 5 + c))) return true;
    }
    for (let c = 0; c < 5; c++) {
      if ([0, 1, 2, 3, 4].every((r) => isMarked(r * 5 + c))) return true;
    }
    if ([0, 6, 12, 18, 24].every(isMarked)) return true;
    if ([4, 8, 12, 16, 20].every(isMarked)) return true;
    return false;
  }

  function getWinningCells(): Set<number> {
    const win = new Set<number>();
    if (!grid.length) return win;
    for (let r = 0; r < 5; r++) {
      if ([0, 1, 2, 3, 4].every((c) => isMarked(r * 5 + c))) {
        [0, 1, 2, 3, 4].forEach((c) => win.add(r * 5 + c));
      }
    }
    for (let c = 0; c < 5; c++) {
      if ([0, 1, 2, 3, 4].every((r) => isMarked(r * 5 + c))) {
        [0, 1, 2, 3, 4].forEach((r) => win.add(r * 5 + c));
      }
    }
    if ([0, 6, 12, 18, 24].every(isMarked)) [0, 6, 12, 18, 24].forEach((i) => win.add(i));
    if ([4, 8, 12, 16, 20].every(isMarked)) [4, 8, 12, 16, 20].forEach((i) => win.add(i));
    return win;
  }

  const winCells = getWinningCells();
  const playerHasBingo = hasWin();
  const isWatching = !detail;

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>Loading game...</div>;
  }

  if (error || !round) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#e53e3e' }}>{error ?? 'Could not load game'}</div>;
  }

  const lastCalledCol = game.lastCalled
    ? COLS[Math.floor((game.lastCalled - 1) / 15)]
    : null;

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ background: '#4f46e5', color: '#fff', padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ cursor: 'pointer', fontSize: 18 }} onClick={() => navigate('/')}>
              &larr;
            </span>
            <span style={{ fontWeight: 700, fontSize: 17 }}>
              Beteseb Bingo
              {isWatching && (
                <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.85 }}> (Watching)</span>
              )}
            </span>
          </div>
          <button
            onClick={toggleSound}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: 6,
              padding: '4px 10px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {soundOn ? 'Sound ON' : 'Sound OFF'}
          </button>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 13 }}>
          <div>
            <span style={{ opacity: 0.75 }}>ID: </span>
            <strong>#{round.id.slice(-6).toUpperCase()}</strong>
          </div>
          <div>
            <span style={{ opacity: 0.75 }}>Players: </span>
            <strong>{game.playerCount}</strong>
          </div>
          <div>
            <span style={{ opacity: 0.75 }}>Stake: </span>
            <strong>{round.stake} Birr</strong>
          </div>
          <div>
            <span style={{ opacity: 0.75 }}>Prize: </span>
            <strong>{game.derash} Birr</strong>
          </div>
        </div>
      </div>

      {/* Last called number */}
      <div style={{ background: '#1e1b4b', color: '#fff', padding: '14px 16px', textAlign: 'center' }}>
        {game.phase === 'waiting' && (
          <div style={{ color: '#a5b4fc', fontSize: 15 }}>Waiting for game to start...</div>
        )}
        {(game.phase === 'active' || game.phase === 'won') && (
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Last Called</div>
            <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: 2 }}>
              {game.lastCalled ? lastCalledCol + ' ' + game.lastCalled : '-'}
            </div>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
              {game.calledNumbers.size} / 75 numbers called
            </div>
          </div>
        )}
        {(game.phase === 'void' || game.phase === 'cancelled') && (
          <div style={{ color: '#fca5a5', fontSize: 15 }}>{game.endMessage}</div>
        )}
      </div>

      {/* Win banner */}
      {game.phase === 'won' && game.winnerInfo && (
        <div
          style={{
            background:
              game.winnerInfo.cartelaNumber === detail?.cartelaNumber ? '#065f46' : '#1e3a5f',
            color: '#fff',
            padding: '14px 16px',
            textAlign: 'center',
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          {game.winnerInfo.cartelaNumber === detail?.cartelaNumber
            ? 'You won! ' + game.winnerInfo.derash + ' Birr prize!'
            : '@' + game.winnerInfo.winnerUsername + ' won ' + game.winnerInfo.derash + ' Birr'}
        </div>
      )}

      {/* Recent called numbers strip */}
      <div
        style={{
          background: '#fff',
          padding: '10px 16px',
          borderBottom: '1px solid #eee',
          overflowX: 'auto',
        }}
      >
        <div style={{ display: 'flex', gap: 6, minWidth: 'max-content' }}>
          {Array.from(game.calledNumbers)
            .slice(-15)
            .map((n) => (
              <div
                key={n}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: n === game.lastCalled ? '#4f46e5' : '#e0e7ff',
                  color: n === game.lastCalled ? '#fff' : '#4f46e5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                {n}
              </div>
            ))}
          {game.calledNumbers.size === 0 && (
            <span style={{ color: '#aaa', fontSize: 13 }}>No numbers called yet</span>
          )}
        </div>
      </div>

      {/* Bingo card */}
      {grid.length > 0 ? (
        <div style={{ padding: '16px 16px 8px' }}>
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                background: '#4f46e5',
              }}
            >
              {COLS.map((c) => (
                <div
                  key={c}
                  style={{
                    textAlign: 'center',
                    color: '#fff',
                    fontWeight: 900,
                    padding: '10px 0',
                    fontSize: 18,
                  }}
                >
                  {c}
                </div>
              ))}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 2,
                padding: 4,
              }}
            >
              {grid.map((val: number, idx: number) => (
                <BingoCell
                  key={idx}
                  value={val}
                  marked={autoMark && isMarked(idx)}
                  isFree={idx === 12}
                  isWinLine={winCells.has(idx)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '20px 16px', textAlign: 'center', color: '#888', fontSize: 14 }}>
          Watching only mode
        </div>
      )}

      {/* Claim win */}
      {!isWatching && game.phase === 'active' && (
        <div style={{ padding: '12px 16px' }}>
          {claimError && (
            <div
              style={{
                background: '#fff3f3',
                color: '#e53e3e',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 10,
                fontSize: 14,
              }}
            >
              {claimError}
            </div>
          )}
          {playerHasBingo && (
            <button
              onClick={handleClaimWin}
              disabled={claimPending}
              style={{
                width: '100%',
                padding: '16px',
                background: claimPending ? '#a5b4fc' : '#22c55e',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontSize: 18,
                fontWeight: 900,
                cursor: claimPending ? 'default' : 'pointer',
              }}
            >
              {claimPending ? 'Checking...' : 'BINGO! Claim Win'}
            </button>
          )}
        </div>
      )}

      {/* Next-round countdown banner */}
      {nextCountdown !== null && (
        <div
          style={{
            background: '#1e3a5f',
            color: '#fff',
            padding: '16px',
            textAlign: 'center',
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          {nextCountdown > 0
            ? `Next round starts in ${nextCountdown}s...`
            : 'Finding next round...'}
        </div>
      )}

      {/* Back button after game ends (hidden once countdown starts) */}
      {(game.phase === 'won' || game.phase === 'void' || game.phase === 'cancelled') && nextCountdown === null && (
        <div style={{ padding: '12px 16px' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              width: '100%',
              padding: '14px',
              background: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Back to Games
          </button>
        </div>
      )}
    </div>
  );
}
