import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAgentDashboard, getAgentInviteLink, requestAgentWithdrawal, } from '../lib/api';
import { getAgentJwt, initAuth } from '../lib/auth';
import { formatMoney } from '../lib/format';
const C = {
    bg: '#070d1a',
    card: '#0c1626',
    cardHover: '#101e33',
    border: 'rgba(148,163,184,0.12)',
    borderBright: 'rgba(148,163,184,0.22)',
    text: '#e8f0fe',
    muted: '#7a93b4',
    dim: '#3d5474',
    green: '#34d399',
    greenDim: 'rgba(52,211,153,0.12)',
    blue: '#60a5fa',
    blueDim: 'rgba(96,165,250,0.12)',
    amber: '#fbbf24',
    amberDim: 'rgba(251,191,36,0.12)',
    purple: '#a78bfa',
    purpleDim: 'rgba(167,139,250,0.12)',
    red: '#f87171',
    redDim: 'rgba(248,113,113,0.1)',
};
function StatCard({ label, value, color, bg, icon }) {
    return (_jsxs("div", { style: {
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
            padding: '16px', display: 'flex', flexDirection: 'column', gap: 10,
        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [_jsx("span", { style: { fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }, children: label }), _jsx("div", { style: { width: 32, height: 32, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }, children: icon })] }), _jsx("div", { style: { fontSize: 22, fontWeight: 900, color, lineHeight: 1 }, children: value })] }));
}
function SectionHeader({ title, subtitle }) {
    return (_jsxs("div", { style: { marginBottom: 14 }, children: [_jsx("div", { style: { fontWeight: 800, fontSize: 15, color: C.text }, children: title }), subtitle && _jsx("div", { style: { fontSize: 12, color: C.muted, marginTop: 3 }, children: subtitle })] }));
}
export default function AgentDashboardScreen() {
    const navigate = useNavigate();
    const [dashboard, setDashboard] = useState(null);
    const [inviteLink, setInviteLink] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [withdrawPhone, setWithdrawPhone] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [notice, setNotice] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const loadData = useCallback(async () => {
        try {
            await initAuth();
            const [d, inv] = await Promise.all([getAgentDashboard(), getAgentInviteLink()]);
            setDashboard(d);
            setInviteLink(inv.playerInviteLink);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to load';
            setError(msg);
            if (msg.includes('Agent session expired'))
                setTimeout(() => navigate('/'), 2000);
        }
        finally {
            setLoading(false);
        }
    }, [navigate]);
    useEffect(() => {
        if (!getAgentJwt()) {
            navigate('/');
            return;
        }
        void loadData();
    }, [loadData, navigate]);
    const handleCopy = useCallback(() => {
        if (!inviteLink)
            return;
        navigator.clipboard.writeText(inviteLink).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [inviteLink]);
    const handleWithdraw = useCallback(async (e) => {
        e.preventDefault();
        if (!dashboard)
            return;
        const amount = Number(withdrawAmount);
        if (!Number.isFinite(amount) || amount < 100) {
            setNotice({ type: 'error', text: 'Minimum withdrawal is ETB 100' });
            return;
        }
        if (!withdrawPhone.trim()) {
            setNotice({ type: 'error', text: 'Phone number is required' });
            return;
        }
        setSubmitting(true);
        setNotice(null);
        try {
            const res = await requestAgentWithdrawal(amount, withdrawPhone.trim());
            setDashboard(p => p ? {
                ...p,
                commissionBalance: Number(p.commissionBalance ?? 0) - amount,
                withdrawalRequests: [res.withdrawal, ...(p.withdrawalRequests ?? [])],
            } : p);
            setWithdrawAmount('');
            setWithdrawPhone('');
            setNotice({ type: 'success', text: res.message });
            setActiveTab('withdrawals');
        }
        catch (err) {
            setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Failed' });
        }
        finally {
            setSubmitting(false);
        }
    }, [dashboard, withdrawAmount, withdrawPhone]);
    if (loading)
        return _jsx("div", { style: { minHeight: '100dvh', background: C.bg } });
    if (error)
        return (_jsxs("div", { style: { minHeight: '100dvh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }, children: [_jsx("div", { style: { fontSize: 40 }, children: "\u26A0\uFE0F" }), _jsx("div", { style: { color: C.red, textAlign: 'center', fontSize: 14 }, children: error }), _jsx("button", { onClick: () => navigate('/'), style: { background: C.amber, color: '#07111f', border: 'none', borderRadius: 12, padding: '11px 28px', fontWeight: 800, cursor: 'pointer', fontSize: 14 }, children: "Back to Home" })] }));
    if (!dashboard)
        return null;
    const players = dashboard.players ?? [];
    const withdrawals = dashboard.withdrawalRequests ?? [];
    const balance = Number(dashboard.commissionBalance ?? 0);
    const tabs = [
        { id: 'overview', label: 'Overview', icon: '📊' },
        { id: 'players', label: `Players (${players.length})`, icon: '👥' },
        { id: 'withdrawals', label: `History (${withdrawals.length})`, icon: '📦' },
    ];
    return (_jsxs("div", { style: { background: C.bg, minHeight: '100dvh', color: C.text, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }, children: [_jsx("div", { style: { background: 'linear-gradient(180deg, #0d1e38 0%, #070d1a 100%)', borderBottom: `1px solid ${C.border}`, padding: '14px 16px', position: 'sticky', top: 0, zIndex: 20 }, children: _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 12, maxWidth: 640, margin: '0 auto' }, children: [_jsx("button", { onClick: () => navigate('/'), style: { background: 'rgba(255,255,255,0.07)', border: `1px solid ${C.border}`, color: C.text, width: 36, height: 36, borderRadius: 10, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, children: "\u2190" }), _jsxs("div", { style: { flex: 1 }, children: [_jsx("div", { style: { fontWeight: 900, fontSize: 17, letterSpacing: -0.3 }, children: "Agent Dashboard" }), _jsx("div", { style: { fontSize: 11, color: C.muted, marginTop: 1 }, children: "Commission overview & tools" })] }), _jsx("div", { style: { background: C.greenDim, border: `1px solid rgba(52,211,153,0.25)`, borderRadius: 20, padding: '5px 12px', fontSize: 11, color: C.green, fontWeight: 700 }, children: "\u25CF PARTNER" })] }) }), _jsx("div", { style: { background: 'linear-gradient(135deg, #0d1e38 0%, #091526 100%)', borderBottom: `1px solid ${C.border}`, padding: '20px 16px 24px' }, children: _jsxs("div", { style: { maxWidth: 640, margin: '0 auto' }, children: [_jsx("div", { style: { fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }, children: "Available Balance" }), _jsxs("div", { style: { fontSize: 40, fontWeight: 900, color: C.green, letterSpacing: -1, marginBottom: 4 }, children: ["ETB ", formatMoney(balance)] }), _jsx("div", { style: { fontSize: 12, color: C.muted }, children: "Withdrawable commission balance" }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 18 }, children: [
                                { label: 'Total Earned', value: `ETB ${formatMoney(dashboard.totalCommission ?? 0)}`, color: C.blue },
                                { label: 'This Week', value: `ETB ${formatMoney(dashboard.weeklyCommission ?? 0)}`, color: C.amber },
                                { label: 'Today', value: `ETB ${formatMoney(dashboard.dailyCommission ?? 0)}`, color: C.purple },
                            ].map(s => (_jsxs("div", { style: { background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '10px 12px', border: `1px solid ${C.border}` }, children: [_jsx("div", { style: { fontSize: 10, color: C.muted, marginBottom: 4, fontWeight: 600 }, children: s.label }), _jsx("div", { style: { fontSize: 14, fontWeight: 800, color: s.color }, children: s.value })] }, s.label))) })] }) }), _jsx("div", { style: { background: C.card, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 64, zIndex: 10 }, children: _jsx("div", { style: { maxWidth: 640, margin: '0 auto', display: 'flex' }, children: tabs.map(t => (_jsxs("button", { onClick: () => setActiveTab(t.id), style: {
                            flex: 1, padding: '12px 4px', border: 'none', background: 'none',
                            color: activeTab === t.id ? C.amber : C.muted,
                            fontWeight: activeTab === t.id ? 800 : 500, fontSize: 12,
                            borderBottom: activeTab === t.id ? `2px solid ${C.amber}` : '2px solid transparent',
                            cursor: 'pointer', transition: 'all 0.15s',
                        }, children: [t.icon, " ", t.label] }, t.id))) }) }), _jsxs("div", { style: { maxWidth: 640, margin: '0 auto', padding: '16px 16px 48px' }, children: [activeTab === 'overview' && (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 14 }, children: [_jsxs("div", { style: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px' }, children: [_jsx(SectionHeader, { title: "\uD83D\uDD17 Your Invite Link", subtitle: "Share with new players to earn commission on their deposits" }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("div", { style: { flex: 1, background: 'rgba(0,0,0,0.25)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 12px', fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: inviteLink || 'Loading…' }), _jsx("button", { onClick: handleCopy, style: {
                                                    background: copied ? C.green : C.amber, border: 'none', borderRadius: 12,
                                                    padding: '0 20px', color: '#07111f', fontWeight: 800, cursor: 'pointer',
                                                    fontSize: 13, flexShrink: 0, transition: 'background 0.2s',
                                                }, children: copied ? '✓ Copied' : 'Copy' })] })] }), _jsxs("div", { style: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px' }, children: [_jsx(SectionHeader, { title: "\uD83D\uDCB8 Request Withdrawal", subtitle: `Available: ETB ${formatMoney(balance)}` }), balance <= 0 && (_jsx("div", { style: { background: C.redDim, border: `1px solid rgba(248,113,113,0.25)`, borderRadius: 12, padding: '10px 14px', fontSize: 13, color: C.red, marginBottom: 14 }, children: "No balance available to withdraw." })), _jsxs("form", { onSubmit: handleWithdraw, style: { display: 'flex', flexDirection: 'column', gap: 10 }, children: [_jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6 }, children: "Amount (ETB)" }), _jsx("input", { type: "number", min: 100, step: "1", value: withdrawAmount, onChange: e => setWithdrawAmount(e.target.value), placeholder: "Min 100", disabled: balance <= 0, style: { width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.25)', border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, padding: '12px 14px', fontSize: 14, outline: 'none', opacity: balance <= 0 ? 0.5 : 1 } })] }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6 }, children: "Telebirr Phone" }), _jsx("input", { value: withdrawPhone, onChange: e => setWithdrawPhone(e.target.value), placeholder: "09XXXXXXXX", disabled: balance <= 0, style: { width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.25)', border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, padding: '12px 14px', fontSize: 14, outline: 'none', opacity: balance <= 0 ? 0.5 : 1 } })] })] }), notice && (_jsx("div", { style: { background: notice.type === 'success' ? C.greenDim : C.redDim, border: `1px solid ${notice.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`, color: notice.type === 'success' ? C.green : C.red, borderRadius: 12, padding: '10px 14px', fontSize: 13 }, children: notice.text })), _jsx("button", { type: "submit", disabled: submitting || balance <= 0, style: {
                                                    background: submitting || balance <= 0 ? 'rgba(251,191,36,0.4)' : C.amber,
                                                    border: 'none', borderRadius: 12, color: '#07111f', padding: '13px',
                                                    fontWeight: 900, fontSize: 14, cursor: submitting || balance <= 0 ? 'not-allowed' : 'pointer',
                                                }, children: submitting ? 'Submitting…' : 'Request Withdrawal' })] })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }, children: [_jsx(StatCard, { label: "Total Players", value: String(players.length), color: C.blue, bg: C.blueDim, icon: "\uD83D\uDC65" }), _jsx(StatCard, { label: "Withdrawal Requests", value: String(withdrawals.length), color: C.purple, bg: C.purpleDim, icon: "\uD83D\uDCE6" })] })] })), activeTab === 'players' && (_jsx("div", { style: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }, children: players.length === 0 ? (_jsxs("div", { style: { padding: '48px 20px', textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: 44, marginBottom: 12 }, children: "\uD83D\uDC65" }), _jsx("div", { style: { fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }, children: "No players yet" }), _jsx("div", { style: { fontSize: 13, color: C.muted }, children: "Share your invite link to start earning." })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { style: { padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [_jsxs("span", { style: { fontWeight: 700, fontSize: 14, color: C.text }, children: [players.length, " Referred Players"] }), _jsxs("span", { style: { fontSize: 12, color: C.muted }, children: ["Total commission: ETB ", formatMoney(players.reduce((s, p) => s + (p.totalCommissionFromPlayer ?? 0), 0))] })] }), _jsx("div", { children: players.map((p, i) => (_jsxs("div", { style: { padding: '13px 16px', borderTop: i === 0 ? 'none' : `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12 }, children: [_jsx("div", { style: { width: 38, height: 38, borderRadius: 12, background: 'rgba(96,165,250,0.15)', border: `1px solid rgba(96,165,250,0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: C.blue, flexShrink: 0 }, children: (p.username?.[0] ?? '?').toUpperCase() }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { fontWeight: 700, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: ["@", p.username] }), _jsxs("div", { style: { fontSize: 11, color: C.muted, marginTop: 2 }, children: ["Joined ", new Date(p.joinedAt).toLocaleDateString()] })] }), _jsxs("div", { style: { textAlign: 'right', flexShrink: 0 }, children: [_jsxs("div", { style: { fontSize: 13, fontWeight: 800, color: C.green }, children: ["+ETB ", formatMoney(p.totalCommissionFromPlayer ?? 0)] }), _jsxs("div", { style: { fontSize: 11, color: C.muted, marginTop: 2 }, children: ["Bal: ETB ", formatMoney(p.depositBalance ?? 0)] })] })] }, p.playerId))) })] })) })), activeTab === 'withdrawals' && (_jsx("div", { style: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }, children: withdrawals.length === 0 ? (_jsxs("div", { style: { padding: '48px 20px', textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: 44, marginBottom: 12 }, children: "\uD83D\uDCE6" }), _jsx("div", { style: { fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }, children: "No withdrawals yet" }), _jsx("div", { style: { fontSize: 13, color: C.muted }, children: "Your withdrawal history will appear here." })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { style: { padding: '14px 16px', borderBottom: `1px solid ${C.border}` }, children: _jsxs("span", { style: { fontWeight: 700, fontSize: 14, color: C.text }, children: [withdrawals.length, " Requests"] }) }), withdrawals.map((w, i) => {
                                    const statusColor = w.status === 'approved' ? C.green : w.status === 'rejected' ? C.red : C.amber;
                                    const statusBg = w.status === 'approved' ? C.greenDim : w.status === 'rejected' ? C.redDim : C.amberDim;
                                    return (_jsxs("div", { style: { padding: '14px 16px', borderTop: i === 0 ? 'none' : `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12 }, children: [_jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { fontWeight: 800, fontSize: 15, color: C.text }, children: ["ETB ", formatMoney(w.amount ?? 0)] }), _jsxs("div", { style: { fontSize: 11, color: C.muted, marginTop: 3 }, children: [w.phone, " \u00B7 ", new Date(w.createdAt).toLocaleDateString()] })] }), _jsx("div", { style: { background: statusBg, color: statusColor, border: `1px solid ${statusColor}44`, borderRadius: 20, padding: '5px 12px', fontSize: 11, fontWeight: 700, textTransform: 'capitalize', flexShrink: 0 }, children: w.status })] }, w.id));
                                })] })) }))] })] }));
}
//# sourceMappingURL=AgentDashboardScreen.js.map