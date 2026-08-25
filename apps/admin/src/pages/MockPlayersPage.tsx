import React, { useState, useEffect, useCallback } from 'react';
import type { AdminRound } from '@fidel/shared';
import {
  getMockPlayers, seedMockPlayers, creditMockPlayer,
  joinRoundWithMockPlayers, renameMockPlayer, type MockPlayer,
} from '../lib/api';
import { adminApiRequest } from '../lib/api';
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
      <CardHeader title="Setup" subtitle="Create up to 50 mock players in the database if they don't exist yet" />
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
          <div style={{ marginBottom: 12 }}>
            <Field label="Amount (ETB)">
              <input style={inputCss} type="number" min="1" step="any" value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 100" required autoFocus />
            </Field>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Field label="Wallet">
              <select style={inputCss} value={wallet} onChange={(e) => setWallet(e.target.value as 'play' | 'main')}>
                <option value="play">Play wallet</option>
                <option value="main">Main wallet</option>
              </select>
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn type="submit" disabled={loading}>{loading ? 'Crediting…' : 'Credit'}</Btn>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Rename Modal ─────────────────────────────────────────────────────────────

function RenameModal({ player, onClose, onDone }: {
  player: MockPlayer;
  onClose: () => void;
  onDone: () => void;
}) {
  const [username, setUsername] = useState(player.username);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) { setErr('Username cannot be empty'); return; }
    setLoading(true); setErr(null);
    try {
      await renameMockPlayer(player.id, username.trim());
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
          Rename — {player.username}
        </h3>
        {err && <Alert type="error">{err}</Alert>}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <Field label="New Username">
              <input style={inputCss} type="text" value={username}
                onChange={(e) => setUsername(e.target.value)} placeholder="e.g. john_bot" required autoFocus />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save'}</Btn>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
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

function PlayersTable({ players, loading, onCredit, onRename }: {
  players: MockPlayer[];
  loading: boolean;
  onCredit: (p: MockPlayer) => void;
  onRename: (p: MockPlayer) => void;
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
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn size="sm" variant="outline" onClick={() => onCredit(p)}>+ Credit</Btn>
                <Btn size="sm" variant="ghost" onClick={() => onRename(p)}>✏ Rename</Btn>
              </div>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

// ─── Bot Config Card ──────────────────────────────────────────────────────────

function BotConfigCard() {
  const [enabled, setEnabled] = useState(false);
  const [winEnabled, setWinEnabled] = useState(false);
  const [count, setCount] = useState('3');
  const [balance, setBalance] = useState('0');
  const [stakes, setStakes] = useState<Set<number>>(new Set([10, 20, 50]));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    adminApiRequest<{ enabled: boolean; winEnabled: boolean; count: number; balance: number; stakes: number[] }>('GET', '/api/admin/mock-players/bot-config')
      .then((d) => {
        setEnabled(d.enabled);
        setWinEnabled(d.winEnabled ?? false);
        setCount(String(d.count));
        setBalance(String(d.balance));
        setStakes(new Set(d.stakes?.length ? d.stakes : [10, 20, 50]));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleStake(s: number) {
    setStakes((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }

  async function save() {
    if (!stakes.size) { setMsg('Select at least one stake'); return; }
    setSaving(true); setMsg(null);
    try {
      await adminApiRequest('PATCH', '/api/admin/mock-players/bot-config', {
        enabled,
        winEnabled,
        count: parseInt(count, 10),
        balance: parseFloat(balance),
        stakes: [...stakes],
      });
      setMsg('Saved');
    } catch { setMsg('Failed to save'); }
    finally { setSaving(false); }
  }

  if (loading) return null;

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader title="Auto-Join Bot" subtitle="Mock players automatically join new pending rounds with a 1s stagger" />
      {msg && <Alert type={msg === 'Saved' ? 'success' : 'error'}>{msg}</Alert>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--c-text)' }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
              style={{ accentColor: '#6366f1', width: 16, height: 16 }} />
            Enabled
          </label>
        </div>
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--c-text)' }}>
            <input type="checkbox" checked={winEnabled} onChange={(e) => setWinEnabled(e.target.checked)}
              style={{ accentColor: '#f59e0b', width: 16, height: 16 }} />
            Guaranteed Win (one mock player wins each round)
          </label>
        </div>
        <Field label="Players per round (1–50)">
          <input style={inputCss} type="number" min="1" max="50" value={count}
            onChange={(e) => setCount(e.target.value)} />
        </Field>
        <Field label="Balance per player (0 = auto-cover stake)">
          <input style={inputCss} type="number" min="0" step="any" value={balance}
            onChange={(e) => setBalance(e.target.value)} />
        </Field>
      </div>

      {/* Stake filter */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 8 }}>
          Active on stakes (select at least one)
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[10, 20, 50].map((s) => (
            <label key={s} style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: stakes.has(s) ? 'rgba(99,102,241,0.15)' : 'var(--c-surface)',
              border: `1px solid ${stakes.has(s) ? 'rgba(99,102,241,0.4)' : 'var(--c-border)'}`,
              color: stakes.has(s) ? '#a5b4fc' : 'var(--c-text-secondary)',
              transition: 'all 0.15s',
            }}>
              <input type="checkbox" checked={stakes.has(s)} onChange={() => toggleStake(s)}
                style={{ accentColor: '#6366f1' }} />
              {s} ETB
            </label>
          ))}
        </div>
      </div>

      <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</Btn>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MockPlayersPage() {
  const [players, setPlayers] = useState<MockPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [creditTarget, setCreditTarget] = useState<MockPlayer | null>(null);
  const [renameTarget, setRenameTarget] = useState<MockPlayer | null>(null);

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

      <BotConfigCard />

      {players.length > 0 && (
        <JoinRoundCard players={players} onJoined={fetchPlayers} />
      )}

      <Card>
        <CardHeader
          title="Mock Players"
          subtitle="Bot-controlled players managed by admin"
          action={<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>{players.length} / 10</span>}
        />
        <PlayersTable players={players} loading={loading} onCredit={setCreditTarget} onRename={setRenameTarget} />
      </Card>

      {creditTarget && (
        <CreditModal
          player={creditTarget}
          onClose={() => setCreditTarget(null)}
          onDone={fetchPlayers}
        />
      )}

      {renameTarget && (
        <RenameModal
          player={renameTarget}
          onClose={() => setRenameTarget(null)}
          onDone={fetchPlayers}
        />
      )}
    </div>
  );
}
