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

// ── House Edge Settings ────────────────────────────────────────────────────────
function HouseEdgeSection() {
  const [crash, setCrash] = useState('15');
  const [slots, setSlots] = useState('15');
  const [keno, setKeno] = useState('15');
  const [loading, setLoading] = useState(true);
  const [savingCrash, setSavingCrash] = useState(false);
  const [savingSlots, setSavingSlots] = useState(false);
  const [savingKeno, setSavingKeno] = useState(false);
  const [fbCrash, setFbCrash] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [fbSlots, setFbSlots] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [fbKeno, setFbKeno] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    getConfig()
      .then((data) => {
        setCrash(data.find(e => e.key === 'house_edge_crash')?.value ?? '15');
        setSlots(data.find(e => e.key === 'house_edge_slots')?.value ?? '15');
        setKeno(data.find(e => e.key === 'house_edge_keno')?.value ?? '15');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function save(game: 'crash' | 'slots' | 'keno') {
    const val = game === 'crash' ? crash : game === 'slots' ? slots : keno;
    const n = parseInt(val, 10);
    const setFb = game === 'crash' ? setFbCrash : game === 'slots' ? setFbSlots : setFbKeno;
    const setSaving = game === 'crash' ? setSavingCrash : game === 'slots' ? setSavingSlots : setSavingKeno;
    if (isNaN(n) || n < 5 || n > 50) {
      setFb({ type: 'error', msg: 'Must be between 5 and 50' });
      return;
    }
    setSaving(true); setFb(null);
    try {
      await updateConfig(`house_edge_${game}`, String(n));
      setFb({ type: 'success', msg: `House edge set to ${n}% (RTP ${100 - n}%)` });
    } catch (e: unknown) {
      setFb({ type: 'error', msg: (e as Error).message ?? 'Failed to save' });
    } finally { setSaving(false); }
  }

  const edgeRow = (
    label: string,
    icon: string,
    value: string,
    onChange: (v: string) => void,
    saving: boolean,
    fb: { type: 'success' | 'error'; msg: string } | null,
    onSave: () => void,
  ) => (
    <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', marginBottom: 4 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 10 }}>
        House edge: <strong style={{ color: 'var(--c-text)' }}>{value || '?'}%</strong>
        {'  '}→{'  '}
        Player RTP: <strong style={{ color: '#4ade80' }}>{100 - (parseInt(value, 10) || 0)}%</strong>
      </div>
      {fb && <Alert type={fb.type}>{fb.msg}</Alert>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          type="range" min={5} max={50} step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={saving}
          style={{ flex: 1, accentColor: '#ef4444' }}
        />
        <input
          type="number" min={5} max={50}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={saving}
          style={{ ...inputCss, width: 70 }}
        />
        <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>%</span>
        <Btn onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
      </div>
    </div>
  );

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader
        title="🎰 Game House Edge"
        subtitle="Control the profit percentage for each game (5–50%). Takes effect immediately on next round/spin."
      />
      {loading ? (
        <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {edgeRow('Aviator (Crash)', '✈️', crash, setCrash, savingCrash, fbCrash, () => save('crash'))}
          {edgeRow('Multi Hot (Slots)', '🎰', slots, setSlots, savingSlots, fbSlots, () => save('slots'))}
          {edgeRow('Keno', '🎱', keno, setKeno, savingKeno, fbKeno, () => save('keno'))}
        </div>
      )}
    </Card>
  );
}

// ── Cartela Limit Settings ─────────────────────────────────────────────────────
function CartelaLimitSection() {
  const [limit, setLimit] = useState('2');
  const [poolSize, setPoolSize] = useState('800');
  const [loading, setLoading] = useState(true);
  const [savingLimit, setSavingLimit] = useState(false);
  const [savingPool, setSavingPool] = useState(false);
  const [feedbackLimit, setFeedbackLimit] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [feedbackPool, setFeedbackPool] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    getConfig()
      .then((data) => {
        const limitEntry = data.find(e => e.key === 'max_cartelas_per_player');
        const poolEntry = data.find(e => e.key === 'active_cartela_count');
        setLimit(limitEntry?.value ?? '2');
        setPoolSize(poolEntry?.value ?? '800');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSaveLimit() {
    const n = parseInt(limit, 10);
    if (isNaN(n) || n < 1 || n > 10) {
      setFeedbackLimit({ type: 'error', msg: 'Must be between 1 and 10' });
      return;
    }
    setSavingLimit(true); setFeedbackLimit(null);
    try {
      await updateConfig('max_cartelas_per_player', String(n));
      setFeedbackLimit({ type: 'success', msg: `Limit set to ${n} cartela${n !== 1 ? 's' : ''} per player` });
    } catch (e: unknown) {
      setFeedbackLimit({ type: 'error', msg: (e as Error).message ?? 'Failed to save' });
    } finally {
      setSavingLimit(false);
    }
  }

  async function handleSavePool() {
    const n = parseInt(poolSize, 10);
    if (isNaN(n) || n < 1 || n > 800) {
      setFeedbackPool({ type: 'error', msg: 'Must be between 1 and 800' });
      return;
    }
    setSavingPool(true); setFeedbackPool(null);
    try {
      await updateConfig('active_cartela_count', String(n));
      setFeedbackPool({ type: 'success', msg: `Players will see cartelas 1–${n}` });
    } catch (e: unknown) {
      setFeedbackPool({ type: 'error', msg: (e as Error).message ?? 'Failed to save' });
    } finally {
      setSavingPool(false);
    }
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader
        title="🎴 Cartela Settings"
        subtitle="Control how many cartelas are available and how many each player can pick"
      />
      {loading ? (
        <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', marginBottom: 8 }}>
              Available cartela pool
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 10 }}>
              Players will only see cartelas 1 through this number. Max 800.
            </div>
            {feedbackPool && <Alert type={feedbackPool.type}>{feedbackPool.msg}</Alert>}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="number" min={1} max={800}
                value={poolSize}
                onChange={(e) => setPoolSize(e.target.value)}
                disabled={savingPool}
                style={{ ...inputCss, width: 120 }}
              />
              <Btn onClick={handleSavePool} disabled={savingPool}>
                {savingPool ? 'Saving…' : 'Save'}
              </Btn>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', marginBottom: 8 }}>
              Max cartelas per player per round
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 10 }}>
              How many cartelas one player can hold in a single round. Default is 2.
            </div>
            {feedbackLimit && <Alert type={feedbackLimit.type}>{feedbackLimit.msg}</Alert>}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="number" min={1} max={10}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                disabled={savingLimit}
                style={{ ...inputCss, width: 100 }}
              />
              <Btn onClick={handleSaveLimit} disabled={savingLimit}>
                {savingLimit ? 'Saving…' : 'Save'}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Channel Settings ───────────────────────────────────────────────────────────
function ChannelSettingsSection() {
  const [channelId, setChannelId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    getConfig()
      .then((data) => {
        const channelConfig = data.find(e => e.key === 'required_channel');
        setChannelId(channelConfig?.value ?? '');
        setLoading(false);
      })
      .catch((e: Error) => { setError(e.message ?? 'Failed to load'); setLoading(false); });
  }, []);

  async function handleSave() {
    setFeedback(null);
    
    // Validate format
    const trimmed = channelId.trim();
    if (trimmed && !trimmed.startsWith('@') && !trimmed.startsWith('-100')) {
      setFeedback({ type: 'error', msg: 'Channel must start with @ (public) or -100 (private)' });
      return;
    }
    
    setSaving(true);
    try {
      await updateConfig('required_channel', trimmed);
      setFeedback({ type: 'success', msg: trimmed ? 'Channel gate enabled! Users must join to use bot.' : 'Channel gate disabled.' });
    } catch (e: unknown) {
      setFeedback({ type: 'error', msg: (e as Error).message ?? 'Failed to save' });
    } finally {
      setSaving(false);
    }
  }

  const isEnabled = channelId.trim() !== '';

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader 
        title="📢 Channel Membership Gate" 
        subtitle="Require all bot users to join a Telegram channel"
      />
      
      <Alert type="info">
        When enabled, users must join the specified channel before using bot features.
        <br />
        <strong>Important:</strong> Make sure your bot (@f_bingobot) is an admin in the channel!
      </Alert>

      {error && <Alert type="error">{error}</Alert>}
      {feedback && <Alert type={feedback.type}>{feedback.msg}</Alert>}
      
      {loading ? (
        <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</p>
      ) : (
        <div style={{ marginTop: 16 }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 12,
            marginBottom: 16,
            padding: 12,
            background: isEnabled ? 'rgba(34, 197, 94, 0.1)' : 'rgba(100, 116, 139, 0.1)',
            borderRadius: 8,
            border: `1px solid ${isEnabled ? 'rgba(34, 197, 94, 0.3)' : 'rgba(100, 116, 139, 0.2)'}`
          }}>
            <div style={{ 
              fontSize: 24, 
              width: 40, 
              height: 40, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              borderRadius: 8,
              background: isEnabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(100, 116, 139, 0.15)'
            }}>
              {isEnabled ? '✅' : '⚠️'}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c-text)' }}>
                Status: {isEnabled ? 'Enabled' : 'Disabled'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 2 }}>
                {isEnabled ? `Users must join: ${channelId}` : 'Channel gate is currently disabled'}
              </div>
            </div>
          </div>

          <Field label="Channel ID or Username">
            <input
              style={{ ...inputCss, fontFamily: 'monospace' }}
              type="text"
              placeholder="@YourChannel or -1001234567890"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              disabled={saving}
            />
            <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 6 }}>
              • Public channel: <code style={{ background: 'var(--c-bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>@YourChannelUsername</code>
              <br />
              • Private channel: <code style={{ background: 'var(--c-bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>-1001234567890</code> (numeric ID)
              <br />
              • Leave empty to disable the gate
            </div>
          </Field>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Btn onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Channel Settings'}
            </Btn>
            {isEnabled && (
              <Btn 
                variant="danger" 
                onClick={() => { setChannelId(''); setFeedback(null); }}
                disabled={saving}
              >
                Clear (Disable Gate)
              </Btn>
            )}
          </div>

          <div style={{ 
            marginTop: 20, 
            padding: 16, 
            background: 'rgba(59, 130, 246, 0.08)', 
            borderRadius: 8,
            border: '1px solid rgba(59, 130, 246, 0.2)'
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', marginBottom: 10 }}>
              📖 Setup Instructions
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-muted)', lineHeight: 1.6 }}>
              <strong>1. Get your channel ID:</strong>
              <br />
              • For public channels: Use @username format (e.g., @FidelBingo)
              <br />
              • For private channels: Add @getmyid_bot to your channel, forward a message to it to get the ID
              <br /><br />
              <strong>2. Make bot an admin:</strong>
              <br />
              • Go to your channel settings → Administrators
              <br />
              • Add @f_bingobot as administrator
              <br />
              • Grant "View Messages" permission (required to check membership)
              <br /><br />
              <strong>3. Save and test:</strong>
              <br />
              • Enter your channel ID above and click Save
              <br />
              • Test with a fresh account - they should see "Join Channel" prompt
              <br />
              • After joining, they can use the bot normally
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Config section ─────────────────────────────────────────────────────────────
function ConfigSection() {
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowStates, setRowStates] = useState<Record<string, {
    value: string; saving: boolean;
    feedback: { type: 'success' | 'error'; msg: string } | null
  }>>({});

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
        setRowStates(p => p[key] ? { ...p, [key]: { ...p[key]!, feedback: { type: 'error', msg: '1000–30000 ms only' } } } : p);
        return;
      }
    }
    setRowStates(p => p[key] ? { ...p, [key]: { ...p[key]!, saving: true, feedback: null } } : p);
    try {
      const updated = await updateConfig(key, row.value);
      setEntries(prev => prev.map(e => e.key === key ? updated : e));
      setRowStates(p => p[key] ? { ...p, [key]: { ...p[key]!, saving: false, feedback: { type: 'success', msg: 'Saved' } } } : p);
    } catch (e: unknown) {
      setRowStates(p => p[key] ? { ...p, [key]: { ...p[key]!, saving: false, feedback: { type: 'error', msg: (e as Error).message ?? 'Failed' } } } : p);
    }
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader title="Configuration" subtitle="Changes take effect immediately" />
      {error && <Alert type="error">{error}</Alert>}
      {loading ? <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</p> : (
        <Table>
          <thead><tr><Th>Key</Th><Th>Value</Th><Th>Updated</Th><Th>Action</Th></tr></thead>
          <tbody>
            {!entries.length ? <TrEmpty cols={4} /> :
             entries.map((entry) => {
              const row = rowStates[entry.key];
              if (!row) return null;
              const isMs = ['claim_window_ms', 'call_interval_ms'].includes(entry.key);
              return (
                <tr key={entry.key}>
                  <Td mono style={{ fontWeight: 600 }}>{entry.key}</Td>
                  <Td style={{ minWidth: 220 }}>
                    <input
                      style={{ ...inputCss, maxWidth: 260 }}
                      type={isMs ? 'number' : 'text'}
                      min={isMs ? 1000 : undefined}
                      max={isMs ? 30000 : undefined}
                      value={row.value}
                      onChange={(e) => setVal(entry.key, e.target.value)}
                      disabled={row.saving}
                    />
                    {row.feedback && (
                      <span style={{
                        display: 'block', fontSize: 11, marginTop: 3,
                        color: row.feedback.type === 'success' ? '#4ade80' : '#f87171',
                      }}>
                        {row.feedback.type === 'success' ? '✓' : '✗'} {row.feedback.msg}
                      </span>
                    )}
                  </Td>
                  <Td muted>{new Date(entry.updated_at).toLocaleString()}</Td>
                  <Td>
                    <Btn size="sm" onClick={() => handleSave(entry.key)} disabled={row.saving}>
                      {row.saving ? '…' : 'Save'}
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

// ── Admin accounts ─────────────────────────────────────────────────────────────
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
        data.forEach(a => { init[a.id] = { saving: false, error: null }; });
        setRowActions(init);
        setLoading(false);
      })
      .catch((e: Error) => { setError(e.message ?? 'Failed to load admins'); setLoading(false); });
  }
  useEffect(() => { loadAdmins(); }, []);

  async function handleToggleActive(admin: AdminAccount) {
    setRowActions(p => ({ ...p, [admin.id]: { saving: true, error: null } }));
    try {
      const updated = await updateAdmin(admin.id, { is_active: !admin.is_active } as UpdateAdminRequest);
      setAdmins(p => p.map(a => a.id === admin.id ? updated : a));
      setRowActions(p => ({ ...p, [admin.id]: { saving: false, error: null } }));
    } catch (e: unknown) {
      setRowActions(p => ({ ...p, [admin.id]: { saving: false, error: (e as Error).message ?? 'Failed' } }));
    }
  }

  async function handleRoleChange(admin: AdminAccount, role: AdminRole) {
    setRowActions(p => ({ ...p, [admin.id]: { saving: true, error: null } }));
    try {
      const updated = await updateAdmin(admin.id, { role } as UpdateAdminRequest);
      setAdmins(p => p.map(a => a.id === admin.id ? updated : a));
      setRowActions(p => ({ ...p, [admin.id]: { saving: false, error: null } }));
    } catch (e: unknown) {
      setRowActions(p => ({ ...p, [admin.id]: { saving: false, error: (e as Error).message ?? 'Failed' } }));
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
      setAdmins(p => [...p, newAdmin]);
      setRowActions(p => ({ ...p, [newAdmin.id]: { saving: false, error: null } }));
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
      {loading ? <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</p> : (
        <div style={{ marginBottom: 28 }}>
          <Table>
            <thead><tr><Th>Username</Th><Th>Role</Th><Th>Status</Th><Th>Created</Th><Th>Actions</Th></tr></thead>
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
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                          style={{ ...selectCss, width: 'auto', padding: '4px 8px', fontSize: 12 }}
                          value={admin.role} disabled={ra.saving}
                          onChange={(e) => handleRoleChange(admin, e.target.value as AdminRole)}
                          aria-label={`Role for ${admin.username}`}>
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                        <Btn size="sm" variant={admin.is_active ? 'danger' : 'success'}
                          onClick={() => handleToggleActive(admin)} disabled={ra.saving}>
                          {ra.saving ? '…' : admin.is_active ? 'Deactivate' : 'Activate'}
                        </Btn>
                        {ra.error && <span style={{ fontSize: 12, color: '#f87171' }}>{ra.error}</span>}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}
      <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 22 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 16 }}>Create New Admin</div>
        {createMsg && <Alert type={createMsg.type}>{createMsg.text}</Alert>}
        <form onSubmit={handleCreateAdmin} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
          <Field label="Username">
            <input style={inputCss} type="text" placeholder="johndoe" value={createUsername}
              onChange={(e) => setCreateUsername(e.target.value)} disabled={creating} required />
          </Field>
          <Field label="Password">
            <input style={inputCss} type="password" placeholder="Secure password" value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)} disabled={creating} required />
          </Field>
          <Field label="Role">
            <select style={selectCss} value={createRole}
              onChange={(e) => setCreateRole(e.target.value as AdminRole)} disabled={creating}>
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

// ── Deposit accounts ──────────────────────────────────────────────────────────
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
      .then(data => { setAccounts(data); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newPhone.trim() || !newName.trim()) { setCreateMsg({ type: 'error', text: 'Phone and name are required.' }); return; }
    setCreating(true); setCreateMsg(null);
    try {
      const account = await createDepositAccount(newPhone.trim(), newName.trim());
      setAccounts(p => [account, ...p]);
      setNewPhone(''); setNewName('');
      setCreateMsg({ type: 'success', text: 'Account added.' });
    } catch (e: unknown) { setCreateMsg({ type: 'error', text: (e as Error).message ?? 'Failed' }); }
    finally { setCreating(false); }
  }

  async function handleToggle(account: DepositAccount) {
    setSaving(p => ({ ...p, [account.id]: true }));
    try {
      const updated = await updateDepositAccount(account.id, { is_active: !account.is_active });
      setAccounts(p => p.map(a => a.id === account.id ? updated : a));
    } finally { setSaving(p => ({ ...p, [account.id]: false })); }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this deposit account?')) return;
    setSaving(p => ({ ...p, [id]: true }));
    try {
      await deleteDepositAccount(id);
      setAccounts(p => p.filter(a => a.id !== id));
    } finally { setSaving(p => ({ ...p, [id]: false })); }
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader title="Deposit Accounts" subtitle="Active accounts are shown to players. One is picked at random." />
      {error && <Alert type="error">{error}</Alert>}
      {loading ? <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</p> : (
        <Table>
          <thead><tr><Th>Phone</Th><Th>Name</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {!accounts.length ? <TrEmpty cols={4} /> :
             accounts.map(a => (
              <tr key={a.id}>
                <Td mono>{a.phone}</Td>
                <Td>{a.name}</Td>
                <Td><Badge variant={a.is_active ? 'success' : 'neutral'}>{a.is_active ? 'Active' : 'Inactive'}</Badge></Td>
                <Td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn size="sm" variant={a.is_active ? 'danger' : 'success'}
                      onClick={() => handleToggle(a)} disabled={saving[a.id] ?? false}>
                      {saving[a.id] ? '…' : a.is_active ? 'Deactivate' : 'Activate'}
                    </Btn>
                    <Btn size="sm" variant="danger" onClick={() => handleDelete(a.id)} disabled={saving[a.id] ?? false}>
                      Delete
                    </Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 20, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 14 }}>Add Deposit Account</div>
        {createMsg && <Alert type={createMsg.type}>{createMsg.text}</Alert>}
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Phone">
            <input style={{ ...inputCss, width: 150 }} type="text" placeholder="0912345678"
              value={newPhone} onChange={e => setNewPhone(e.target.value)} disabled={creating} required />
          </Field>
          <Field label="Account Name">
            <input style={{ ...inputCss, width: 190 }} type="text" placeholder="Abebe Zewude"
              value={newName} onChange={e => setNewName(e.target.value)} disabled={creating} required />
          </Field>
          <Btn type="submit" disabled={creating}>{creating ? 'Adding…' : '+ Add Account'}</Btn>
        </form>
      </div>
    </Card>
  );
}

// ── Keno Access Control ───────────────────────────────────────────────────────
function KenoAccessSection() {
  const [mode, setMode] = useState<'all' | 'allowlist'>('all');
  const [ids, setIds] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fb, setFb] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    getConfig()
      .then((data) => {
        const val = data.find((e) => e.key === 'keno_allowed_ids')?.value ?? '';
        const trimmed = val.trim();
        if (trimmed && trimmed !== 'all') {
          setMode('allowlist');
          setIds(val);
        } else {
          setMode('all');
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setFb(null);
    try {
      const value = mode === 'all' ? 'all' : ids.trim();
      await updateConfig('keno_allowed_ids', value);
      setFb({ type: 'success', msg: mode === 'all' ? 'Keno is now open to all players.' : 'Allowlist saved. Only listed Telegram IDs can access Keno.' });
    } catch (e: unknown) {
      setFb({ type: 'error', msg: (e as Error).message ?? 'Failed to save' });
    } finally { setSaving(false); }
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader
        title="🔢 Keno Access Control"
        subtitle="Limit who can see and play Keno. Useful for testing before a full rollout."
      />
      {loading ? <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fb && <Alert type={fb.type}>{fb.msg}</Alert>}
          <div style={{ display: 'flex', gap: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} />
              Open to all players
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" checked={mode === 'allowlist'} onChange={() => setMode('allowlist')} />
              Allowlist only (testing)
            </label>
          </div>
          {mode === 'allowlist' && (
            <Field label="Telegram IDs (comma-separated)">
              <input
                style={inputCss}
                type="text"
                placeholder="e.g. 123456789, 987654321"
                value={ids}
                onChange={(e) => setIds(e.target.value)}
                disabled={saving}
              />
              <div style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 4 }}>
                Only players with these Telegram IDs will see and play Keno.
                To find your ID, message @userinfobot on Telegram.
              </div>
            </Field>
          )}
          <div>
            <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="fade-in">
      <PageHeader title="Settings" />
      <HouseEdgeSection />
      <CartelaLimitSection />
      <ChannelSettingsSection />
      <KenoAccessSection />
      <DepositAccountsSection />
      <ConfigSection />
      <AdminAccountsSection />
    </div>
  );
}
