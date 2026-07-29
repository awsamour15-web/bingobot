import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { AdminPlayer, AdminCreditRequest } from '@beteseb/shared';
import {
  getPlayers,
  getPlayer,
  suspendPlayer,
  restorePlayer,
  creditPlayer,
} from '../lib/api';

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
// Small shared components
// ---------------------------------------------------------------------------

function Badge({ active }: { active: boolean }) {
  const style: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    background: active ? '#dcfce7' : '#fee2e2',
    color: active ? C.success : C.danger,
  };
  return <span style={style}>{active ? 'Active' : 'Suspended'}</span>;
}

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
// Player detail panel
// ---------------------------------------------------------------------------

function PlayerDetail({ playerId, onBack }: { playerId: string; onBack: () => void }) {
  const [player, setPlayer] = useState<AdminPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [suspending, setSuspending] = useState(false);

  // Credit form state
  const [walletType, setWalletType] = useState<'main' | 'play'>('main');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [creditSuccess, setCreditSuccess] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getPlayer(playerId)
      .then((p) => {
        setPlayer(p);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message ?? 'Failed to load player');
        setLoading(false);
      });
  }, [playerId]);

  async function handleSuspendToggle() {
    if (!player) return;
    const action = player.is_suspended ? 'restore' : 'suspend';
    const confirmed = window.confirm(
      `Are you sure you want to ${action} player "${player.username}"?`,
    );
    if (!confirmed) return;

    setSuspending(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      if (player.is_suspended) {
        await restorePlayer(player.id);
      } else {
        await suspendPlayer(player.id);
      }
      const updated = await getPlayer(player.id);
      setPlayer(updated);
      setActionSuccess(`Player ${action}d successfully.`);
    } catch (e: unknown) {
      const err = e as Error;
      setActionError(err.message ?? `Failed to ${action} player`);
    } finally {
      setSuspending(false);
    }
  }

  async function handleCredit(e: React.FormEvent) {
    e.preventDefault();
    if (!player) return;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      setCreditError('Amount must be a valid number.');
      return;
    }
    if (!note.trim()) {
      setCreditError('Note is required.');
      return;
    }
    setCreditLoading(true);
    setCreditError(null);
    setCreditSuccess(null);
    try {
      const body: AdminCreditRequest = {
        walletType,
        amount: parsedAmount,
        note: note.trim(),
      };
      await creditPlayer(player.id, body);
      const updated = await getPlayer(player.id);
      setPlayer(updated);
      setCreditSuccess(`Wallet updated successfully (${parsedAmount > 0 ? '+' : ''}${parsedAmount} ETB).`);
      setAmount('');
      setNote('');
    } catch (e: unknown) {
      const err = e as Error;
      setCreditError(err.message ?? 'Failed to update wallet');
    } finally {
      setCreditLoading(false);
    }
  }

  const containerStyle: React.CSSProperties = {
    maxWidth: 720,
  };

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: 24,
    marginBottom: 20,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 700,
    color: C.text,
    marginBottom: 16,
    marginTop: 0,
  };

  const fieldRowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    marginBottom: 12,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: C.muted,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 2,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 15,
    color: C.text,
    fontWeight: 500,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    fontSize: 14,
    boxSizing: 'border-box',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    background: '#fff',
  };

  const msgStyle = (type: 'error' | 'success'): React.CSSProperties => ({
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 12,
    background: type === 'error' ? '#fee2e2' : '#dcfce7',
    color: type === 'error' ? C.danger : C.success,
    border: `1px solid ${type === 'error' ? '#fca5a5' : '#86efac'}`,
  });

  if (loading) {
    return (
      <div style={containerStyle}>
        <button
          style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 14, marginBottom: 16 }}
          onClick={onBack}
        >
          ← Back to list
        </button>
        <p style={{ color: C.muted }}>Loading...</p>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div style={containerStyle}>
        <button
          style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 14, marginBottom: 16 }}
          onClick={onBack}
        >
          ← Back to list
        </button>
        <p style={{ color: C.danger }}>{error ?? 'Player not found'}</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <button
        style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 14, marginBottom: 16, padding: 0 }}
        onClick={onBack}
      >
        ← Back to list
      </button>

      {/* Profile card */}
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Player Profile</h2>

        <div style={fieldRowStyle}>
          <div>
            <div style={labelStyle}>Username</div>
            <div style={valueStyle}>{player.username}</div>
          </div>
          <div>
            <div style={labelStyle}>Telegram ID</div>
            <div style={valueStyle}>{player.telegram_id}</div>
          </div>
          <div>
            <div style={labelStyle}>Phone</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={valueStyle}>{player.phone ?? '—'}</span>
              {player.phone && (
                <span style={{
                  fontSize: 11,
                  padding: '1px 7px',
                  borderRadius: 10,
                  background: player.phone_verified ? '#dcfce7' : '#fef9c3',
                  color: player.phone_verified ? C.success : '#92400e',
                  fontWeight: 600,
                }}>
                  {player.phone_verified ? '✓ Verified' : 'Unverified'}
                </span>
              )}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Status</div>
            <div><Badge active={!player.is_suspended} /></div>
          </div>
          <div>
            <div style={labelStyle}>Main Wallet (ETB)</div>
            <div style={{ ...valueStyle, color: C.success, fontWeight: 700 }}>
              {player.main_wallet_balance.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Play Wallet (ETB)</div>
            <div style={{ ...valueStyle, color: C.primary, fontWeight: 700 }}>
              {player.play_wallet_balance.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Joined</div>
            <div style={valueStyle}>{new Date(player.created_at).toLocaleDateString()}</div>
          </div>
          <div>
            <div style={labelStyle}>Total Games</div>
            <div style={valueStyle}>{player.total_games}</div>
          </div>
          <div>
            <div style={labelStyle}>Total Referrals</div>
            <div style={valueStyle}>{player.total_referrals}</div>
          </div>
        </div>

        {/* Suspend / Restore */}
        <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Btn
            variant={player.is_suspended ? 'success' : 'danger'}
            onClick={handleSuspendToggle}
            disabled={suspending}
          >
            {suspending ? 'Working…' : player.is_suspended ? 'Restore Player' : 'Suspend Player'}
          </Btn>
          {actionError && <span style={{ color: C.danger, fontSize: 13 }}>{actionError}</span>}
          {actionSuccess && <span style={{ color: C.success, fontSize: 13 }}>{actionSuccess}</span>}
        </div>
      </div>

      {/* Credit / Debit form */}
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Manual Credit / Debit</h2>
        <p style={{ fontSize: 13, color: C.muted, marginTop: -8, marginBottom: 16 }}>
          Use a positive amount to credit, negative to debit.
        </p>

        {creditError && <div style={msgStyle('error')}>{creditError}</div>}
        {creditSuccess && <div style={msgStyle('success')}>{creditSuccess}</div>}

        <form onSubmit={handleCredit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Wallet Type</label>
            <select
              style={selectStyle}
              value={walletType}
              onChange={(e) => setWalletType(e.target.value as 'main' | 'play')}
            >
              <option value="main">Main Wallet</option>
              <option value="play">Play Wallet</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Amount (ETB)</label>
            <input
              type="number"
              step="any"
              style={inputStyle}
              placeholder="e.g. 50 or -25"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Note (required)</label>
            <input
              type="text"
              style={inputStyle}
              placeholder="Reason for adjustment"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
            />
          </div>
          <div>
            <Btn variant="primary" disabled={creditLoading}>
              {creditLoading ? 'Submitting…' : 'Submit'}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player list
// ---------------------------------------------------------------------------

function PlayerList({ onView }: { onView: (id: string) => void }) {
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPlayers = useCallback((p: number, q: string) => {
    setLoading(true);
    setError(null);
    getPlayers(p, q || undefined)
      .then((res: any) => {
        setPlayers(res.items ?? res.players ?? []);
        setTotal(res.total ?? 0);
        setPageSize(res.pageSize ?? res.limit ?? 20);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message ?? 'Failed to load players');
        setLoading(false);
      });
  }, []);

  // Initial load
  useEffect(() => {
    fetchPlayers(1, '');
  }, [fetchPlayers]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSearch(val);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPlayers(1, val);
    }, 400);
  }

  function handlePrev() {
    const newPage = page - 1;
    setPage(newPage);
    fetchPlayers(newPage, search);
  }

  function handleNext() {
    const newPage = page + 1;
    setPage(newPage);
    fetchPlayers(newPage, search);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  };

  const topBarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  };

  const searchInputStyle: React.CSSProperties = {
    padding: '8px 14px',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    fontSize: 14,
    width: 280,
    maxWidth: '100%',
  };

  const tableContainerStyle: React.CSSProperties = {
    overflowX: 'auto',
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    background: '#fff',
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

  const paginationStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'flex-end',
  };

  return (
    <div style={containerStyle}>
      <div style={topBarStyle}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>Players</h1>
        <input
          type="search"
          style={searchInputStyle}
          placeholder="Search by username or Telegram ID…"
          value={search}
          onChange={handleSearchChange}
        />
      </div>

      {error && (
        <div style={{ color: C.danger, fontSize: 13, padding: '8px 14px', background: '#fee2e2', borderRadius: 6, border: `1px solid #fca5a5` }}>
          {error}
        </div>
      )}

      <div style={tableContainerStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Username</th>
              <th style={thStyle}>Telegram ID</th>
              <th style={thStyle}>Phone</th>
              <th style={thStyle}>Main Wallet (ETB)</th>
              <th style={thStyle}>Play Wallet (ETB)</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Registered</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: 32 }}>
                  Loading...
                </td>
              </tr>
            ) : players.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: 32 }}>
                  No players found.
                </td>
              </tr>
            ) : (
              players.map((p) => (
                <tr key={p.id} style={{ transition: 'background 0.1s' }}>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 600 }}>{p.username}</span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{p.telegram_id}</td>
                  <td style={tdStyle}>{p.phone ?? '—'}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: C.success }}>{p.main_wallet_balance.toFixed(2)}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: C.primary }}>{p.play_wallet_balance.toFixed(2)}</td>
                  <td style={tdStyle}><Badge active={!p.is_suspended} /></td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: C.muted, fontSize: 12 }}>
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td style={tdStyle}>
                    <Btn small variant="ghost" onClick={() => onView(p.id)}>
                      View
                    </Btn>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={paginationStyle}>
        <span style={{ fontSize: 13, color: C.muted }}>
          Page {page} of {totalPages} &nbsp;({total} total)
        </span>
        <Btn small variant="ghost" onClick={handlePrev} disabled={page <= 1 || loading}>
          ← Prev
        </Btn>
        <Btn small variant="ghost" onClick={handleNext} disabled={page >= totalPages || loading}>
          Next →
        </Btn>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function PlayersPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  function handleView(playerId: string) {
    navigate(`/players/${playerId}`);
  }

  function handleBack() {
    navigate('/players');
  }

  if (id) {
    return <PlayerDetail playerId={id} onBack={handleBack} />;
  }

  return <PlayerList onView={handleView} />;
}
