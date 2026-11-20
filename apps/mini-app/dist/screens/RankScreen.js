import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { getLeaderboard } from '../lib/api';
const C = {
    bg: '#0e0b25',
    surface: '#13102b',
    surface2: '#1a1535',
    border: 'rgba(124,58,237,0.18)',
    violet: '#7c3aed',
    magenta: '#e040fb',
    gold: '#ffd54f',
    text: '#f1f5f9',
    muted: 'rgba(255,255,255,0.45)',
    dim: 'rgba(255,255,255,0.22)',
    green: '#34d399',
    silver: '#94a3b8',
    bronze: '#cd7c4e',
};
const MEDAL = ['🥇', '🥈', '🥉'];
const RANK_COLORS = {
    1: { color: '#ffd54f', bg: 'rgba(255,213,79,0.12)', glow: '0 0 28px rgba(255,213,79,0.3)' },
    2: { color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', glow: '0 0 18px rgba(148,163,184,0.18)' },
    3: { color: '#cd7c4e', bg: 'rgba(205,124,78,0.10)', glow: '0 0 18px rgba(205,124,78,0.18)' },
};
function Avatar({ username, rank }) {
    const letter = username?.[0]?.toUpperCase() ?? '?';
    const style = RANK_COLORS[rank];
    const size = rank <= 3 ? 46 : 38;
    return (_jsx("div", { style: {
            width: size, height: size, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: rank <= 3 ? 18 : 15,
            background: style ? style.bg : 'rgba(124,58,237,0.08)',
            color: style ? style.color : C.muted,
            border: `1.5px solid ${style ? style.color + '55' : C.border}`,
            boxShadow: style ? style.glow : 'none',
        }, children: letter }));
}
function TopThreeCard({ entry }) {
    const style = RANK_COLORS[entry.rank];
    const isFirst = entry.rank === 1;
    return (_jsxs("div", { style: {
            flex: isFirst ? '0 0 38%' : '0 0 28%',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 8,
            order: entry.rank === 2 ? 0 : entry.rank === 1 ? 1 : 2,
            marginTop: entry.rank === 1 ? 0 : 24,
        }, children: [isFirst && (_jsx("div", { style: { fontSize: 22, filter: 'drop-shadow(0 2px 10px rgba(255,213,79,0.6))' }, children: "\uD83D\uDC51" })), _jsxs("div", { style: {
                    width: isFirst ? 72 : 56, height: isFirst ? 72 : 56,
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 900, fontSize: isFirst ? 26 : 20,
                    background: style.bg,
                    color: style.color,
                    border: `2px solid ${style.color}88`,
                    boxShadow: style.glow,
                    position: 'relative',
                }, children: [entry.username?.[0]?.toUpperCase() ?? '?', _jsx("div", { style: {
                            position: 'absolute', bottom: -6, right: -4,
                            fontSize: isFirst ? 18 : 14,
                            filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.6))',
                        }, children: MEDAL[entry.rank - 1] })] }), _jsxs("div", { style: { textAlign: 'center', maxWidth: isFirst ? 100 : 80 }, children: [_jsx("div", { style: {
                            fontSize: isFirst ? 13 : 11, fontWeight: 800, color: style.color,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                        }, children: entry.username }), _jsxs("div", { style: { fontSize: 11, color: C.muted, marginTop: 2 }, children: [entry.wins, " wins"] }), _jsxs("div", { style: { fontSize: isFirst ? 13 : 11, fontWeight: 700, color: C.green, marginTop: 1 }, children: [entry.totalPrize.toLocaleString(), " \u20BF"] })] }), entry.isCurrentPlayer && (_jsx("div", { style: {
                    fontSize: 10, color: C.magenta, fontWeight: 700,
                    background: 'rgba(224,64,251,0.1)', borderRadius: 999,
                    padding: '2px 8px', border: '1px solid rgba(224,64,251,0.3)',
                }, children: "You" }))] }));
}
function RankRow({ entry, idx }) {
    const style = RANK_COLORS[entry.rank];
    const isHighlighted = entry.isCurrentPlayer;
    return (_jsxs("div", { style: {
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px', borderRadius: 14,
            background: isHighlighted
                ? 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(224,64,251,0.06))'
                : idx % 2 === 0 ? C.surface : 'transparent',
            border: isHighlighted
                ? `1px solid rgba(224,64,251,0.3)`
                : `1px solid transparent`,
            marginBottom: 6, transition: 'background 0.2s',
        }, children: [_jsx("div", { style: {
                    width: 28, textAlign: 'center', flexShrink: 0,
                    fontSize: 13, fontWeight: 900,
                    color: style ? style.color : C.dim,
                }, children: entry.rank }), _jsx(Avatar, { username: entry.username, rank: entry.rank }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx("span", { style: {
                                    fontSize: 14, fontWeight: 700,
                                    color: isHighlighted ? C.magenta : C.text,
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }, children: entry.username }), isHighlighted && (_jsx("span", { style: {
                                    fontSize: 10, color: C.magenta,
                                    background: 'rgba(224,64,251,0.1)',
                                    borderRadius: 999, padding: '1px 7px', fontWeight: 700, flexShrink: 0,
                                    border: '1px solid rgba(224,64,251,0.3)',
                                }, children: "You" }))] }), _jsxs("div", { style: { fontSize: 11, color: C.muted, marginTop: 1 }, children: [entry.wins, " ", entry.wins === 1 ? 'win' : 'wins'] })] }), _jsxs("div", { style: { textAlign: 'right', flexShrink: 0 }, children: [_jsx("div", { style: { fontSize: 14, fontWeight: 800, color: C.green }, children: entry.totalPrize.toLocaleString() }), _jsx("div", { style: { fontSize: 10, color: C.dim }, children: "Birr" })] })] }));
}
export default function RankScreen() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await getLeaderboard());
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load');
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);
    const top3 = data?.leaderboard.slice(0, 3) ?? [];
    const rest = data?.leaderboard.slice(3) ?? [];
    return (_jsxs("div", { style: {
            background: 'linear-gradient(180deg, #0e0b25 0%, #0c0a1e 100%)',
            minHeight: '100dvh',
            paddingBottom: 90,
        }, children: [_jsx("style", { children: `
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .rank-row-enter { animation: fadeInUp 0.22s ease forwards; }
      ` }), _jsxs("div", { style: {
                    background: 'linear-gradient(135deg, #1e1245, #13102b)',
                    padding: '24px 20px 20px',
                    borderBottom: `1px solid rgba(124,58,237,0.2)`,
                    position: 'relative', overflow: 'hidden',
                }, children: [_jsx("div", { style: {
                            position: 'absolute', top: -30, right: -30, width: 140, height: 140,
                            borderRadius: '50%',
                            background: 'radial-gradient(circle, rgba(224,64,251,0.15) 0%, transparent 70%)',
                            pointerEvents: 'none',
                        } }), _jsx("div", { style: { fontSize: 11, color: '#a78bfa', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 4, fontWeight: 700 }, children: "Hall of Fame" }), _jsx("div", { style: { fontSize: 24, fontWeight: 900, color: C.text }, children: "\uD83C\uDFC6 Leaderboard" }), _jsx("div", { style: { fontSize: 12, color: C.muted, marginTop: 4 }, children: "Top 15 players by total wins" })] }), loading && _jsx("div", { style: { padding: 24 } }), error && (_jsxs("div", { style: { padding: '40px 20px', textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: 32, marginBottom: 12 }, children: "\uD83D\uDE15" }), _jsx("div", { style: { color: '#f87171', marginBottom: 16 }, children: error }), _jsx("button", { onClick: load, style: {
                            padding: '10px 24px', borderRadius: 999, border: 'none',
                            background: 'linear-gradient(135deg, #7c3aed, #e040fb)',
                            color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 14,
                        }, children: "Retry" })] })), !loading && !error && data?.leaderboard.length === 0 && (_jsxs("div", { style: { padding: '60px 20px', textAlign: 'center', color: C.muted }, children: [_jsx("div", { style: { fontSize: 40, marginBottom: 12 }, children: "\uD83C\uDFAF" }), _jsx("div", { style: { fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }, children: "No winners yet" }), _jsx("div", { style: { fontSize: 13 }, children: "Be the first to win a game!" })] })), !loading && !error && data && data.leaderboard.length > 0 && (_jsxs(_Fragment, { children: [top3.length >= 1 && (_jsxs("div", { style: {
                            padding: '28px 16px 20px',
                            background: 'linear-gradient(180deg, rgba(26,18,69,0.6) 0%, transparent 100%)',
                            borderBottom: `1px solid rgba(124,58,237,0.12)`,
                        }, children: [_jsx("div", { style: { display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 12 }, children: top3.map((entry) => (_jsx(TopThreeCard, { entry: entry }, entry.playerId))) }), _jsx("div", { style: { display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 12, marginTop: 16 }, children: [2, 1, 3].map((rank) => {
                                    const heights = { 1: 44, 2: 32, 3: 24 };
                                    const podiumBg = {
                                        1: 'linear-gradient(180deg, rgba(255,213,79,0.18), rgba(255,213,79,0.06))',
                                        2: 'linear-gradient(180deg, rgba(148,163,184,0.14), rgba(148,163,184,0.04))',
                                        3: 'linear-gradient(180deg, rgba(205,124,78,0.12), rgba(205,124,78,0.04))',
                                    };
                                    return (_jsxs("div", { style: {
                                            flex: rank === 1 ? '0 0 38%' : '0 0 28%',
                                            height: heights[rank], borderRadius: '8px 8px 0 0',
                                            background: podiumBg[rank],
                                            border: `1px solid ${RANK_COLORS[rank]?.color ?? C.border}30`,
                                            borderBottom: 'none',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 11, fontWeight: 700, color: RANK_COLORS[rank]?.color ?? C.dim,
                                        }, children: ["#", rank] }, rank));
                                }) })] })), rest.length > 0 && (_jsxs("div", { style: { padding: '16px 14px 0' }, children: [_jsx("div", { style: { fontSize: 11, color: C.dim, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, paddingLeft: 4, fontWeight: 700 }, children: "Rankings" }), rest.map((entry, i) => (_jsx("div", { className: "rank-row-enter", children: _jsx(RankRow, { entry: entry, idx: i }) }, entry.playerId)))] })), data.currentPlayerRank && (_jsxs("div", { style: {
                            margin: '16px 14px 0', padding: '16px',
                            borderRadius: 16,
                            background: 'rgba(224,64,251,0.08)',
                            border: '1px solid rgba(224,64,251,0.3)',
                        }, children: [_jsx("div", { style: { fontSize: 11, color: C.magenta, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }, children: "Your Rank" }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsxs("div", { children: [_jsxs("span", { style: { fontSize: 24, fontWeight: 900, color: C.magenta }, children: ["#", data.currentPlayerRank.rank] }), _jsxs("span", { style: { fontSize: 13, color: C.muted, marginLeft: 8 }, children: [data.currentPlayerRank.wins, " wins"] })] }), _jsxs("div", { style: { textAlign: 'right' }, children: [_jsxs("div", { style: { fontSize: 16, fontWeight: 800, color: C.green }, children: [data.currentPlayerRank.totalPrize.toLocaleString(), " Birr"] }), _jsx("div", { style: { fontSize: 11, color: C.dim }, children: "total prize" })] })] })] }))] }))] }));
}
//# sourceMappingURL=RankScreen.js.map