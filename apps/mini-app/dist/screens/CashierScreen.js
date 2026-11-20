import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
const BASE_URL = import.meta.env.VITE_API_URL ?? 'https://madabingobot.onrender.com';
function getApiBase() { return BASE_URL; }
// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
    bg: '#0a0e1a',
    card: '#0d1b2e',
    card2: '#112240',
    border: 'rgba(255,255,255,0.07)',
    text: '#f1f5f9',
    muted: '#64748b',
    green: '#34d399',
    red: '#f87171',
    amber: '#f59e0b',
    blue: '#60a5fa',
    indigo: '#818cf8',
};
// ── Session storage keys ──────────────────────────────────────────────────────
const SESSION_KEY = 'cashier_session';
function saveSession(s) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
function loadSession() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
}
// ── API helpers ───────────────────────────────────────────────────────────────
async function cashierFetch(token, method, path, body) {
    const res = await fetch(`${getApiBase()}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json();
    if (!res.ok)
        throw new Error(data.message ?? 'Request failed');
    return data;
}
// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginForm({ onLogin }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    async function handleSubmit(e) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const data = await fetch(`${getApiBase()}/api/cashier/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username.trim(), password }),
            });
            const json = await data.json();
            if (!data.ok) {
                setError(json.message ?? 'Login failed');
                return;
            }
            const session = {
                token: json.token,
                cashierId: json.cashierId,
                displayName: json.displayName ?? username,
            };
            saveSession(session);
            onLogin(session);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Network error');
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsx("div", { style: {
            minHeight: '100dvh', background: C.bg, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 20,
        }, children: _jsxs("div", { style: {
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 20, padding: 32, width: '100%', maxWidth: 360,
            }, children: [_jsxs("div", { style: { textAlign: 'center', marginBottom: 28 }, children: [_jsx("div", { style: {
                                width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 26, boxShadow: '0 8px 24px rgba(245,158,11,0.35)',
                            }, children: "\uD83D\uDCB0" }), _jsx("div", { style: { fontSize: 20, fontWeight: 800, color: C.text }, children: "Cashier Login" }), _jsx("div", { style: { fontSize: 13, color: C.muted, marginTop: 4 }, children: "Mada Bingo Cashier App" })] }), error && (_jsx("div", { style: {
                        background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)',
                        borderRadius: 10, padding: '10px 14px', color: C.red,
                        fontSize: 13, marginBottom: 16,
                    }, children: error })), _jsxs("form", { onSubmit: (e) => void handleSubmit(e), children: [_jsx("input", { style: {
                                width: '100%', padding: '12px 14px', borderRadius: 12,
                                background: C.card2, border: `1px solid ${C.border}`,
                                color: C.text, fontSize: 15, outline: 'none',
                                marginBottom: 12, boxSizing: 'border-box',
                            }, placeholder: "Username", value: username, onChange: (e) => setUsername(e.target.value), autoComplete: "username", required: true }), _jsx("input", { type: "password", style: {
                                width: '100%', padding: '12px 14px', borderRadius: 12,
                                background: C.card2, border: `1px solid ${C.border}`,
                                color: C.text, fontSize: 15, outline: 'none',
                                marginBottom: 20, boxSizing: 'border-box',
                            }, placeholder: "Password", value: password, onChange: (e) => setPassword(e.target.value), autoComplete: "current-password", required: true }), _jsx("button", { type: "submit", disabled: loading, style: {
                                width: '100%', padding: '14px 0', borderRadius: 14,
                                background: loading ? C.card2 : C.amber,
                                color: loading ? C.muted : '#0a0e1a',
                                border: 'none', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                            }, children: loading ? 'Signing in…' : 'Sign In' })] })] }) }));
}
// ── Item card ─────────────────────────────────────────────────────────────────
function ItemCard({ children }) {
    return (_jsx("div", { style: {
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 14, padding: '14px 16px', marginBottom: 10,
        }, children: children }));
}
function ActionBtn({ label, color, onClick, loading }) {
    return (_jsx("button", { onClick: onClick, disabled: loading, style: {
            padding: '8px 14px', borderRadius: 10, border: 'none',
            background: loading ? C.card2 : color,
            color: loading ? C.muted : '#0a0e1a',
            fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
            marginLeft: 8,
        }, children: loading ? '…' : label }));
}
function Dashboard({ session, onLogout }) {
    const [tab, setTab] = useState('deposits');
    const [deposits, setDeposits] = useState([]);
    const [withdrawals, setWithdrawals] = useState([]);
    const [loading, setLoading] = useState(false);
    const [processingId, setProcessingId] = useState(null);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [dRes, wRes] = await Promise.all([
                cashierFetch(session.token, 'GET', '/api/cashier/deposits'),
                cashierFetch(session.token, 'GET', '/api/cashier/withdrawals'),
            ]);
            setDeposits(dRes.deposits);
            setWithdrawals(wRes.withdrawals);
        }
        catch (e) {
            if (e.message?.includes('expired') || e.message?.includes('Invalid')) {
                clearSession();
                onLogout();
            }
            else {
                setError(e instanceof Error ? e.message : 'Failed to load');
            }
        }
        finally {
            setLoading(false);
        }
    }, [session.token, onLogout]);
    useEffect(() => { void load(); }, [load]);
    async function approveDeposit(id) {
        if (!confirm('Approve this deposit and credit the player?'))
            return;
        setProcessingId(id);
        try {
            await cashierFetch(session.token, 'POST', `/api/cashier/deposits/${id}/approve`);
            await load();
        }
        catch (e) {
            alert(e instanceof Error ? e.message : 'Failed');
        }
        finally {
            setProcessingId(null);
        }
    }
    async function rejectDeposit(id) {
        if (!confirm('Reject this deposit?'))
            return;
        setProcessingId(id);
        try {
            await cashierFetch(session.token, 'POST', `/api/cashier/deposits/${id}/reject`);
            await load();
        }
        catch (e) {
            alert(e instanceof Error ? e.message : 'Failed');
        }
        finally {
            setProcessingId(null);
        }
    }
    async function approveWithdrawal(id) {
        const txNumber = prompt('Enter Telebirr transaction number:');
        if (!txNumber?.trim())
            return;
        setProcessingId(id);
        try {
            await cashierFetch(session.token, 'POST', `/api/cashier/withdrawals/${id}/approve`, { txNumber: txNumber.trim() });
            await load();
        }
        catch (e) {
            alert(e instanceof Error ? e.message : 'Failed');
        }
        finally {
            setProcessingId(null);
        }
    }
    async function rejectWithdrawal(id) {
        if (!confirm('Reject this withdrawal? Funds will be refunded to player.'))
            return;
        setProcessingId(id);
        try {
            await cashierFetch(session.token, 'POST', `/api/cashier/withdrawals/${id}/reject`);
            await load();
        }
        catch (e) {
            alert(e instanceof Error ? e.message : 'Failed');
        }
        finally {
            setProcessingId(null);
        }
    }
    const tabStyle = (active) => ({
        flex: 1, padding: '10px 0', border: 'none',
        background: active ? C.amber : C.card2,
        color: active ? '#0a0e1a' : C.muted,
        fontSize: 14, fontWeight: 700, cursor: 'pointer',
        borderRadius: 10, transition: 'all 0.15s',
    });
    return (_jsxs("div", { style: { minHeight: '100dvh', background: C.bg, padding: '0 0 80px' }, children: [_jsxs("div", { style: {
                    background: C.card, borderBottom: `1px solid ${C.border}`,
                    padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 16, fontWeight: 800, color: C.text }, children: "\uD83D\uDCB0 Cashier" }), _jsx("div", { style: { fontSize: 12, color: C.muted }, children: session.displayName })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsx("button", { onClick: () => void load(), style: { background: C.card2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', color: C.muted, fontSize: 13, cursor: 'pointer' }, children: "\u21BB Refresh" }), _jsx("button", { onClick: () => { clearSession(); onLogout(); }, style: { background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '6px 12px', color: C.red, fontSize: 13, cursor: 'pointer' }, children: "Sign out" })] })] }), _jsxs("div", { style: { padding: '16px' }, children: [_jsxs("div", { style: { display: 'flex', gap: 8, marginBottom: 16 }, children: [_jsxs("button", { style: tabStyle(tab === 'deposits'), onClick: () => setTab('deposits'), children: ["Deposits ", deposits.length > 0 && `(${deposits.length})`] }), _jsxs("button", { style: tabStyle(tab === 'withdrawals'), onClick: () => setTab('withdrawals'), children: ["Withdrawals ", withdrawals.length > 0 && `(${withdrawals.length})`] })] }), error && (_jsx("div", { style: {
                            background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)',
                            borderRadius: 10, padding: '10px 14px', color: C.red, fontSize: 13, marginBottom: 12,
                        }, children: error })), loading && (_jsx("div", { style: { textAlign: 'center', color: C.muted, padding: 40 }, children: "Loading\u2026" })), !loading && tab === 'deposits' && (_jsxs(_Fragment, { children: [deposits.length === 0 && (_jsx("div", { style: { textAlign: 'center', color: C.muted, padding: 40 }, children: "No pending deposits" })), deposits.map((d) => (_jsx(ItemCard, { children: _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }, children: [_jsxs("div", { children: [_jsxs("div", { style: { fontSize: 16, fontWeight: 800, color: C.green }, children: ["+", d.amount, " ETB"] }), _jsxs("div", { style: { fontSize: 12, color: C.muted, marginTop: 2 }, children: ["TX: ", d.tx_number] }), _jsxs("div", { style: { fontSize: 12, color: C.text, marginTop: 2 }, children: ["Player: ", d.player_username ?? _jsx("span", { style: { color: C.muted }, children: "Not linked yet" })] }), _jsx("div", { style: { fontSize: 11, color: C.muted, marginTop: 2 }, children: new Date(d.created_at).toLocaleString() })] }), d.player_username && (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }, children: [_jsx(ActionBtn, { label: "\u2713 Approve", color: C.green, onClick: () => void approveDeposit(d.id), loading: processingId === d.id }), _jsx(ActionBtn, { label: "\u2715 Reject", color: C.red, onClick: () => void rejectDeposit(d.id), loading: processingId === d.id })] }))] }) }, d.id)))] })), !loading && tab === 'withdrawals' && (_jsxs(_Fragment, { children: [withdrawals.length === 0 && (_jsx("div", { style: { textAlign: 'center', color: C.muted, padding: 40 }, children: "No pending withdrawals" })), withdrawals.map((w) => (_jsx(ItemCard, { children: _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }, children: [_jsxs("div", { children: [_jsxs("div", { style: { fontSize: 16, fontWeight: 800, color: C.red }, children: ["-", w.amount, " ETB"] }), _jsxs("div", { style: { fontSize: 12, color: C.text, marginTop: 2 }, children: ["Player: ", w.player_username ?? '-'] }), _jsxs("div", { style: { fontSize: 12, color: C.muted, marginTop: 2 }, children: ["Phone: ", w.phone] }), _jsx("div", { style: { fontSize: 11, color: C.muted, marginTop: 2 }, children: new Date(w.created_at).toLocaleString() })] }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }, children: [_jsx(ActionBtn, { label: "\u2713 Approve", color: C.green, onClick: () => void approveWithdrawal(w.id), loading: processingId === w.id }), _jsx(ActionBtn, { label: "\u2715 Reject", color: C.red, onClick: () => void rejectWithdrawal(w.id), loading: processingId === w.id })] })] }) }, w.id)))] }))] })] }));
}
// ── Root ──────────────────────────────────────────────────────────────────────
export default function CashierScreen() {
    const [session, setSession] = useState(loadSession);
    return session
        ? _jsx(Dashboard, { session: session, onLogout: () => setSession(null) })
        : _jsx(LoginForm, { onLogin: setSession });
}
//# sourceMappingURL=CashierScreen.js.map