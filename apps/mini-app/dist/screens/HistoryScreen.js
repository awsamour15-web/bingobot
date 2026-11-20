import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHistory } from '../lib/api';
const C = {
    bg: '#0d0b22',
    surface: 'rgba(19,16,43,0.9)',
    border: 'rgba(124,58,237,0.15)',
    borderHover: 'rgba(124,58,237,0.4)',
    violet: '#7c3aed',
    magenta: '#e040fb',
    text: '#f1f5f9',
    muted: 'rgba(255,255,255,0.45)',
    dim: 'rgba(255,255,255,0.22)',
    green: '#34d399',
    red: '#f87171',
    amber: '#f59e0b',
};
const RESULT = {
    win: { label: '🏆 Won', color: C.green, bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)' },
    loss: { label: '😔 Lost', color: C.red, bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
    void: { label: '↩ Voided', color: C.amber, bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
    cancelled: { label: '✕ Cancelled', color: C.muted, bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)' },
};
export default function HistoryScreen() {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = useCallback(async (p) => {
        setLoading(true);
        setError(null);
        try {
            setData(await getHistory(p));
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load');
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(page); }, [page, load]);
    const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;
    return (_jsxs("div", { style: {
            background: 'linear-gradient(180deg, #0d0b22 0%, #0c0a1e 100%)',
            minHeight: '100dvh',
            paddingBottom: 80,
        }, children: [_jsxs("div", { style: {
                    background: 'linear-gradient(135deg, #1a1535, #13102b)',
                    padding: '24px 20px 18px',
                    borderBottom: `1px solid rgba(124,58,237,0.2)`,
                    position: 'relative', overflow: 'hidden',
                }, children: [_jsx("div", { style: {
                            position: 'absolute', top: -30, right: -20, width: 120, height: 120,
                            borderRadius: '50%',
                            background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)',
                            pointerEvents: 'none',
                        } }), _jsx("div", { style: {
                            fontSize: 11, color: '#a78bfa', letterSpacing: 1.4,
                            textTransform: 'uppercase', marginBottom: 4, fontWeight: 700,
                        }, children: "My Games" }), _jsx("div", { style: { fontSize: 22, fontWeight: 900, color: C.text }, children: "\uD83D\uDCDC Game History" })] }), loading && _jsx("div", { style: { padding: 40 } }), error && (_jsx("div", { style: { padding: 24, textAlign: 'center', color: C.red }, children: error })), !loading && !error && data?.items.length === 0 && (_jsxs("div", { style: { padding: '60px 20px', textAlign: 'center', color: C.muted }, children: [_jsx("div", { style: { fontSize: 36, marginBottom: 12 }, children: "\uD83C\uDFAE" }), _jsx("div", { style: { fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }, children: "No games yet" }), _jsx("div", { style: { fontSize: 13 }, children: "Play your first game to see history here." })] })), _jsx("div", { style: { padding: '12px 14px' }, children: !loading && data?.items.map(entry => {
                    const r = RESULT[entry.result] ?? RESULT.cancelled;
                    return (_jsxs("div", { onClick: () => navigate(`/history/${entry.roundId}`), style: {
                            background: C.surface,
                            border: `1px solid ${C.border}`,
                            borderRadius: 16, padding: '14px 16px', marginBottom: 10,
                            cursor: 'pointer',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            transition: 'border-color 0.2s, box-shadow 0.2s',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                        }, onPointerDown: e => {
                            e.currentTarget.style.borderColor = C.borderHover;
                            e.currentTarget.style.boxShadow = '0 4px 20px rgba(124,58,237,0.2)';
                        }, onPointerUp: e => {
                            e.currentTarget.style.borderColor = C.border;
                            e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.3)';
                        }, onPointerLeave: e => {
                            e.currentTarget.style.borderColor = C.border;
                            e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.3)';
                        }, children: [_jsxs("div", { children: [_jsxs("div", { style: { fontWeight: 800, fontSize: 15, color: C.text, marginBottom: 4 }, children: ["Game #", entry.gameId.slice(-6).toUpperCase()] }), _jsxs("div", { style: { fontSize: 12, color: '#a78bfa', fontWeight: 600 }, children: ["Cartela #", entry.cartelaNumber, " \u00B7 ", entry.stake, " Birr stake"] }), _jsx("div", { style: { fontSize: 11, color: C.dim, marginTop: 2 }, children: new Date(entry.date).toLocaleDateString('en-ET', {
                                            month: 'short', day: 'numeric',
                                            hour: '2-digit', minute: '2-digit',
                                        }) })] }), _jsxs("div", { style: { textAlign: 'right', flexShrink: 0, marginLeft: 12 }, children: [_jsx("div", { style: {
                                            background: r.bg, color: r.color,
                                            border: `1px solid ${r.border}`,
                                            borderRadius: 999, padding: '5px 12px',
                                            fontSize: 11, fontWeight: 700, marginBottom: 4,
                                        }, children: r.label }), entry.prize > 0 && (_jsxs("div", { style: { fontSize: 14, fontWeight: 900, color: C.green }, children: ["+", entry.prize, " Birr"] }))] })] }, entry.roundId));
                }) }), !loading && data && totalPages > 1 && (_jsxs("div", { style: { display: 'flex', justifyContent: 'center', gap: 12, padding: '8px 0 16px' }, children: [_jsx("button", { onClick: () => setPage(p => Math.max(1, p - 1)), disabled: page <= 1, style: {
                            padding: '9px 22px', borderRadius: 999,
                            border: `1px solid ${page <= 1 ? C.border : 'rgba(124,58,237,0.4)'}`,
                            background: page <= 1 ? 'transparent' : 'rgba(124,58,237,0.1)',
                            color: page <= 1 ? C.dim : '#a78bfa',
                            cursor: page <= 1 ? 'default' : 'pointer', fontWeight: 700, fontSize: 13,
                            transition: 'all 0.15s',
                        }, children: "\u2039 Prev" }), _jsxs("span", { style: { alignSelf: 'center', fontSize: 13, color: C.muted, fontWeight: 600 }, children: [page, " / ", totalPages] }), _jsx("button", { onClick: () => setPage(p => Math.min(totalPages, p + 1)), disabled: page >= totalPages, style: {
                            padding: '9px 22px', borderRadius: 999,
                            border: `1px solid ${page >= totalPages ? C.border : 'rgba(124,58,237,0.4)'}`,
                            background: page >= totalPages ? 'transparent' : 'rgba(124,58,237,0.1)',
                            color: page >= totalPages ? C.dim : '#a78bfa',
                            cursor: page >= totalPages ? 'default' : 'pointer', fontWeight: 700, fontSize: 13,
                            transition: 'all 0.15s',
                        }, children: "Next \u203A" })] }))] }));
}
//# sourceMappingURL=HistoryScreen.js.map