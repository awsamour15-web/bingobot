import React, { useState, useEffect, useCallback } from 'react';
import type { WithdrawalRequest, RevenueStats } from '@fidel/shared';
import { getWithdrawals, approveWithdrawal, rejectWithdrawal, getRevenue } from '../lib/api';
import {
  C, Btn, Card, CardHeader, StatCard, Table, Th, Td,
  TrEmpty, TrLoading, Alert, Field, PageHeader, inputCss,
} from '../components/ui';

function RevenueSummary() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async (start?: string, end?: string) => {
    setLoading(true); setError(null);
    try { setStats(await getRevenue(start, end)); }
    catch (e: unknown) { setError((e as Error).message ?? 'Failed to load revenue'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchStats(); }, [fetchStats]);

  return (
    <Card style={{ marginBottom: 24 }}>
      <CardHeader title="Revenue Summary" subtitle="Platform earnings overview" />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20 }}>
        <Field label="From"><input style={{ ...inputCss, width: 160 }} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        <Field label="To"><input style={{ ...inputCss, width: 160 }} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        <Btn onClick={() => fetchStats(startDate || undefined, endDate || undefined)} disabled={loading}>
          {loading ? 'Loading…' : 'Apply Filter'}
        </Btn>
        {(startDate || endDate) && (
          <Btn variant="ghost" size="sm" onClick={() => { setStartDate(''); setEndDate(''); fetchStats(); }}>Clear</Btn>
        )}
      </div>
      {error && <Alert type="error">{error}</Alert>}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          <StatCard icon="💵" label="Total Stakes" value={`${stats.totalStakesCollected.toFixed(2)} ETB`} color={C.primary} />
          <StatCard icon="🏆" label="Prizes Paid" value={`${stats.totalPrizesPaid.toFixed(2)} ETB`} color={C.danger} />
          <StatCard icon="📈" label="Commission" value={`${stats.platformCommissionEarned.toFixed(2)} ETB`} color={C.success} />
        </div>
      )}
    </Card>
  );
}

function PendingWithdrawals() {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const fetchWithdrawals = useCallback(async () => {
    setLoading(true); setError(null);
    try { setWithdrawals(await getWithdrawals()); }
    catch (e: unknown) { setError((e as Error).message ?? 'Failed to load withdrawals'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchWithdrawals(); }, [fetchWithdrawals]);

  async function handleApprove(w: WithdrawalRequest) {
    if (!window.confirm(`Approve ${w.amount.toFixed(2)} ETB withdrawal for @${w.username}?`)) return;
    setActioningId(w.id); setActionMsg(null);
    try {
      await approveWithdrawal(w.id);
      setActionMsg({ type: 'success', text: `Withdrawal for @${w.username} approved.` });
      await fetchWithdrawals();
    } catch (e: unknown) { setActionMsg({ type: 'error', text: (e as Error).message ?? 'Failed' }); }
    finally { setActioningId(null); }
  }

  async function handleReject(w: WithdrawalRequest) {
    if (!window.confirm(`Reject ${w.amount.toFixed(2)} ETB withdrawal for @${w.username}?`)) return;
    setActioningId(w.id); setActionMsg(null);
    try {
      await rejectWithdrawal(w.id);
      setActionMsg({ type: 'success', text: `Withdrawal for @${w.username} rejected. Funds returned.` });
      await fetchWithdrawals();
    } catch (e: unknown) { setActionMsg({ type: 'error', text: (e as Error).message ?? 'Failed' }); }
    finally { setActioningId(null); }
  }

  const pending = withdrawals.filter((w) => w.status === 'pending');

  return (
    <Card>
      <CardHeader
        title="Pending Withdrawals"
        subtitle={`${pending.length} awaiting review`}
        action={<Btn variant="ghost" size="sm" onClick={fetchWithdrawals} disabled={loading}>{loading ? '…' : '↻ Refresh'}</Btn>}
      />
      {actionMsg && <Alert type={actionMsg.type}>{actionMsg.text}</Alert>}
      {error && <Alert type="error">{error}</Alert>}
      <Table>
        <thead>
          <tr>
            <Th>Player</Th>
            <Th>Phone</Th>
            <Th>Amount (ETB)</Th>
            <Th>Requested</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? <TrLoading cols={5} /> :
           !pending.length ? <TrEmpty cols={5} message="No pending withdrawals." /> :
           pending.map((w) => (
            <tr key={w.id}>
              <Td><span style={{ fontWeight: 600 }}>@{w.username}</span></Td>
              <Td muted>{w.phone || '—'}</Td>
              <Td><span style={{ fontWeight: 700, color: C.danger }}>{w.amount.toFixed(2)}</span></Td>
              <Td muted>{new Date(w.created_at).toLocaleString()}</Td>
              <Td>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn size="sm" variant="success" onClick={() => handleApprove(w)} disabled={actioningId === w.id}>
                    {actioningId === w.id ? '…' : '✓ Approve'}
                  </Btn>
                  <Btn size="sm" variant="danger" onClick={() => handleReject(w)} disabled={actioningId === w.id}>
                    {actioningId === w.id ? '…' : '✕ Reject'}
                  </Btn>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

export function FinancePage() {
  return (
    <div className="fade-in">
      <PageHeader title="Finance & Withdrawals" />
      <RevenueSummary />
      <PendingWithdrawals />
    </div>
  );
}
