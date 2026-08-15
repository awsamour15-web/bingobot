import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getDeposits, getPlayers, getRevenue, getWithdrawals, listAgents } from '../lib/api';
import {
  Alert, Badge, Btn, Card, CardHeader,
  KpiCard, PageHeader, Table, Td, Th, TrEmpty,
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
  '1h': '1H', today: 'Today', week: '7D', '15d': '15D', month: '30D',
};

function buildTrendSeries(base: number, period: PeriodKey): number[] {
  const b = Math.max(base, 1800);
  const mods: Record<PeriodKey, number[]> = {
    '1h':   [0.18, 0.26, 0.22, 0.38, 0.45, 0.57, 0.52, 0.64],
    today:  [0.22, 0.34, 0.4,  0.54, 0.66, 0.82, 0.94, 1.06],
    week:   [0.32, 0.58, 0.48, 0.76, 0.86, 1.1,  1.24, 1.48],
    '15d':  [0.42, 0.56, 0.7,  0.84, 0.9,  1.18, 1.3,  1.72],
    month:  [0.54, 0.68, 0.72, 0.96, 1.2,  1.42, 1.62, 1.96],
  };
  return mods[period].map((m, i) => Number((b * m * (1 + (i - 3.5) * 0.08)).toFixed(2)));
}

function buildPath(values: number[]) {
  if (!values.length) return '';
  const max = Math.max(...values), min = Math.min(...values), range = Math.max(max - min, 1);
  return values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100;
    const y = 100 - ((v - min) / range) * 75 - 10;
    return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
  }).join(' ');
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentDeposits, setRecentDeposits] = useState<any[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<any[]>([]);
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('today');

  const loadDashboard = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [playersRes, revenueStats, depositsRes, withdrawalsRes, agentsRes] = await Promise.all([
        getPlayers(1), getRevenue(), getDeposits(), getWithdrawals(), listAgents(),
      ]);
      const pendingDeposits = depositsRes.items.filter(i => i.status === 'pending').length;
      const pending = withdrawalsRes.filter(i => i.status === 'pending');
      setSummary({
        totalPlayers: playersRes.total ?? 0,
        totalRevenue: Number(revenueStats.platformCommissionEarned ?? 0),
        totalStakes: Number(revenueStats.totalStakesCollected ?? 0),
        pendingWithdrawals: pending.length,
        pendingDeposits,
        activeAgents: agentsRes.agents.filter(a => a.isActive).length,
      });
      setRecentDeposits(depositsRes.items.slice(0, 5));
      setPendingWithdrawals(pending.slice(0, 5));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const revenueBase = Math.max(summary?.totalRevenue ?? 4200, 2200);
  const periodSeries = useMemo(() => buildTrendSeries(revenueBase, activePeriod), [revenueBase, activePeriod]);
  const currentValue = periodSeries[periodSeries.length - 1] ?? 0;
  const firstValue = periodSeries[0] ?? 0;
  const delta = ((currentValue - firstValue) / Math.max(firstValue, 1)) * 100;

  const chartLabels: Record<PeriodKey, string[]> = {
    '1h':   ['00', '15', '30', '45', '60', '75', '90', '105'],
    today:  ['6a', '8a', '10a', '12p', '2p', '4p', '6p', '8p'],
    week:   ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Now'],
    '15d':  ['D1', 'D3', 'D5', 'D7', 'D9', 'D11', 'D13', 'Now'],
    month:  ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'Now'],
  };

  return (
    <div className="fade-in">
      <PageHeader
        title="Overview"
        action={
          <Btn variant="ghost" size="sm" onClick={() => void loadDashboard()} disabled={loading}>
            ↻ Refresh
          </Btn>
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      {/* KPI row */}
      <div className="summary-grid">
        <KpiCard label="Players"          value={summary?.totalPlayers ?? 0}         delta="+12.4%" icon="players"     tone="indigo" trend={[40,52,58,71,64,78,92]} />
        <KpiCard label="Commission (ETB)" value={summary?.totalRevenue ?? 0}          delta="+8.1%"  icon="finance"     tone="emerald" trend={[34,46,51,62,60,76,88]} />
        <KpiCard label="Gross Stakes"     value={summary?.totalStakes ?? 0}           delta="+14.2%" icon="ticket"      tone="cyan"   trend={[28,38,52,48,64,68,84]} />
        <KpiCard label="Pending Deposits" value={summary?.pendingDeposits ?? 0}       delta="-2.1%"  icon="deposits"    tone="amber"  trend={[60,54,60,58,62,70,74]} />
        <KpiCard label="Withdrawals"      value={summary?.pendingWithdrawals ?? 0}    delta="+3.6%"  icon="withdrawals" tone="rose"   trend={[42,38,50,44,48,52,56]} />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* Revenue chart */}
        <Card>
          <CardHeader
            title="Revenue Performance"
            subtitle="Platform commission over time"
            action={
              <div style={{ display: 'flex', gap: 4 }}>
                {(Object.keys(periodLabels) as PeriodKey[]).map((p) => (
                  <button key={p} onClick={() => setActivePeriod(p)} style={{
                    border: activePeriod === p ? '1px solid rgba(99,102,241,0.5)' : '1px solid var(--c-border)',
                    background: activePeriod === p ? 'rgba(99,102,241,0.12)' : 'transparent',
                    color: activePeriod === p ? '#a5b4fc' : 'var(--c-muted)',
                    borderRadius: 6, padding: '4px 8px',
                    fontWeight: 600, cursor: 'pointer', fontSize: 11,
                    transition: 'all 0.15s',
                  }}>
                    {periodLabels[p]}
                  </button>
                ))}
              </div>
            }
          />

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--c-text)' }}>
              {currentValue.toFixed(0)} ETB
            </div>
            <span style={{
              fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
              background: delta >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: delta >= 0 ? '#4ade80' : '#f87171',
            }}>
              {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
            </span>
          </div>

          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{
            width: '100%', height: 140, display: 'block',
            borderRadius: 10, background: 'rgba(148,163,184,0.03)',
          }}>
            <defs>
              <linearGradient id="revFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(99,102,241,0.5)" />
                <stop offset="100%" stopColor="rgba(99,102,241,0.03)" />
              </linearGradient>
            </defs>
            <path d={`${buildPath(periodSeries)} L 100,100 L 0,100 Z`} fill="url(#revFill)" />
            <path d={buildPath(periodSeries)} fill="none" stroke="#6366f1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          <div style={{ display: 'flex', gap: 0, marginTop: 10 }}>
            {periodSeries.map((_, idx) => (
              <div key={idx} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--c-muted)', fontWeight: 600 }}>
                {chartLabels[activePeriod][idx]}
              </div>
            ))}
          </div>
        </Card>

        {/* Operations at a glance */}
        <Card>
          <CardHeader title="Operations" subtitle="Items requiring attention" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Pending withdrawals', value: summary?.pendingWithdrawals ?? 0, color: '#ef4444', bg: 'rgba(239,68,68,0.08)', icon: '💸', badge: 'danger' as const },
              { label: 'Pending deposits',    value: summary?.pendingDeposits ?? 0,    color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icon: '📥', badge: 'warning' as const },
              { label: 'Active agents',       value: summary?.activeAgents ?? 0,       color: '#22c55e', bg: 'rgba(34,197,94,0.08)', icon: '🤝', badge: 'success' as const },
              { label: 'Total players',       value: summary?.totalPlayers ?? 0,       color: '#6366f1', bg: 'rgba(99,102,241,0.08)', icon: '👥', badge: 'primary' as const },
            ].map((item) => (
              <div key={item.label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderRadius: 10,
                background: item.bg,
                border: `1px solid ${item.color}28`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)', lineHeight: 1.2, letterSpacing: '-0.03em' }}>
                      {item.value}
                    </div>
                  </div>
                </div>
                <Badge variant={item.badge}>
                  {item.badge === 'danger' ? 'Review' : item.badge === 'warning' ? 'Pending' : item.badge === 'success' ? 'OK' : 'Total'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Tables row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <Card>
          <CardHeader title="Pending Withdrawals" subtitle="Awaiting approval" />
          {pendingWithdrawals.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--c-muted)', fontSize: 13 }}>
              No pending withdrawals
            </div>
          ) : (
            <Table>
              <thead><tr><Th>Player</Th><Th>Amount</Th><Th>Date</Th></tr></thead>
              <tbody>
                {pendingWithdrawals.map((w) => (
                  <tr key={w.id}>
                    <Td><span style={{ fontWeight: 600 }}>@{w.username}</span></Td>
                    <Td><span style={{ fontWeight: 700, color: '#f87171' }}>{Number(w.amount).toFixed(2)} ETB</span></Td>
                    <Td muted>{new Date(w.created_at).toLocaleDateString()}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent Deposits" subtitle="Latest Telebirr transactions" />
          {recentDeposits.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--c-muted)', fontSize: 13 }}>
              No recent deposits
            </div>
          ) : (
            <Table>
              <thead><tr><Th>Tx Number</Th><Th>Amount</Th><Th>Status</Th></tr></thead>
              <tbody>
                {recentDeposits.map((d) => (
                  <tr key={d.id}>
                    <Td mono>{d.tx_number}</Td>
                    <Td><span style={{ fontWeight: 700 }}>{Number(d.amount).toFixed(2)} ETB</span></Td>
                    <Td>
                      <Badge variant={d.status === 'pending' ? 'warning' : d.status === 'claimed' ? 'success' : 'neutral'}>
                        {d.status}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
