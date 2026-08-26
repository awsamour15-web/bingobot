import React, { useState, useEffect, useCallback } from 'react';
import type { AdminDeposit, DepositsResponse, FinanceSummary } from '../lib/api';
import type { WithdrawalRequest, RevenueStats } from '@fidel/shared';
import { getDeposits, createDeposit, cancelDeposit, approveDeposit, getWithdrawals, approveWithdrawal, rejectWithdrawal, getRevenue, getFinanceSummary } from '../lib/api';
import {
  C, Btn, Badge, Card, CardHeader, StatCard, Table, Th, Td,
  TrEmpty, TrLoading, Alert, Field, PageHeader, inputCss,
} from '../components/ui';

type Tab = 'deposits' | 'withdrawals' | 'revenue';

// ── Finance Summary Banner ───────────────────────────────────────────────────

function fmt(n: number) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const periodLabels = ['Today', 'This Week', 'This Month', 'All Time'] as const;
type Period = 0 | 1 | 2 | 3;
const periodKeys: Array<keyof import('../lib/api').FinancePeriodStats> = ['day', 'week', 'month', 'total'];

function FinanceSummaryBanner() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(0);

  useEffect(() => {
    void getFinanceSummary()
      .then(setSummary)
      .finally(() => setLoading(false));
  }, []);

  const pk = periodKeys[period] as keyof import('../lib/api').FinancePeriodStats;
  const dep   = summary?.deposits[pk] ?? 0;
  const with_ = summary?.withdrawals[pk] ?? 0;
  const profit = summary?.profit[pk] ?? 0;

  return (
    <Card style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>📊 Finance Overview</span>
        <div style={{ display: 'flex', gap: 4, background: 'var(--c-bg)', borderRadius: 8, padding: 3, border: '1px solid var(--c-border)' }}>
          {periodLabels.map((label, i) => (
            <button
              key={label}
              onClick={() => setPeriod(i as Period)}
              style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
                fontWeight: period === i ? 700 : 500,
                background: period === i ? 'rgba(99,102,241,0.18)' : 'transparent',
                color: period === i ? '#a5b4fc' : 'var(--c-text-secondary)',
                transition: 'all 0.12s',
              }}
            >{label}</button>
          ))}
        </div>
      </div>
      {loading ? (
        <div style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
          <StatCard icon="💰" label={`Deposits (${periodLabels[period]})`}    value={`${fmt(dep)} ETB`}    color={C.success} />
          <StatCard icon="💸" label={`Withdrawals (${periodLabels[period]})`} value={`${fmt(with_)} ETB`}  color={C.danger}  />
          <StatCard icon={profit >= 0 ? '📈' : '📉'} label={`Net Profit (${periodLabels[period]})`}
            value={`${profit >= 0 ? '+' : ''}${fmt(profit)} ETB`}
            color={profit >= 0 ? C.success : C.danger} />
        </div>
      )}
    </Card>
  );
}

// ── Deposits helpers ────────────────────────────────────────────────────────

function depositStatusVariant(s: AdminDeposit['status']): 'warning' | 'success' | 'neutral' {
  if (s === 'pending') return 'warning';
  if (s === 'claimed') return 'success';
  return 'neutral';
}

function AddDepositForm({ onCreated }: { onCreated: () => void }) {
  const [txNumber, setTxNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null);
    const parsed = parseFloat(amount);
    if (!txNumber.trim()) { setError('Transaction number is required.'); return; }
    if (isNaN(parsed) || parsed <= 0) { setError('Amount must be a positive number.'); return; }
    setSubmitting(true);
    try {
      const d = await createDeposit(txNumber.trim(), parsed);
      setSuccess(`Created: ${d.tx_number} — ${Number(d.amount).toFixed(2)} ETB`);
      setTxNumber(''); setAmount('');
      onCreated();
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      setError(e.code === 'DUPLICATE_TX_NUMBER'
        ? 'That transaction number already exists.'
        : (e.message ?? 'Failed to create deposit.'));
    } finally { setSubmitting(false); }
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader title="Add Deposit" subtitle="Manually register a Telebirr transaction" />
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, alignItems: 'flex-end' }}>
          <Field label="Transaction Number">
            <input style={inputCss} type="text" placeholder="e.g. DH87MNVFCT" value={txNumber}
              onChange={(e) => setTxNumber(e.target.value)} disabled={submitting} />
          </Field>
          <Field label="Amount (ETB)">
            <input style={inputCss} type="number" min="1" step="0.01" placeholder="e.g. 150" value={amount}
              onChange={(e) => setAmount(e.target.value)} disabled={submitting} />
          </Field>
          <div>
            <Btn type="submit" disabled={submitting}>{submitting ? 'Adding…' : 'Add Deposit'}</Btn>
          </div>
        </div>
      </form>
    </Card>
  );
}

function DepositsTab() {
  const [data, setData] = useState<DepositsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const fetchDeposits = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await getDeposits()); }
    catch (err: unknown) { setError((err as Error).message ?? 'Failed to load deposits'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchDeposits(); }, [fetchDeposits]);

  async function handleApprove(id: string) {
    const d = data?.items.find((x) => x.id === id);
    if (!window.confirm(`Approve deposit ${d?.tx_number ?? id} (${Number(d?.amount).toFixed(2)} ETB)?`)) return;
    setApprovingId(id); setActionMsg(null);
    try {
      const res = await approveDeposit(id);
      setActionMsg({ type: 'success', text: `Deposit approved — ${res.amount.toFixed(2)} ETB credited.` });
      await fetchDeposits();
    } catch (err: unknown) {
      setActionMsg({ type: 'error', text: (err as Error).message ?? 'Failed to approve deposit' });
    } finally { setApprovingId(null); }
  }

  async function handleCancel(id: string) {
    const d = data?.items.find((x) => x.id === id);
    if (!window.confirm(`Cancel deposit ${d?.tx_number ?? id}?`)) return;
    setCancellingId(id); setActionMsg(null);
    try {
      await cancelDeposit(id);
      setActionMsg({ type: 'success', text: 'Deposit cancelled.' });
      await fetchDeposits();
    } catch (err: unknown) {
      setActionMsg({ type: 'error', text: (err as Error).message ?? 'Failed to cancel deposit' });
    } finally { setCancellingId(null); }
  }

  const s = data?.summary;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard icon="⏳" label="Pending"   value={s?.pending ?? '—'}        color={C.warning}  />
        <StatCard icon="✅" label="Claimed"   value={s?.claimed ?? '—'}        color={C.success}  />
        <StatCard icon="✕"  label="Cancelled" value={s?.cancelled ?? '—'}      color={C.muted}    />
        <StatCard icon="💾" label="Total"     value={data?.items.length ?? '—'} color={C.primary} />
      </div>

      {actionMsg && <Alert type={actionMsg.type}>{actionMsg.text}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <AddDepositForm onCreated={fetchDeposits} />

      <Card>
        <CardHeader
          title="Deposit History"
          subtitle="All Telebirr transactions and player claims"
          action={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>{data?.items.length ?? 0} total</span>
              <Btn variant="ghost" size="sm" onClick={fetchDeposits} disabled={loading}>↻ Refresh</Btn>
            </div>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Tx Number</Th><Th>Amount (ETB)</Th><Th>Status</Th><Th>Player</Th>
              <Th>Created</Th><Th>Claimed At</Th><Th right>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? <TrLoading cols={7} /> :
             !data?.items.length ? <TrEmpty cols={7} message="No deposits found." /> :
             data.items.map((d) => (
              <tr key={d.id}>
                <Td style={{ fontWeight: 700 }}>{d.tx_number}</Td>
                <Td><span style={{ fontWeight: 700 }}>{Number(d.amount).toFixed(2)}</span></Td>
                <Td><Badge variant={depositStatusVariant(d.status)}>{d.status}</Badge></Td>
                <Td muted={!d.player_username}>{d.player_username ? `@${d.player_username}` : '—'}</Td>
                <Td muted>{new Date(d.created_at).toLocaleString()}</Td>
                <Td muted>{d.claimed_at ? new Date(d.claimed_at).toLocaleString() : '—'}</Td>
                <Td style={{ textAlign: 'right' }}>
                  {d.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {d.player_username && (
                        <Btn size="sm" variant="primary" onClick={() => handleApprove(d.id)} disabled={approvingId === d.id || cancellingId === d.id}>
                          {approvingId === d.id ? '…' : 'Approve'}
                        </Btn>
                      )}
                      <Btn size="sm" variant="danger" onClick={() => handleCancel(d.id)} disabled={cancellingId === d.id || approvingId === d.id}>
                        {cancellingId === d.id ? '…' : 'Cancel'}
                      </Btn>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

// ── Withdrawals tab ─────────────────────────────────────────────────────────

function WithdrawalsTab() {
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
    const txNumber = window.prompt(`Enter transaction number for @${w.username} (${Number(w.amount).toFixed(2)} ETB):`);
    if (txNumber === null) return;
    if (!txNumber.trim()) { setActionMsg({ type: 'error', text: 'Transaction number is required.' }); return; }
    setActioningId(w.id); setActionMsg(null);
    try {
      await approveWithdrawal(w.id, txNumber.trim());
      setActionMsg({ type: 'success', text: `Withdrawal for @${w.username} approved.` });
      await fetchWithdrawals();
    } catch (e: unknown) { setActionMsg({ type: 'error', text: (e as Error).message ?? 'Failed' }); }
    finally { setActioningId(null); }
  }

  async function handleReject(w: WithdrawalRequest) {
    if (!window.confirm(`Reject ${Number(w.amount).toFixed(2)} ETB for @${w.username}?`)) return;
    setActioningId(w.id); setActionMsg(null);
    try {
      await rejectWithdrawal(w.id);
      setActionMsg({ type: 'success', text: `Rejected. Funds returned to @${w.username}.` });
      await fetchWithdrawals();
    } catch (e: unknown) { setActionMsg({ type: 'error', text: (e as Error).message ?? 'Failed' }); }
    finally { setActioningId(null); }
  }

  const pending = withdrawals.filter((w) => w.status === 'pending');
  const completed = withdrawals.filter((w) => w.status !== 'pending');

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard icon="⏳" label="Pending"   value={pending.length}   color={C.warning} />
        <StatCard icon="✅" label="Completed" value={completed.length} color={C.success} />
        <StatCard icon="💸" label="Pending ETB" value={`${pending.reduce((s, w) => s + Number(w.amount), 0).toFixed(0)}`} color={C.danger} />
      </div>

      {actionMsg && <Alert type={actionMsg.type}>{actionMsg.text}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <Card style={{ marginBottom: 20 }}>
        <CardHeader
          title="Pending Withdrawals"
          subtitle={`${pending.length} awaiting review`}
          action={<Btn variant="ghost" size="sm" onClick={fetchWithdrawals} disabled={loading}>↻ Refresh</Btn>}
        />
        <Table>
          <thead>
            <tr>
              <Th>Player</Th><Th>Phone</Th><Th>Amount (ETB)</Th><Th>Requested</Th><Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? <TrLoading cols={5} /> :
             !pending.length ? <TrEmpty cols={5} message="No pending withdrawals." /> :
             pending.map((w) => (
              <tr key={w.id}>
                <Td><span style={{ fontWeight: 600 }}>@{w.username}</span></Td>
                <Td muted>{w.phone || '—'}</Td>
                <Td><span style={{ fontWeight: 700, color: '#f87171' }}>{Number(w.amount).toFixed(2)}</span></Td>
                <Td muted>{new Date(w.created_at).toLocaleString()}</Td>
                <Td>
                  <div style={{ display: 'flex', gap: 6 }}>
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

      {completed.length > 0 && (
        <Card>
          <CardHeader title="Recent History" subtitle={`Last ${Math.min(completed.length, 20)} completed/rejected`} />
          <Table>
            <thead>
              <tr>
                <Th>Player</Th><Th>Phone</Th><Th>Amount (ETB)</Th><Th>Date</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {completed.slice(0, 20).map((w) => (
                <tr key={w.id} style={{ opacity: 0.7 }}>
                  <Td><span style={{ fontWeight: 600 }}>@{w.username}</span></Td>
                  <Td muted>{w.phone || '—'}</Td>
                  <Td><span style={{ fontWeight: 600 }}>{Number(w.amount).toFixed(2)}</span></Td>
                  <Td muted>{new Date(w.created_at).toLocaleString()}</Td>
                  <Td>
                    <Badge variant={w.status === 'approved' ? 'success' : 'danger'}>
                      {w.status.toUpperCase()}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ── Revenue tab ─────────────────────────────────────────────────────────────

function RevenueTab() {
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
    <div>
      <Card>
        <CardHeader title="Revenue Summary" subtitle="Platform earnings overview" />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 18 }}>
          <Field label="From">
            <input style={{ ...inputCss, width: 150 }} type="date" value={startDate}
              onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="To">
            <input style={{ ...inputCss, width: 150 }} type="date" value={endDate}
              onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Btn onClick={() => fetchStats(startDate || undefined, endDate || undefined)} disabled={loading}>
            {loading ? 'Loading…' : 'Apply Filter'}
          </Btn>
          {(startDate || endDate) && (
            <Btn variant="ghost" size="sm" onClick={() => { setStartDate(''); setEndDate(''); fetchStats(); }}>
              Clear
            </Btn>
          )}
        </div>
        {error && <Alert type="error">{error}</Alert>}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
            <StatCard icon="💵" label="Total Stakes"  value={`${Number(stats.totalStakesCollected).toFixed(2)} ETB`}      color={C.primary} />
            <StatCard icon="🏆" label="Prizes Paid"   value={`${Number(stats.totalPrizesPaid).toFixed(2)} ETB`}           color={C.danger}  />
            <StatCard icon="📈" label="Commission"    value={`${Number(stats.platformCommissionEarned).toFixed(2)} ETB`}  color={C.success} />
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

const tabCss = (active: boolean): React.CSSProperties => ({
  padding: '8px 18px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontWeight: active ? 700 : 500,
  fontSize: 13,
  background: active ? 'rgba(99,102,241,0.14)' : 'transparent',
  color: active ? '#a5b4fc' : 'var(--c-text-secondary)',
  transition: 'all 0.15s',
});

export function FinancePage() {
  const [tab, setTab] = useState<Tab>('deposits');

  return (
    <div className="fade-in">
      <PageHeader title="Finance" />

      <FinanceSummaryBanner />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--c-bg-card)', padding: 6, borderRadius: 12, border: '1px solid var(--c-border)', width: 'fit-content' }}>
        <button style={tabCss(tab === 'deposits')}    onClick={() => setTab('deposits')}>💰 Deposits</button>
        <button style={tabCss(tab === 'withdrawals')} onClick={() => setTab('withdrawals')}>💸 Withdrawals</button>
        <button style={tabCss(tab === 'revenue')}     onClick={() => setTab('revenue')}>📈 Revenue</button>
      </div>

      {tab === 'deposits'    && <DepositsTab />}
      {tab === 'withdrawals' && <WithdrawalsTab />}
      {tab === 'revenue'     && <RevenueTab />}
    </div>
  );
}
