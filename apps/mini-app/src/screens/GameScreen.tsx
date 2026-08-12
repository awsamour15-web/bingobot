import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { initAuth, getAgentJwt } from '../lib/auth';
import { getRounds, getSystemStats } from '../lib/api';
import { socket } from '../lib/socket';
import type { RoundListItem } from '@fidel/shared';

const ALLOWED_STAKES = [10, 20, 50];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function GameScreen() {
  const navigate = useNavigate();
  const [rounds, setRounds] = useState<RoundListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isAgent, setIsAgent] = useState(false);
  const [stats, setStats] = useState<{ totalPlayers: number; totalGames: number } | null>(null);

  // Live player counts per round (updated by WebSocket)
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});

  const updateCount = useCallback((roundId: string, count: number) => {
    setLiveCounts(prev => ({ ...prev, [roundId]: count }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const [data, statsData] = await Promise.all([
          getRounds(),
          getSystemStats().catch(() => null),
          initAuth(),
        ]);
        if (!cancelled) {
          const filtered = data
            .filter(r => ALLOWED_STAKES.includes(Number(r.stake)))
            .sort((a, b) => Number(a.stake) - Number(b.stake));
          setRounds(filtered);
          // Seed live counts from initial API data
          const initial: Record<string, number> = {};
          filtered.forEach(r => { initial[r.id] = r.player_count; });
          setLiveCounts(initial);
          setIsAgent(!!getAgentJwt());
        }
        if (!cancelled && statsData) setStats(statsData);
      } catch (err: unknown) {
        if (!cancelled) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to load';
          // Check if this is an auth error when running outside Telegram
          if (errorMessage.includes('Unauthorized') || errorMessage.includes('INVALID_TELEGRAM_AUTH')) {
            setError('This app must be opened from Telegram. Please use the @FidelBingoBot to access the game.');
          } else {
            setError(errorMessage);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [retryCount]);

  // Listen for live player count updates from WebSocket
  useEffect(() => {
    function onPlayerJoined(payload: { playerCount: number }, roundId?: string) {
      // PLAYER_JOINED fires in the round room — we listen globally and match by room
      // but on GameScreen we don't know roundId from the payload alone, so we
      // refresh rounds list every time a player joins any visible round
      setRounds(prev => prev.map(r =>
        r.status === 'pending' ? { ...r, player_count: payload.playerCount } : r
      ));
    }

    function onCartelaTaken(payload: { playerCount: number }) {
      setRounds(prev => prev.map(r =>
        r.status === 'pending' ? { ...r, player_count: payload.playerCount } : r
      ));
    }

    function onRoundStarted(payload: { roundId: string; playerCount: number; derash: number }) {
      setRounds(prev => prev.map(r =>
        r.id === payload.roundId
          ? { ...r, status: 'active', player_count: payload.playerCount, derash: payload.derash }
          : r
      ));
      updateCount(payload.roundId, payload.playerCount);
    }

    function onRoundVoidOrCancelled(payload: { roundId: string }) {
      setRounds(prev => prev.filter(r => r.id !== payload.roundId));
    }

    socket.on('PLAYER_JOINED', onPlayerJoined);
    socket.on('CARTELA_TAKEN', onCartelaTaken);
    socket.on('ROUND_STARTED', onRoundStarted);
    socket.on('ROUND_VOID', onRoundVoidOrCancelled);
    socket.on('ROUND_CANCELLED', onRoundVoidOrCancelled);

    return () => {
      socket.off('PLAYER_JOINED', onPlayerJoined);
      socket.off('CARTELA_TAKEN', onCartelaTaken);
      socket.off('ROUND_STARTED', onRoundStarted);
      socket.off('ROUND_VOID', onRoundVoidOrCancelled);
      socket.off('ROUND_CANCELLED', onRoundVoidOrCancelled);
    };
  }, [updateCount]);

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0e1a', color: '#fff' }}>

      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg, #0d1b2e 0%, #112240 100%)', padding: '18px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: 17, color: '#0a0e1a',
              boxShadow: '0 4px 16px rgba(245,158,11,0.5)',
            }}>FB</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: 0.3, color: '#f1f5f9' }}>Fidel Bingo</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>Ethiopia's #1 Bingo</div>
            </div>
          </div>
          <div style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 20, padding: '5px 12px', fontSize: 11, color: '#f87171', fontWeight: 700, letterSpacing: 0.5,
          }}>
            ● LIVE
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <div style={{ padding: '24px 20px 20px', background: 'linear-gradient(180deg, #112240 0%, #0a0e1a 100%)' }}>
        <div style={{ fontSize: 12, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
          Pick a stake, win big
        </div>
        <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.2 }}>
          Win Up To <span style={{ color: '#f59e0b' }}>40,000 Birr</span><br />
          <span style={{ fontSize: 16, fontWeight: 500, color: '#94a3b8' }}>Every game, every round</span>
        </div>
      </div>

      {/* ── Games list ── */}
      <div style={{ padding: '0 16px 24px' }}>
        <div style={{ fontSize: 11, color: '#475569', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14 }}>
          Active Rounds
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#475569', fontSize: 14 }}>
            Loading games…
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 16, padding: 20, textAlign: 'center' }}>
            <div style={{ color: '#f87171', marginBottom: 12, fontSize: 14 }}>{error}</div>
            <button onClick={() => { setError(null); setRetryCount(c => c + 1); }}
              style={{ background: '#f59e0b', border: 'none', borderRadius: 10, padding: '10px 24px', color: '#0a0e1a', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && rounds.length === 0 && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', color: '#475569' }}>
            No games right now — check back soon.
          </div>
        )}

        {!loading && !error && rounds.map((round) => {
          const isPending = round.status === 'pending';
          const playerCount = liveCounts[round.id] ?? round.player_count;

          return (
            <button key={round.id}
              onClick={() => {
                sessionStorage.setItem('selectedStake', String(round.stake));
                if (isPending) {
                  sessionStorage.setItem('stakeSelectedForRound', round.id);
                  navigate(`/rounds/${round.id}/cartela`);
                } else {
                  sessionStorage.setItem('selectedRoundId', round.id);
                  sessionStorage.setItem('stakeSelectedForRound', round.id);
                  navigate(`/rounds/${round.id}/game`);
                }
              }}
              style={{
                display: 'block', width: '100%', marginBottom: 16,
                background: '#0d1b2e', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16, padding: '16px 18px', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: 26, fontWeight: 900, color: '#f1f5f9' }}>{round.stake}</span>
                  <span style={{ fontSize: 13, color: '#64748b', marginLeft: 5 }}>Birr / cartela</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#f59e0b' }}>{Math.round(round.derash)} Birr</div>
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>Prize Pool</div>
                </div>
              </div>

              {/* Player count bar */}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13 }}>👥</span>
                  <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
                    {playerCount} / {round.max_players} players
                  </span>
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                  color: isPending ? '#34d399' : '#f59e0b',
                  background: isPending ? 'rgba(52,211,153,0.12)' : 'rgba(245,158,11,0.12)',
                  borderRadius: 8, padding: '3px 8px',
                }}>
                  {isPending ? '● WAITING' : '● IN PROGRESS'}
                </div>
              </div>

              {/* Fill bar */}
              <div style={{ marginTop: 8, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  width: `${Math.min(100, (playerCount / round.max_players) * 100)}%`,
                  background: isPending
                    ? 'linear-gradient(90deg, #34d399, #10b981)'
                    : 'linear-gradient(90deg, #f59e0b, #d97706)',
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Stats strip — real data ── */}
      <div style={{ margin: '0 16px 24px', background: '#0d1b2e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '18px 0', display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#f59e0b' }}>
            {stats ? fmt(stats.totalPlayers) : '…'}
          </div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 3 }}>Players</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#f59e0b' }}>
            {stats ? fmt(stats.totalGames) : '…'}
          </div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 3 }}>Games Played</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#f59e0b' }}>24/7</div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 3 }}>Always Live</div>
        </div>
      </div>

      {/* ── Agent Dashboard Button ── */}
      {isAgent && (
        <div style={{ margin: '0 16px 24px' }}>
          <button
            onClick={() => navigate('/agent/dashboard')}
            style={{
              display: 'block', width: '100%',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none', borderRadius: 16, padding: '16px 20px',
              cursor: 'pointer', textAlign: 'left',
              boxShadow: '0 4px 16px rgba(16,185,129,0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📊</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 2 }}>Agent Dashboard</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>View your referrals and earnings</div>
                </div>
              </div>
              <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.8)' }}>→</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
