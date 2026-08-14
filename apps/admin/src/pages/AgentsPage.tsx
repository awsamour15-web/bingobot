import React, { useEffect, useState } from 'react';
import {
  Btn, Badge, Card, CardHeader, Table, Th, Td, TrEmpty, TrLoading,
  Alert, Field, PageHeader, inputCss,
} from '../components/ui';
import {
  listAgents, createAgent, suspendAgent, restoreAgent, getAgentDetail,
  getPendingAgents, approveAgent, rejectAgent,
  type AgentSummary, type AgentDetail, type PendingAgent,
} from '../lib/api';

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [pendingAgents, setPendingAgents] = useState<PendingAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const [agentsRes, pendingRes] = await Promise.all([listAgents(), getPendingAgents()]);
      setAgents(agentsRes.agents);
      setPendingAgents(pendingRes.agents);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createUsername.trim()) return;
    setCreateLoading(true);
    try {
      const res = await createAgent(createUsername.trim());
      setCreatedLink(res.agent.agentInviteLink);
      setCreateUsername('');
      void load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to create agent');
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleApprove(id: string) {
    try { await approveAgent(id); void load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
  }

  async function handleReject(id: string) {
    if (!confirm('Reject this agent application?')) return;
    try { await rejectAgent(id); void load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
  }

  async function handleDetail(id: string) {
    setDetailLoading(true); setDetail(null);
    try { const res = await getAgentDetail(id); setDetail(res.agent); }
    finally { setDetailLoading(false); }
  }

  return (
    <div className="fade-in">
      <PageHeader
        title="Agents"
        action={
          <Btn onClick={() => { setShowCreate(true); setCreatedLink(null); }}>
            + Create Agent
          </Btn>
        }
      />

      {loading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}
      {error && <Alert type="error">{error}</Alert>}

      {/* Pending Approvals */}
      {!loading && !error && pendingAgents.length > 0 && (
        <Card style={{ marginBottom: 24, border: '1px solid #f59e0b' }}>
          <CardHeader
            title={`⏳ Pending Approvals (${pendingAgents.length})`}
            subtitle="These agents are waiting for approval"
          />
          <Table>
            <thead>
              <tr>
                <Th>Username</Th>
                <Th>Telegram ID</Th>
                <Th>Applied</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {pendingAgents.map((a) => (
                <tr key={a.id}>
                  <Td><span style={{ fontWeight: 600 }}>@{a.telegramUsername}</span></Td>
                  <Td mono>{a.telegramId || '—'}</Td>
                  <Td muted>{new Date(a.createdAt).toLocaleDateString()}</Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn size="sm" variant="success" onClick={() => handleApprove(a.id)}>✓ Approve</Btn>
                      <Btn size="sm" variant="danger" onClick={() => handleReject(a.id)}>✗ Reject</Btn>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Agents Table */}
      {!loading && !error && (
        <Card>
          <CardHeader title="All Agents" />
          <Table>
            <thead>
              <tr>
                <Th>Username</Th>
                <Th>Invite Link</Th>
                <Th>Players</Th>
                <Th>Commission</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {agents.length === 0
                ? <TrEmpty cols={7} message="No agents yet." />
                : agents.map((a) => (
                  <tr key={a.id}>
                    <Td><span style={{ fontWeight: 600 }}>@{a.telegramUsername}</span></Td>
                    <Td>
                      <a href={a.agentInviteLink} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#6366f1', fontSize: 12, wordBreak: 'break-all' }}>
                        {a.agentInviteLink}
                      </a>
                    </Td>
                    <Td>{a.totalPlayersInvited}</Td>
                    <Td><span style={{ fontWeight: 600, color: '#22c55e' }}>ETB {a.totalCommission.toFixed(2)}</span></Td>
                    <Td>
                      <Badge variant={
                        a.approvalStatus === 'approved' && a.isActive ? 'success'
                          : a.approvalStatus === 'rejected' ? 'danger'
                          : a.approvalStatus === 'pending' ? 'warning'
                          : 'neutral'
                      }>
                        {a.approvalStatus === 'pending' ? 'Pending'
                          : a.approvalStatus === 'rejected' ? 'Rejected'
                          : a.isActive ? 'Active' : 'Suspended'}
                      </Badge>
                    </Td>
                    <Td muted>{new Date(a.createdAt).toLocaleDateString()}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn size="sm" variant="outline" onClick={() => handleDetail(a.id)}>Detail</Btn>
                        {a.isActive
                          ? <Btn size="sm" variant="danger" onClick={() => suspendAgent(a.id).then(load)}>Suspend</Btn>
                          : <Btn size="sm" variant="success" onClick={() => restoreAgent(a.id).then(load)}>Restore</Btn>
                        }
                      </div>
                    </Td>
                  </tr>
                ))
              }
            </tbody>
          </Table>
        </Card>
      )}

      {/* Create Agent Modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
          backdropFilter: 'blur(2px)',
        }}>
          <div style={{
            background: 'var(--c-bg-card)', border: '1px solid var(--c-border)', borderRadius: 18,
            padding: 28, width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-text)', margin: 0 }}>
                Create Agent
              </h2>
              <button onClick={() => { setShowCreate(false); setCreatedLink(null); }} style={{
                background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 22,
                color: 'var(--c-muted)', lineHeight: 1,
              }}>×</button>
            </div>
            {createdLink ? (
              <>
                <Alert type="success">✓ Agent created! Share this activation link:</Alert>
                <div style={{
                  background: 'var(--c-bg)', borderRadius: 12, padding: '12px 16px',
                  color: '#6366f1', fontSize: 12, wordBreak: 'break-all',
                  border: '1px solid var(--c-border)', marginBottom: 18, fontWeight: 600,
                }}>
                  {createdLink}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Btn onClick={() => navigator.clipboard.writeText(createdLink!)} fullWidth>📋 Copy Link</Btn>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Btn variant="outline" onClick={() => { setShowCreate(false); setCreatedLink(null); }} fullWidth>Done</Btn>
                  </div>
                </div>
              </>
            ) : (
              <form onSubmit={handleCreate} style={{ display: 'grid', gap: 16 }}>
                <Field label="Telegram Username">
                  <input
                    value={createUsername}
                    onChange={(e) => setCreateUsername(e.target.value)}
                    placeholder="e.g. johndoe (without @)"
                    style={inputCss}
                    required
                  />
                </Field>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Btn type="submit" disabled={createLoading} fullWidth>
                      {createLoading ? 'Creating…' : '+ Create Agent'}
                    </Btn>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Btn variant="outline" type="button" onClick={() => setShowCreate(false)} fullWidth>
                      Cancel
                    </Btn>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {(detail || detailLoading) && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
          backdropFilter: 'blur(2px)',
        }}>
          <div style={{
            background: 'var(--c-bg-card)', border: '1px solid var(--c-border)', borderRadius: 18,
            padding: 28, width: '100%', maxWidth: 600, maxHeight: '85vh', overflowY: 'auto',
            boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)',
          }}>
            {detailLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}
            {detail && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-text)', margin: 0 }}>
                    @{detail.telegramUsername}
                  </h2>
                  <button onClick={() => setDetail(null)} style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--c-muted)', fontSize: 22, cursor: 'pointer',
                  }}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Total Players', value: detail.totalPlayersInvited, icon: '👥' },
                    { label: 'Total Commission', value: `ETB ${detail.totalCommission.toFixed(2)}`, icon: '💰' },
                    { label: 'Status', value: detail.isActive ? 'Active' : 'Suspended', icon: detail.isActive ? '✅' : '🚫' },
                    { label: 'Created', value: new Date(detail.createdAt).toLocaleDateString(), icon: '📅' },
                  ].map(({ label, value, icon }) => (
                    <div key={label} style={{
                      background: 'var(--c-bg)', borderRadius: 12, padding: '14px 16px',
                      border: '1px solid var(--c-border)',
                    }}>
                      <div style={{ fontSize: 11, color: 'var(--c-muted)', marginBottom: 4, fontWeight: 600 }}>{icon} {label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)' }}>{value}</div>
                    </div>
                  ))}
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', marginBottom: 12, marginTop: 20 }}>
                  👥 Referred Players ({detail.players.length})
                </h3>
                <Table>
                  <thead>
                    <tr>
                      <Th>Username</Th>
                      <Th>Deposit Bal.</Th>
                      <Th>Commission</Th>
                      <Th>Joined</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.players.length === 0
                      ? <TrEmpty cols={4} message="No players yet." />
                      : detail.players.map((p) => (
                        <tr key={p.playerId}>
                          <Td>@{p.username}</Td>
                          <Td>ETB {p.depositBalance.toFixed(2)}</Td>
                          <Td><span style={{ color: '#22c55e' }}>ETB {p.totalCommissionFromPlayer.toFixed(2)}</span></Td>
                          <Td muted>{new Date(p.joinedAt).toLocaleDateString()}</Td>
                        </tr>
                      ))
                    }
                  </tbody>
                </Table>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
