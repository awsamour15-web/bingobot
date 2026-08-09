import React, { useState, useEffect, useCallback } from 'react';
import type { AdminDeposit, DepositsResponse } from '../lib/api';
import { getDeposits, createDeposit, cancelDeposit } from '../lib/api';
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
      setSuccess(`Created: ${d.tx_number} — ${d.amount.toFixed(2)} ETB`);
      setTxNumber(''); setAmount('');
      onCreated();
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      setError(e.code === 'DUPLICATE_TX_NUMBER' ? 'That transaction number already exists.' : (e.message ?? 'Failed to create deposit.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card style={{ marginBottom: 24 }}>
      <CardHeader title="Add Deposit" subtitle="Manually register a Telebirr transaction for player claim" />
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr)) auto', gap: 12, alignItems: 'flex-end' }}>
          <Field label="Transaction Number">
            <input style={inputCss} type="text" placeholder="e.g. DH87MNVFCT" value={txNumber} onChange={(e) => setTxNumber(e.target.value)} disabled={submitting} />
          </Field>
          <Field label="Amount (ETB)">
            <input style={inputCss} type="number" min="1" step="0.01" placeholder="e.g. 150" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={submitting} />
          </Field>
          <div style={{ paddingBottom: 0 }}>
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
    if (!window.confirm(`Cancel deposit ${d?.tx_number ?? id}? This cannot be undone.`)) return;
    setCancellingId(id); setActionMsg(null);
    try {
      await cancelDeposit(id);
      setActionMsg({ type: 'success', text: 'Deposit cancelled.' });
      await fetchDeposits();
    } catch (err: unknown) {
      setActionMsg({ type: 'error', text: (err as Error).message ?? 'Failed to cancel deposit' });
    } finally { setCancellingId(null); }
  }

  const summary = data?.summary;

  return (
    <div className="fade-in">
      <PageHeader
        title="Deposits"
        action={<Btn variant="ghost" size="sm" onClick={fetchDeposits} disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh'}</Btn>}
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard icon="⏳" label="Pending" value={summary?.pending ?? '—'} color={C.warning} />
        <StatCard icon="✅" label="Claimed" value={summary?.claimed ?? '—'} color={C.success} />
        <StatCard icon="✕" label="Cancelled" value={summary?.cancelled ?? '—'} color={C.muted} />
      </div>

      {actionMsg && <Alert type={actionMsg.type}>{actionMsg.text}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <AddDepositForm onCreated={fetchDeposits} />

      <Card>
        <CardHeader title="All Deposits" />
        <Table>
          <thead>
            <tr>
              <Th>Tx Number</Th>
              <Th>Amount (ETB)</Th>
              <Th>Status</Th>
              <Th>Player</Th>
              <Th>Created</Th>
              <Th>Claimed At</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? <TrLoading cols={7} /> :
             !data?.items.length ? <TrEmpty cols={7} message="No deposits found." /> :
             data.items.map((d) => (
              <tr key={d.id}>
                <Td mono>{d.tx_number}</Td>
                <Td><span style={{ fontWeight: 700, color: C.text }}>{d.amount.toFixed(2)}</span></Td>
                <Td><Badge variant={statusVariant(d.status)}>{d.status}</Badge></Td>
                <Td muted={!d.player_username}>{d.player_username ? `@${d.player_username}` : '—'}</Td>
                <Td muted>{new Date(d.created_at).toLocaleString()}</Td>
                <Td muted>{d.claimed_at ? new Date(d.claimed_at).toLocaleString() : '—'}</Td>
                <Td>
                  {d.status === 'pending' && (
                    <Btn size="sm" variant="danger" onClick={() => handleCancel(d.id)} disabled={cancellingId === d.id}>
                      {cancellingId === d.id ? '…' : 'Cancel'}
                    </Btn>
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
