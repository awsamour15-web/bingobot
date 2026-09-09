import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Promotion, BonusCriteria, EligibilityResult, BonusApplyResult, BonusDistribution, Coupon, WithdrawalRequirements, CouponRedemption, CouponScheduleEntry, BroadcastTarget } from '../lib/api';
import {
  listPromotions,
  getEligiblePlayers, applyPromotionBonus, getBonusDistributions,
  createPromotion,
  updatePromotion, setPromotionStatus, deletePromotion,
  listCoupons, createCoupon, deleteCoupon, getCouponRedemptions,
  listCouponSchedules, createCouponSchedule, deleteCouponSchedule,
  listBroadcastTargets,
  getConfig, updateConfig,
} from '../lib/api';
import {
  C, Btn, Card, CardHeader, Field, PageHeader, StatCard,
  Table, Th, Td, TrEmpty, TrLoading, Alert, Badge,
  inputCss, selectCss,
} from '../components/ui';

type WalletType = 'main' | 'play';
type Tab = 'single' | 'bulk' | 'deposit' | 'active' | 'coupons';

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

function ActiveBonusesPanel({ onCreateNew, onNavigateToDeposit }: { onCreateNew: () => void; onNavigateToDeposit: () => void }) {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [depositBonus, setDepositBonus] = useState<{ pct: number; wallet: string; start?: string; end?: string } | null>(null);
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
      const [all, configs] = await Promise.all([listPromotions(), getConfig()]);
      setPromotions(all.filter(p => p.bonus_amount && Number(p.bonus_amount) > 0));
      const cfgMap = Object.fromEntries(configs.map(c => [c.key, c.value]));
      const pct = parseFloat(cfgMap['deposit_bonus_pct'] ?? '0');
      if (pct > 0) {
        setDepositBonus({
          pct,
          wallet: cfgMap['deposit_bonus_wallet'] ?? 'play',
          ...(cfgMap['deposit_bonus_start'] && { start: cfgMap['deposit_bonus_start'] }),
          ...(cfgMap['deposit_bonus_end'] && { end: cfgMap['deposit_bonus_end'] }),
        });
      } else {
        setDepositBonus(null);
      }
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

  const activeCount = promotions.filter(p => p.status === 'active').length + (depositBonus ? 1 : 0);
  const totalCount = promotions.length + (depositBonus ? 1 : 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <Card>
        <CardHeader
          title="Bonus Promotions"
          subtitle={`${activeCount} active · ${totalCount - activeCount} inactive`}
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
        ) : promotions.length === 0 && !depositBonus ? (
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
              {depositBonus && (
                <tr>
                  <Td>
                    <div style={{ fontWeight: 600 }}>💰 Deposit Bonus</div>
                    <div style={{ fontSize: 11, color: C.muted }}>
                      Auto-applied on deposit
                      {depositBonus.start && ` · from ${new Date(depositBonus.start).toLocaleDateString()}`}
                      {depositBonus.end && ` · until ${new Date(depositBonus.end).toLocaleDateString()}`}
                    </div>
                  </Td>
                  <Td><strong>{depositBonus.pct}%</strong></Td>
                  <Td><Badge variant="neutral">{depositBonus.wallet}</Badge></Td>
                  <Td><Badge variant="success">active</Badge></Td>
                  <Td>
                    <Btn size="sm" variant="outline" onClick={onNavigateToDeposit}>
                      Configure
                    </Btn>
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        )}
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
    getConfig()
      .then(configs => {
        const cfgMap = Object.fromEntries(configs.map(c => [c.key, c.value]));
        setPct(cfgMap['deposit_bonus_pct'] ?? '0');
        setWallet((cfgMap['deposit_bonus_wallet'] === 'main' ? 'main' : 'play') as 'main' | 'play');
        // Convert ISO date strings to datetime-local format (strip seconds/ms)
        const toLocalInput = (iso?: string) => iso ? iso.slice(0, 16) : '';
        setStart(toLocalInput(cfgMap['deposit_bonus_start']));
        setEnd(toLocalInput(cfgMap['deposit_bonus_end']));
      })
      .catch(() => setFeedback({ type: 'error', msg: 'Failed to load deposit bonus settings' }))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (start && end && new Date(start) >= new Date(end)) {
      setFeedback({ type: 'error', msg: 'End time must be after start time' });
      return;
    }
    setSaving(true); setFeedback(null);
    try {
      await updateConfig('deposit_bonus_pct', pct || '0');
      await updateConfig('deposit_bonus_wallet', wallet);
      await updateConfig('deposit_bonus_start', start ? new Date(start).toISOString() : '');
      await updateConfig('deposit_bonus_end', end ? new Date(end).toISOString() : '');
      setFeedback({ type: 'success', msg: 'Deposit bonus settings saved successfully' });
    } catch (err) {
      setFeedback({ type: 'error', msg: (err as Error).message });
    } finally { setSaving(false); }
  }

  async function handleDisable() {
    setSaving(true); setFeedback(null);
    try {
      await updateConfig('deposit_bonus_pct', '0');
      setPct('0');
      setFeedback({ type: 'success', msg: 'Deposit bonus disabled' });
    } catch (err) {
      setFeedback({ type: 'error', msg: (err as Error).message });
    } finally { setSaving(false); }
  }

  const activePct = parseFloat(pct || '0');
  const isActive = activePct > 0;

  return (
    <div style={{ maxWidth: 900 }}>
      <Card>
        <CardHeader
          title="💰 Automatic Deposit Bonus"
          subtitle="Configure automatic bonus when players make deposits"
          action={
            <Badge variant={isActive ? 'success' : 'neutral'}>
              {isActive ? `${activePct}% Active` : 'Disabled'}
            </Badge>
          }
        />
        
        {loading ? (
          <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '20px' }}>⏳ Loading settings…</div>
        ) : (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {feedback && <Alert type={feedback.type}>{feedback.msg}</Alert>}
            
            <div style={{ 
              background: 'rgba(99, 102, 241, 0.05)', 
              borderLeft: '3px solid rgba(99, 102, 241, 0.5)',
              borderRadius: 8,
              padding: 14,
              fontSize: 13,
            }}>
              <div style={{ color: C.muted, marginBottom: 8, fontWeight: 600 }}>📋 HOW IT WORKS</div>
              <div style={{ lineHeight: 1.7, color: 'var(--c-text)' }}>
                When a player deposits <strong>100 ETB</strong> with a <strong style={{ color: 'rgba(99,102,241,0.9)' }}>20%</strong> bonus configured, they receive an extra <strong style={{ color: '#22c55e' }}>20 ETB</strong> automatically in their selected wallet. You can set time windows to enable/disable the bonus during specific periods.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="💯 Bonus Percentage (0-100%)" hint="0 to disable">
                <input type="number" min="0" max="100" step="0.1"
                  value={pct} onChange={e => setPct(e.target.value)}
                  style={inputCss} placeholder="e.g. 20" />
              </Field>
              <Field label="📍 Credit To Wallet">
                <select value={wallet} onChange={e => setWallet(e.target.value as 'play' | 'main')} style={selectCss}>
                  <option value="play">🎮 Play Wallet</option>
                  <option value="main">💰 Main Wallet</option>
                </select>
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="🚀 Start Date & Time (optional)" hint="Leave blank for immediate effect">
                <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} style={inputCss} />
              </Field>
              <Field label="🛑 End Date & Time (optional)" hint="Leave blank for no end time">
                <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} style={inputCss} />
              </Field>
            </div>

            {start && end && new Date(start) >= new Date(end) && (
              <Alert type="error">⚠️ End time must be after start time</Alert>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 12, background: 'rgba(34, 197, 94, 0.05)', borderRadius: 8, border: '1px solid rgba(34, 197, 94, 0.2)' }}>
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>BONUS EXAMPLE</div>
                <div style={{ fontSize: 13 }}>
                  <div>Deposit: <strong>500 ETB</strong></div>
                  <div>Bonus: <strong style={{ color: '#22c55e' }}>+{((activePct || 20) * 5)} ETB</strong></div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>TOTAL RECEIVED</div>
                <div style={{ fontSize: 13 }}>
                  <strong style={{ fontSize: 16, color: 'rgba(99,102,241,0.9)' }}>
                    {500 + ((activePct || 20) * 5)} ETB
                  </strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Btn type="submit" disabled={saving}>
                {saving ? '⏳ Saving…' : '💾 Save Deposit Bonus Settings'}
              </Btn>
              {activePct > 0 && (
                <Btn type="button" variant="danger" disabled={saving} onClick={handleDisable}>
                  {saving ? '...' : '🔴 Disable Bonus'}
                </Btn>
              )}
            </div>

            <div style={{ fontSize: 12, color: C.muted, background: 'rgba(100, 100, 100, 0.05)', padding: 12, borderRadius: 8, lineHeight: 1.6 }}>
              💡 <strong>Note:</strong> These settings are managed through the backend configuration system. Changes are stored in the config table and apply to all new deposits immediately.
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Coupon Panel
// ─────────────────────────────────────────────────────────────────────────────

// ─── Redemptions drawer ───────────────────────────────────────────────────────
function CouponRedemptionsDrawer({ code, onClose }: { code: string; onClose: () => void }) {
  const [redemptions, setRedemptions] = useState<CouponRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCouponRedemptions(code)
      .then(data => { setRedemptions(data); setLoading(false); })
      .catch(e => { setError(e.message ?? 'Failed to load'); setLoading(false); });
  }, [code]);

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  };
  const drawerStyle: React.CSSProperties = {
    background: C.bgCard, borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 720,
    maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  };

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={drawerStyle}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>🎟️ Redemptions for <span style={{ fontFamily: 'monospace', color: C.primary }}>{code}</span></div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{loading ? '…' : `${redemptions.length} player${redemptions.length !== 1 ? 's' : ''} redeemed this coupon`}</div>
          </div>
          <Btn size="sm" variant="outline" onClick={onClose}>✕ Close</Btn>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {error && <Alert type="error">{error}</Alert>}
          <Table>
            <thead>
              <tr>
                <Th>Player</Th>
                <Th>Phone</Th>
                <Th>Amount</Th>
                <Th>Wallet</Th>
                <Th>Redeemed At</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? <TrLoading cols={5} /> : !redemptions.length ? (
                <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: C.muted }}>
                  No one has redeemed this coupon yet.
                </td></tr>
              ) : redemptions.map(r => (
                <tr key={r.transactionId}>
                  <Td><span style={{ fontWeight: 600 }}>{r.playerName || '—'}</span></Td>
                  <Td><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.playerPhone}</span></Td>
                  <Td><strong>{r.amount} ETB</strong></Td>
                  <Td>
                    <Badge variant={r.walletType === 'play' ? 'info' : 'success'}>
                      {r.walletType === 'play' ? '🎮 Play' : '💰 Main'}
                    </Badge>
                  </Td>
                  <Td><span style={{ fontSize: 12, color: C.muted }}>{new Date(r.redeemedAt).toLocaleString()}</span></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function CouponPanel() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [viewingRedemptions, setViewingRedemptions] = useState<string | null>(null);

  // Form state
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');
  const [wallet, setWallet] = useState<'main' | 'play'>('play');
  const [maxUses, setMaxUses] = useState('');
  const [description, setDescription] = useState('');
  const [wdReqs, setWdReqs] = useState<WithdrawalRequirements>({});
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
      // Clean up empty withdrawal requirements
      const cleanReqs: WithdrawalRequirements = {};
      if (wdReqs.minDepositToday) cleanReqs.minDepositToday = Number(wdReqs.minDepositToday);
      if (wdReqs.minTotalDeposit) cleanReqs.minTotalDeposit = Number(wdReqs.minTotalDeposit);
      if (wdReqs.minGamesToday) cleanReqs.minGamesToday = Number(wdReqs.minGamesToday);
      if (wdReqs.minInvitations) cleanReqs.minInvitations = Number(wdReqs.minInvitations);

      const created = await createCoupon({
        code: code.trim().toUpperCase(),
        amount: amt,
        wallet,
        maxUses: maxUses ? Number(maxUses) : null,
        description: description.trim(),
        ...(Object.keys(cleanReqs).length > 0 ? { claimRequirements: cleanReqs } : {}),
      });
      setSuccess('✓ Coupon created successfully');
      setCode(''); setAmount(''); setMaxUses(''); setDescription(''); setWdReqs({});
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
      {viewingRedemptions && (
        <CouponRedemptionsDrawer code={viewingRedemptions} onClose={() => setViewingRedemptions(null)} />
      )}

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

            {/* Claim Requirements */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ca8a04' }}>
                🔒 Claim Requirements (optional)
              </div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                Player must meet these conditions before they can claim this coupon. Leave blank = no requirement.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="💰 Deposit Today (ETB)" hint="Min deposit amount today">
                  <input
                    type="number" min={0} step={1}
                    value={wdReqs.minDepositToday ?? ''}
                    onChange={e => setWdReqs(r => { const n = { ...r }; if (e.target.value) n.minDepositToday = Number(e.target.value); else delete n.minDepositToday; return n; })}
                    placeholder="no requirement"
                    style={inputCss}
                  />
                </Field>
                <Field label="💳 Total Deposit Ever (ETB)" hint="Min lifetime deposits">
                  <input
                    type="number" min={0} step={1}
                    value={wdReqs.minTotalDeposit ?? ''}
                    onChange={e => setWdReqs(r => { const n = { ...r }; if (e.target.value) n.minTotalDeposit = Number(e.target.value); else delete n.minTotalDeposit; return n; })}
                    placeholder="no requirement"
                    style={inputCss}
                  />
                </Field>
                <Field label="🎮 Games Today" hint="Min games played today (all types)">
                  <input
                    type="number" min={0} step={1}
                    value={wdReqs.minGamesToday ?? ''}
                    onChange={e => setWdReqs(r => { const n = { ...r }; if (e.target.value) n.minGamesToday = Number(e.target.value); else delete n.minGamesToday; return n; })}
                    placeholder="no requirement"
                    style={inputCss}
                  />
                </Field>
                <Field label="👥 Invitations" hint="Min friends invited (referrals)">
                  <input
                    type="number" min={0} step={1}
                    value={wdReqs.minInvitations ?? ''}
                    onChange={e => setWdReqs(r => { const n = { ...r }; if (e.target.value) n.minInvitations = Number(e.target.value); else delete n.minInvitations; return n; })}
                    placeholder="no requirement"
                    style={inputCss}
                  />
                </Field>
              </div>
            </div>

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
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? <TrLoading cols={6} /> : !coupons.length ? (
                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: C.muted }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🎟️</div>
                  <div>No coupons yet. Create one to get started.</div>
                </td></tr>
              ) : (
                coupons.map(c => {
                  const isExhausted = c.maxUses !== null && c.usedCount >= c.maxUses;
                  return (
                    <tr key={c.code} style={{ opacity: isExhausted ? 0.6 : 1 }}>
                      <Td>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: C.primary, letterSpacing: '0.05em' }}>{c.code}</span>
                        {c.description && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{c.description}</div>}
                        {c.claimRequirements && Object.keys(c.claimRequirements).length > 0 && (
                          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {c.claimRequirements.minDepositToday && (
                              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(234,179,8,0.15)', color: '#ca8a04', fontWeight: 700 }}>
                                💰 Dep today ≥{c.claimRequirements.minDepositToday}
                              </span>
                            )}
                            {c.claimRequirements.minTotalDeposit && (
                              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(234,179,8,0.15)', color: '#ca8a04', fontWeight: 700 }}>
                                💳 Total dep ≥{c.claimRequirements.minTotalDeposit}
                              </span>
                            )}
                            {c.claimRequirements.minGamesToday && (
                              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(234,179,8,0.15)', color: '#ca8a04', fontWeight: 700 }}>
                                🎮 Games today ≥{c.claimRequirements.minGamesToday}
                              </span>
                            )}
                            {c.claimRequirements.minInvitations && (
                              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(234,179,8,0.15)', color: '#ca8a04', fontWeight: 700 }}>
                                👥 Invites ≥{c.claimRequirements.minInvitations}
                              </span>
                            )}
                          </div>
                        )}
                      </Td>
                      <Td><strong style={{ fontSize: 14 }}>{c.amount} ETB</strong></Td>
                      <Td>
                        <Badge variant={c.wallet === 'play' ? 'info' : 'success'}>
                          {c.wallet === 'play' ? '🎮 Play' : '💰 Main'}
                        </Badge>
                      </Td>
                      <Td>
                        <button
                          onClick={() => c.usedCount > 0 && setViewingRedemptions(c.code)}
                          style={{
                            background: 'none', border: 'none', cursor: c.usedCount > 0 ? 'pointer' : 'default',
                            padding: 0, color: c.usedCount > 0 ? C.primary : C.muted,
                            fontWeight: c.usedCount > 0 ? 700 : 400, fontSize: 13,
                            textDecoration: c.usedCount > 0 ? 'underline' : 'none',
                          }}
                          title={c.usedCount > 0 ? 'Click to see who redeemed' : 'No redemptions yet'}
                        >
                          {c.usedCount}{c.maxUses !== null ? ` / ${c.maxUses}` : ' / ∞'}
                        </button>
                      </Td>
                      <Td>
                        <Badge variant={isExhausted ? 'danger' : 'success'}>
                          {isExhausted ? 'Exhausted' : 'Active'}
                        </Badge>
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {c.usedCount > 0 && (
                            <Btn size="sm" variant="outline" onClick={() => setViewingRedemptions(c.code)}>
                              👥
                            </Btn>
                          )}
                          <Btn
                            variant="danger"
                            size="sm"
                            disabled={deleting === c.code}
                            onClick={() => handleDelete(c.code)}
                          >
                            {deleting === c.code ? '...' : '🗑️'}
                          </Btn>
                        </div>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card>
      </div>

      {/* ── Schedule Announcements ── */}
      <CouponScheduleSection coupons={coupons} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Coupon Schedule Section
// ─────────────────────────────────────────────────────────────────────────────

function CouponScheduleSection({ coupons }: { coupons: Coupon[] }) {
  const [schedules, setSchedules] = useState<CouponScheduleEntry[]>([]);
  const [targets, setTargets] = useState<BroadcastTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCode, setSelectedCode] = useState('');
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
  const [sendAt, setSendAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function load() {
    Promise.all([listCouponSchedules(), listBroadcastTargets()])
      .then(([s, t]) => { setSchedules(s); setTargets(t); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function toggleTarget(id: string) {
    setSelectedTargets(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCode) { setError('Select a coupon'); return; }
    if (selectedTargets.size === 0) { setError('Select at least one target'); return; }
    if (!sendAt) { setError('Set a send time'); return; }
    setSaving(true); setError(null); setSuccess(null);
    try {
      const target_ids = targets
        .filter(t => selectedTargets.has(t.id))
        .map(t => t.type === 'bot_broadcast' ? '__bot_broadcast__' : (t.channel_id ?? t.id));
      await createCouponSchedule({ coupon_code: selectedCode, target_ids, send_at: new Date(sendAt).toISOString() });
      setSuccess('✓ Schedule created');
      setSelectedCode(''); setSelectedTargets(new Set()); setSendAt('');
      load();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    await deleteCouponSchedule(id).catch(() => {});
    load();
  }

  const activeCoupons = coupons.filter(c => !c.maxUses || c.usedCount < c.maxUses);
  const activeTargets = targets.filter(t => t.is_active);

  return (
    <Card>
      <CardHeader title="📅 Schedule Coupon Announcement" subtitle="Auto-broadcast a coupon code to Telegram groups at a set time" />
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 20, alignItems: 'start' }}>
        {/* Form */}
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Coupon">
            <select value={selectedCode} onChange={e => setSelectedCode(e.target.value)} style={selectCss} required>
              <option value="">— Select coupon —</option>
              {activeCoupons.map(c => (
                <option key={c.code} value={c.code}>{c.code} ({c.amount} ETB)</option>
              ))}
            </select>
          </Field>
          <Field label="Send At">
            <input type="datetime-local" value={sendAt} onChange={e => setSendAt(e.target.value)} style={inputCss} required />
          </Field>
          <Field label="Targets">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activeTargets.length === 0 && <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>No active targets. Add in Promotions page.</span>}
              {activeTargets.map(t => (
                <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--c-text)' }}>
                  <input type="checkbox" checked={selectedTargets.has(t.id)} onChange={() => toggleTarget(t.id)} />
                  <span>{t.type === 'bot_broadcast' ? '🤖' : '📢'} {t.name}</span>
                </label>
              ))}
            </div>
          </Field>
          <Btn type="submit" disabled={saving}>{saving ? '⏳ Scheduling…' : '📅 Schedule'}</Btn>
        </form>

        {/* Scheduled list */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-muted)', marginBottom: 10 }}>Upcoming</div>
          {loading ? <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>Loading…</p> : schedules.length === 0 ? (
            <p style={{ color: 'var(--c-muted)', fontSize: 13 }}>No scheduled announcements.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {schedules.map(s => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 10,
                  background: s.sent ? 'rgba(100,116,139,0.08)' : 'rgba(99,102,241,0.08)',
                  border: `1px solid ${s.sent ? 'rgba(100,116,139,0.2)' : 'rgba(99,102,241,0.25)'}`,
                  opacity: s.sent ? 0.6 : 1,
                }}>
                  <div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: 'var(--c-text)' }}>{s.coupon_code}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 2 }}>
                      {new Date(s.send_at).toLocaleString()} · {s.target_ids.length} target{s.target_ids.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Badge variant={s.sent ? 'neutral' : 'info'}>{s.sent ? 'Sent' : 'Pending'}</Badge>
                    {!s.sent && (
                      <Btn size="sm" variant="danger" onClick={() => handleDelete(s.id)}>✕</Btn>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function BonusPage() {
  const [tab, setTab] = useState<Tab>('active');

  const tabItems = [
    { id: 'active' as const, label: 'Active Bonuses', icon: '⭐' },
    { id: 'bulk' as const, label: 'Bulk Bonus', icon: '🎯' },
    { id: 'deposit' as const, label: 'Deposit Bonus', icon: '💰' },
    { id: 'coupons' as const, label: 'Coupons', icon: '🎟️' },
  ];

  return (
    <div className="fade-in">
      <PageHeader title="🎁 Bonus Manager" />

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
        {tab === 'active' ? <ActiveBonusesPanel onCreateNew={() => setTab('bulk')} onNavigateToDeposit={() => setTab('deposit')} /> : 
         tab === 'bulk' ? <BulkBonusPanel /> : 
         tab === 'deposit' ? <DepositBonusPanel /> :
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
