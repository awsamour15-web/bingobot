import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Btn, Card, CardHeader,
  PageHeader, Table, Td, Th, TrEmpty, TrLoading,
} from '../components/ui';
import { getGamesStats } from '../lib/api';
import type { GameStat, GameTx, GamesStatsResponse } from '../lib/api';

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ProfitCell({ profit }: { profit: number }) {
  const positive = profit >= 0;
  return (
    <span style={{
      fontWeight: 700,
      color: positive ? '#4ade80' : '#f87171',
      fontVariantNumeric: 'tabular-nums',
    }}>
      {positive ? '+' : ''}{fmt(profit)}
    </span>
  );
}

function TransactionsTable({ txs, loading }: { txs: GameTx[]; loading: boolean }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>ID</Th>
          <Th right>Players</Th>
          <Th right>Bets In (ETB)</Th>
          <Th right>Paid Out (ETB)</Th>
          <Th right>Profit / Loss</Th>
          <Th>Date</Th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <TrLoading cols={6} />
        ) : txs.length === 0 ? (
          <TrEmpty cols={6} message="No transactions found." />
        ) : (
          txs.map((tx) => (
            <tr key={tx.id}>
              <Td mono muted>{String(tx.id).slice(0, 12)}…</Td>
              <Td right muted>{tx.players}</Td>
              <Td right mono>{fmt(tx.totalBet)}</Td>
              <Td right mono style={{ color: '#f87171' }}>{fmt(tx.paid)}</Td>
              <Td right><ProfitCell profit={tx.profit} /></Td>
              <Td muted>{new Date(tx.date).toLocaleString()}</Td>
            </tr>
          ))
        )}
      </tbody>
    </Table>
  );
}

export function GamesPage() {
  const [data, setData] = useState<GamesStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getGamesStats();
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load game stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const bingoGame: GameStat | undefined = data?.games.find(g => g.key === 'bingo');
  const txs: GameTx[] = data?.transactions['bingo'] ?? [];

  return (
    <div className="fade-in">
      <PageHeader
        title="Games"
        action={
          <Btn variant="ghost" size="sm" onClick={load} disabled={loading}>
            ↻ Refresh
          </Btn>
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      {/* Bingo summary bar */}
      {!loading && bingoGame && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}>
          {[
            { label: 'Total Rounds',   value: bingoGame.totalRounds.toLocaleString(), color: 'var(--c-text)' },
            { label: 'Total Bets In',  value: fmt(bingoGame.totalBets) + ' ETB',      color: 'var(--c-text)' },
            { label: 'Total Paid Out', value: fmt(bingoGame.totalPaid) + ' ETB',      color: '#f87171' },
            { label: 'Net Profit',     value: (bingoGame.profit >= 0 ? '+' : '') + fmt(bingoGame.profit) + ' ETB', color: bingoGame.profit >= 0 ? '#4ade80' : '#f87171' },
          ].map((s) => (
            <div key={s.label} style={{
              background: 'var(--c-bg-card)',
              border: '1px solid var(--c-border)',
              borderRadius: 12,
              padding: '14px 18px',
            }}>
              <div style={{ fontSize: 10, color: 'var(--c-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bingo transactions table */}
      <Card>
        <CardHeader
          title="🎯 Bingo — Recent Transactions"
          subtitle="Last 50 rounds with individual profit / loss"
          action={
            <Btn variant="ghost" size="sm" onClick={load} disabled={loading}>
              ↻ Refresh
            </Btn>
          }
        />
        <TransactionsTable txs={txs} loading={loading} />
      </Card>
    </div>
  );
}
