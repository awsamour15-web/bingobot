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
import type { PlayerProfile, TransactionListItem, PaginatedResponse } from '../lib/api';

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  bg:       '#0a0e1a',
  surface:  '#0d1b2e',
  surface2: '#112240',
  surface3: '#0f1e35',
  border:   'rgba(255,255,255,0.07)',
  amber:    '#f59e0b',
  amberDim: 'rgba(245,158,11,0.15)',
  text:     '#f1f5f9',
  muted:    '#64748b',
  dim:      '#475569',
  green:    '#34d399',
  greenDim: 'rgba(52,211,153,0.15)',
  red:      '#f87171',
  redDim:   'rgba(248,113,113,0.15)',
  blue:     '#60a5fa',
  blueDim:  'rgba(96,165,250,0.15)',
};

// ── Transaction labels (English + Amharic) ────────────────────────────────────
const TX_META: Record<string, { label: string; color: string; sign: string }> = {
  deposit:             { label: 'Deposit / ገቢ',            color: C.green, sign: '+' },
  withdrawal:          { label: 'Withdrawal / ወጪ',          color: C.red,   sign: '-' },
  game_entry:          { label: 'Game Entry / ጨዋታ መግቢያ',   color: C.red,   sign: '-' },
  game_win:            { label: 'Game Win / ጨዋታ አሸናፊ',     color: C.green, sign: '+' },
  referral_commission: { label: 'Referral Bonus / ሪፈራል',   color: C.green, sign: '+' },
  admin_credit:        { label: 'Admin Credit / ክሬዲት',     color: C.green, sign: '+' },
  admin_debit:         { label: 'Admin Debit / ዲቢት',        color: C.red,   sign: '-' },
  refund:              { label: 'Refund / ተመላሽ',            color: C.green, sign: '+' },
};

// ── Wallet type labels (English + Amharic) ─────────────────────────────────────
const WALLET_LABEL: Record<string, string> = {
  main: 'Main Wallet / ዋና ቦርሳ',
  play: 'Play Wallet / ጨዋታ ቦርሳ',
};

// ── Quick amount buttons ──────────────────────────────────────────────────────
const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];

type Tab = 'balance' | 'deposit' | 'withdraw' | 'history';

// ── Small reusable button ─────────────────────────────────────────────────────
function Btn({
  onClick, disabled = false, color = C.amber, children, style = {},
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
        padding: '14px 0',
        borderRadius: 14,
        border: 'none',
        background: disabled ? C.surface2 : color,
        color: disabled ? C.dim : '#0a0e1a',
        fontWeight: 800,
        fontSize: 16,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'opacity 0.2s',
        opacity: disabled ? 0.6 : 1,
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
        background: C.amber, color: '#0a0e1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 900, fontSize: 13, flexShrink: 0,
      }}>{n}</div>
      <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{label}</span>
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
  const [txData,     setTxData]     = useState<PaginatedResponse<TransactionListItem> | null>(null);
  const [tab,        setTab]        = useState<Tab>('balance');
  const [txPage,     setTxPage]     = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [txLoading,  setTxLoading]  = useState(false);
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
  const [withdrawAmount,  setWithdrawAmount]  = useState('');
  const [withdrawPhone,   setWithdrawPhone]   = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawResult,  setWithdrawResult]  = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);

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
      .then(r => setDepositAccounts(r.accounts))
      .catch(() => {})
      .finally(() => setAccountsLoading(false));
  }, [tab]);

  // ── Load transactions when history tab opens ───────────────────────────────
  const loadTx = useCallback(async (page: number) => {
    setTxLoading(true);
    try { setTxData(await getWalletTransactions(page)); } catch {}
    finally { setTxLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'history') loadTx(txPage);
  }, [tab, txPage, loadTx]);

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
      setDepositResult({ type: 'error', msg: 'Please paste your Telebirr SMS receipt / የTelebirr SMS ደረሰኝ ይለጥፉ' });
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
      // Refresh balance
      setTimeout(() => getProfile().then(setProfile).catch(() => {}), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deposit failed / ዲፖዚት አልተሳካም';
      setDepositResult({ type: 'error', msg });
    } finally {
      setDepositLoading(false);
    }
  };

  // ── Withdraw submit ────────────────────────────────────────────────────────
  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      setWithdrawResult({ type: 'error', msg: 'Please enter a valid amount / ትክክለኛ መጠን ያስገቡ' });
      return;
    }
    if (amount < 100) {
      setWithdrawResult({ type: 'error', msg: 'Minimum withdrawal is ETB 100 / ዝቅተኛ ስደር ETB 100 ነው' });
      return;
    }
    if (!withdrawPhone.trim()) {
      setWithdrawResult({ type: 'error', msg: 'Please enter your phone number / ስልክ ቁጥርዎን ያስገቡ' });
      return;
    }
    setWithdrawLoading(true);
    setWithdrawResult(null);
    try {
      await withdrawFunds(amount, withdrawPhone.trim());
      setWithdrawResult({ type: 'success', msg: `✅ Withdrawal request of ${amount} ETB sent. Pending admin approval. / ጥያቄ ተልኳል።` });
      setWithdrawAmount('');
      setWithdrawPhone('');
      setTimeout(() => getProfile().then(setProfile).catch(() => {}), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Withdrawal failed / ስደር አልተሳካም';
      setWithdrawResult({ type: 'error', msg });
    } finally {
      setWithdrawLoading(false);
    }
  };

  // ── Loading / error guards ─────────────────────────────────────────────────
  if (loading) return <div style={{ minHeight: '100dvh', background: C.bg }} />;
  if (error || !profile) return (
    <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.red, padding: 20, textAlign: 'center' }}>
      {error ?? 'Failed to load / መጫን አልተሳካም'}
    </div>
  );

  const mainBal   = Number(profile.mainWallet?.balance ?? 0);
  const playBal   = Number(profile.playWallet?.balance ?? 0);
  const totalBal  = mainBal + playBal;
  const username  = (profile as any).username ?? (profile as any).phone ?? '—';
  const txTotal   = txData ? Math.ceil(txData.total / txData.pageSize) : 1;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'balance',
      label: 'Balance / ቀሪ',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      ),
    },
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
      label: 'Withdraw / ስደር',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      ),
    },
    {
      id: 'history',
      label: 'History / ታሪክ',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
  ];

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, paddingBottom: 90, fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: C.text }}>💰 Wallet / ቦርሳ</span>
          <button
            onClick={handleRefresh}
            aria-label="Refresh / አድስ"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, opacity: refreshing ? 0.4 : 1, transition: 'opacity 0.2s' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ display: 'block', transition: 'transform 0.6s', transform: refreshing ? 'rotate(360deg)' : 'none' }}>
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>

        {/* ── Total balance hero card ──────────────────────────────────────── */}
        <div style={{
          background: `linear-gradient(135deg, #1a3a5c 0%, #0d2440 100%)`,
          border: `1px solid rgba(96,165,250,0.2)`,
          borderRadius: 20, padding: '20px 20px 18px',
          marginBottom: 16, position: 'relative', overflow: 'hidden',
        }}>
          {/* glow */}
          <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(245,158,11,0.08)', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span style={{ color: C.muted, fontSize: 14 }}>{username}</span>
            <div style={{
              marginLeft: 'auto',
              background: C.greenDim, border: `1px solid rgba(52,211,153,0.3)`,
              borderRadius: 20, padding: '3px 10px',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span style={{ color: C.green, fontSize: 12, fontWeight: 700 }}>Verified / ተረጋግጧል</span>
            </div>
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>Total Balance / ጠቅላላ ቀሪ ሂሳብ</div>
          <div style={{ fontSize: 34, fontWeight: 900, color: C.text, letterSpacing: '-0.5px' }}>
            {formatMoney(totalBal)} <span style={{ fontSize: 18, color: C.amber, fontWeight: 700 }}>ETB</span>
          </div>
          {/* sub wallets row */}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            {[
              { label: 'Main Wallet / ዋና ቦርሳ', val: mainBal, color: C.amber },
              { label: 'Play Wallet / ጨዋታ ቦርሳ', val: playBal, color: C.green },
            ].map(w => (
              <div key={w.label} style={{
                flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 12,
                padding: '10px 12px', border: `1px solid rgba(255,255,255,0.08)`,
              }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{w.label}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: w.color }}>{formatMoney(w.val)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', background: C.surface, borderRadius: 14, padding: 4,
          border: `1px solid ${C.border}`, gap: 2,
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setDepositResult(null);
                setWithdrawResult(null);
              }}
              style={{
                flex: 1, padding: '9px 4px', border: 'none',
                borderRadius: 11,
                background: tab === t.id ? 'rgba(245,158,11,0.18)' : 'transparent',
                color: tab === t.id ? C.amber : C.muted,
                fontWeight: tab === t.id ? 800 : 500,
                fontSize: 12, cursor: 'pointer', transition: 'all 0.18s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* BALANCE TAB                                                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'balance' && (
        <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Main Wallet / ዋና ቦርሳ', val: mainBal, icon: '🏦', color: C.amber, desc: 'Deposit & Withdraw / ዲፖዚት እና ስደር' },
            { label: 'Play Wallet / ጨዋታ ቦርሳ', val: playBal, icon: '🎮', color: C.green, desc: 'Games only / ጨዋታ ብቻ' },
          ].map(w => (
            <div key={w.label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: '16px 18px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 28 }}>{w.icon}</span>
                <div>
                  <div style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{w.label}</div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>{w.desc}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: w.color, fontSize: 22, fontWeight: 900 }}>{formatMoney(w.val)}</div>
                <div style={{ color: C.dim, fontSize: 11, marginTop: 1 }}>ETB</div>
              </div>
            </div>
          ))}

          {/* Quick action buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
            <button onClick={() => setTab('deposit')} style={{
              padding: '14px 0', borderRadius: 14, border: `1px solid rgba(52,211,153,0.3)`,
              background: C.greenDim, color: C.green, fontWeight: 800, fontSize: 15, cursor: 'pointer',
            }}>
              ⬇ Deposit / ዲፖዚት
            </button>
            <button onClick={() => setTab('withdraw')} style={{
              padding: '14px 0', borderRadius: 14, border: `1px solid rgba(248,113,113,0.3)`,
              background: C.redDim, color: C.red, fontWeight: 800, fontSize: 15, cursor: 'pointer',
            }}>
              ⬆ Withdraw / ስደር
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DEPOSIT TAB                                                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'deposit' && (
        <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Telebirr account card ──────────────────────────────────── */}
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: '16px 18px',
          }}>
            <Step n={1} label="Send to this Telebirr number / ለዚህ Telebirr ቁጥር ይላኩ" />
            {accountsLoading ? (
              <div style={{ color: C.muted, fontSize: 14, textAlign: 'center', padding: '8px 0' }}>
                ⏳ Loading... / በመጫን ላይ...
              </div>
            ) : depositAccounts.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 14 }}>No Telebirr number found. Contact admin. / የቴሌብር ቁጥር አልተገኘም። አስተዳዳሪን ያግኙ።</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {depositAccounts.map(acc => (
                  <div key={acc.phone} style={{
                    background: C.surface2, borderRadius: 12,
                    padding: '12px 14px', border: `1px solid rgba(245,158,11,0.2)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ color: C.amber, fontSize: 20, fontWeight: 900, letterSpacing: 1 }}>
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
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 18px' }}>
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
                    padding: '7px 14px', borderRadius: 10, border: `1px solid ${C.border}`,
                    background: depositAmount === String(a) ? C.amberDim : C.surface2,
                    color: depositAmount === String(a) ? C.amber : C.muted,
                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* ── Receipt paste ─────────────────────────────────────────── */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 18px' }}>
            <Step n={3} label="Paste your Telebirr SMS receipt / የTelebirr SMS ደረሰኝ ይለጥፉ" />
            <div style={{ color: C.muted, fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
              Copy the transfer SMS from Telebirr and paste the full receipt below / ከTelebirr የተላከ SMS ቅዱ ወይም ሙሉ ደረሰኙን ይለጥፉ
            </div>
            <textarea
              value={depositReceipt}
              onChange={e => { setDepositReceipt(e.target.value); setDepositResult(null); }}
              placeholder="ለምሳሌ: You have sent ETB 200.00 to 0912345678 (Almaz). Transaction ID: 123456789..."
              rows={4}
              style={{
                width: '100%', padding: '13px 14px', borderRadius: 12,
                border: `1.5px solid ${C.border}`, background: C.surface2,
                color: C.text, fontSize: 13, outline: 'none',
                resize: 'vertical', boxSizing: 'border-box',
                lineHeight: 1.5,
              }}
            />
          </div>

          {/* ── Result & submit ───────────────────────────────────────── */}
          {depositResult && <Alert type={depositResult.type} msg={depositResult.msg} />}

          <Btn onClick={handleDeposit} disabled={depositLoading || depositAccounts.length === 0}>
            {depositLoading ? '⏳ Processing... / እየተሰራ ነው...' : '✅ Confirm Deposit / ዲፖዚት አረጋግጥ'}
          </Btn>

          {/* Info note */}
          <div style={{ background: C.blueDim, border: `1px solid rgba(96,165,250,0.2)`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ color: C.blue, fontSize: 13, lineHeight: 1.6 }}>
              ℹ️ <strong>Note / ማሳሰቢያ:</strong> Deposits of ETB 50 and above require admin approval. Your balance is usually updated within 1–5 minutes. / ETB 50 እና ከዚያ በላይ ዲፖዚት የአስተዳዳሪ ፈቃድ ይጠይቃል። ሂሳብዎ ብዙ ጊዜ በ1-5 ደቂቃ ይዘምናል።
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* WITHDRAW TAB                                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'withdraw' && (
        <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Balance overview */}
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: '14px 18px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ color: C.muted, fontSize: 14 }}>Available Balance (Main Wallet) / የሚያስደሩ ቀሪ (ዋና ቦርሳ)</span>
            <span style={{ color: C.amber, fontWeight: 900, fontSize: 20 }}>{formatMoney(mainBal)} ETB</span>
          </div>

          {/* Rules info */}
          <div style={{
            background: C.amberDim, border: `1px solid rgba(245,158,11,0.25)`,
            borderRadius: 14, padding: '13px 16px',
          }}>
            <div style={{ color: C.amber, fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📋 Withdrawal Rules / የስደር ህጎች</div>
            <ul style={{ color: C.text, fontSize: 13, margin: 0, paddingLeft: 16, lineHeight: 1.7 }}>
              <li>Minimum withdrawal: <strong>ETB 100</strong> / ዝቅተኛ ስደር</li>
              <li>Minimum deposit required: <strong>ETB 200</strong> / ቢያንስ ዲፖዚት ያስፈልጋል</li>
              <li>Withdrawal requires admin approval / ስደር የአስተዳዳሪ ፈቃድ ይጠይቃል</li>
              <li>Sent to your Telebirr number / ወደ Telebirr ቁጥርዎ ይላካል</li>
            </ul>
          </div>

          {/* Amount */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 18px' }}>
            <Step n={1} label="Enter amount to withdraw / የሚያስደሩትን መጠን ያስገቡ" />
            <Input
              value={withdrawAmount}
              onChange={v => { setWithdrawAmount(v); setWithdrawResult(null); }}
              placeholder="ዝቅተኛ ETB 100"
              type="number"
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {[100, 200, 500, 1000, 2000].map(a => (
                <button
                  key={a}
                  onClick={() => { setWithdrawAmount(String(a)); setWithdrawResult(null); }}
                  style={{
                    padding: '7px 14px', borderRadius: 10, border: `1px solid ${C.border}`,
                    background: withdrawAmount === String(a) ? C.redDim : C.surface2,
                    color: withdrawAmount === String(a) ? C.red : C.muted,
                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {a}
                </button>
              ))}
              {/* Max button */}
              <button
                onClick={() => { setWithdrawAmount(String(Math.floor(mainBal))); setWithdrawResult(null); }}
                style={{
                  padding: '7px 14px', borderRadius: 10, border: `1px solid ${C.border}`,
                  background: C.surface2, color: C.amber,
                  fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}
              >
                Max / ሙሉ
              </button>
            </div>
          </div>

          {/* Phone */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 18px' }}>
            <Step n={2} label="Enter your Telebirr phone number / የTelebirr ስልክ ቁጥር ያስገቡ" />
            <Input
              value={withdrawPhone}
              onChange={v => { setWithdrawPhone(v); setWithdrawResult(null); }}
              placeholder="ለምሳሌ: 0912345678"
              type="tel"
            />
            <div style={{ color: C.muted, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
              ⚠️ Enter your correct Telebirr number — funds will be sent here / ትክክለኛ የTelebirr ቁጥር ያስገቡ — ወደዚህ ቁጥር ይላካል
            </div>
          </div>

          {/* Result & submit */}
          {withdrawResult && <Alert type={withdrawResult.type} msg={withdrawResult.msg} />}

          <Btn
            onClick={handleWithdraw}
            disabled={withdrawLoading || mainBal < 100}
            color={C.red}
            style={{ color: withdrawLoading || mainBal < 100 ? C.dim : '#fff' }}
          >
            {withdrawLoading ? '⏳ Processing... / እየተሰራ ነው...' : '📤 Request Withdrawal / ስደር ጠይቅ'}
          </Btn>

          {mainBal < 100 && (
            <Alert type="error" msg="Insufficient balance. Minimum withdrawal is ETB 100. / ዝቅተኛ ስደር ETB 100 ነው። ቀሪ ሂሳብ በቂ አይደለም።" />
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* HISTORY TAB                                                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'history' && (
        <div style={{ padding: '16px 0' }}>
          {txLoading && (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>⏳ Loading... / በመጫን ላይ...</div>
          )}

          {!txLoading && (!txData || txData.items.length === 0) && (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
              No transactions found / ምንም ግብይት አልተገኘም
            </div>
          )}

          {!txLoading && txData?.items.filter(tx => tx?.amount != null).map(tx => {
            const meta = TX_META[tx.type] ?? { label: tx.type, color: C.muted, sign: '' };
            const walletLabel = WALLET_LABEL[tx.walletType] ?? tx.walletType;
            return (
              <div key={tx.id} style={{
                background: C.surface, margin: '0 16px 10px',
                borderRadius: 14, padding: '13px 16px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                border: `1px solid ${C.border}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{meta.label}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>
                    {new Date(tx.created_at).toLocaleDateString('am-ET', { year: 'numeric', month: 'short', day: 'numeric' })}
                    {' · '}
                    <span style={{ color: C.muted }}>{walletLabel}</span>
                  </div>
                  {tx.note && (
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                      {tx.note}
                    </div>
                  )}
                </div>
                <div style={{ fontWeight: 900, fontSize: 16, color: meta.color, whiteSpace: 'nowrap', marginLeft: 10 }}>
                  {meta.sign}{formatMoney(tx.amount ?? 0)} ETB
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {!txLoading && txData && txTotal > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '12px 0 20px' }}>
              <button
                onClick={() => setTxPage(p => Math.max(1, p - 1))}
                disabled={txPage <= 1}
                style={{
                  padding: '8px 20px', borderRadius: 10,
                  border: `1px solid ${C.border}`, background: C.surface,
                  color: txPage <= 1 ? C.dim : C.amber, cursor: txPage <= 1 ? 'default' : 'pointer', fontWeight: 700,
                }}
              >‹ Prev / ቀዳሚ</button>
              <span style={{ fontSize: 13, color: C.muted }}>{txPage} / {txTotal}</span>
              <button
                onClick={() => setTxPage(p => Math.min(txTotal, p + 1))}
                disabled={txPage >= txTotal}
                style={{
                  padding: '8px 20px', borderRadius: 10,
                  border: `1px solid ${C.border}`, background: C.surface,
                  color: txPage >= txTotal ? C.dim : C.amber, cursor: txPage >= txTotal ? 'default' : 'pointer', fontWeight: 700,
                }}
              >Next / ቀጣይ ›</button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
