import React, { useState, useEffect } from 'react';
import type { ConfigEntry, AdminAccount, CreateAdminRequest, UpdateAdminRequest, AdminRole } from '@fidel/shared';
import { getConfig, updateConfig, getAdmins, createAdmin, updateAdmin } from '../lib/api';

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
// Shared button component
// ---------------------------------------------------------------------------

function Btn({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  small = false,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'danger' | 'success' | 'ghost';
  disabled?: boolean;
  small?: boolean;
  type?: 'button' | 'submit' | 'reset';
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
    <button style={style} onClick={onClick} disabled={disabled} type={type}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: AdminRole }) {
  const isSuperAdmin = role === 'super_admin';
  const style: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    background: isSuperAdmin ? '#ede9fe' : '#e0f2fe',
    color: isSuperAdmin ? '#6d28d9' : '#0369a1',
  };
  return <span style={style}>{isSuperAdmin ? 'Super Admin' : 'Admin'}</span>;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ active }: { active: boolean }) {
  const style: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    background: active ? '#dcfce7' : '#fee2e2',
    color: active ? C.success : C.danger,
  };
  return <span style={style}>{active ? 'Active' : 'Deactivated'}</span>;
}

// ---------------------------------------------------------------------------
// Config section
// ---------------------------------------------------------------------------

type ConfigRowState = {
  value: string;
  saving: boolean;
  feedback: { type: 'success' | 'error'; message: string } | null;
};

function ConfigSection() {
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowStates, setRowStates] = useState<Record<string, ConfigRowState>>({});

  useEffect(() => {
    setLoading(true);
    setError(null);
    getConfig()
      .then((data) => {
        setEntries(data);
        const initial: Record<string, ConfigRowState> = {};
        data.forEach((entry) => {
          initial[entry.key] = { value: entry.value, saving: false, feedback: null };
        });
        setRowStates(initial);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message ?? 'Failed to load config');
        setLoading(false);
      });
  }, []);

  function handleValueChange(key: string, value: string) {
    setRowStates((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      return { ...prev, [key]: { value, saving: existing.saving, feedback: null } };
    });
  }

  async function handleSave(key: string) {
    const rowState = rowStates[key];
    if (!rowState) return;

    if (key === 'claim_window_ms') {
      const parsed = parseInt(rowState.value, 10);
      if (isNaN(parsed) || parsed < 1000 || parsed > 30000) {
        setRowStates((prev) => {
          const existing = prev[key];
          if (!existing) return prev;
          return {
            ...prev,
            [key]: { value: existing.value, saving: false, feedback: { type: 'error', message: 'Value must be between 1000 and 30000 ms' } },
          };
        });
        return;
      }
    }

    if (key === 'call_interval_ms') {
      const parsed = parseInt(rowState.value, 10);
      if (isNaN(parsed) || parsed < 1000 || parsed > 30000) {
        setRowStates((prev) => {
          const existing = prev[key];
          if (!existing) return prev;
          return {
            ...prev,
            [key]: { value: existing.value, saving: false, feedback: { type: 'error', message: 'Value must be between 1000 and 30000 ms' } },
          };
        });
        return;
      }
    }

    setRowStates((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      return { ...prev, [key]: { value: existing.value, saving: true, feedback: null } };
    });
    try {
      const updated = await updateConfig(key, rowState.value);
      setEntries((prev) => prev.map((e) => (e.key === key ? updated : e)));
      setRowStates((prev) => {
        const existing = prev[key];
        if (!existing) return prev;
        return { ...prev, [key]: { value: existing.value, saving: false, feedback: { type: 'success', message: 'Saved' } } };
      });
    } catch (e: unknown) {
      const err = e as Error;
      setRowStates((prev) => {
        const existing = prev[key];
        if (!existing) return prev;
        return {
          ...prev,
          [key]: { value: existing.value, saving: false, feedback: { type: 'error', message: err.message ?? 'Failed to save' } },
        };
      });
    }
  }

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: 24,
    marginBottom: 24,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 700,
    color: C.text,
    marginBottom: 4,
    marginTop: 0,
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: 13,
    color: C.muted,
    marginBottom: 20,
    marginTop: 0,
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
    minWidth: 500,
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

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 200,
  };

  if (loading) {
    return (
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Configuration</h2>
        <p style={{ color: C.muted, fontSize: 13 }}>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Configuration</h2>
        <p style={{ color: C.danger, fontSize: 13 }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <h2 style={sectionTitleStyle}>Configuration</h2>
      <p style={subtitleStyle}>Manage application configuration values. Changes take effect immediately after saving.</p>
      <div style={tableContainerStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Key</th>
              <th style={thStyle}>Value</th>
              <th style={thStyle}>Last Updated</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: 32 }}>
                  No configuration entries found.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const rowState = rowStates[entry.key];
                if (!rowState) return null;
                return (
                  <tr key={entry.key}>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap', color: C.text, fontWeight: 600 }}>
                      {entry.key}
                    </td>
                    <td style={{ ...tdStyle, minWidth: 240 }}>
                      <input
                        type={entry.key === 'claim_window_ms' || entry.key === 'call_interval_ms' ? 'number' : 'text'}
                        min={entry.key === 'claim_window_ms' || entry.key === 'call_interval_ms' ? 1000 : undefined}
                        max={entry.key === 'claim_window_ms' || entry.key === 'call_interval_ms' ? 30000 : undefined}
                        style={inputStyle}
                        value={rowState.value}
                        onChange={(e) => handleValueChange(entry.key, e.target.value)}
                        disabled={rowState.saving}
                      />
                      {entry.key === 'claim_window_ms' && (
                        <span style={{ fontSize: 11, color: C.muted, marginTop: 4, display: 'block' }}>
                          1000 – 30000 ms
                        </span>
                      )}
                      {entry.key === 'call_interval_ms' && (
                        <span style={{ fontSize: 11, color: C.muted, marginTop: 4, display: 'block' }}>
                          1000 – 30000 ms
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: C.muted, fontSize: 12 }}>
                      {new Date(entry.updated_at).toLocaleString()}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Btn
                          small
                          variant="primary"
                          onClick={() => handleSave(entry.key)}
                          disabled={rowState.saving}
                        >
                          {rowState.saving ? 'Saving…' : 'Save'}
                        </Btn>
                        {rowState.feedback && (
                          <span style={{
                            fontSize: 12,
                            color: rowState.feedback.type === 'success' ? C.success : C.danger,
                          }}>
                            {rowState.feedback.type === 'success' ? '✓' : '✗'} {rowState.feedback.message}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin accounts section
// ---------------------------------------------------------------------------

function AdminAccountsSection() {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-row action state
  const [rowActions, setRowActions] = useState<Record<string, { saving: boolean; error: string | null }>>({});

  // Create admin form
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<AdminRole>('admin');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  function loadAdmins() {
    setLoading(true);
    setError(null);
    getAdmins()
      .then((data) => {
        setAdmins(data);
        const rowInit: Record<string, { saving: boolean; error: string | null }> = {};
        data.forEach((a) => {
          rowInit[a.id] = { saving: false, error: null };
        });
        setRowActions(rowInit);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message ?? 'Failed to load admin accounts');
        setLoading(false);
      });
  }

  useEffect(() => {
    loadAdmins();
  }, []);

  async function handleToggleActive(admin: AdminAccount) {
    setRowActions((prev) => ({
      ...prev,
      [admin.id]: { saving: true, error: null },
    }));
    try {
      const body: UpdateAdminRequest = { is_active: !admin.is_active };
      const updated = await updateAdmin(admin.id, body);
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? updated : a)));
      setRowActions((prev) => ({
        ...prev,
        [admin.id]: { saving: false, error: null },
      }));
    } catch (e: unknown) {
      const err = e as Error;
      setRowActions((prev) => ({
        ...prev,
        [admin.id]: { saving: false, error: err.message ?? 'Failed to update' },
      }));
    }
  }

  async function handleRoleChange(admin: AdminAccount, role: AdminRole) {
    setRowActions((prev) => ({
      ...prev,
      [admin.id]: { saving: true, error: null },
    }));
    try {
      const body: UpdateAdminRequest = { role };
      const updated = await updateAdmin(admin.id, body);
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? updated : a)));
      setRowActions((prev) => ({
        ...prev,
        [admin.id]: { saving: false, error: null },
      }));
    } catch (e: unknown) {
      const err = e as Error;
      setRowActions((prev) => ({
        ...prev,
        [admin.id]: { saving: false, error: err.message ?? 'Failed to update role' },
      }));
    }
  }

  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!createUsername.trim()) {
      setCreateError('Username is required.');
      return;
    }
    if (!createPassword.trim()) {
      setCreateError('Password is required.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const body: CreateAdminRequest = {
        username: createUsername.trim(),
        password: createPassword.trim(),
        role: createRole,
      };
      const newAdmin = await createAdmin(body);
      setAdmins((prev) => [...prev, newAdmin]);
      setRowActions((prev) => ({
        ...prev,
        [newAdmin.id]: { saving: false, error: null },
      }));
      setCreateUsername('');
      setCreatePassword('');
      setCreateRole('admin');
      setCreateSuccess(`Admin "${newAdmin.username}" created successfully.`);
    } catch (e: unknown) {
      const err = e as Error;
      setCreateError(err.message ?? 'Failed to create admin');
    } finally {
      setCreating(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: 24,
    marginBottom: 24,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 700,
    color: C.text,
    marginBottom: 4,
    marginTop: 0,
  };

  const noticeStyle: React.CSSProperties = {
    fontSize: 13,
    color: '#92400e',
    background: '#fef3c7',
    border: '1px solid #fcd34d',
    borderRadius: 6,
    padding: '10px 14px',
    marginBottom: 20,
  };

  const tableContainerStyle: React.CSSProperties = {
    overflowX: 'auto',
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    marginBottom: 28,
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    minWidth: 480,
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

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: C.muted,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 4,
    display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    background: '#fff',
  };

  const selectSmallStyle: React.CSSProperties = {
    padding: '4px 8px',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    fontSize: 12,
    background: '#fff',
    cursor: 'pointer',
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

  const subTitleStyle: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 700,
    color: C.text,
    marginBottom: 14,
    marginTop: 0,
  };

  return (
    <div style={cardStyle}>
      <h2 style={sectionTitleStyle}>Admin Accounts</h2>
      <div style={noticeStyle}>
        Admin management is only accessible to super_admin users. If you are not a super_admin, API calls will return 403.
      </div>

      {/* Admin list table */}
      {loading ? (
        <p style={{ color: C.muted, fontSize: 13 }}>Loading...</p>
      ) : error ? (
        <div style={msgStyle('error')}>{error}</div>
      ) : (
        <div style={tableContainerStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Username</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created At</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: 32 }}>
                    No admin accounts found.
                  </td>
                </tr>
              ) : (
                admins.map((admin) => {
                  const rowAction = rowActions[admin.id] ?? { saving: false, error: null };
                  return (
                    <tr key={admin.id}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{admin.username}</td>
                      <td style={tdStyle}>
                        <RoleBadge role={admin.role} />
                      </td>
                      <td style={tdStyle}>
                        <StatusBadge active={admin.is_active} />
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: C.muted, fontSize: 12 }}>
                        {new Date(admin.created_at).toLocaleDateString()}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {/* Role selector */}
                          <select
                            style={selectSmallStyle}
                            value={admin.role}
                            disabled={rowAction.saving}
                            onChange={(e) => handleRoleChange(admin, e.target.value as AdminRole)}
                            aria-label={`Change role for ${admin.username}`}
                          >
                            <option value="admin">Admin</option>
                            <option value="super_admin">Super Admin</option>
                          </select>
                          {/* Toggle active */}
                          <Btn
                            small
                            variant={admin.is_active ? 'danger' : 'success'}
                            onClick={() => handleToggleActive(admin)}
                            disabled={rowAction.saving}
                          >
                            {rowAction.saving
                              ? 'Working…'
                              : admin.is_active
                              ? 'Deactivate'
                              : 'Activate'}
                          </Btn>
                          {rowAction.error && (
                            <span style={{ fontSize: 12, color: C.danger }}>{rowAction.error}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create admin form */}
      <h3 style={subTitleStyle}>Create New Admin</h3>
      {createError && <div style={msgStyle('error')}>{createError}</div>}
      {createSuccess && <div style={msgStyle('success')}>{createSuccess}</div>}
      <form onSubmit={handleCreateAdmin} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
        <div>
          <label style={labelStyle} htmlFor="create-username">Username</label>
          <input
            id="create-username"
            type="text"
            style={inputStyle}
            placeholder="e.g. johndoe"
            value={createUsername}
            onChange={(e) => setCreateUsername(e.target.value)}
            disabled={creating}
            required
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="create-password">Password</label>
          <input
            id="create-password"
            type="password"
            style={inputStyle}
            placeholder="Secure password"
            value={createPassword}
            onChange={(e) => setCreatePassword(e.target.value)}
            disabled={creating}
            required
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="create-role">Role</label>
          <select
            id="create-role"
            style={selectStyle}
            value={createRole}
            onChange={(e) => setCreateRole(e.target.value as AdminRole)}
            disabled={creating}
          >
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>
        <div>
          <Btn type="submit" variant="primary" disabled={creating}>
            {creating ? 'Creating…' : 'Create Admin'}
          </Btn>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main SettingsPage
// ---------------------------------------------------------------------------

export function SettingsPage() {
  const pageStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  };

  const headingStyle: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 700,
    color: C.text,
    marginBottom: 24,
    marginTop: 0,
  };

  return (
    <div style={pageStyle}>
      <h1 style={headingStyle}>Settings</h1>
      <ConfigSection />
      <AdminAccountsSection />
    </div>
  );
}
