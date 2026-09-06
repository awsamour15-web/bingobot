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
        // Wait for auth to complete BEFORE making API calls
        await initAuth();
        
        const [data, statsData] = await Promise.all([
          getRounds(),
          getSystemStats().catch(() => null),
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

    // Re-fetch rounds on socket reconnect so the lobby stays in sync
    function onReconnect() {
      getRounds().then(data => {
        const filtered = data
          .filter(r => ALLOWED_STAKES.includes(Number(r.stake)))
          .sort((a, b) => Number(a.stake) - Number(b.stake));
        setRounds(filtered);
        const counts: Record<string, number> = {};
        filtered.forEach(r => { counts[r.id] = r.player_count; });
        setLiveCounts(counts);
      }).catch(() => {});
    }

    socket.on('connect', onReconnect);
    socket.on('PLAYER_JOINED', onPlayerJoined);
    socket.on('CARTELA_TAKEN', onCartelaTaken);
    socket.on('ROUND_STARTED', onRoundStarted);
    socket.on('ROUND_VOID', onRoundVoidOrCancelled);
    socket.on('ROUND_CANCELLED', onRoundVoidOrCancelled);

    return () => {
      socket.off('connect', onReconnect);
      socket.off('PLAYER_JOINED', onPlayerJoined);
      socket.off('CARTELA_TAKEN', onCartelaTaken);
      socket.off('ROUND_STARTED', onRoundStarted);
      socket.off('ROUND_VOID', onRoundVoidOrCancelled);
      socket.off('ROUND_CANCELLED', onRoundVoidOrCancelled);
    };
  }, [updateCount]);

  return (
    <div style={{ minHeight: '100dvh', background: 'radial-gradient(circle at 75% 0%, rgba(247,201,72,0.12), transparent 30%), linear-gradient(180deg, #08161a 0%, #071014 52%, #04090c 100%)', color: '#f7f8f5' }}>

      {/* ── Header ── */}
      <div style={{ background: 'rgba(5,15,18,0.88)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(85,224,176,0.14)', padding: '12px 16px', boxShadow: '0 8px 24px rgba(0,0,0,0.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: 'linear-gradient(135deg, #f7c948, #ee8f2d)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: 17, color: '#0a0e1a',
              boxShadow: '0 5px 18px rgba(247,201,72,0.3)',
            }}>FB</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: 0.3, color: '#f1f5f9' }}>Fidel Bingo</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Ethiopia's #1 Bingo</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => navigate('/')}
              style={{
                background: 'rgba(85,224,176,0.08)', border: '1px solid rgba(85,224,176,0.18)',
                borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#9deed1', fontSize: 18,
              }}
              aria-label="Home"
            >
              🏠
            </button>
            <div style={{
              background: 'rgba(255,119,150,0.12)', border: '1px solid rgba(255,119,150,0.3)',
              borderRadius: 9, padding: '6px 10px', fontSize: 10, color: '#ff9db7', fontWeight: 800, letterSpacing: 0.8,
            }}>
              LIVE
            </div>
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <div style={{ padding: '24px 16px 20px', background: 'linear-gradient(135deg, rgba(12,46,47,0.86), rgba(7,16,20,0.94))', borderBottom: '1px solid rgba(85,224,176,0.12)' }}>
        <div style={{ fontSize: 11, color: '#55e0b0', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 9, fontWeight: 800 }}>
          Choose your stake
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.2, color: '#f8fafc' }}>
          Win Up To <span style={{ color: '#f7c948' }}>40,000 Birr</span>
        </div>
        <div style={{ fontSize: 14, color: '#b8d2ca', marginTop: 7 }}>Pick a live round and jump in instantly.</div>
      </div>

      {/* ── Games list ── */}
      <div style={{ padding: '18px 16px 28px' }}>
        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14 }}>
          Active Rounds
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#1e293b', fontSize: 14 }}>
            &nbsp;
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
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                sessionStorage.setItem('selectedStake', String(round.stake));
                sessionStorage.setItem('stakeSelectedForRound', round.id);
                if (isPending) {
                  navigate(`/rounds/${round.id}/cartela`);
                } else {
                  sessionStorage.setItem('selectedRoundId', round.id);
                  navigate(`/rounds/${round.id}/game`);
                }
              }}
              style={{
                display: 'block', width: '100%', marginBottom: 14,
                background: 'linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(17,24,39,0.88) 100%)',
                border: '1px solid rgba(148,163,184,0.08)',
                borderRadius: 20, padding: '16px 16px 14px', cursor: 'pointer', textAlign: 'left',
                boxShadow: '0 14px 28px rgba(15,23,42,0.2), inset 0 1px 0 rgba(255,255,255,0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 28, fontWeight: 900, color: '#f8fafc' }}>{round.stake}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Birr / cartela</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#f59e0b' }}>{Math.round(round.derash)} Birr</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, letterSpacing: 0.6, textTransform: 'uppercase' }}>Prize pool</div>
                </div>
              </div>

              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13 }}>👥</span>
                  <span style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>
                    {playerCount} / {round.active_cartela_count ?? round.max_players}
                  </span>
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: 0.8,
                  color: isPending ? '#a7f3d0' : '#fcd34d',
                  background: isPending ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                  border: isPending ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(245,158,11,0.28)',
                  borderRadius: 10, padding: '4px 8px',
                }}>
                  {isPending ? 'WAITING' : 'LIVE'}
                </div>
              </div>

              <div style={{ marginTop: 10, height: 6, borderRadius: 999, background: 'rgba(148,163,184,0.08)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 999,
                  width: `${Math.min(100, (playerCount / (round.active_cartela_count ?? round.max_players)) * 100)}%`,
                  background: isPending
                    ? 'linear-gradient(90deg, #2dd4bf, #14b8a6)'
                    : 'linear-gradient(90deg, #f59e0b, #d97706)',
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Stats strip — real data ── */}
      <div style={{ margin: '0 16px 24px', background: 'linear-gradient(180deg, rgba(13,27,46,0.82) 0%, rgba(15,23,42,0.94) 100%)', border: '1px solid rgba(148,163,184,0.08)', borderRadius: 20, padding: '16px 10px', display: 'flex', justifyContent: 'space-around', textAlign: 'center', boxShadow: '0 12px 26px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.02)' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#f59e0b' }}>
            {stats ? fmt(stats.totalPlayers) : '…'}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Players</div>
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
