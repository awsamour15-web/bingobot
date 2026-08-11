import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAgentDashboard, getAgentInviteLink } from '../lib/api';
import { getAgentJwt, initAuth } from '../lib/auth';
import type { AgentDashboardStats } from '../lib/api';

const C = {
  bg: '#0a0e1a',
  surface: '#0d1b2e',
  surface2: '#112240',
  border: 'rgba(255,255,255,0.07)',
  amber: '#f59e0b',
  text: '#f1f5f9',
  muted: '#64748b',
  dim: '#475569',
  green: '#34d399',
  blue: '#60a5fa',
};

export default function AgentDashboardScreen() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<AgentDashboardStats | null>(null);
  const [inviteLink, setInviteLink] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Check if user has agent JWT
    const agentJwt = getAgentJwt();
    if (!agentJwt) {
      navigate('/');
      return;
    }

    const loadData = async () => {
      try {
        await initAuth(); // Ensure player auth is also valid
        const [dashboardData, inviteLinkData] = await Promise.all([
          getAgentDashboard(),
          getAgentInviteLink(),
        ]);
        setDashboard(dashboardData);
        setInviteLink(inviteLinkData.playerInviteLink);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agent dashboard');
        if (err instanceof Error && err.message.includes('Agent session expired')) {
          setTimeout(() => navigate('/'), 2000);
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [navigate]);

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

  if (loading) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        background: C.bg, 
        color: C.muted 
      }}>
        Loading agent dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: 24, 
        textAlign: 'center', 
        background: C.bg, 
        minHeight: '100vh', 
        color: '#f87171' 
      }}>
        <div style={{ marginBottom: 16 }}>{error}</div>
        <button
          onClick={handleBackToHome}
          style={{
            background: C.amber,
            color: '#0a0e1a',
            border: 'none',
            borderRadius: 10,
            padding: '10px 24px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div style={{ 
        padding: 24, 
        textAlign: 'center', 
        background: C.bg, 
        minHeight: '100vh', 
        color: C.muted 
      }}>
        No dashboard data available
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
      
      {/* Header */}
      <div style={{ 
        background: `linear-gradient(135deg, ${C.surface2} 0%, ${C.surface} 100%)`, 
        padding: '20px', 
        borderBottom: `1px solid ${C.border}`,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
          <button
            onClick={handleBackToHome}
            style={{
              background: 'none',
              border: 'none',
              color: C.amber,
              fontSize: 18,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ← 
          </button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.text }}>Agent Dashboard</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Your referral performance</div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(2, 1fr)', 
          gap: 12, 
          marginBottom: 16 
        }}>
          <div style={{ 
            background: C.surface, 
            border: `1px solid ${C.border}`, 
            borderRadius: 14, 
            padding: '16px 14px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: C.amber }}>
              {dashboard.totalPlayersInvited}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Total Players</div>
          </div>

          <div style={{ 
            background: C.surface, 
            border: `1px solid ${C.border}`, 
            borderRadius: 14, 
            padding: '16px 14px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: C.green }}>
              {dashboard.totalCommission.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Total Commission</div>
          </div>

          <div style={{ 
            background: C.surface, 
            border: `1px solid ${C.border}`, 
            borderRadius: 14, 
            padding: '16px 14px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: C.blue }}>
              {dashboard.weeklyCommission.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Weekly</div>
          </div>

          <div style={{ 
            background: C.surface, 
            border: `1px solid ${C.border}`, 
            borderRadius: 14, 
            padding: '16px 14px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#8b5cf6' }}>
              {dashboard.dailyCommission.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Daily</div>
          </div>
        </div>
      </div>

      {/* Invite Link Section */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ 
          background: C.surface, 
          border: `1px solid ${C.border}`, 
          borderRadius: 16, 
          padding: 18 
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 12 }}>
            🔗 Player Invite Link
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
            Share this link to invite new players and earn 10% commission on their deposits
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              readOnly
              value={inviteLink}
              style={{
                flex: 1,
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                fontSize: 12,
                color: C.muted,
                outline: 'none',
              }}
            />
            <button
              onClick={handleCopyInviteLink}
              style={{
                padding: '10px 16px',
                background: copied ? C.green : C.amber,
                color: '#0a0e1a',
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 12,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* Players Table */}
      <div style={{ padding: '0 16px 32px' }}>
        <div style={{ 
          background: C.surface, 
          border: `1px solid ${C.border}`, 
          borderRadius: 16, 
          overflow: 'hidden' 
        }}>
          <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>
              👥 Your Players ({dashboard.players.length})
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              Players you've referred and their contribution
            </div>
          </div>

          {dashboard.players.length === 0 ? (
            <div style={{ 
              padding: '32px 18px', 
              textAlign: 'center', 
              color: C.muted 
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No players yet</div>
              <div style={{ fontSize: 12 }}>Share your invite link to start earning commissions</div>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr 1fr 1fr', 
                gap: 12, 
                padding: '12px 18px',
                background: 'rgba(255,255,255,0.02)',
                fontSize: 11,
                color: C.muted,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                <div>Username</div>
                <div style={{ textAlign: 'right' }}>Deposit Balance</div>
                <div style={{ textAlign: 'right' }}>Commission</div>
                <div style={{ textAlign: 'right' }}>Joined</div>
              </div>

              {/* Table Rows */}
              {dashboard.players.map((player, index) => (
                <div
                  key={player.playerId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr 1fr',
                    gap: 12,
                    padding: '14px 18px',
                    borderTop: index > 0 ? `1px solid ${C.border}` : 'none',
                    fontSize: 13,
                  }}
                >
                  <div style={{ 
                    fontWeight: 600, 
                    color: C.text, 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis' 
                  }}>
                    @{player.username}
                  </div>
                  <div style={{ 
                    textAlign: 'right', 
                    color: C.blue,
                    fontWeight: 600,
                  }}>
                    {player.depositBalance.toFixed(2)}
                  </div>
                  <div style={{ 
                    textAlign: 'right', 
                    color: C.green,
                    fontWeight: 700,
                  }}>
                    {player.totalCommissionFromPlayer.toFixed(2)}
                  </div>
                  <div style={{ 
                    textAlign: 'right', 
                    color: C.muted,
                    fontSize: 11,
                  }}>
                    {new Date(player.joinedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}