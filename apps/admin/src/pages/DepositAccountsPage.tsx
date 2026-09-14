import React, { useState, useEffect, useCallback } from 'react';
import {
  getDepositAccounts,
  createDepositAccount,
  updateDepositAccount,
  deleteDepositAccount,
  type DepositAccount,
} from '../lib/api';
import {
  C, Btn, Badge, Card, CardHeader, Table, Th, Td,
  TrEmpty, TrLoading, Alert, Field, PageHeader, inputCss,
} from '../components/ui';

// ── Supported banks list ──────────────────────────────────────────────────────
const BANKS = [
  { value: 'telebirr',  label: '📱 Telebirr'  },
  { value: 'cbebirr',   label: '📱 CBE Birr'  },
  { value: 'cbe',       label: '🏦 CBE'       },
  { value: 'boa',       label: '🏦 BOA'       },
  { value: 'dashen',    label: '🏦 Dashen'    },
  { value: 'awash',     label: '🏦 Awash'     },
  { value: 'mpesa',     label: '📱 M-Pesa'    },
  { value: 'other',     label: '🏦 Other'     },
];

function bankLabel(value: string): string {
  return BANKS.find(b => b.value === value)?.label ?? value;
}

const selectCss: React.CSSProperties = {
  ...inputCss as React.CSSProperties,
  cursor: 'pointer',
};

// ── Add / Edit form ───────────────────────────────────────────────────────────
function AccountForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: DepositAccount;
  onSave: () => void;
  onCancel?: () => void;
}) {
  const isEdit = !!initial;
  const [phone, setPhone]     = useState(initial?.phone ?? '');
  const [name, setName]       = useState(initial?.name ?? '');
  const [bank, setBank]       = useState(initial?.bank ?? 'telebirr');
  const [submitting, setSub]  = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (!bank)         { setError('Please select a bank.'); return; }
    if (!phone.trim()) { setError('Phone / account number is required.'); return; }
    if (!name.trim())  { setError('Account name is required.'); return; }
    setSub(true);
    try {
      if (isEdit) {
        await updateDepositAccount(initial!.id, { phone: phone.trim(), name: name.trim(), bank });
        setSuccess('Account updated.');
      } else {
        await createDepositAccount(phone.trim(), name.trim(), bank);
        setSuccess('Account added.');
        setPhone(''); setName(''); setBank('telebirr');
      }
      onSave();
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      setError(e.code === 'DUPLICATE_PHONE'
        ? 'That phone / account number already exists.'
        : (e.message ?? 'Failed to save account.'));
    } finally { setSub(false); }
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader
        title={isEdit ? 'Edit Account' : 'Add Deposit Account'}
        subtitle={isEdit
          ? 'Update bank, phone number, or display name'
          : 'Add an account players can send deposits to'}
      />
      {error   && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, alignItems: 'flex-end' }}>

          <Field label="Bank *">
            <select
              style={selectCss}
              value={bank}
              onChange={e => setBank(e.target.value)}
              disabled={submitting}
            >
              <option value="">— Select bank —</option>
              {BANKS.map(b => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Phone / Account Number *">
            <input
              style={inputCss}
              type="text"
              placeholder={bank === 'cbe' ? 'e.g. 1000XXXXXXXX' : 'e.g. 0912345678'}
              value={phone}
              onChange={e => setPhone(e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field label="Display Name *">
            <input
              style={inputCss}
              type="text"
              placeholder="e.g. Almaz Telebirr"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={submitting}
            />
          </Field>

          <div style={{ display: 'flex', gap: 8 }}>
            <Btn type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Account'}
            </Btn>
            {onCancel && (
              <Btn variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Btn>
            )}
          </div>
        </div>
      </form>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function DepositAccountsPage() {
  const [accounts, setAccounts]     = useState<DepositAccount[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg]   = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true); setError(null);
    try { setAccounts(await getDepositAccounts()); }
    catch (err: unknown) { setError((err as Error).message ?? 'Failed to load accounts'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchAccounts(); }, [fetchAccounts]);

  async function handleToggleActive(acc: DepositAccount) {
    setTogglingId(acc.id); setActionMsg(null);
    try {
      await updateDepositAccount(acc.id, { is_active: !acc.is_active });
      setActionMsg({ type: 'success', text: `Account ${!acc.is_active ? 'activated' : 'deactivated'}.` });
      await fetchAccounts();
    } catch (err: unknown) {
      setActionMsg({ type: 'error', text: (err as Error).message ?? 'Failed to update' });
    } finally { setTogglingId(null); }
  }

  async function handleDelete(acc: DepositAccount) {
    if (!window.confirm(`Delete "${acc.name}" (${acc.phone})? This cannot be undone.`)) return;
    setDeletingId(acc.id); setActionMsg(null);
    try {
      await deleteDepositAccount(acc.id);
      setActionMsg({ type: 'success', text: 'Account deleted.' });
      await fetchAccounts();
    } catch (err: unknown) {
      setActionMsg({ type: 'error', text: (err as Error).message ?? 'Failed to delete' });
    } finally { setDeletingId(null); }
  }

  const active   = accounts.filter(a => a.is_active).length;
  const inactive = accounts.filter(a => !a.is_active).length;

  return (
    <div className="fade-in">
      <PageHeader
        title="Deposit Accounts"
        action={
          <Btn variant="ghost" size="sm" onClick={fetchAccounts} disabled={loading}>
            ↻ Refresh
          </Btn>
        }
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { icon: '💳', label: 'Total',    value: accounts.length, color: C.primary },
          { icon: '✅', label: 'Active',   value: active,          color: C.success },
          { icon: '⏸',  label: 'Inactive', value: inactive,        color: C.muted   },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--c-card)', border: '1px solid var(--c-border)',
            borderRadius: 12, padding: '16px 18px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 24 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {actionMsg && <Alert type={actionMsg.type}>{actionMsg.text}</Alert>}
      {error     && <Alert type="error">{error}</Alert>}

      {/* Info */}
      <div style={{
        background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: 12, padding: '13px 16px', marginBottom: 20,
        fontSize: 13, color: 'var(--c-text-secondary)', lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--c-text)' }}>Supported banks:</strong>{' '}
        {BANKS.map(b => b.label).join(' · ')}<br />
        When multiple accounts are active, one is chosen at random per deposit session.
      </div>

      {/* Add form — hidden when editing an existing row */}
      {editingId === null && (
        <AccountForm onSave={fetchAccounts} />
      )}

      {/* Table */}
      <Card>
        <CardHeader
          title="Configured Accounts"
          subtitle="Players see active accounts on the deposit screen and in the bot"
          action={<span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{accounts.length} total</span>}
        />
        <Table>
          <thead>
            <tr>
              <Th>Bank</Th>
              <Th>Phone / Account</Th>
              <Th>Display Name</Th>
              <Th>Status</Th>
              <Th>Added</Th>
              <Th right>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !accounts.length ? (
              <TrLoading cols={6} />
            ) : !accounts.length ? (
              <TrEmpty cols={6} message="No deposit accounts yet. Add one above." />
            ) : accounts.map(acc => (
              <React.Fragment key={acc.id}>
                <tr>
                  <Td>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                      background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                      fontSize: 12, fontWeight: 700, color: 'var(--c-primary)',
                    }}>
                      {bankLabel(acc.bank)}
                    </span>
                  </Td>
                  <Td style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 14 }}>{acc.phone}</Td>
                  <Td>{acc.name}</Td>
                  <Td>
                    <Badge variant={acc.is_active ? 'success' : 'neutral'}>
                      {acc.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </Td>
                  <Td muted>{new Date(acc.created_at).toLocaleDateString()}</Td>
                  <Td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <Btn
                        size="sm"
                        variant={acc.is_active ? 'ghost' : 'primary'}
                        onClick={() => handleToggleActive(acc)}
                        disabled={togglingId === acc.id}
                      >
                        {togglingId === acc.id ? '…' : acc.is_active ? 'Deactivate' : 'Activate'}
                      </Btn>
                      <Btn size="sm" variant="ghost" onClick={() => setEditingId(acc.id)}>
                        ✏️ Edit
                      </Btn>
                      <Btn
                        size="sm"
                        variant="danger"
                        onClick={() => handleDelete(acc)}
                        disabled={deletingId === acc.id}
                      >
                        {deletingId === acc.id ? '…' : 'Delete'}
                      </Btn>
                    </div>
                  </Td>
                </tr>

                {/* Inline edit row */}
                {editingId === acc.id && (
                  <tr>
                    <td colSpan={6} style={{ padding: '0 0 12px' }}>
                      <div style={{ padding: '0 4px' }}>
                        <AccountForm
                          initial={acc}
                          onSave={() => { setEditingId(null); void fetchAccounts(); }}
                          onCancel={() => setEditingId(null)}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
