import React, { useState, useEffect } from 'react';
import type { ConfigEntry, AdminAccount, CreateAdminRequest, UpdateAdminRequest, AdminRole } from '@fidel/shared';
import {
  getConfig, updateConfig, getAdmins, createAdmin, updateAdmin,
  getDepositAccounts, createDepositAccount, updateDepositAccount, deleteDepositAccount,
} from '../lib/api';
import type { DepositAccount } from '../lib/api';
import {
  Btn, Badge, Card, CardHeader, Table, Th, Td,
  TrEmpty, Alert, Field, PageHeader, inputCss, selectCss,
} from '../components/ui';

// ─── Shared styles ────────────────────────────────────────────────────────────

const sectionTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'var(--c-muted)', marginBottom: 12,
};

const statBox = (color: string): React.CSSProperties => ({
  flex: 1, minWidth: 120, padding: '14px 18px', borderRadius: 12,
  background: `${color}12`, border: `1px solid ${color}30`,
  display: 'flex', flexDirection: 'column', gap: 4,
});


// ─── House Edge ───────────────────────────────────────────────────────────────

function HouseEdgeSection() {
  const [crash, setCrash] = useState('15');
  const [slots, setSlots] = useState('15');
  const [keno, setKeno] = useState('15');
  const [plinko, setPlinko] = useState('15');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [fb, setFb] = useState<Record<string, { type: 'success' | 'error'; msg: string } | null>>({});

  useEffect(() => {
    getConfig().then((data) => {
      setCrash(data.find(e => e.key === 'house_edge_crash')?.value ?? '15');
      setSlots(data.find(e => e.key === 'house_edge_slots')?.value ?? '15');
      setKeno(data.find(e => e.key === 'house_edge_keno')?.value ?? '15');
      setPlinko(data.find(e => e.key === 'house_edge_plinko')?.value ?? '15');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function save(game: string, val: string) {
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 5 || n > 50) {
      setFb(p => ({ ...p, [game]: { type: 'error', msg: 'Must be 5–50' } }));
      return;
    }
    setSaving(p => ({ ...p, [game]: true }));
    setFb(p => ({ ...p, [game]: null }));
    try {
      await updateConfig(`house_edge_${game}`, String(n));
      setFb(p => ({ ...p, [game]: { type: 'success', msg: `Set to ${n}% — RTP ${100 - n}%` } }));
    } catch (e: unknown) {
      setFb(p => ({ ...p, [game]: { type: 'error', msg: (e as Error).message ?? 'Failed' } }));
    } finally { setSaving(p => ({ ...p, [game]: false })); }
  }

  const games = [
    { key: 'crash', label: 'Aviator', icon: '✈️', color: '#ef4444', val: crash, set: setCrash },
    { key: 'slots', label: 'Slots',   icon: '🎰', color: '#f59e0b', val: slots, set: setSlots },
    { key: 'keno',  label: 'Keno',    icon: '🎱', color: '#3b82f6', val: keno,  set: setKeno  },
    { key: 'plinko',label: 'Plinko',  icon: '🪃', color: '#8b5cf6', val: plinko,set: setPlinko},
  ];

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 24 }}>
        Controls the profit margin per game. Takes effect on the next round/spin.
      </p>
      {loading ? <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {games.map(g => {
            const n = parseInt(g.val, 10) || 0;
            const rtp = 100 - n;
            return (
              <div key={g.key} style={{
                background: 'var(--c-bg-card)', border: '1px solid var(--c-border)',
                borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
              }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 20, width: 38, height: 38, borderRadius: 10,
                      background: `${g.color}18`, border: `1px solid ${g.color}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{g.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--c-text)' }}>{g.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={statBox(g.color)}>
                      <span style={{ fontSize: 9, color: 'var(--c-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Edge</span>
                      <span style={{ fontSize: 18, fontWeight: 900, color: g.color }}>{n}%</span>
                    </div>
                    <div style={statBox('#4ade80')}>
                      <span style={{ fontSize: 9, color: 'var(--c-muted)', fontWeight: 700, textTransform: 'uppercase' }}>RTP</span>
                      <span style={{ fontSize: 18, fontWeight: 900, color: '#4ade80' }}>{rtp}%</span>
                    </div>
                  </div>
                </div>

                {/* Slider */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--c-muted)', marginBottom: 6 }}>
                    <span>5% (player-friendly)</span><span>50% (house-max)</span>
                  </div>
                  <input type="range" min={5} max={50} step={1} value={g.val}
                    onChange={e => g.set(e.target.value)}
                    disabled={saving[g.key]}
                    style={{ width: '100%', accentColor: g.color }} />
                </div>

                {fb[g.key] && <Alert type={fb[g.key]!.type}>{fb[g.key]!.msg}</Alert>}

                {/* Input + save */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="number" min={5} max={50} value={g.val}
                    onChange={e => g.set(e.target.value)}
                    disabled={saving[g.key]}
                    style={{ ...inputCss, width: 72, textAlign: 'center', fontWeight: 700 }} />
                  <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>%</span>
                  <Btn onClick={() => save(g.key, g.val)} disabled={!!saving[g.key]} fullWidth>
                    {saving[g.key] ? 'Saving…' : 'Save'}
                  </Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─── Cartela Settings ─────────────────────────────────────────────────────────

function CartelaLimitSection() {
  const [limit, setLimit] = useState('2');
  const [poolSize, setPoolSize] = useState('800');
  const [loading, setLoading] = useState(true);
  const [savingLimit, setSavingLimit] = useState(false);
  const [savingPool, setSavingPool] = useState(false);
  const [fbLimit, setFbLimit] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [fbPool, setFbPool] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    getConfig().then((data) => {
      setLimit(data.find(e => e.key === 'max_cartelas_per_player')?.value ?? '2');
      setPoolSize(data.find(e => e.key === 'active_cartela_count')?.value ?? '800');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function saveLimit() {
    const n = parseInt(limit, 10);
    if (isNaN(n) || n < 1 || n > 10) { setFbLimit({ type: 'error', msg: 'Must be 1–10' }); return; }
    setSavingLimit(true); setFbLimit(null);
    try {
      await updateConfig('max_cartelas_per_player', String(n));
      setFbLimit({ type: 'success', msg: `Max set to ${n} per player` });
    } catch (e: unknown) { setFbLimit({ type: 'error', msg: (e as Error).message ?? 'Failed' }); }
    finally { setSavingLimit(false); }
  }

  async function savePool() {
    const n = parseInt(poolSize, 10);
    if (isNaN(n) || n < 1 || n > 800) { setFbPool({ type: 'error', msg: 'Must be 1–800' }); return; }
    setSavingPool(true); setFbPool(null);
    try {
      await updateConfig('active_cartela_count', String(n));
      setFbPool({ type: 'success', msg: `Players see cartelas 1–${n}` });
    } catch (e: unknown) { setFbPool({ type: 'error', msg: (e as Error).message ?? 'Failed' }); }
    finally { setSavingPool(false); }
  }

  if (loading) return <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</p>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
      {[
        {
          label: 'Available Cartela Pool', icon: '🎴', color: '#f59e0b',
          hint: 'Players only see cartelas 1 through this number. Max 800.',
          val: poolSize, set: setPoolSize, min: 1, max: 800,
          saving: savingPool, fb: fbPool, onSave: savePool,
        },
        {
          label: 'Max Per Player / Round', icon: '👤', color: '#3b82f6',
          hint: 'How many cartelas one player can hold in a single round.',
          val: limit, set: setLimit, min: 1, max: 10,
          saving: savingLimit, fb: fbLimit, onSave: saveLimit,
        },
      ].map(item => (
        <div key={item.label} style={{
          background: 'var(--c-bg-card)', border: '1px solid var(--c-border)',
          borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontSize: 20, width: 38, height: 38, borderRadius: 10,
              background: `${item.color}18`, border: `1px solid ${item.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{item.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c-text)' }}>{item.label}</div>
              <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 2 }}>{item.hint}</div>
            </div>
          </div>
          {item.fb && <Alert type={item.fb.type}>{item.fb.msg}</Alert>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="number" min={item.min} max={item.max} value={item.val}
              onChange={e => item.set(e.target.value)} disabled={item.saving}
              style={{ ...inputCss, width: 90, fontWeight: 700, textAlign: 'center' }} />
            <Btn onClick={item.onSave} disabled={item.saving} fullWidth>
              {item.saving ? 'Saving…' : 'Save'}
            </Btn>
          </div>
        </div>
      ))}
    </div>
  );
}


// ─── Channel Gate ─────────────────────────────────────────────────────────────

function ChannelSettingsSection() {
  const [channelId, setChannelId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fb, setFb] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    getConfig().then((data) => {
      setChannelId(data.find(e => e.key === 'required_channel')?.value ?? '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    setFb(null);
    const trimmed = channelId.trim();
    if (trimmed && !trimmed.startsWith('@') && !trimmed.startsWith('-100')) {
      setFb({ type: 'error', msg: 'Must start with @ (public) or -100 (private)' }); return;
    }
    setSaving(true);
    try {
      await updateConfig('required_channel', trimmed);
      setFb({ type: 'success', msg: trimmed ? 'Channel gate enabled.' : 'Channel gate disabled.' });
    } catch (e: unknown) {
      setFb({ type: 'error', msg: (e as Error).message ?? 'Failed' });
    } finally { setSaving(false); }
  }

  const isEnabled = channelId.trim() !== '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: 16,
        borderRadius: 12, border: `1px solid ${isEnabled ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.2)'}`,
        background: isEnabled ? 'rgba(34,197,94,0.07)' : 'rgba(100,116,139,0.07)',
      }}>
        <span style={{ fontSize: 24 }}>{isEnabled ? '✅' : '⚠️'}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c-text)' }}>
            Status: {isEnabled ? 'Enabled' : 'Disabled'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 2 }}>
            {isEnabled ? `Required channel: ${channelId}` : 'No membership requirement active'}
          </div>
        </div>
      </div>

      <Alert type="info">
        Make sure <strong>@f_bingobot</strong> is an admin in the channel before enabling this.
      </Alert>

      {fb && <Alert type={fb.type}>{fb.msg}</Alert>}

      {loading ? <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</p> : (
        <>
          <Field label="Channel ID or Username">
            <input style={{ ...inputCss, fontFamily: 'monospace' }} type="text"
              placeholder="@YourChannel or -1001234567890"
              value={channelId} onChange={e => setChannelId(e.target.value)} disabled={saving} />
            <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 6, lineHeight: 1.6 }}>
              Public: <code style={{ background: 'var(--c-bg-secondary)', padding: '1px 5px', borderRadius: 4 }}>@ChannelUsername</code>
              {'  '}·{'  '}
              Private: <code style={{ background: 'var(--c-bg-secondary)', padding: '1px 5px', borderRadius: 4 }}>-1001234567890</code>
              {'  '}·{'  '}Leave empty to disable.
            </div>
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
            {isEnabled && (
              <Btn variant="danger" onClick={() => { setChannelId(''); setFb(null); }} disabled={saving}>
                Clear
              </Btn>
            )}
          </div>
        </>
      )}
    </div>
  );
}


// ─── Access Control (shared for Keno / Plinko) ────────────────────────────────

function AccessControlSection({
  configKey, idType, placeholder,
}: { configKey: string; idType: 'ids' | 'usernames'; placeholder: string }) {
  const [mode, setMode] = useState<'all' | 'allowlist'>('all');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fb, setFb] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    getConfig().then((data) => {
      const val = data.find(e => e.key === configKey)?.value?.trim() ?? '';
      if (val && val !== 'all') { setMode('allowlist'); setValue(val); }
      else setMode('all');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [configKey]);

  async function save() {
    setSaving(true); setFb(null);
    try {
      await updateConfig(configKey, mode === 'all' ? 'all' : value.trim());
      setFb({ type: 'success', msg: mode === 'all' ? 'Open to all players.' : 'Allowlist saved.' });
    } catch (e: unknown) {
      setFb({ type: 'error', msg: (e as Error).message ?? 'Failed' });
    } finally { setSaving(false); }
  }

  const tags = value.split(',').map(s => s.trim()).filter(Boolean);

  if (loading) return <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {fb && <Alert type={fb.type}>{fb.msg}</Alert>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {(['all', 'allowlist'] as const).map(m => (
          <label key={m} style={{
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            border: `1px solid ${mode === m ? 'rgba(99,102,241,0.5)' : 'var(--c-border)'}`,
            background: mode === m ? 'rgba(99,102,241,0.1)' : 'transparent',
            color: mode === m ? '#818cf8' : 'var(--c-muted)',
            transition: 'all 0.15s',
          }}>
            <input type="radio" checked={mode === m} onChange={() => setMode(m)} style={{ display: 'none' }} />
            {m === 'all' ? '🌍 Open to all' : '🔒 Allowlist only'}
          </label>
        ))}
      </div>

      {mode === 'allowlist' && (
        <div>
          <Field label={idType === 'ids' ? 'Telegram IDs (comma-separated)' : 'Usernames (comma-separated)'}>
            <input style={inputCss} type="text" placeholder={placeholder}
              value={value} onChange={e => { setValue(e.target.value); setFb(null); }} disabled={saving} />
          </Field>
          {tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {tags.map(t => (
                <span key={t} style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.3)',
                  color: '#818cf8',
                }}>
                  {idType === 'usernames' ? `@${t}` : t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <div><Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn></div>
    </div>
  );
}


// ─── Config Table ─────────────────────────────────────────────────────────────

function ConfigSection() {
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowStates, setRowStates] = useState<Record<string, {
    value: string; saving: boolean;
    feedback: { type: 'success' | 'error'; msg: string } | null;
  }>>({});

  useEffect(() => {
    setLoading(true);
    getConfig().then((data) => {
      setEntries(data);
      const init: typeof rowStates = {};
      data.forEach(e => { init[e.key] = { value: e.value, saving: false, feedback: null }; });
      setRowStates(init);
      setLoading(false);
    }).catch((e: Error) => { setError(e.message ?? 'Failed'); setLoading(false); });
  }, []);

  function setVal(key: string, value: string) {
    setRowStates(p => p[key] ? { ...p, [key]: { ...p[key]!, value, feedback: null } } : p);
  }

  async function handleSave(key: string) {
    const row = rowStates[key]; if (!row) return;
    if (['claim_window_ms', 'call_interval_ms'].includes(key)) {
      const n = parseInt(row.value, 10);
      if (isNaN(n) || n < 1000 || n > 30000) {
        setRowStates(p => p[key] ? { ...p, [key]: { ...p[key]!, feedback: { type: 'error', msg: '1000–30000ms' } } } : p);
        return;
      }
    }
    setRowStates(p => p[key] ? { ...p, [key]: { ...p[key]!, saving: true } } : p);
    try {
      const updated = await updateConfig(key, row.value);
      setEntries(prev => prev.map(e => e.key === key ? updated : e));
      setRowStates(p => p[key] ? { ...p, [key]: { ...p[key]!, saving: false, feedback: { type: 'success', msg: 'Saved' } } } : p);
    } catch (e: unknown) {
      setRowStates(p => p[key] ? { ...p, [key]: { ...p[key]!, saving: false, feedback: { type: 'error', msg: (e as Error).message ?? 'Failed' } } } : p);
    }
  }

  return (
    <div>
      {error && <Alert type="error">{error}</Alert>}
      {loading ? <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</p> : (
        <Table>
          <thead><tr><Th>Key</Th><Th>Value</Th><Th>Updated</Th><Th>Action</Th></tr></thead>
          <tbody>
            {!entries.length ? <TrEmpty cols={4} /> :
             entries.map(entry => {
               const row = rowStates[entry.key]; if (!row) return null;
               const isMs = ['claim_window_ms', 'call_interval_ms'].includes(entry.key);
               return (
                 <tr key={entry.key}>
                   <Td mono style={{ fontWeight: 600 }}>{entry.key}</Td>
                   <Td style={{ minWidth: 220 }}>
                     <input style={{ ...inputCss, maxWidth: 260 }}
                       type={isMs ? 'number' : 'text'}
                       min={isMs ? 1000 : undefined} max={isMs ? 30000 : undefined}
                       value={row.value} onChange={e => setVal(entry.key, e.target.value)} disabled={row.saving} />
                     {row.feedback && (
                       <span style={{ display: 'block', fontSize: 11, marginTop: 3, color: row.feedback.type === 'success' ? '#4ade80' : '#f87171' }}>
                         {row.feedback.type === 'success' ? '✓' : '✗'} {row.feedback.msg}
                       </span>
                     )}
                   </Td>
                   <Td muted>{new Date(entry.updated_at).toLocaleString()}</Td>
                   <Td><Btn size="sm" onClick={() => handleSave(entry.key)} disabled={row.saving}>{row.saving ? '…' : 'Save'}</Btn></Td>
                 </tr>
               );
             })}
          </tbody>
        </Table>
      )}
    </div>
  );
}


// ─── Admin Accounts ───────────────────────────────────────────────────────────

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
    getAdmins().then(data => {
      setAdmins(data);
      const init: typeof rowActions = {};
      data.forEach(a => { init[a.id] = { saving: false, error: null }; });
      setRowActions(init);
      setLoading(false);
    }).catch((e: Error) => { setError(e.message ?? 'Failed'); setLoading(false); });
  }
  useEffect(() => { loadAdmins(); }, []);

  async function handleToggle(admin: AdminAccount) {
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createUsername.trim() || !createPassword.trim()) {
      setCreateMsg({ type: 'error', text: 'Username and password required.' }); return;
    }
    setCreating(true); setCreateMsg(null);
    try {
      const newAdmin = await createAdmin({ username: createUsername.trim(), password: createPassword.trim(), role: createRole } as CreateAdminRequest);
      setAdmins(p => [...p, newAdmin]);
      setRowActions(p => ({ ...p, [newAdmin.id]: { saving: false, error: null } }));
      setCreateUsername(''); setCreatePassword(''); setCreateRole('admin');
      setCreateMsg({ type: 'success', text: `Admin "${newAdmin.username}" created.` });
    } catch (e: unknown) {
      setCreateMsg({ type: 'error', text: (e as Error).message ?? 'Failed' });
    } finally { setCreating(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Alert type="info">Role changes and deactivation require super_admin access.</Alert>
      {error && <Alert type="error">{error}</Alert>}
      {loading ? <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</p> : (
        <Table>
          <thead><tr><Th>Username</Th><Th>Role</Th><Th>Status</Th><Th>Created</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {!admins.length ? <TrEmpty cols={5} /> :
             admins.map(admin => {
               const ra = rowActions[admin.id] ?? { saving: false, error: null };
               return (
                 <tr key={admin.id}>
                   <Td><span style={{ fontWeight: 600 }}>{admin.username}</span></Td>
                   <Td><Badge variant={admin.role === 'super_admin' ? 'primary' : 'neutral'}>{admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}</Badge></Td>
                   <Td><Badge variant={admin.is_active ? 'success' : 'danger'}>{admin.is_active ? 'Active' : 'Inactive'}</Badge></Td>
                   <Td muted>{new Date(admin.created_at).toLocaleDateString()}</Td>
                   <Td>
                     <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                       <select style={{ ...selectCss, width: 'auto', padding: '4px 8px', fontSize: 12 }}
                         value={admin.role} disabled={ra.saving}
                         onChange={e => handleRoleChange(admin, e.target.value as AdminRole)}>
                         <option value="admin">Admin</option>
                         <option value="super_admin">Super Admin</option>
                       </select>
                       <Btn size="sm" variant={admin.is_active ? 'danger' : 'success'}
                         onClick={() => handleToggle(admin)} disabled={ra.saving}>
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
      )}

      <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 20 }}>
        <p style={sectionTitle}>Create New Admin</p>
        {createMsg && <Alert type={createMsg.type}>{createMsg.text}</Alert>}
        <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, maxWidth: 680 }}>
          <Field label="Username">
            <input style={inputCss} type="text" placeholder="johndoe"
              value={createUsername} onChange={e => setCreateUsername(e.target.value)} disabled={creating} required />
          </Field>
          <Field label="Password">
            <input style={inputCss} type="password" placeholder="Secure password"
              value={createPassword} onChange={e => setCreatePassword(e.target.value)} disabled={creating} required />
          </Field>
          <Field label="Role">
            <select style={selectCss} value={createRole}
              onChange={e => setCreateRole(e.target.value as AdminRole)} disabled={creating}>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </Field>
          <Field label=" ">
            <Btn type="submit" disabled={creating} fullWidth>
              {creating ? 'Creating…' : '+ Create Admin'}
            </Btn>
          </Field>
        </form>
      </div>
    </div>
  );
}


// ─── Deposit Accounts ─────────────────────────────────────────────────────────

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
    getDepositAccounts().then(data => { setAccounts(data); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newPhone.trim() || !newName.trim()) { setCreateMsg({ type: 'error', text: 'Phone and name required.' }); return; }
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ fontSize: 13, color: 'var(--c-muted)', margin: 0 }}>
        Active accounts are shown to players at random when they deposit.
      </p>
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

      <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 20 }}>
        <p style={sectionTitle}>Add Deposit Account</p>
        {createMsg && <Alert type={createMsg.type}>{createMsg.text}</Alert>}
        <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, maxWidth: 560 }}>
          <Field label="Phone">
            <input style={inputCss} type="text" placeholder="0912345678"
              value={newPhone} onChange={e => setNewPhone(e.target.value)} disabled={creating} required />
          </Field>
          <Field label="Account Name">
            <input style={inputCss} type="text" placeholder="Abebe Zewude"
              value={newName} onChange={e => setNewName(e.target.value)} disabled={creating} required />
          </Field>
          <Field label=" ">
            <Btn type="submit" disabled={creating} fullWidth>
              {creating ? 'Adding…' : '+ Add'}
            </Btn>
          </Field>
        </form>
      </div>
    </div>
  );
}


// ─── Settings Page — tabbed layout ───────────────────────────────────────────

const TABS = [
  { key: 'house_edge',    label: 'House Edge',       icon: '🎰' },
  { key: 'cartela',       label: 'Cartela',           icon: '🎴' },
  { key: 'channel',       label: 'Channel Gate',      icon: '📢' },
  { key: 'access',        label: 'Access Control',    icon: '🔒' },
  { key: 'deposits',      label: 'Deposit Accounts',  icon: '💳' },
  { key: 'config',        label: 'Raw Config',        icon: '⚙️' },
  { key: 'admins',        label: 'Admin Accounts',    icon: '👤' },
] as const;

type TabKey = typeof TABS[number]['key'];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('house_edge');

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`
        @media (max-width: 640px) {
          .settings-layout { flex-direction: column !important; }
          .settings-sidebar { flex-direction: row !important; overflow-x: auto; border-right: none !important; border-bottom: 1px solid var(--c-border) !important; padding: 8px !important; gap: 4px !important; }
          .settings-tab-btn { flex-direction: row !important; padding: 8px 12px !important; white-space: nowrap; border-radius: 8px !important; }
          .settings-tab-icon { font-size: 14px !important; }
          .settings-tab-label { font-size: 12px !important; }
        }
      `}</style>

      <PageHeader title="Settings" />

      <div className="settings-layout" style={{
        display: 'flex', flex: 1, gap: 0,
        background: 'var(--c-bg-card)', border: '1px solid var(--c-border)',
        borderRadius: 16, overflow: 'hidden', minHeight: 0,
      }}>
        {/* Sidebar */}
        <nav className="settings-sidebar" style={{
          width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--c-border)', padding: 12, gap: 2,
          background: 'rgba(0,0,0,0.15)',
        }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                className="settings-tab-btn"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  gap: 4, padding: '10px 14px', borderRadius: 10, border: 'none',
                  cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
                  background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
                  borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
                }}
              >
                <span className="settings-tab-icon" style={{ fontSize: 16 }}>{tab.icon}</span>
                <span className="settings-tab-label" style={{
                  fontSize: 12, fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#818cf8' : 'var(--c-muted)',
                  lineHeight: 1.2,
                }}>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div style={{ flex: 1, padding: 28, overflowY: 'auto', minWidth: 0 }}>
          {/* Section header */}
          {(() => {
            const tab = TABS.find(t => t.key === activeTab)!;
            return (
              <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--c-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    fontSize: 22, width: 44, height: 44, borderRadius: 12,
                    background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{tab.icon}</span>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--c-text)' }}>{tab.label}</h2>
                  </div>
                </div>
              </div>
            );
          })()}

          {activeTab === 'house_edge' && <HouseEdgeSection />}
          {activeTab === 'cartela'    && <CartelaLimitSection />}
          {activeTab === 'channel'    && <ChannelSettingsSection />}
          {activeTab === 'access'     && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              <div>
                <p style={sectionTitle}>🎱 Keno Access</p>
                <AccessControlSection configKey="keno_allowed_ids" idType="ids" placeholder="123456789, 987654321" />
              </div>
              <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 24 }}>
                <p style={sectionTitle}>🪃 Plinko Access</p>
                <AccessControlSection configKey="plinko_allowed_usernames" idType="usernames" placeholder="kanu_1921, other_user" />
              </div>
            </div>
          )}
          {activeTab === 'deposits'   && <DepositAccountsSection />}
          {activeTab === 'config'     && <ConfigSection />}
          {activeTab === 'admins'     && <AdminAccountsSection />}
        </div>
      </div>
    </div>
  );
}
