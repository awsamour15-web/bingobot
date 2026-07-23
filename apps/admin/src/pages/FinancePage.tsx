import React, { useState, useEffect, useCallback } from 'react';
import type { WithdrawalRequest, RevenueStats } from '@beteseb/shared';
import { getWithdrawals, approveWithdrawal, rejectWithdrawal, getRevenue } from '../lib/api';

// ---------------------------------------------------------------------------
// Colour tokens
// ---------------------------------------------------------------------------
const C = {
  primary: '#4f46e5',
  danger: '#dc2626',
  success: '#16a34a',
  bg: '#f9fafb',
  border: '#e5e7eb',
  text: '#111827',
  muted: '#6b7280',
};

// ---------------------------------------------------------------------------
// Shared components
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
  const style: React.CSSProperties = {
    background: bg[variant],
    color: color[variant],
    border: `1px solid ${border[variant]}`,
    borderRadius: 6,
    padding: small ? '4px 12px' : '8px 18px',
    fontSize: small ? 12 : 14,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
  return (
    <button style={style} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Revenue Summary section
// ---------------------------------------------------------------------------

function RevenueSummary() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(
    async (start?: string, end?: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await getRevenue(start || undefined, end || undefined);
        setStats(data);
      } catch (e: unknown) {
        const err = e as Error;
        setError(err.message ?? 'Failed to load revenue stats');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Load on mount with no filter
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  function handleFetch() {
    fetchStats(startDate || undefined, endDate || undefined);
  }

  const sectionStyle: React.CSSProperties = {
    background: '#fff',
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: 24,
    marginBottom: 28,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 700,
    color: C.text,
    margin: 0,
    marginBottom: 20,
  };

  const filterRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 24,
  };

  const inputStyle: React.CSSProperties = {
    padding: '7px 12px',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    fontSize: 14,
    color: C.text,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: C.muted,
    fontWeight: 600,
  };

  const cardsRowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 16,
  };

  const cardStyle: React.CSSProperties = {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: '16px 20px',
  };

  const cardLabelStyle: React.CSSProperties = {
    fontSize: 11,
    color: C.muted,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 6,
  };

  const cardValueStyle: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 700,
    color: C.text,
  };

  const msgStyle = (type: 'error' | 'success'): React.CSSProperties => ({
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 16,
    background: type === 'error' ? '#fee2e2' : '#dcfce7',
    color: type === 'error' ? C.danger : C.success,
    border: `1px solid ${type === 'error' ? '#fca5a5' : '#86efac'}`,
  });

  return (
    <div style={sectionStyle}>
      <h2 style={titleStyle}>Revenue Summary</h2>

      <div style={filterRowStyle}>
        <label style={labelStyle}>From:</label>
        <input
          type="date"
          style={inputStyle}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <label style={labelStyle}>To:</label>
        <input
          type="date"
          style={inputStyle}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
        <Btn onClick={handleFetch} disabled={loading}>
          {loading ? 'Loading…' : 'Fetch'}
        </Btn>
      </div>

      {error && <div style={msgStyle('error')}>{error}</div>}

      {stats && !loading && (
        <div style={cardsRowStyle}>
          <div style={cardStyle}>
            <div style={cardLabelStyle}>Total Stakes</div>
            <div style={{ ...cardValueStyle, color: C.primary }}>
              {stats.totalStakesCollected.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>ETB</div>
          </div>
          <div style={cardStyle}>
            <div style={cardLabelStyle}>Prizes Paid</div>
            <div style={{ ...cardValueStyle, color: C.danger }}>
              {stats.totalPrizesPaid.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>ETB</div>
          </div>
          <div style={cardStyle}>
            <div style={cardLabelStyle}>Commission Earned</div>
            <div style={{ ...cardValueStyle, color: C.success }}>
              {stats.platformCommissionEarned.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>ETB</div>
          </div>
        </div>
      )}

      {loading && (
        <p style={{ color: C.muted, fontSize: 14 }}>Loading stats…</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pending Withdrawals section
// ---------------------------------------------------------------------------

function PendingWithdrawals() {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const fetchWithdrawals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWithdrawals();
      setWithdrawals(data);
    } catch (e: unknown) {
      const err = e as Error;
      setError(err.message ?? 'Failed to load withdrawals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  async function handleApprove(w: WithdrawalRequest) {
    const confirmed = window.confirm(
      `Approve withdrawal of ${w.amount.toFixed(2)} ETB for @${w.username}?`,
    );
    if (!confirmed) return;

    setActioningId(w.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await approveWithdrawal(w.id);
      setActionSuccess(`Withdrawal for @${w.username} approved.`);
      await fetchWithdrawals();
    } catch (e: unknown) {
      const err = e as Error;
      setActionError(err.message ?? 'Failed to approve withdrawal');
    } finally {
      setActioningId(null);
    }
  }

  async function handleReject(w: WithdrawalRequest) {
    const confirmed = window.confirm(
      `Reject withdrawal of ${w.amount.toFixed(2)} ETB for @${w.username}?`,
    );
    if (!confirmed) return;

    setActioningId(w.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await rejectWithdrawal(w.id);
      setActionSuccess(`Withdrawal for @${w.username} rejected.`);
      await fetchWithdrawals();
    } catch (e: unknown) {
      const err = e as Error;
      setActionError(err.message ?? 'Failed to reject withdrawal');
    } finally {
      setActioningId(null);
    }
  }

  const sectionStyle: React.CSSProperties = {
    background: '#fff',
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: 24,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 700,
    color: C.text,
    margin: 0,
    marginBottom: 20,
  };

  const tableContainerStyle: React.CSSProperties = {
    overflowX: 'auto',
    border: `1px solid ${C.border}`,
    borderRadius: 8,
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  };

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
  };

  const msgStyle = (type: 'error' | 'success'): React.CSSProperties => ({
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 16,
    background: type === 'error' ? '#fee2e2' : '#dcfce7',
    color: type === 'error' ? C.danger : C.success,
    border: `1px solid ${type === 'error' ? '#fca5a5' : '#86efac'}`,
  });

  const pending = withdrawals.filter((w) => w.status === 'pending');

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={titleStyle}>Pending Withdrawals</h2>
        <Btn small variant="ghost" onClick={fetchWithdrawals} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Btn>
      </div>

      {actionError && <div style={msgStyle('error')}>{actionError}</div>}
      {actionSuccess && <div style={msgStyle('success')}>{actionSuccess}</div>}
      {error && <div style={msgStyle('error')}>{error}</div>}

      <div style={tableContainerStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Username</th>
              <th style={thStyle}>Phone</th>
              <th style={thStyle}>Amount (ETB)</th>
              <th style={thStyle}>Requested At</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: 32 }}>
                  Loading…
                </td>
              </tr>
            ) : pending.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: 32 }}>
                  No pending withdrawals.
                </td>
              </tr>
            ) : (
              pending.map((w) => (
                <tr key={w.id}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>@{w.username}</td>
                  <td style={tdStyle}>{w.phone}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: C.danger }}>
                    {w.amount.toFixed(2)}
                  </td>
                  <td style={{ ...tdStyle, color: C.muted, fontSize: 12, whiteSpace: 'nowrap' }}>
                    {new Date(w.created_at).toLocaleString()}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn
                        small
                        variant="success"
                        onClick={() => handleApprove(w)}
                        disabled={actioningId === w.id}
                      >
                        {actioningId === w.id ? '…' : 'Approve'}
                      </Btn>
                      <Btn
                        small
                        variant="danger"
                        onClick={() => handleReject(w)}
                        disabled={actioningId === w.id}
                      >
                        {actioningId === w.id ? '…' : 'Reject'}
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function FinancePage() {
  const pageStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  };

  const headingStyle: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 700,
    color: C.text,
    margin: 0,
    marginBottom: 24,
  };

  return (
    <div style={pageStyle}>
      <h1 style={headingStyle}>Finance</h1>
      <RevenueSummary />
      <PendingWithdrawals />
    </div>
  );
}
