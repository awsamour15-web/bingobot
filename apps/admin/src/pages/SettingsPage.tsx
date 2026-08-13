import React, { useState, useEffect } from 'react';
import type { ConfigEntry, AdminAccount, CreateAdminRequest, UpdateAdminRequest, AdminRole } from '@fidel/shared';
import {
  getConfig, updateConfig, getAdmins, createAdmin, updateAdmin,
  getDepositAccounts, createDepositAccount, updateDepositAccount, deleteDepositAccount,
} from '../lib/api';
import type { DepositAccount } from '../lib/api';
import {
  C, Btn, Badge, Card, CardHeader, Table, Th, Td,
  TrEmpty, TrLoading, Alert, Field, PageHeader, inputCss, selectCss,
} from '../components/ui';

function ConfigSection() {
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowStates, setRowStates] = useState<Record<string, { value: string; saving: boolean; feedback: { type: 'success' | 'error'; msg: string } | null }>>({});

  useEffect(() => {
    setLoading(true); setError(null);
    getConfig()
      .then((data) => {
        setEntries(data);
        const init: typeof rowStates = {};
        data.forEach((e) => { init[e.key] = { value: e.value, saving: false, feedback: null }; });
        setRowStates(init);
        setLoading(false);
      })
      .catch((e: Error) => { setError(e.message ?? 'Failed to load config'); setLoading(false); });
  }, []);

  function setVal(key: string, value: string) {
    setRowStates((p) => p[key] ? { ...p, [key]: { ...p[key]!, value, feedback: null } } : p);
  }

  async function handleSave(key: string) {
    const row = rowStates[key];
    if (!row) return;
    if (['claim_window_ms', 'call_interval_ms'].includes(key)) {
      const n = parseInt(row.value, 10);
      if (isNaN(n) || n < 1000 || n > 30000) {
        setRowStates((p) => p[key] ? { ...p, [key]: { ...p[key]!, feedback: { type: 'error', msg: '1000–30000 ms only' } } } : p);
        return;
      }
    }
    setRowStates((p) => p[key] ? { ...p, [key]: { ...p[key]!, saving: true, feedback: null } } : p);
    try {
      const updated = await updateConfig(key, row.value);
      setEntries((prev) => prev.map((e) => e.key === key ? updated : e));
      setRowStates((p) => p[key] ? { ...p, [key]: { ...p[key]!, saving: false, feedback: { type: 'success', msg: 'Saved' } } } : p);
    } catch (e: unknown) {
      setRowStates((p) => p[key] ? { ...p, [key]: { ...p[key]!, saving: false, feedback: { type: 'error', msg: (e as Error).message ?? 'Failed' } } } : p);
    }
  }

  return (
    <Card style={{ marginBottom: 24 }}>
      <CardHeader title="Configuration" subtitle="Changes take effect immediately after saving" />
      {error && <Alert type="error">{error}</Alert>}
      {loading ? <p style={{ color: C.muted, fontSize: 13 }}>Loading…</p> : (
        <Table>
          <thead>
            <tr>
              <Th>Key</Th>
              <Th>Value</Th>
              <Th>Updated</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {!entries.length ? <TrEmpty cols={4} /> :
             entries.map((entry) => {
              const row = rowStates[entry.key];
              if (!row) return null;
              const isMs = ['claim_window_ms', 'call_interval_ms'].includes(entry.key);
              return (
                <tr key={entry.key}>
                  <Td mono style={{ color: C.text, fontWeight: 600 }}>{entry.key}</Td>
                  <Td style={{ minWidth: 240 }}>
                    <input
                      style={{ ...inputCss, maxWidth: 280 }}
                      type={isMs ? 'number' : 'text'}
                      min={isMs ? 1000 : undefined}
                      max={isMs ? 30000 : undefined}
                      value={row.value}
                      onChange={(e) => setVal(entry.key, e.target.value)}
                      disabled={row.saving}
                    />
                    {row.feedback && (
                      <span style={{ display: 'block', fontSize: 11, marginTop: 3, color: row.feedback.type === 'success' ? C.success : C.danger }}>
                        {row.feedback.type === 'success' ? '✓' : '✗'} {row.feedback.msg}
                      </span>
                    )}
                  </Td>
                  <Td muted>{new Date(entry.updated_at).toLocaleString()}</Td>
                  <Td>
                    <Btn size="sm" onClick={() => handleSave(entry.key)} disabled={row.saving}>
                      {row.saving ? 'Saving…' : 'Save'}
                    </Btn>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function AdminAccountsSection() {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowActions, setRowActions] = useState<Record<string, { saving: boolean; error: string | null }>>({});
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<AdminRole>('admin');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  function loadAdmins() {
    setLoading(true); setError(null);
    getAdmins()
      .then((data) => {
        setAdmins(data);
        const init: typeof rowActions = {};
        data.forEach((a) => { init[a.id] = { saving: false, error: null }; });
        setRowActions(init);
        setLoading(false);
      })
      .catch((e: Error) => { setError(e.message ?? 'Failed to load admins'); setLoading(false); });
  }
  useEffect(() => { loadAdmins(); }, []);

  async function handleToggleActive(admin: AdminAccount) {
    setRowActions((p) => ({ ...p, [admin.id]: { saving: true, error: null } }));
    try {
      const updated = await updateAdmin(admin.id, { is_active: !admin.is_active } as UpdateAdminRequest);
      setAdmins((p) => p.map((a) => a.id === admin.id ? updated : a));
      setRowActions((p) => ({ ...p, [admin.id]: { saving: false, error: null } }));
    } catch (e: unknown) {
      setRowActions((p) => ({ ...p, [admin.id]: { saving: false, error: (e as Error).message ?? 'Failed' } }));
    }
  }

  async function handleRoleChange(admin: AdminAccount, role: AdminRole) {
    setRowActions((p) => ({ ...p, [admin.id]: { saving: true, error: null } }));
    try {
      const updated = await updateAdmin(admin.id, { role } as UpdateAdminRequest);
      setAdmins((p) => p.map((a) => a.id === admin.id ? updated : a));
      setRowActions((p) => ({ ...p, [admin.id]: { saving: false, error: null } }));
    } catch (e: unknown) {
      setRowActions((p) => ({ ...p, [admin.id]: { saving: false, error: (e as Error).message ?? 'Failed' } }));
    }
  }

  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!createUsername.trim() || !createPassword.trim()) {
      setCreateMsg({ type: 'error', text: 'Username and password are required.' }); return;
    }
    setCreating(true); setCreateMsg(null);
    try {
      const newAdmin = await createAdmin({ username: createUsername.trim(), password: createPassword.trim(), role: createRole } as CreateAdminRequest);
      setAdmins((p) => [...p, newAdmin]);
      setRowActions((p) => ({ ...p, [newAdmin.id]: { saving: false, error: null } }));
      setCreateUsername(''); setCreatePassword(''); setCreateRole('admin');
      setCreateMsg({ type: 'success', text: `Admin "${newAdmin.username}" created.` });
    } catch (e: unknown) {
      setCreateMsg({ type: 'error', text: (e as Error).message ?? 'Failed to create admin' });
    } finally { setCreating(false); }
  }

  return (
    <Card>
      <CardHeader title="Admin Accounts" subtitle="Only super_admin users can manage accounts" />
      <Alert type="info">Role changes and deactivation require super_admin access.</Alert>
      {error && <Alert type="error">{error}</Alert>}

      {loading ? <p style={{ color: C.muted, fontSize: 13 }}>Loading…</p> : (
        <div style={{ marginBottom: 32 }}>
          <Table>
            <thead>
              <tr>
                <Th>Username</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {!admins.length ? <TrEmpty cols={5} /> :
               admins.map((admin) => {
                const ra = rowActions[admin.id] ?? { saving: false, error: null };
                return (
                  <tr key={admin.id}>
                    <Td><span style={{ fontWeight: 600 }}>{admin.username}</span></Td>
                    <Td>
                      <Badge variant={admin.role === 'super_admin' ? 'primary' : 'neutral'}>
                        {admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge variant={admin.is_active ? 'success' : 'danger'}>
                        {admin.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </Td>
                    <Td muted>{new Date(admin.created_at).toLocaleDateString()}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                          style={{ ...selectCss, width: 'auto', padding: '4px 8px', fontSize: 12 }}
                          value={admin.role}
                          disabled={ra.saving}
                          onChange={(e) => handleRoleChange(admin, e.target.value as AdminRole)}
                          aria-label={`Role for ${admin.username}`}
                        >
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                        <Btn size="sm" variant={admin.is_active ? 'danger' : 'success'} onClick={() => handleToggleActive(admin)} disabled={ra.saving}>
                          {ra.saving ? '…' : admin.is_active ? 'Deactivate' : 'Activate'}
                        </Btn>
                        {ra.error && <span style={{ fontSize: 12, color: C.danger }}>{ra.error}</span>}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: C.text }}>Create New Admin</h3>
        {createMsg && <Alert type={createMsg.type}>{createMsg.text}</Alert>}
        <form onSubmit={handleCreateAdmin} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 380 }}>
          <Field label="Username">
            <input style={inputCss} type="text" placeholder="e.g. johndoe" value={createUsername} onChange={(e) => setCreateUsername(e.target.value)} disabled={creating} required />
          </Field>
          <Field label="Password">
            <input style={inputCss} type="password" placeholder="Secure password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} disabled={creating} required />
          </Field>
          <Field label="Role">
            <select style={selectCss} value={createRole} onChange={(e) => setCreateRole(e.target.value as AdminRole)} disabled={creating}>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </Field>
          <Btn type="submit" disabled={creating}>{creating ? 'Creating…' : '+ Create Admin'}</Btn>
        </form>
      </div>
    </Card>
  );
}

function DepositAccountsSection() {
  const [accounts, setAccounts] = useState<DepositAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    getDepositAccounts()
      .then((data) => { setAccounts(data); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newPhone.trim() || !newName.trim()) {
      setCreateMsg({ type: 'error', text: 'Phone and name are required.' }); return;
    }
    setCreating(true); setCreateMsg(null);
    try {
      const account = await createDepositAccount(newPhone.trim(), newName.trim());
      setAccounts((p) => [account, ...p]);
      setNewPhone(''); setNewName('');
      setCreateMsg({ type: 'success', text: 'Account added.' });
    } catch (e: unknown) {
      setCreateMsg({ type: 'error', text: (e as Error).message ?? 'Failed' });
    } finally { setCreating(false); }
  }

  async function handleToggle(account: DepositAccount) {
    setSaving((p) => ({ ...p, [account.id]: true }));
    try {
      const updated = await updateDepositAccount(account.id, { is_active: !account.is_active });
      setAccounts((p) => p.map((a) => a.id === account.id ? updated : a));
    } finally { setSaving((p) => ({ ...p, [account.id]: false })); }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this deposit account?')) return;
    setSaving((p) => ({ ...p, [id]: true }));
    try {
      await deleteDepositAccount(id);
      setAccounts((p) => p.filter((a) => a.id !== id));
    } finally { setSaving((p) => ({ ...p, [id]: false })); }
  }

  return (
    <Card style={{ marginBottom: 24 }}>
      <CardHeader title="Deposit Accounts" subtitle="Active accounts are shown to players when depositing. One is picked at random." />
      {error && <Alert type="error">{error}</Alert>}
      {loading ? <p style={{ color: C.muted, fontSize: 13 }}>Loading…</p> : (
        <Table>
          <thead>
            <tr>
              <Th>Phone</Th>
              <Th>Name</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {!accounts.length ? <TrEmpty cols={4} /> :
              accounts.map((a) => (
                <tr key={a.id}>
                  <Td mono>{a.phone}</Td>
                  <Td>{a.name}</Td>
                  <Td>
                    <Badge variant={a.is_active ? 'success' : 'neutral'}>
                      {a.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn size="sm" variant={a.is_active ? 'danger' : 'success'} onClick={() => handleToggle(a)} disabled={saving[a.id]}>
                        {saving[a.id] ? '…' : a.is_active ? 'Deactivate' : 'Activate'}
                      </Btn>
                      <Btn size="sm" variant="danger" onClick={() => handleDelete(a.id)} disabled={saving[a.id]}>
                        Delete
                      </Btn>
                    </div>
                  </Td>
                </tr>
              ))}
          </tbody>
        </Table>
      )}

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, marginTop: 16 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: C.text }}>Add Deposit Account</h3>
        {createMsg && <Alert type={createMsg.type}>{createMsg.text}</Alert>}
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Phone">
            <input style={{ ...inputCss, width: 160 }} type="text" placeholder="e.g. 0912345678" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} disabled={creating} required />
          </Field>
          <Field label="Account Name">
            <input style={{ ...inputCss, width: 200 }} type="text" placeholder="e.g. Abebe Zewude" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={creating} required />
          </Field>
          <Btn type="submit" disabled={creating}>{creating ? 'Adding…' : '+ Add Account'}</Btn>
        </form>
      </div>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="fade-in">
      <PageHeader title="Settings" />
      <DepositAccountsSection />
      <ConfigSection />
      <AdminAccountsSection />
    </div>
  );
}
