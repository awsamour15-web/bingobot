import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { AdminPlayer, AdminCreditRequest } from '@fidel/shared';
import { getPlayers, getPlayer, suspendPlayer, restorePlayer, creditPlayer } from '../lib/api';
import {
  C, Btn, Badge, Card, CardHeader, Table, Th, Td,
  TrEmpty, TrLoading, Alert, Field, PageHeader, inputCss, selectCss, StatCard,
} from '../components/ui';

function PlayerDetail({ playerId, onBack }: { playerId: string; onBack: () => void }) {
  const [player, setPlayer] = useState<AdminPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suspending, setSuspending] = useState(false);
  const [suspendMsg, setSuspendMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [walletType, setWalletType] = useState<'main' | 'play'>('main');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditMsg, setCreditMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    getPlayer(playerId)
      .then((p) => { setPlayer(p); setLoading(false); })
      .catch((e: Error) => { setError(e.message ?? 'Failed to load player'); setLoading(false); });
  }, [playerId]);

  async function handleSuspendToggle() {
    if (!player) return;
    const action = player.is_suspended ? 'restore' : 'suspend';
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} player "${player.username}"?`)) return;
    setSuspending(true); setSuspendMsg(null);
    try {
      player.is_suspended ? await restorePlayer(player.id) : await suspendPlayer(player.id);
      setPlayer(await getPlayer(player.id));
      setSuspendMsg({ type: 'success', text: `Player ${action}d.` });
    } catch (e: unknown) {
      setSuspendMsg({ type: 'error', text: (e as Error).message ?? `Failed to ${action}` });
    } finally { setSuspending(false); }
  }

  async function handleCredit(e: React.FormEvent) {
    e.preventDefault();
    if (!player) return;
    const parsed = parseFloat(amount);
    if (isNaN(parsed)) { setCreditMsg({ type: 'error', text: 'Amount must be a valid number.' }); return; }
    if (!note.trim()) { setCreditMsg({ type: 'error', text: 'Note is required.' }); return; }
    setCreditLoading(true); setCreditMsg(null);
    try {
      await creditPlayer(player.id, { walletType, amount: parsed, note: note.trim() } as AdminCreditRequest);
      setPlayer(await getPlayer(player.id));
      setCreditMsg({ type: 'success', text: `Wallet updated: ${parsed > 0 ? '+' : ''}${parsed} ETB` });
      setAmount(''); setNote('');
    } catch (e: unknown) {
      setCreditMsg({ type: 'error', text: (e as Error).message ?? 'Failed to update wallet' });
    } finally { setCreditLoading(false); }
  }

  if (loading) return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 14, padding: 0, marginBottom: 20 }}>← Back</button>
      <p style={{ color: C.muted }}>Loading…</p>
    </div>
  );

  if (error || !player) return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 14, padding: 0, marginBottom: 20 }}>← Back</button>
      <Alert type="error">{error ?? 'Player not found'}</Alert>
    </div>
  );

  return (
    <div className="fade-in">
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 14, padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
        ← Back to Players
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: C.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
          👤
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>{player.username}</h1>
          <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Telegram ID: {player.telegram_id}</p>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Badge variant={player.is_suspended ? 'danger' : 'success'}>
            {player.is_suspended ? 'Suspended' : 'Active'}
          </Badge>
        </div>
      </div>

      {/* Wallet stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard icon="🏆" label="Main Wallet" value={`${player.main_wallet_balance.toFixed(2)} ETB`} color={C.success} />
        <StatCard icon="🎮" label="Play Wallet" value={`${player.play_wallet_balance.toFixed(2)} ETB`} color={C.primary} />
        <StatCard icon="🎯" label="Total Games" value={player.total_games} color={C.info} />
        <StatCard icon="👥" label="Referrals" value={player.total_referrals} color={C.warning} />
      </div>

      {/* Profile + suspend */}
      <Card style={{ marginBottom: 20 }}>
        <CardHeader title="Player Info" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
          {[
            { label: 'Phone', value: player.phone ?? '—' },
            { label: 'Verified', value: player.phone_verified ? '✓ Yes' : '✗ No' },
            { label: 'Joined', value: new Date(player.created_at).toLocaleDateString() },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 15, color: C.text, fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>
        {suspendMsg && <Alert type={suspendMsg.type}>{suspendMsg.text}</Alert>}
        <Btn variant={player.is_suspended ? 'success' : 'danger'} onClick={handleSuspendToggle} disabled={suspending}>
          {suspending ? 'Working…' : player.is_suspended ? '✓ Restore Player' : '⊘ Suspend Player'}
        </Btn>
      </Card>

      {/* Credit / Debit */}
      <Card>
        <CardHeader title="Manual Credit / Debit" subtitle="Use positive to credit, negative to debit" />
        {creditMsg && <Alert type={creditMsg.type}>{creditMsg.text}</Alert>}
        <form onSubmit={handleCredit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 400 }}>
          <Field label="Wallet">
            <select style={selectCss} value={walletType} onChange={(e) => setWalletType(e.target.value as 'main' | 'play')}>
              <option value="main">Main Wallet (winnings)</option>
              <option value="play">Play Wallet (deposits)</option>
            </select>
          </Field>
          <Field label="Amount (ETB)" hint="Positive = credit, negative = debit">
            <input style={inputCss} type="number" step="any" placeholder="e.g. 50 or -25" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
          <Field label="Reason">
            <input style={inputCss} type="text" placeholder="Reason for adjustment" value={note} onChange={(e) => setNote(e.target.value)} required />
          </Field>
          <Btn type="submit" disabled={creditLoading}>{creditLoading ? 'Submitting…' : 'Apply Adjustment'}</Btn>
        </form>
      </Card>
    </div>
  );
}

function PlayerList({ onView }: { onView: (id: string) => void }) {
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPlayers = useCallback((p: number, q: string) => {
    setLoading(true); setError(null);
    getPlayers(p, q || undefined)
      .then((res: any) => {
        setPlayers(res.items ?? res.players ?? []);
        setTotal(res.total ?? 0);
        setPageSize(res.pageSize ?? 20);
        setLoading(false);
      })
      .catch((e: Error) => { setError(e.message ?? 'Failed to load'); setLoading(false); });
  }, []);

  useEffect(() => { fetchPlayers(1, ''); }, [fetchPlayers]);

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSearch(val); setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPlayers(1, val), 400);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="fade-in">
      <PageHeader title="Players" />
      {error && <Alert type="error">{error}</Alert>}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 13, color: C.muted }}>{total} total players</span>
          <input
            type="search"
            placeholder="Search username or Telegram ID…"
            value={search}
            onChange={handleSearch}
            style={{ ...inputCss, width: 260 }}
          />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Player</Th>
              <Th>Telegram ID</Th>
              <Th>Phone</Th>
              <Th>Main Wallet</Th>
              <Th>Play Wallet</Th>
              <Th>Status</Th>
              <Th>Joined</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? <TrLoading cols={8} /> :
             !players.length ? <TrEmpty cols={8} message="No players found." /> :
             players.map((p) => (
              <tr key={p.id}>
                <Td><span style={{ fontWeight: 600 }}>@{p.username}</span></Td>
                <Td mono>{p.telegram_id}</Td>
                <Td muted={!p.phone}>{p.phone ?? '—'}</Td>
                <Td><span style={{ fontWeight: 600, color: C.success }}>{p.main_wallet_balance.toFixed(2)}</span></Td>
                <Td><span style={{ fontWeight: 600, color: C.primary }}>{p.play_wallet_balance.toFixed(2)}</span></Td>
                <Td><Badge variant={p.is_suspended ? 'danger' : 'success'}>{p.is_suspended ? 'Suspended' : 'Active'}</Badge></Td>
                <Td muted>{new Date(p.created_at).toLocaleDateString()}</Td>
                <Td>
                  <Btn size="sm" variant="outline" onClick={() => onView(p.id)}>View →</Btn>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <span style={{ fontSize: 13, color: C.muted }}>Page {page} of {totalPages}</span>
          <Btn size="sm" variant="ghost" onClick={() => { const p = page - 1; setPage(p); fetchPlayers(p, search); }} disabled={page <= 1 || loading}>← Prev</Btn>
          <Btn size="sm" variant="ghost" onClick={() => { const p = page + 1; setPage(p); fetchPlayers(p, search); }} disabled={page >= totalPages || loading}>Next →</Btn>
        </div>
      </Card>
    </div>
  );
}

export function PlayersPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (id) return <PlayerDetail playerId={id} onBack={() => navigate('/players')} />;
  return <PlayerList onView={(pid) => navigate(`/players/${pid}`)} />;
}
