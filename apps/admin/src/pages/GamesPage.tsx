import React, { useState, useEffect, useCallback } from 'react';
import type { AdminRound, CreateRoundRequest, GameStatus } from '@fidel/shared';
import { getAdminRounds, createRound, startRound, cancelRound } from '../lib/api';
import {
  C, Btn, Badge, Card, CardHeader, Table, Th, Td,
  TrEmpty, TrLoading, Alert, Field, PageHeader, inputCss,
} from '../components/ui';

function statusVariant(s: GameStatus): 'warning' | 'success' | 'danger' | 'info' | 'neutral' {
  if (s === 'pending') return 'warning';
  if (s === 'active') return 'success';
  if (s === 'completed') return 'info';
  if (s === 'cancelled') return 'danger';
  return 'neutral';
}

function CreateRoundForm({ onCreated }: { onCreated: () => void }) {
  const [stake, setStake] = useState('');
  const [startTime, setStartTime] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('100');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const stakeNum = parseFloat(stake);
    const maxNum = parseInt(maxPlayers, 10);
    if (isNaN(stakeNum) || stakeNum <= 0) { setError('Stake must be a positive number.'); return; }
    if (!startTime) { setError('Start time is required.'); return; }
    if (isNaN(maxNum) || maxNum < 2) { setError('Max players must be at least 2.'); return; }
    setLoading(true); setError(null); setSuccess(null);
    try {
      const body: CreateRoundRequest = { stake: stakeNum, startTime: new Date(startTime).toISOString(), maxPlayers: maxNum };
      const round = await createRound(body);
      setSuccess(`Round #${round.id.slice(-6).toUpperCase()} created successfully.`);
      setStake(''); setStartTime(''); setMaxPlayers('100');
      onCreated();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to create round');
    } finally { setLoading(false); }
  }

  return (
    <Card style={{ marginBottom: 24 }}>
      <CardHeader title="Create New Round" subtitle="Schedule a bingo round for players" />
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr)) auto', gap: 12, alignItems: 'flex-end' }}>
          <Field label="Stake (ETB)">
            <input style={inputCss} type="number" min="1" step="any" value={stake} onChange={(e) => setStake(e.target.value)} placeholder="e.g. 50" required />
          </Field>
          <Field label="Start Time">
            <input style={inputCss} type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </Field>
          <Field label="Max Players">
            <input style={inputCss} type="number" min="2" step="1" value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} required />
          </Field>
          <div>
            <Btn type="submit" disabled={loading}>{loading ? 'Creating…' : '+ Create Round'}</Btn>
          </div>
        </div>
      </form>
    </Card>
  );
}

function RoundsTable({ rounds, showActions, onAction, loading, actioningId }: {
  rounds: AdminRound[]; showActions: boolean;
  onAction: (id: string, action: 'start' | 'cancel') => void;
  loading: boolean; actioningId: string | null;
}) {
  const colCount = showActions ? 8 : 9;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Round ID</Th>
          <Th>Status</Th>
          <Th>Stake (ETB)</Th>
          <Th>Players</Th>
          <Th>Prize Pool</Th>
          <Th>Called</Th>
          <Th>Start Time</Th>
          {showActions ? <Th>Actions</Th> : <><Th>Ended</Th><Th>Winners</Th></>}
        </tr>
      </thead>
      <tbody>
        {loading ? <TrLoading cols={colCount} /> :
         !rounds.length ? <TrEmpty cols={colCount} message="No rounds found." /> :
         rounds.map((r) => (
          <tr key={r.id}>
            <Td mono>#{r.id.slice(-6).toUpperCase()}</Td>
            <Td><Badge variant={statusVariant(r.status)}>{r.status}</Badge></Td>
            <Td><span style={{ fontWeight: 600 }}>{r.stake.toFixed(2)}</span></Td>
            <Td>{r.player_count}</Td>
            <Td><span style={{ fontWeight: 600, color: C.success }}>{r.derash.toFixed(2)}</span></Td>
            <Td>{r.called_numbers_count}</Td>
            <Td muted>{new Date(r.start_time).toLocaleString()}</Td>
            {showActions ? (
              <Td>
                <div style={{ display: 'flex', gap: 8 }}>
                  {r.status === 'pending' && (
                    <Btn size="sm" variant="success" disabled={actioningId === r.id} onClick={() => onAction(r.id, 'start')}>
                      {actioningId === r.id ? '…' : '▶ Start'}
                    </Btn>
                  )}
                  {(r.status === 'pending' || r.status === 'active') && (
                    <Btn size="sm" variant="danger" disabled={actioningId === r.id} onClick={() => onAction(r.id, 'cancel')}>
                      {actioningId === r.id ? '…' : '✕ Cancel'}
                    </Btn>
                  )}
                </div>
              </Td>
            ) : (
              <>
                <Td muted>{r.ended_at ? new Date(r.ended_at).toLocaleString() : '—'}</Td>
                <Td>
                  {!r.winners?.length ? <span style={{ color: C.muted }}>—</span> :
                   r.winners.length === 1 ? (
                    <span>{r.winners[0]?.username} · <span style={{ fontWeight: 600 }}>{r.winners[0]?.splitAmount.toFixed(2)} ETB</span></span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <Badge variant="primary">Split {r.winners.length}x</Badge>
                      {r.winners.map((w) => (
                        <span key={w.playerId} style={{ fontSize: 12 }}>{w.username} · {w.splitAmount.toFixed(2)} ETB</span>
                      ))}
                    </div>
                  )}
                </Td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function GamesPage() {
  const [allRounds, setAllRounds] = useState<AdminRound[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchRounds = useCallback(async () => {
    setFetchError(null);
    try {
      const res = await getAdminRounds(1);
      setAllRounds((res as any).items ?? (Array.isArray(res) ? res : []));
    } catch (err: unknown) {
      setFetchError((err as Error).message ?? 'Failed to load rounds');
    } finally { setFetchLoading(false); }
  }, []);

  useEffect(() => {
    void fetchRounds();
    const t = setInterval(fetchRounds, 5000);
    return () => clearInterval(t);
  }, [fetchRounds]);

  async function handleAction(id: string, action: 'start' | 'cancel') {
    const label = action === 'start' ? 'force-start' : 'cancel';
    if (!window.confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} round #${id.slice(-6).toUpperCase()}?`)) return;
    setActioningId(id); setActionError(null);
    try {
      if (action === 'start') await startRound(id); else await cancelRound(id);
      await fetchRounds();
    } catch (err: unknown) {
      setActionError((err as Error).message ?? `Failed to ${label} round`);
    } finally { setActioningId(null); }
  }

  const activeRounds = allRounds.filter((r) => r.status === 'pending' || r.status === 'active');
  const doneRounds = allRounds.filter((r) => ['completed', 'cancelled', 'void'].includes(r.status));

  return (
    <div className="fade-in">
      <PageHeader title="Games" />
      <CreateRoundForm onCreated={fetchRounds} />
      {actionError && <Alert type="error">{actionError}</Alert>}
      {fetchError && <Alert type="error">{fetchError}</Alert>}

      <Card style={{ marginBottom: 24 }}>
        <CardHeader
          title="Active & Pending"
          subtitle="Auto-refreshes every 5s"
          action={<span style={{ fontSize: 12, color: allRounds.some(r => r.status === 'active') ? C.success : C.muted, fontWeight: 600 }}>
            {allRounds.filter(r => r.status === 'active').length} live
          </span>}
        />
        <RoundsTable rounds={activeRounds} showActions onAction={handleAction} loading={fetchLoading && !allRounds.length} actioningId={actioningId} />
      </Card>

      <Card>
        <CardHeader title="Completed & Cancelled" />
        <RoundsTable rounds={doneRounds} showActions={false} onAction={handleAction} loading={fetchLoading && !allRounds.length} actioningId={actioningId} />
      </Card>
    </div>
  );
}
