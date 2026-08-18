import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminPlayer, AdminCreditRequest } from '@fidel/shared';
import type { Promotion, BonusCriteria, EligibilityResult, BonusApplyResult, BonusDistribution } from '../lib/api';
import {
  getPlayers, creditPlayer, listPromotions,
  getEligiblePlayers, applyPromotionBonus, getBonusDistributions,
  createPromotion, getConfig, updateConfig,
  updatePromotion, setPromotionStatus,
} from '../lib/api';
import {
  C, Btn, Card, CardHeader, Field, PageHeader, StatCard,
  Table, Th, Td, TrEmpty, TrLoading, Alert, Badge,
  inputCss, selectCss,
} from '../components/ui';

type WalletType = 'main' | 'play';
type Tab = 'single' | 'bulk' | 'deposit' | 'active';

// ─────────────────────────────────────────────────────────────────────────────
// Single-player bonus (unchanged feature, kept intact)
// ─────────────────────────────────────────────────────────────────────────────

type BonusPreset = { id: string; label: string; amount: number; wallet: WalletType; note: string };

const BONUS_PRESETS: BonusPreset[] = [
  { id: 'welcome',  label: 'Welcome Bonus',  amount: 20,  wallet: 'play', note: 'Welcome bonus for new player registration' },
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
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 18, alignItems: 'start' }}>
      <Card>
        <CardHeader title="Players" subtitle="Select a player and assign a bonus" />
        <div style={{ marginBottom: 16 }}>
          <input type="search" name="player-search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search username or Telegram ID" style={{ ...inputCss, paddingLeft: 12 }} />
        </div>
        <Table>
          <thead><tr><Th>Player</Th><Th>Main</Th><Th>Play</Th><Th>Status</Th></tr></thead>
          <tbody>
            {loading ? <TrLoading cols={4} /> : !players.length ? <TrEmpty cols={4} message="No players found." /> :
              players.map(player => (
                <tr key={player.id} onClick={() => setSelectedId(player.id)}
                  style={{ cursor: 'pointer', background: selectedId === player.id ? 'rgba(99,102,241,0.08)' : undefined }}>
                  <Td>
                    <div style={{ fontWeight: 700 }}>@{player.username}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{player.telegram_id}</div>
                  </Td>
                  <Td>{Number(player.main_wallet_balance).toFixed(2)}</Td>
                  <Td>{Number(player.play_wallet_balance).toFixed(2)}</Td>
                  <Td><Badge variant={player.is_suspended ? 'danger' : 'success'}>{player.is_suspended ? 'Suspended' : 'Active'}</Badge></Td>
                </tr>
              ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Assign Bonus" subtitle={selectedPlayer ? `@${selectedPlayer.username}` : 'Choose a player'} />
        {error && <Alert type="error">{error}</Alert>}
        {success && <Alert type="success">{success}</Alert>}
        {!selectedPlayer ? (
          <div style={{ color: C.muted, fontSize: 13 }}>Select a player to continue.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              {BONUS_PRESETS.map(item => (
                <button key={item.id} type="button" onClick={() => setPresetId(item.id)} style={{
                  border: presetId === item.id ? '1px solid rgba(99,102,241,0.5)' : '1px solid var(--c-border)',
                  background: presetId === item.id ? 'rgba(99,102,241,0.08)' : 'transparent',
                  borderRadius: 10, padding: '10px 12px', textAlign: 'left',
                  color: 'var(--c-text)', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', gap: 8,
                }}>
                  <span>{item.label}</span>
                  <strong>{item.id === 'custom' ? 'Custom' : `${item.amount} ETB`}</strong>
                </button>
              ))}
            </div>
            {presetId === 'custom' && (
              <Field label="Custom Amount (ETB)">
                <input type="number" name="custom-amount" min="1" step="1" value={customAmount}
                  onChange={e => setCustomAmount(e.target.value)} style={inputCss} placeholder="e.g. 75" />
              </Field>
            )}
            <Field label="Wallet">
              <select name="wallet-type" value={effectiveWallet} onChange={e => setWalletType(e.target.value as WalletType)}
                style={selectCss} disabled={presetId !== 'custom'}>
                <option value="play">Play Wallet</option>
                <option value="main">Main Wallet</option>
              </select>
            </Field>
            <Field label="Reason">
              <input type="text" name="reason" value={reason} onChange={e => setReason(e.target.value)}
                style={inputCss} placeholder={preset.note} />
            </Field>
            <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, padding: '12px 14px', fontSize: 13 }}>
              <div style={{ color: C.muted, marginBottom: 6 }}>Summary</div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{effectiveAmount} ETB</div>
              <div style={{ color: C.muted }}>{effectiveWallet === 'main' ? 'Main Wallet' : 'Play Wallet'}</div>
            </div>
            <Btn type="button" onClick={handleApply} disabled={saving}>
              {saving ? 'Applying…' : `Apply ${effectiveAmount} ETB Bonus`}
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

function ActiveBonusesPanel() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editWallet, setEditWallet] = useState<WalletType>('play');
  const [saving, setSaving] = useState(false);

  async function loadBonuses() {
    setLoading(true); setError(null);
    try {
      const all = await listPromotions();
      setPromotions(all.filter(p => p.bonus_amount && Number(p.bonus_amount) > 0));
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadBonuses(); }, []);

  async function handleEdit(promo: Promotion) {
    setEditing(promo.id);
    setEditAmount(String(promo.bonus_amount ?? 0));
    setEditWallet(promo.bonus_wallet ?? 'play');
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <Card>
        <CardHeader
          title="Active Bonuses"
          subtitle="View and manage all active bonuses in the system"
          action={
            <Btn size="sm" onClick={() => void loadBonuses()}>
              ↻ Refresh
            </Btn>
          }
        />

        {loading ? (
          <TrLoading cols={5} />
        ) : promotions.length === 0 ? (
          <Alert type="info">
            No active bonuses found. Create a bonus promotion from the "Bulk Bonus" tab.
          </Alert>
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
                const criteriaCount = promo.bonus_criteria
                  ? Object.keys(promo.bonus_criteria as BonusCriteria).length
                  : 0;

                return (
                  <tr key={promo.id}>
                    <Td>
                      <div style={{ fontWeight: 600 }}>{promo.title}</div>
                      {criteriaCount > 0 && (
                        <div style={{ fontSize: 11, color: C.muted }}>
                          {criteriaCount} eligibility {criteriaCount === 1 ? 'criterion' : 'criteria'}
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
                      <div style={{ display: 'flex', gap: 6 }}>
                        {isEditing ? (
                          <>
                            <Btn
                              size="sm"
                              onClick={() => handleSaveEdit(promo.id)}
                              disabled={saving}
                            >
                              {saving ? 'Saving…' : 'Save'}
                            </Btn>
                            <Btn
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditing(null)}
                              disabled={saving}
                            >
                              Cancel
                            </Btn>
                          </>
                        ) : (
                          <>
                            <Btn
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(promo)}
                            >
                              Edit
                            </Btn>
                            <Btn
                              size="sm"
                              variant={promo.status === 'active' ? 'warning' : 'primary'}
                              onClick={() => void handleToggleStatus(promo)}
                            >
                              {promo.status === 'active' ? 'Deactivate' : 'Activate'}
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

      <Card>
        <CardHeader
          title="💡 Bonus Management Tips"
          subtitle="How to manage your bonus system effectively"
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
          <div>
            <strong style={{ color: 'var(--c-text)' }}>Edit Bonus:</strong>
            <span style={{ color: C.muted, marginLeft: 6 }}>
              Click "Edit" to modify the bonus amount or target wallet
            </span>
          </div>
          <div>
            <strong style={{ color: 'var(--c-text)' }}>Activate/Deactivate:</strong>
            <span style={{ color: C.muted, marginLeft: 6 }}>
              Control which bonuses are active without deleting them
            </span>
          </div>
          <div>
            <strong style={{ color: 'var(--c-text)' }}>Eligibility Criteria:</strong>
            <span style={{ color: C.muted, marginLeft: 6 }}>
              Edit criteria in the "Bulk Bonus" tab when creating or updating promotions
            </span>
          </div>
          <div>
            <strong style={{ color: 'var(--c-text)' }}>Distribution History:</strong>
            <span style={{ color: C.muted, marginLeft: 6 }}>
              View who received each bonus in the "Bulk Bonus" tab's history section
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Deposit bonus config panel
// ─────────────────────────────────────────────────────────────────────────────

function DepositBonusPanel() {
  const [pct, setPct] = useState('');
  const [wallet, setWallet] = useState<'play' | 'main'>('play');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    getConfig().then((entries) => {
      const map = Object.fromEntries(entries.map((e) => [e.key, e.value]));
      setPct(map['deposit_bonus_pct'] ?? '');
      setWallet((map['deposit_bonus_wallet'] as 'play' | 'main') ?? 'play');
      setStart(map['deposit_bonus_start'] ? map['deposit_bonus_start'].slice(0, 16) : '');
      setEnd(map['deposit_bonus_end'] ? map['deposit_bonus_end'].slice(0, 16) : '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setFeedback(null);
    try {
      await updateConfig('deposit_bonus_pct', pct || '0');
      await updateConfig('deposit_bonus_wallet', wallet);
      await updateConfig('deposit_bonus_start', start ? new Date(start).toISOString() : '');
      await updateConfig('deposit_bonus_end', end ? new Date(end).toISOString() : '');
      setFeedback({ type: 'success', msg: 'Deposit bonus settings saved.' });
    } catch (err) {
      setFeedback({ type: 'error', msg: (err as Error).message });
    } finally { setSaving(false); }
  }

  async function handleDisable() {
    setSaving(true); setFeedback(null);
    try {
      await updateConfig('deposit_bonus_pct', '0');
      setPct('0');
      setFeedback({ type: 'success', msg: 'Deposit bonus disabled.' });
    } catch (err) {
      setFeedback({ type: 'error', msg: (err as Error).message });
    } finally { setSaving(false); }
  }

  const activePct = parseFloat(pct || '0');
  const isActive = activePct > 0;

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader
        title="🎁 Deposit Bonus"
        subtitle="Automatically credit a % bonus when a player deposits"
        action={
          <Badge variant={isActive ? 'success' : 'neutral'}>
            {isActive ? `${activePct}% active` : 'disabled'}
          </Badge>
        }
      />
      {loading ? (
        <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>
      ) : (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {feedback && <Alert type={feedback.type}>{feedback.msg}</Alert>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <Field label="Bonus %" hint="e.g. 20 means 20% of deposit amount">
              <input type="number" min="0" max="100" step="0.01"
                value={pct} onChange={e => setPct(e.target.value)}
                style={inputCss} placeholder="0 = disabled" />
            </Field>
            <Field label="Credit To">
              <select value={wallet} onChange={e => setWallet(e.target.value as 'play' | 'main')} style={selectCss}>
                <option value="play">Play Wallet</option>
                <option value="main">Main Wallet</option>
              </select>
            </Field>
            <Field label="Start (optional)" hint="Leave blank = no start limit">
              <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} style={inputCss} />
            </Field>
            <Field label="End (optional)" hint="Leave blank = no end limit">
              <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} style={inputCss} />
            </Field>
          </div>
          <div style={{ background: 'rgba(99,102,241,0.06)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.muted }}>
            Example: if bonus is <strong style={{ color: 'var(--c-text)' }}>20%</strong> and player deposits{' '}
            <strong style={{ color: 'var(--c-text)' }}>100 ETB</strong>, they get{' '}
            <strong style={{ color: '#22c55e' }}>20 ETB</strong> extra in their {wallet} wallet automatically.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Bonus Settings'}</Btn>
            {isActive && (
              <Btn type="button" variant="danger" disabled={saving} onClick={handleDisable}>Disable Bonus</Btn>
            )}
          </div>
        </form>
      )}
    </Card>
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

  return (
    <div className="fade-in">
      <PageHeader title="Bonus Manager" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard icon="🎁" label="Players"   value={loading ? '…' : players.length} color={C.primary} />
        <StatCard icon="✅" label="Active"    value={loading ? '…' : active}          color={C.success} />
        <StatCard icon="🚫" label="Suspended" value={loading ? '…' : players.length - active} color={C.danger} />
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <Btn variant={tab === 'active' ? 'primary' : 'outline'} onClick={() => setTab('active')}>
          ⭐ Active Bonuses
        </Btn>
        <Btn variant={tab === 'single' ? 'primary' : 'outline'} onClick={() => setTab('single')}>
          👤 Single Player
        </Btn>
        <Btn variant={tab === 'bulk' ? 'primary' : 'outline'} onClick={() => setTab('bulk')}>
          🎯 Bulk Bonus (Promotion)
        </Btn>
        <Btn variant={tab === 'deposit' ? 'primary' : 'outline'} onClick={() => setTab('deposit')}>
          💰 Deposit Bonus
        </Btn>
      </div>

      {tab === 'active' ? <ActiveBonusesPanel /> : tab === 'single' ? <SingleBonusPanel /> : tab === 'bulk' ? <BulkBonusPanel /> : <DepositBonusPanel />}
    </div>
  );
}
