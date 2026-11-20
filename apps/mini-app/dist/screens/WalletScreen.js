import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { getProfile, getWalletTransactions, getDepositAccounts, verifyManualDeposit, withdrawFunds, } from '../lib/api';
import { initAuth } from '../lib/auth';
import { formatMoney } from '../lib/format';
// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
    bg: '#0d0b22',
    surface: '#13102b',
    surface2: '#1a1535',
    surface3: '#1e1a3a',
    border: 'rgba(124,58,237,0.18)',
    borderMid: 'rgba(124,58,237,0.3)',
    violet: '#7c3aed',
    magenta: '#e040fb',
    gold: '#ffd54f',
    text: '#f1f5f9',
    muted: 'rgba(255,255,255,0.45)',
    dim: 'rgba(255,255,255,0.22)',
    green: '#34d399',
    greenDim: 'rgba(52,211,153,0.15)',
    red: '#f87171',
    redDim: 'rgba(248,113,113,0.15)',
    blue: '#60a5fa',
    blueDim: 'rgba(96,165,250,0.15)',
};
// ── Transaction labels (English + Amharic) ────────────────────────────────────
const TX_META = {
    deposit: { label: 'Deposit / ገቢ', color: C.green, sign: '+' },
    withdrawal: { label: 'Withdrawal / ወጪ', color: C.red, sign: '-' },
    game_entry: { label: 'Game Entry / ጨዋታ መግቢያ', color: C.red, sign: '-' },
    game_win: { label: 'Game Win / ጨዋታ አሸናፊ', color: C.green, sign: '+' },
    referral_commission: { label: 'Referral Bonus / ሪፈራል', color: C.green, sign: '+' },
    admin_credit: { label: 'Admin Credit / ክሬዲት', color: C.green, sign: '+' },
    admin_debit: { label: 'Admin Debit / ዲቢት', color: C.red, sign: '-' },
    refund: { label: 'Refund / ተመላሽ', color: C.green, sign: '+' },
};
// ── Wallet type labels ─────────────────────────────────────────────────────────
const WALLET_LABEL = {
    main: 'Main Wallet / ዋና ቦርሳ',
    play: 'Play Wallet / ጨዋታ ቦርሳ',
};
// ── Quick amount buttons ──────────────────────────────────────────────────────
const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];
const BANK_LABELS = {
    telebirr: '📱 Telebirr',
    cbebirr: '📱 CBE Birr',
};
// ── Small reusable button ─────────────────────────────────────────────────────
function Btn({ onClick, disabled = false, color, children, style = {}, }) {
    return (_jsx("button", { onClick: onClick, disabled: disabled, style: {
            width: '100%',
            padding: '14px 0',
            borderRadius: 999,
            border: 'none',
            background: disabled
                ? C.surface2
                : (color ?? 'linear-gradient(135deg, #7c3aed, #e040fb)'),
            color: disabled ? C.dim : '#fff',
            fontWeight: 900,
            fontSize: 15,
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.2s',
            opacity: disabled ? 0.55 : 1,
            letterSpacing: '0.03em',
            ...style,
        }, children: children }));
}
// ── Step badge ────────────────────────────────────────────────────────────────
function Step({ n, label }) {
    return (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }, children: [_jsx("div", { style: {
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #7c3aed, #e040fb)',
                    color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 900, fontSize: 13, flexShrink: 0,
                    boxShadow: '0 2px 10px rgba(124,58,237,0.4)',
                }, children: n }), _jsx("span", { style: { color: C.text, fontWeight: 700, fontSize: 14 }, children: label })] }));
}
// ── Input ────────────────────────────────────────────────────────────────────
function Input({ value, onChange, placeholder, type = 'text', disabled = false, }) {
    return (_jsx("input", { type: type, value: value, onChange: e => onChange(e.target.value), placeholder: placeholder, disabled: disabled, style: {
            width: '100%',
            padding: '13px 16px',
            borderRadius: 12,
            border: `1.5px solid ${C.border}`,
            background: C.surface2,
            color: C.text,
            fontSize: 15,
            outline: 'none',
            boxSizing: 'border-box',
            opacity: disabled ? 0.6 : 1,
            transition: 'border-color 0.2s',
        } }));
}
// ── Alert box ─────────────────────────────────────────────────────────────────
function Alert({ type, msg }) {
    const colors = {
        success: { bg: C.greenDim, border: C.green, text: C.green },
        error: { bg: C.redDim, border: C.red, text: C.red },
        info: { bg: C.blueDim, border: C.blue, text: C.blue },
    }[type];
    return (_jsx("div", { style: {
            padding: '13px 16px', borderRadius: 12,
            background: colors.bg, border: `1px solid ${colors.border}`,
            color: colors.text, fontSize: 14, fontWeight: 600, lineHeight: 1.5,
        }, children: msg }));
}
// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function WalletScreen() {
    const [profile, setProfile] = useState(null);
    const [tab, setTab] = useState('deposit');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    // ── Deposit state ──────────────────────────────────────────────────────────
    const [depositAccounts, setDepositAccounts] = useState([]);
    const [depositAmount, setDepositAmount] = useState('');
    const [depositReceipt, setDepositReceipt] = useState('');
    const [depositLoading, setDepositLoading] = useState(false);
    const [depositResult, setDepositResult] = useState(null);
    const [accountsLoading, setAccountsLoading] = useState(false);
    // ── Withdraw state ─────────────────────────────────────────────────────────
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [withdrawPhone, setWithdrawPhone] = useState('');
    const [withdrawName, setWithdrawName] = useState('');
    const [withdrawConfirm, setWithdrawConfirm] = useState(false);
    const [withdrawLoading, setWithdrawLoading] = useState(false);
    const [withdrawResult, setWithdrawResult] = useState(null);
    const [totalDeposited, setTotalDeposited] = useState(null);
    const [depositCheckLoading, setDepositCheckLoading] = useState(false);
    // ── Load profile ───────────────────────────────────────────────────────────
    const loadProfile = useCallback(async () => {
        try {
            await initAuth();
            setProfile(await getProfile());
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load / መጫን አልተሳካም');
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { loadProfile(); }, [loadProfile]);
    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            setProfile(await getProfile());
        }
        catch { }
        finally {
            setRefreshing(false);
        }
    }, []);
    // ── Load deposit accounts when deposit tab opens ───────────────────────────
    useEffect(() => {
        if (tab !== 'deposit')
            return;
        setAccountsLoading(true);
        getDepositAccounts()
            .then(r => setDepositAccounts(r.accounts.filter(a => !a.bank || a.bank === 'telebirr' || a.bank === 'cbebirr')))
            .catch(() => { })
            .finally(() => setAccountsLoading(false));
    }, [tab]);
    // ── Check total deposits when withdraw tab opens ───────────────────────────
    useEffect(() => {
        if (tab !== 'withdraw')
            return;
        if (totalDeposited !== null)
            return;
        setDepositCheckLoading(true);
        getWalletTransactions(1, 100)
            .then(res => {
            const total = res.items
                .filter(tx => tx.type === 'deposit')
                .reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
            setTotalDeposited(total);
        })
            .catch(() => setTotalDeposited(0))
            .finally(() => setDepositCheckLoading(false));
    }, [tab, totalDeposited]);
    // ── Deposit submit ─────────────────────────────────────────────────────────
    const handleDeposit = async () => {
        const amount = parseFloat(depositAmount);
        if (!amount || amount <= 0) {
            setDepositResult({ type: 'error', msg: 'Please enter a valid amount / ትክክለኛ መጠን ያስገቡ' });
            return;
        }
        if (amount < 50) {
            setDepositResult({ type: 'error', msg: 'Minimum deposit is ETB 50 / ዝቅተኛ ዲፖዚት ETB 50 ነው' });
            return;
        }
        if (!depositReceipt.trim()) {
            setDepositResult({ type: 'error', msg: 'Please paste your payment receipt (Telebirr or CBE Birr) / ደረሰኙን ይለጥፉ' });
            return;
        }
        setDepositLoading(true);
        setDepositResult(null);
        try {
            const res = await verifyManualDeposit(amount, depositReceipt.trim());
            const msg = res.pending_approval
                ? `⏳ Your deposit of ${amount} ETB is being processed. / ዲፖዚትዎ እየተሰራ ነው።`
                : `✅ ${res.amount} ETB deposited successfully! / ዲፖዚት ተቀብሏል!`;
            setDepositResult({ type: res.pending_approval ? 'info' : 'success', msg });
            setDepositAmount('');
            setDepositReceipt('');
            setTimeout(() => getProfile().then(setProfile).catch(() => { }), 1500);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Deposit failed / ዲፖዚት አልተሳካም';
            setDepositResult({ type: 'error', msg });
        }
        finally {
            setDepositLoading(false);
        }
    };
    // ── Withdraw: validate → show confirm step ────────────────────────────────
    const handleWithdrawReview = () => {
        const amount = parseFloat(withdrawAmount);
        if (!amount || amount <= 0) {
            setWithdrawResult({ type: 'error', msg: 'Please enter a valid amount / ትክክለኛ መጠን ያስገቡ' });
            return;
        }
        if (amount < 200) {
            setWithdrawResult({ type: 'error', msg: 'Minimum withdrawal is ETB 200 / ዝቅተኛ ወጪ ETB 200 ነው' });
            return;
        }
        if (!withdrawPhone.trim()) {
            setWithdrawResult({ type: 'error', msg: 'Please enter your phone number / ስልክ ቁጥርዎን ያስገቡ' });
            return;
        }
        if (!withdrawName.trim()) {
            setWithdrawResult({ type: 'error', msg: 'Please enter the receiver name / ተቀባዩን ስም ያስገቡ' });
            return;
        }
        setWithdrawResult(null);
        setWithdrawConfirm(true);
    };
    // ── Withdraw: confirmed submit ─────────────────────────────────────────────
    const handleWithdraw = async () => {
        const amount = parseFloat(withdrawAmount);
        setWithdrawLoading(true);
        setWithdrawResult(null);
        try {
            await withdrawFunds(amount, withdrawPhone.trim(), withdrawName.trim());
            setWithdrawResult({ type: 'success', msg: `✅ Withdrawal request of ${amount} ETB sent. Pending admin approval. / ጥያቄ ተልኳል።` });
            setWithdrawAmount('');
            setWithdrawPhone('');
            setWithdrawName('');
            setWithdrawConfirm(false);
            setTimeout(() => getProfile().then(setProfile).catch(() => { }), 1500);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Withdrawal failed / ወጪ አልተሳካም';
            setWithdrawResult({ type: 'error', msg });
            setWithdrawConfirm(false);
        }
        finally {
            setWithdrawLoading(false);
        }
    };
    // ── Loading / error guards ─────────────────────────────────────────────────
    if (loading)
        return _jsx("div", { style: { minHeight: '100dvh', background: C.bg } });
    if (error || !profile)
        return (_jsxs("div", { style: {
                minHeight: '100dvh', background: C.bg,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', color: C.red, padding: 20, textAlign: 'center', gap: 16,
            }, children: [_jsx("div", { style: { fontSize: 40 }, children: "\u26A0\uFE0F" }), _jsx("div", { children: error ?? 'Failed to load / መጫን አልተሳካም' }), _jsx("button", { onClick: () => { setLoading(true); setError(null); loadProfile(); }, style: {
                        marginTop: 8, padding: '12px 28px', borderRadius: 999, border: 'none',
                        background: 'linear-gradient(135deg, #7c3aed, #e040fb)',
                        color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer',
                    }, children: "Retry / \u12A5\u1295\u12F0\u1308\u1293 \u121E\u12AD\u122D" })] }));
    const mainBal = Number(profile.mainWallet?.balance ?? 0);
    const playBal = Number(profile.playWallet?.balance ?? 0);
    const totalBal = mainBal + playBal;
    const username = profile.username ?? profile.phone ?? '—';
    const TABS = [
        {
            id: 'deposit',
            label: 'Deposit / ዲፖዚት',
            icon: (_jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M12 5v14M5 12l7 7 7-7" }) })),
        },
        {
            id: 'withdraw',
            label: 'Withdraw / ወጪ',
            icon: (_jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M12 19V5M5 12l7-7 7 7" }) })),
        },
    ];
    return (_jsxs("div", { style: {
            minHeight: '100dvh',
            background: 'linear-gradient(180deg, #0d0b22 0%, #0c0a1e 100%)',
            paddingBottom: 90,
            fontFamily: "'Nunito', sans-serif",
        }, children: [_jsxs("div", { style: { padding: '24px 16px 0' }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, children: [_jsx("span", { style: { fontSize: 22, fontWeight: 900, color: C.text }, children: "\uD83D\uDC8E Wallet / \u1266\u122D\u1233" }), _jsx("button", { onClick: handleRefresh, "aria-label": "Refresh / \u12A0\u12F5\u1235", style: {
                                    background: 'rgba(124,58,237,0.12)', border: `1px solid ${C.border}`,
                                    borderRadius: 10, cursor: 'pointer', padding: 8,
                                    opacity: refreshing ? 0.4 : 1, transition: 'opacity 0.2s',
                                }, children: _jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: C.violet, strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: { display: 'block', transition: 'transform 0.6s', transform: refreshing ? 'rotate(360deg)' : 'none' }, children: [_jsx("polyline", { points: "23 4 23 10 17 10" }), _jsx("polyline", { points: "1 20 1 14 7 14" }), _jsx("path", { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" })] }) })] }), _jsxs("div", { style: {
                            background: 'linear-gradient(135deg, #1e1245 0%, #130f30 100%)',
                            border: `1px solid ${C.borderMid}`,
                            borderRadius: 20, padding: '20px 20px 18px',
                            marginBottom: 16, position: 'relative', overflow: 'hidden',
                            boxShadow: '0 8px 32px rgba(124,58,237,0.2)',
                        }, children: [_jsx("div", { style: {
                                    position: 'absolute', top: -30, right: -30, width: 140, height: 140,
                                    borderRadius: '50%',
                                    background: 'radial-gradient(circle, rgba(224,64,251,0.12) 0%, transparent 70%)',
                                    pointerEvents: 'none',
                                } }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }, children: [_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: C.muted, strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }), _jsx("circle", { cx: "12", cy: "7", r: "4" })] }), _jsx("span", { style: { color: C.muted, fontSize: 14 }, children: username }), _jsxs("div", { style: {
                                            marginLeft: 'auto',
                                            background: C.greenDim, border: `1px solid rgba(52,211,153,0.3)`,
                                            borderRadius: 999, padding: '3px 10px',
                                            display: 'flex', alignItems: 'center', gap: 4,
                                        }, children: [_jsx("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: C.green, strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polyline", { points: "20 6 9 17 4 12" }) }), _jsx("span", { style: { color: C.green, fontSize: 12, fontWeight: 700 }, children: profile.phone_verified ? 'Verified / ተረጋግጧል' : 'Unverified / አልተረጋገጠም' })] })] }), _jsx("div", { style: { fontSize: 12, color: C.muted, marginBottom: 4 }, children: "Total Balance / \u1320\u1245\u120B\u120B \u1240\u122A \u1202\u1233\u1265" }), _jsxs("div", { style: { fontSize: 34, fontWeight: 900, color: C.text, letterSpacing: '-0.5px' }, children: [formatMoney(totalBal), " ", _jsx("span", { style: { fontSize: 18, color: C.gold, fontWeight: 700 }, children: "ETB" })] }), _jsx("div", { style: { display: 'flex', gap: 10, marginTop: 14 }, children: [
                                    { label: 'Main / ዋና', val: mainBal, color: C.gold },
                                    { label: 'Play / ጨዋታ', val: playBal, color: '#a78bfa' },
                                ].map(w => (_jsxs("div", { style: {
                                        flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 12,
                                        padding: '10px 12px', border: `1px solid rgba(124,58,237,0.2)`,
                                    }, children: [_jsx("div", { style: { fontSize: 11, color: C.muted, marginBottom: 4 }, children: w.label }), _jsx("div", { style: { fontSize: 17, fontWeight: 900, color: w.color }, children: formatMoney(w.val) })] }, w.label))) })] }), _jsx("div", { style: {
                            display: 'flex', background: C.surface, borderRadius: 999, padding: 4,
                            border: `1px solid ${C.border}`, gap: 2,
                        }, children: TABS.map(t => (_jsxs("button", { onClick: () => {
                                setTab(t.id);
                                setDepositResult(null);
                                setWithdrawResult(null);
                                setWithdrawConfirm(false);
                            }, style: {
                                flex: 1, padding: '10px 4px', border: 'none',
                                borderRadius: 999,
                                background: tab === t.id
                                    ? 'linear-gradient(135deg, #7c3aed, #e040fb)'
                                    : 'transparent',
                                color: tab === t.id ? '#fff' : C.muted,
                                fontWeight: tab === t.id ? 800 : 600,
                                fontSize: 12, cursor: 'pointer', transition: 'all 0.2s',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                                boxShadow: tab === t.id ? '0 4px 16px rgba(124,58,237,0.4)' : 'none',
                            }, children: [t.icon, t.label] }, t.id))) })] }), tab === 'deposit' && (_jsxs("div", { style: { padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }, children: [_jsxs("div", { style: {
                            background: C.surface, border: `1px solid ${C.border}`,
                            borderRadius: 18, padding: '16px 18px',
                        }, children: [_jsx(Step, { n: 1, label: "Send money to one of these accounts / \u12A8\u1273\u1279 \u12C8\u12F0 \u12A0\u1295\u12F1 \u1241\u1325\u122D \u12ED\u120B\u12A9" }), _jsx("div", { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }, children: ['📱 Telebirr', '📱 CBE Birr'].map(b => (_jsx("span", { style: {
                                        padding: '3px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                                        background: 'rgba(124,58,237,0.12)',
                                        color: '#a78bfa',
                                        border: `1px solid rgba(124,58,237,0.25)`,
                                    }, children: b }, b))) }), accountsLoading ? (_jsx("div", { style: { color: C.muted, fontSize: 14, textAlign: 'center', padding: '8px 0' }, children: "\u23F3 Loading... / \u1260\u1218\u132B\u1295 \u120B\u12ED..." })) : depositAccounts.length === 0 ? (_jsx("div", { style: { color: C.muted, fontSize: 14 }, children: "No deposit account found. Contact admin. / \u12E8\u1274\u120C\u1265\u122D \u1241\u1325\u122D \u12A0\u120D\u1270\u1308\u1298\u121D\u1362" })) : (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: depositAccounts.map(acc => (_jsxs("div", { style: {
                                        background: C.surface2, borderRadius: 14,
                                        padding: '12px 14px',
                                        border: `1px solid rgba(124,58,237,0.3)`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        boxShadow: '0 2px 12px rgba(124,58,237,0.1)',
                                    }, children: [_jsxs("div", { children: [acc.bank && (_jsx("div", { style: {
                                                        display: 'inline-block', marginBottom: 4,
                                                        padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                                                        background: 'rgba(124,58,237,0.12)', color: '#a78bfa',
                                                        border: `1px solid rgba(124,58,237,0.25)`,
                                                    }, children: BANK_LABELS[acc.bank] ?? acc.bank })), _jsx("div", { style: { color: C.gold, fontSize: 20, fontWeight: 900, letterSpacing: 1 }, children: acc.phone }), acc.name && (_jsx("div", { style: { color: C.muted, fontSize: 13, marginTop: 2 }, children: acc.name }))] }), _jsx("span", { style: { fontSize: 24 }, children: "\uD83D\uDCF1" })] }, acc.phone))) }))] }), _jsxs("div", { style: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 18px' }, children: [_jsx(Step, { n: 2, label: "Enter the amount you sent (min ETB 50) / \u12E8\u121A\u120D\u12A9\u1275\u1295 \u1218\u1320\u1295 \u12EB\u1235\u1308\u1261" }), _jsx(Input, { value: depositAmount, onChange: v => { setDepositAmount(v); setDepositResult(null); }, placeholder: "\u1208\u121D\u1233\u120C: 200", type: "number" }), _jsx("div", { style: { display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }, children: QUICK_AMOUNTS.map(a => (_jsx("button", { onClick: () => { setDepositAmount(String(a)); setDepositResult(null); }, style: {
                                        padding: '7px 14px', borderRadius: 999,
                                        border: `1px solid ${depositAmount === String(a) ? C.violet : C.border}`,
                                        background: depositAmount === String(a)
                                            ? 'rgba(124,58,237,0.2)'
                                            : C.surface2,
                                        color: depositAmount === String(a) ? '#a78bfa' : C.muted,
                                        fontWeight: 700, fontSize: 13, cursor: 'pointer',
                                        transition: 'all 0.15s',
                                    }, children: a }, a))) })] }), _jsxs("div", { style: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 18px' }, children: [_jsx(Step, { n: 3, label: "Paste your payment receipt / \u12F0\u1228\u1230\u1299\u1295 \u12ED\u1208\u1325\u1349" }), _jsxs("div", { style: { color: C.muted, fontSize: 12, marginBottom: 10, lineHeight: 1.5 }, children: ["\u2705 Telebirr SMS \u00B7 CBE Birr SMS", _jsx("br", {}), "\u12A8\u12DA\u1205 \u1201\u1208\u1275 \u1218\u1295\u1308\u12F6\u127D \u12EB\u1235\u1270\u120B\u1208\u1349 \u12A8\u1206\u1290 \u12E8\u12F0\u1228\u1230\u1299\u1295 \u1241\u1325\u122D \u12C8\u12ED\u121D \u1219\u1209 SMS \u12ED\u1208\u1325\u1349"] }), _jsx("textarea", { value: depositReceipt, onChange: e => { setDepositReceipt(e.target.value); setDepositResult(null); }, placeholder: 'Telebirr: "Your transaction number is ABC123XYZ0..."\n' +
                                    'CBE Birr: "Receipt No: CB20260XXXXX..."', rows: 5, style: {
                                    width: '100%', padding: '13px 14px', borderRadius: 12,
                                    border: `1.5px solid ${C.border}`, background: C.surface2,
                                    color: C.text, fontSize: 13, outline: 'none',
                                    resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5,
                                } })] }), depositResult && _jsx(Alert, { type: depositResult.type, msg: depositResult.msg }), _jsx(Btn, { onClick: handleDeposit, disabled: depositLoading || depositAccounts.length === 0, children: depositLoading ? '⏳ Processing... / እየተሰራ ነው...' : '✅ Confirm Deposit / ዲፖዚት አረጋግጥ' })] })), tab === 'withdraw' && (() => {
                if (depositCheckLoading || totalDeposited === null) {
                    return (_jsx("div", { style: { padding: '18px 16px' }, children: _jsx("div", { style: { padding: 40, textAlign: 'center', color: C.muted }, children: "\u23F3 Checking eligibility... / \u1265\u1241\u1290\u1275 \u12A5\u12E8\u1270\u1348\u1270\u1238 \u1290\u12CD..." }) }));
                }
                if (totalDeposited < 100) {
                    return (_jsxs("div", { style: { padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 16 }, children: [_jsxs("div", { style: {
                                    background: 'rgba(224,64,251,0.08)',
                                    border: `1px solid rgba(224,64,251,0.3)`,
                                    borderRadius: 18, padding: '24px 18px', textAlign: 'center',
                                }, children: [_jsx("div", { style: { fontSize: 44, marginBottom: 12 }, children: "\uD83D\uDD12" }), _jsx("div", { style: { color: C.magenta, fontWeight: 900, fontSize: 18, marginBottom: 8 }, children: "Withdrawal Locked / \u12C8\u132A \u1270\u1246\u120D\u134F\u120D" }), _jsxs("div", { style: { color: C.text, fontSize: 14, lineHeight: 1.7 }, children: ["You need a minimum total deposit of ", _jsx("strong", { style: { color: C.gold }, children: "ETB 100" }), " to withdraw.", _jsx("br", {}), "\u1208\u121B\u12CD\u1323\u1275 \u1262\u12EB\u1295\u1235 ", _jsx("strong", { style: { color: C.gold }, children: "100 \u1265\u122D" }), " \u12F2\u1356\u12DA\u1275 \u121B\u12F5\u1228\u130D \u12A0\u1208\u1265\u12CE\u1362"] }), _jsxs("div", { style: {
                                            marginTop: 14, padding: '10px 16px', borderRadius: 12,
                                            background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
                                            display: 'inline-block',
                                        }, children: [_jsx("span", { style: { color: C.muted, fontSize: 13 }, children: "Total deposited: " }), _jsxs("span", { style: { color: C.gold, fontWeight: 900, fontSize: 16 }, children: [formatMoney(totalDeposited), " ETB"] }), _jsx("span", { style: { color: C.muted, fontSize: 12 }, children: " / 100 ETB needed" })] })] }), _jsx(Btn, { onClick: () => setTab('deposit'), color: "linear-gradient(135deg, #059669, #34d399)", style: { color: '#fff' }, children: "\u2B07 Make a Deposit / \u12F2\u1356\u12DA\u1275 \u12EB\u12F5\u122D\u1309" })] }));
                }
                return (_jsxs("div", { style: { padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }, children: [_jsxs("div", { style: {
                                background: C.surface, border: `1px solid ${C.border}`,
                                borderRadius: 16, padding: '14px 18px',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }, children: [_jsx("span", { style: { color: C.muted, fontSize: 13 }, children: "Available Balance (Main) / \u12CB\u1293 \u1266\u122D\u1233" }), _jsxs("span", { style: { color: C.gold, fontWeight: 900, fontSize: 20 }, children: [formatMoney(mainBal), " ETB"] })] }), _jsxs("div", { style: {
                                background: 'rgba(124,58,237,0.08)', border: `1px solid rgba(124,58,237,0.25)`,
                                borderRadius: 14, padding: '13px 16px',
                            }, children: [_jsx("div", { style: { color: '#a78bfa', fontSize: 13, fontWeight: 700, marginBottom: 6 }, children: "\uD83D\uDCCB Withdrawal Rules / \u12E8\u12C8\u132A \u1205\u130E\u127D" }), _jsxs("ul", { style: { color: C.text, fontSize: 13, margin: 0, paddingLeft: 16, lineHeight: 1.7 }, children: [_jsxs("li", { children: ["Minimum withdrawal: ", _jsx("strong", { children: "ETB 200" }), " / \u12DD\u1245\u1270\u129B \u12C8\u132A"] }), _jsxs("li", { children: ["Requires total deposit of ", _jsx("strong", { children: "ETB 100" }), " / \u1262\u12EB\u1295\u1235 100 \u1265\u122D \u12F2\u1356\u12DA\u1275 \u12EB\u1235\u1348\u120D\u130B\u120D"] }), _jsx("li", { children: "Sent to your Telebirr number / \u12C8\u12F0 Telebirr \u1241\u1325\u122D\u12CE \u12ED\u120B\u12AB\u120D" })] })] }), _jsxs("div", { style: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 18px' }, children: [_jsx(Step, { n: 1, label: "Enter amount to withdraw / \u1218\u1320\u1295 \u12EB\u1235\u1308\u1261" }), _jsx(Input, { value: withdrawAmount, onChange: v => { setWithdrawAmount(v); setWithdrawResult(null); }, placeholder: "\u12DD\u1245\u1270\u129B ETB 200", type: "number" }), _jsxs("div", { style: { display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }, children: [[100, 200, 500, 1000, 2000].map(a => (_jsx("button", { onClick: () => { setWithdrawAmount(String(a)); setWithdrawResult(null); }, style: {
                                                padding: '7px 14px', borderRadius: 999,
                                                border: `1px solid ${withdrawAmount === String(a) ? C.magenta : C.border}`,
                                                background: withdrawAmount === String(a)
                                                    ? 'rgba(224,64,251,0.12)'
                                                    : C.surface2,
                                                color: withdrawAmount === String(a) ? C.magenta : C.muted,
                                                fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                                            }, children: a }, a))), _jsx("button", { onClick: () => { setWithdrawAmount(String(Math.floor(mainBal))); setWithdrawResult(null); }, style: {
                                                padding: '7px 14px', borderRadius: 999, border: `1px solid ${C.border}`,
                                                background: C.surface2, color: C.gold,
                                                fontWeight: 700, fontSize: 13, cursor: 'pointer',
                                            }, children: "Max / \u1219\u1209" })] })] }), _jsxs("div", { style: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 18px' }, children: [_jsx(Step, { n: 2, label: "Enter your Telebirr phone number / \u12E8Telebirr \u1235\u120D\u12AD \u1241\u1325\u122D \u12EB\u1235\u1308\u1261" }), _jsx(Input, { value: withdrawPhone, onChange: v => { setWithdrawPhone(v); setWithdrawResult(null); }, placeholder: "\u1208\u121D\u1233\u120C: 0912345678", type: "tel" }), _jsx("div", { style: { color: C.muted, fontSize: 12, marginTop: 8, lineHeight: 1.5 }, children: "\u26A0\uFE0F Enter your correct Telebirr number \u2014 funds will be sent here / \u1275\u12AD\u12AD\u1208\u129B \u12E8Telebirr \u1241\u1325\u122D \u12EB\u1235\u1308\u1261" })] }), _jsxs("div", { style: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 18px' }, children: [_jsx(Step, { n: 3, label: "Enter receiver name / \u1270\u1240\u1263\u12E9\u1295 \u1235\u121D \u12EB\u1235\u1308\u1261" }), _jsx(Input, { value: withdrawName, onChange: v => { setWithdrawName(v); setWithdrawResult(null); }, placeholder: "\u1208\u121D\u1233\u120C: Almaz Tadesse" }), _jsx("div", { style: { color: C.muted, fontSize: 12, marginTop: 8, lineHeight: 1.5 }, children: "Full name as registered on Telebirr / \u1260Telebirr \u120B\u12ED \u12E8\u1270\u1218\u12D8\u1308\u1260 \u1219\u1209 \u1235\u121D" })] }), withdrawResult && _jsx(Alert, { type: withdrawResult.type, msg: withdrawResult.msg }), _jsx(Btn, { onClick: handleWithdrawReview, disabled: withdrawLoading || mainBal < 200, color: "linear-gradient(135deg, #be185d, #e040fb)", style: { color: withdrawLoading || mainBal < 200 ? C.dim : '#fff' }, children: "\uD83D\uDCE4 Review Withdrawal / \u12EB\u1228\u130B\u130D\u1321" }), mainBal < 200 && (_jsx(Alert, { type: "error", msg: "Insufficient balance. Minimum withdrawal is ETB 200. / \u12DD\u1245\u1270\u129B \u12C8\u132A ETB 200 \u1290\u12CD\u1362" })), withdrawConfirm && (_jsx("div", { style: {
                                position: 'fixed', inset: 0, zIndex: 999,
                                background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
                                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                            }, children: _jsxs("div", { style: {
                                    background: C.surface, borderRadius: '24px 24px 0 0',
                                    padding: '24px 20px 36px', width: '100%', maxWidth: 480,
                                    border: `1px solid rgba(124,58,237,0.3)`,
                                    boxShadow: '0 -8px 40px rgba(124,58,237,0.2)',
                                }, children: [_jsxs("div", { style: { textAlign: 'center', marginBottom: 20 }, children: [_jsx("div", { style: { fontSize: 40, marginBottom: 8 }, children: "\uD83D\uDCE4" }), _jsx("div", { style: { color: C.text, fontWeight: 900, fontSize: 20 }, children: "Confirm Withdrawal / \u12C8\u132A \u12EB\u1228\u130B\u130D\u1321" }), _jsx("div", { style: { color: C.muted, fontSize: 13, marginTop: 4 }, children: "Please review before submitting / \u12A8\u121B\u1235\u1308\u1263\u1275\u12CE \u1260\u134A\u1275 \u12EB\u1228\u130B\u130D\u1321" })] }), [
                                        { label: 'Amount / መጠን', value: `${formatMoney(parseFloat(withdrawAmount))} ETB`, color: C.magenta },
                                        { label: 'Phone / ስልክ', value: withdrawPhone, color: C.text },
                                        { label: 'Receiver / ተቀባይ ስም', value: withdrawName, color: C.text },
                                    ].map(row => (_jsxs("div", { style: {
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '11px 14px', marginBottom: 8,
                                            background: C.surface2, borderRadius: 12,
                                            border: `1px solid ${C.border}`,
                                        }, children: [_jsx("span", { style: { color: C.muted, fontSize: 13 }, children: row.label }), _jsx("span", { style: { color: row.color, fontWeight: 800, fontSize: 15 }, children: row.value })] }, row.label))), withdrawResult && (_jsx("div", { style: { marginTop: 8, marginBottom: 4 }, children: _jsx(Alert, { type: withdrawResult.type, msg: withdrawResult.msg }) })), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }, children: [_jsx("button", { onClick: () => { setWithdrawConfirm(false); setWithdrawResult(null); }, disabled: withdrawLoading, style: {
                                                    padding: '14px 0', borderRadius: 999,
                                                    border: `1px solid ${C.border}`,
                                                    background: C.surface2, color: C.muted,
                                                    fontWeight: 800, fontSize: 15, cursor: 'pointer',
                                                }, children: "\u270F\uFE0F Edit / \u1240\u12ED\u122D" }), _jsx(Btn, { onClick: handleWithdraw, disabled: withdrawLoading, color: "linear-gradient(135deg, #be185d, #e040fb)", style: { color: withdrawLoading ? C.dim : '#fff' }, children: withdrawLoading ? '⏳ ...' : '✅ Confirm / አረጋግጥ' })] })] }) }))] }));
            })()] }));
}
//# sourceMappingURL=WalletScreen.js.map