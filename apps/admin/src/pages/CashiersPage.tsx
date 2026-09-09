import React, { useEffect, useState } from 'react';
import {
  Btn, Badge, Card, CardHeader, Table, Th, Td, TrEmpty, TrLoading,
  Alert, Field, PageHeader, inputCss,
} from '../components/ui';
import { adminApiRequest } from '../lib/api';

interface Cashier {
  id: string;
  username: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        background: 'var(--c-bg-card)', border: '1px solid var(--c-border)',
        borderRadius: 20, padding: 24, width: '100%', maxWidth: 440,
        boxShadow: '0 32px 64px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--c-text)' }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'rgba(148,163,184,0.08)', border: '1px solid var(--c-border)',
            borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
            color: 'var(--c-muted)', fontSize: 18, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CashiersPage() {
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [resetTarget, setResetTarget] = useState<Cashier | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const [linkInfo, setLinkInfo] = useState<{ deepLink: string; miniAppUrl: string } | null>(null);
  const [linkCashierName, setLinkCashierName] = useState('');

  async function load() {
    try {
      setLoading(true);
      const data = await adminApiRequest<{ cashiers: Cashier[] }>('GET', '/api/admin/cashiers');
      setCashiers(data.cashiers);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateLoading(true); setCreateError(null);
    try {
      await adminApiRequest('POST', '/api/admin/cashiers', { username, password, displayName });
      setShowCreate(false); setUsername(''); setPassword(''); setDisplayName('');
      await load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create cashier');
    } finally { setCreateLoading(false); }
  }

  async function toggleActive(cashier: Cashier) {
    const endpoint = cashier.is_active ? 'suspend' : 'restore';
    try {
      await adminApiRequest('PATCH', `/api/admin/cashiers/${cashier.id}/${endpoint}`);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update');
    }
  }

  async function handleDelete(cashier: Cashier) {
    if (!confirm(`Delete cashier "${cashier.username}"? This cannot be undone.`)) return;
    try {
      await adminApiRequest('DELETE', `/api/admin/cashiers/${cashier.id}`);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  async function showLink(cashier: Cashier) {
    try {
      const data = await adminApiRequest<{ deepLink: string; miniAppUrl: string }>(
        'GET', `/api/admin/cashiers/link/${cashier.id}`,
      );
      setLinkInfo(data);
      setLinkCashierName(cashier.username);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to get link');
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetLoading(true);
    try {
      await adminApiRequest('PATCH', `/api/admin/cashiers/${resetTarget.id}/reset-password`, { password: newPassword });
      setResetTarget(null); setNewPassword('');
      alert('Password reset successfully');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to reset password');
    } finally { setResetLoading(false); }
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        title="Cashiers"
        action={<Btn variant="primary" size="sm" onClick={() => setShowCreate(true)}>+ New Cashier</Btn>}
      />

      {error && (
        <div style={{ marginBottom: 16 }}>
          <Alert type="error">{error}</Alert>
        </div>
      )}

      <Card>
        <CardHeader title="All Cashiers" subtitle="Cashier accounts can approve/reject deposits and withdrawals via the Telegram mini-app" />
        <Table>
          <thead>
            <tr>
              <Th>Username</Th>
              <Th>Display Name</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <TrLoading cols={5} />}
            {!loading && cashiers.length === 0 && <TrEmpty cols={5} message="No cashiers yet. Create one above." />}
            {cashiers.map((c) => (
              <tr key={c.id}>
                <Td><code style={{ fontSize: 13 }}>{c.username}</code></Td>
                <Td>{c.display_name}</Td>
                <Td><Badge variant={c.is_active ? 'success' : 'neutral'}>{c.is_active ? 'Active' : 'Suspended'}</Badge></Td>
                <Td>{new Date(c.created_at).toLocaleDateString()}</Td>
                <Td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Btn size="sm" variant="ghost" onClick={() => void showLink(c)}>Get Link</Btn>
                    <Btn size="sm" variant="outline" onClick={() => { setResetTarget(c); setNewPassword(''); }}>
                      Reset PW
                    </Btn>
                    <Btn size="sm" variant={c.is_active ? 'danger' : 'success'} onClick={() => void toggleActive(c)}>
                      {c.is_active ? 'Suspend' : 'Restore'}
                    </Btn>
                    <Btn size="sm" variant="danger" onClick={() => void handleDelete(c)}>Delete</Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {showCreate && (
        <Modal title="Create Cashier" onClose={() => setShowCreate(false)}>
          <form onSubmit={(e) => void handleCreate(e)}>
            {createError && (
              <div style={{ marginBottom: 12 }}>
                <Alert type="error">{createError}</Alert>
              </div>
            )}
            <Field label="Username">
              <input
                style={inputCss}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. cashier1"
                required
                autoComplete="off"
              />
            </Field>
            <Field label="Display Name">
              <input
                style={inputCss}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Main Branch Cashier"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                style={inputCss}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                required
              />
            </Field>
            <Btn type="submit" variant="primary" fullWidth disabled={createLoading}>
              {createLoading ? 'Creating…' : 'Create Cashier'}
            </Btn>
          </form>
        </Modal>
      )}

      {resetTarget && (
        <Modal title={`Reset Password — ${resetTarget.username}`} onClose={() => setResetTarget(null)}>
          <form onSubmit={(e) => void handleResetPassword(e)}>
            <Field label="New Password">
              <input
                type="password"
                style={inputCss}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                required
              />
            </Field>
            <Btn type="submit" variant="primary" fullWidth disabled={resetLoading}>
              {resetLoading ? 'Saving…' : 'Reset Password'}
            </Btn>
          </form>
        </Modal>
      )}

      {linkInfo && (
        <Modal title={`Cashier Link — ${linkCashierName}`} onClose={() => setLinkInfo(null)}>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--c-muted)', lineHeight: 1.6 }}>
            Send the Telegram deep-link to the cashier. When they tap it, the bot opens the cashier app directly.
          </p>
          <Field label="Telegram Deep-Link">
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly style={{ ...inputCss, flex: 1, fontSize: 12 }} value={linkInfo.deepLink} />
              <Btn size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(linkInfo.deepLink); }}>Copy</Btn>
            </div>
          </Field>
          <Field label="Direct Mini-App URL">
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly style={{ ...inputCss, flex: 1, fontSize: 12 }} value={linkInfo.miniAppUrl} />
              <Btn size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(linkInfo.miniAppUrl); }}>Copy</Btn>
            </div>
          </Field>
        </Modal>
      )}
    </div>
  );
}
