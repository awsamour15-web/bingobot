import React, { useEffect, useState } from 'react';
import {
  C, Btn, Badge, Card, CardHeader, Table, Th, Td, TrEmpty, TrLoading,
  Alert, Field, KpiCard, PageHeader, inputCss, selectCss,
} from '../components/ui';
import type { Promotion, PromotionSchedule, PromotionLog, PromotionContentType, PromotionStatus } from '../lib/api';
import {
  listPromotions, createPromotion, updatePromotion, setPromotionStatus,
  listSchedules, createSchedule, cancelSchedule, getPromotionLogs,
} from '../lib/api';

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, padding: 20,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--c-bg-card)', border: '1px solid var(--c-border)',
        borderRadius: 16, padding: 28, width: '100%', maxWidth: 500,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>{title}</h3>
          <button onClick={onClose} style={{
            background: 'rgba(148,163,184,0.1)', border: '1px solid var(--c-border)',
            borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
            color: 'var(--c-muted)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Create form ────────────────────────────────────────────────────────────────
function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [contentType, setContentType] = useState<PromotionContentType>('text');
  const [textContent, setTextContent] = useState('');
  const [mediaFileId, setMediaFileId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await createPromotion({
        title, content_type: contentType,
        ...(contentType === 'text' ? { text_content: textContent } : { media_file_id: mediaFileId }),
      });
      setTitle(''); setTextContent(''); setMediaFileId('');
      onCreated();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHeader title="New Promotion" />
      {error && <Alert type="error">{error}</Alert>}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Title">
          <input value={title} onChange={e => setTitle(e.target.value)} required style={inputCss} placeholder="e.g. Weekend Bonus" />
        </Field>
        <Field label="Content Type">
          <select value={contentType} onChange={e => setContentType(e.target.value as PromotionContentType)} style={selectCss}>
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="gif">GIF</option>
          </select>
        </Field>
        {contentType === 'text' ? (
          <Field label="Message Text" hint="Max 4096 characters">
            <textarea value={textContent} onChange={e => setTextContent(e.target.value)}
              required maxLength={4096} rows={4}
              style={{ ...inputCss, resize: 'vertical' }}
              placeholder="Enter your promotion message..." />
            <span style={{ fontSize: 11, color: C.muted, textAlign: 'right' }}>{textContent.length}/4096</span>
          </Field>
        ) : (
          <Field label="Telegram File ID" hint="Send the file to the bot first to get its file_id">
            <input value={mediaFileId} onChange={e => setMediaFileId(e.target.value)} required style={inputCss} placeholder="AgACAgIAAxk..." />
          </Field>
        )}
        <Btn type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Promotion'}</Btn>
      </form>
    </Card>
  );
}

// ── Schedule section ──────────────────────────────────────────────────────────
function ScheduleSection({ promotionId }: { promotionId: string }) {
  const [schedules, setSchedules] = useState<PromotionSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelIds, setChannelIds] = useState('');
  const [frequency, setFrequency] = useState<'once'|'daily'|'weekly'|'monthly'>('once');
  const [sendAt, setSendAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setSchedules(await listSchedules(promotionId).catch(() => []));
    setLoading(false);
  }

  useEffect(() => { void load(); }, [promotionId]);

  async function handleAddSchedule(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await createSchedule(promotionId, {
        channel_ids: channelIds.split(',').map(s => s.trim()).filter(Boolean),
        frequency, send_at: new Date(sendAt).toISOString(),
      });
      setChannelIds(''); setSendAt('');
      void load();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', marginBottom: 10 }}>Schedules</div>
      <Table>
        <thead><tr><Th>Channels</Th><Th>Frequency</Th><Th>Send At</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
        <tbody>
          {loading ? <TrLoading cols={5} /> : schedules.length === 0 ? <TrEmpty cols={5} message="No schedules yet." /> :
           schedules.map(s => (
            <tr key={s.id}>
              <Td>{s.channel_ids.join(', ')}</Td>
              <Td>{s.frequency}</Td>
              <Td muted>{new Date(s.send_at).toLocaleString()}</Td>
              <Td><Badge variant={s.is_active ? 'success' : 'neutral'}>{s.is_active ? 'active' : 'cancelled'}</Badge></Td>
              <Td>{s.is_active && <Btn size="sm" variant="danger" onClick={() => cancelSchedule(s.id).then(load)}>Cancel</Btn>}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {error && <Alert type="error">{error}</Alert>}
      <form onSubmit={handleAddSchedule} style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Channel IDs (comma-separated)">
          <input value={channelIds} onChange={e => setChannelIds(e.target.value)} required
            style={{ ...inputCss, width: 220 }} placeholder="-1001234567890" />
        </Field>
        <Field label="Frequency">
          <select value={frequency} onChange={e => setFrequency(e.target.value as typeof frequency)} style={{ ...selectCss, width: 110 }}>
            <option value="once">Once</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </Field>
        <Field label="Send At">
          <input type="datetime-local" value={sendAt} onChange={e => setSendAt(e.target.value)}
            required style={{ ...inputCss, width: 190 }} />
        </Field>
        <Btn type="submit" disabled={saving} size="sm">{saving ? '…' : 'Add Schedule'}</Btn>
      </form>
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({ promotion, onClose, onSaved }: { promotion: Promotion; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(promotion.title);
  const [textContent, setTextContent] = useState(promotion.text_content ?? '');
  const [mediaFileId, setMediaFileId] = useState(promotion.media_file_id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await updatePromotion(promotion.id, {
        title,
        ...(promotion.content_type === 'text' ? { text_content: textContent } : { media_file_id: mediaFileId }),
      });
      onSaved(); onClose();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="Edit Promotion" onClose={onClose}>
      {error && <Alert type="error">{error}</Alert>}
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Title">
          <input value={title} onChange={e => setTitle(e.target.value)} required style={inputCss} />
        </Field>
        {promotion.content_type === 'text' ? (
          <Field label="Message Text">
            <textarea value={textContent} onChange={e => setTextContent(e.target.value)}
              rows={4} maxLength={4096} style={{ ...inputCss, resize: 'vertical' }} />
          </Field>
        ) : (
          <Field label="Telegram File ID">
            <input value={mediaFileId} onChange={e => setMediaFileId(e.target.value)} style={inputCss} />
          </Field>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Btn>
        </div>
      </form>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [logs, setLogs] = useState<PromotionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedLogPromo, setSelectedLogPromo] = useState<string>('');

  async function load() {
    setLoading(true); setError(null);
    try { setPromotions(await listPromotions()); }
    catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  async function loadLogs(id?: string) {
    setLogsLoading(true);
    setLogs(await getPromotionLogs(id).catch(() => []));
    setLogsLoading(false);
  }

  useEffect(() => { void load(); void loadLogs(); }, []);

  async function handleToggleStatus(p: Promotion) {
    const next: PromotionStatus = p.status === 'active' ? 'inactive' : 'active';
    await setPromotionStatus(p.id, next);
    void load();
  }

  return (
    <div className="fade-in">
      <PageHeader title="Promotions" />
      {error && <Alert type="error">{error}</Alert>}

      <div className="summary-grid">
        <KpiCard icon="promotions" label="Total"    value={promotions.length}                             delta="Live"  tone="indigo"  trend={[8,12,15,18,20,23,25]} />
        <KpiCard icon="trend"      label="Active"   value={promotions.filter(p=>p.status==='active').length} delta="+5%" tone="emerald" trend={[10,12,14,16,18,21,23]} />
        <KpiCard icon="spark"      label="Inactive" value={promotions.filter(p=>p.status!=='active').length} delta="Low" tone="amber"   trend={[4,5,4,3,5,4,3]} />
        <KpiCard icon="ticket"     label="Logs"     value={logs.length}                                   delta="24h"  tone="cyan"    trend={[18,24,21,30,26,35,42]} />
      </div>

      <CreateForm onCreated={load} />

      <Card style={{ marginBottom: 20 }}>
        <CardHeader title="All Promotions" subtitle="Manage promotion content and schedules" />
        <Table>
          <thead><tr><Th>Title</Th><Th>Type</Th><Th>Status</Th><Th>Created</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {loading ? <TrLoading cols={5} /> : promotions.length === 0 ? <TrEmpty cols={5} message="No promotions yet." /> :
             promotions.map(p => (
              <React.Fragment key={p.id}>
                <tr>
                  <Td><span style={{ fontWeight: 600 }}>{p.title}</span></Td>
                  <Td><Badge variant="info">{p.content_type}</Badge></Td>
                  <Td><Badge variant={p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge></Td>
                  <Td muted>{new Date(p.created_at).toLocaleDateString()}</Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Btn size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Btn>
                      <Btn size="sm" variant={p.status === 'active' ? 'warning' : 'success'} onClick={() => handleToggleStatus(p)}>
                        {p.status === 'active' ? 'Disable' : 'Enable'}
                      </Btn>
                      <Btn size="sm" variant="ghost" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                        {expanded === p.id ? '▲' : '▼'} Schedules
                      </Btn>
                    </div>
                  </Td>
                </tr>
                {expanded === p.id && (
                  <tr>
                    <td colSpan={5} style={{ padding: '14px 18px', background: 'var(--c-bg)', borderBottom: '1px solid var(--c-border)' }}>
                      <ScheduleSection promotionId={p.id} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </Table>
      </Card>

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
          <thead><tr><Th>Channel</Th><Th>Status</Th><Th>Error</Th><Th>Sent At</Th></tr></thead>
          <tbody>
            {logsLoading ? <TrLoading cols={4} /> : logs.length === 0 ? <TrEmpty cols={4} message="No logs yet." /> :
             logs.map(l => (
              <tr key={l.id}>
                <Td mono>{l.channel_id}</Td>
                <Td><Badge variant={l.status === 'sent' ? 'success' : 'danger'}>{l.status}</Badge></Td>
                <Td muted style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.error_message ?? '—'}
                </Td>
                <Td muted>{new Date(l.sent_at).toLocaleString()}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {editing && <EditModal promotion={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}
