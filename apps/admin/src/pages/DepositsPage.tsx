import React, { useState, useEffect, useCallback } from 'react';
import type { AdminDeposit, DepositsResponse } from '../lib/api';
import { getDeposits, createDeposit, cancelDeposit, approveDeposit } from '../lib/api';
import {
  C, Btn, Badge, Card, CardHeader, StatCard, Table, Th, Td,
  TrEmpty, TrLoading, Alert, Field, PageHeader, inputCss,
} from '../components/ui';

function statusVariant(s: AdminDeposit['status']): 'warning' | 'success' | 'neutral' {
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

export function DepositsPage() {
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

  async function handleApprove(id: string) {
    const d = data?.items.find((x) => x.id === id);
    if (!window.confirm(`Approve deposit ${d?.tx_number ?? id} of ${d?.amount} ETB for @${d?.player_username}?`)) return;
    setApprovingId(id); setActionMsg(null);
    try {
      const result = await approveDeposit(id);
      setActionMsg({ type: 'success', text: `Deposit of ${result.amount} ETB approved and credited.` });
      await fetchDeposits();
    } catch (err: unknown) {
      setActionMsg({ type: 'error', text: (err as Error).message ?? 'Failed to approve deposit' });
    } finally { setApprovingId(null); }
  }

  const s = data?.summary;

  return (
    <div className="fade-in">
      <PageHeader
        title="Deposits"
        action={
          <Btn variant="ghost" size="sm" onClick={fetchDeposits} disabled={loading}>
            ↻ Refresh
          </Btn>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard icon="⏳" label="Pending"   value={s?.pending ?? '—'}  color={C.warning} />
        <StatCard icon="✅" label="Claimed"   value={s?.claimed ?? '—'}  color={C.success} />
        <StatCard icon="✕"  label="Cancelled" value={s?.cancelled ?? '—'} color={C.muted}  />
        <StatCard icon="💾" label="Total"     value={data?.items.length ?? '—'} color={C.primary} />
      </div>

      {actionMsg && <Alert type={actionMsg.type}>{actionMsg.text}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <AddDepositForm onCreated={fetchDeposits} />

      <Card>
        <CardHeader
          title="Deposit History"
          subtitle="All Telebirr transactions and player claims"
          action={<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>{data?.items.length ?? 0} total</span>}
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
                <Td><Badge variant={statusVariant(d.status)}>{d.status}</Badge></Td>
                <Td muted={!d.player_username}>{d.player_username ? `@${d.player_username}` : '—'}</Td>
                <Td muted>{new Date(d.created_at).toLocaleString()}</Td>
                <Td muted>{d.claimed_at ? new Date(d.claimed_at).toLocaleString() : '—'}</Td>
                <Td style={{ textAlign: 'right' }}>
                  {d.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {d.player_username && (
                        <Btn size="sm" variant="primary" onClick={() => handleApprove(d.id)} disabled={approvingId === d.id}>
                          {approvingId === d.id ? '…' : '✓ Approve'}
                        </Btn>
                      )}
                      <Btn size="sm" variant="danger" onClick={() => handleCancel(d.id)} disabled={cancellingId === d.id}>
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
