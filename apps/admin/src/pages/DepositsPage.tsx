import React, { useState, useEffect, useCallback } from 'react';
import type { AdminDeposit, DepositsResponse, DepositAttempt } from '../lib/api';
import { getDeposits, createDeposit, cancelDeposit, approveDeposit, getDepositAttempts } from '../lib/api';
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

function outcomeColor(o: DepositAttempt['outcome']): string {
  if (o === 'success') return 'var(--c-success)';
  if (o === 'pending_approval') return 'var(--c-warning)';
  return 'var(--c-danger, #e74c3c)';
}

function AttemptsDrawer({ deposit, onClose }: { deposit: AdminDeposit; onClose: () => void }) {
  const [attempts, setAttempts] = useState<DepositAttempt[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSms, setExpandedSms] = useState<string | null>(null);

  useEffect(() => {
    void getDepositAttempts(deposit.id).then((data) => {
      setAttempts(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [deposit.id]);

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
    display: 'flex', justifyContent: 'flex-end',
  };
  const panelStyle: React.CSSProperties = {
    background: 'var(--c-card)', width: 'min(620px, 100vw)', height: '100%',
    overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Audit Trail</div>
            <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 2 }}>
              {deposit.tx_number} · {Number(deposit.amount).toFixed(2)} ETB
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--c-muted)' }}>✕</button>
        </div>

        {loading && <div style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</div>}
        {!loading && attempts?.length === 0 && (
          <div style={{ color: 'var(--c-muted)', fontSize: 13 }}>No attempts recorded for this deposit.</div>
        )}
        {attempts?.map((a) => (
          <div key={a.id} style={{ border: '1px solid var(--c-border)', borderRadius: 8, padding: 14, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: outcomeColor(a.outcome), textTransform: 'uppercase', fontSize: 11, letterSpacing: 1 }}>
                {a.outcome.replace('_', ' ')}
              </span>
              <span style={{ color: 'var(--c-muted)', fontSize: 11 }}>{new Date(a.created_at).toLocaleString()}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', color: 'var(--c-text)' }}>
              {a.player_username && <div><span style={{ color: 'var(--c-muted)' }}>Player: </span>@{a.player_username}</div>}
              {a.tx_number_parsed && <div><span style={{ color: 'var(--c-muted)' }}>TX Parsed: </span>{a.tx_number_parsed}</div>}
              {a.failure_reason && <div><span style={{ color: 'var(--c-muted)' }}>Reason: </span>{a.failure_reason}</div>}
              {a.amount_expected != null && <div><span style={{ color: 'var(--c-muted)' }}>Expected: </span>{a.amount_expected} ETB</div>}
              {a.amount_parsed != null && <div><span style={{ color: 'var(--c-muted)' }}>Parsed: </span>{a.amount_parsed} ETB</div>}
              <div><span style={{ color: 'var(--c-muted)' }}>Source: </span>{a.source}</div>
            </div>
            {a.raw_sms && (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => setExpandedSms(expandedSms === a.id ? null : a.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-primary)', fontSize: 12, padding: 0 }}
                >
                  {expandedSms === a.id ? '▲ Hide SMS' : '▼ Show raw SMS'}
                </button>
                {expandedSms === a.id && (
                  <pre style={{ marginTop: 6, padding: 10, background: 'var(--c-bg)', borderRadius: 6, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--c-muted)' }}>
                    {a.raw_sms}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DepositsPage() {
  const [data, setData] = useState<DepositsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [selectedDeposit, setSelectedDeposit] = useState<AdminDeposit | null>(null);

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
      {selectedDeposit && <AttemptsDrawer deposit={selectedDeposit} onClose={() => setSelectedDeposit(null)} />}
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
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    {d.status === 'pending' && d.player_username && (
                      <Btn size="sm" variant="primary" onClick={() => handleApprove(d.id)} disabled={approvingId === d.id}>
                        {approvingId === d.id ? '…' : '✓ Approve'}
                      </Btn>
                    )}
                    {d.status === 'pending' && (
                      <Btn size="sm" variant="danger" onClick={() => handleCancel(d.id)} disabled={cancellingId === d.id}>
                        {cancellingId === d.id ? '…' : 'Cancel'}
                      </Btn>
                    )}
                    <Btn size="sm" variant="ghost" onClick={() => setSelectedDeposit(d)}>
                      🔍 Audit
                    </Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
