import React, { useState, useEffect, useCallback } from 'react';
import type { AdminRound, CreateRoundRequest, GameStatus } from '@beteseb/shared';
import { getAdminRounds, createRound, startRound, cancelRound } from '../lib/api';

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
// Shared button
// ---------------------------------------------------------------------------
interface BtnProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'danger' | 'success' | 'ghost';
  disabled?: boolean;
  small?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

function Btn({ children, onClick, variant = 'primary', disabled = false, small = false, type = 'button' }: BtnProps) {
  const bg: Record<string, string> = { primary: C.primary, danger: C.danger, success: C.success, ghost: 'transparent' };
  const color: Record<string, string> = { primary: '#fff', danger: '#fff', success: '#fff', ghost: C.primary };
  const bdr: Record<string, string> = { primary: C.primary, danger: C.danger, success: C.success, ghost: C.primary };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: bg[variant],
        color: color[variant],
        border: `1px solid ${bdr[variant]}`,
        borderRadius: 6,
        padding: small ? '4px 12px' : '8px 18px',
        fontSize: small ? 12 : 14,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: GameStatus }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pending:   { bg: '#fef9c3', color: '#92400e', label: 'Pending' },
    active:    { bg: '#dcfce7', color: C.success,  label: 'Active' },
    completed: { bg: '#dbeafe', color: '#1e40af', label: 'Completed' },
    cancelled: { bg: '#fee2e2', color: C.danger,   label: 'Cancelled' },
    void:      { bg: '#f3f4f6', color: C.muted,    label: 'Void' },
  };
  const entry = map[status] ?? map['void'];
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      fontSize: 12, fontWeight: 600, background: entry.bg, color: entry.color,
    }}>
      {entry.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Shared table styles
// ---------------------------------------------------------------------------
const thStyle: React.CSSProperties = {
  padding: '10px 14px', background: C.bg, color: C.muted, fontWeight: 600,
  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
  textAlign: 'left', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '10px 14px', borderBottom: `1px solid ${C.border}`, color: C.text, verticalAlign: 'middle',
};
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const tableWrapStyle: React.CSSProperties = { overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 };

const msgStyle = (t: 'error' | 'success'): React.CSSProperties => ({
  padding: '8px 14px', borderRadius: 6, fontSize: 13, marginBottom: 12,
  background: t === 'error' ? '#fee2e2' : '#dcfce7',
  color: t === 'error' ? C.danger : C.success,
  border: `1px solid ${t === 'error' ? '#fca5a5' : '#86efac'}`,
});

// ---------------------------------------------------------------------------
// Create round form
// ---------------------------------------------------------------------------
function CreateRoundForm({ onCreated }: { onCreated: () => void }) {
  const [stake, setStake] = useState('');
  const [startTime, setStartTime] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('100');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const stakeNum = parseFloat(stake);
    const maxNum = parseInt(maxPlayers, 10);
    if (isNaN(stakeNum) || stakeNum <= 0) { setError('Stake must be a positive number.'); return; }
    if (!startTime) { setError('Start time is required.'); return; }
    if (isNaN(maxNum) || maxNum < 2) { setError('Max players must be at least 2.'); return; }

    setLoading(true); setError(null); setSuccess(null);
    try {
      const body: CreateRoundRequest = { stake: stakeNum, startTime: new Date(startTime).toISOString(), maxPlayers: maxNum };
      const round = await createRound(body);
      setSuccess(`Round #${round.id.slice(-6).toUpperCase()} created.`);
      setStake(''); setStartTime(''); setMaxPlayers('100');
      onCreated();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to create round');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 6,
    fontSize: 14, width: '100%', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12, color: C.muted, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: 4, display: 'block',
  };

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginTop: 0, marginBottom: 20 }}>Create New Round</h2>
      {error && <div style={msgStyle('error')}>{error}</div>}
      {success && <div style={msgStyle('success')}>{success}</div>}
      <form
        onSubmit={handleSubmit}
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 14, alignItems: 'flex-end' }}
      >
        <div>
          <label style={labelStyle}>Stake (ETB)</label>
          <input type="number" min="1" step="any" style={inputStyle} value={stake}
            onChange={(e) => setStake(e.target.value)} placeholder="e.g. 50" required />
        </div>
        <div>
          <label style={labelStyle}>Start Time</label>
          <input type="datetime-local" style={inputStyle} value={startTime}
            onChange={(e) => setStartTime(e.target.value)} required />
        </div>
        <div>
          <label style={labelStyle}>Max Players</label>
          <input type="number" min="2" step="1" style={inputStyle} value={maxPlayers}
            onChange={(e) => setMaxPlayers(e.target.value)} required />
        </div>
        <div>
          <Btn type="submit" variant="primary" disabled={loading}>{loading ? 'Creating…' : 'Create'}</Btn>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rounds table
// ---------------------------------------------------------------------------
interface RoundsTableProps {
  rounds: AdminRound[];
  showActions: boolean;
  onAction: (id: string, action: 'start' | 'cancel') => void;
  loading: boolean;
  actioningId: string | null;
}

function RoundsTable({ rounds, showActions, onAction, loading, actioningId }: RoundsTableProps) {
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>ID</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Stake (ETB)</th>
            <th style={thStyle}>Players</th>
            <th style={thStyle}>Derash (ETB)</th>
            <th style={thStyle}>Called</th>
            <th style={thStyle}>Start Time</th>
            {showActions ? <th style={thStyle}>Actions</th> : <th style={thStyle}>Ended At</th>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: 32 }}>Loading…</td></tr>
          ) : rounds.length === 0 ? (
            <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: 32 }}>No rounds found.</td></tr>
          ) : (
            rounds.map((r) => (
              <tr key={r.id}>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>#{r.id.slice(-6).toUpperCase()}</td>
                <td style={tdStyle}><StatusBadge status={r.status} /></td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{r.stake.toFixed(2)}</td>
                <td style={tdStyle}>{r.player_count}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: C.success }}>{r.derash.toFixed(2)}</td>
                <td style={tdStyle}>{r.called_count}</td>
                <td style={{ ...tdStyle, color: C.muted, fontSize: 12, whiteSpace: 'nowrap' }}>
                  {new Date(r.start_time).toLocaleString()}
                </td>
                {showActions ? (
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {r.status === 'pending' && (
                        <Btn small variant="success" disabled={actioningId === r.id} onClick={() => onAction(r.id, 'start')}>
                          {actioningId === r.id ? '…' : 'Force Start'}
                        </Btn>
                      )}
                      {(r.status === 'pending' || r.status === 'active') && (
                        <Btn small variant="danger" disabled={actioningId === r.id} onClick={() => onAction(r.id, 'cancel')}>
                          {actioningId === r.id ? '…' : 'Cancel'}
                        </Btn>
                      )}
                    </div>
                  </td>
                ) : (
                  <td style={{ ...tdStyle, color: C.muted, fontSize: 12, whiteSpace: 'nowrap' }}>
                    {r.ended_at ? new Date(r.ended_at).toLocaleString() : '—'}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main GamesPage
// ---------------------------------------------------------------------------
export function GamesPage() {
  const [allRounds, setAllRounds] = useState<AdminRound[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchRounds = useCallback(async () => {
    setFetchError(null);
    try {
      const res = await getAdminRounds(1);
      setAllRounds(res.items);
    } catch (err: unknown) {
      setFetchError((err as Error).message ?? 'Failed to load rounds');
    } finally {
      setFetchLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRounds();
    const interval = setInterval(fetchRounds, 3000);
    return () => clearInterval(interval);
  }, [fetchRounds]);

  async function handleAction(id: string, action: 'start' | 'cancel') {
    const label = action === 'start' ? 'force-start' : 'cancel';
    if (!window.confirm(`Are you sure you want to ${label} round #${id.slice(-6).toUpperCase()}?`)) return;
    setActioningId(id);
    setActionError(null);
    try {
      if (action === 'start') await startRound(id);
      else await cancelRound(id);
      await fetchRounds();
    } catch (err: unknown) {
      setActionError((err as Error).message ?? `Failed to ${label} round`);
    } finally {
      setActioningId(null);
    }
  }

  const activeRounds = allRounds.filter((r) => r.status === 'pending' || r.status === 'active');
  const doneRounds = allRounds.filter((r) => r.status === 'completed' || r.status === 'cancelled' || r.status === 'void');

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginTop: 0, marginBottom: 24 }}>Games</h1>

      <CreateRoundForm onCreated={fetchRounds} />

      {actionError && <div style={msgStyle('error')}>{actionError}</div>}
      {fetchError && <div style={msgStyle('error')}>{fetchError}</div>}

      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>Active &amp; Pending Rounds</h2>
          <span style={{ fontSize: 12, color: C.muted }}>Auto-refreshes every 3s</span>
        </div>
        <RoundsTable
          rounds={activeRounds}
          showActions
          onAction={handleAction}
          loading={fetchLoading && allRounds.length === 0}
          actioningId={actioningId}
        />
      </div>

      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginTop: 0, marginBottom: 12 }}>
          Completed &amp; Cancelled Log
        </h2>
        <RoundsTable
          rounds={doneRounds}
          showActions={false}
          onAction={handleAction}
          loading={fetchLoading && allRounds.length === 0}
          actioningId={actioningId}
        />
      </div>
    </div>
  );
}
