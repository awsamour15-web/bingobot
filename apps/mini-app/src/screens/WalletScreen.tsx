import React, { useEffect, useState, useCallback } from 'react';
import {
  getProfile,
  getWalletTransactions,
  getDepositAccounts,
  verifyManualDeposit,
  withdrawFunds,
} from '../lib/api';
import { initAuth } from '../lib/auth';
import { formatMoney } from '../lib/format';
import type { PlayerProfile, TransactionListItem, PaginatedResponse, DepositAccountOption } from '../lib/api';

const C = {
  bg: '#0a0e1a',
  surface: '#0d1b2e',
  surface2: '#112240',
  border: 'rgba(255,255,255,0.07)',
  amber: '#f59e0b',
  text: '#f1f5f9',
  muted: '#64748b',
  dim: '#475569',
  green: '#34d399',
  red: '#f87171',
};

const TX_META: Record<string, { label: string; color: string; sign: string }> = {
  deposit:             { label: 'Deposit',           color: C.green,  sign: '+' },
  withdrawal:          { label: 'Withdrawal',         color: C.red,    sign: '-' },
  game_entry:          { label: 'Game Entry',         color: C.red,    sign: '-' },
  game_win:            { label: 'Game Win',           color: C.green,  sign: '+' },
  referral_commission: { label: 'Referral Bonus',     color: C.green,  sign: '+' },
  admin_credit:        { label: 'Admin Credit',       color: C.green,  sign: '+' },
  admin_debit:         { label: 'Admin Debit',        color: C.red,    sign: '-' },
  refund:              { label: 'Refund',             color: C.green,  sign: '+' },
};

type Tab = 'overview' | 'transactions';

export default function WalletScreen() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [txData, setTxData] = useState<PaginatedResponse<TransactionListItem> | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [txPage, setTxPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [depositAmount, setDepositAmount] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositStep, setDepositStep] = useState<'amount' | 'instruction' | 'receipt'>('amount');
  const [depositAccounts, setDepositAccounts] = useState<DepositAccountOption[]>([]);
  const [depositReceipt, setDepositReceipt] = useState('');
  const [depositTargetAmount, setDepositTargetAmount] = useState(0);
  const [depositSuccess, setDepositSuccess] = useState<string | null>(null);

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawPhone, setWithdrawPhone] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  useEffect(() => {
    initAuth()
      .then(() => getProfile())
      .then(setProfile)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const loadTx = useCallback(async (page: number) => {
    setTxLoading(true);
    try { setTxData(await getWalletTransactions(page)); } catch {}
    finally { setTxLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'transactions') loadTx(txPage);
  }, [tab, txPage, loadTx]);

  const handleDeposit = useCallback(async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) { setDepositError('Enter a valid amount'); return; }
    setDepositLoading(true); setDepositError(null); setDepositSuccess(null);
    try {
      const res = await getDepositAccounts();
      setDepositAccounts(res.accounts.length ? res.accounts : [{ phone: 'N/A', name: 'Support' }]);
      setDepositTargetAmount(amount);
      setDepositStep('instruction');
    } catch (err) {
      setDepositError((err as { message?: string }).message ?? 'Unable to load deposit account');
    } finally {
      setDepositLoading(false);
    }
  }, [depositAmount]);

  const handleManualDepositSubmit = useCallback(async () => {
    if (!depositReceipt.trim()) {
      setDepositError('Please paste the full Telebirr SMS receipt.');
      return;
    }

    setDepositLoading(true); setDepositError(null);
    try {
      const res = await verifyManualDeposit(depositTargetAmount, depositReceipt.trim());
      setDepositSuccess(res.message);
      setDepositStep('amount');
      setDepositAmount('');
      setDepositReceipt('');
      const freshProfile = await getProfile();
      setProfile(freshProfile);
    } catch (err) {
      setDepositError((err as { message?: string }).message ?? 'Deposit verification failed');
    } finally {
      setDepositLoading(false);
    }
  }, [depositReceipt, depositTargetAmount]);

  const handleWithdraw = useCallback(async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) { setWithdrawError('Enter a valid amount'); return; }
    if (!withdrawPhone.trim()) { setWithdrawError('Phone number required'); return; }
    if (profile && amount > Number(profile.mainWallet?.balance ?? 0)) {
      setWithdrawError('Exceeds main wallet balance'); return;
    }
    setWithdrawLoading(true); setWithdrawError(null);
    try {
      await withdrawFunds(amount, withdrawPhone.trim());
      setWithdrawSuccess(true); setWithdrawAmount(''); setWithdrawPhone('');
    } catch (err) { setWithdrawError((err as { message?: string }).message ?? 'Withdrawal failed'); }
    finally { setWithdrawLoading(false); }
  }, [withdrawAmount, withdrawPhone, profile]);

  if (loading) return <div style={{ height: '60vh', background: C.bg }} />;
  if (error || !profile) return <div style={{ padding: 24, textAlign: 'center', color: C.red }}>{error ?? 'Failed to load'}</div>;

  const mainBal = Number(profile.mainWallet?.balance ?? 0);
  const playBal = Number(profile.playWallet?.balance ?? 0);
  const txTotalPages = txData ? Math.ceil(txData.total / txData.pageSize) : 1;

  const input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} style={{
      width: '100%', padding: '13px 14px',
      background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
      borderRadius: 12, fontSize: 15, color: C.text, outline: 'none',
      boxSizing: 'border-box', ...props.style,
    }} />
  );

  const btn = (label: string, onClick: () => void, loading2: boolean, color = C.amber) => (
    <button onClick={onClick} disabled={loading2} style={{
      width: '100%', padding: '14px', background: loading2 ? 'rgba(255,255,255,0.1)' : color,
      color: loading2 ? C.muted : '#0a0e1a', border: 'none', borderRadius: 12,
      fontSize: 15, fontWeight: 800, cursor: loading2 ? 'default' : 'pointer', marginTop: 10,
    }}>
      {loading2 ? 'Please wait…' : label}
    </button>
  );

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', paddingBottom: 80 }}>

      {/* ── Header ── */}
      <div style={{ background: `linear-gradient(135deg, ${C.surface2} 0%, ${C.surface} 100%)`, padding: '20px 20px 18px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>Your Balances</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '14px' }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Winning Balance</div>
            <div style={{ fontSize: 9, color: C.dim, marginBottom: 6 }}>Withdrawable</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: C.green }}>{formatMoney(mainBal)}</div>
            <div style={{ fontSize: 11, color: C.dim }}>Birr</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '14px' }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Play Balance</div>
            <div style={{ fontSize: 9, color: C.dim, marginBottom: 6 }}>Deposit & Bonus</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#60a5fa' }}>{formatMoney(playBal)}</div>
            <div style={{ fontSize: 11, color: C.dim }}>Birr</div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        {(['overview', 'transactions'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '13px 0', border: 'none', background: 'none',
            fontWeight: tab === t ? 800 : 400, fontSize: 14,
            color: tab === t ? C.amber : C.muted,
            borderBottom: tab === t ? `2px solid ${C.amber}` : '2px solid transparent',
            cursor: 'pointer',
          }}>
            {t === 'overview' ? '💳 Payments' : '📄 Transactions'}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ padding: '16px' }}>
          {/* Deposit */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: C.text, marginBottom: 14 }}>⬇ Deposit</div>

            {depositStep === 'amount' && (
              <>
                {input({ type: 'number', placeholder: 'Amount in Birr', value: depositAmount, min: 1, onChange: e => { setDepositAmount(e.target.value); setDepositError(null); setDepositSuccess(null); } })}
                {depositError && <div style={{ color: C.red, fontSize: 13, marginTop: 6 }}>{depositError}</div>}
                {depositSuccess && <div style={{ color: C.green, fontSize: 13, marginTop: 6 }}>{depositSuccess}</div>}
                {btn('Continue', handleDeposit, depositLoading)}
              </>
            )}

            {depositStep === 'instruction' && (
              <>
                <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>
                  Send exactly {depositTargetAmount} ETB to any active Telebirr account below, then paste the full SMS receipt.
                </div>
                {depositAccounts.map((account, idx) => (
                  <div key={`${account.phone}-${idx}`} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <div style={{ color: C.text, fontWeight: 700 }}>Phone: {account.phone}</div>
                    <div style={{ color: C.muted, fontSize: 12 }}>Name: {account.name}</div>
                  </div>
                ))}
                <textarea
                  value={depositReceipt}
                  onChange={e => { setDepositReceipt(e.target.value); setDepositError(null); }}
                  placeholder="Paste the full Telebirr SMS here..."
                  rows={6}
                  style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', borderRadius: 12, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.text, padding: 12, fontSize: 14, marginTop: 12 }}
                />
                {depositError && <div style={{ color: C.red, fontSize: 13, marginTop: 6 }}>{depositError}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  <button onClick={() => { setDepositStep('amount'); setDepositReceipt(''); setDepositError(null); }} style={{ flex: 1, padding: '12px', borderRadius: 12, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontWeight: 700 }}>Back</button>
                  <button onClick={handleManualDepositSubmit} disabled={depositLoading} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: depositLoading ? 'rgba(255,255,255,0.1)' : C.amber, color: depositLoading ? C.muted : '#0a0e1a', fontWeight: 800 }}>Confirm</button>
                </div>
              </>
            )}
          </div>

          {/* Withdraw */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: C.text, marginBottom: 4 }}>⬆ Withdraw</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
              Only your winning balance can be withdrawn. Deposit & bonus balance is not withdrawable.
            </div>
            {mainBal <= 0 && (
              <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: C.red }}>
                You have no winning balance to withdraw. Play and win to earn withdrawable balance.
              </div>
            )}
            {withdrawSuccess && (
              <div style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: C.green }}>
                ✅ Request submitted — pending admin approval.
              </div>
            )}
            {input({ type: 'number', placeholder: `Max ${formatMoney(mainBal)} Birr (winnings only)`, value: withdrawAmount, min: 100, max: mainBal, disabled: mainBal <= 0, onChange: e => { setWithdrawAmount(e.target.value); setWithdrawError(null); setWithdrawSuccess(false); }, style: { marginBottom: 10 } })}
            {input({ type: 'tel', placeholder: 'Phone (e.g. 09XXXXXXXX)', value: withdrawPhone, disabled: mainBal <= 0, onChange: e => { setWithdrawPhone(e.target.value); setWithdrawError(null); } })}
            {withdrawError && <div style={{ color: C.red, fontSize: 13, marginTop: 6 }}>{withdrawError}</div>}
            {btn('Request Withdrawal', handleWithdraw, withdrawLoading || mainBal <= 0, '#0f9b8e')}
          </div>
        </div>
      )}

      {tab === 'transactions' && (
        <div style={{ padding: '12px 0' }}>
          {txLoading && <div style={{ padding: 32 }} />}

          {!txLoading && txData?.items.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>No transactions yet.</div>
          )}

          {!txLoading && txData?.items.filter(tx => tx?.amount != null).map(tx => {
            const meta = TX_META[tx.type] ?? { label: tx.type, color: C.muted, sign: '' };
            return (
              <div key={tx.id} style={{
                background: C.surface, margin: '0 14px 10px',
                borderRadius: 14, padding: '14px 16px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                border: `1px solid ${C.border}`,
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{meta.label}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>
                    {new Date(tx.created_at).toLocaleDateString()} · {tx.walletType}
                  </div>
                  {tx.note && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{tx.note}</div>}
                </div>
                <div style={{ fontWeight: 900, fontSize: 16, color: meta.color }}>
                  {meta.sign}{formatMoney(tx.amount ?? 0)} Birr
                </div>
              </div>
            );
          })}

          {!txLoading && txData && txTotalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: '16px 0' }}>
              <button onClick={() => setTxPage(p => Math.max(1, p - 1))} disabled={txPage <= 1}
                style={{ padding: '8px 20px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: txPage <= 1 ? C.dim : C.amber, cursor: txPage <= 1 ? 'default' : 'pointer', fontWeight: 700 }}>
                ‹
              </button>
              <span style={{ alignSelf: 'center', fontSize: 13, color: C.muted }}>{txPage} / {txTotalPages}</span>
              <button onClick={() => setTxPage(p => Math.min(txTotalPages, p + 1))} disabled={txPage >= txTotalPages}
                style={{ padding: '8px 20px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: txPage >= txTotalPages ? C.dim : C.amber, cursor: txPage >= txTotalPages ? 'default' : 'pointer', fontWeight: 700 }}>
                ›
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
