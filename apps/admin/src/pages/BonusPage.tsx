import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminPlayer, AdminCreditRequest } from '@fidel/shared';
import { getPlayers, creditPlayer } from '../lib/api';
import {
  C,
  Btn,
  Card,
  CardHeader,
  Field,
  PageHeader,
  StatCard,
  Table,
  Th,
  Td,
  TrEmpty,
  TrLoading,
  Alert,
  Badge,
  inputCss,
  selectCss,
} from '../components/ui';

type WalletType = 'main' | 'play';

type BonusPreset = {
  id: string;
  label: string;
  amount: number;
  wallet: WalletType;
  note: string;
};

const BONUS_PRESETS: BonusPreset[] = [
  { id: 'welcome', label: 'Welcome Bonus', amount: 20, wallet: 'play', note: 'Welcome bonus for new player registration' },
  { id: 'deposit', label: 'Deposit Boost', amount: 50, wallet: 'play', note: 'Deposit bonus awarded by admin' },
  { id: 'referral', label: 'Referral Bonus', amount: 30, wallet: 'main', note: 'Referral commission payout' },
  { id: 'vip', label: 'VIP Reward', amount: 100, wallet: 'main', note: 'VIP loyalty reward' },
  { id: 'custom', label: 'Custom Bonus', amount: 0, wallet: 'play', note: 'Custom bonus' },
];
const DEFAULT_BONUS_PRESET = BONUS_PRESETS[0]!;

export function BonusPage() {
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [walletType, setWalletType] = useState<WalletType>('play');
  const [presetId, setPresetId] = useState<string>(DEFAULT_BONUS_PRESET.id);
  const [customAmount, setCustomAmount] = useState('20');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchPlayers = useCallback((query: string) => {
    setLoading(true);
    setError(null);
    getPlayers(1, query || undefined)
      .then((res) => {
        const items = res.items ?? [];
        setPlayers(items);
        const firstPlayer = items[0];

        if (!selectedId && firstPlayer) {
          setSelectedId(firstPlayer.id);
        }
        if (selectedId && !items.some((p) => p.id === selectedId)) {
          setSelectedId(firstPlayer?.id ?? '');
        }
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message ?? 'Failed to load players');
        setLoading(false);
      });
  }, [selectedId]);

  useEffect(() => {
    fetchPlayers(search);
  }, [fetchPlayers, search]);

  const selectedPlayer = players.find((p) => p.id === selectedId) ?? null;

  const preset = useMemo(() => {
    return BONUS_PRESETS.find((item) => item.id === presetId) ?? DEFAULT_BONUS_PRESET;
  }, [presetId]);

  const effectiveWallet = presetId === 'custom' ? walletType : preset.wallet;
  const effectiveAmount = presetId === 'custom'
    ? Number(customAmount || 0)
    : preset.amount;
  const effectiveReason = reason.trim() || preset.note;

  async function handleApplyBonus() {
    if (!selectedPlayer) {
      setError('Select a player before applying a bonus.');
      return;
    }
    if (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0) {
      setError('Bonus amount must be greater than zero.');
      return;
    }
    if (!effectiveReason) {
      setError('Please enter a valid bonus reason.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await creditPlayer(selectedPlayer.id, {
        walletType: effectiveWallet,
        amount: effectiveAmount,
        note: effectiveReason,
      } as AdminCreditRequest);

      setSuccess(`Bonus applied: ${selectedPlayer.username} received ${effectiveAmount} ETB to ${effectiveWallet} wallet.`);
      setReason('');
      setCustomAmount('20');
      const refreshed = await getPlayers(1, search || undefined);
      setPlayers(refreshed.items ?? []);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to apply bonus');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fade-in">
      <PageHeader title="Bonus Manager" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard icon="🎁" label="Players" value={players.length} color={C.primary} />
        <StatCard icon="✅" label="Active" value={players.filter((p) => !p.is_suspended).length} color={C.success} />
        <StatCard icon="🚫" label="Suspended" value={players.filter((p) => p.is_suspended).length} color={C.danger} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 18, alignItems: 'start' }}>
        <Card>
          <CardHeader title="Players" subtitle="Select a player and assign a bonus" />

          <div style={{ marginBottom: 16 }}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search username or Telegram ID"
              style={{ ...inputCss, paddingLeft: 12 }}
            />
          </div>

          <Table>
            <thead>
              <tr>
                <Th>Player</Th>
                <Th>Main</Th>
                <Th>Play</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? <TrLoading cols={4} /> : !players.length ? <TrEmpty cols={4} message="No players found." /> : players.map((player) => (
                <tr
                  key={player.id}
                  onClick={() => setSelectedId(player.id)}
                  style={{
                    cursor: 'pointer',
                    background: selectedId === player.id ? 'rgba(99,102,241,0.08)' : undefined,
                  }}
                >
                  <Td>
                    <div style={{ fontWeight: 700 }}>@{player.username}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{player.telegram_id}</div>
                  </Td>
                  <Td>{Number(player.main_wallet_balance).toFixed(2)}</Td>
                  <Td>{Number(player.play_wallet_balance).toFixed(2)}</Td>
                  <Td>
                    <Badge variant={player.is_suspended ? 'danger' : 'success'}>
                      {player.is_suspended ? 'Suspended' : 'Active'}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Assign Bonus" subtitle={selectedPlayer ? `Selected player: @${selectedPlayer.username}` : 'Choose a player'} />

          {error && <Alert type="error">{error}</Alert>}
          {success && <Alert type="success">{success}</Alert>}

          {!selectedPlayer ? (
            <div style={{ color: C.muted, fontSize: 13 }}>Select a player to continue.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                {BONUS_PRESETS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPresetId(item.id)}
                    style={{
                      border: presetId === item.id ? '1px solid rgba(99,102,241,0.5)' : '1px solid var(--c-border)',
                      background: presetId === item.id ? 'rgba(99,102,241,0.08)' : 'transparent',
                      borderRadius: 10,
                      padding: '10px 12px',
                      textAlign: 'left',
                      color: 'var(--c-text)',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span>{item.label}</span>
                    <strong>{item.id === 'custom' ? 'Custom' : `${item.amount} ETB`}</strong>
                  </button>
                ))}
              </div>

              {presetId === 'custom' && (
                <Field label="Custom Amount (ETB)">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    style={inputCss}
                    placeholder="e.g. 75"
                  />
                </Field>
              )}

              <Field label="Wallet">
                <select
                  value={effectiveWallet}
                  onChange={(e) => setWalletType(e.target.value as WalletType)}
                  style={selectCss}
                  disabled={presetId !== 'custom'}
                >
                  <option value="play">Play Wallet</option>
                  <option value="main">Main Wallet</option>
                </select>
              </Field>

              <Field label="Reason">
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={inputCss}
                  placeholder={preset.note}
                />
              </Field>

              <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, padding: '12px 14px', fontSize: 13 }}>
                <div style={{ color: C.muted, marginBottom: 6 }}>Bonus summary</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{effectiveAmount} ETB</div>
                <div style={{ color: C.muted }}>{effectiveWallet === 'main' ? 'Main Wallet' : 'Play Wallet'}</div>
              </div>

              <Btn type="button" onClick={handleApplyBonus} disabled={saving}>
                {saving ? 'Applying…' : `Apply ${effectiveAmount} ETB Bonus`}
              </Btn>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
