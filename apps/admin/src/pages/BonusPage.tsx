import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminPlayer, AdminCreditRequest } from '@fidel/shared';
import type { Promotion, BonusCriteria, EligibilityResult, BonusApplyResult, BonusDistribution, Coupon } from '../lib/api';
import {
  getPlayers, creditPlayer, listPromotions,
  getEligiblePlayers, applyPromotionBonus, getBonusDistributions,
  createPromotion, getConfig, updateConfig,
  updatePromotion, setPromotionStatus, deletePromotion,
  listCoupons, createCoupon, deleteCoupon,
} from '../lib/api';
import {
  C, Btn, Card, CardHeader, Field, PageHeader, StatCard,
  Table, Th, Td, TrEmpty, TrLoading, Alert, Badge,
  inputCss, selectCss,
} from '../components/ui';

type WalletType = 'main' | 'play';
type Tab = 'single' | 'bulk' | 'active' | 'coupons';

// ─────────────────────────────────────────────────────────────────────────────
// Single-player bonus (unchanged feature, kept intact)
// ─────────────────────────────────────────────────────────────────────────────

type BonusPreset = { id: string; label: string; amount: number; wallet: WalletType; note: string };

const BONUS_PRESETS: BonusPreset[] = [
  { id: 'welcome',  label: 'Welcome Bonus',  amount: 10,  wallet: 'play', note: 'Welcome bonus for new player registration' },
  { id: 'deposit',  label: 'Deposit Boost',  amount: 50,  wallet: 'play', note: 'Deposit bonus awarded by admin' },
  { id: 'referral', label: 'Referral Bonus', amount: 30,  wallet: 'main', note: 'Referral commission payout' },
  { id: 'vip',      label: 'VIP Reward',     amount: 100, wallet: 'main', note: 'VIP loyalty reward' },
  { id: 'custom',   label: 'Custom Bonus',   amount: 0,   wallet: 'play', note: 'Custom bonus' },
];
const DEFAULT_PRESET = BONUS_PRESETS[0]!;

function SingleBonusPanel() {
  const [players, setPlayers]     = useState<AdminPlayer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [walletType, setWalletType] = useState<WalletType>('play');
  const [presetId, setPresetId]   = useState(DEFAULT_PRESET.id);
  const [customAmount, setCustomAmount] = useState('20');
  const [reason, setReason]       = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);

  const fetchPlayers = useCallback((query: string) => {
    setLoading(true); setError(null);
    getPlayers(1, query || undefined)
      .then(res => {
        const items = res.items ?? [];
        setPlayers(items);
        if (!selectedId && items[0]) setSelectedId(items[0].id);
        if (selectedId && !items.some(p => p.id === selectedId)) setSelectedId(items[0]?.id ?? '');
        setLoading(false);
      })
      .catch((e: Error) => { setError(e.message ?? 'Failed to load players'); setLoading(false); });
  }, [selectedId]);

  useEffect(() => { fetchPlayers(search); }, [fetchPlayers, search]);

  const selectedPlayer = players.find(p => p.id === selectedId) ?? null;
  const preset = useMemo(() => BONUS_PRESETS.find(i => i.id === presetId) ?? DEFAULT_PRESET, [presetId]);
  const effectiveWallet = presetId === 'custom' ? walletType : preset.wallet;
  const effectiveAmount = presetId === 'custom' ? Number(customAmount || 0) : preset.amount;
  const effectiveReason = reason.trim() || preset.note;

  async function handleApply() {
    if (!selectedPlayer) { setError('Select a player first.'); return; }
    if (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0) { setError('Amount must be > 0.'); return; }
    if (!effectiveReason) { setError('Enter a reason.'); return; }
    setSaving(true); setError(null); setSuccess(null);
    try {
      await creditPlayer(selectedPlayer.id, { walletType: effectiveWallet, amount: effectiveAmount, note: effectiveReason } as AdminCreditRequest);
      setSuccess(`${selectedPlayer.username} received ${effectiveAmount} ETB to ${effectiveWallet} wallet.`);
      setReason(''); setCustomAmount('20');
      const refreshed = await getPlayers(1, search || undefined);
      setPlayers(refreshed.items ?? []);
    } catch (e: unknown) { setError((e as Error).message ?? 'Failed'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: 20, alignItems: 'start' }}>
      <Card>
        <CardHeader title="Select Player" subtitle="Find and select a player to award a bonus" />
        <div style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16 }}>🔍</span>
            <input type="search" name="player-search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by username or Telegram ID" style={{ ...inputCss, paddingLeft: 40, fontSize: 14 }} />
          </div>
        </div>
        <Table>
          <thead><tr><Th>Player</Th><Th>Balance</Th><Th>Status</Th></tr></thead>
          <tbody>
            {loading ? <TrLoading cols={3} /> : !players.length ? <TrEmpty cols={3} message="No players found." /> :
              players.map(player => (
                <tr key={player.id} onClick={() => setSelectedId(player.id)}
                  style={{ 
                    cursor: 'pointer', 
                    background: selectedId === player.id ? 'rgba(99,102,241,0.15)' : 'transparent',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => { if (selectedId !== player.id) (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.08)'; }}
                  onMouseLeave={(e) => { if (selectedId !== player.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                  <Td>
                    <div style={{ fontWeight: 700 }}>@{player.username}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{player.telegram_id}</div>
                  </Td>
                  <Td>
                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: '#22c55e', fontWeight: 600 }}>${Number(player.main_wallet_balance).toFixed(2)}</span>
                      <span style={{ color: C.muted }}> + </span>
                      <span style={{ color: '#3b82f6', fontWeight: 600 }}>${Number(player.play_wallet_balance).toFixed(2)}</span>
                    </div>
                  </Td>
                  <Td><Badge variant={player.is_suspended ? 'danger' : 'success'}>{player.is_suspended ? '🚫 Suspended' : '✅ Active'}</Badge></Td>
                </tr>
              ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Award Bonus" subtitle={selectedPlayer ? `→ @${selectedPlayer.username}` : 'Select player first'} />
        {error && <Alert type="error">{error}</Alert>}
        {success && <Alert type="success">{success}</Alert>}
        {!selectedPlayer ? (
          <div style={{ textAlign: 'center', padding: '28px 0', color: C.muted }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
            <div>Select a player from the list to continue</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'rgba(99,102,241,0.05)', borderRadius: 12, padding: 12, borderLeft: '3px solid rgba(99,102,241,0.5)' }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Current Balances</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                <div><span style={{ color: C.muted }}>Main:</span> <span style={{ fontWeight: 600, color: '#22c55e' }}>${Number(selectedPlayer.main_wallet_balance).toFixed(2)}</span></div>
                <div><span style={{ color: C.muted }}>Play:</span> <span style={{ fontWeight: 600, color: '#3b82f6' }}>${Number(selectedPlayer.play_wallet_balance).toFixed(2)}</span></div>
              </div>
            </div>
            
            <div style={{ display: 'grid', gap: 8 }}>
              {BONUS_PRESETS.map(item => (
                <button key={item.id} type="button" onClick={() => setPresetId(item.id)} style={{
                  border: presetId === item.id ? '2px solid rgba(99,102,241,0.6)' : '1px solid var(--c-border)',
                  background: presetId === item.id ? 'rgba(99,102,241,0.08)' : 'transparent',
                  borderRadius: 10, padding: '12px 14px', textAlign: 'left',
                  color: 'var(--c-text)', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                  transition: 'all 0.15s ease',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{item.note}</div>
                  </div>
                  <strong style={{ fontSize: 16, color: item.id === 'custom' ? C.muted : 'rgba(99,102,241,0.8)' }}>
                    {item.id === 'custom' ? '✎' : `${item.amount}Є`}
                  </strong>
                </button>
              ))}
            </div>
            
            {presetId === 'custom' && (
              <Field label="Custom Amount (ETB)">
                <input type="number" name="custom-amount" min="1" step="1" value={customAmount}
                  onChange={e => setCustomAmount(e.target.value)} style={inputCss} placeholder="e.g. 75" />
              </Field>
            )}
            
            <Field label="Credit to Wallet">
              <select name="wallet-type" value={effectiveWallet} onChange={e => setWalletType(e.target.value as WalletType)}
                style={selectCss} disabled={presetId !== 'custom'}>
                <option value="play">🎮 Play Wallet</option>
                <option value="main">💰 Main Wallet</option>
              </select>
            </Field>
            
            <Field label="Reason / Note">
              <input type="text" name="reason" value={reason} onChange={e => setReason(e.target.value)}
                style={inputCss} placeholder={preset.note} />
            </Field>
            
            <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0.04) 100%)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: '14px 16px', fontSize: 13 }}>
              <div style={{ color: C.muted, marginBottom: 8, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Award Summary</div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: C.muted }}>Amount:</span>
                  <span style={{ fontWeight: 700, fontSize: 18, color: 'rgba(99,102,241,0.9)' }}>{effectiveAmount} ETB</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: C.muted }}>Wallet:</span>
                  <span style={{ fontWeight: 600 }}>{effectiveWallet === 'main' ? '💰 Main' : '🎮 Play'}</span>
                </div>
              </div>
            </div>
            
            <Btn type="button" onClick={handleApply} disabled={saving}>
              {saving ? '⏳ Processing…' : `✓ Award ${effectiveAmount} ETB Bonus`}
            </Btn>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk bonus panel — create or pick a promotion, preview eligible, apply
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_CRITERIA: BonusCriteria = {};

function CriteriaBuilder({
  criteria, onChange,
}: { criteria: BonusCriteria; onChange: (c: BonusCriteria) => void }) {
  const set = (key: keyof BonusCriteria, val: string | boolean | undefined) => {
    const next = { ...criteria };
    if (val === '' || val === undefined) {
      delete next[key];
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (next as any)[key] = typeof val === 'boolean' ? val : Number(val);
    }
    onChange(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'rgba(99,102,241,0.05)', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted }}>
        Eligibility Criteria — leave blank = all active players
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Min Balance (ETB)" hint="Main + Play ≥">
          <input type="number" name="min-balance" min="0" step="0.01"
            value={criteria.minBalance ?? ''} onChange={e => set('minBalance', e.target.value)}
            style={inputCss} placeholder="no minimum" />
        </Field>
        <Field label="Max Balance (ETB)" hint="Main + Play ≤">
          <input type="number" name="max-balance" min="0" step="0.01"
            value={criteria.maxBalance ?? ''} onChange={e => set('maxBalance', e.target.value)}
            style={inputCss} placeholder="no maximum" />
        </Field>
        <Field label="Min Total Deposits (ETB)" hint="Sum of deposits ≥">
          <input type="number" name="min-deposits" min="0" step="0.01"
            value={criteria.minDeposits ?? ''} onChange={e => set('minDeposits', e.target.value)}
            style={inputCss} placeholder="no minimum" />
        </Field>
        <Field label="Account Age (days)" hint="Registered ≥ X days ago">
          <input type="number" name="days-registered" min="0" step="1"
            value={criteria.daysRegistered ?? ''} onChange={e => set('daysRegistered', e.target.value)}
            style={inputCss} placeholder="any age" />
        </Field>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
        <input type="checkbox" name="has-played-rounds" checked={criteria.hasPlayedRounds ?? false}
          onChange={e => set('hasPlayedRounds', e.target.checked || undefined)} />
        <span style={{ color: 'var(--c-text)' }}>Must have played at least one game round</span>
      </label>
    </div>
  );
}

function BulkBonusPanel() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promoLoading, setPromoLoading] = useState(true);

  // "create new" form fields
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedPromoId, setSelectedPromoId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newWallet, setNewWallet] = useState<WalletType>('play');
  const [newCriteria, setNewCriteria] = useState<BonusCriteria>(EMPTY_CRITERIA);
  const [newMessage, setNewMessage] = useState('');
  const [creating, setCreating] = useState(false);

  // eligibility preview
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [eligLoading, setEligLoading] = useState(false);

  // apply
  const [applying, setApplying]     = useState(false);
  const [applyResult, setApplyResult] = useState<BonusApplyResult | null>(null);

  // history
  const [histPromoId, setHistPromoId]     = useState('');
  const [distributions, setDistributions] = useState<BonusDistribution[]>([]);
  const [histLoading, setHistLoading]     = useState(false);

  const [error, setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // bonus-only promotions (ones with a bonus amount set)
  const bonusPromos = useMemo(() => promotions.filter(p => p.bonus_amount), [promotions]);

  async function loadPromotions() {
    setPromoLoading(true);
    setPromotions(await listPromotions().catch(() => []));
    setPromoLoading(false);
  }

  useEffect(() => { void loadPromotions(); }, []);

  // auto-select first bonus promo
  useEffect(() => {
    if (!selectedPromoId && bonusPromos.length > 0) setSelectedPromoId(bonusPromos[0]!.id);
  }, [bonusPromos, selectedPromoId]);

  // ── Create new bonus promotion ──────────────────────────────────────────────
  async function handleCreatePromo(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle || !newAmount) { setError('Title and amount are required.'); return; }
    setCreating(true); setError(null);
    try {
      const p = await createPromotion({
        title: newTitle,
        content_type: 'text',
        text_content: newMessage || `🎁 ${newTitle} — you have received a bonus of ${newAmount} ETB!`,
        bonus_amount: Number(newAmount),
        bonus_wallet: newWallet,
        ...(Object.keys(newCriteria).length > 0 ? { bonus_criteria: newCriteria } : {}),
      });
      setSuccess(`Promotion "${p.title}" created.`);
      setNewTitle(''); setNewAmount(''); setNewMessage('');
      setNewCriteria(EMPTY_CRITERIA); setMode('existing');
      await loadPromotions();
      setSelectedPromoId(p.id);
    } catch (err) { setError((err as Error).message); }
    finally { setCreating(false); }
  }

  // ── Preview eligible ────────────────────────────────────────────────────────
  async function handlePreview() {
    if (!selectedPromoId) { setError('Select a promotion first.'); return; }
    setEligLoading(true); setError(null); setEligibility(null);
    try {
      setEligibility(await getEligiblePlayers(selectedPromoId));
    } catch (err) { setError((err as Error).message); }
    finally { setEligLoading(false); }
  }

  // ── Apply bonus ─────────────────────────────────────────────────────────────
  async function handleApply() {
    if (!eligibility || eligibility.total === 0) return;
    if (!confirm(`Apply ${eligibility.bonus_amount} ETB to ${eligibility.total} players? This cannot be undone.`)) return;
    setApplying(true); setError(null); setApplyResult(null);
    try {
      const r = await applyPromotionBonus(selectedPromoId);
      setApplyResult(r);
      setSuccess(`Done: ${r.applied} players credited${r.failed > 0 ? `, ${r.failed} failed` : ''}.`);
      setEligibility(null);
    } catch (err) { setError((err as Error).message); }
    finally { setApplying(false); }
  }

  // ── Load history ────────────────────────────────────────────────────────────
  async function loadHistory(id: string) {
    if (!id) return;
    setHistLoading(true);
    setDistributions(await getBonusDistributions(id).catch(() => []));
    setHistLoading(false);
  }

  useEffect(() => { if (histPromoId) void loadHistory(histPromoId); }, [histPromoId]);

  const selectedPromo = promotions.find(p => p.id === selectedPromoId);
  const criteriaLabels: string[] = [];
  if (selectedPromo?.bonus_criteria) {
    const c = selectedPromo.bonus_criteria as BonusCriteria;
    if (c.minBalance != null) criteriaLabels.push(`Balance ≥ ${c.minBalance} ETB`);
    if (c.maxBalance != null) criteriaLabels.push(`Balance ≤ ${c.maxBalance} ETB`);
    if (c.minDeposits != null) criteriaLabels.push(`Deposits ≥ ${c.minDeposits} ETB`);
    if (c.daysRegistered != null) criteriaLabels.push(`Registered ≥ ${c.daysRegistered}d ago`);
    if (c.hasPlayedRounds) criteriaLabels.push('Has played rounds');
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {/* ── Step 1: Pick or create ── */}
      <Card>
        <CardHeader title="Step 1 — Select Bonus Promotion"
          subtitle="Pick an existing promotion with a bonus, or create a new one"
          action={
            <Btn size="sm" variant={mode === 'new' ? 'warning' : 'outline'}
              onClick={() => { setMode(mode === 'new' ? 'existing' : 'new'); setError(null); }}>
              {mode === 'new' ? '← Back to list' : '+ New Bulk Bonus'}
            </Btn>
          }
        />

        {mode === 'existing' ? (
          promoLoading ? <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div> :
          bonusPromos.length === 0 ? (
            <Alert type="info">No bonus promotions yet. Create one using the button above or from the Promotions page.</Alert>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {bonusPromos.map(p => (
                <button key={p.id} type="button" onClick={() => { setSelectedPromoId(p.id); setEligibility(null); setApplyResult(null); }}
                  style={{
                    border: selectedPromoId === p.id ? '2px solid rgba(99,102,241,0.6)' : '1px solid var(--c-border)',
                    background: selectedPromoId === p.id ? 'rgba(99,102,241,0.08)' : 'transparent',
                    borderRadius: 10, padding: '12px 14px', textAlign: 'left',
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                  }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--c-text)', marginBottom: 4 }}>{p.title}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Badge variant="warning">🎁 {Number(p.bonus_amount)} ETB</Badge>
                      <Badge variant="neutral">{p.bonus_wallet} wallet</Badge>
                      <Badge variant={p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge>
                    </div>
                  </div>
                  {selectedPromoId === p.id && (
                    <span style={{ fontSize: 18, color: 'rgba(99,102,241,0.8)' }}>✓</span>
                  )}
                </button>
              ))}
            </div>
          )
        ) : (
          <form onSubmit={handleCreatePromo} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Promotion Title">
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} required
                  name="promo-title" style={inputCss} placeholder="e.g. Ramadan Bonus" />
              </Field>
              <Field label="Bonus Amount (ETB)">
                <input type="number" name="bonus-amount" min="1" step="1" value={newAmount} onChange={e => setNewAmount(e.target.value)}
                  required style={inputCss} placeholder="e.g. 50" />
              </Field>
            </div>
            <Field label="Wallet">
              <select name="bonus-wallet" value={newWallet} onChange={e => setNewWallet(e.target.value as WalletType)} style={{ ...selectCss, width: 180 }}>
                <option value="play">Play Wallet</option>
                <option value="main">Main Wallet</option>
              </select>
            </Field>
            <Field label="Notification Message (optional)" hint="Sent to users via bot">
              <textarea name="promo-message" value={newMessage} onChange={e => setNewMessage(e.target.value)}
                rows={3} style={{ ...inputCss, resize: 'vertical' }}
                placeholder="🎁 Congratulations! You received a special bonus…" />
            </Field>
            <CriteriaBuilder criteria={newCriteria} onChange={setNewCriteria} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Btn type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create Bonus Promotion'}</Btn>
            </div>
          </form>
        )}
      </Card>

      {/* ── Step 2: Preview eligible ── */}
      {selectedPromoId && mode === 'existing' && (
        <Card>
          <CardHeader title="Step 2 — Preview Eligible Players"
            subtitle={selectedPromo ? `${Number(selectedPromo.bonus_amount)} ETB → ${selectedPromo.bonus_wallet} wallet` : ''}
          />

          {criteriaLabels.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {criteriaLabels.map(l => <Badge key={l} variant="neutral">{l}</Badge>)}
            </div>
          )}
          {criteriaLabels.length === 0 && (
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>No criteria — all active players qualify.</div>
          )}

          <div style={{ marginBottom: 12 }}>
            <Btn size="sm" onClick={handlePreview} disabled={eligLoading}>
              {eligLoading ? 'Checking…' : '🔍 Check Eligibility'}
            </Btn>
          </div>

          {eligibility && (
            <>
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--c-text)' }}>{eligibility.total} players</span>
                <span style={{ color: C.muted, fontSize: 13, marginLeft: 6 }}>will receive {eligibility.bonus_amount} ETB (not yet distributed)</span>
              </div>

              {applyResult && (
                <Alert type={applyResult.failed === 0 ? 'success' : 'info'}>
                  Applied: {applyResult.applied} credited{applyResult.failed > 0 ? `, ${applyResult.failed} failed` : ''}.
                </Alert>
              )}

              <Table>
                <thead><tr><Th>Player</Th><Th>Telegram ID</Th></tr></thead>
                <tbody>
                  {eligibility.eligible.length === 0
                    ? <TrEmpty cols={2} message="All eligible players have already received this bonus." />
                    : eligibility.eligible.slice(0, 30).map(p => (
                        <tr key={p.id}>
                          <Td>@{p.username}</Td>
                          <Td muted style={{ fontSize: 12 }}>{p.telegram_id}</Td>
                        </tr>
                      ))
                  }
                  {eligibility.eligible.length > 30 && (
                    <tr><td colSpan={2} style={{ padding: '8px 12px', color: C.muted, fontSize: 12, textAlign: 'center' }}>
                      +{eligibility.eligible.length - 30} more not shown…
                    </td></tr>
                  )}
                </tbody>
              </Table>

              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <Btn size="sm" variant="ghost" onClick={handlePreview}>↻ Refresh</Btn>
                <Btn onClick={handleApply} disabled={applying || eligibility.total === 0}>
                  {applying ? 'Applying…' : `🎁 Apply Bonus to ${eligibility.total} Players`}
                </Btn>
              </div>
            </>
          )}
        </Card>
      )}

      {/* ── Distribution History ── */}
      <Card>
        <CardHeader title="Distribution History"
          subtitle="Who already received which bonus"
          action={
            <select name="hist-promo" value={histPromoId} onChange={e => setHistPromoId(e.target.value)}
              style={{ ...selectCss, width: 200, fontSize: 12 }}>
              <option value="">Select promotion…</option>
              {bonusPromos.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          }
        />
        {!histPromoId ? (
          <div style={{ color: C.muted, fontSize: 13 }}>Select a promotion above to see its distribution history.</div>
        ) : histLoading ? <TrLoading cols={4} /> : (
          <Table>
            <thead><tr><Th>Player</Th><Th>Amount</Th><Th>Wallet</Th><Th>Date</Th></tr></thead>
            <tbody>
              {distributions.length === 0
                ? <TrEmpty cols={4} message="No distributions yet." />
                : distributions.map(d => (
                    <tr key={d.id}>
                      <Td>@{d.player.username}</Td>
                      <Td><strong>{Number(d.amount).toFixed(2)} ETB</strong></Td>
                      <Td><Badge variant="neutral">{d.wallet}</Badge></Td>
                      <Td muted>{new Date(d.distributed_at).toLocaleString()}</Td>
                    </tr>
                  ))
              }
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Active Bonuses panel — view and manage all active bonuses with CRUD
// ─────────────────────────────────────────────────────────────────────────────

function ActiveBonusesPanel({ onCreateNew }: { onCreateNew: () => void }) {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editWallet, setEditWallet] = useState<WalletType>('play');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function loadBonuses() {
    setLoading(true); setError(null);
    try {
      const all = await listPromotions();
      setPromotions(all.filter(p => p.bonus_amount && Number(p.bonus_amount) > 0));
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadBonuses(); }, []);

  function handleEdit(promo: Promotion) {
    setEditing(promo.id);
    setEditAmount(String(promo.bonus_amount ?? 0));
    setEditWallet((promo.bonus_wallet as WalletType) ?? 'play');
    setError(null);
    setSuccess(null);
  }

  async function handleSaveEdit(id: string) {
    setSaving(true); setError(null); setSuccess(null);
    try {
      await updatePromotion(id, {
        bonus_amount: Number(editAmount),
        bonus_wallet: editWallet,
      });
      setSuccess('Bonus updated successfully.');
      setEditing(null);
      await loadBonuses();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  async function handleToggleStatus(promo: Promotion) {
    setError(null); setSuccess(null);
    try {
      const newStatus = promo.status === 'active' ? 'inactive' : 'active';
      await setPromotionStatus(promo.id, newStatus);
      setSuccess(`Bonus ${newStatus === 'active' ? 'activated' : 'deactivated'}.`);
      await loadBonuses();
    } catch (err) { setError((err as Error).message); }
  }

  async function handleDelete(promo: Promotion) {
    if (!confirm(`Delete bonus "${promo.title}"? This cannot be undone.`)) return;
    setDeleting(promo.id); setError(null); setSuccess(null);
    try {
      await deletePromotion(promo.id);
      setSuccess(`Bonus "${promo.title}" deleted.`);
      await loadBonuses();
    } catch (err) { setError((err as Error).message); }
    finally { setDeleting(null); }
  }

  const activeCount = promotions.filter(p => p.status === 'active').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <Card>
        <CardHeader
          title="Bonus Promotions"
          subtitle={`${activeCount} active · ${promotions.length - activeCount} inactive`}
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn size="sm" variant="outline" onClick={() => void loadBonuses()}>↻ Refresh</Btn>
              <Btn size="sm" onClick={onCreateNew}>+ New Bonus</Btn>
            </div>
          }
        />

        {loading ? (
          <Table>
            <thead><tr><Th>Title</Th><Th>Amount</Th><Th>Wallet</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
            <tbody><TrLoading cols={5} /></tbody>
          </Table>
        ) : promotions.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '28px 0' }}>
            <div style={{ fontSize: 36 }}>🎁</div>
            <div style={{ color: C.muted, fontSize: 14 }}>No bonus promotions yet.</div>
            <Btn onClick={onCreateNew}>Create Your First Bonus</Btn>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Bonus Title</Th>
                <Th>Amount</Th>
                <Th>Wallet</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {promotions.map(promo => {
                const isEditing = editing === promo.id;
                const isDeleting = deleting === promo.id;
                const criteriaCount = promo.bonus_criteria
                  ? Object.keys(promo.bonus_criteria as BonusCriteria).length
                  : 0;

                return (
                  <tr key={promo.id}>
                    <Td>
                      <div style={{ fontWeight: 600 }}>{promo.title}</div>
                      {criteriaCount > 0 && (
                        <div style={{ fontSize: 11, color: C.muted }}>
                          {criteriaCount} {criteriaCount === 1 ? 'criterion' : 'criteria'}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {isEditing ? (
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={editAmount}
                          onChange={e => setEditAmount(e.target.value)}
                          style={{ ...inputCss, width: 100 }}
                        />
                      ) : (
                        <strong>{Number(promo.bonus_amount).toFixed(2)} ETB</strong>
                      )}
                    </Td>
                    <Td>
                      {isEditing ? (
                        <select
                          value={editWallet}
                          onChange={e => setEditWallet(e.target.value as WalletType)}
                          style={{ ...selectCss, width: 100 }}
                        >
                          <option value="play">Play</option>
                          <option value="main">Main</option>
                        </select>
                      ) : (
                        <Badge variant="neutral">{promo.bonus_wallet}</Badge>
                      )}
                    </Td>
                    <Td>
                      <Badge variant={promo.status === 'active' ? 'success' : 'neutral'}>
                        {promo.status}
                      </Badge>
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {isEditing ? (
                          <>
                            <Btn size="sm" onClick={() => void handleSaveEdit(promo.id)} disabled={saving}>
                              {saving ? 'Saving…' : 'Save'}
                            </Btn>
                            <Btn size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
                              Cancel
                            </Btn>
                          </>
                        ) : (
                          <>
                            <Btn size="sm" variant="outline" onClick={() => handleEdit(promo)}>
                              Edit
                            </Btn>
                            <Btn
                              size="sm"
                              variant={promo.status === 'active' ? 'warning' : 'primary'}
                              onClick={() => void handleToggleStatus(promo)}
                            >
                              {promo.status === 'active' ? 'Deactivate' : 'Activate'}
                            </Btn>
                            <Btn
                              size="sm"
                              variant="danger"
                              onClick={() => void handleDelete(promo)}
                              disabled={isDeleting}
                            >
                              {isDeleting ? '…' : 'Delete'}
                            </Btn>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Coupon Panel
// ─────────────────────────────────────────────────────────────────────────────

function CouponPanel() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');
  const [wallet, setWallet] = useState<'main' | 'play'>('play');
  const [maxUses, setMaxUses] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    listCoupons()
      .then(data => { setCoupons(data); setLoading(false); })
      .catch(e => { setError(e.message ?? 'Failed to load coupons'); setLoading(false); });
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) { setError('Code is required'); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Amount must be > 0'); return; }
    setSaving(true); setError(null); setSuccess(null);
    try {
      const created = await createCoupon({
        code: code.trim().toUpperCase(),
        amount: amt,
        wallet,
        maxUses: maxUses ? Number(maxUses) : null,
        description: description.trim(),
      });
      setSuccess('✓ Coupon created successfully');
      setCode(''); setAmount(''); setMaxUses(''); setDescription('');
      setCoupons(prev => [...prev, { ...created, usedCount: 0 }]);
      load();
    } catch (e: any) { setError(e.message ?? 'Failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(c: string) {
    if (!confirm(`Delete coupon "${c}"? This cannot be undone.`)) return;
    setDeleting(c); setError(null); setSuccess(null);
    try {
      await deleteCoupon(c);
      setSuccess(`✓ Coupon "${c}" deleted`);
      load();
    } catch (e: any) { setError(e.message ?? 'Failed'); }
    finally { setDeleting(null); }
  }

  const activeCoupons = coupons.filter(c => !c.maxUses || c.usedCount < c.maxUses).length;
  const exhaustedCoupons = coupons.filter(c => c.maxUses && c.usedCount >= c.maxUses).length;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        <StatCard icon="🎟️" label="Total Coupons" value={coupons.length} color={C.primary} />
        <StatCard icon="✅" label="Active" value={activeCoupons} color={C.success} />
        <StatCard icon="⚠️" label="Exhausted" value={exhaustedCoupons} color={C.danger} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20, alignItems: 'start' }}>
        {/* Create form */}
        <Card>
          <CardHeader title="+ New Coupon" subtitle="Create a coupon code for players" />
          {error && <Alert type="error">{error}</Alert>}
          {success && <Alert type="success">{success}</Alert>}
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="🔐 Code (e.g. SUMMER50)">
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="SUMMER50"
                maxLength={24}
                style={inputCss}
                required
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="💵 Amount (ETB)">
                <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} style={inputCss} required />
              </Field>
              <Field label="📍 Wallet">
                <select value={wallet} onChange={e => setWallet(e.target.value as 'main' | 'play')} style={selectCss}>
                  <option value="play">🎮 Play</option>
                  <option value="main">💰 Main</option>
                </select>
              </Field>
            </div>
            <Field label="📊 Max Uses (blank = unlimited)">
              <input type="number" min={1} value={maxUses} onChange={e => setMaxUses(e.target.value)} placeholder="Unlimited" style={inputCss} />
            </Field>
            <Field label="📝 Description (optional)">
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Black Friday special" style={inputCss} />
            </Field>
            <Btn type="submit" disabled={saving}>
              {saving ? '⏳ Creating…' : '✨ Create Coupon'}
            </Btn>
          </form>
        </Card>

        {/* Coupon list */}
        <Card>
          <CardHeader 
            title="🎟️ Active Coupons" 
            subtitle={`${coupons.length} coupon${coupons.length !== 1 ? 's' : ''}`}
            action={
              <Btn size="sm" variant="outline" onClick={() => void load()}>
                ↻ Refresh
              </Btn>
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Amount</Th>
                <Th>Wallet</Th>
                <Th>Uses</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? <TrLoading cols={5} /> : !coupons.length ? (
                <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: C.muted }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🎟️</div>
                  <div>No coupons yet. Create one to get started.</div>
                </td></tr>
              ) : (
                coupons.map(c => {
                  const isExhausted = c.maxUses !== null && c.usedCount >= c.maxUses;
                  return (
                    <tr key={c.code} style={{ opacity: isExhausted ? 0.6 : 1 }}>
                      <Td><span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: C.primary, letterSpacing: '0.05em' }}>{c.code}</span></Td>
                      <Td><strong style={{ fontSize: 14 }}>{c.amount} ETB</strong></Td>
                      <Td>
                        <Badge variant={c.wallet === 'play' ? 'info' : 'success'}>
                          {c.wallet === 'play' ? '🎮 Play' : '💰 Main'}
                        </Badge>
                      </Td>
                      <Td>
                        <div style={{ fontSize: 12 }}>
                          {c.usedCount}{c.maxUses !== null ? ` / ${c.maxUses}` : ''} 
                          {isExhausted && <> <Badge variant="danger">Exhausted</Badge></>}
                        </div>
                      </Td>
                      <Td>
                        <Btn
                          variant="danger"
                          size="sm"
                          disabled={deleting === c.code}
                          onClick={() => handleDelete(c.code)}
                        >
                          {deleting === c.code ? '...' : '🗑️'}
                        </Btn>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function BonusPage() {
  const [tab, setTab] = useState<Tab>('active');
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPlayers(1).then(r => { setPlayers(r.items ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const active = players.filter(p => !p.is_suspended).length;

  const tabItems = [
    { id: 'active' as const, label: 'Active Bonuses', icon: '⭐' },
    { id: 'single' as const, label: 'Single Player', icon: '👤' },
    { id: 'bulk' as const, label: 'Bulk Bonus', icon: '🎯' },
    { id: 'coupons' as const, label: 'Coupons', icon: '🎟️' },
  ];

  return (
    <div className="fade-in">
      <PageHeader title="🎁 Bonus Manager" />

      {/* KPI Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard icon="👥" label="Total Players" value={loading ? '…' : players.length} color={C.primary} />
        <StatCard icon="✅" label="Active Players" value={loading ? '…' : active} color={C.success} />
        <StatCard icon="🚫" label="Suspended" value={loading ? '…' : players.length - active} color={C.danger} />
      </div>

      {/* Modern Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 28,
        borderBottom: '1px solid var(--c-border)',
        paddingBottom: 16,
        overflowX: 'auto',
        scrollBehavior: 'smooth',
      }}>
        {tabItems.map(item => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            style={{
              padding: '10px 20px',
              borderRadius: '8px 8px 0 0',
              border: 'none',
              background: tab === item.id ? 'rgba(99,102,241,0.1)' : 'transparent',
              color: tab === item.id ? 'rgba(99,102,241,1)' : 'var(--c-text)',
              borderBottom: tab === item.id ? '2px solid rgba(99,102,241,1)' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: tab === item.id ? 600 : 500,
              fontSize: 14,
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            onMouseEnter={(e) => {
              if (tab !== item.id) {
                (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (tab !== item.id) {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }
            }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ animation: 'fadeIn 0.3s ease' }}>
        {tab === 'active' ? <ActiveBonusesPanel onCreateNew={() => setTab('bulk')} /> : 
         tab === 'single' ? <SingleBonusPanel /> : 
         tab === 'bulk' ? <BulkBonusPanel /> : 
         <CouponPanel />}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
