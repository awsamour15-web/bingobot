import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile, getReferralLink } from '../lib/api';
import { initAuth, getAgentJwt } from '../lib/auth';
import { formatMoney } from '../lib/format';
// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
    bg: '#0e0b25',
    surface: '#13102b',
    surface2: '#1a1535',
    surface3: '#1e1a3a',
    border: 'rgba(124,58,237,0.18)',
    borderGlow: 'rgba(124,58,237,0.4)',
    violet: '#7c3aed',
    magenta: '#e040fb',
    magentaDim: 'rgba(224,64,251,0.1)',
    gold: '#ffd54f',
    goldDim: 'rgba(255,213,79,0.12)',
    teal: '#34d399',
    tealDim: 'rgba(52,211,153,0.12)',
    blue: '#60a5fa',
    blueDim: 'rgba(96,165,250,0.12)',
    purple: '#a78bfa',
    purpleDim: 'rgba(167,139,250,0.12)',
    pink: '#f472b6',
    text: '#f1f5f9',
    muted: 'rgba(255,255,255,0.45)',
    dim: 'rgba(255,255,255,0.22)',
};
// ── Streak config ─────────────────────────────────────────────────────────────
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];
function getStreakTier(streak) {
    if (streak >= 100)
        return { label: 'Legendary', color: '#ffd54f', emoji: '👑', glow: 'rgba(255,213,79,0.4)' };
    if (streak >= 60)
        return { label: 'Master', color: '#a78bfa', emoji: '💎', glow: 'rgba(167,139,250,0.4)' };
    if (streak >= 30)
        return { label: 'Expert', color: '#f472b6', emoji: '🔥', glow: 'rgba(244,114,182,0.35)' };
    if (streak >= 14)
        return { label: 'Pro', color: '#34d399', emoji: '⚡', glow: 'rgba(52,211,153,0.3)' };
    if (streak >= 7)
        return { label: 'Hot', color: '#e040fb', emoji: '🌟', glow: 'rgba(224,64,251,0.3)' };
    if (streak >= 3)
        return { label: 'Rising', color: '#60a5fa', emoji: '🚀', glow: 'rgba(96,165,250,0.25)' };
    return { label: 'New', color: C.muted, emoji: '🌱', glow: 'transparent' };
}
function getNextMilestone(streak) {
    return STREAK_MILESTONES.find(m => m > streak) ?? null;
}
// ── Tiny sub-components ───────────────────────────────────────────────────────
function Card({ children, style }) {
    return (_jsx("div", { style: {
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 20,
            padding: '18px 16px',
            margin: '0 14px 12px',
            ...style,
        }, children: children }));
}
function SectionTitle({ icon, title }) {
    return (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }, children: [_jsx("span", { style: { fontSize: 16 }, children: icon }), _jsx("span", { style: { fontWeight: 800, fontSize: 14, color: C.text, letterSpacing: 0.3 }, children: title })] }));
}
function Toggle({ on, onToggle }) {
    return (_jsx("button", { onClick: onToggle, style: {
            width: 52, height: 30, borderRadius: 15, border: 'none',
            background: on
                ? 'linear-gradient(135deg, #7c3aed, #e040fb)'
                : C.dim,
            cursor: 'pointer', position: 'relative', flexShrink: 0,
            transition: 'background 0.25s',
            boxShadow: on ? '0 2px 10px rgba(124,58,237,0.4)' : 'none',
        }, children: _jsx("div", { style: {
                position: 'absolute', top: 5,
                left: on ? 27 : 5, width: 20, height: 20,
                borderRadius: '50%', background: '#fff',
                transition: 'left 0.25s', boxShadow: '0 1px 6px rgba(0,0,0,0.4)',
            } }) }));
}
// ── Daily Streak Card ─────────────────────────────────────────────────────────
function StreakCard({ streak, longest }) {
    const tier = getStreakTier(streak);
    const next = getNextMilestone(streak);
    const prevMilestone = [...STREAK_MILESTONES].reverse().find(m => m <= streak) ?? 0;
    const progress = next ? Math.min(((streak - prevMilestone) / (next - prevMilestone)) * 100, 100) : 100;
    return (_jsxs(Card, { style: {
            background: `linear-gradient(135deg, ${C.surface2} 0%, ${C.surface3} 100%)`,
            border: `1px solid ${tier.glow !== 'transparent' ? tier.glow : C.border}`,
            boxShadow: tier.glow !== 'transparent' ? `0 0 30px ${tier.glow}` : 'none',
            overflow: 'hidden',
            position: 'relative',
        }, children: [_jsx("div", { style: {
                    position: 'absolute', top: -20, right: -20,
                    fontSize: 100, opacity: 0.04, userSelect: 'none', lineHeight: 1,
                    filter: 'blur(2px)',
                }, children: tier.emoji }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }, children: "Daily Login Streak" }), _jsxs("div", { style: { display: 'flex', alignItems: 'baseline', gap: 6 }, children: [_jsx("span", { style: { fontSize: 52, fontWeight: 900, color: tier.color, lineHeight: 1 }, children: streak }), _jsx("span", { style: { fontSize: 16, color: C.muted, fontWeight: 600 }, children: "days" })] })] }), _jsxs("div", { style: {
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            background: `${tier.color}18`, borderRadius: 14, padding: '10px 14px',
                            border: `1px solid ${tier.color}30`,
                        }, children: [_jsx("span", { style: { fontSize: 26 }, children: tier.emoji }), _jsx("span", { style: { fontSize: 11, fontWeight: 800, color: tier.color, letterSpacing: 0.5 }, children: tier.label })] })] }), _jsxs("div", { style: { marginBottom: 16 }, children: [_jsx("div", { style: { fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 0.5 }, children: "Week progress" }), _jsx("div", { style: { display: 'flex', gap: 6 }, children: ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => {
                            const filled = streak >= 7 ? true : i < (streak % 7 === 0 && streak > 0 ? 7 : streak % 7);
                            return (_jsxs("div", { style: { flex: 1, textAlign: 'center' }, children: [_jsx("div", { style: {
                                            height: 32, borderRadius: 8,
                                            background: filled ? tier.color : C.dim,
                                            boxShadow: filled && tier.glow !== 'transparent' ? `0 0 8px ${tier.color}60` : 'none',
                                            transition: 'all 0.3s',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 12, fontWeight: 800,
                                            color: filled ? '#0a0e1a' : C.muted,
                                        }, children: filled ? '✓' : '' }), _jsx("div", { style: { fontSize: 10, color: C.dim, marginTop: 3, fontWeight: 600 }, children: d })] }, i));
                        }) })] }), next && (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 }, children: [_jsx("span", { style: { fontSize: 11, color: C.muted }, children: "Next milestone" }), _jsxs("span", { style: { fontSize: 11, color: tier.color, fontWeight: 700 }, children: [streak, "/", next, " days"] })] }), _jsx("div", { style: { height: 6, borderRadius: 3, background: C.dim, overflow: 'hidden' }, children: _jsx("div", { style: {
                                height: '100%', borderRadius: 3,
                                width: `${progress}%`,
                                background: `linear-gradient(90deg, ${tier.color}80, ${tier.color})`,
                                transition: 'width 0.6s ease',
                            } }) }), _jsxs("div", { style: { fontSize: 11, color: C.muted, marginTop: 4 }, children: [next - streak, " more days to unlock ", getStreakTier(next).emoji, " ", getStreakTier(next).label] })] })), _jsxs("div", { style: {
                    marginTop: 16, paddingTop: 14,
                    borderTop: `1px solid ${C.border}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }, children: [_jsx("span", { style: { fontSize: 12, color: C.muted }, children: "\uD83C\uDFC6 Personal best" }), _jsxs("span", { style: { fontSize: 14, fontWeight: 800, color: C.gold }, children: [longest, " day", longest !== 1 ? 's' : ''] })] })] }));
}
// ── Stats Grid ────────────────────────────────────────────────────────────────
function StatsGrid({ gamesPlayed, wins }) {
    const winRate = gamesPlayed > 0 ? ((wins / gamesPlayed) * 100).toFixed(1) : '0.0';
    const losses = Math.max(0, gamesPlayed - wins);
    const stats = [
        { label: 'Games', value: gamesPlayed, color: C.blue, icon: '🎮' },
        { label: 'Wins', value: wins, color: C.teal, icon: '🏆' },
        { label: 'Losses', value: losses, color: C.pink, icon: '💔' },
        { label: 'Win Rate', value: `${winRate}%`, color: C.magenta, icon: '📈' },
    ];
    return (_jsxs(Card, { children: [_jsx(SectionTitle, { icon: "\uD83D\uDCCA", title: "Game Statistics" }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }, children: stats.map(({ label, value, color, icon }) => (_jsxs("div", { style: {
                        background: C.surface2, borderRadius: 14, padding: '14px 12px',
                        border: `1px solid ${C.border}`,
                    }, children: [_jsx("div", { style: { fontSize: 20, marginBottom: 6 }, children: icon }), _jsx("div", { style: { fontSize: 22, fontWeight: 900, color }, children: value }), _jsx("div", { style: { fontSize: 11, color: C.muted, marginTop: 2, fontWeight: 600 }, children: label })] }, label))) })] }));
}
// ── Achievements ──────────────────────────────────────────────────────────────
function Achievements({ streak, wins, gamesPlayed }) {
    const badges = [
        { icon: '🌱', label: 'First Login', unlocked: true, desc: 'Welcome aboard' },
        { icon: '🎮', label: 'First Game', unlocked: gamesPlayed >= 1, desc: 'Play a round' },
        { icon: '🏆', label: 'First Win', unlocked: wins >= 1, desc: 'Win a round' },
        { icon: '🚀', label: '3-Day Streak', unlocked: streak >= 3, desc: '3 days in a row' },
        { icon: '🌟', label: 'Week Warrior', unlocked: streak >= 7, desc: '7-day streak' },
        { icon: '⚡', label: 'Pro Player', unlocked: streak >= 14, desc: '14-day streak' },
        { icon: '🔥', label: 'On Fire', unlocked: streak >= 30, desc: '30-day streak' },
        { icon: '💎', label: '10 Wins', unlocked: wins >= 10, desc: '10 total wins' },
    ];
    return (_jsxs(Card, { children: [_jsx(SectionTitle, { icon: "\uD83C\uDF96\uFE0F", title: "Achievements" }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }, children: badges.map(({ icon, label, unlocked, desc }) => (_jsxs("div", { title: desc, style: {
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        padding: '12px 4px', borderRadius: 14,
                        background: unlocked ? 'rgba(124,58,237,0.12)' : C.surface2,
                        border: `1px solid ${unlocked ? 'rgba(124,58,237,0.4)' : C.border}`,
                        opacity: unlocked ? 1 : 0.4,
                        transition: 'all 0.2s',
                        boxShadow: unlocked ? '0 0 14px rgba(124,58,237,0.15)' : 'none',
                    }, children: [_jsx("span", { style: { fontSize: 22, filter: unlocked ? 'none' : 'grayscale(1)' }, children: icon }), _jsx("span", { style: {
                                fontSize: 9, color: unlocked ? '#a78bfa' : C.muted,
                                textAlign: 'center', fontWeight: 700, lineHeight: 1.2,
                            }, children: label })] }, label))) })] }));
}
// ── Main component ────────────────────────────────────────────────────────────
export default function ProfileScreen() {
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [referral, setReferral] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    const [soundOn, setSoundOn] = useState(() => localStorage.getItem('soundOn') !== 'false');
    const [isAgent, setIsAgent] = useState(false);
    useEffect(() => {
        initAuth()
            .then(() => Promise.all([getProfile(), getReferralLink()]))
            .then(([p, r]) => { setProfile(p); setReferral(r); setIsAgent(!!getAgentJwt()); })
            .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
            .finally(() => setLoading(false));
    }, []);
    const handleCopy = useCallback(() => {
        if (!referral)
            return;
        navigator.clipboard.writeText(referral.referralLink).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        });
    }, [referral]);
    const toggleSound = useCallback(() => {
        setSoundOn(v => { const n = !v; localStorage.setItem('soundOn', String(n)); return n; });
    }, []);
    if (loading)
        return _jsx("div", { style: { minHeight: '100dvh', background: C.bg } });
    if (error || !profile)
        return (_jsx("div", { style: { padding: 32, textAlign: 'center', color: '#f87171', background: C.bg, minHeight: '100dvh' }, children: error ?? 'Failed to load' }));
    const avatar = (profile.username?.[0] ?? '?').toUpperCase();
    const mainBal = Number(profile.mainWallet?.balance ?? 0);
    const playBal = Number(profile.playWallet?.balance ?? 0);
    const streak = profile.loginStreak ?? 1;
    const longest = profile.longestStreak ?? 1;
    const tier = getStreakTier(streak);
    return (_jsxs("div", { style: {
            background: 'linear-gradient(180deg, #0e0b25 0%, #0c0a1e 100%)',
            minHeight: '100dvh',
            paddingBottom: 90,
        }, children: [_jsxs("div", { style: {
                    background: 'linear-gradient(160deg, #1e1245 0%, #13102b 60%, #0e0b25 100%)',
                    padding: '32px 20px 24px',
                    borderBottom: `1px solid rgba(124,58,237,0.2)`,
                    position: 'relative', overflow: 'hidden',
                }, children: [_jsx("div", { style: {
                            position: 'absolute', top: -40, right: -40,
                            width: 200, height: 200, borderRadius: '50%',
                            background: `radial-gradient(circle, ${tier.glow} 0%, transparent 70%)`,
                            pointerEvents: 'none',
                        } }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }, children: [_jsx("div", { style: {
                                    width: 72, height: 72, borderRadius: 22,
                                    background: `linear-gradient(135deg, #7c3aed, #e040fb)`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 32, fontWeight: 900, color: '#fff',
                                    boxShadow: `0 6px 24px rgba(124,58,237,0.5)`,
                                    flexShrink: 0, letterSpacing: -1,
                                }, children: avatar }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { fontWeight: 900, fontSize: 22, color: C.text, letterSpacing: -0.5 }, children: ["@", profile.username] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 }, children: [_jsxs("span", { style: {
                                                    fontSize: 11, fontWeight: 700, color: tier.color,
                                                    background: `${tier.color}18`, borderRadius: 999,
                                                    padding: '2px 10px', border: `1px solid ${tier.color}30`,
                                                    letterSpacing: 0.5,
                                                }, children: [tier.emoji, " ", tier.label] }), profile.phone_verified
                                                ? _jsx("span", { style: { fontSize: 11, color: '#34d399', fontWeight: 600 }, children: "\u2705 Verified" })
                                                : _jsx("span", { style: { fontSize: 11, color: '#fbbf24', fontWeight: 600 }, children: "\u26A0\uFE0F Unverified" })] }), _jsxs("div", { style: { fontSize: 11, color: C.dim, marginTop: 4, fontFamily: 'monospace' }, children: ["#", profile.id.slice(-8).toUpperCase()] })] }), _jsxs("div", { style: {
                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    background: C.magentaDim, borderRadius: 16,
                                    padding: '10px 14px',
                                    border: `1px solid rgba(224,64,251,0.3)`,
                                    flexShrink: 0,
                                }, children: [_jsx("span", { style: { fontSize: 20 }, children: tier.emoji }), _jsx("span", { style: { fontSize: 20, fontWeight: 900, color: C.magenta, lineHeight: 1.1 }, children: streak }), _jsxs("span", { style: { fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: 0.5 }, children: ["DAY", streak !== 1 ? 'S' : ''] })] })] })] }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '14px 14px 0' }, children: [
                    { label: 'Main Wallet', value: mainBal, color: C.gold, dim: C.goldDim, icon: '💰' },
                    { label: 'Play Wallet', value: playBal, color: '#a78bfa', dim: C.purpleDim, icon: '🎮' },
                ].map(({ label, value, color, dim, icon }) => (_jsxs("div", { style: {
                        background: C.surface, border: `1px solid ${C.border}`,
                        borderRadius: 18, padding: '16px 14px',
                    }, children: [_jsx("div", { style: {
                                width: 36, height: 36, borderRadius: 10,
                                background: dim, display: 'flex', alignItems: 'center',
                                justifyContent: 'center', fontSize: 18, marginBottom: 10,
                            }, children: icon }), _jsx("div", { style: { fontSize: 22, fontWeight: 900, color }, children: formatMoney(value) }), _jsxs("div", { style: { fontSize: 11, color: C.muted, marginTop: 3, fontWeight: 600 }, children: ["Birr \u00B7 ", label] })] }, label))) }), _jsx("div", { style: { marginTop: 14 }, children: _jsx(StreakCard, { streak: streak, longest: longest }) }), _jsx(StatsGrid, { gamesPlayed: profile.totalGamesPlayed ?? 0, wins: profile.totalWins ?? 0 }), _jsx(Achievements, { streak: streak, wins: profile.totalWins ?? 0, gamesPlayed: profile.totalGamesPlayed ?? 0 }), referral && (_jsxs(Card, { children: [_jsx(SectionTitle, { icon: "\uD83D\uDC65", title: "Referral Program" }), _jsxs("div", { style: { display: 'flex', gap: 8, marginBottom: 14 }, children: [_jsx("input", { readOnly: true, value: referral.referralLink, style: {
                                    flex: 1, padding: '11px 12px',
                                    background: C.surface2, border: `1px solid ${C.border}`,
                                    borderRadius: 12, fontSize: 12, color: C.muted, outline: 'none',
                                } }), _jsx("button", { onClick: handleCopy, style: {
                                    padding: '11px 18px',
                                    background: copied
                                        ? 'linear-gradient(135deg, #059669, #34d399)'
                                        : 'linear-gradient(135deg, #7c3aed, #e040fb)',
                                    color: '#fff', border: 'none', borderRadius: 999,
                                    cursor: 'pointer', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap',
                                    flexShrink: 0, transition: 'all 0.2s',
                                    boxShadow: copied ? '0 2px 10px rgba(52,211,153,0.3)' : '0 2px 10px rgba(124,58,237,0.4)',
                                }, children: copied ? '✓ Copied' : 'Copy' })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }, children: [_jsxs("div", { style: { background: C.surface2, borderRadius: 12, padding: '14px', textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: 24, fontWeight: 900, color: C.gold }, children: referral.totalReferrals }), _jsx("div", { style: { fontSize: 11, color: C.muted, marginTop: 3, fontWeight: 600 }, children: "Friends Invited" })] }), _jsxs("div", { style: { background: C.surface2, borderRadius: 12, padding: '14px', textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: 24, fontWeight: 900, color: C.teal }, children: formatMoney(referral.totalEarnings ?? 0) }), _jsx("div", { style: { fontSize: 11, color: C.muted, marginTop: 3, fontWeight: 600 }, children: "Birr Earned" })] })] })] })), _jsxs(Card, { children: [_jsx(SectionTitle, { icon: "\u2699\uFE0F", title: "Preferences" }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 700, color: C.text, fontSize: 14 }, children: "\uD83D\uDD0A Number Sound" }), _jsx("div", { style: { fontSize: 12, color: C.muted, marginTop: 2 }, children: "Play audio when numbers are called" })] }), _jsx(Toggle, { on: soundOn, onToggle: toggleSound })] })] }), isAgent && (_jsx(Card, { children: _jsx("button", { onClick: () => navigate('/agent/dashboard'), style: {
                        display: 'block', width: '100%',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        border: 'none', borderRadius: 14, padding: '16px 18px',
                        cursor: 'pointer', textAlign: 'left',
                        boxShadow: '0 6px 20px rgba(16,185,129,0.28)',
                    }, children: _jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 12 }, children: [_jsx("div", { style: {
                                            width: 40, height: 40, borderRadius: 12,
                                            background: 'rgba(255,255,255,0.18)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                                        }, children: "\uD83D\uDCCA" }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 15, fontWeight: 900, color: '#fff', marginBottom: 2 }, children: "Agent Dashboard" }), _jsx("div", { style: { fontSize: 11, color: 'rgba(255,255,255,0.72)' }, children: "Referrals & earnings" })] })] }), _jsx("span", { style: { fontSize: 18, color: 'rgba(255,255,255,0.7)' }, children: "\u2192" })] }) }) })), _jsxs(Card, { children: [_jsx(SectionTitle, { icon: "\u2139\uFE0F", title: "Account" }), [
                        { label: 'Member Since', value: new Date(profile.created_at).toLocaleDateString('en-ET', { year: 'numeric', month: 'short', day: 'numeric' }) },
                        { label: 'Player ID', value: `#${profile.id.slice(-8).toUpperCase()}` },
                        { label: 'Phone', value: profile.phone_verified ? `${profile.phone ?? ''} ✅` : 'Not verified ⚠️' },
                    ].map(({ label, value }, i, arr) => (_jsxs("div", { style: {
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '13px 0',
                            borderBottom: i < arr.length - 1 ? `1px solid rgba(124,58,237,0.15)` : 'none',
                        }, children: [_jsx("span", { style: { fontSize: 12, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 600 }, children: label }), _jsx("span", { style: { fontSize: 13, color: C.text, fontWeight: 700 }, children: value })] }, label)))] })] }));
}
//# sourceMappingURL=ProfileScreen.js.map