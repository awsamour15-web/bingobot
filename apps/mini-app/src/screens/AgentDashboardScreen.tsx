import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAgentDashboard, getAgentInviteLink, requestAgentWithdrawal,
  type AgentDashboardStats,
} from '../lib/api';
import { getAgentJwt, initAuth } from '../lib/auth';
import { formatMoney } from '../lib/format';

const C = {
  bg: '#070d1a',
  card: '#0c1626',
  cardHover: '#101e33',
  border: 'rgba(148,163,184,0.12)',
  borderBright: 'rgba(148,163,184,0.22)',
  text: '#e8f0fe',
  muted: '#7a93b4',
  dim: '#3d5474',
  green: '#34d399',
  greenDim: 'rgba(52,211,153,0.12)',
  blue: '#60a5fa',
  blueDim: 'rgba(96,165,250,0.12)',
  amber: '#fbbf24',
  amberDim: 'rgba(251,191,36,0.12)',
  purple: '#a78bfa',
  purpleDim: 'rgba(167,139,250,0.12)',
  red: '#f87171',
  redDim: 'rgba(248,113,113,0.1)',
};

function StatCard({ label, value, color, bg, icon }: {
  label: string; value: string; color: string; bg: string; icon: string;
}) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
      padding: '16px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>{icon}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{subtitle}</div>}
    </div>
  );
}

export default function AgentDashboardScreen() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<AgentDashboardStats | null>(null);
  const [inviteLink, setInviteLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawPhone, setWithdrawPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'players' | 'withdrawals'>('overview');

  const loadData = useCallback(async () => {
    try {
      await initAuth();
      const [d, inv] = await Promise.all([getAgentDashboard(), getAgentInviteLink()]);
      setDashboard(d);
      setInviteLink(inv.playerInviteLink);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load';
      setError(msg);
      if (msg.includes('Agent session expired')) setTimeout(() => navigate('/'), 2000);
    } finally { setLoading(false); }
  }, [navigate]);

  useEffect(() => {
    if (!getAgentJwt()) { navigate('/'); return; }
    void loadData();
  }, [loadData, navigate]);

  const handleCopy = useCallback(() => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }, [inviteLink]);

  const handleWithdraw = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dashboard) return;
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount < 100) { setNotice({ type: 'error', text: 'Minimum withdrawal is ETB 100' }); return; }
    if (!withdrawPhone.trim()) { setNotice({ type: 'error', text: 'Phone number is required' }); return; }
    setSubmitting(true); setNotice(null);
    try {
      const res = await requestAgentWithdrawal(amount, withdrawPhone.trim());
      setDashboard(p => p ? {
        ...p,
        commissionBalance: Number(p.commissionBalance ?? 0) - amount,
        withdrawalRequests: [res.withdrawal, ...(p.withdrawalRequests ?? [])],
      } : p);
      setWithdrawAmount(''); setWithdrawPhone('');
      setNotice({ type: 'success', text: res.message });
      setActiveTab('withdrawals');
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Failed' });
    } finally { setSubmitting(false); }
  }, [dashboard, withdrawAmount, withdrawPhone]);

  if (loading) return <div style={{ minHeight: '100dvh', background: C.bg }} />;

  if (error) return (
    <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <div style={{ color: C.red, textAlign: 'center', fontSize: 14 }}>{error}</div>
      <button onClick={() => navigate('/')} style={{ background: C.amber, color: '#07111f', border: 'none', borderRadius: 12, padding: '11px 28px', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>Back to Home</button>
    </div>
  );

  if (!dashboard) return null;

  const players = dashboard.players ?? [];
  const withdrawals = dashboard.withdrawalRequests ?? [];
  const balance = Number(dashboard.commissionBalance ?? 0);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'players', label: `Players (${players.length})`, icon: '👥' },
    { id: 'withdrawals', label: `History (${withdrawals.length})`, icon: '📦' },
  ] as const;

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', color: C.text, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(180deg, #0d1e38 0%, #070d1a 100%)', borderBottom: `1px solid ${C.border}`, padding: '14px 16px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 640, margin: '0 auto' }}>
          <button onClick={() => navigate('/')} style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${C.border}`, color: C.text, width: 36, height: 36, borderRadius: 10, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 17, letterSpacing: -0.3 }}>Agent Dashboard</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>Commission overview & tools</div>
          </div>
          <div style={{ background: C.greenDim, border: `1px solid rgba(52,211,153,0.25)`, borderRadius: 20, padding: '5px 12px', fontSize: 11, color: C.green, fontWeight: 700 }}>
            ● PARTNER
          </div>
        </div>
      </div>

      {/* ── Balance hero ── */}
      <div style={{ background: 'linear-gradient(135deg, #0d1e38 0%, #091526 100%)', borderBottom: `1px solid ${C.border}`, padding: '20px 16px 24px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Available Balance</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: C.green, letterSpacing: -1, marginBottom: 4 }}>
            ETB {formatMoney(balance)}
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>Withdrawable commission balance</div>

          {/* Mini stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 18 }}>
            {[
              { label: 'Total Earned', value: `ETB ${formatMoney(dashboard.totalCommission ?? 0)}`, color: C.blue },
              { label: 'This Week',    value: `ETB ${formatMoney(dashboard.weeklyCommission ?? 0)}`, color: C.amber },
              { label: 'Today',        value: `ETB ${formatMoney(dashboard.dailyCommission ?? 0)}`, color: C.purple },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '10px 12px', border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 64, zIndex: 10 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              flex: 1, padding: '12px 4px', border: 'none', background: 'none',
              color: activeTab === t.id ? C.amber : C.muted,
              fontWeight: activeTab === t.id ? 800 : 500, fontSize: 12,
              borderBottom: activeTab === t.id ? `2px solid ${C.amber}` : '2px solid transparent',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 48px' }}>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Invite link */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px' }}>
              <SectionHeader title="🔗 Your Invite Link" subtitle="Share with new players to earn commission on their deposits" />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, background: 'rgba(0,0,0,0.25)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 12px', fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inviteLink || 'Loading…'}
                </div>
                <button onClick={handleCopy} style={{
                  background: copied ? C.green : C.amber, border: 'none', borderRadius: 12,
                  padding: '0 20px', color: '#07111f', fontWeight: 800, cursor: 'pointer',
                  fontSize: 13, flexShrink: 0, transition: 'background 0.2s',
                }}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Withdraw form */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px' }}>
              <SectionHeader title="💸 Request Withdrawal" subtitle={`Available: ETB ${formatMoney(balance)}`} />

              {balance <= 0 && (
                <div style={{ background: C.redDim, border: `1px solid rgba(248,113,113,0.25)`, borderRadius: 12, padding: '10px 14px', fontSize: 13, color: C.red, marginBottom: 14 }}>
                  No balance available to withdraw.
                </div>
              )}

              <form onSubmit={handleWithdraw} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6 }}>Amount (ETB)</div>
                    <input
                      type="number" min={100} step="1" value={withdrawAmount}
                      onChange={e => setWithdrawAmount(e.target.value)}
                      placeholder="Min 100"
                      disabled={balance <= 0}
                      style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.25)', border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, padding: '12px 14px', fontSize: 14, outline: 'none', opacity: balance <= 0 ? 0.5 : 1 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6 }}>Telebirr Phone</div>
                    <input
                      value={withdrawPhone}
                      onChange={e => setWithdrawPhone(e.target.value)}
                      placeholder="09XXXXXXXX"
                      disabled={balance <= 0}
                      style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.25)', border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, padding: '12px 14px', fontSize: 14, outline: 'none', opacity: balance <= 0 ? 0.5 : 1 }}
                    />
                  </div>
                </div>

                {notice && (
                  <div style={{ background: notice.type === 'success' ? C.greenDim : C.redDim, border: `1px solid ${notice.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`, color: notice.type === 'success' ? C.green : C.red, borderRadius: 12, padding: '10px 14px', fontSize: 13 }}>
                    {notice.text}
                  </div>
                )}

                <button type="submit" disabled={submitting || balance <= 0} style={{
                  background: submitting || balance <= 0 ? 'rgba(251,191,36,0.4)' : C.amber,
                  border: 'none', borderRadius: 12, color: '#07111f', padding: '13px',
                  fontWeight: 900, fontSize: 14, cursor: submitting || balance <= 0 ? 'not-allowed' : 'pointer',
                }}>
                  {submitting ? 'Submitting…' : 'Request Withdrawal'}
                </button>
              </form>
            </div>

            {/* Quick stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <StatCard label="Total Players" value={String(players.length)} color={C.blue} bg={C.blueDim} icon="👥" />
              <StatCard label="Withdrawal Requests" value={String(withdrawals.length)} color={C.purple} bg={C.purpleDim} icon="📦" />
            </div>
          </div>
        )}

        {/* ── PLAYERS TAB ── */}
        {activeTab === 'players' && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }}>
            {players.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>👥</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>No players yet</div>
                <div style={{ fontSize: 13, color: C.muted }}>Share your invite link to start earning.</div>
              </div>
            ) : (
              <>
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{players.length} Referred Players</span>
                  <span style={{ fontSize: 12, color: C.muted }}>Total commission: ETB {formatMoney(players.reduce((s, p) => s + (p.totalCommissionFromPlayer ?? 0), 0))}</span>
                </div>
                <div>
                  {players.map((p, i) => (
                    <div key={p.playerId} style={{ padding: '13px 16px', borderTop: i === 0 ? 'none' : `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(96,165,250,0.15)', border: `1px solid rgba(96,165,250,0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: C.blue, flexShrink: 0 }}>
                        {(p.username?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{p.username}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Joined {new Date(p.joinedAt).toLocaleDateString()}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: C.green }}>+ETB {formatMoney(p.totalCommissionFromPlayer ?? 0)}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Bal: ETB {formatMoney(p.depositBalance ?? 0)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── WITHDRAWALS TAB ── */}
        {activeTab === 'withdrawals' && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }}>
            {withdrawals.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>📦</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>No withdrawals yet</div>
                <div style={{ fontSize: 13, color: C.muted }}>Your withdrawal history will appear here.</div>
              </div>
            ) : (
              <>
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{withdrawals.length} Requests</span>
                </div>
                {withdrawals.map((w, i) => {
                  const statusColor = w.status === 'approved' ? C.green : w.status === 'rejected' ? C.red : C.amber;
                  const statusBg = w.status === 'approved' ? C.greenDim : w.status === 'rejected' ? C.redDim : C.amberDim;
                  return (
                    <div key={w.id} style={{ padding: '14px 16px', borderTop: i === 0 ? 'none' : `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>ETB {formatMoney(w.amount ?? 0)}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{w.phone} · {new Date(w.createdAt).toLocaleDateString()}</div>
                      </div>
                      <div style={{ background: statusBg, color: statusColor, border: `1px solid ${statusColor}44`, borderRadius: 20, padding: '5px 12px', fontSize: 11, fontWeight: 700, textTransform: 'capitalize', flexShrink: 0 }}>
                        {w.status}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
