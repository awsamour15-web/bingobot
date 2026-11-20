import React, { useEffect, useState, useCallback } from 'react';
import {
  getProfile,
  getWalletTransactions,
  getDepositAccounts,
  verifyManualDeposit,
  withdrawFunds,
  type DepositAccountOption,
} from '../lib/api';
import { initAuth } from '../lib/auth';
import { formatMoney } from '../lib/format';
import type { PlayerProfile } from '../lib/api';

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  bg:        '#0d0b22',
  surface:   '#13102b',
  surface2:  '#1a1535',
  surface3:  '#1e1a3a',
  border:    'rgba(124,58,237,0.18)',
  borderMid: 'rgba(124,58,237,0.3)',
  violet:    '#7c3aed',
  magenta:   '#e040fb',
  gold:      '#ffd54f',
  text:      '#f1f5f9',
  muted:     'rgba(255,255,255,0.45)',
  dim:       'rgba(255,255,255,0.22)',
  green:     '#34d399',
  greenDim:  'rgba(52,211,153,0.15)',
  red:       '#f87171',
  redDim:    'rgba(248,113,113,0.15)',
  blue:      '#60a5fa',
  blueDim:   'rgba(96,165,250,0.15)',
};

// ── Transaction labels (English + Amharic) ────────────────────────────────────
const TX_META: Record<string, { label: string; color: string; sign: string }> = {
  deposit:             { label: 'Deposit / ገቢ',            color: C.green,   sign: '+' },
  withdrawal:          { label: 'Withdrawal / ወጪ',          color: C.red,     sign: '-' },
  game_entry:          { label: 'Game Entry / ጨዋታ መግቢያ',   color: C.red,     sign: '-' },
  game_win:            { label: 'Game Win / ጨዋታ አሸናፊ',     color: C.green,   sign: '+' },
  referral_commission: { label: 'Referral Bonus / ሪፈራል',   color: C.green,   sign: '+' },
  admin_credit:        { label: 'Admin Credit / ክሬዲት',     color: C.green,   sign: '+' },
  admin_debit:         { label: 'Admin Debit / ዲቢት',        color: C.red,     sign: '-' },
  refund:              { label: 'Refund / ተመላሽ',            color: C.green,   sign: '+' },
};

// ── Wallet type labels ─────────────────────────────────────────────────────────
const WALLET_LABEL: Record<string, string> = {
  main: 'Main Wallet / ዋና ቦርሳ',
  play: 'Play Wallet / ጨዋታ ቦርሳ',
};

// ── Quick amount buttons ──────────────────────────────────────────────────────
const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];

const BANK_LABELS: Record<string, string> = {
  telebirr: '📱 Telebirr',
  cbebirr:  '📱 CBE Birr',
};

type Tab = 'deposit' | 'withdraw';

// ── Small reusable button ─────────────────────────────────────────────────────
function Btn({
  onClick, disabled = false, color, children, style = {},
}: {
  onClick: () => void;
  disabled?: boolean;
  color?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '15px 0',
        borderRadius: 14,
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
      }}
    >
      {children}
    </button>
  );
}

// ── Step badge ────────────────────────────────────────────────────────────────
function Step({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'linear-gradient(135deg, #7c3aed, #e040fb)',
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 900, fontSize: 13, flexShrink: 0,
        boxShadow: '0 2px 10px rgba(124,58,237,0.4)',
      }}>{n}</div>
      <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{label}</span>
    </div>
  );
}

// ── Input ────────────────────────────────────────────────────────────────────
function Input({
  value, onChange, placeholder, type = 'text', disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
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
      }}
    />
  );
}

// ── Alert box ─────────────────────────────────────────────────────────────────
function Alert({ type, msg }: { type: 'success' | 'error' | 'info'; msg: string }) {
  const colors = {
    success: { bg: C.greenDim, border: C.green, text: C.green },
    error:   { bg: C.redDim,   border: C.red,   text: C.red   },
    info:    { bg: C.blueDim,  border: C.blue,  text: C.blue  },
  }[type];
  return (
    <div style={{
      padding: '13px 16px', borderRadius: 12,
      background: colors.bg, border: `1px solid ${colors.border}`,
      color: colors.text, fontSize: 14, fontWeight: 600, lineHeight: 1.5,
    }}>
      {msg}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function WalletScreen() {
  const [profile,    setProfile]    = useState<PlayerProfile | null>(null);
  const [tab,        setTab]        = useState<Tab>('deposit');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // ── Deposit state ──────────────────────────────────────────────────────────
  const [depositAccounts,  setDepositAccounts]  = useState<DepositAccountOption[]>([]);
  const [depositAmount,    setDepositAmount]    = useState('');
  const [depositReceipt,   setDepositReceipt]   = useState('');
  const [depositLoading,   setDepositLoading]   = useState(false);
  const [depositResult,    setDepositResult]    = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const [accountsLoading,  setAccountsLoading]  = useState(false);

  // ── Withdraw state ─────────────────────────────────────────────────────────
  const [withdrawAmount,      setWithdrawAmount]      = useState('');
  const [withdrawPhone,       setWithdrawPhone]       = useState('');
  const [withdrawName,        setWithdrawName]        = useState('');
  const [withdrawConfirm,     setWithdrawConfirm]     = useState(false);
  const [withdrawLoading,     setWithdrawLoading]     = useState(false);
  const [withdrawResult,      setWithdrawResult]      = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const [totalDeposited,      setTotalDeposited]      = useState<number | null>(null);
  const [depositCheckLoading, setDepositCheckLoading] = useState(false);

  // ── Load profile ───────────────────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    try {
      await initAuth();
      setProfile(await getProfile());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load / መጫን አልተሳካም');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { setProfile(await getProfile()); } catch {}
    finally { setRefreshing(false); }
  }, []);

  // ── Load deposit accounts when deposit tab opens ───────────────────────────
  useEffect(() => {
    if (tab !== 'deposit') return;
    setAccountsLoading(true);
    getDepositAccounts()
      .then(r => setDepositAccounts(r.accounts.filter(a => !a.bank || a.bank === 'telebirr' || a.bank === 'cbebirr')))
      .catch(() => {})
      .finally(() => setAccountsLoading(false));
  }, [tab]);

  // ── Check total deposits when withdraw tab opens ───────────────────────────
  useEffect(() => {
    if (tab !== 'withdraw') return;
    if (totalDeposited !== null) return;
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
      const msg = (res as any).pending_approval
        ? `⏳ Your deposit of ${amount} ETB is being processed. / ዲፖዚትዎ እየተሰራ ነው።`
        : `✅ ${res.amount} ETB deposited successfully! / ዲፖዚት ተቀብሏል!`;
      setDepositResult({ type: (res as any).pending_approval ? 'info' : 'success', msg });
      setDepositAmount('');
      setDepositReceipt('');
      setTimeout(() => getProfile().then(setProfile).catch(() => {}), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deposit failed / ዲፖዚት አልተሳካም';
      setDepositResult({ type: 'error', msg });
    } finally {
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
      setTimeout(() => getProfile().then(setProfile).catch(() => {}), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Withdrawal failed / ወጪ አልተሳካም';
      setWithdrawResult({ type: 'error', msg });
      setWithdrawConfirm(false);
    } finally {
      setWithdrawLoading(false);
    }
  };

  // ── Loading / error guards ─────────────────────────────────────────────────
  if (loading) return <div style={{ minHeight: '100dvh', background: C.bg }} />;
  if (error || !profile) return (
    <div style={{
      minHeight: '100dvh', background: C.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', color: C.red, padding: 20, textAlign: 'center', gap: 16,
    }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <div>{error ?? 'Failed to load / መጫን አልተሳካም'}</div>
      <button
        onClick={() => { setLoading(true); setError(null); loadProfile(); }}
        style={{
          marginTop: 8, padding: '14px 28px', borderRadius: 14, border: 'none',
          background: 'linear-gradient(135deg, #7c3aed, #e040fb)',
          color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer',
        }}
      >
        Retry / እንደገና ሞክር
      </button>
    </div>
  );

  const mainBal  = Number(profile.mainWallet?.balance ?? 0);
  const playBal  = Number(profile.playWallet?.balance ?? 0);
  const totalBal = mainBal + playBal;
  const username = (profile as any).username ?? (profile as any).phone ?? '—';

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'deposit',
      label: 'Deposit / ዲፖዚት',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      ),
    },
    {
      id: 'withdraw',
      label: 'Withdraw / ወጪ',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      ),
    },
  ];

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(180deg, #0d0b22 0%, #0c0a1e 100%)',
      paddingBottom: 90,
      fontFamily: "'Nunito', sans-serif",
    }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: C.text }}>💎 Wallet / ቦርሳ</span>
          <button
            onClick={handleRefresh}
            aria-label="Refresh / አድስ"
            style={{
              background: 'rgba(124,58,237,0.12)', border: `1px solid ${C.border}`,
              borderRadius: 10, cursor: 'pointer', padding: 8,
              opacity: refreshing ? 0.4 : 1, transition: 'opacity 0.2s',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ display: 'block', transition: 'transform 0.6s', transform: refreshing ? 'rotate(360deg)' : 'none' }}>
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>

        {/* ── Total balance hero card ──────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, #241548 0%, #170f38 100%)',
          border: `1px solid ${C.borderMid}`,
          borderRadius: 22, padding: '22px 20px 20px',
          marginBottom: 18, position: 'relative', overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(124,58,237,0.28)',
        }}>
          {/* glow */}
          <div style={{
            position: 'absolute', top: -30, right: -30, width: 140, height: 140,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(224,64,251,0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span style={{ color: C.muted, fontSize: 14 }}>{username}</span>
            <div style={{
              marginLeft: 'auto',
              background: C.greenDim, border: `1px solid rgba(52,211,153,0.3)`,
              borderRadius: 999, padding: '3px 10px',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span style={{ color: C.green, fontSize: 12, fontWeight: 700 }}>
                {profile.phone_verified ? 'Verified / ተረጋግጧል' : 'Unverified / አልተረጋገጠም'}
              </span>
            </div>
          </div>

          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Total Balance / ጠቅላላ ቀሪ ሂሳብ</div>
          <div style={{ fontSize: 34, fontWeight: 900, color: C.text, letterSpacing: '-0.5px' }}>
            {formatMoney(totalBal)} <span style={{ fontSize: 18, color: C.gold, fontWeight: 700 }}>ETB</span>
          </div>

          {/* sub wallets row */}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            {[
              { label: 'Main / ዋና',  val: mainBal, color: C.gold   },
              { label: 'Play / ጨዋታ', val: playBal, color: '#a78bfa' },
            ].map(w => (
              <div key={w.label} style={{
                flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 12,
                padding: '10px 12px', border: `1px solid rgba(124,58,237,0.2)`,
              }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{w.label}</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: w.color }}>{formatMoney(w.val)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', background: C.surface, borderRadius: 999, padding: 4,
          border: `1px solid ${C.border}`, gap: 2,
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setDepositResult(null);
                setWithdrawResult(null);
                setWithdrawConfirm(false);
              }}
              style={{
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
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DEPOSIT TAB                                                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'deposit' && (
        <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── Deposit accounts card ─────────────────────────────────── */}
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 18, padding: '16px 18px',
          }}>
            <Step n={1} label="Send money to one of these accounts / ከታቹ ወደ አንዱ ቁጥር ይላኩ" />

            {/* Supported banks */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {['📱 Telebirr', '📱 CBE Birr'].map(b => (
                <span key={b} style={{
                  padding: '3px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: 'rgba(124,58,237,0.12)',
                  color: '#a78bfa',
                  border: `1px solid rgba(124,58,237,0.25)`,
                }}>
                  {b}
                </span>
              ))}
            </div>

            {accountsLoading ? (
              <div style={{ color: C.muted, fontSize: 14, textAlign: 'center', padding: '8px 0' }}>
                ⏳ Loading... / በመጫን ላይ...
              </div>
            ) : depositAccounts.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 14 }}>No deposit account found. Contact admin. / የቴሌብር ቁጥር አልተገኘም።</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {depositAccounts.map(acc => (
                  <div key={acc.phone} style={{
                    background: C.surface2, borderRadius: 14,
                    padding: '12px 14px',
                    border: `1px solid rgba(124,58,237,0.3)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    boxShadow: '0 2px 12px rgba(124,58,237,0.1)',
                  }}>
                    <div>
                      {acc.bank && (
                        <div style={{
                          display: 'inline-block', marginBottom: 4,
                          padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                          background: 'rgba(124,58,237,0.12)', color: '#a78bfa',
                          border: `1px solid rgba(124,58,237,0.25)`,
                        }}>
                          {BANK_LABELS[acc.bank] ?? acc.bank}
                        </div>
                      )}
                      <div style={{ color: C.gold, fontSize: 20, fontWeight: 900, letterSpacing: 1 }}>
                        {acc.phone}
                      </div>
                      {acc.name && (
                        <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{acc.name}</div>
                      )}
                    </div>
                    <span style={{ fontSize: 24 }}>📱</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Amount input ──────────────────────────────────────────── */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 18px' }}>
            <Step n={2} label="Enter the amount you sent (min ETB 50) / የሚልኩትን መጠን ያስገቡ" />
            <Input
              value={depositAmount}
              onChange={v => { setDepositAmount(v); setDepositResult(null); }}
              placeholder="ለምሳሌ: 200"
              type="number"
            />
            {/* Quick amounts */}
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {QUICK_AMOUNTS.map(a => (
                <button
                  key={a}
                  onClick={() => { setDepositAmount(String(a)); setDepositResult(null); }}
                  style={{
                    padding: '7px 14px', borderRadius: 999,
                    border: `1px solid ${depositAmount === String(a) ? C.violet : C.border}`,
                    background: depositAmount === String(a)
                      ? 'rgba(124,58,237,0.2)'
                      : C.surface2,
                    color: depositAmount === String(a) ? '#a78bfa' : C.muted,
                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* ── Receipt paste ─────────────────────────────────────────── */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 18px' }}>
            <Step n={3} label="Paste your payment receipt / ደረሰኙን ይለጥፉ" />
            <div style={{ color: C.muted, fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
              ✅ Telebirr SMS · CBE Birr SMS<br/>
              ከዚህ ሁለት መንገዶች ያስተላለፉ ከሆነ የደረሰኙን ቁጥር ወይም ሙሉ SMS ይለጥፉ
            </div>
            <textarea
              value={depositReceipt}
              onChange={e => { setDepositReceipt(e.target.value); setDepositResult(null); }}
              placeholder={
                'Telebirr: "Your transaction number is ABC123XYZ0..."\n' +
                'CBE Birr: "Receipt No: CB20260XXXXX..."'
              }
              rows={5}
              style={{
                width: '100%', padding: '13px 14px', borderRadius: 12,
                border: `1.5px solid ${C.border}`, background: C.surface2,
                color: C.text, fontSize: 13, outline: 'none',
                resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5,
              }}
            />
          </div>

          {depositResult && <Alert type={depositResult.type} msg={depositResult.msg} />}

          <Btn onClick={handleDeposit} disabled={depositLoading || depositAccounts.length === 0}>
            {depositLoading ? '⏳ Processing... / እየተሰራ ነው...' : '✅ Confirm Deposit / ዲፖዚት አረጋግጥ'}
          </Btn>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* WITHDRAW TAB                                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'withdraw' && (() => {
        if (depositCheckLoading || totalDeposited === null) {
          return (
            <div style={{ padding: '18px 16px' }}>
              <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>
                ⏳ Checking eligibility... / ብቁነት እየተፈተሸ ነው...
              </div>
            </div>
          );
        }

        if (totalDeposited < 100) {
          return (
            <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                background: 'rgba(224,64,251,0.08)',
                border: `1px solid rgba(224,64,251,0.3)`,
                borderRadius: 18, padding: '24px 18px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
                <div style={{ color: C.magenta, fontWeight: 900, fontSize: 18, marginBottom: 8 }}>
                  Withdrawal Locked / ወጪ ተቆልፏል
                </div>
                <div style={{ color: C.text, fontSize: 14, lineHeight: 1.7 }}>
                  You need a minimum total deposit of <strong style={{ color: C.gold }}>ETB 100</strong> to withdraw.<br/>
                  ለማውጣት ቢያንስ <strong style={{ color: C.gold }}>100 ብር</strong> ዲፖዚት ማድረግ አለብዎ።
                </div>
                <div style={{
                  marginTop: 14, padding: '10px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
                  display: 'inline-block',
                }}>
                  <span style={{ color: C.muted, fontSize: 13 }}>Total deposited: </span>
                  <span style={{ color: C.gold, fontWeight: 900, fontSize: 16 }}>{formatMoney(totalDeposited)} ETB</span>
                  <span style={{ color: C.muted, fontSize: 12 }}> / 100 ETB needed</span>
                </div>
              </div>
              <Btn onClick={() => setTab('deposit')} color="linear-gradient(135deg, #059669, #34d399)" style={{ color: '#fff' }}>
                ⬇ Make a Deposit / ዲፖዚት ያድርጉ
              </Btn>
            </div>
          );
        }

        return (
          <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Balance overview */}
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: '14px 18px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ color: C.muted, fontSize: 13 }}>Available Balance (Main) / ዋና ቦርሳ</span>
              <span style={{ color: C.gold, fontWeight: 900, fontSize: 20 }}>{formatMoney(mainBal)} ETB</span>
            </div>

            {/* Rules info */}
            <div style={{
              background: 'rgba(124,58,237,0.08)', border: `1px solid rgba(124,58,237,0.25)`,
              borderRadius: 14, padding: '13px 16px',
            }}>
              <div style={{ color: '#a78bfa', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📋 Withdrawal Rules / የወጪ ህጎች</div>
              <ul style={{ color: C.text, fontSize: 13, margin: 0, paddingLeft: 16, lineHeight: 1.7 }}>
                <li>Minimum withdrawal: <strong>ETB 200</strong> / ዝቅተኛ ወጪ</li>
                <li>Requires total deposit of <strong>ETB 100</strong> / ቢያንስ 100 ብር ዲፖዚት ያስፈልጋል</li>
                <li>Sent to your Telebirr number / ወደ Telebirr ቁጥርዎ ይላካል</li>
              </ul>
            </div>

            {/* Amount */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 18px' }}>
              <Step n={1} label="Enter amount to withdraw / መጠን ያስገቡ" />
              <Input
                value={withdrawAmount}
                onChange={v => { setWithdrawAmount(v); setWithdrawResult(null); }}
                placeholder="ዝቅተኛ ETB 200"
                type="number"
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {[100, 200, 500, 1000, 2000].map(a => (
                  <button
                    key={a}
                    onClick={() => { setWithdrawAmount(String(a)); setWithdrawResult(null); }}
                    style={{
                      padding: '7px 14px', borderRadius: 999,
                      border: `1px solid ${withdrawAmount === String(a) ? C.magenta : C.border}`,
                      background: withdrawAmount === String(a)
                        ? 'rgba(224,64,251,0.12)'
                        : C.surface2,
                      color: withdrawAmount === String(a) ? C.magenta : C.muted,
                      fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {a}
                  </button>
                ))}
                <button
                  onClick={() => { setWithdrawAmount(String(Math.floor(mainBal))); setWithdrawResult(null); }}
                  style={{
                    padding: '7px 14px', borderRadius: 999, border: `1px solid ${C.border}`,
                    background: C.surface2, color: C.gold,
                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Max / ሙሉ
                </button>
              </div>
            </div>

            {/* Phone */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 18px' }}>
              <Step n={2} label="Enter your Telebirr phone number / የTelebirr ስልክ ቁጥር ያስገቡ" />
              <Input
                value={withdrawPhone}
                onChange={v => { setWithdrawPhone(v); setWithdrawResult(null); }}
                placeholder="ለምሳሌ: 0912345678"
                type="tel"
              />
              <div style={{ color: C.muted, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
                ⚠️ Enter your correct Telebirr number — funds will be sent here / ትክክለኛ የTelebirr ቁጥር ያስገቡ
              </div>
            </div>

            {/* Receiver name */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 18px' }}>
              <Step n={3} label="Enter receiver name / ተቀባዩን ስም ያስገቡ" />
              <Input
                value={withdrawName}
                onChange={v => { setWithdrawName(v); setWithdrawResult(null); }}
                placeholder="ለምሳሌ: Almaz Tadesse"
              />
              <div style={{ color: C.muted, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
                Full name as registered on Telebirr / በTelebirr ላይ የተመዘገበ ሙሉ ስም
              </div>
            </div>

            {withdrawResult && <Alert type={withdrawResult.type} msg={withdrawResult.msg} />}

            <Btn
              onClick={handleWithdrawReview}
              disabled={withdrawLoading || mainBal < 200}
              color="linear-gradient(135deg, #be185d, #e040fb)"
              style={{ color: withdrawLoading || mainBal < 200 ? C.dim : '#fff' }}
            >
              📤 Review Withdrawal / ያረጋግጡ
            </Btn>

            {mainBal < 200 && (
              <Alert type="error" msg="Insufficient balance. Minimum withdrawal is ETB 200. / ዝቅተኛ ወጪ ETB 200 ነው።" />
            )}

            {withdrawConfirm && (
              <div style={{
                position: 'fixed', inset: 0, zIndex: 999,
                background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              }}>
                <div style={{
                  background: C.surface, borderRadius: '24px 24px 0 0',
                  padding: '24px 20px 36px', width: '100%', maxWidth: 480,
                  border: `1px solid rgba(124,58,237,0.3)`,
                  boxShadow: '0 -8px 40px rgba(124,58,237,0.2)',
                }}>
                  <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📤</div>
                    <div style={{ color: C.text, fontWeight: 900, fontSize: 20 }}>
                      Confirm Withdrawal / ወጪ ያረጋግጡ
                    </div>
                    <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
                      Please review before submitting / ከማስገባትዎ በፊት ያረጋግጡ
                    </div>
                  </div>
                  {[
                    { label: 'Amount / መጠን',       value: `${formatMoney(parseFloat(withdrawAmount))} ETB`, color: C.magenta },
                    { label: 'Phone / ስልክ',         value: withdrawPhone, color: C.text },
                    { label: 'Receiver / ተቀባይ ስም', value: withdrawName,  color: C.text },
                  ].map(row => (
                    <div key={row.label} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '11px 14px', marginBottom: 8,
                      background: C.surface2, borderRadius: 12,
                      border: `1px solid ${C.border}`,
                    }}>
                      <span style={{ color: C.muted, fontSize: 13 }}>{row.label}</span>
                      <span style={{ color: row.color, fontWeight: 800, fontSize: 15 }}>{row.value}</span>
                    </div>
                  ))}
                  {withdrawResult && (
                    <div style={{ marginTop: 8, marginBottom: 4 }}>
                      <Alert type={withdrawResult.type} msg={withdrawResult.msg} />
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
                    <button
                      onClick={() => { setWithdrawConfirm(false); setWithdrawResult(null); }}
                      disabled={withdrawLoading}
                      style={{
                        padding: '14px 0', borderRadius: 999,
                        border: `1px solid ${C.border}`,
                        background: C.surface2, color: C.muted,
                        fontWeight: 800, fontSize: 15, cursor: 'pointer',
                      }}
                    >
                      ✏️ Edit / ቀይር
                    </button>
                    <Btn
                      onClick={handleWithdraw}
                      disabled={withdrawLoading}
                      color="linear-gradient(135deg, #be185d, #e040fb)"
                      style={{ color: withdrawLoading ? C.dim : '#fff' }}
                    >
                      {withdrawLoading ? '⏳ ...' : '✅ Confirm / አረጋግጥ'}
                    </Btn>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
