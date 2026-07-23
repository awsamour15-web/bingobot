import React, { useEffect, useState, useCallback } from 'react';
import { getProfile, getWalletTransactions, depositFunds, withdrawFunds } from '../lib/api';
import type { PlayerProfile, TransactionListItem, PaginatedResponse } from '../lib/api';

type Tab = 'overview' | 'transactions';

const TX_LABELS: Record<string, string> = {
  deposit: '⬇ ተቀባይ',
  withdrawal: '⬆ ልኬ',
  stake: '🎯 ዋጋ',
  prize: '🏆 ሽልማት',
  refund: '↩ ተመላሽ',
  referral_commission: '👥 ምክረ ሽልማት',
  admin_credit: '🔧 አስተዳዳሪ ክሬዲት',
};

export default function WalletScreen() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [txData, setTxData] = useState<PaginatedResponse<TransactionListItem> | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [txPage, setTxPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deposit state
  const [depositAmount, setDepositAmount] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawPhone, setWithdrawPhone] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  useEffect(() => {
    getProfile()
      .then(setProfile)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const loadTx = useCallback(async (page: number) => {
    setTxLoading(true);
    try {
      const data = await getWalletTransactions(page);
      setTxData(data);
    } catch {
      // silently fail — show previous data
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'transactions') {
      loadTx(txPage);
    }
  }, [tab, txPage, loadTx]);

  const handleDeposit = useCallback(async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) {
      setDepositError('Valid amount required');
      return;
    }
    setDepositLoading(true);
    setDepositError(null);
    try {
      const res = await depositFunds(amount);
      window.open(res.checkoutUrl, '_blank');
    } catch (err) {
      const e = err as { message?: string };
      setDepositError(e.message ?? 'Deposit failed');
    } finally {
      setDepositLoading(false);
    }
  }, [depositAmount]);

  const handleWithdraw = useCallback(async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) { setWithdrawError('Valid amount required'); return; }
    if (!withdrawPhone.trim()) { setWithdrawError('Phone number required'); return; }
    if (profile && amount > profile.mainWallet.balance) {
      setWithdrawError('Amount exceeds main wallet balance');
      return;
    }
    setWithdrawLoading(true);
    setWithdrawError(null);
    try {
      await withdrawFunds(amount, withdrawPhone.trim());
      setWithdrawSuccess(true);
      setWithdrawAmount('');
      setWithdrawPhone('');
    } catch (err) {
      const e = err as { message?: string; code?: string };
      if (e.code === 'PLAY_WALLET_WITHDRAWAL') {
        setWithdrawError('Play wallet cannot be withdrawn');
      } else {
        setWithdrawError(e.message ?? 'Withdrawal failed');
      }
    } finally {
      setWithdrawLoading(false);
    }
  }, [withdrawAmount, withdrawPhone, profile]);

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>Loading…</div>;
  }

  if (error || !profile) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#e53e3e' }}>{error ?? 'Failed to load wallet'}</div>;
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    border: '1px solid #ddd',
    borderRadius: 8,
    fontSize: 15,
    boxSizing: 'border-box',
  };

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '14px',
    background: disabled ? '#a5b4fc' : '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    marginTop: 8,
  });

  const txTotalPages = txData ? Math.ceil(txData.total / txData.pageSize) : 1;

  return (
    <div>
      <div style={{ background: '#4f46e5', color: '#fff', padding: '20px 16px 16px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>💰 ዋሌት</div>
        <div style={{ display: 'flex', gap: 12 }}>
          {/* Main wallet */}
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '14px' }}>
            <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>ዋና ዋሌት</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{profile.mainWallet.balance.toFixed(2)}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>ብር</div>
          </div>
          {/* Play wallet */}
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '14px' }}>
            <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>ጨዋታ ዋሌት</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{profile.playWallet.balance.toFixed(2)}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>ብር</div>
          </div>
        </div>
        {profile.phone_verified && (
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
            ✅ ስልክ ተረጋግጧል
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #eee' }}>
        {(['overview', 'transactions'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: '12px 0',
              border: 'none',
              background: 'none',
              fontWeight: tab === t ? 700 : 400,
              color: tab === t ? '#4f46e5' : '#666',
              borderBottom: tab === t ? '2px solid #4f46e5' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {t === 'overview' ? 'ክፍያ' : 'ግብይቶች'}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ padding: 16 }}>
          {/* Deposit */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>⬇ ገንዘብ ተቀበል</div>
            <input
              type="number"
              placeholder="Amount (Birr)"
              value={depositAmount}
              onChange={(e) => { setDepositAmount(e.target.value); setDepositError(null); }}
              style={inputStyle}
              min={1}
            />
            {depositError && <div style={{ color: '#e53e3e', fontSize: 13, marginTop: 6 }}>{depositError}</div>}
            <button onClick={handleDeposit} disabled={depositLoading} style={btnStyle(depositLoading)}>
              {depositLoading ? 'Opening…' : 'Deposit'}
            </button>
          </div>

          {/* Withdraw */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>⬆ ልኬ / Withdraw</div>
            {withdrawSuccess && (
              <div style={{ background: '#ecfdf5', color: '#065f46', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 14 }}>
                ✅ ጥያቄዎ ደርሷል። የአስተዳዳሪ ፈቃድ ይጠበቃል።
              </div>
            )}
            <input
              type="number"
              placeholder={`Amount (max ${profile.mainWallet.balance.toFixed(2)} Birr)`}
              value={withdrawAmount}
              onChange={(e) => { setWithdrawAmount(e.target.value); setWithdrawError(null); setWithdrawSuccess(false); }}
              style={{ ...inputStyle, marginBottom: 8 }}
              min={1}
              max={profile.mainWallet.balance}
            />
            <input
              type="tel"
              placeholder="Phone number (e.g. 09XXXXXXXX)"
              value={withdrawPhone}
              onChange={(e) => { setWithdrawPhone(e.target.value); setWithdrawError(null); }}
              style={inputStyle}
            />
            {withdrawError && <div style={{ color: '#e53e3e', fontSize: 13, marginTop: 6 }}>{withdrawError}</div>}
            <button onClick={handleWithdraw} disabled={withdrawLoading} style={btnStyle(withdrawLoading)}>
              {withdrawLoading ? 'Submitting…' : 'Withdraw'}
            </button>
          </div>
        </div>
      )}

      {tab === 'transactions' && (
        <div>
          {txLoading && <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>Loading…</div>}

          {!txLoading && txData?.items.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>ምንም ግብይት የለም።</div>
          )}

          {!txLoading && txData?.items.map((tx) => (
            <div
              key={tx.id}
              style={{
                background: '#fff',
                margin: '8px 16px',
                borderRadius: 10,
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {TX_LABELS[tx.type] ?? tx.type}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {new Date(tx.created_at).toLocaleDateString()} · {tx.walletType}
                </div>
                {tx.note && <div style={{ fontSize: 12, color: '#aaa', marginTop: 1 }}>{tx.note}</div>}
              </div>
              <div style={{
                fontWeight: 700,
                fontSize: 16,
                color: ['deposit', 'prize', 'refund', 'referral_commission', 'admin_credit'].includes(tx.type) ? '#065f46' : '#7f1d1d',
              }}>
                {['deposit', 'prize', 'refund', 'referral_commission', 'admin_credit'].includes(tx.type) ? '+' : '-'}{tx.amount.toFixed(2)} ብር
              </div>
            </div>
          ))}

          {!txLoading && txData && txTotalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: '16px 0' }}>
              <button
                onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                disabled={txPage <= 1}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: txPage <= 1 ? 'default' : 'pointer' }}
              >
                ‹
              </button>
              <span style={{ alignSelf: 'center', fontSize: 13, color: '#888' }}>{txPage} / {txTotalPages}</span>
              <button
                onClick={() => setTxPage((p) => Math.min(txTotalPages, p + 1))}
                disabled={txPage >= txTotalPages}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: txPage >= txTotalPages ? 'default' : 'pointer' }}
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
