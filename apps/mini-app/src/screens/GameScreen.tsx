import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { initAuth, getJwt } from '../lib/auth';
import { getRounds, getSystemStats, getProfile, getReferralLink } from '../lib/api';
import { socket } from '../lib/socket';
import type { RoundListItem, RoundWonPayload } from '@fidel/shared';

const ALLOWED_STAKES = [10, 20, 50, 100, 500];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Accent color per stake level
function stakeAccent(stake: number): string {
  if (stake >= 500) return '#ef4444';
  if (stake >= 100) return '#f59e0b';
  if (stake >= 50)  return '#a78bfa';
  if (stake >= 20)  return '#34d399';
  return '#60a5fa';
}

interface WinnerTick {
  id: number;
  username: string;
  amount: number;
  stake: number;
}

let tickId = 0;

export default function GameScreen() {
  const navigate = useNavigate();
  const [rounds, setRounds] = useState<RoundListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [stats, setStats] = useState<{ totalPlayers: number; totalGames: number } | null>(null);
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});
  const [mainBalance, setMainBalance] = useState<number | null>(null);
  const [playBalance, setPlayBalance] = useState<number | null>(null);
  const [winnerTicks, setWinnerTicks] = useState<WinnerTick[]>([]);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const tickerRef = useRef<HTMLDivElement>(null);

  const updateCount = useCallback((roundId: string, count: number) => {
    setLiveCounts(prev => ({ ...prev, [roundId]: count }));
  }, []);

  // Fetch referral link once on mount
  useEffect(() => {
    getReferralLink().then(r => setReferralLink(r.referralLink)).catch(() => {});
  }, []);

  // Listen for ROUND_WON to power the winners ticker
  useEffect(() => {
    function onRoundWon(payload: RoundWonPayload) {
      const wonRoundId = (payload as any).roundId;
      const stake = wonRoundId
        ? (rounds.find(r => r.id === wonRoundId)?.stake ?? rounds.find(r => r.status === 'active')?.stake ?? 0)
        : (rounds.find(r => r.status === 'active')?.stake ?? 0);
      payload.winners.slice(0, 2).forEach(w => {
        const tick: WinnerTick = { id: ++tickId, username: w.username, amount: w.amount, stake: Number(stake) };
        setWinnerTicks(prev => [tick, ...prev].slice(0, 6));
      });
    }
    socket.on('ROUND_WON', onRoundWon);
    return () => { socket.off('ROUND_WON', onRoundWon); };
  }, [rounds]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        await initAuth();
        const [data, statsData, profile] = await Promise.all([
          getRounds(),
          getSystemStats().catch(() => null),
          getProfile().catch(() => null),
        ]);
        if (!cancelled) {
          if (profile) {
            setMainBalance(Number(profile.mainWallet?.balance ?? 0));
            setPlayBalance(Number(profile.playWallet?.balance ?? 0));
          }
          const filtered = data
            .filter(r => ALLOWED_STAKES.includes(Number(r.stake)))
            .sort((a, b) => Number(a.stake) - Number(b.stake));
          setRounds(filtered);
          const initial: Record<string, number> = {};
          filtered.forEach(r => { initial[r.id] = r.player_count; });
          setLiveCounts(initial);
        }
        if (!cancelled && statsData) setStats(statsData);
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load';
          if (msg.includes('Unauthorized') || msg.includes('INVALID_TELEGRAM_AUTH')) {
            setError('This app must be opened from Telegram. Please use the @FidelBingoBot to access the game.');
          } else {
            setError(msg);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [retryCount]);

  useEffect(() => {
    if (rounds.length === 0) return;
    const token = getJwt() ?? '';
    rounds.forEach(r => socket.emit('JOIN_ROUND', { roundId: r.id, token }));
  }, [rounds.map(r => r.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onPlayerJoined(payload: { playerCount: number; roundId?: string }) {
      if (payload.roundId) {
        updateCount(payload.roundId, payload.playerCount);
        setRounds(prev => prev.map(r => r.id === payload.roundId ? { ...r, player_count: payload.playerCount } : r));
      } else {
        setRounds(prev => prev.map(r => r.status === 'pending' ? { ...r, player_count: payload.playerCount } : r));
      }
    }
    function onCartelaTaken(payload: { playerCount: number; roundId?: string }) {
      if (payload.roundId) {
        updateCount(payload.roundId, payload.playerCount);
        setRounds(prev => prev.map(r => r.id === payload.roundId ? { ...r, player_count: payload.playerCount } : r));
      } else {
        setRounds(prev => prev.map(r => r.status === 'pending' ? { ...r, player_count: payload.playerCount } : r));
      }
    }
    function onRoundStarted(payload: { roundId: string; playerCount: number; derash: number }) {
      setRounds(prev => prev.map(r =>
        r.id === payload.roundId ? { ...r, status: 'active', player_count: payload.playerCount, derash: payload.derash } : r
      ));
      updateCount(payload.roundId, payload.playerCount);
    }
    function onRoundVoidOrCancelled(payload: { roundId: string }) {
      setRounds(prev => prev.filter(r => r.id !== payload.roundId));
    }
    function onReconnect() {
      getRounds().then(data => {
        const filtered = data
          .filter(r => ALLOWED_STAKES.includes(Number(r.stake)))
          .sort((a, b) => Number(a.stake) - Number(b.stake));
        setRounds(filtered);
        const counts: Record<string, number> = {};
        filtered.forEach(r => { counts[r.id] = r.player_count; });
        setLiveCounts(counts);
        const token = getJwt() ?? '';
        filtered.forEach(r => socket.emit('JOIN_ROUND', { roundId: r.id, token }));
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
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(180deg, #110d2e 0%, #0c0a1e 60%, #08061a 100%)',
      color: '#f1f5f9',
      maxWidth: 480,
      margin: '0 auto',
      paddingBottom: 80,
    }}>
      <style>{`
        @keyframes gsPulse { 0%,100%{opacity:.7;transform:scale(1)} 50%{opacity:1;transform:scale(1.18)} }
        @keyframes gsShimmer { from{transform:translateX(-120%) skewX(-15deg)} to{transform:translateX(220%) skewX(-15deg)} }
        @keyframes gsTickIn { from{opacity:0;transform:translateY(-10px) scale(0.95)} to{opacity:1;transform:translateY(0) scale(1)} }
        .gs-btn:active { transform: scale(0.97); }
        .gs-refer-btn:active { transform: scale(0.97); opacity: 0.85; }
      `}</style>

      {/* ── Top header — logo + balance ── */}
      <div style={{
        padding: '14px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(12, 10, 30, 0.97)',
        borderBottom: '1px solid rgba(124,58,237,0.2)',
        backdropFilter: 'blur(16px)',
      }}>
        {/* Logo + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 14,
            background: 'linear-gradient(145deg, #7c3aed, #e040fb)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 15, color: '#fff',
            boxShadow: '0 4px 16px rgba(124,58,237,0.45)',
            flexShrink: 0,
          }}>FB</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#f1f5f9', letterSpacing: 0.1 }}>Fidel Bingo</div>
            <div style={{ fontSize: 9, color: '#e040fb', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800, marginTop: 1 }}>Live Games</div>
          </div>
        </div>

        {/* Balance pill */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
          background: 'rgba(124,58,237,0.1)',
          border: '1px solid rgba(124,58,237,0.3)',
          borderRadius: 14, padding: '7px 13px', gap: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', fontWeight: 700, letterSpacing: '0.08em' }}>MAIN</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: '#ffd54f' }}>
              {mainBalance === null ? '…' : `${Number(mainBalance).toFixed(2)}`}
              <span style={{ fontSize: 9, color: 'rgba(255,213,79,0.6)', marginLeft: 2 }}>ETB</span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', fontWeight: 700, letterSpacing: '0.08em' }}>PLAY</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: '#a78bfa' }}>
              {playBalance === null ? '…' : `${Number(playBalance).toFixed(2)}`}
              <span style={{ fontSize: 9, color: 'rgba(167,139,250,0.6)', marginLeft: 2 }}>ETB</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Section title ── */}
      <div style={{
        padding: '14px 18px 12px',
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid rgba(124,58,237,0.12)',
        background: 'rgba(12,10,30,0.9)',
        backdropFilter: 'blur(12px)',
      }}>
        <span style={{ fontSize: 24 }}>🎱</span>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#f1f5f9', letterSpacing: -0.3 }}>
          ጨዋታዎን ይምረጡ
        </div>
        {stats && (
          <div style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
            background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)',
            borderRadius: 999, padding: '4px 10px', fontSize: 9, color: '#34d399', fontWeight: 800, letterSpacing: '0.08em',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block', animation: 'gsPulse 1.6s ease-in-out infinite' }} />
            LIVE
          </div>
        )}
      </div>

      {/* ── Winners ticker ── */}
      {winnerTicks.length > 0 && (
        <div ref={tickerRef} style={{
          padding: '6px 14px',
          background: 'rgba(12,10,30,0.95)',
          borderBottom: '1px solid rgba(124,58,237,0.1)',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {winnerTicks.slice(0, 3).map((t, i) => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              animation: i === 0 ? 'gsTickIn 0.35s ease' : 'none',
              opacity: 1 - i * 0.28,
            }}>
              <span style={{ fontSize: 13 }}>🎉</span>
              <span style={{ fontSize: 11, color: '#e040fb', fontWeight: 800 }}>{t.username}</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>won</span>
              <span style={{ fontSize: 11, color: '#34d399', fontWeight: 800 }}>{fmt(t.amount)} ETB</span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginLeft: 'auto' }}>{t.stake} ብር game</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Referral banner ── */}
      {referralLink && (
        <div style={{
          margin: '12px 14px 0',
          background: 'linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(224,64,251,0.10) 100%)',
          border: '1px solid rgba(124,58,237,0.35)',
          borderRadius: 16,
          padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 28, flexShrink: 0 }}>🎁</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#f1f5f9', lineHeight: 1.2 }}>Invite friends, earn bonus!</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>Share your link — get rewarded when they play</div>
          </div>
          <button
            className="gs-refer-btn"
            onClick={() => {
              if (copyDone) return;
              if (WebApp.openTelegramLink) {
                const shareText = encodeURIComponent('Join me on Fidel Bingo! 🎱 Play live bingo and win real ETB.\n');
                WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${shareText}`);
              } else {
                navigator.clipboard.writeText(referralLink).catch(() => {});
              }
              setCopyDone(true);
              setTimeout(() => setCopyDone(false), 3000);
            }}
            style={{
              flexShrink: 0,
              padding: '9px 14px',
              borderRadius: 999,
              border: 'none',
              background: copyDone
                ? 'rgba(52,211,153,0.2)'
                : 'linear-gradient(135deg, #7c3aed, #e040fb)',
              color: copyDone ? '#34d399' : '#fff',
              fontWeight: 800, fontSize: 11, cursor: 'pointer',
              letterSpacing: '0.04em',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            {copyDone ? '✓ Shared!' : '📤 Invite'}
          </button>
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ padding: '16px 14px 0' }}>

        {loading && (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>&nbsp;</div>
        )}

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 16, padding: 20, textAlign: 'center', margin: '20px 0',
          }}>
            <div style={{ color: '#f87171', marginBottom: 12, fontSize: 14 }}>{error}</div>
            <button
              onClick={() => { setError(null); setRetryCount(c => c + 1); }}
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #e040fb)',
                border: 'none', borderRadius: 999, padding: '10px 24px',
                color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 14,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && rounds.length === 0 && (
          <div style={{
            background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)',
            borderRadius: 16, padding: '40px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.3)',
          }}>
            No games right now — check back soon.
          </div>
        )}

        {!loading && !error && rounds.map((round, idx) => {
          const isPending = round.status === 'pending';
          const playerCount = liveCounts[round.id] ?? round.player_count;
          const accent = stakeAccent(Number(round.stake));
          const maxPlayers = round.active_cartela_count ?? round.max_players;
          const fillPct = Math.min(100, (playerCount / maxPlayers) * 100);
          const derash = Math.round(round.derash);
          const showJackpot = round.jackpot_enabled === true;

          return (
            <div key={round.id} style={{ marginBottom: 12, animation: `card-enter 0.32s ${idx * 0.06}s cubic-bezier(0.22,1,0.36,1) both` }}>

              {/* Jackpot banner */}
              {showJackpot && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 14px',
                  background: 'linear-gradient(90deg, #4c1d95 0%, #7c3aed 50%, #4c1d95 100%)',
                  borderRadius: '14px 14px 0 0',
                  marginBottom: -2,
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 60, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)', animation: 'gsShimmer 3s ease-in-out infinite', pointerEvents: 'none' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 16 }}>🎁</span>
                    <span style={{ fontSize: 10, fontWeight: 900, color: '#fff', letterSpacing: '0.1em' }}>PROGRESSIVE JACKPOT</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#ffd54f' }}>
                    {fmt(derash)} ብር
                  </span>
                </div>
              )}

              {/* Stake card */}
              <button
                className="gs-btn"
                onClick={() => {
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
                  display: 'block', width: '100%', padding: 0,
                  background: 'rgba(26,21,53,0.9)',
                  border: '1px solid rgba(124,58,237,0.2)',
                  borderRadius: showJackpot ? '0 0 14px 14px' : 14,
                  cursor: 'pointer', textAlign: 'left', overflow: 'hidden',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'stretch' }}>
                  {/* Left accent bar */}
                  <div style={{
                    width: 4,
                    background: `linear-gradient(180deg, ${accent}, ${accent}44)`,
                    borderRadius: showJackpot ? '0 0 0 14px' : '14px 0 0 14px',
                    flexShrink: 0,
                  }} />

                  <div style={{ flex: 1, padding: '14px 14px 14px 12px' }}>
                    {/* Row 1 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* Stake amount */}
                      <div style={{ minWidth: 70 }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 2 }}>ባለ</div>
                        <div style={{ fontSize: 26, fontWeight: 900, color: '#f1f5f9', lineHeight: 1 }}>
                          {round.stake} <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>ብር</span>
                        </div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>{playerCount} ተጫዋቾች</div>
                      </div>

                      {/* Status badge */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 999,
                        background: isPending ? 'rgba(52,211,153,0.12)' : 'rgba(245,158,11,0.12)',
                        border: `1px solid ${isPending ? 'rgba(52,211,153,0.3)' : 'rgba(245,158,11,0.3)'}`,
                      }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: isPending ? '#34d399' : '#f59e0b',
                          display: 'inline-block',
                          animation: 'gsPulse 1.5s ease-in-out infinite',
                        }} />
                        <span style={{ fontSize: 8, fontWeight: 900, color: isPending ? '#34d399' : '#f59e0b', letterSpacing: '0.06em' }}>
                          {isPending ? 'በሚጠባ ላይ' : 'በመጠበቅ ላይ'}
                        </span>
                      </div>

                      <div style={{ flex: 1 }} />

                      {/* Derash + action button */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: '0.06em' }}>ደራሽ</div>
                          <div style={{ fontSize: 19, fontWeight: 900, color: '#ffd54f', lineHeight: 1 }}>
                            {fmt(derash)} <span style={{ fontSize: 11, color: 'rgba(255,213,79,0.5)' }}>ብር</span>
                          </div>
                        </div>

                        {/* Action button */}
                        <div style={{
                          minWidth: 68, height: 38,
                          background: isPending
                            ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
                            : 'linear-gradient(135deg, #b45309, #f59e0b)',
                          borderRadius: 999,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 900, color: '#fff',
                          boxShadow: isPending
                            ? '0 4px 14px rgba(124,58,237,0.5)'
                            : '0 4px 14px rgba(245,158,11,0.4)',
                          letterSpacing: '0.04em',
                          position: 'relative', overflow: 'hidden',
                        }}>
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)', animation: 'gsShimmer 2.5s ease-in-out infinite', pointerEvents: 'none' }} />
                          {isPending ? 'ይጠብቁ' : '▶ ይጫወቱ'}
                        </div>
                      </div>
                    </div>

                    {/* Fill bar */}
                    <div style={{ marginTop: 12, height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 999,
                        width: `${fillPct}%`,
                        background: `linear-gradient(90deg, ${accent}, ${accent}99)`,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Bottom stats strip ── */}
      {stats && (
        <div style={{
          margin: '20px 14px 0',
          background: 'rgba(124,58,237,0.07)',
          border: '1px solid rgba(124,58,237,0.15)',
          borderRadius: 16, padding: '14px 10px',
          display: 'flex', justifyContent: 'space-around', textAlign: 'center',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#ffd54f' }}>{fmt(stats.totalPlayers)}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2, letterSpacing: '0.06em' }}>PLAYERS</div>
          </div>
          <div style={{ width: 1, background: 'rgba(124,58,237,0.2)' }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#a78bfa' }}>{fmt(stats.totalGames)}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2, letterSpacing: '0.06em' }}>GAMES</div>
          </div>
          <div style={{ width: 1, background: 'rgba(124,58,237,0.2)' }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#e040fb' }}>24/7</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2, letterSpacing: '0.06em' }}>LIVE</div>
          </div>
        </div>
      )}
    </div>
  );
}
