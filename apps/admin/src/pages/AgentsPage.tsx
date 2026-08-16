import React, { useEffect, useState, useMemo } from 'react';
import {
  Btn, Badge, Card, CardHeader, Table, Th, Td, TrEmpty, TrLoading,
  Alert, Field, KpiCard, PageHeader, inputCss, CustomIcon,
} from '../components/ui';
import {
  listAgents, createAgent, suspendAgent, restoreAgent, getAgentDetail,
  getPendingAgents, approveAgent, rejectAgent,
  getPendingAgentWithdrawals, approveAgentCommissionWithdrawal, rejectAgentCommissionWithdrawal,
  type AgentSummary, type AgentDetail, type PendingAgent, type AgentWithdrawalRequest,
} from '../lib/api';

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, maxWidth = 480 }: {
  title: string; onClose: () => void;
  children: React.ReactNode; maxWidth?: number;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--c-bg-card)', border: '1px solid var(--c-border)',
        borderRadius: 18, padding: '24px',
        width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--c-text)', minWidth: 0 }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'rgba(148,163,184,0.1)', border: '1px solid var(--c-border)',
            borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
            color: 'var(--c-muted)', fontSize: 18, display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transition: 'all 0.15s',
          }} onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(148,163,184,0.2)';
          }} onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(148,163,184,0.1)';
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Agent Card (Mobile view) ───────────────────────────────────────────────────
function AgentCard({ agent, onDetail, onSuspend, onRestore }: {
  agent: AgentSummary;
  onDetail: (id: string) => void;
  onSuspend: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text)' }}>@{agent.telegramUsername}</span>
            <Badge variant={
              agent.approvalStatus === 'approved' && agent.isActive ? 'success'
                : agent.approvalStatus === 'rejected' ? 'danger'
                : agent.approvalStatus === 'pending' ? 'warning'
                : 'neutral'
            }>
              {agent.approvalStatus === 'pending' ? 'Pending'
                : agent.approvalStatus === 'rejected' ? 'Rejected'
                : agent.isActive ? 'Active' : 'Suspended'}
            </Badge>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--c-muted)' }}>
            {new Date(agent.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14 }}>
        <div style={{ background: 'rgba(99,102,241,0.06)', borderRadius: 10, padding: 10 }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--c-muted)', marginBottom: 4 }}>Players</p>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--c-text)' }}>{agent.totalPlayersInvited}</p>
        </div>
        <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 10, padding: 10 }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--c-muted)', marginBottom: 4 }}>Commission</p>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#4ade80' }}>ETB {Number(agent.totalCommission).toFixed(2)}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <Btn size="sm" variant="outline" onClick={() => onDetail(agent.id)} fullWidth>Details</Btn>
        {agent.isActive
          ? <Btn size="sm" variant="danger" onClick={() => onSuspend(agent.id)} fullWidth>Suspend</Btn>
          : <Btn size="sm" variant="success" onClick={() => onRestore(agent.id)} fullWidth>Restore</Btn>
        }
      </div>
    </Card>
  );
}

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [pendingAgents, setPendingAgents] = useState<PendingAgent[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<AgentWithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Filter agents based on search term
  const filteredAgents = useMemo(() => {
    return agents.filter(a => 
      a.telegramUsername.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [agents, searchTerm]);

  // Handle responsive resize
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  async function load() {
    try {
      setLoading(true);
      const [agentsRes, pendingRes, withdrawalsRes] = await Promise.all([
        listAgents(),
        getPendingAgents(),
        getPendingAgentWithdrawals(),
      ]);
      setAgents(agentsRes.agents);
      setPendingAgents(pendingRes.agents);
      setPendingWithdrawals(withdrawalsRes.withdrawals);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    } finally { setLoading(false); }
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
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed to create agent'); }
    finally { setCreateLoading(false); }
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

  async function handleWithdrawalApprove(item: AgentWithdrawalRequest) {
    const txNumber = window.prompt(`Enter Telegram/Telebirr transaction number for ${item.telegramUsername} (${Number(item.amount).toFixed(2)} ETB)`, '');
    if (!txNumber || !txNumber.trim()) return;

    try {
      await approveAgentCommissionWithdrawal(item.id, txNumber.trim());
      await load();
      alert('Withdrawal approved');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Approval failed');
    }
  }

  async function handleWithdrawalReject(item: AgentWithdrawalRequest) {
    if (!window.confirm(`Reject withdrawal for @${item.telegramUsername} (${Number(item.amount).toFixed(2)} ETB)?`)) return;
    try {
      await rejectAgentCommissionWithdrawal(item.id);
      await load();
      alert('Withdrawal rejected and balance restored');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Rejection failed');
    }
  }

  return (
    <div className="fade-in">
      <PageHeader
        title="Agents"
        action={<Btn onClick={() => { setShowCreate(true); setCreatedLink(null); }}>+ Create Agent</Btn>}
      />

      {error && <Alert type="error">{error}</Alert>}

      {!loading && !error && (
        <div className="summary-grid">
          <KpiCard icon="agents"     label="Active agents" value={agents.filter(a => a.isActive).length}                        delta="+4.2%" tone="indigo"  trend={[30,34,42,46,58,63,72]} />
          <KpiCard icon="spark"      label="Pending"        value={pendingAgents.length}                                          delta="Review" tone="amber"   trend={[14,18,19,17,21,28,26]} />
          <KpiCard icon="finance"    label="Commission"     value={Number(agents.reduce((s,a)=>s+a.totalCommission,0).toFixed(2))} delta="ETB"    tone="emerald" trend={[1200,1500,1700,1900,2100,2350,2480]} />
          <KpiCard icon="players"    label="Players invited"value={agents.reduce((s,a)=>s+a.totalPlayersInvited,0)}                delta="+9.4%" tone="cyan"    trend={[40,44,52,60,68,77,85]} />
        </div>
      )}

      {!loading && !error && pendingWithdrawals.length > 0 && (
        <Card style={{ 
          marginBottom: 20, 
          borderLeft: '4px solid #fbbf24',
          background: 'linear-gradient(to right, rgba(250,204,21,0.05), transparent)',
        }}>
          <CardHeader 
            title={`🏦 Commission Withdrawals (${pendingWithdrawals.length})`} 
            subtitle="Pending admin review for partner commission payouts" 
          />
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <thead><tr><Th>Agent</Th><Th>Phone</Th><Th>Amount</Th><Th>Requested</Th><Th>Actions</Th></tr></thead>
              <tbody>
                {pendingWithdrawals.map((w) => (
                  <tr key={w.id}>
                    <Td><span style={{ fontWeight: 700 }}>@{w.telegramUsername}</span></Td>
                    <Td muted>{w.phone || '—'}</Td>
                    <Td><span style={{ color: '#4ade80', fontWeight: 700 }}>ETB {Number(w.amount).toFixed(2)}</span></Td>
                    <Td muted>{new Date(w.createdAt).toLocaleString()}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Btn size="sm" variant="success" onClick={() => handleWithdrawalApprove(w)}>Approve</Btn>
                        <Btn size="sm" variant="danger" onClick={() => handleWithdrawalReject(w)}>Reject</Btn>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      {/* Pending approvals */}
      {!loading && !error && pendingAgents.length > 0 && (
        <Card style={{ 
          marginBottom: 20, 
          borderLeft: '4px solid #fbbf24',
          background: 'linear-gradient(to right, rgba(245,158,11,0.05), transparent)',
        }}>
          <CardHeader
            title={`⭐ Pending Approvals (${pendingAgents.length})`}
            subtitle="These agents are awaiting approval to join"
          />
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <thead><tr><Th>Username</Th><Th>Telegram ID</Th><Th>Applied</Th><Th>Actions</Th></tr></thead>
              <tbody>
                {pendingAgents.map((a) => (
                  <tr key={a.id}>
                    <Td><span style={{ fontWeight: 600 }}>@{a.telegramUsername}</span></Td>
                    <Td mono>{a.telegramId || '—'}</Td>
                    <Td muted>{new Date(a.createdAt).toLocaleDateString()}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Btn size="sm" variant="success" onClick={() => handleApprove(a.id)}>✓ Approve</Btn>
                        <Btn size="sm" variant="danger"  onClick={() => handleReject(a.id)}>✕ Reject</Btn>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      {/* All agents */}
      {!loading && !error && (
        <Card>
          <div style={{ marginBottom: 16 }}>
            <CardHeader title={`All Agents (${filteredAgents.length})`} />
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search by username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  ...inputCss,
                  paddingLeft: 36,
                  marginBottom: 16,
                  width: '100%',
                }}
              />
              <span style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--c-muted)',
                fontSize: 16,
                pointerEvents: 'none',
              }}>🔍</span>
            </div>
          </div>

          {/* Mobile: Card View */}
          {isMobile ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {filteredAgents.length === 0 ? (
                <div style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--c-muted)',
                }}>
                  <div style={{ fontSize: 28, opacity: 0.4, marginBottom: 8 }}>○</div>
                  {searchTerm ? 'No agents found' : 'No agents yet.'}
                </div>
              ) : (
                filteredAgents.map((a) => (
                  <AgentCard
                    key={a.id}
                    agent={a}
                    onDetail={handleDetail}
                    onSuspend={(id) => suspendAgent(id).then(load)}
                    onRestore={(id) => restoreAgent(id).then(load)}
                  />
                ))
              )}
            </div>
          ) : (
            /* Desktop: Table View */
            <div style={{ overflowX: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <Th>Username</Th><Th>Invite Link</Th><Th>Players</Th>
                    <Th>Commission</Th><Th>Status</Th><Th>Created</Th><Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.length === 0 ? <TrEmpty cols={7} message={searchTerm ? "No agents found" : "No agents yet."} /> :
                   filteredAgents.map((a) => (
                    <tr key={a.id}>
                      <Td><span style={{ fontWeight: 600 }}>@{a.telegramUsername}</span></Td>
                      <Td>
                        <a href={a.agentInviteLink} target="_blank" rel="noopener noreferrer"
                          style={{ color: '#818cf8', fontSize: 12, wordBreak: 'break-all' }}>
                          Link →
                        </a>
                      </Td>
                      <Td>{a.totalPlayersInvited}</Td>
                      <Td><span style={{ fontWeight: 600, color: '#4ade80' }}>ETB {Number(a.totalCommission).toFixed(2)}</span></Td>
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
                          <Btn size="sm" variant="outline" onClick={() => handleDetail(a.id)}>Details</Btn>
                          {a.isActive
                            ? <Btn size="sm" variant="danger"  onClick={() => suspendAgent(a.id).then(load)}>Suspend</Btn>
                            : <Btn size="sm" variant="success" onClick={() => restoreAgent(a.id).then(load)}>Restore</Btn>
                          }
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal title="Create Agent" onClose={() => { setShowCreate(false); setCreatedLink(null); }}>
          {createdLink ? (
            <>
              <Alert type="success">Agent created! Share this activation link:</Alert>
              <div style={{
                background: 'rgba(99,102,241,0.08)', borderRadius: 10,
                padding: '12px 14px', color: '#818cf8', fontSize: 12,
                wordBreak: 'break-all', border: '1px solid rgba(99,102,241,0.18)',
                marginBottom: 18, fontWeight: 600,
              }}>
                {createdLink}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn onClick={() => navigator.clipboard.writeText(createdLink!)} fullWidth>📋 Copy Link</Btn>
                <Btn variant="outline" onClick={() => { setShowCreate(false); setCreatedLink(null); }} fullWidth>Done</Btn>
              </div>
            </>
          ) : (
            <form onSubmit={handleCreate} style={{ display: 'grid', gap: 16 }}>
              <Field label="Telegram Username">
                <input value={createUsername} onChange={(e) => setCreateUsername(e.target.value)}
                  placeholder="johndoe (without @)" style={inputCss} required />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn type="submit" disabled={createLoading} fullWidth>
                  {createLoading ? 'Creating…' : 'Create Agent'}
                </Btn>
                <Btn variant="outline" type="button" onClick={() => setShowCreate(false)} fullWidth>
                  Cancel
                </Btn>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* Detail modal */}
      {(detail || detailLoading) && (
        <Modal title={detail ? `@${detail.telegramUsername}` : 'Loading…'} onClose={() => setDetail(null)} maxWidth={600}>
          {detailLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}
          {detail && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Players',    value: String(detail.totalPlayersInvited) },
                  { label: 'Commission', value: `ETB ${Number(detail.totalCommission).toFixed(2)}` },
                  { label: 'Status',     value: detail.isActive ? 'Active' : 'Suspended' },
                  { label: 'Created',    value: new Date(detail.createdAt).toLocaleDateString() },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    background: 'var(--c-bg)', borderRadius: 10, padding: '12px 14px',
                    border: '1px solid var(--c-border)',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', marginBottom: 10 }}>
                Referred Players ({detail.players.length})
              </div>
              <Table>
                <thead><tr><Th>Username</Th><Th>Balance</Th><Th>Commission</Th><Th>Joined</Th></tr></thead>
                <tbody>
                  {detail.players.length === 0 ? <TrEmpty cols={4} message="No players yet." /> :
                   detail.players.map((p) => (
                    <tr key={p.playerId}>
                      <Td>@{p.username}</Td>
                      <Td>ETB {p.depositBalance.toFixed(2)}</Td>
                      <Td><span style={{ color: '#4ade80' }}>ETB {p.totalCommissionFromPlayer.toFixed(2)}</span></Td>
                      <Td muted>{new Date(p.joinedAt).toLocaleDateString()}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
