import React, { useEffect, useState, useMemo } from 'react';
import {
  Btn, Badge, Card, CardHeader, Table, Th, Td, TrEmpty, TrLoading,
  Alert, Field, PageHeader, StatCard, inputCss, C,
} from '../components/ui';
import {
  listAgents, createAgent, suspendAgent, restoreAgent, getAgentDetail,
  getPendingAgents, approveAgent, rejectAgent,
  getPendingAgentWithdrawals, approveAgentCommissionWithdrawal, rejectAgentCommissionWithdrawal,
  type AgentSummary, type AgentDetail, type PendingAgent, type AgentWithdrawalRequest,
} from '../lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusVariant(a: AgentSummary): 'success' | 'danger' | 'warning' | 'neutral' {
  if (a.approvalStatus === 'pending') return 'warning';
  if (a.approvalStatus === 'rejected') return 'danger';
  return a.isActive ? 'success' : 'neutral';
}

function statusLabel(a: AgentSummary) {
  if (a.approvalStatus === 'pending') return 'Pending';
  if (a.approvalStatus === 'rejected') return 'Rejected';
  return a.isActive ? 'Active' : 'Suspended';
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, maxWidth = 520 }: {
  title: string; onClose: () => void; children: React.ReactNode; maxWidth?: number;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        background: 'var(--c-bg-card)', border: '1px solid var(--c-border)',
        borderRadius: 20, padding: 24, width: '100%', maxWidth,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 32px 64px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--c-text)' }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'rgba(148,163,184,0.08)', border: '1px solid var(--c-border)',
            borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
            color: 'var(--c-muted)', fontSize: 18, display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Withdrawal status badge ───────────────────────────────────────────────────
function WithdrawalBadge({ status }: { status: string }) {
  const v = status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : 'warning';
  return <Badge variant={v}>{status}</Badge>;
}

// ── Main page ─────────────────────────────────────────────────────────────────
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

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'pending' | 'withdrawals'>('all');

  const filtered = useMemo(
    () => agents.filter(a => a.telegramUsername.toLowerCase().includes(search.toLowerCase())),
    [agents, search],
  );

  async function load() {
    try {
      setLoading(true);
      const [agentsRes, pendingRes, wRes] = await Promise.all([
        listAgents(), getPendingAgents(), getPendingAgentWithdrawals(),
      ]);
      setAgents(agentsRes.agents);
      setPendingAgents(pendingRes.agents);
      setPendingWithdrawals(wRes.withdrawals);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
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
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
    finally { setCreateLoading(false); }
  }

  async function handleDetail(id: string) {
    setDetailLoading(true); setDetail(null);
    try { const res = await getAgentDetail(id); setDetail(res.agent); }
    finally { setDetailLoading(false); }
  }

  async function handleWithdrawalApprove(item: AgentWithdrawalRequest) {
    const tx = window.prompt(`Tx# for @${item.telegramUsername} (${Number(item.amount).toFixed(2)} ETB)`, '');
    if (!tx?.trim()) return;
    try { await approveAgentCommissionWithdrawal(item.id, tx.trim()); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
  }

  async function handleWithdrawalReject(item: AgentWithdrawalRequest) {
    if (!confirm(`Reject withdrawal for @${item.telegramUsername}?`)) return;
    try { await rejectAgentCommissionWithdrawal(item.id); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
  }

  // KPI aggregates
  const totalCommission = agents.reduce((s, a) => s + Number(a.totalCommission), 0);
  const totalPlayers = agents.reduce((s, a) => s + a.totalPlayersInvited, 0);
  const activeCount = agents.filter(a => a.isActive && a.approvalStatus === 'approved').length;

  const TABS = [
    { id: 'all' as const,         label: `All Agents (${filtered.length})` },
    { id: 'pending' as const,     label: `Pending (${pendingAgents.length})`,     badge: pendingAgents.length > 0 },
    { id: 'withdrawals' as const, label: `Withdrawals (${pendingWithdrawals.length})`, badge: pendingWithdrawals.length > 0 },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title="Agents"
        action={<Btn onClick={() => { setShowCreate(true); setCreatedLink(null); }}>+ New Agent</Btn>}
      />

      {error && <Alert type="error">{error}</Alert>}

      {/* ── KPI row ── */}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 24 }}>
          <StatCard icon="✅" label="Active"       value={activeCount}                        color={C.success}  />
          <StatCard icon="⏳" label="Pending"      value={pendingAgents.length}               color={C.warning}  />
          <StatCard icon="💰" label="Commission"   value={`ETB ${totalCommission.toFixed(0)}`} color={C.success}  />
          <StatCard icon="👥" label="Players"      value={totalPlayers}                       color={C.primary}  />
          <StatCard icon="🏦" label="Pending W/D"  value={pendingWithdrawals.length}          color={C.warning}  />
        </div>
      )}

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--c-bg-card)', border: '1px solid var(--c-border)', borderRadius: 14, padding: 4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '9px 8px', border: 'none', borderRadius: 10,
            background: tab === t.id ? 'rgba(99,102,241,0.14)' : 'transparent',
            color: tab === t.id ? '#a5b4fc' : 'var(--c-muted)',
            fontWeight: tab === t.id ? 700 : 500, fontSize: 12,
            cursor: 'pointer', position: 'relative', transition: 'all 0.15s',
          }}>
            {t.label}
            {t.badge && tab !== t.id && (
              <span style={{ position: 'absolute', top: 5, right: 8, width: 7, height: 7, borderRadius: '50%', background: '#f59e0b' }} />
            )}
          </button>
        ))}
      </div>

      {/* ── ALL AGENTS TAB ── */}
      {tab === 'all' && (
        <Card>
          <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <input
                type="search" placeholder="Search username…" value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ ...inputCss, paddingLeft: 34, width: '100%', boxSizing: 'border-box' }}
              />
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--c-muted)', pointerEvents: 'none' }}>🔍</span>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <Th>Agent</Th>
                  <Th>Status</Th>
                  <Th>Players</Th>
                  <Th>Commission</Th>
                  <Th>Balance</Th>
                  <Th>Created</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {loading ? <TrLoading cols={7} /> :
                 filtered.length === 0 ? <TrEmpty cols={7} message={search ? 'No agents match.' : 'No agents yet.'} /> :
                 filtered.map(a => (
                  <tr key={a.id}>
                    <Td>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>@{a.telegramUsername}</div>
                      <div style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 2 }}>
                        <a href={a.agentInviteLink} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8' }}>Link →</a>
                      </div>
                    </Td>
                    <Td><Badge variant={statusVariant(a)}>{statusLabel(a)}</Badge></Td>
                    <Td>{a.totalPlayersInvited}</Td>
                    <Td><span style={{ fontWeight: 700, color: '#4ade80' }}>ETB {Number(a.totalCommission).toFixed(2)}</span></Td>
                    <Td><span style={{ fontWeight: 700, color: '#60a5fa' }}>ETB {Number((a as any).commissionBalance ?? 0).toFixed(2)}</span></Td>
                    <Td muted>{new Date(a.createdAt).toLocaleDateString()}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
        </Card>
      )}

      {/* ── PENDING TAB ── */}
      {tab === 'pending' && (
        <Card>
          <CardHeader title="Pending Applications" subtitle="Agents waiting for approval" />
          {pendingAgents.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--c-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>✓</div>
              No pending applications.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <Table>
                <thead><tr><Th>Username</Th><Th>Telegram ID</Th><Th>Applied</Th><Th>Actions</Th></tr></thead>
                <tbody>
                  {pendingAgents.map(a => (
                    <tr key={a.id}>
                      <Td><span style={{ fontWeight: 700 }}>@{a.telegramUsername}</span></Td>
                      <Td mono>{a.telegramId || '—'}</Td>
                      <Td muted>{new Date(a.createdAt).toLocaleDateString()}</Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Btn size="sm" variant="success" onClick={() => approveAgent(a.id).then(load)}>✓ Approve</Btn>
                          <Btn size="sm" variant="danger"  onClick={() => { if (confirm('Reject?')) rejectAgent(a.id).then(load); }}>✕ Reject</Btn>
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

      {/* ── WITHDRAWALS TAB ── */}
      {tab === 'withdrawals' && (
        <Card>
          <CardHeader title="Commission Withdrawals" subtitle="Agent payout requests awaiting approval" />
          {pendingWithdrawals.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--c-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>💰</div>
              No pending withdrawals.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <Table>
                <thead><tr><Th>Agent</Th><Th>Phone</Th><Th>Amount</Th><Th>Requested</Th><Th>Actions</Th></tr></thead>
                <tbody>
                  {pendingWithdrawals.map(w => (
                    <tr key={w.id}>
                      <Td><span style={{ fontWeight: 700 }}>@{w.telegramUsername}</span></Td>
                      <Td muted>{w.phone || '—'}</Td>
                      <Td><span style={{ color: '#4ade80', fontWeight: 700 }}>ETB {Number(w.amount).toFixed(2)}</span></Td>
                      <Td muted>{new Date(w.createdAt).toLocaleString()}</Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Btn size="sm" variant="success" onClick={() => handleWithdrawalApprove(w)}>Approve</Btn>
                          <Btn size="sm" variant="danger"  onClick={() => handleWithdrawalReject(w)}>Reject</Btn>
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

      {/* ── Create modal ── */}
      {showCreate && (
        <Modal title="Create Agent" onClose={() => { setShowCreate(false); setCreatedLink(null); }}>
          {createdLink ? (
            <>
              <Alert type="success">Agent created! Share this activation link:</Alert>
              <div style={{ background: 'rgba(99,102,241,0.08)', borderRadius: 10, padding: '12px 14px', color: '#818cf8', fontSize: 12, wordBreak: 'break-all', border: '1px solid rgba(99,102,241,0.2)', marginBottom: 18, fontWeight: 600 }}>
                {createdLink}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn onClick={() => navigator.clipboard.writeText(createdLink!)} fullWidth>📋 Copy Link</Btn>
                <Btn variant="outline" onClick={() => { setShowCreate(false); setCreatedLink(null); }} fullWidth>Done</Btn>
              </div>
            </>
          ) : (
            <form onSubmit={handleCreate} style={{ display: 'grid', gap: 16 }}>
              <Field label="Telegram Username" hint="Without @">
                <input value={createUsername} onChange={e => setCreateUsername(e.target.value)}
                  placeholder="johndoe" style={inputCss} required />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn type="submit" disabled={createLoading} fullWidth>{createLoading ? 'Creating…' : 'Create Agent'}</Btn>
                <Btn variant="outline" type="button" onClick={() => setShowCreate(false)} fullWidth>Cancel</Btn>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* ── Detail modal ── */}
      {(detail || detailLoading) && (
        <Modal title={detail ? `@${detail.telegramUsername}` : 'Loading…'} onClose={() => setDetail(null)} maxWidth={600}>
          {detailLoading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}
          {detail && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Status',     value: detail.isActive ? 'Active' : 'Suspended' },
                  { label: 'Players',    value: String(detail.totalPlayersInvited) },
                  { label: 'Commission', value: `ETB ${Number(detail.totalCommission).toFixed(2)}` },
                  { label: 'Created',    value: new Date(detail.createdAt).toLocaleDateString() },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: 'var(--c-bg)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--c-border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)' }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text)', marginBottom: 10 }}>
                Referred Players ({detail.players.length})
              </div>
              <Table>
                <thead><tr><Th>Player</Th><Th>Balance</Th><Th>Commission</Th><Th>Joined</Th></tr></thead>
                <tbody>
                  {detail.players.length === 0 ? <TrEmpty cols={4} message="No players yet." /> :
                   detail.players.map(p => (
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
