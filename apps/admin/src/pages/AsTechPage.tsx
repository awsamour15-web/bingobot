import { useEffect, useState } from 'react';
import {
  getAsTechStats,
  getAsTechSessions,
  getAsTechTransactions,
  type AsTechStats,
  type AsTechSession,
  type AsTechTransaction,
} from '../lib/api';

type Period = '1h' | 'today' | 'week' | 'month' | 'all';

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--card)', borderRadius: 10, padding: '16px 20px', minWidth: 150 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function AsTechPage() {
  const [period, setPeriod] = useState<Period>('today');
  const [stats,  setStats]  = useState<AsTechStats | null>(null);
  const [sessions, setSessions] = useState<AsTechSession[]>([]);
  const [txs,      setTxs]     = useState<AsTechTransaction[]>([]);
  const [tab,  setTab]  = useState<'sessions' | 'transactions'>('sessions');
  const [loading, setLoading]  = useState(false);
  const [error,   setError]    = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      getAsTechStats(period),
      getAsTechSessions({ limit: 50 }),
      getAsTechTransactions({ limit: 50 }),
    ])
      .then(([s, sess, t]) => { setStats(s); setSessions(sess); setTxs(t); })
      .catch((e) => setError(e.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [period]);

  const periods: Period[] = ['1h', 'today', 'week', 'month', 'all'];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 20 }}>AS Tech API — Games Hub</h2>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 16px', borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {periods.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: period === p ? 'var(--primary)' : 'var(--card)',
              color: period === p ? '#fff' : 'inherit',
              fontWeight: period === p ? 600 : 400,
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Stats cards */}
      {loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      ) : stats ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
          <StatCard label="Total Bet"     value={`${fmt(stats.totalBet)} ETB`} />
          <StatCard label="Total Win"     value={`${fmt(stats.totalWin)} ETB`} />
          <StatCard label="GGR"           value={`${fmt(stats.ggr)} ETB`} sub="Gross Gaming Revenue" />
          <StatCard label="Rounds Played" value={String(stats.roundsPlayed)} />
          <StatCard label="Sessions"      value={String(stats.sessions)} />
          <StatCard label="Players"       value={String(stats.players)} />
        </div>
      ) : null}

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {(['sessions', 'transactions'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontWeight: tab === t ? 700 : 400,
              borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Sessions table */}
      {tab === 'sessions' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--card)', textAlign: 'left' }}>
                {['Player', 'Game', 'Currency', 'Embeddable', 'Status', 'Launched'].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 16, color: 'var(--muted)' }}>No sessions yet</td></tr>
              ) : sessions.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px' }}>{s.username}</td>
                  <td style={{ padding: '8px 12px' }}>{s.gameTitle || s.gameId}</td>
                  <td style={{ padding: '8px 12px' }}>{s.currency}</td>
                  <td style={{ padding: '8px 12px' }}>{s.embeddable ? '✓' : '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 999, fontSize: 11,
                      background: s.status === 'active' ? '#d1fae5' : '#f3f4f6',
                      color:      s.status === 'active' ? '#065f46' : '#6b7280',
                    }}>
                      {s.status}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Transactions table */}
      {tab === 'transactions' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--card)', textAlign: 'left' }}>
                {['Player', 'Cmd', 'Bet', 'Win', 'Balance After', 'Round', 'Time'].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txs.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 16, color: 'var(--muted)' }}>No transactions yet</td></tr>
              ) : txs.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px' }}>{t.username}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 999, fontSize: 11,
                      background: t.cmd === 'writeBet' ? '#eff6ff' : '#fef3c7',
                      color:      t.cmd === 'writeBet' ? '#1d4ed8' : '#92400e',
                    }}>
                      {t.cmd}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', color: t.bet > 0 ? '#dc2626' : 'inherit' }}>
                    {t.bet > 0 ? `-${fmt(t.bet)}` : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', color: t.win > 0 ? '#16a34a' : 'inherit' }}>
                    {t.win > 0 ? `+${fmt(t.win)}` : '—'}
                  </td>
                  <td style={{ padding: '8px 12px' }}>{fmt(t.balanceAfter)}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: 11 }}>
                    {t.roundId ?? '—'}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>
                    {new Date(t.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
