import React, { useEffect, useState, useCallback } from 'react';
import {
  C, Btn, Badge, Card, CardHeader, Table, Th, Td, TrEmpty, TrLoading,
  Alert, Field, KpiCard, PageHeader, inputCss, selectCss,
} from '../components/ui';
import type {
  Promotion, PromotionSchedule, PromotionLog, PromotionContentType,
  PromotionStatus, PromotionStats, GlobalPromotionStats, BroadcastTarget,
} from '../lib/api';
import {
  listPromotions, createPromotion, updatePromotion, setPromotionStatus,
  listSchedules, createSchedule, cancelSchedule, getPromotionLogs,
  duplicatePromotion, sendPromotionNow, retryFailedDeliveries,
  getPromotionStats, getGlobalPromotionStats,
  listBroadcastTargets, createBroadcastTarget, updateBroadcastTarget, deleteBroadcastTarget,
} from '../lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, padding: 20,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--c-bg-card)', border: '1px solid var(--c-border)',
        borderRadius: 16, padding: 28, width: '100%', maxWidth: wide ? 680 : 520,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>{title}</h3>
          <button onClick={onClose} style={{
            background: 'rgba(148,163,184,0.1)', border: '1px solid var(--c-border)',
            borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
            color: 'var(--c-muted)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 10, marginTop: 4 }}>
      {children}
    </div>
  );
}

function TargetChip({ target, selected, onClick }: { target: BroadcastTarget; selected: boolean; onClick: () => void }) {
  const isBot = target.type === 'bot_broadcast';
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
      borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
      border: `2px solid ${selected ? (isBot ? '#8b5cf6' : '#3b82f6') : 'var(--c-border)'}`,
      background: selected ? (isBot ? 'rgba(139,92,246,0.12)' : 'rgba(59,130,246,0.12)') : 'transparent',
      color: selected ? (isBot ? '#a78bfa' : '#60a5fa') : 'var(--c-muted)',
      fontSize: 13, fontWeight: selected ? 600 : 400,
    }}>
      <span style={{ fontSize: 16 }}>{isBot ? '🤖' : '📢'}</span>
      <span>{target.name}</span>
    </button>
  );
}

// ── Broadcast Targets Manager ─────────────────────────────────────────────────
function TargetsManager({ targets, onChanged }: { targets: BroadcastTarget[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'channel' | 'bot_broadcast'>('channel');
  const [channelId, setChannelId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await createBroadcastTarget({ name, type, ...(type === 'channel' ? { channel_id: channelId } : {}) });
      setName(''); setChannelId(''); setAdding(false);
      onChanged();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader
        title="Broadcast Targets"
        subtitle="Saved destinations: channels and bot users"
        action={<Btn size="sm" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '+ Add Target'}</Btn>}
      />

      {adding && (
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16, padding: '14px', background: 'var(--c-bg)', borderRadius: 10 }}>
          {error && <div style={{ width: '100%' }}><Alert type="error">{error}</Alert></div>}
          <Field label="Name">
            <input value={name} onChange={e => setName(e.target.value)} required style={inputCss} placeholder="e.g. Main Channel" />
          </Field>
          <Field label="Type">
            <select value={type} onChange={e => setType(e.target.value as typeof type)} style={{ ...selectCss, width: 160 }}>
              <option value="channel">📢 Channel / Group</option>
              <option value="bot_broadcast">🤖 Bot — All Users</option>
            </select>
          </Field>
          {type === 'channel' && (
            <Field label="Channel ID" hint="e.g. -1001234567890">
              <input value={channelId} onChange={e => setChannelId(e.target.value)} required style={{ ...inputCss, width: 180 }} placeholder="-1003959006748" />
            </Field>
          )}
          <Btn type="submit" size="sm" disabled={saving}>{saving ? '…' : 'Save'}</Btn>
        </form>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {targets.length === 0 && <span style={{ color: C.muted, fontSize: 13 }}>No targets yet. Add one above.</span>}
        {targets.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--c-bg)', border: '1px solid var(--c-border)', fontSize: 13 }}>
            <span>{t.type === 'bot_broadcast' ? '🤖' : '📢'}</span>
            <span style={{ color: 'var(--c-text)', fontWeight: 500 }}>{t.name}</span>
            {t.channel_id && <span style={{ color: C.muted, fontSize: 11 }}>{t.channel_id}</span>}
            <Badge variant={t.is_active ? 'success' : 'neutral'}>{t.is_active ? 'on' : 'off'}</Badge>
            <button onClick={() => updateBroadcastTarget(t.id, { is_active: !t.is_active }).then(onChanged)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 12, padding: '0 2px' }}>
              {t.is_active ? '⏸' : '▶'}
            </button>
            <button onClick={() => deleteBroadcastTarget(t.id).then(onChanged)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12, padding: '0 2px' }}>✕</button>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Send Now Modal (target picker) ────────────────────────────────────────────
function SendNowModal({ promotion, targets, onClose }: { promotion: Promotion; targets: BroadcastTarget[]; onClose: () => void }) {
  const activeTargets = targets.filter(t => t.is_active);
  const [selected, setSelected] = useState<Set<string>>(new Set(activeTargets.map(t => t.id)));
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSend() {
    setSending(true); setError(null);
    try {
      const chosenTargets = targets.filter(t => selected.has(t.id));
      const res = await sendPromotionNow(promotion.id, chosenTargets);
      setResult(res);
    } catch (err) { setError((err as Error).message); }
    finally { setSending(false); }
  }

  return (
    <Modal title={`Send — ${promotion.title}`} onClose={onClose}>
      {result ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>{result.failed === 0 ? '✅' : '⚠️'}</div>
          <div style={{ fontWeight: 700, color: 'var(--c-text)', fontSize: 18, marginBottom: 6 }}>
            {result.sent} sent{result.failed > 0 ? `, ${result.failed} failed` : ''}
          </div>
          {result.failed > 0 && <div style={{ color: '#ef4444', fontSize: 13 }}>Check delivery logs for details</div>}
          <div style={{ marginTop: 20 }}><Btn onClick={onClose}>Done</Btn></div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {error && <Alert type="error">{error}</Alert>}

          <div>
            <SectionTitle>Select Destinations</SectionTitle>
            {activeTargets.length === 0 ? (
              <Alert type="info">No active targets. Add targets in the Broadcast Targets section first.</Alert>
            ) : (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {activeTargets.map(t => (
                  <TargetChip key={t.id} target={t} selected={selected.has(t.id)} onClick={() => toggle(t.id)} />
                ))}
              </div>
            )}
          </div>

          {/* Preview */}
          <div>
            <SectionTitle>Message Preview</SectionTitle>
            <div style={{ padding: 14, borderRadius: 10, background: 'var(--c-bg)', border: '1px solid var(--c-border)', fontSize: 13, color: 'var(--c-text)', whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto' }}>
              {promotion.content_type === 'text'
                ? (promotion.text_content ?? <em style={{ color: C.muted }}>No content</em>)
                : <span style={{ color: C.muted }}>📎 {promotion.content_type.toUpperCase()} — {promotion.caption || '(no caption)'}</span>
              }
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <Btn variant="outline" onClick={onClose}>Cancel</Btn>
            <Btn disabled={sending || selected.size === 0} onClick={handleSend}>
              {sending ? 'Sending…' : `🚀 Send to ${selected.size} target${selected.size !== 1 ? 's' : ''}`}
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Create / Edit Form ────────────────────────────────────────────────────────
function PromotionForm({
  initial, onSaved, onCancel,
}: {
  initial?: Promotion;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const editing = !!initial;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [contentType, setContentType] = useState<PromotionContentType>(initial?.content_type ?? 'text');
  const [textContent, setTextContent] = useState(initial?.text_content ?? '');
  const [mediaFileId, setMediaFileId] = useState(initial?.media_file_id ?? '');
  const [caption, setCaption] = useState(initial?.caption ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      if (editing) {
        await updatePromotion(initial!.id, {
          title,
          ...(contentType === 'text' ? { text_content: textContent } : { media_file_id: mediaFileId, caption }),
        });
      } else {
        await createPromotion({
          title, content_type: contentType,
          ...(contentType === 'text' ? { text_content: textContent } : { media_file_id: mediaFileId, ...(caption ? { caption } : {}) }),
        });
        setTitle(''); setTextContent(''); setMediaFileId(''); setCaption('');
      }
      onSaved();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <Alert type="error">{error}</Alert>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
        <Field label="Title">
          <input value={title} onChange={e => setTitle(e.target.value)} required style={inputCss} placeholder="e.g. Weekend Bonus Announcement" />
        </Field>
        <Field label="Type">
          <select value={contentType} onChange={e => setContentType(e.target.value as PromotionContentType)} style={{ ...selectCss, width: 120 }} disabled={editing}>
            <option value="text">📝 Text</option>
            <option value="image">🖼 Image</option>
            <option value="video">🎬 Video</option>
            <option value="gif">🎞 GIF</option>
          </select>
        </Field>
      </div>

      {contentType === 'text' ? (
        <Field label="Message" hint={`${textContent.length}/4096`}>
          <textarea value={textContent} onChange={e => setTextContent(e.target.value)}
            required maxLength={4096} rows={5}
            style={{ ...inputCss, resize: 'vertical' }}
            placeholder="Write your promotion message here…" />
        </Field>
      ) : (
        <>
          <Field label="Telegram File ID" hint="Send the file to the bot first to get its file_id">
            <input value={mediaFileId} onChange={e => setMediaFileId(e.target.value)} required style={inputCss} placeholder="AgACAgIAAxk…" />
          </Field>
          <Field label="Caption (optional)" hint={`${caption.length}/1024`}>
            <textarea value={caption} onChange={e => setCaption(e.target.value)}
              maxLength={1024} rows={2} style={{ ...inputCss, resize: 'vertical' }}
              placeholder="Text shown below the media…" />
          </Field>
        </>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {onCancel && <Btn variant="outline" type="button" onClick={onCancel}>Cancel</Btn>}
        <Btn type="submit" disabled={saving}>{saving ? (editing ? 'Saving…' : 'Creating…') : (editing ? 'Save Changes' : 'Create Promotion')}</Btn>
      </div>
    </form>
  );
}

// ── Schedule Section ──────────────────────────────────────────────────────────
function ScheduleSection({ promotionId, targets }: { promotionId: string; targets: BroadcastTarget[] }) {
  const [schedules, setSchedules] = useState<PromotionSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
  const [frequency, setFrequency] = useState<'once' | 'daily' | 'weekly' | 'monthly'>('once');
  const [sendAt, setSendAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setSchedules(await listSchedules(promotionId).catch(() => []));
    setLoading(false);
  }

  useEffect(() => { void load(); }, [promotionId]);

  function toggleTarget(id: string) {
    setSelectedTargets(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      // Resolve channel_ids from selected targets
      const channelIds: string[] = [];
      for (const t of targets.filter(t => selectedTargets.has(t.id))) {
        if (t.type === 'channel' && t.channel_id) channelIds.push(t.channel_id);
        else if (t.type === 'bot_broadcast') channelIds.push('__bot_broadcast__');
      }
      await createSchedule(promotionId, { channel_ids: channelIds, frequency, send_at: new Date(sendAt).toISOString() });
      setSelectedTargets(new Set()); setSendAt('');
      void load();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  const activeTargets = targets.filter(t => t.is_active);

  return (
    <div style={{ padding: '4px 0' }}>
      <SectionTitle>Schedules</SectionTitle>
      <Table>
        <thead><tr><Th>Targets</Th><Th>Freq</Th><Th>Next Run</Th><Th>Status</Th><Th>{'  '}</Th></tr></thead>
        <tbody>
          {loading ? <TrLoading cols={5} /> : schedules.length === 0 ? <TrEmpty cols={5} message="No schedules yet." /> :
            schedules.map(s => (
              <tr key={s.id}>
                <Td style={{ fontSize: 11 }}>{s.channel_ids.join(', ')}</Td>
                <Td><Badge variant="info">{s.frequency}</Badge></Td>
                <Td muted>{s.next_run_at ? new Date(s.next_run_at).toLocaleString() : '—'}</Td>
                <Td><Badge variant={s.is_active ? 'success' : 'neutral'}>{s.is_active ? 'active' : 'done'}</Badge></Td>
                <Td>{s.is_active && <Btn size="sm" variant="danger" onClick={() => cancelSchedule(s.id).then(load)}>Cancel</Btn>}</Td>
              </tr>
            ))}
        </tbody>
      </Table>
      {error && <Alert type="error">{error}</Alert>}
      <form onSubmit={handleAdd} style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Select targets for this schedule</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {activeTargets.map(t => (
              <TargetChip key={t.id} target={t} selected={selectedTargets.has(t.id)} onClick={() => toggleTarget(t.id)} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Frequency">
            <select value={frequency} onChange={e => setFrequency(e.target.value as typeof frequency)} style={{ ...selectCss, width: 110 }}>
              <option value="once">Once</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </Field>
          <Field label="Send At">
            <input type="datetime-local" value={sendAt} onChange={e => setSendAt(e.target.value)} required style={{ ...inputCss, width: 190 }} />
          </Field>
          <Btn type="submit" size="sm" disabled={saving || selectedTargets.size === 0}>{saving ? '…' : 'Add Schedule'}</Btn>
        </div>
      </form>
    </div>
  );
}

// ── Stats inline ──────────────────────────────────────────────────────────────
function StatsInline({ stats }: { stats: PromotionStats }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 11, color: C.muted, marginTop: 3, flexWrap: 'wrap' }}>
      <span>✅ {stats.total_sent} sent</span>
      {stats.total_failed > 0 && <span style={{ color: '#ef4444' }}>❌ {stats.total_failed} failed</span>}
      <span>📡 {stats.unique_channels} dest</span>
      {stats.last_sent_at && <span>{new Date(stats.last_sent_at).toLocaleDateString()}</span>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [targets, setTargets] = useState<BroadcastTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [sendNow, setSendNow] = useState<Promotion | null>(null);
  const [creating, setCreating] = useState(false);
  const [logs, setLogs] = useState<PromotionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedLogPromo, setSelectedLogPromo] = useState<string>('');
  const [statsMap, setStatsMap] = useState<Record<string, PromotionStats>>({});
  const [globalStats, setGlobalStats] = useState<GlobalPromotionStats | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'info' | 'error'; msg: string } | null>(null);

  function flash(type: 'info' | 'error', msg: string) {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [promos, tgts, gStats] = await Promise.all([
        listPromotions(),
        listBroadcastTargets(),
        getGlobalPromotionStats().catch(() => null),
      ]);
      setPromotions(promos);
      setTargets(tgts);
      if (gStats) setGlobalStats(gStats);
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }, []);

  async function loadLogs(id?: string) {
    setLogsLoading(true);
    setLogs(await getPromotionLogs(id, 200).catch(() => []));
    setLogsLoading(false);
  }

  async function loadStats(promo: Promotion) {
    const stats = await getPromotionStats(promo.id).catch(() => null);
    if (stats) setStatsMap(prev => ({ ...prev, [promo.id]: stats }));
  }

  useEffect(() => { void load(); void loadLogs(); }, [load]);

  useEffect(() => {
    if (expanded) {
      const p = promotions.find(x => x.id === expanded);
      if (p && !statsMap[p.id]) void loadStats(p);
    }
  }, [expanded]);

  async function handleToggleStatus(p: Promotion) {
    const next: PromotionStatus = p.status === 'active' ? 'inactive' : 'active';
    await setPromotionStatus(p.id, next);
    void load();
  }

  async function handleDuplicate(p: Promotion) {
    setDuplicating(p.id);
    try {
      await duplicatePromotion(p.id);
      flash('info', `"${p.title}" duplicated`);
      void load();
    } catch { flash('error', 'Duplicate failed'); }
    finally { setDuplicating(null); }
  }

  async function handleRetry(p: Promotion) {
    setRetrying(p.id);
    try {
      const res = await retryFailedDeliveries(p.id);
      flash('info', `Retry: ${res.sent} sent, ${res.failed} failed`);
      void loadLogs(selectedLogPromo || undefined);
    } catch (err) { flash('error', (err as Error).message); }
    finally { setRetrying(null); }
  }

  const activeCount = promotions.filter(p => p.status === 'active').length;

  return (
    <div className="fade-in">
      <PageHeader title="Promotions" />
      {error && <Alert type="error">{error}</Alert>}
      {feedback && <Alert type={feedback.type}>{feedback.msg}</Alert>}

      {/* KPIs */}
      <div className="summary-grid">
        <KpiCard icon="promotions" label="Total"     value={promotions.length}               delta="All"  tone="indigo"  trend={[8,12,15,18,20,23,25]} />
        <KpiCard icon="trend"      label="Active"    value={activeCount}                      delta="+5%"  tone="emerald" trend={[10,12,14,16,18,21,23]} />
        <KpiCard icon="ticket"     label="Delivered" value={globalStats?.totalSent ?? 0}     delta="Total" tone="cyan"   trend={[18,24,21,30,26,35,42]} />
        <KpiCard icon="spark"      label="Targets"   value={targets.filter(t=>t.is_active).length} delta="Active" tone="amber" trend={[1,2,2,3,3,4,4]} />
      </div>

      {/* Broadcast Targets */}
      <TargetsManager targets={targets} onChanged={load} />

      {/* Promotions list */}
      <Card style={{ marginBottom: 20 }}>
        <CardHeader
          title="Promotions"
          subtitle="Manage content, schedules, and delivery"
          action={<Btn size="sm" onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : '+ New Promotion'}</Btn>}
        />

        {creating && (
          <div style={{ padding: '16px', marginBottom: 12, background: 'var(--c-bg)', borderRadius: 12, border: '1px solid var(--c-border)' }}>
            <div style={{ fontWeight: 600, color: 'var(--c-text)', marginBottom: 14 }}>New Promotion</div>
            <PromotionForm onSaved={() => { setCreating(false); void load(); }} onCancel={() => setCreating(false)} />
          </div>
        )}

        <Table>
          <thead>
            <tr><Th>Title</Th><Th>Type</Th><Th>Status</Th><Th>Created</Th><Th>Actions</Th></tr>
          </thead>
          <tbody>
            {loading ? <TrLoading cols={5} /> : promotions.length === 0 ? <TrEmpty cols={5} message="No promotions yet." /> :
              promotions.map(p => (
                <React.Fragment key={p.id}>
                  <tr>
                    <Td>
                      <span style={{ fontWeight: 600, color: 'var(--c-text)' }}>{p.title}</span>
                      {statsMap[p.id] && <StatsInline stats={statsMap[p.id]!} />}
                    </Td>
                    <Td><Badge variant="info">{p.content_type}</Badge></Td>
                    <Td><Badge variant={p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge></Td>
                    <Td muted>{new Date(p.created_at).toLocaleDateString()}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <Btn size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Btn>
                        <Btn size="sm" variant={p.status === 'active' ? 'warning' : 'success'} onClick={() => handleToggleStatus(p)}>
                          {p.status === 'active' ? 'Disable' : 'Enable'}
                        </Btn>
                        <Btn size="sm" variant="primary" disabled={p.status !== 'active'} onClick={() => setSendNow(p)}>
                          🚀 Send Now
                        </Btn>
                        <Btn size="sm" variant="ghost" onClick={() => handleDuplicate(p)} disabled={duplicating === p.id}>
                          {duplicating === p.id ? '…' : 'Copy'}
                        </Btn>
                        <Btn size="sm" variant="danger" onClick={() => handleRetry(p)} disabled={retrying === p.id}>
                          {retrying === p.id ? '…' : '↺ Retry'}
                        </Btn>
                        <Btn size="sm" variant="ghost" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                          {expanded === p.id ? '▲' : '▼'} Schedule
                        </Btn>
                      </div>
                    </Td>
                  </tr>
                  {expanded === p.id && (
                    <tr>
                      <td colSpan={5} style={{ padding: '16px 20px', background: 'var(--c-bg)', borderBottom: '1px solid var(--c-border)' }}>
                        <ScheduleSection promotionId={p.id} targets={targets} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
          </tbody>
        </Table>
      </Card>

      {/* Delivery Logs */}
      <Card>
        <CardHeader
          title="Delivery Logs"
          subtitle="Recent promotion send attempts"
          action={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={selectedLogPromo}
                onChange={e => { setSelectedLogPromo(e.target.value); void loadLogs(e.target.value || undefined); }}
                style={{ ...selectCss, width: 180, fontSize: 12 }}>
                <option value="">All Promotions</option>
                {promotions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <Btn size="sm" variant="ghost" onClick={() => loadLogs(selectedLogPromo || undefined)}>↻</Btn>
            </div>
          }
        />
        <Table>
          <thead>
            <tr><Th>Promotion</Th><Th>Destination</Th><Th>Status</Th><Th>Error</Th><Th>Sent At</Th></tr>
          </thead>
          <tbody>
            {logsLoading ? <TrLoading cols={5} /> : logs.length === 0 ? <TrEmpty cols={5} message="No logs yet." /> :
              logs.map(l => {
                const promo = promotions.find(p => p.id === l.promotion_id);
                const target = targets.find(t => t.channel_id === l.channel_id);
                return (
                  <tr key={l.id}>
                    <Td style={{ fontSize: 12 }}>{promo?.title ?? '—'}</Td>
                    <Td mono style={{ fontSize: 12 }}>
                      {target ? <span title={l.channel_id}>{target.type === 'bot_broadcast' ? '🤖' : '📢'} {target.name}</span> : l.channel_id}
                    </Td>
                    <Td><Badge variant={l.status === 'sent' ? 'success' : 'danger'}>{l.status}</Badge></Td>
                    <Td muted style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                      {l.error_message ?? '—'}
                    </Td>
                    <Td muted>{new Date(l.sent_at).toLocaleString()}</Td>
                  </tr>
                );
              })}
          </tbody>
        </Table>
      </Card>

      {/* Edit modal */}
      {editing && (
        <Modal title="Edit Promotion" onClose={() => setEditing(null)}>
          <PromotionForm initial={editing} onSaved={() => { setEditing(null); void load(); }} onCancel={() => setEditing(null)} />
        </Modal>
      )}

      {/* Send Now modal */}
      {sendNow && (
        <SendNowModal
          promotion={sendNow}
          targets={targets}
          onClose={() => { setSendNow(null); void loadLogs(selectedLogPromo || undefined); }}
        />
      )}
    </div>
  );
}
