import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAgentDashboard,
  getAgentInviteLink,
  requestAgentWithdrawal,
  type AgentDashboardStats,
} from '../lib/api';
import { getAgentJwt, initAuth } from '../lib/auth';

const C = {
  bg: '#07111f',
  panel: '#0d1c2f',
  panelSoft: '#12243d',
  border: 'rgba(148, 163, 184, 0.16)',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#fbbf24',
  accentSoft: '#f59e0b',
  green: '#34d399',
  blue: '#60a5fa',
  purple: '#a78bfa',
  red: '#f87171',
  shadow: '0 20px 60px rgba(15, 23, 42, 0.45)',
};

export default function AgentDashboardScreen() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<AgentDashboardStats | null>(null);
  const [inviteLink, setInviteLink] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawPhone, setWithdrawPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      await initAuth();
      const [dashboardData, inviteLinkData] = await Promise.all([
        getAgentDashboard(),
        getAgentInviteLink(),
      ]);
      setDashboard(dashboardData);
      setInviteLink(inviteLinkData.playerInviteLink);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load agent dashboard';
      setError(message);
      if (err instanceof Error && err.message.includes('Agent session expired')) {
        setTimeout(() => navigate('/'), 2000);
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    const agentJwt = getAgentJwt();
    if (!agentJwt) {
      navigate('/');
      return;
    }

    void loadData();
  }, [loadData, navigate]);

  const handleCopyInviteLink = useCallback(() => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [inviteLink]);

  const handleBackToHome = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleWithdrawRequest = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dashboard) return;

    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount < 100) {
      setNotice({ type: 'error', text: 'Minimum withdrawal is ETB 100' });
      return;
    }

    if (!withdrawPhone.trim()) {
      setNotice({ type: 'error', text: 'Phone number is required' });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      const response = await requestAgentWithdrawal(amount, withdrawPhone.trim());
      setDashboard((prev) => prev ? {
        ...prev,
        commissionBalance: Number((prev.commissionBalance - amount).toFixed(2)),
        withdrawalRequests: [response.withdrawal, ...prev.withdrawalRequests],
      } : prev);
      setWithdrawAmount('');
      setWithdrawPhone('');
      setNotice({ type: 'success', text: response.message });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Withdrawal request failed';
      setNotice({ type: 'error', text: message });
    } finally {
      setSubmitting(false);
    }
  }, [dashboard, withdrawAmount, withdrawPhone]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, color: C.muted }}>
        Loading agent dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: 'center', background: C.bg, minHeight: '100vh', color: '#f87171' }}>
        <div style={{ marginBottom: 16 }}>{error}</div>
        <button onClick={handleBackToHome} style={{ background: C.accent, color: '#111827', border: 'none', borderRadius: 12, padding: '10px 24px', fontWeight: 800, cursor: 'pointer' }}>
          Back to Home
        </button>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div style={{ padding: 24, textAlign: 'center', background: C.bg, minHeight: '100vh', color: C.muted }}>
        No dashboard data available
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.22), rgba(168,85,247,0.12), rgba(15,23,42,0.96))', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 920, margin: '0 auto', padding: '18px 16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={handleBackToHome} style={{ background: 'transparent', border: 'none', color: C.accent, fontSize: 24, cursor: 'pointer' }}>←</button>
            <div>
              <div style={{ fontSize: 24, fontWeight: 900 }}>Agent Dashboard</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Commission overview & partner tools</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 920, margin: '0 auto', padding: '18px 16px 48px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Available', value: dashboard.commissionBalance.toFixed(2), tone: C.green },
            { label: 'Total Earned', value: dashboard.totalCommission.toFixed(2), tone: C.blue },
            { label: 'This Week', value: dashboard.weeklyCommission.toFixed(2), tone: C.accent },
            { label: 'Today', value: dashboard.dailyCommission.toFixed(2), tone: C.purple },
          ].map((card) => (
            <div key={card.label} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 14px', boxShadow: C.shadow }}>
              <div style={{ color: C.muted, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>{card.label}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: card.tone }}>ETB {card.value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, padding: 18, boxShadow: C.shadow, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>🔗 Invite link</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Share this with new players to grow your commissions</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={inviteLink} style={{ flex: 1, background: '#0f172a', border: `1px solid ${C.border}`, borderRadius: 12, color: C.muted, padding: '10px 12px', fontSize: 12, outline: 'none' }} />
            <button onClick={handleCopyInviteLink} style={{ background: copied ? C.green : C.accent, border: 'none', borderRadius: 12, padding: '0 18px', color: '#0b1220', fontWeight: 800, cursor: 'pointer' }}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, padding: 18, boxShadow: C.shadow, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>💸 Request commission withdrawal</div>
          <form onSubmit={handleWithdrawRequest} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: C.muted, fontSize: 12, fontWeight: 700 }}>Amount (ETB)</span>
                <input type="number" min={100} step="0.01" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="500" style={{ background: '#0f172a', border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, padding: '12px 14px', fontSize: 14, outline: 'none' }} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: C.muted, fontSize: 12, fontWeight: 700 }}>Phone</span>
                <input value={withdrawPhone} onChange={(e) => setWithdrawPhone(e.target.value)} placeholder="+2519..." style={{ background: '#0f172a', border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, padding: '12px 14px', fontSize: 14, outline: 'none' }} />
              </label>
            </div>

            {notice && (
              <div style={{ background: notice.type === 'success' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(248,113,113,0.1)', border: `1px solid ${notice.type === 'success' ? 'rgba(52,211,153,0.35)' : 'rgba(248,113,113,0.35)'}`, color: notice.type === 'success' ? C.green : C.red, borderRadius: 12, padding: '10px 12px', fontSize: 12 }}>
                {notice.text}
              </div>
            )}

            <button type="submit" disabled={submitting} style={{ background: submitting ? 'rgba(251,191,36,0.6)' : C.accent, border: 'none', borderRadius: 12, color: '#111827', padding: '12px 18px', fontWeight: 900, cursor: submitting ? 'not-allowed' : 'pointer' }}>
              {submitting ? 'Sending request…' : 'Request withdrawal to admin'}
            </button>
          </form>
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, overflow: 'hidden', boxShadow: C.shadow }}>
          <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>👥 Referred players ({dashboard.players.length})</div>
          </div>

          {dashboard.players.length === 0 ? (
            <div style={{ padding: '32px 18px', textAlign: 'center', color: C.muted }}>
              <div style={{ fontSize: 42, marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>No players yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Invite players and start earning commission.</div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr', gap: 12, padding: '12px 18px', color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', background: 'rgba(15,23,42,0.75)' }}>
                <div>Player</div>
                <div style={{ textAlign: 'right' }}>Balance</div>
                <div style={{ textAlign: 'right' }}>Commission</div>
                <div style={{ textAlign: 'right' }}>Joined</div>
              </div>

              {dashboard.players.map((player, index) => (
                <div key={player.playerId} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr', gap: 12, padding: '14px 18px', borderTop: index === 0 ? 'none' : `1px solid ${C.border}` }}>
                  <div style={{ fontWeight: 700, color: C.text }}>@{player.username}</div>
                  <div style={{ textAlign: 'right', color: C.blue, fontWeight: 700 }}>{player.depositBalance.toFixed(2)}</div>
                  <div style={{ textAlign: 'right', color: C.green, fontWeight: 800 }}>{player.totalCommissionFromPlayer.toFixed(2)}</div>
                  <div style={{ textAlign: 'right', color: C.muted, fontSize: 12 }}>{new Date(player.joinedAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {dashboard.withdrawalRequests.length > 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, marginTop: 16, overflow: 'hidden', boxShadow: C.shadow }}>
            <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>📦 Withdrawal requests</div>
            </div>
            <div>
              {dashboard.withdrawalRequests.map((request) => (
                <div key={request.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, padding: '14px 18px', borderBottom: `1px solid ${C.border}`, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: C.text }}>ETB {request.amount.toFixed(2)}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{request.phone}</div>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>{new Date(request.createdAt).toLocaleDateString()}</div>
                  <div style={{ background: request.status === 'approved' ? 'rgba(52,211,153,0.14)' : request.status === 'rejected' ? 'rgba(248,113,113,0.12)' : 'rgba(251,191,36,0.12)', color: request.status === 'approved' ? C.green : request.status === 'rejected' ? C.red : C.accent, border: `1px solid ${request.status === 'approved' ? 'rgba(52,211,153,0.3)' : request.status === 'rejected' ? 'rgba(248,113,113,0.25)' : 'rgba(251,191,36,0.25)'}`, borderRadius: 999, padding: '6px 10px', fontWeight: 700, textTransform: 'capitalize', textAlign: 'center' }}>
                    {request.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
