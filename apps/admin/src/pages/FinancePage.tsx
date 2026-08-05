import React, { useState, useEffect, useCallback } from 'react';
import type { WithdrawalRequest, RevenueStats } from '@beteseb/shared';
import { getWithdrawals, approveWithdrawal, rejectWithdrawal, getRevenue } from '../lib/api';

const C = {
  primary: '#4f46e5',
  danger: '#dc2626',
  success: '#16a34a',
  bg: '#f9fafb',
  border: '#e5e7eb',
  text: '#111827',
  muted: '#6b7280',
};

const responsiveStyles = `
  .finance-filter-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 24px;
  }
  .finance-stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
  }
  .finance-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 8px;
  }
  @media (max-width: 480px) {
    .finance-filter-row {
      flex-direction: column;
      align-items: stretch;
    }
    .finance-stats-grid {
      grid-template-columns: 1fr;
    }
  }
`;

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
  const bg: Record<string, string> = { primary: C.primary, danger: C.danger, success: C.success, ghost: 'transparent' };
  const color: Record<string, string> = { primary: '#fff', danger: '#fff', success: '#fff', ghost: C.primary };
  const border: Record<string, string> = { primary: C.primary, danger: C.danger, success: C.success, ghost: C.primary };
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
        whiteSpace: 'nowrap',
      }}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

const msgStyle = (type: 'error' | 'success'): React.CSSProperties => ({
  padding: '8px 14px',
  borderRadius: 6,
  fontSize: 13,
  marginBottom: 16,
  background: type === 'error' ? '#fee2e2' : '#dcfce7',
  color: type === 'error' ? C.danger : C.success,
  border: `1px solid ${type === 'error' ? '#fca5a5' : '#86efac'}`,
});

function RevenueSummary() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async (start?: string, end?: string) => {
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
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const inputStyle: React.CSSProperties = {
    padding: '7px 12px',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    fontSize: 14,
    color: C.text,
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, marginBottom: 28 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0, marginBottom: 20 }}>Revenue Summary</h2>

      <div className="finance-filter-row">
        <label style={{ fontSize: 13, color: C.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>From:</label>
        <input type="date" style={inputStyle} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <label style={{ fontSize: 13, color: C.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>To:</label>
        <input type="date" style={inputStyle} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <Btn onClick={() => fetchStats(startDate || undefined, endDate || undefined)} disabled={loading}>
          {loading ? 'Loading…' : 'Fetch'}
        </Btn>
      </div>

      {error && <div style={msgStyle('error')}>{error}</div>}

      {stats && !loading && (
        <div className="finance-stats-grid">
          {[
            { label: 'Total Stakes', value: stats.totalStakesCollected, color: C.primary, unit: 'ETB' },
            { label: 'Prizes Paid', value: stats.totalPrizesPaid, color: C.danger, unit: 'ETB' },
            { label: 'Commission Earned', value: stats.platformCommissionEarned, color: C.success, unit: 'ETB' },
          ].map(({ label, value, color, unit }) => (
            <div key={label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color }}>{value.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{unit}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <p style={{ color: C.muted, fontSize: 14 }}>Loading stats…</p>}
    </div>
  );
}

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

  useEffect(() => { fetchWithdrawals(); }, [fetchWithdrawals]);

  async function handleApprove(w: WithdrawalRequest) {
    if (!window.confirm(`Approve withdrawal of ${w.amount.toFixed(2)} ETB for @${w.username}?`)) return;
    setActioningId(w.id); setActionError(null); setActionSuccess(null);
    try {
      await approveWithdrawal(w.id);
      setActionSuccess(`Withdrawal for @${w.username} approved.`);
      await fetchWithdrawals();
    } catch (e: unknown) {
      setActionError((e as Error).message ?? 'Failed to approve withdrawal');
    } finally {
      setActioningId(null);
    }
  }

  async function handleReject(w: WithdrawalRequest) {
    if (!window.confirm(`Reject withdrawal of ${w.amount.toFixed(2)} ETB for @${w.username}?`)) return;
    setActioningId(w.id); setActionError(null); setActionSuccess(null);
    try {
      await rejectWithdrawal(w.id);
      setActionSuccess(`Withdrawal for @${w.username} rejected.`);
      await fetchWithdrawals();
    } catch (e: unknown) {
      setActionError((e as Error).message ?? 'Failed to reject withdrawal');
    } finally {
      setActioningId(null);
    }
  }

  const thStyle: React.CSSProperties = {
    padding: '10px 14px', background: C.bg, color: C.muted, fontWeight: 600,
    fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
    textAlign: 'left', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '10px 14px', borderBottom: `1px solid ${C.border}`, color: C.text, verticalAlign: 'middle',
  };
  const pending = withdrawals.filter((w) => w.status === 'pending');

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: 24 }}>
      <div className="finance-section-header">
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>Pending Withdrawals</h2>
        <Btn small variant="ghost" onClick={fetchWithdrawals} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Btn>
      </div>

      {actionError && <div style={msgStyle('error')}>{actionError}</div>}
      {actionSuccess && <div style={msgStyle('success')}>{actionSuccess}</div>}
      {error && <div style={msgStyle('error')}>{error}</div>}

      <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 500 }}>
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
              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: 32 }}>Loading…</td></tr>
            ) : pending.length === 0 ? (
              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: 32 }}>No pending withdrawals.</td></tr>
            ) : (
              pending.map((w) => (
                <tr key={w.id}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>@{w.username}</td>
                  <td style={tdStyle}>{w.phone}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: C.danger }}>{w.amount.toFixed(2)}</td>
                  <td style={{ ...tdStyle, color: C.muted, fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(w.created_at).toLocaleString()}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Btn small variant="success" onClick={() => handleApprove(w)} disabled={actioningId === w.id}>
                        {actioningId === w.id ? '…' : 'Approve'}
                      </Btn>
                      <Btn small variant="danger" onClick={() => handleReject(w)} disabled={actioningId === w.id}>
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

export function FinancePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <style>{responsiveStyles}</style>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, marginBottom: 24 }}>Finance</h1>
      <RevenueSummary />
      <PendingWithdrawals />
    </div>
  );
}
