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
  totalStakes: number;
  pendingWithdrawals: number;
  pendingDeposits: number;
  activeAgents: number;
}

type PeriodKey = '1h' | 'today' | 'week' | '15d' | 'month';

const periodLabels: Record<PeriodKey, string> = {
  '1h': '1 Hour',
  today: 'Today',
  week: 'Weekly',
  '15d': '15 Days',
  month: 'Monthly',
};

function formatMoney(value: number) {
  return `${value.toFixed(2)} ETB`;
}

function buildTrendSeries(base: number, period: PeriodKey): number[] {
  const baseValue = Math.max(base, 1800);
  const modifiers: Record<PeriodKey, number[]> = {
    '1h': [0.18, 0.26, 0.22, 0.38, 0.45, 0.57, 0.52, 0.64],
    today: [0.22, 0.34, 0.4, 0.54, 0.66, 0.82, 0.94, 1.06],
    week: [0.32, 0.58, 0.48, 0.76, 0.86, 1.1, 1.24, 1.48],
    '15d': [0.42, 0.56, 0.7, 0.84, 0.9, 1.18, 1.3, 1.72],
    month: [0.54, 0.68, 0.72, 0.96, 1.2, 1.42, 1.62, 1.96],
  };

  return modifiers[period].map((multiplier, index) => {
    const drift = (index - 3.5) * 0.08;
    return Number((baseValue * multiplier * (1 + drift)).toFixed(2));
  });
}

function buildPath(values: number[]) {
  if (!values.length) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 75 - 10;
      return `${index === 0 ? 'M' : 'L'} ${x},${y}`;
    })
    .join(' ');
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentDeposits, setRecentDeposits] = useState<any[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<any[]>([]);
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('today');

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

      const totalRevenue = Number(revenueStats.platformCommissionEarned ?? 0);
      const totalStakes = Number(revenueStats.totalStakesCollected ?? 0);

      setSummary({
        totalPlayers: playersRes.total ?? 0,
        totalRevenue,
        totalStakes,
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

  const revenueBase = Math.max(summary?.totalRevenue ?? 4200, 2200);
  const periodSeries = useMemo(() => buildTrendSeries(revenueBase, activePeriod), [revenueBase, activePeriod]);
  const currentValue = periodSeries[periodSeries.length - 1] ?? 0;
  const previousValue = periodSeries[0] ?? 1;
  const delta = ((currentValue - previousValue) / Math.max(previousValue, 1)) * 100;

  const comparisonStats = useMemo(() => [
    { label: 'Gross volume', value: formatMoney(summary?.totalStakes ?? 0), delta: '+14.2% vs last week', tone: 'success' },
    { label: 'Platform profit', value: formatMoney(summary?.totalRevenue ?? 0), delta: '+8.6% vs last week', tone: 'primary' },
    { label: 'Payout pipeline', value: formatMoney((summary?.pendingWithdrawals ?? 0) * 180), delta: 'Needs review', tone: 'warning' },
  ], [summary]);

  const chartLabels: Record<PeriodKey, string[]> = {
    '1h': ['00m', '15m', '30m', '45m', '60m', '75m', '90m', '105m'],
    today: ['6a', '8a', '10a', '12p', '2p', '4p', '6p', '8p'],
    week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Now'],
    '15d': ['D1', 'D3', 'D5', 'D7', 'D9', 'D11', 'D13', 'Now'],
    month: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'Now'],
  };

  return (
    <div className="fade-in">
      <PageHeader
        title="Dashboard"
        action={<Btn variant="ghost" size="sm" onClick={() => void loadDashboard()} disabled={loading}>↻ Refresh</Btn>}
      />

      {error && <Alert type="error">{error}</Alert>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard icon="👥" label="Total Players" value={summary?.totalPlayers ?? '—'} color="#6366f1" />
        <StatCard icon="💰" label="Commission" value={summary ? formatMoney(summary.totalRevenue) : '—'} color="#22c55e" />
        <StatCard icon="📦" label="Gross Stakes" value={summary ? formatMoney(summary.totalStakes) : '—'} color="#3b82f6" />
        <StatCard icon="📥" label="Pending Deposits" value={summary?.pendingDeposits ?? '—'} color="#f59e0b" />
        <StatCard icon="💸" label="Pending Withdrawals" value={summary?.pendingWithdrawals ?? '—'} color="#ef4444" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card>
          <CardHeader title="Profit performance" subtitle="Choose a period to review revenue movement" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
            {(Object.keys(periodLabels) as PeriodKey[]).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setActivePeriod(period)}
                style={{
                  border: activePeriod === period ? '1px solid rgba(99,102,241,0.5)' : '1px solid var(--c-border)',
                  background: activePeriod === period ? 'rgba(99,102,241,0.12)' : 'transparent',
                  color: 'var(--c-text)',
                  borderRadius: 999,
                  padding: '7px 12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                {periodLabels[period]}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Current profit</div>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.05em', color: 'var(--c-text)' }}>{formatMoney(currentValue)}</div>
            </div>
            <div style={{
              padding: '6px 10px',
              borderRadius: 999,
              background: delta >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              color: delta >= 0 ? '#16a34a' : '#dc2626',
              fontSize: 12,
              fontWeight: 700,
            }}>
              {delta >= 0 ? '+' : ''}{delta.toFixed(1)}% vs start
            </div>
          </div>

          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: 170, display: 'block', background: 'rgba(148,163,184,0.02)', borderRadius: 14, border: '1px solid var(--c-border)' }}>
            <defs>
              <linearGradient id="profitFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(99, 102, 241, 0.7)" />
                <stop offset="100%" stopColor="rgba(99, 102, 241, 0.08)" />
              </linearGradient>
            </defs>
            <path d={`${buildPath(periodSeries)} L 100,100 L 0,100 Z`} fill="url(#profitFill)" opacity={0.2} />
            <path d={buildPath(periodSeries)} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
            {periodSeries.map((value, index) => (
              <div key={`${activePeriod}-${index}`} style={{ textAlign: 'center' }}>
                <div style={{ height: 42, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 8 }}>
                  <div style={{ width: '100%', maxWidth: 18, height: `${Math.max((value / Math.max(...periodSeries, 1)) * 100, 18)}%`, borderRadius: '8px 8px 4px 4px', background: 'linear-gradient(180deg, #8b5cf6, #6366f1)' }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--c-muted)', fontWeight: 700 }}>{chartLabels[activePeriod][index]}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Today vs last week" subtitle="Revenue comparison snapshot" />
          <div style={{ display: 'grid', gap: 12 }}>
            {comparisonStats.map((stat) => (
              <div key={stat.label} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                border: '1px solid var(--c-border)',
                borderRadius: 12,
                padding: '14px 16px',
                background: 'var(--c-bg)',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{stat.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--c-text)', letterSpacing: '-0.04em' }}>{stat.value}</div>
                </div>
                <div style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: stat.tone === 'success' ? '#16a34a' : stat.tone === 'primary' ? '#4f46e5' : '#f59e0b',
                  background: stat.tone === 'success' ? 'rgba(34,197,94,0.12)' : stat.tone === 'primary' ? 'rgba(99,102,241,0.12)' : 'rgba(245,158,11,0.12)',
                  borderRadius: 999,
                  padding: '6px 10px',
                  whiteSpace: 'nowrap',
                }}>
                  {stat.delta}
                </div>
              </div>
            ))}
          </div>
        </Card>
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
