import React, { useState, useEffect, useCallback } from 'react';
import type { AdminDeposit, DepositsResponse } from '../lib/api';
import { getDeposits, createDeposit, cancelDeposit } from '../lib/api';

// ---------------------------------------------------------------------------
// Colour tokens (match rest of admin UI)
// ---------------------------------------------------------------------------
const C = {
  primary: '#4f46e5',
  danger: '#dc2626',
  success: '#16a34a',
  warning: '#d97706',
  bg: '#f9fafb',
  border: '#e5e7eb',
  text: '#111827',
  muted: '#6b7280',
};

// ---------------------------------------------------------------------------
// Shared button
// ---------------------------------------------------------------------------

function Btn({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  small = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'danger' | 'success' | 'ghost';
  disabled?: boolean;
  small?: boolean;
}) {
  const bg: Record<string, string> = {
    primary: C.primary,
    danger: C.danger,
    success: C.success,
    ghost: 'transparent',
  };
  const color: Record<string, string> = {
    primary: '#fff',
    danger: '#fff',
    success: '#fff',
    ghost: C.primary,
  };
  const border: Record<string, string> = {
    primary: C.primary,
    danger: C.danger,
    success: C.success,
    ghost: C.primary,
  };
  return (
    <button
      style={{
        background: bg[variant],
        color: color[variant],
        border: `1px solid ${border[variant]}`,
        borderRadius: 6,
        padding: small ? '4px 12px' : '8px 18px',
        fontSize: small ? 12 : 14,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function msgStyle(type: 'error' | 'success'): React.CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 16,
    background: type === 'error' ? '#fee2e2' : '#dcfce7',
    color: type === 'error' ? C.danger : C.success,
    border: `1px solid ${type === 'error' ? '#fca5a5' : '#86efac'}`,
  };
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AdminDeposit['status'] }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: '#fef3c7', color: C.warning, label: 'Pending' },
    claimed: { bg: '#dcfce7', color: C.success, label: 'Claimed' },
    cancelled: { bg: '#f3f4f6', color: C.muted, label: 'Cancelled' },
  };
  const fallback = { bg: '#fef3c7', color: C.warning, label: 'Pending' };
  const s = cfg[status] ?? fallback;
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.color}33`,
        borderRadius: 12,
        padding: '2px 10px',
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Summary row
// ---------------------------------------------------------------------------

function SummaryRow({ summary }: { summary: DepositsResponse['summary'] }) {
  const cards = [
    { label: 'Pending', value: summary.pending, color: C.warning },
    { label: 'Claimed', value: summary.claimed, color: C.success },
    { label: 'Cancelled', value: summary.cancelled, color: C.muted },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16,
        marginBottom: 28,
      }}
    >
      {cards.map(({ label, value, color }) => (
        <div
          key={label}
          style={{
            background: '#fff',
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: '16px 20px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: C.muted,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: 6,
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Deposit form
// ---------------------------------------------------------------------------

function AddDepositForm({ onCreated }: { onCreated: () => void }) {
  const [txNumber, setTxNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const parsedAmount = parseFloat(amount);
    if (!txNumber.trim()) {
      setError('Transaction number is required.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be a positive number.');
      return;
    }

    setSubmitting(true);
    try {
      const deposit = await createDeposit(txNumber.trim(), parsedAmount);
      setSuccess(`Deposit created: ${deposit.tx_number} — ${deposit.amount.toFixed(2)} ETB`);
      setTxNumber('');
      setAmount('');
      onCreated();
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'DUPLICATE_TX_NUMBER') {
        setError('That transaction number already exists. Please use a different one.');
      } else {
        setError(e.message ?? 'Failed to create deposit.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    fontSize: 14,
    color: C.text,
    minWidth: 180,
  };

  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: 24,
        marginBottom: 28,
      }}
    >
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: C.text,
          margin: 0,
          marginBottom: 16,
        }}
      >
        Add Deposit
      </h2>

      {error && <div style={msgStyle('error')}>{error}</div>}
      {success && <div style={msgStyle('success')}>{success}</div>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Transaction Number</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="e.g. TXN123456"
            value={txNumber}
            onChange={(e) => setTxNumber(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Amount (ETB)</label>
          <input
            style={inputStyle}
            type="number"
            min="0.01"
            step="0.01"
            placeholder="e.g. 100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={submitting}
          />
        </div>
        <Btn disabled={submitting}>
          {submitting ? 'Creating…' : 'Add Deposit'}
        </Btn>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deposits table
// ---------------------------------------------------------------------------

function DepositsTable({
  items,
  loading,
  onCancel,
  cancellingId,
}: {
  items: AdminDeposit[];
  loading: boolean;
  onCancel: (id: string) => void;
  cancellingId: string | null;
}) {
  const thStyle: React.CSSProperties = {
    padding: '10px 14px',
    background: C.bg,
    color: C.muted,
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    textAlign: 'left',
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: 'nowrap',
  };

  const tdStyle: React.CSSProperties = {
    padding: '10px 14px',
    borderBottom: `1px solid ${C.border}`,
    color: C.text,
    verticalAlign: 'middle',
    fontSize: 13,
  };

  return (
    <div
      style={{
        overflowX: 'auto',
        border: `1px solid ${C.border}`,
        borderRadius: 8,
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={thStyle}>Tx Number</th>
            <th style={thStyle}>Amount (ETB)</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Player</th>
            <th style={thStyle}>Created At</th>
            <th style={thStyle}>Claimed At</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: 32 }}>
                Loading…
              </td>
            </tr>
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: 32 }}>
                No deposits found.
              </td>
            </tr>
          ) : (
            items.map((d) => (
              <tr key={d.id}>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600 }}>{d.tx_number}</td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{d.amount.toFixed(2)}</td>
                <td style={tdStyle}>
                  <StatusBadge status={d.status} />
                </td>
                <td style={{ ...tdStyle, color: d.player_username ? C.text : C.muted }}>
                  {d.player_username ? `@${d.player_username}` : '—'}
                </td>
                <td style={{ ...tdStyle, color: C.muted, whiteSpace: 'nowrap' }}>
                  {new Date(d.created_at).toLocaleString()}
                </td>
                <td style={{ ...tdStyle, color: C.muted, whiteSpace: 'nowrap' }}>
                  {d.claimed_at ? new Date(d.claimed_at).toLocaleString() : '—'}
                </td>
                <td style={tdStyle}>
                  {d.status === 'pending' && (
                    <Btn
                      small
                      variant="danger"
                      onClick={() => onCancel(d.id)}
                      disabled={cancellingId === d.id}
                    >
                      {cancellingId === d.id ? '…' : 'Cancel'}
                    </Btn>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function DepositsPage() {
  const [data, setData] = useState<DepositsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchDeposits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getDeposits();
      setData(result);
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message ?? 'Failed to load deposits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeposits();
  }, [fetchDeposits]);

  async function handleCancel(id: string) {
    const deposit = data?.items.find((d) => d.id === id);
    const confirmed = window.confirm(
      `Cancel deposit ${deposit?.tx_number ?? id}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setCancellingId(id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await cancelDeposit(id);
      setActionSuccess('Deposit cancelled successfully.');
      await fetchDeposits();
    } catch (err: unknown) {
      const e = err as Error;
      setActionError(e.message ?? 'Failed to cancel deposit');
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Deposits</h1>
        <Btn small variant="ghost" onClick={fetchDeposits} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Btn>
      </div>

      {actionError && <div style={msgStyle('error')}>{actionError}</div>}
      {actionSuccess && <div style={msgStyle('success')}>{actionSuccess}</div>}
      {error && <div style={msgStyle('error')}>{error}</div>}

      {data && <SummaryRow summary={data.summary} />}

      <AddDepositForm onCreated={fetchDeposits} />

      <div
        style={{
          background: '#fff',
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0, marginBottom: 16 }}>
          All Deposits
        </h2>
        <DepositsTable
          items={data?.items ?? []}
          loading={loading && !data}
          onCancel={handleCancel}
          cancellingId={cancellingId}
        />
      </div>
    </div>
  );
}
