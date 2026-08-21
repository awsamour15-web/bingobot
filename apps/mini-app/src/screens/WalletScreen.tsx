import React, { useEffect, useState, useCallback } from 'react';
import {
  getProfile,
  getWalletTransactions,
} from '../lib/api';
import { initAuth } from '../lib/auth';
import { formatMoney } from '../lib/format';
import type { PlayerProfile, TransactionListItem, PaginatedResponse } from '../lib/api';

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
  deposit:             { label: 'Deposit',       color: C.green, sign: '+' },
  withdrawal:          { label: 'Withdrawal',     color: C.red,   sign: '-' },
  game_entry:          { label: 'Game Entry',     color: C.red,   sign: '-' },
  game_win:            { label: 'Game Win',       color: C.green, sign: '+' },
  referral_commission: { label: 'Referral Bonus', color: C.green, sign: '+' },
  admin_credit:        { label: 'Admin Credit',   color: C.green, sign: '+' },
  admin_debit:         { label: 'Admin Debit',    color: C.red,   sign: '-' },
  refund:              { label: 'Refund',         color: C.green, sign: '+' },
};

type Tab = 'balance' | 'history';

export default function WalletScreen() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [txData, setTxData] = useState<PaginatedResponse<TransactionListItem> | null>(null);
  const [tab, setTab] = useState<Tab>('balance');
  const [txPage, setTxPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      await initAuth();
      const p = await getProfile();
      setProfile(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const p = await getProfile();
      setProfile(p);
    } catch {}
    finally { setRefreshing(false); }
  }, []);

  const loadTx = useCallback(async (page: number) => {
    setTxLoading(true);
    try { setTxData(await getWalletTransactions(page)); } catch {}
    finally { setTxLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'history') loadTx(txPage);
  }, [tab, txPage, loadTx]);

  if (loading) return (
    <div style={{ minHeight: '100dvh', background: C.bg }} />
  );

  if (error || !profile) return (
    <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.red }}>
      {error ?? 'Failed to load'}
    </div>
  );

  const mainBal = Number(profile.mainWallet?.balance ?? 0);
  const playBal = Number(profile.playWallet?.balance ?? 0);
  const phone = (profile as any).phone ?? (profile as any).username ?? '—';
  const txTotalPages = txData ? Math.ceil(txData.total / txData.pageSize) : 1;

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, paddingBottom: 80 }}>

      {/* ── Header ── */}
      <div style={{ padding: '24px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: C.text }}>Wallet</span>
          <button
            onClick={handleRefresh}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, opacity: refreshing ? 0.5 : 1 }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ display: 'block', transition: 'transform 0.6s', transform: refreshing ? 'rotate(360deg)' : 'none' }}>
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>

        {/* Phone + Verified */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: C.surface, borderRadius: 14, padding: '14px 16px', marginBottom: 4,
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span style={{ color: C.text, fontSize: 16, fontWeight: 600 }}>{phone}</span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)',
            borderRadius: 20, padding: '4px 12px',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span style={{ color: C.green, fontSize: 13, fontWeight: 700 }}>Verified</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', background: C.surface, borderRadius: 12, padding: 4, marginTop: 12,
          border: `1px solid ${C.border}`,
        }}>
          {(['balance', 'history'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '10px 0', border: 'none',
              borderRadius: 10,
              background: tab === t ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: tab === t ? C.text : C.muted,
              fontWeight: tab === t ? 800 : 500,
              fontSize: 14, cursor: 'pointer', transition: 'all 0.2s',
            }}>
              {t === 'balance' ? 'Balance' : 'History'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Balance Tab ── */}
      {tab === 'balance' && (
        <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Main Wallet */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: '18px 20px',
          }}>
            <span style={{ color: C.muted, fontSize: 16 }}>Main Wallet</span>
            <span style={{ color: C.text, fontSize: 22, fontWeight: 900 }}>{formatMoney(mainBal)}</span>
          </div>

          {/* Play Wallet */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: '18px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span style={{ color: C.muted, fontSize: 16 }}>Play Wallet</span>
            </div>
            <span style={{ color: C.green, fontSize: 22, fontWeight: 900 }}>{formatMoney(playBal)}</span>
          </div>

        </div>
      )}

      {/* ── History Tab ── */}
      {tab === 'history' && (
        <div style={{ padding: '16px 0' }}>
          {txLoading && <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Loading…</div>}

          {!txLoading && txData?.items.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>No transactions yet.</div>
          )}

          {!txLoading && txData?.items.filter(tx => tx?.amount != null).map(tx => {
            const meta = TX_META[tx.type] ?? { label: tx.type, color: C.muted, sign: '' };
            return (
              <div key={tx.id} style={{
                background: C.surface, margin: '0 16px 10px',
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
