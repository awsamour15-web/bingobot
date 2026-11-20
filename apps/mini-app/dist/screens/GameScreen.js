import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { initAuth, getJwt } from '../lib/auth';
import { getRounds, getSystemStats, getProfile, getReferralLink } from '../lib/api';
import { socket } from '../lib/socket';
const ALLOWED_STAKES = [10, 20, 50, 100, 500];
function fmt(n) {
    if (n >= 1_000_000)
        return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)
        return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}
// Per-stake color palette — icon, gradient, glow
const STAKE_THEME = {
    10: { icon: '🔵', color: '#60a5fa', glow: 'rgba(96,165,250,0.35)', label: 'Starter' },
    20: { icon: '🟢', color: '#34d399', glow: 'rgba(52,211,153,0.35)', label: 'Basic' },
    50: { icon: '🟣', color: '#a78bfa', glow: 'rgba(167,139,250,0.35)', label: 'Standard' },
    100: { icon: '🟡', color: '#fbbf24', glow: 'rgba(251,191,36,0.35)', label: 'Pro' },
    500: { icon: '🔴', color: '#f87171', glow: 'rgba(248,113,113,0.35)', label: 'VIP' },
};
function getTheme(stake) {
    return STAKE_THEME[stake] ?? { icon: '⚪', color: '#94a3b8', glow: 'rgba(148,163,184,0.3)', label: '' };
}
let tickId = 0;
// ── Winner ticker item ────────────────────────────────────────────────────────
function TickerItem({ tick, fresh }) {
    const theme = getTheme(tick.stake);
    return (_jsxs("div", { style: {
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 14px',
            animation: fresh ? 'gs-tick-in 0.4s cubic-bezier(0.22,1,0.36,1) both' : 'none',
        }, children: [_jsx("span", { style: { fontSize: 14 }, children: "\uD83C\uDF89" }), _jsx("span", { style: { fontSize: 12, fontWeight: 800, color: '#e040fb' }, children: tick.username }), _jsx("span", { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)' }, children: "won" }), _jsx("span", { style: { fontSize: 13, fontWeight: 900, color: '#34d399' }, children: fmt(tick.amount) }), _jsx("span", { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)' }, children: "ETB" }), _jsxs("div", { style: {
                    marginLeft: 'auto', fontSize: 9, fontWeight: 700,
                    color: theme.color,
                    background: `${theme.color}18`,
                    border: `1px solid ${theme.color}33`,
                    borderRadius: 999, padding: '2px 7px',
                }, children: [tick.stake, " \u1265\u122D"] })] }));
}
// ── Individual game card ──────────────────────────────────────────────────────
function GameCard({ round, playerCount, idx, onPress, }) {
    const isPending = round.status === 'pending';
    const theme = getTheme(Number(round.stake));
    const maxPlayers = round.active_cartela_count ?? round.max_players;
    const fillPct = Math.min(100, (playerCount / maxPlayers) * 100);
    const derash = Math.round(round.derash);
    const showJackpot = round.jackpot_enabled === true;
    return (_jsxs("div", { style: { animationDelay: `${idx * 0.07}s`, animation: 'gs-card-in 0.4s cubic-bezier(0.22,1,0.36,1) both' }, children: [showJackpot && (_jsxs("div", { style: {
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 16px',
                    background: 'linear-gradient(90deg, #3b0764, #6d28d9, #3b0764)',
                    borderRadius: '18px 18px 0 0',
                    position: 'relative', overflow: 'hidden',
                }, children: [_jsx("div", { style: {
                            position: 'absolute', inset: 0,
                            background: 'linear-gradient(90deg, transparent 20%, rgba(255,255,255,0.08) 50%, transparent 80%)',
                            animation: 'gs-shimmer 2.8s ease-in-out infinite',
                            pointerEvents: 'none',
                        } }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx("span", { style: { fontSize: 14 }, children: "\uD83D\uDC51" }), _jsx("span", { style: { fontSize: 10, fontWeight: 900, color: '#e9d5ff', letterSpacing: '0.12em' }, children: "JACKPOT ACTIVE" })] }), _jsxs("span", { style: { fontSize: 14, fontWeight: 900, color: '#ffd54f' }, children: [fmt(derash), " \u1265\u122D"] })] })), _jsxs("button", { onClick: onPress, style: {
                    display: 'block', width: '100%', padding: 0, textAlign: 'left',
                    background: 'linear-gradient(145deg, #1c1736 0%, #15122a 100%)',
                    border: `1px solid ${theme.color}28`,
                    borderRadius: showJackpot ? '0 0 18px 18px' : 18,
                    cursor: 'pointer', overflow: 'hidden',
                    boxShadow: `0 2px 20px rgba(0,0,0,0.5), 0 0 0 0 ${theme.glow}`,
                    transition: 'transform 0.13s ease, box-shadow 0.13s ease',
                    WebkitTapHighlightColor: 'transparent',
                }, onMouseDown: e => (e.currentTarget.style.transform = 'scale(0.98)'), onMouseUp: e => (e.currentTarget.style.transform = 'scale(1)'), onTouchStart: e => (e.currentTarget.style.transform = 'scale(0.98)'), onTouchEnd: e => (e.currentTarget.style.transform = 'scale(1)'), children: [_jsxs("div", { style: { padding: '16px 16px 12px', display: 'flex', alignItems: 'flex-start', gap: 14 }, children: [_jsxs("div", { style: {
                                    width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                                    background: `linear-gradient(145deg, ${theme.color}22, ${theme.color}0a)`,
                                    border: `1.5px solid ${theme.color}40`,
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    gap: 2,
                                }, children: [_jsx("span", { style: { fontSize: 20 }, children: theme.icon }), _jsx("span", { style: { fontSize: 8, fontWeight: 800, color: theme.color, letterSpacing: '0.05em' }, children: theme.label.toUpperCase() })] }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'baseline', gap: 4 }, children: [_jsx("span", { style: { fontSize: 30, fontWeight: 900, color: '#f1f5f9', lineHeight: 1, letterSpacing: -1 }, children: round.stake }), _jsx("span", { style: { fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }, children: "\u1265\u122D" })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }, children: [_jsxs("div", { style: {
                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                    padding: '3px 9px', borderRadius: 999,
                                                    background: isPending ? 'rgba(52,211,153,0.1)' : 'rgba(251,191,36,0.1)',
                                                    border: `1px solid ${isPending ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)'}`,
                                                }, children: [_jsx("span", { style: {
                                                            width: 5, height: 5, borderRadius: '50%',
                                                            background: isPending ? '#34d399' : '#fbbf24',
                                                            display: 'inline-block',
                                                            animation: 'gs-pulse 1.6s ease-in-out infinite',
                                                        } }), _jsx("span", { style: { fontSize: 9, fontWeight: 900, color: isPending ? '#34d399' : '#fbbf24', letterSpacing: '0.05em' }, children: isPending ? 'OPEN' : 'LIVE' })] }), _jsxs("span", { style: { fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }, children: [playerCount, " joined"] })] })] }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }, children: [!showJackpot && (_jsxs("div", { style: { textAlign: 'right' }, children: [_jsx("div", { style: { fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 1 }, children: "PRIZE" }), _jsxs("div", { style: { fontSize: 18, fontWeight: 900, color: '#ffd54f', lineHeight: 1 }, children: [fmt(derash), _jsx("span", { style: { fontSize: 10, color: 'rgba(255,213,79,0.5)', marginLeft: 2 }, children: "\u1265\u122D" })] })] })), _jsxs("div", { style: {
                                            padding: '10px 18px',
                                            borderRadius: 999,
                                            background: isPending
                                                ? `linear-gradient(135deg, #5b21b6, #7c3aed)`
                                                : `linear-gradient(135deg, ${theme.color}cc, ${theme.color})`,
                                            color: '#fff',
                                            fontSize: 12, fontWeight: 900,
                                            letterSpacing: '0.04em',
                                            boxShadow: isPending
                                                ? '0 4px 16px rgba(124,58,237,0.5)'
                                                : `0 4px 16px ${theme.glow}`,
                                            position: 'relative', overflow: 'hidden',
                                            whiteSpace: 'nowrap',
                                        }, children: [_jsx("div", { style: {
                                                    position: 'absolute', inset: 0,
                                                    background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)',
                                                    animation: 'gs-shimmer 2.2s ease-in-out infinite',
                                                    pointerEvents: 'none',
                                                } }), isPending ? '🎟 ይምረጡ' : '▶ ይጫወቱ'] })] })] }), _jsxs("div", { style: { padding: '0 16px 14px' }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }, children: [_jsx("span", { style: { fontSize: 9, color: 'rgba(255,255,255,0.25)', fontWeight: 600 }, children: "Slots filled" }), _jsxs("span", { style: { fontSize: 9, color: theme.color, fontWeight: 700 }, children: [Math.round(fillPct), "%"] })] }), _jsx("div", { style: { height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }, children: _jsx("div", { style: {
                                        height: '100%', borderRadius: 999,
                                        width: `${fillPct}%`,
                                        background: `linear-gradient(90deg, ${theme.color}88, ${theme.color})`,
                                        transition: 'width 0.6s ease',
                                        boxShadow: fillPct > 60 ? `0 0 8px ${theme.color}80` : 'none',
                                    } }) })] })] })] }));
}
// ── Main screen ───────────────────────────────────────────────────────────────
export default function GameScreen() {
    const navigate = useNavigate();
    const [rounds, setRounds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [retryCount, setRetryCount] = useState(0);
    const [stats, setStats] = useState(null);
    const [liveCounts, setLiveCounts] = useState({});
    const [mainBalance, setMainBalance] = useState(null);
    const [playBalance, setPlayBalance] = useState(null);
    const [winnerTicks, setWinnerTicks] = useState([]);
    const [referralLink, setReferralLink] = useState(null);
    const [copyDone, setCopyDone] = useState(false);
    const tickerRef = useRef(null);
    const updateCount = useCallback((roundId, count) => {
        setLiveCounts(prev => ({ ...prev, [roundId]: count }));
    }, []);
    useEffect(() => {
        getReferralLink().then(r => setReferralLink(r.referralLink)).catch(() => { });
    }, []);
    useEffect(() => {
        function onRoundWon(payload) {
            const wonRoundId = payload.roundId;
            const stake = wonRoundId
                ? (rounds.find(r => r.id === wonRoundId)?.stake ?? rounds.find(r => r.status === 'active')?.stake ?? 0)
                : (rounds.find(r => r.status === 'active')?.stake ?? 0);
            payload.winners.slice(0, 2).forEach(w => {
                const tick = { id: ++tickId, username: w.username, amount: w.amount, stake: Number(stake) };
                setWinnerTicks(prev => [tick, ...prev].slice(0, 6));
            });
        }
        socket.on('ROUND_WON', onRoundWon);
        return () => { socket.off('ROUND_WON', onRoundWon); };
    }, [rounds]);
    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError(null);
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
                    const initial = {};
                    filtered.forEach(r => { initial[r.id] = r.player_count; });
                    setLiveCounts(initial);
                }
                if (!cancelled && statsData)
                    setStats(statsData);
            }
            catch (err) {
                if (!cancelled) {
                    const msg = err instanceof Error ? err.message : 'Failed to load';
                    if (msg.includes('Unauthorized') || msg.includes('INVALID_TELEGRAM_AUTH')) {
                        setError('This app must be opened from Telegram. Please use the @MadaBingoBot to access the game.');
                    }
                    else {
                        setError(msg);
                    }
                }
            }
            finally {
                if (!cancelled)
                    setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [retryCount]);
    useEffect(() => {
        if (rounds.length === 0)
            return;
        const token = getJwt() ?? '';
        rounds.forEach(r => socket.emit('JOIN_ROUND', { roundId: r.id, token }));
    }, [rounds.map(r => r.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        function onPlayerJoined(payload) {
            if (payload.roundId) {
                updateCount(payload.roundId, payload.playerCount);
                setRounds(prev => prev.map(r => r.id === payload.roundId ? { ...r, player_count: payload.playerCount } : r));
            }
            else {
                setRounds(prev => prev.map(r => r.status === 'pending' ? { ...r, player_count: payload.playerCount } : r));
            }
        }
        function onCartelaTaken(payload) {
            if (payload.roundId) {
                updateCount(payload.roundId, payload.playerCount);
                setRounds(prev => prev.map(r => r.id === payload.roundId ? { ...r, player_count: payload.playerCount } : r));
            }
            else {
                setRounds(prev => prev.map(r => r.status === 'pending' ? { ...r, player_count: payload.playerCount } : r));
            }
        }
        function onRoundStarted(payload) {
            setRounds(prev => prev.map(r => r.id === payload.roundId ? { ...r, status: 'active', player_count: payload.playerCount, derash: payload.derash } : r));
            updateCount(payload.roundId, payload.playerCount);
        }
        function onRoundVoidOrCancelled(payload) {
            setRounds(prev => prev.filter(r => r.id !== payload.roundId));
        }
        function onReconnect() {
            getRounds().then(data => {
                const filtered = data
                    .filter(r => ALLOWED_STAKES.includes(Number(r.stake)))
                    .sort((a, b) => Number(a.stake) - Number(b.stake));
                setRounds(filtered);
                const counts = {};
                filtered.forEach(r => { counts[r.id] = r.player_count; });
                setLiveCounts(counts);
                const token = getJwt() ?? '';
                filtered.forEach(r => socket.emit('JOIN_ROUND', { roundId: r.id, token }));
            }).catch(() => { });
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
    // ── Render ────────────────────────────────────────────────────────────────
    return (_jsxs("div", { className: "gs-root", style: {
            minHeight: '100dvh',
            background: 'radial-gradient(circle at 85% -5%, rgba(168,85,247,0.16), transparent 32%), radial-gradient(circle at -12% 32%, rgba(99,212,186,0.12), transparent 30%), linear-gradient(170deg, #150b33 0%, #0e0a24 55%, #0a0718 100%)',
            color: '#f1f5f9',
            maxWidth: 480,
            margin: '0 auto',
            paddingBottom: 88,
        }, children: [_jsx("style", { children: `
        @keyframes gs-pulse   { 0%,100%{opacity:.6;transform:scale(1)}   50%{opacity:1;transform:scale(1.25)} }
        @keyframes gs-shimmer { from{transform:translateX(-100%) skewX(-18deg)} to{transform:translateX(200%) skewX(-18deg)} }
        @keyframes gs-tick-in { from{opacity:0;transform:translateY(-8px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes gs-card-in { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes gs-fade-in { from{opacity:0} to{opacity:1} }
        .gs-root { max-width: 480px; margin: 0 auto; }
        @media (min-width: 560px) { .gs-root { max-width: 560px; } }
      ` }), _jsxs("div", { style: {
                    padding: '14px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(12,9,28,0.92)',
                    borderBottom: '1px solid rgba(124,58,237,0.22)',
                    backdropFilter: 'blur(20px)',
                    position: 'sticky', top: 0, zIndex: 10,
                }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 11 }, children: [_jsx("div", { style: {
                                    width: 40, height: 40, borderRadius: 13,
                                    background: 'linear-gradient(135deg, #6d28d9, #e040fb)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 900, fontSize: 14, color: '#fff',
                                    boxShadow: '0 0 20px rgba(124,58,237,0.5)',
                                    flexShrink: 0, letterSpacing: -0.5,
                                }, children: "FB" }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 16, fontWeight: 900, color: '#f1f5f9', letterSpacing: -0.3 }, children: "Mada Bingo" }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }, children: [_jsx("span", { style: {
                                                    width: 5, height: 5, borderRadius: '50%', background: '#34d399',
                                                    display: 'inline-block', animation: 'gs-pulse 1.8s ease-in-out infinite',
                                                } }), _jsx("span", { style: { fontSize: 9, color: '#34d399', fontWeight: 800, letterSpacing: '0.1em' }, children: "LIVE NOW" })] })] })] }), _jsxs("div", { style: {
                            background: 'rgba(124,58,237,0.12)',
                            border: '1px solid rgba(124,58,237,0.28)',
                            borderRadius: 14, padding: '8px 14px',
                            display: 'flex', flexDirection: 'column', gap: 3,
                        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx("span", { style: { fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.07em' }, children: "MAIN" }), _jsxs("span", { style: { fontSize: 13, fontWeight: 900, color: '#ffd54f' }, children: [mainBalance === null ? '—' : mainBalance.toFixed(2), _jsx("span", { style: { fontSize: 9, color: 'rgba(255,213,79,0.55)', marginLeft: 2 }, children: "ETB" })] })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx("span", { style: { fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.07em' }, children: "PLAY" }), _jsxs("span", { style: { fontSize: 13, fontWeight: 900, color: '#a78bfa' }, children: [playBalance === null ? '—' : playBalance.toFixed(2), _jsx("span", { style: { fontSize: 9, color: 'rgba(167,139,250,0.55)', marginLeft: 2 }, children: "ETB" })] })] })] })] }), winnerTicks.length > 0 && (_jsx("div", { ref: tickerRef, style: {
                    background: 'rgba(8,6,20,0.98)',
                    borderBottom: '1px solid rgba(224,64,251,0.12)',
                    paddingTop: 4, paddingBottom: 4,
                    animation: 'gs-fade-in 0.3s ease',
                }, children: winnerTicks.slice(0, 3).map((t, i) => (_jsx("div", { style: { opacity: 1 - i * 0.3 }, children: _jsx(TickerItem, { tick: t, fresh: i === 0 }) }, t.id))) })), _jsxs("div", { style: {
                    margin: '16px 14px 0',
                    borderRadius: 22,
                    background: 'linear-gradient(135deg, #31156e 0%, #4c1d95 40%, #6d28d9 100%)',
                    border: '1px solid rgba(167,139,250,0.25)',
                    padding: '22px 20px 20px',
                    position: 'relative', overflow: 'hidden',
                    boxShadow: '0 18px 40px rgba(76,29,149,0.35)',
                }, children: [_jsx("div", { style: {
                            position: 'absolute', top: -30, right: -30,
                            width: 130, height: 130, borderRadius: '50%',
                            background: 'rgba(224,64,251,0.15)', pointerEvents: 'none',
                        } }), _jsx("div", { style: {
                            position: 'absolute', bottom: -20, left: -20,
                            width: 80, height: 80, borderRadius: '50%',
                            background: 'rgba(96,165,250,0.1)', pointerEvents: 'none',
                        } }), _jsxs("div", { style: { position: 'relative' }, children: [_jsx("div", { style: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6 }, children: "\uD83C\uDFB1 \u1328\u12CB\u1273\u12CE\u1295 \u12ED\u121D\u1228\u1321" }), _jsx("div", { style: { fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: -0.5, lineHeight: 1.2 }, children: "Choose Your Game" }), _jsx("div", { style: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 6 }, children: "Pick a stake level and start playing live bingo" }), stats && (_jsx("div", { style: { display: 'flex', gap: 16, marginTop: 14 }, children: [
                                    { label: 'Players', value: fmt(stats.totalPlayers), color: '#ffd54f' },
                                    { label: 'Games', value: fmt(stats.totalGames), color: '#a78bfa' },
                                    { label: 'Live', value: '24/7', color: '#34d399' },
                                ].map(s => (_jsxs("div", { style: { textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: 16, fontWeight: 900, color: s.color }, children: s.value }), _jsx("div", { style: { fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.07em', marginTop: 1 }, children: s.label.toUpperCase() })] }, s.label))) }))] })] }), referralLink && (_jsxs("div", { style: {
                    margin: '12px 14px 0',
                    background: 'rgba(124,58,237,0.08)',
                    border: '1px solid rgba(124,58,237,0.22)',
                    borderRadius: 18,
                    padding: '12px 14px',
                    display: 'flex', alignItems: 'center', gap: 12,
                }, children: [_jsx("div", { style: {
                            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                            background: 'linear-gradient(135deg,rgba(124,58,237,0.3),rgba(224,64,251,0.3))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 20,
                        }, children: "\uD83C\uDF81" }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 900, color: '#f1f5f9' }, children: "Invite & Earn" }), _jsx("div", { style: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }, children: "Get rewarded when friends join and play" })] }), _jsx("button", { onClick: () => {
                            if (copyDone)
                                return;
                            if (WebApp.openTelegramLink) {
                                const shareText = encodeURIComponent('Join me on Mada Bingo! 🎱 Play live bingo and win real ETB.\n');
                                WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${shareText}`);
                            }
                            else {
                                navigator.clipboard.writeText(referralLink).catch(() => { });
                            }
                            setCopyDone(true);
                            setTimeout(() => setCopyDone(false), 3000);
                        }, style: {
                            flexShrink: 0, padding: '9px 16px', borderRadius: 999, border: 'none',
                            background: copyDone
                                ? 'rgba(52,211,153,0.2)'
                                : 'linear-gradient(135deg, #7c3aed, #e040fb)',
                            color: copyDone ? '#34d399' : '#fff',
                            fontWeight: 800, fontSize: 11, cursor: 'pointer',
                            transition: 'all 0.2s', whiteSpace: 'nowrap',
                            boxShadow: copyDone ? 'none' : '0 4px 14px rgba(124,58,237,0.4)',
                        }, children: copyDone ? '✓ Sent!' : '📤 Invite' })] })), _jsxs("div", { style: { padding: '16px 14px 0' }, children: [!loading && !error && rounds.length > 0 && (_jsxs("div", { style: {
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            marginBottom: 12,
                        }, children: [_jsx("span", { style: { fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }, children: "ACTIVE ROOMS" }), _jsxs("span", { style: {
                                    fontSize: 11, fontWeight: 700, color: '#a78bfa',
                                    background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)',
                                    borderRadius: 999, padding: '3px 10px',
                                }, children: [rounds.length, " rooms"] })] })), loading && (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 10 }, children: [1, 2, 3].map(i => (_jsx("div", { style: {
                                height: 110, borderRadius: 18,
                                background: 'rgba(255,255,255,0.04)',
                                animation: `gs-pulse ${0.8 + i * 0.1}s ease-in-out infinite`,
                            } }, i))) })), error && (_jsxs("div", { style: {
                            background: 'rgba(248,113,113,0.07)',
                            border: '1px solid rgba(248,113,113,0.22)',
                            borderRadius: 18, padding: '24px 20px', textAlign: 'center',
                        }, children: [_jsx("div", { style: { fontSize: 32, marginBottom: 10 }, children: "\u26A0\uFE0F" }), _jsx("div", { style: { color: '#f87171', fontSize: 14, marginBottom: 16, lineHeight: 1.5 }, children: error }), _jsx("button", { onClick: () => { setError(null); setRetryCount(c => c + 1); }, style: {
                                    background: 'linear-gradient(135deg, #7c3aed, #e040fb)',
                                    border: 'none', borderRadius: 999, padding: '11px 28px',
                                    color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 14,
                                    boxShadow: '0 4px 16px rgba(124,58,237,0.4)',
                                }, children: "Try Again" })] })), !loading && !error && rounds.length === 0 && (_jsxs("div", { style: {
                            background: 'rgba(124,58,237,0.05)',
                            border: '1px solid rgba(124,58,237,0.12)',
                            borderRadius: 18, padding: '50px 20px', textAlign: 'center',
                        }, children: [_jsx("div", { style: { fontSize: 40, marginBottom: 12 }, children: "\uD83C\uDFB1" }), _jsx("div", { style: { fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }, children: "No games right now" }), _jsx("div", { style: { fontSize: 12, color: 'rgba(255,255,255,0.25)' }, children: "Check back soon \u2014 games start regularly" })] })), !loading && !error && rounds.map((round, idx) => (_jsx("div", { style: { marginBottom: 10 }, children: _jsx(GameCard, { round: round, playerCount: liveCounts[round.id] ?? round.player_count, idx: idx, onPress: () => {
                                sessionStorage.setItem('selectedStake', String(round.stake));
                                sessionStorage.setItem('stakeSelectedForRound', round.id);
                                if (round.status === 'pending') {
                                    navigate(`/rounds/${round.id}/cartela`);
                                }
                                else {
                                    sessionStorage.setItem('selectedRoundId', round.id);
                                    navigate(`/rounds/${round.id}/game`);
                                }
                            } }) }, round.id)))] })] }));
}
//# sourceMappingURL=GameScreen.js.map