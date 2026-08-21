import React, { useState, useEffect, useCallback } from 'react';
import type { AdminRound } from '@fidel/shared';
import {
  getMockPlayers, seedMockPlayers, creditMockPlayer,
  joinRoundWithMockPlayers, type MockPlayer,
} from '../lib/api';
import { getAdminRounds } from '../lib/api';
import {
  C, Btn, Badge, Card, CardHeader, Table, Th, Td,
  TrEmpty, TrLoading, Alert, Field, PageHeader, inputCss, StatCard,
} from '../components/ui';

// ─── Seed Card ────────────────────────────────────────────────────────────────

function SeedCard({ onSeeded }: { onSeeded: () => void }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleSeed() {
    setLoading(true); setErr(null); setMsg(null);
    try {
      const r = await seedMockPlayers();
      setMsg(r.message);
      onSeeded();
    } catch (e: unknown) {
      setErr((e as Error).message ?? 'Failed');
    } finally { setLoading(false); }
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader title="Setup" subtitle="Create the 10 mock players in the database if they don't exist yet" />
      {err && <Alert type="error">{err}</Alert>}
      {msg && <Alert type="success">{msg}</Alert>}
      <Btn onClick={handleSeed} disabled={loading}>{loading ? 'Seeding…' : '🌱 Seed Mock Players'}</Btn>
    </Card>
  );
}

// ─── Credit Modal ─────────────────────────────────────────────────────────────

function CreditModal({ player, onClose, onDone }: {
  player: MockPlayer;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [wallet, setWallet] = useState<'play' | 'main'>('play');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseFloat(amount);
    if (isNaN(n) || n <= 0) { setErr('Enter a positive amount'); return; }
    setLoading(true); setErr(null);
    try {
      await creditMockPlayer(player.id, n, wallet);
      onDone();
      onClose();
    } catch (ex: unknown) {
      setErr((ex as Error).message ?? 'Failed');
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 14,
        padding: 24, width: 340, maxWidth: '90vw',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--c-text)' }}>
          Credit — {player.username}
        </h3>
        {err && <Alert type="error">{err}</Alert>}
        <form onSubmit={handleSubmit}>
          <Field label="Amount (ETB)" style={{ marginBottom: 12 }}>
            <input style={inputCss} type="number" min="1" step="any" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 100" required autoFocus />
          </Field>
          <Field label="Wallet" style={{ marginBottom: 16 }}>
            <select style={inputCss} value={wallet} onChange={(e) => setWallet(e.target.value as 'play' | 'main')}>
              <option value="play">Play wallet</option>
              <option value="main">Main wallet</option>
            </select>
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn type="submit" disabled={loading}>{loading ? 'Crediting…' : 'Credit'}</Btn>
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Join Round Form ──────────────────────────────────────────────────────────

function JoinRoundCard({ players, onJoined }: {
  players: MockPlayer[];
  onJoined: () => void;
}) {
  const [rounds, setRounds] = useState<AdminRound[]>([]);
  const [roundId, setRoundId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [balance, setBalance] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    getAdminRounds(1).then((r) => {
      const items: AdminRound[] = (r as any).items ?? (Array.isArray(r) ? r : []);
      setRounds(items.filter((ro) => ro.status === 'pending'));
    }).catch(() => {});
  }, []);

  function toggleAll() {
    if (selected.size === players.length) setSelected(new Set());
    else setSelected(new Set(players.map((p) => p.id)));
  }

  function toggle(id: string) {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!roundId) { setErr('Select a round'); return; }
    if (!selected.size) { setErr('Select at least one mock player'); return; }
    const bal = parseFloat(balance);
    if (isNaN(bal) || bal < 0) { setErr('Balance must be >= 0'); return; }
    setLoading(true); setErr(null); setResult(null);
    try {
      const res = await joinRoundWithMockPlayers(roundId, Array.from(selected), bal);
      setResult(`✅ Joined: ${res.joined.length}${res.errors.length ? ` · ❌ Failed: ${res.errors.length}` : ''}`);
      setSelected(new Set());
      onJoined();
    } catch (ex: unknown) {
      setErr((ex as Error).message ?? 'Failed');
    } finally { setLoading(false); }
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader title="Add to Round" subtitle="Select players, pick a pending round, and provide a balance" />
      {err && <Alert type="error">{err}</Alert>}
      {result && <Alert type="success">{result}</Alert>}
      <form onSubmit={handleJoin}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 16 }}>
          <Field label="Pending Round">
            <select style={inputCss} value={roundId} onChange={(e) => setRoundId(e.target.value)} required>
              <option value="">— select —</option>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.id.slice(-6).toUpperCase()} · {Number(r.stake).toFixed(0)} ETB · {r.player_count} players
                </option>
              ))}
            </select>
          </Field>
          <Field label="Balance per player (ETB)">
            <input style={inputCss} type="number" min="0" step="any" value={balance}
              onChange={(e) => setBalance(e.target.value)} placeholder="e.g. 200" required />
          </Field>
        </div>

        {/* Player checkboxes */}
        <div style={{ marginBottom: 12 }}>
          <button type="button" onClick={toggleAll}
            style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12, padding: 0, marginBottom: 8 }}>
            {selected.size === players.length ? 'Deselect all' : 'Select all'}
          </button>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {players.map((p) => (
              <label key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                padding: '4px 10px', borderRadius: 8, fontSize: 12,
                background: selected.has(p.id) ? 'rgba(99,102,241,0.15)' : 'var(--c-surface)',
                border: `1px solid ${selected.has(p.id) ? 'rgba(99,102,241,0.4)' : 'var(--c-border)'}`,
                color: selected.has(p.id) ? '#a5b4fc' : 'var(--c-text-secondary)',
                transition: 'all 0.15s',
              }}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)}
                  style={{ accentColor: '#6366f1' }} />
                {p.username}
              </label>
            ))}
          </div>
        </div>

        <Btn type="submit" disabled={loading || !selected.size}>
          {loading ? 'Joining…' : `▶ Add ${selected.size || ''} to Round`}
        </Btn>
      </form>
    </Card>
  );
}

// ─── Players Table ────────────────────────────────────────────────────────────

function PlayersTable({ players, loading, onCredit }: {
  players: MockPlayer[];
  loading: boolean;
  onCredit: (p: MockPlayer) => void;
}) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Username</Th>
          <Th>Play Balance</Th>
          <Th>Main Balance</Th>
          <Th>Games Played</Th>
          <Th>Status</Th>
          <Th>Actions</Th>
        </tr>
      </thead>
      <tbody>
        {loading ? <TrLoading cols={6} /> :
         !players.length ? <TrEmpty cols={6} message="No mock players yet. Click 'Seed Mock Players' above." /> :
         players.map((p) => (
          <tr key={p.id}>
            <Td mono>{p.username}</Td>
            <Td><span style={{ fontWeight: 600, color: '#4ade80' }}>{p.play_wallet_balance.toFixed(2)} ETB</span></Td>
            <Td>{p.main_wallet_balance.toFixed(2)} ETB</Td>
            <Td muted>{p.total_games}</Td>
            <Td>
              {p.is_suspended
                ? <Badge variant="danger">Suspended</Badge>
                : <Badge variant="success">Active</Badge>}
            </Td>
            <Td>
              <Btn size="sm" variant="secondary" onClick={() => onCredit(p)}>+ Credit</Btn>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MockPlayersPage() {
  const [players, setPlayers] = useState<MockPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [creditTarget, setCreditTarget] = useState<MockPlayer | null>(null);

  const fetchPlayers = useCallback(async () => {
    setFetchErr(null);
    try {
      const data = await getMockPlayers();
      setPlayers(data);
    } catch (e: unknown) {
      setFetchErr((e as Error).message ?? 'Failed to load mock players');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void fetchPlayers();
  }, [fetchPlayers]);

  const totalPlay = players.reduce((s, p) => s + p.play_wallet_balance, 0);
  const totalGames = players.reduce((s, p) => s + p.total_games, 0);
  const active = players.filter((p) => !p.is_suspended).length;

  return (
    <div className="fade-in">
      <PageHeader title="Mock Players" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard icon="🤖" label="Total Bots"    value={players.length} color={C.primary} />
        <StatCard icon="✅" label="Active"         value={active}         color={C.success} />
        <StatCard icon="🎮" label="Games Played"  value={totalGames}     color={C.info} />
        <StatCard icon="💰" label="Total Play Bal" value={`${totalPlay.toFixed(0)} ETB`} color={C.warning} />
      </div>

      {fetchErr && <Alert type="error">{fetchErr}</Alert>}

      <SeedCard onSeeded={fetchPlayers} />

      {players.length > 0 && (
        <JoinRoundCard players={players} onJoined={fetchPlayers} />
      )}

      <Card>
        <CardHeader
          title="Mock Players"
          subtitle="Bot-controlled players managed by admin"
          action={<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>{players.length} / 10</span>}
        />
        <PlayersTable players={players} loading={loading} onCredit={setCreditTarget} />
      </Card>

      {creditTarget && (
        <CreditModal
          player={creditTarget}
          onClose={() => setCreditTarget(null)}
          onDone={fetchPlayers}
        />
      )}
    </div>
  );
}
