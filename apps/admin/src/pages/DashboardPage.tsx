import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getDeposits, getPlayers, getRevenue, getWithdrawals, listAgents } from '../lib/api';
import {
  Alert,
  Badge,
  Btn,
  Card,
  CardHeader,
  PageHeader,
  StatCard,
  Table,
  Td,
  Th,
  TrEmpty,
} from '../components/ui';

interface DashboardSummary {
  totalPlayers: number;
  totalRevenue: number;
  pendingWithdrawals: number;
  pendingDeposits: number;
  activeAgents: number;
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentDeposits, setRecentDeposits] = useState<any[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<any[]>([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [playersRes, revenueStats, depositsRes, withdrawalsRes, agentsRes] = await Promise.all([
        getPlayers(1),
        getRevenue(),
        getDeposits(),
        getWithdrawals(),
        listAgents(),
      ]);

      const pendingDeposits = depositsRes.items.filter((item) => item.status === 'pending').length;
      const pending = withdrawalsRes.filter((item) => item.status === 'pending');
      const activeAgents = agentsRes.agents.filter((agent) => agent.isActive).length;

      setSummary({
        totalPlayers: playersRes.total ?? 0,
        totalRevenue: Number(revenueStats.platformCommissionEarned ?? 0),
        pendingWithdrawals: pending.length,
        pendingDeposits,
        activeAgents,
      });

      setRecentDeposits((depositsRes.items ?? []).slice(0, 5));
      setPendingWithdrawals(pending.slice(0, 5));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const topAlerts = useMemo(() => [
    { label: 'Pending withdrawals', value: summary?.pendingWithdrawals ?? 0, tone: 'danger', icon: '💸' },
    { label: 'Pending deposits', value: summary?.pendingDeposits ?? 0, tone: 'warning', icon: '📥' },
    { label: 'Active agents', value: summary?.activeAgents ?? 0, tone: 'success', icon: '🤝' },
  ], [summary]);

  return (
    <div className="fade-in">
      <PageHeader
        title="Dashboard"
        action={<Btn variant="ghost" size="sm" onClick={() => void loadDashboard()} disabled={loading}>↻ Refresh</Btn>}
      />

      {error && <Alert type="error">{error}</Alert>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard icon="👥" label="Total Players" value={summary?.totalPlayers ?? '—'} color="#6366f1" />
        <StatCard icon="💰" label="Commission" value={summary ? `${summary.totalRevenue.toFixed(2)} ETB` : '—'} color="#22c55e" />
        <StatCard icon="📥" label="Pending Deposits" value={summary?.pendingDeposits ?? '—'} color="#f59e0b" />
        <StatCard icon="💸" label="Pending Withdrawals" value={summary?.pendingWithdrawals ?? '—'} color="#ef4444" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card>
          <CardHeader title="Operations at a glance" subtitle="Quick action items requiring attention" />
          <div style={{ display: 'grid', gap: 12 }}>
            {topAlerts.map((item) => (
              <div key={item.label} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: '1px solid var(--c-border)',
                borderRadius: 12,
                padding: '12px 14px',
                background: 'var(--c-bg)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: item.tone === 'danger' ? 'rgba(239,68,68,0.12)' : item.tone === 'warning' ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)', fontSize: 18 }}>
                    {item.icon}
                  </span>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{item.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--c-text)', letterSpacing: '-0.03em' }}>{item.value}</div>
                  </div>
                </div>
                <Badge variant={item.tone === 'danger' ? 'danger' : item.tone === 'warning' ? 'warning' : 'success'}>
                  {item.tone === 'danger' ? 'Critical' : item.tone === 'warning' ? 'Review' : 'Healthy'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Open withdrawals" subtitle="Most recent approvals pending" />
          {pendingWithdrawals.length === 0 ? (
            <TrEmpty cols={3} message="No pending withdrawals." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Player</Th>
                  <Th>Amount</Th>
                  <Th>Time</Th>
                </tr>
              </thead>
              <tbody>
                {pendingWithdrawals.map((withdrawal) => (
                  <tr key={withdrawal.id}>
                    <Td><span style={{ fontWeight: 700 }}>@{withdrawal.username}</span></Td>
                    <Td><span style={{ fontWeight: 700, color: '#ef4444' }}>{Number(withdrawal.amount).toFixed(2)} ETB</span></Td>
                    <Td muted>{new Date(withdrawal.created_at).toLocaleDateString()}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent deposit queue" subtitle="Latest transactions requiring attention" />
        {recentDeposits.length === 0 ? (
          <TrEmpty cols={5} message="No recent deposits." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Tx Number</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th>Player</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {recentDeposits.map((deposit) => (
                <tr key={deposit.id}>
                  <Td mono>{deposit.tx_number}</Td>
                  <Td><span style={{ fontWeight: 700 }}>{Number(deposit.amount).toFixed(2)} ETB</span></Td>
                  <Td><Badge variant={deposit.status === 'pending' ? 'warning' : deposit.status === 'claimed' ? 'success' : 'neutral'}>{deposit.status}</Badge></Td>
                  <Td muted>{deposit.player_username ? `@${deposit.player_username}` : '—'}</Td>
                  <Td muted>{new Date(deposit.created_at).toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
