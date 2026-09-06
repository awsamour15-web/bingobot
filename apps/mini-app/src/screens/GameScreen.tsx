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
    <div style={{ minHeight: '100dvh', background: 'radial-gradient(circle at 90% 0%, rgba(72,111,190,0.18), transparent 28%), radial-gradient(circle at -10% 36%, rgba(44,188,157,0.12), transparent 30%), linear-gradient(180deg, #0a111d 0%, #060b13 54%, #03060b 100%)', color: '#f7f8f5' }}>

      {/* ── Header ── */}
      <div style={{ background: 'rgba(8,14,25,0.88)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(134,165,226,0.16)', padding: '12px 18px', boxShadow: '0 8px 24px rgba(0,0,0,0.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 13,
              background: 'linear-gradient(145deg, #ffe072, #d99c22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: 17, color: '#0a0e1a',
              boxShadow: '0 5px 18px rgba(231,176,39,0.24)',
            }}>FB</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18, letterSpacing: 0.2, color: '#f1f5f9' }}>Fidel Bingo</div>
              <div style={{ fontSize: 10, color: '#6ed4bd', marginTop: 2, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 800 }}>Live rooms</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => navigate('/')}
              style={{
                background: 'rgba(99,212,186,0.08)', border: '1px solid rgba(99,212,186,0.2)',
                borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#9deed1', fontSize: 18,
              }}
              aria-label="Home"
            >
              🏠
            </button>
            <div style={{
              background: 'rgba(99,212,186,0.1)', border: '1px solid rgba(99,212,186,0.25)',
              borderRadius: 9, padding: '6px 10px', fontSize: 10, color: '#8ae5d0', fontWeight: 800, letterSpacing: 0.8,
            }}>
              LIVE
            </div>
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <div style={{ position: 'relative', overflow: 'hidden', padding: '28px 18px 26px', background: 'linear-gradient(135deg, rgba(18,51,47,0.86), rgba(11,25,43,0.94))', borderBottom: '1px solid rgba(99,212,186,0.16)' }}>
        <div style={{ position: 'absolute', right: 22, top: 18, width: 94, height: 94, borderRadius: '50%', border: '1px solid rgba(243,207,100,0.32)', boxShadow: '0 0 32px rgba(99,212,186,0.14)' }} />
        <div style={{ position: 'relative', zIndex: 1, fontSize: 11, color: '#72dfc4', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 9, fontWeight: 800 }}>
          Live bingo rooms
        </div>
        <div style={{ position: 'relative', zIndex: 1, fontSize: 30, fontWeight: 900, lineHeight: 1.12, color: '#f8fafc' }}>
          Choose your <span style={{ color: '#f3cf64' }}>stake</span>
        </div>
        <div style={{ position: 'relative', zIndex: 1, fontSize: 13, color: '#b5cfc9', marginTop: 9 }}>Pick a room, claim your cartela, and play live.</div>
        <div style={{ position: 'relative', zIndex: 1, display: 'inline-flex', marginTop: 16, padding: '6px 9px', borderRadius: 8, background: 'rgba(243,207,100,0.12)', border: '1px solid rgba(243,207,100,0.2)', color: '#f3cf64', fontSize: 10, fontWeight: 900, letterSpacing: 0.7 }}>JACKPOTS UP TO 40,000 BIRR</div>
      </div>

      {/* ── Games list ── */}
      <div style={{ padding: '20px 16px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#9aa8bc', fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            Available rooms
          </div>
          <div style={{ fontSize: 10, color: '#63d4ba', fontWeight: 800 }}>LIVE UPDATES</div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#718096', fontSize: 14 }}>
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
          <div style={{ background: 'rgba(17,27,43,0.8)', border: '1px solid rgba(134,165,226,0.14)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', color: '#8491a5' }}>
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
                background: 'linear-gradient(145deg, rgba(21,32,51,0.98) 0%, rgba(12,20,34,0.96) 100%)',
                border: `1px solid ${isPending ? 'rgba(99,212,186,0.22)' : 'rgba(243,207,100,0.24)'}`,
                borderRadius: 18, padding: '17px 16px 15px', cursor: 'pointer', textAlign: 'left',
                boxShadow: '0 16px 30px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 58, padding: '8px 10px', borderRadius: 11, background: isPending ? 'rgba(99,212,186,0.12)' : 'rgba(243,207,100,0.12)', color: isPending ? '#8ae5d0' : '#f3cf64', fontSize: 25, fontWeight: 900 }}>{round.stake}</span>
                  <span style={{ fontSize: 11, color: '#9aa8bc', fontWeight: 700 }}>BIRR / CARTELA</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#f3cf64' }}>{Math.round(round.derash)} Birr</div>
                  <div style={{ fontSize: 9, color: '#8190a5', marginTop: 2, letterSpacing: 0.8, textTransform: 'uppercase' }}>PRIZE POOL</div>
                </div>
              </div>

              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13 }}>◉</span>
                  <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>
                    {playerCount} / {round.active_cartela_count ?? round.max_players}
                  </span>
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: 0.8,
                  color: isPending ? '#a7f3d0' : '#fcd34d',
                  background: isPending ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                  border: isPending ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(245,158,11,0.28)',
                  borderRadius: 7, padding: '5px 8px',
                }}>
                  {isPending ? 'WAITING' : 'LIVE'}
                </div>
              </div>

              <div style={{ marginTop: 10, height: 6, borderRadius: 999, background: 'rgba(148,163,184,0.08)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 999,
                  width: `${Math.min(100, (playerCount / (round.active_cartela_count ?? round.max_players)) * 100)}%`,
                  background: isPending
                    ? 'linear-gradient(90deg, #63d4ba, #2b9d9c)'
                    : 'linear-gradient(90deg, #f3cf64, #d79a2c)',
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 11, color: isPending ? '#78dfc7' : '#f3cf64', fontSize: 10, fontWeight: 900, letterSpacing: 0.8 }}>{isPending ? 'CHOOSE CARTELA  →' : 'JOIN LIVE ROOM  →'}</div>
            </button>
          );
        })}
      </div>

      {/* ── Stats strip — real data ── */}
      <div style={{ margin: '0 16px 24px', background: 'linear-gradient(145deg, rgba(21,32,51,0.9), rgba(10,17,29,0.94))', border: '1px solid rgba(134,165,226,0.14)', borderRadius: 18, padding: '16px 10px', display: 'flex', justifyContent: 'space-around', textAlign: 'center', boxShadow: '0 12px 26px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#f3cf64' }}>
            {stats ? fmt(stats.totalPlayers) : '…'}
          </div>
          <div style={{ fontSize: 10, color: '#8795aa', marginTop: 3 }}>Players</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#63d4ba' }}>
            {stats ? fmt(stats.totalGames) : '…'}
          </div>
          <div style={{ fontSize: 10, color: '#8795aa', marginTop: 3 }}>Games Played</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#8aa9e7' }}>24/7</div>
          <div style={{ fontSize: 10, color: '#8795aa', marginTop: 3 }}>Always Live</div>
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
