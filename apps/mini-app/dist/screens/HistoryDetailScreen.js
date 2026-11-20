import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getHistoryDetail } from '../lib/api';
const COLS = ['B', 'I', 'N', 'G', 'O'];
const RESULT_LABELS = {
    win: '🏆 አሸነፍ',
    loss: '😔 አልተሳካም',
    void: '↩ ተሰርዟል',
    cancelled: '✕ ተሰረዘ',
};
export default function HistoryDetailScreen() {
    const { roundId } = useParams();
    const navigate = useNavigate();
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!roundId)
            return;
        getHistoryDetail(roundId)
            .then(setDetail)
            .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
            .finally(() => setLoading(false));
    }, [roundId]);
    if (loading) {
        return _jsx("div", { style: { minHeight: '100dvh', background: '#0a0e1a' } });
    }
    if (error || !detail) {
        return _jsx("div", { style: { padding: 24, textAlign: 'center', color: '#e53e3e' }, children: error ?? 'Not found' });
    }
    const calledSet = new Set(detail.calledNumbers.map((cn) => cn.number));
    const grid = detail.cartelaGrid;
    return (_jsxs("div", { children: [_jsxs("div", { style: { background: '#4f46e5', color: '#fff', padding: '14px 16px' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsx("span", { style: { cursor: 'pointer', fontSize: 18 }, onClick: () => navigate(-1), children: "\u2190" }), _jsxs("span", { style: { fontWeight: 700, fontSize: 17 }, children: ["\u1328\u12CB\u1273 #", detail.gameId.slice(-6).toUpperCase()] })] }), _jsxs("div", { style: { marginTop: 8, display: 'flex', gap: 20, fontSize: 13 }, children: [_jsxs("div", { children: [_jsx("span", { style: { opacity: 0.75 }, children: "\u12CD\u1324\u1275: " }), _jsx("strong", { children: RESULT_LABELS[detail.result] ?? detail.result })] }), _jsxs("div", { children: [_jsx("span", { style: { opacity: 0.75 }, children: "\u12CB\u130B: " }), _jsxs("strong", { children: [detail.stake, " \u1265\u122D"] })] }), detail.prize > 0 && (_jsxs("div", { children: [_jsx("span", { style: { opacity: 0.75 }, children: "\u123D\u120D\u121B\u1275: " }), _jsxs("strong", { children: [detail.prize, " \u1265\u122D"] })] }))] })] }), grid.length > 0 && (_jsxs("div", { style: { padding: '16px' }, children: [_jsxs("div", { style: { fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 600 }, children: ["\u12AB\u122D\u1274\u120B #", detail.cartelaNumber] }), _jsxs("div", { style: { background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }, children: [_jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', background: '#4f46e5' }, children: COLS.map((c) => (_jsx("div", { style: { textAlign: 'center', color: '#fff', fontWeight: 900, padding: '10px 0', fontSize: 18 }, children: c }, c))) }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, padding: 4 }, children: grid.map((val, i) => {
                                    const isFree = i === 12;
                                    const marked = isFree || calledSet.has(val);
                                    return (_jsx("div", { style: {
                                            aspectRatio: '1',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: isFree ? '#4f46e5' : marked ? '#c7d2fe' : '#fff',
                                            color: isFree ? '#fff' : '#222',
                                            borderRadius: 6,
                                            fontWeight: marked ? 700 : 400,
                                            fontSize: 14,
                                            border: '1px solid #e0e0e0',
                                        }, children: isFree ? '★' : val }, i));
                                }) })] })] })), _jsxs("div", { style: { padding: '0 16px 24px' }, children: [_jsxs("div", { style: { fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 600 }, children: ["\u12E8\u1270\u1320\u1229 \u1241\u1325\u122E\u127D (", detail.calledNumbers.length, ")"] }), _jsx("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6 }, children: detail.calledNumbers
                            .sort((a, b) => a.sequence_index - b.sequence_index)
                            .map(({ number, sequence_index }) => (_jsx("div", { style: {
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                background: calledSet.has(number) && grid.includes(number) ? '#4f46e5' : '#e0e7ff',
                                color: calledSet.has(number) && grid.includes(number) ? '#fff' : '#4f46e5',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: 12,
                            }, children: number }, sequence_index))) })] })] }));
}
//# sourceMappingURL=HistoryDetailScreen.js.map