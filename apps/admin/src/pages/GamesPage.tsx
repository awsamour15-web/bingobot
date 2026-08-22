import React, { useState, useEffect, useCallback } from 'react';
import type { AdminRound, CreateRoundRequest, GameStatus } from '@fidel/shared';
import { getAdminRounds, createRound, startRound, cancelRound } from '../lib/api';
import {
  C, Btn, Badge, Card, CardHeader, Table, Th, Td,
  TrEmpty, TrLoading, Alert, Field, PageHeader, inputCss, StatCard,
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
      const round = await createRound({ stake: stakeNum, startTime: new Date(startTime).toISOString(), maxPlayers: maxNum } as CreateRoundRequest);
      setSuccess(`Round #${round.id.slice(-6).toUpperCase()} created.`);
      setStake(''); setStartTime(''); setMaxPlayers('100');
      onCreated();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to create round');
    } finally { setLoading(false); }
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader title="Create New Round" subtitle="Schedule a bingo round" />
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, alignItems: 'flex-end' }}>
          <Field label="Stake (ETB)">
            <input style={inputCss} type="number" min="1" step="any" value={stake}
              onChange={(e) => setStake(e.target.value)} placeholder="e.g. 50" required />
          </Field>
          <Field label="Start Time">
            <input style={inputCss} type="datetime-local" value={startTime}
              onChange={(e) => setStartTime(e.target.value)} required />
          </Field>
          <Field label="Max Players">
            <input style={inputCss} type="number" min="2" value={maxPlayers}
              onChange={(e) => setMaxPlayers(e.target.value)} required />
          </Field>
          <div>
            <Btn type="submit" disabled={loading}>{loading ? 'Creating…' : '+ Create'}</Btn>
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
  const cols = showActions ? 8 : 9;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Round ID</Th><Th>Status</Th><Th>Stake</Th><Th>Players</Th>
          <Th>Prize Pool</Th><Th>Called</Th><Th>Start Time</Th>
          {showActions ? <Th>Actions</Th> : <><Th>Ended</Th><Th>Winners</Th></>}
        </tr>
      </thead>
      <tbody>
        {loading ? <TrLoading cols={cols} /> :
         !rounds.length ? <TrEmpty cols={cols} message="No rounds found." /> :
         rounds.map((r) => (
          <tr key={r.id}>
            <Td mono>#{r.id.slice(-6).toUpperCase()}</Td>
            <Td><Badge variant={statusVariant(r.status)}>{r.status}</Badge></Td>
            <Td><span style={{ fontWeight: 600 }}>{Number(r.stake).toFixed(2)} ETB</span></Td>
            <Td>{r.player_count}</Td>
            <Td><span style={{ fontWeight: 600, color: '#4ade80' }}>{Number(r.derash).toFixed(2)}</span></Td>
            <Td>{r.called_numbers_count}</Td>
            <Td muted>{new Date(r.start_time).toLocaleString()}</Td>
            {showActions ? (
              <Td>
                <div style={{ display: 'flex', gap: 6 }}>
                  {r.status === 'pending' && (
                    <Btn size="sm" variant="success" disabled={actioningId === r.id} onClick={() => onAction(r.id, 'start')}>
                      {actioningId === r.id ? '…' : '▶ Start'}
                    </Btn>
                  )}
                  {(r.status === 'pending' || r.status === 'active') && (
                    <Btn size="sm" variant="danger" disabled={actioningId === r.id} onClick={() => onAction(r.id, 'cancel')}>
                      {actioningId === r.id ? '…' : 'Cancel'}
                    </Btn>
                  )}
                </div>
              </Td>
            ) : (
              <>
                <Td muted>{r.ended_at ? new Date(r.ended_at).toLocaleString() : '—'}</Td>
                <Td>
                  {!r.winners?.length ? <span style={{ color: C.muted }}>—</span> :
                   r.winners.length === 1
                    ? <span>{r.winners[0]?.username} · <span style={{ fontWeight: 600 }}>{Number(r.winners[0]?.splitAmount).toFixed(2)} ETB</span></span>
                    : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <Badge variant="primary">Split {r.winners.length}×</Badge>
                        {r.winners.map((w) => (
                          <span key={w.playerId} style={{ fontSize: 12 }}>{w.username} · {Number(w.splitAmount).toFixed(2)}</span>
                        ))}
                      </div>
                    )
                  }
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
    try {
      const res = await getAdminRounds(1);
      setAllRounds((res as any).items ?? (Array.isArray(res) ? res : []));
      setFetchError(null);
    } catch (err: unknown) {
      // Only update error state if it changed — avoids re-renders on every poll failure
      const msg = (err as Error).message ?? 'Failed to load rounds';
      setFetchError((prev) => (prev === msg ? prev : msg));
    } finally { setFetchLoading(false); }
  }, []);

  useEffect(() => {
    void fetchRounds();
    let t: ReturnType<typeof setInterval>;

    function scheduleNext() {
      t = setInterval(() => {
        if (!document.hidden) void fetchRounds();
      }, 5000);
    }

    scheduleNext();
    return () => clearInterval(t);
  }, [fetchRounds]);

  async function handleAction(id: string, action: 'start' | 'cancel') {
    if (!window.confirm(`${action === 'start' ? 'Start' : 'Cancel'} round #${id.slice(-6).toUpperCase()}?`)) return;
    setActioningId(id); setActionError(null);
    try {
      if (action === 'start') await startRound(id); else await cancelRound(id);
      await fetchRounds();
    } catch (err: unknown) {
      setActionError((err as Error).message ?? `Failed to ${action} round`);
    } finally { setActioningId(null); }
  }

  const activeRounds = allRounds.filter((r) => r.status === 'pending' || r.status === 'active');
  const doneRounds = allRounds.filter((r) => ['completed', 'cancelled', 'void'].includes(r.status));
  const liveCount = allRounds.filter(r => r.status === 'active').length;

  return (
    <div className="fade-in">
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      <PageHeader title="Games" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard icon="🟢" label="Live"      value={liveCount}                                     color={C.success} />
        <StatCard icon="⏳" label="Pending"   value={activeRounds.filter(r => r.status === 'pending').length} color={C.warning} />
        <StatCard icon="✅" label="Completed" value={doneRounds.filter(r => r.status === 'completed').length} color={C.info}    />
        <StatCard icon="📊" label="Total"     value={allRounds.length}                              color={C.primary} />
      </div>

      {actionError && <Alert type="error">{actionError}</Alert>}
      {fetchError && <Alert type="error">{fetchError}</Alert>}

      <CreateRoundForm onCreated={fetchRounds} />

      <Card style={{ marginBottom: 20 }}>
        <CardHeader
          title="Active & Pending Games"
          subtitle="Auto-refreshes every 5s"
          action={
            <span style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, color: liveCount > 0 ? '#4ade80' : 'var(--c-muted)', fontWeight: 600,
            }}>
              {liveCount > 0 && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite', display: 'inline-block' }} />}
              {liveCount} live
            </span>
          }
        />
        <RoundsTable rounds={activeRounds} showActions onAction={handleAction}
          loading={fetchLoading && !allRounds.length} actioningId={actioningId} />
      </Card>

      <Card>
        <CardHeader
          title="Completed & Cancelled"
          subtitle="Historical game records"
          action={<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>{doneRounds.length} total</span>}
        />
        <RoundsTable rounds={doneRounds} showActions={false} onAction={handleAction}
          loading={fetchLoading && !allRounds.length} actioningId={actioningId} />
      </Card>
    </div>
  );
}
