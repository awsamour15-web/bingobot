import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Badge, Btn, Card, CardHeader,
  PageHeader, Table, Td, Th, TrEmpty, TrLoading,
} from '../components/ui';
import { getGamesStats } from '../lib/api';
import type { GameStat, GameTx, GamesStatsResponse } from '../lib/api';

type GameKey = 'bingo' | 'crash' | 'keno' | 'slots' | 'plinko';

const GAME_COLORS: Record<GameKey, string> = {
  bingo: '#6366f1',
  crash: '#ef4444',
  keno:  '#22c55e',
  slots: '#f59e0b',
  plinko: '#818cf8',
};

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

function GameSummaryCard({ game, selected, onClick }: {
  game: GameStat;
  selected: boolean;
  onClick: () => void;
}) {
  const color = GAME_COLORS[game.key as GameKey] ?? '#6366f1';
  return (
    <div
      onClick={onClick}
      style={{
        cursor: 'pointer',
        background: 'var(--c-bg-card)',
        border: selected ? `1.5px solid ${color}` : '1px solid var(--c-border)',
        borderRadius: 14,
        padding: '18px 20px',
        boxShadow: selected ? `0 0 0 3px ${color}22` : '0 1px 3px rgba(0,0,0,0.1)',
        transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: selected ? color : 'transparent',
        borderRadius: '14px 14px 0 0',
        transition: 'background 0.18s',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 22 }}>{game.icon}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
          background: game.profit >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          color: game.profit >= 0 ? '#4ade80' : '#f87171',
        }}>
          {game.profit >= 0 ? '+' : ''}{fmt(game.profit)}
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', marginBottom: 4 }}>
        {game.name}
      </div>
      <div style={{ fontSize: 11, color: 'var(--c-muted)', marginBottom: 10 }}>
        {game.totalRounds.toLocaleString()} rounds
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--c-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>
            Bets In
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>
            {fmt(game.totalBets)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--c-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>
            Paid Out
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f87171' }}>
            {fmt(game.totalPaid)}
          </div>
        </div>
      </div>
    </div>
  );
}

function TransactionsTable({ gameKey, txs, loading }: {
  gameKey: GameKey;
  txs: GameTx[];
  loading: boolean;
}) {
  const isSlots = gameKey === 'slots';
  const isCrash = gameKey === 'crash';

  const cols = isSlots ? 5 : isCrash ? 6 : 5;

  return (
    <Table>
      <thead>
        <tr>
          <Th>Round ID</Th>
          {isSlots && <Th>Player</Th>}
          <Th right>Players</Th>
          {isCrash && <Th right>Crash Point</Th>}
          <Th right>Bets In (ETB)</Th>
          <Th right>Paid Out (ETB)</Th>
          <Th right>Profit / Loss</Th>
          <Th>Date</Th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <TrLoading cols={cols + 2} />
        ) : txs.length === 0 ? (
          <TrEmpty cols={cols + 2} message="No transactions found." />
        ) : (
          txs.map((tx) => (
            <tr key={tx.id}>
              <Td mono muted>{String(tx.id).slice(0, 12)}…</Td>
              {isSlots && <Td><span style={{ fontWeight: 600 }}>@{tx.username ?? '—'}</span></Td>}
              <Td right muted>{tx.players}</Td>
              {isCrash && (
                <Td right>
                  <span style={{ fontWeight: 700, color: '#f59e0b' }}>
                    {tx.crashPoint != null ? `${Number(tx.crashPoint).toFixed(2)}x` : '—'}
                  </span>
                </Td>
              )}
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
  const [selectedGame, setSelectedGame] = useState<GameKey>('bingo');

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

  const txs: GameTx[] = data?.transactions[selectedGame] ?? [];
  const totalProfit = data?.games.reduce((s, g) => s + g.profit, 0) ?? 0;
  const totalBets   = data?.games.reduce((s, g) => s + g.totalBets, 0) ?? 0;
  const totalPaid   = data?.games.reduce((s, g) => s + g.totalPaid, 0) ?? 0;

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

      {/* Overall summary bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        marginBottom: 20,
      }}>
        {[
          { label: 'Total Bets In',  value: fmt(totalBets),   color: 'var(--c-text)' },
          { label: 'Total Paid Out', value: fmt(totalPaid),   color: '#f87171' },
          { label: 'Net Profit',     value: (totalProfit >= 0 ? '+' : '') + fmt(totalProfit), color: totalProfit >= 0 ? '#4ade80' : '#f87171' },
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
              {loading ? '…' : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Game cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 14,
        marginBottom: 24,
      }}>
        {loading
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} style={{
                height: 160, borderRadius: 14,
                background: 'var(--c-shimmer)',
                animation: 'shimmer 1.4s ease infinite',
              }} />
            ))
          : data?.games.map((g) => (
              <GameSummaryCard
                key={g.key}
                game={g}
                selected={selectedGame === g.key}
                onClick={() => setSelectedGame(g.key as GameKey)}
              />
            ))
        }
      </div>

      {/* Per-game transaction table */}
      
      <Card>
        <CardHeader
          title={`${data?.games.find(g => g.key === selectedGame)?.icon ?? ''} ${selectedGame.charAt(0).toUpperCase() + selectedGame.slice(1)} — Recent Transactions`}
          subtitle="Last 50 rounds, each with individual profit / loss"
          action={
            <div style={{ display: 'flex', gap: 6 }}>
              {(['bingo', 'crash', 'keno', 'slots', 'plinko'] as GameKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setSelectedGame(k)}
                  style={{
                    border: selectedGame === k
                      ? `1px solid ${GAME_COLORS[k]}80`
                      : '1px solid var(--c-border)',
                    background: selectedGame === k
                      ? `${GAME_COLORS[k]}18`
                      : 'transparent',
                    color: selectedGame === k ? GAME_COLORS[k] : 'var(--c-muted)',
                    borderRadius: 6, padding: '4px 10px',
                    fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.15s',
                    textTransform: 'capitalize',
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
          }
        />

        {/* Mini P&L summary for selected game */}
        {!loading && data && (() => {
          const g = data.games.find(g => g.key === selectedGame);
          if (!g) return null;
          return (
            <div style={{
              display: 'flex', gap: 16, flexWrap: 'wrap',
              marginBottom: 16, padding: '10px 14px',
              background: 'rgba(148,163,184,0.04)',
              borderRadius: 10, border: '1px solid var(--c-border)',
            }}>
              {[
                { label: 'Rounds', value: g.totalRounds.toLocaleString(), color: 'var(--c-text)' },
                { label: 'Total Bets', value: `${fmt(g.totalBets)} ETB`, color: 'var(--c-text)' },
                { label: 'Total Paid', value: `${fmt(g.totalPaid)} ETB`, color: '#f87171' },
                { label: 'Net P/L', value: `${g.profit >= 0 ? '+' : ''}${fmt(g.profit)} ETB`, color: g.profit >= 0 ? '#4ade80' : '#f87171' },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, color: 'var(--c-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {item.label}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: item.color }}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}

        <TransactionsTable
          gameKey={selectedGame}
          txs={txs}
          loading={loading}
        />
      </Card>
    </div>
  );
}
