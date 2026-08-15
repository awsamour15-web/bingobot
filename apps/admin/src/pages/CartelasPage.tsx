import React, { useState, useEffect, useCallback } from 'react';
import type { CartelaDefinition } from '../lib/api';
import { getCartelas, getCartela, createCartela, updateCartela, deleteCartela } from '../lib/api';
import {
  C, Btn, Card, CardHeader, Alert, Field, KpiCard, PageHeader, inputCss,
} from '../components/ui';

const COLS = ['B', 'I', 'N', 'G', 'O'];

// ── Cartela grid display ──────────────────────────────────────────────────────
function CartelaGrid({ grid }: { grid: number[] }) {
  return (
    <div style={{
      display: 'inline-grid',
      gridTemplateColumns: 'repeat(5, 34px)',
      gap: 3,
    }}>
      {COLS.map((c) => (
        <div key={c} style={{
          height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 800, color: '#818cf8',
          background: 'rgba(99,102,241,0.1)', borderRadius: 4,
        }}>
          {c}
        </div>
      ))}
      {grid.map((val, i) => (
        <div key={i} style={{
          height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700,
          background: i === 12
            ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
            : 'var(--c-bg-card)',
          color: i === 12 ? '#fff' : 'var(--c-text)',
          border: i === 12 ? 'none' : '1px solid var(--c-border)',
          borderRadius: 5,
          boxShadow: i === 12 ? '0 4px 10px rgba(99,102,241,0.3)' : 'none',
        }}>
          {i === 12 ? '★' : val}
        </div>
      ))}
    </div>
  );
}

// ── Grid editor ───────────────────────────────────────────────────────────────
function GridEditor({ value, onChange }: { value: number[]; onChange: (g: number[]) => void }) {
  function set(i: number, v: string) {
    const n = parseInt(v, 10);
    const next = [...value];
    next[i] = isNaN(n) ? 0 : n;
    onChange(next);
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
        {COLS.map((c) => (
          <div key={c} style={{
            textAlign: 'center', fontSize: 11, fontWeight: 800,
            color: '#818cf8', padding: '4px 0',
          }}>
            {c}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
        {value.map((v, i) => (
          i === 12
            ? <div key={i} style={{
                borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 800, minHeight: 44,
              }}>
                ★
              </div>
            : <input
                key={i}
                type="number"
                value={v || ''}
                onChange={(e) => set(i, e.target.value)}
                style={{ ...inputCss, textAlign: 'center', padding: '8px 4px', minHeight: 44 }}
                min={1} max={99}
              />
        ))}
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, padding: 20,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--c-bg-card)', border: '1px solid var(--c-border)',
        borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--c-text)' }}>{title}</span>
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

// ── Cartela form ──────────────────────────────────────────────────────────────
function CartelaForm({ initial, onSaved, onClose }: {
  initial?: CartelaDefinition; onSaved: () => void; onClose: () => void;
}) {
  const isEdit = !!initial;
  const empty = Array.from({ length: 25 }, () => 0);
  const [num, setNum] = useState(initial ? String(initial.cartela_number) : '');
  const [grid, setGrid] = useState<number[]>(initial?.grid ?? empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(num, 10);
    if (!isEdit && (isNaN(n) || n < 1)) { setError('Cartela number must be a positive integer'); return; }
    if (grid.some((v, i) => i !== 12 && (isNaN(v) || v < 1))) {
      setError('All cells (except free space) must have a number ≥ 1'); return;
    }
    setLoading(true); setError(null);
    try {
      if (isEdit) { await updateCartela(initial!.cartela_number, grid); }
      else { await createCartela(n, grid); }
      onSaved();
    } catch (err: unknown) { setError((err as Error).message ?? 'Failed to save'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 18 }}>
      {error && <Alert type="error">{error}</Alert>}
      {!isEdit && (
        <Field label="Cartela Number">
          <input style={inputCss} type="number" min={1} max={9999}
            value={num} onChange={(e) => setNum(e.target.value)} required />
        </Field>
      )}
      <Field label="Grid (25 cells, center is ★ free space)">
        <GridEditor value={grid} onChange={setGrid} />
      </Field>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="outline" onClick={onClose}>Cancel</Btn>
        <Btn type="submit" disabled={loading}>
          {loading ? 'Saving…' : isEdit ? 'Update Cartela' : 'Create Cartela'}
        </Btn>
      </div>
    </form>
  );
}

// ── Preview modal ─────────────────────────────────────────────────────────────
function PreviewModal({ num, onClose, onEdit, onDelete }: {
  num: number; onClose: () => void;
  onEdit: (c: CartelaDefinition) => void; onDelete: (n: number) => void;
}) {
  const [cartela, setCartela] = useState<CartelaDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCartela(num)
      .then(setCartela)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [num]);

  return (
    <Modal title={`Cartela #${num}`} onClose={onClose}>
      {loading && <p style={{ color: 'var(--c-muted)' }}>Loading…</p>}
      {error && <Alert type="error">{error}</Alert>}
      {cartela && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <CartelaGrid grid={cartela.grid} />
            <p style={{ margin: 0, fontSize: 11, color: 'var(--c-muted)', textAlign: 'center' }}>
              {cartela.grid.filter((_, i) => i !== 12).join(' · ')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={() => { onEdit(cartela); onClose(); }} variant="outline" fullWidth>✏️ Edit</Btn>
            <Btn onClick={() => { onDelete(num); onClose(); }} variant="danger" fullWidth>🗑️ Delete</Btn>
            <Btn onClick={onClose} fullWidth>Close</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function CartelasPage() {
  const [cartelas, setCartelas] = useState<CartelaDefinition[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewNum, setPreviewNum] = useState<number | null>(null);
  const [editCartela, setEditCartela] = useState<CartelaDefinition | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const pageSize = 100;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async (p: number, s: string) => {
    setLoading(true); setError(null);
    try {
      const res = await getCartelas(p, s || undefined);
      setCartelas(res.items); setTotal(res.total);
    } catch (e: unknown) { setError((e as Error).message ?? 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(page, search); }, [page, search, load]);

  async function handleDelete() {
    if (deleteTarget === null) return;
    setDeleteLoading(true); setDeleteError(null);
    try { await deleteCartela(deleteTarget); setDeleteTarget(null); load(page, search); }
    catch (e: unknown) { setDeleteError((e as Error).message ?? 'Delete failed'); }
    finally { setDeleteLoading(false); }
  }

  return (
    <div className="fade-in">
      <PageHeader title="Cartelas" action={<Btn onClick={() => setShowCreate(true)}>+ New Cartela</Btn>} />

      <div className="summary-grid">
        <KpiCard icon="cartelas" label="Total"     value={total}           delta="Catalog" tone="indigo"  trend={[20,30,35,42,44,48,54]} />
        <KpiCard icon="ticket"   label="Page size" value={pageSize}        delta="fixed"   tone="emerald" trend={[18,22,28,32,36,40,42]} />
        <KpiCard icon="dashboard"label="Shown"     value={cartelas.length} delta="Current" tone="cyan"    trend={[12,18,19,24,28,29,30]} />
        <KpiCard icon="spark"    label="Free"      value="★"               delta="Center"  tone="amber"   trend={[10,14,15,16,18,20,24]} />
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <Card>
        <CardHeader
          title="Cartela Grid"
          subtitle="Click any number to preview, edit, or delete"
          action={<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>{total} total</span>}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 280 }}>
            <span style={{
              position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
              fontSize: 13, pointerEvents: 'none', color: 'var(--c-muted)',
            }}>🔎</span>
            <input
              style={{ ...inputCss, paddingLeft: 34 }}
              placeholder="Search by number…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          {totalPages > 1 && (
            <span style={{ fontSize: 12, color: 'var(--c-muted)', fontWeight: 600 }}>
              Page {page} / {totalPages}
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--c-muted)' }}>Loading…</div>
        ) : cartelas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--c-muted)' }}>No cartelas found</div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))',
            gap: 8, marginBottom: 20,
          }}>
            {cartelas.map((c) => (
              <button
                key={c.cartela_number}
                onClick={() => setPreviewNum(c.cartela_number)}
                style={{
                  padding: 0, height: 58, borderRadius: 10,
                  border: '1px solid var(--c-border)',
                  background: 'var(--c-bg-card)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 800, color: 'var(--c-text)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#6366f1';
                  e.currentTarget.style.background = 'rgba(99,102,241,0.1)';
                  e.currentTarget.style.color = '#a5b4fc';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 14px rgba(99,102,241,0.2)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--c-border)';
                  e.currentTarget.style.background = 'var(--c-bg-card)';
                  e.currentTarget.style.color = 'var(--c-text)';
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {c.cartela_number}
              </button>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <Btn size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Btn>
            <Btn size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</Btn>
          </div>
        )}
      </Card>

      {previewNum !== null && (
        <PreviewModal
          num={previewNum}
          onClose={() => setPreviewNum(null)}
          onEdit={c => setEditCartela(c)}
          onDelete={n => { setDeleteTarget(n); setDeleteError(null); }}
        />
      )}

      {editCartela && (
        <Modal title={`Edit Cartela #${editCartela.cartela_number}`} onClose={() => setEditCartela(null)}>
          <CartelaForm
            initial={editCartela}
            onSaved={() => { setEditCartela(null); load(page, search); }}
            onClose={() => setEditCartela(null)}
          />
        </Modal>
      )}

      {showCreate && (
        <Modal title="New Cartela" onClose={() => setShowCreate(false)}>
          <CartelaForm
            onSaved={() => { setShowCreate(false); load(1, ''); setPage(1); setSearch(''); }}
            onClose={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {deleteTarget !== null && (
        <Modal title="Delete Cartela" onClose={() => setDeleteTarget(null)}>
          <p style={{ color: 'var(--c-text)', marginBottom: 16, lineHeight: 1.5 }}>
            Delete cartela <strong>#{deleteTarget}</strong>? This cannot be undone.
          </p>
          {deleteError && <Alert type="error">{deleteError}</Alert>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Btn>
            <Btn variant="danger" disabled={deleteLoading} onClick={handleDelete}>
              {deleteLoading ? 'Deleting…' : 'Delete'}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
