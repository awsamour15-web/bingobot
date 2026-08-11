import React, { useEffect, useState } from 'react';
import { C } from '../components/ui';
import {
  listAgents,
  createAgent,
  suspendAgent,
  restoreAgent,
  getAgentDetail,
  type AgentSummary,
  type AgentDetail,
} from '../lib/api';

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  // Detail modal state
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const res = await listAgents();
      setAgents(res.agents);
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

  async function handleSuspend(id: string) {
    await suspendAgent(id);
    void load();
  }

  async function handleRestore(id: string) {
    await restoreAgent(id);
    void load();
  }

  async function handleDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await getAgentDetail(id);
      setDetail(res.agent);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Agents</h1>
        <button
          onClick={() => { setShowCreate(true); setCreatedLink(null); }}
          style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
        >
          + Create Agent
        </button>
      </div>

      {loading && <div style={{ color: C.muted }}>Loading...</div>}
      {error && <div style={{ color: '#f87171' }}>{error}</div>}

      {!loading && !error && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#1e293b', color: C.muted }}>
                {['Username', 'Invite Link', 'Players', 'Commission', 'Status', 'Created', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: C.muted }}>No agents yet.</td></tr>
              )}
              {agents.map((a) => (
                <tr key={a.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '10px 12px', color: C.text, fontWeight: 600 }}>@{a.telegramUsername}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <a href={a.agentInviteLink} target="_blank" rel="noopener noreferrer"
                      style={{ color: '#818cf8', fontSize: 12, wordBreak: 'break-all' }}>
                      {a.agentInviteLink}
                    </a>
                  </td>
                  <td style={{ padding: '10px 12px', color: C.text }}>{a.totalPlayersInvited}</td>
                  <td style={{ padding: '10px 12px', color: '#4ade80', fontWeight: 600 }}>
                    ETB {a.totalCommission.toFixed(2)}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      background: a.isActive ? '#14532d' : '#7f1d1d',
                      color: a.isActive ? '#4ade80' : '#f87171',
                      borderRadius: 12, padding: '2px 10px', fontSize: 11, fontWeight: 700,
                    }}>
                      {a.isActive ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: C.muted, fontSize: 12 }}>
                    {new Date(a.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => handleDetail(a.id)}
                        style={{ background: '#1e293b', color: '#94a3b8', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
                      >
                        Detail
                      </button>
                      {a.isActive ? (
                        <button
                          onClick={() => handleSuspend(a.id)}
                          style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRestore(a.id)}
                          style={{ background: '#14532d', color: '#86efac', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Agent Modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 28, width: 400, maxWidth: '90vw' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 18, marginTop: 0 }}>Create Agent</h2>

            {createdLink ? (
              <>
                <div style={{ color: '#4ade80', fontSize: 13, marginBottom: 12, fontWeight: 600 }}>
                  ✅ Agent created! Share this activation link:
                </div>
                <div style={{
                  background: '#0f172a', borderRadius: 8, padding: '10px 14px',
                  color: '#818cf8', fontSize: 12, wordBreak: 'break-all',
                  border: `1px solid ${C.border}`, marginBottom: 16,
                }}>
                  {createdLink}
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(createdLink); }}
                  style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, marginRight: 8 }}
                >
                  Copy Link
                </button>
                <button
                  onClick={() => { setShowCreate(false); setCreatedLink(null); }}
                  style={{ background: '#334155', color: C.muted, border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}
                >
                  Close
                </button>
              </>
            ) : (
              <form onSubmit={handleCreate}>
                <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 6 }}>Telegram Username</label>
                <input
                  value={createUsername}
                  onChange={e => setCreateUsername(e.target.value)}
                  placeholder="e.g. johndoe (without @)"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: '#0f172a', border: `1px solid ${C.border}`,
                    color: C.text, borderRadius: 8, padding: '9px 12px', fontSize: 14, marginBottom: 18,
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="submit"
                    disabled={createLoading}
                    style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 600, cursor: 'pointer', fontSize: 14, flex: 1, opacity: createLoading ? 0.7 : 1 }}
                  >
                    {createLoading ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    style={{ background: '#334155', color: C.muted, border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontSize: 14 }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {(detail || detailLoading) && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: 28, width: 560, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto' }}>
            {detailLoading && <div style={{ color: C.muted }}>Loading...</div>}
            {detail && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: 0 }}>@{detail.telegramUsername}</h2>
                  <button onClick={() => setDetail(null)} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Total Players', value: detail.totalPlayersInvited },
                    { label: 'Total Commission', value: `ETB ${detail.totalCommission.toFixed(2)}` },
                    { label: 'Status', value: detail.isActive ? 'Active' : 'Suspended' },
                    { label: 'Created', value: new Date(detail.createdAt).toLocaleDateString() },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: '#0f172a', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{value}</div>
                    </div>
                  ))}
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: C.muted, marginBottom: 10 }}>Referred Players</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#0f172a', color: C.muted }}>
                      {['Username', 'Deposit Bal.', 'Commission', 'Joined'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.players.length === 0 && (
                      <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', color: C.muted }}>No players yet.</td></tr>
                    )}
                    {detail.players.map(p => (
                      <tr key={p.playerId} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '8px 10px', color: C.text }}>@{p.username}</td>
                        <td style={{ padding: '8px 10px', color: C.text }}>ETB {p.depositBalance.toFixed(2)}</td>
                        <td style={{ padding: '8px 10px', color: '#4ade80' }}>ETB {p.totalCommissionFromPlayer.toFixed(2)}</td>
                        <td style={{ padding: '8px 10px', color: C.muted }}>{new Date(p.joinedAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
