import React, { useState, useEffect, useCallback } from 'react';
import type { CartelaDefinition } from '../lib/api';
import { getCartelas, getCartela, createCartela, updateCartela, deleteCartela } from '../lib/api';
import {
  C, Btn, Card, CardHeader, Alert, Field, KpiCard, PageHeader, inputCss,
} from '../components/ui';

const COLS = ['B', 'I', 'N', 'G', 'O'];

function CartelaGrid({ grid, compact = false }: { grid: number[]; compact?: boolean }) {
  const cellSize = compact ? 26 : 30;
  const labelSize = compact ? 9 : 11;

  return (
    <div
      style={{
        display: 'inline-grid',
        gridTemplateColumns: `repeat(5, ${cellSize}px)`,
        gap: 3,
        padding: compact ? 4 : 6,
        background: 'var(--c-bg)',
        border: '1px solid var(--c-border)',
        borderRadius: 12,
      }}
    >
      {COLS.map((c) => (
        <div key={c} style={{
          width: cellSize,
          height: compact ? 18 : 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: labelSize,
          fontWeight: 800,
          color: C.primary,
          borderRadius: 6,
          background: 'rgba(99,102,241,0.08)',
        }}>{c}</div>
      ))}
      {grid.map((val, i) => (
        <div key={i} style={{
          width: cellSize,
          height: compact ? 24 : 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: compact ? 10 : 11,
          fontWeight: 700,
          background: i === 12 ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'var(--c-bg-card)',
          color: i === 12 ? '#fff' : 'var(--c-text)',
          border: i === 12 ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--c-border)',
          borderRadius: 6,
          boxShadow: i === 12 ? '0 6px 14px rgba(99,102,241,0.18)' : 'none',
        }}>
          {i === 12 ? '★' : val}
        </div>
      ))}
    </div>
  );
}

function GridEditor({ value, onChange }: { value: number[]; onChange: (g: number[]) => void }) {
  function set(i: number, v: string) {
    const n = parseInt(v, 10);
    const next = [...value];
    next[i] = isNaN(n) ? 0 : n;
    onChange(next);
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
        {COLS.map((c) => (
          <div key={c} style={{ textAlign: 'center', fontSize: 11, fontWeight: 800, color: C.primary }}>{c}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
        {value.map((v, i) => (
          i === 12
            ? <div key={i} style={{
                minHeight: 42,
                borderRadius: 10,
                textAlign: 'center',
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 800,
                boxShadow: '0 8px 20px rgba(99,102,241,0.18)',
              }}>★</div>
            : <input
                key={i}
                type="number"
                value={v || ''}
                onChange={(e) => set(i, e.target.value)}
                style={{ ...inputCss, textAlign: 'center', padding: '8px 2px', minHeight: 42 }}
                min={1}
                max={99}
              />
        ))}
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'var(--c-bg-card)',
        border: '1px solid var(--c-border)',
        borderRadius: 18,
        padding: 24,
        width: '100%',
        maxWidth: 560,
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--c-text)' }}>{title}</span>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 22,
            color: 'var(--c-muted)', lineHeight: 1,
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CartelaForm({ initial, onSaved, onClose }: { initial?: CartelaDefinition; onSaved: () => void; onClose: () => void }) {
  const isEdit = !!initial;
  const emptyGrid = Array.from({ length: 25 }, (_, i) => (i === 12 ? 0 : 0));
  const [num, setNum] = useState(initial ? String(initial.cartela_number) : '');
  const [grid, setGrid] = useState<number[]>(initial?.grid ?? emptyGrid);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(num, 10);
    if (!isEdit && (isNaN(n) || n < 1)) {
      setError('Cartela number must be a positive integer');
      return;
    }
    if (grid.some((v, i) => i !== 12 && (isNaN(v) || v < 1))) {
      setError('All cells (except free space) must have a number ≥ 1');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isEdit) {
        await updateCartela(initial!.cartela_number, grid);
      } else {
        await createCartela(n, grid);
      }
      onSaved();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 18 }}>
      {error && <Alert type="error">{error}</Alert>}
      {!isEdit && (
        <Field label="Cartela Number">
          <input
            style={inputCss}
            type="number"
            min={1}
            max={9999}
            value={num}
            onChange={(e) => setNum(e.target.value)}
            required
          />
        </Field>
      )}

      <Field label="Grid layout (25 cells, center is free space)">
        <GridEditor value={grid} onChange={setGrid} />
      </Field>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Btn variant="outline" onClick={onClose}>Cancel</Btn>
        <Btn type="submit" disabled={loading}>{loading ? 'Saving…' : isEdit ? 'Update Cartela' : 'Create Cartela'}</Btn>
      </div>
    </form>
  );
}

function PreviewModal({ num, onClose, onEdit, onDelete }: { num: number; onClose: () => void; onEdit: (c: CartelaDefinition) => void; onDelete: (n: number) => void }) {
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
            <div style={{ width: '100%', borderTop: '1px solid var(--c-border)', paddingTop: 12 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--c-muted)' }}>
                <strong>Numbers:</strong> {cartela.grid.filter((_, i) => i !== 12).join(', ')}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 100 }}>
              <Btn 
                onClick={() => { onEdit(cartela); onClose(); }} 
                variant="outline"
                fullWidth
              >
                ✏️ Edit
              </Btn>
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <Btn 
                onClick={() => { onDelete(num); onClose(); }} 
                variant="danger"
                fullWidth
              >
                🗑️ Delete
              </Btn>
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <Btn 
                onClick={onClose}
                fullWidth
              >
                Close
              </Btn>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

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
    setLoading(true);
    setError(null);
    try {
      const res = await getCartelas(p, s || undefined);
      setCartelas(res.items);
      setTotal(res.total);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page, search); }, [page, search, load]);

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value);
    setPage(1);
  }

  async function handleDelete() {
    if (deleteTarget === null) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await deleteCartela(deleteTarget);
      setDeleteTarget(null);
      load(page, search);
    } catch (e: unknown) {
      setDeleteError((e as Error).message ?? 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  }

  const summaryCards = [
    { label: 'Total cartelas', value: total, color: '#6366f1', icon: '🎴' },
    { label: 'Page size', value: pageSize, color: '#22c55e', icon: '📦' },
    { label: 'Displayed', value: cartelas.length, color: '#3b82f6', icon: '👁️' },
    { label: 'Free center', value: '★', color: '#f59e0b', icon: '🎯' },
  ];

  return (
    <div className="fade-in">
      <PageHeader title="Cartelas" action={<Btn onClick={() => setShowCreate(true)}>+ New Cartela</Btn>} />

      <div className="summary-grid">
        <KpiCard icon="cartelas" label="Total cartelas" value={total} delta="Catalog" tone="indigo" trend={[20, 30, 35, 42, 44, 48, 54]} />
        <KpiCard icon="ticket" label="Page size" value={pageSize} delta="fixed" tone="emerald" trend={[18, 22, 28, 32, 36, 40, 42]} />
        <KpiCard icon="dashboard" label="Displayed" value={cartelas.length} delta="Visible" tone="cyan" trend={[12, 18, 19, 24, 28, 29, 30]} />
        <KpiCard icon="spark" label="Free center" value={"★"} delta="Always" tone="amber" trend={[10, 14, 15, 16, 18, 20, 24]} />
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <Card>
        <CardHeader
          title="Cartela Grid"
          subtitle="Click on any cartela number to preview and manage (Edit/Delete)"
          action={<div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-muted)' }}>{total} total</div>}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 320 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14 }}>🔎</span>
            <input
              style={{ ...inputCss, paddingLeft: 36 }}
              placeholder="Search by number…"
              value={search}
              onChange={handleSearch}
            />
          </div>

          {totalPages > 1 && (
            <div style={{ fontSize: 12, color: 'var(--c-muted)', fontWeight: 600 }}>
              Page {page} of {totalPages}
            </div>
          )}
        </div>

        {/* Flexible grid of cartela numbers */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--c-muted)' }}>Loading…</div>
        ) : cartelas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--c-muted)' }}>No cartelas found</div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}>
            {cartelas.map((c) => (
              <div
                key={c.cartela_number}
                onClick={() => setPreviewNum(c.cartela_number)}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: '2px solid var(--c-border)',
                  background: 'var(--c-bg-card)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 800,
                  color: 'var(--c-text)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'center',
                  minHeight: 70,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#6366f1';
                  e.currentTarget.style.background = 'rgba(99,102,241,0.08)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(99,102,241,0.14)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--c-border)';
                  e.currentTarget.style.background = 'var(--c-bg-card)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {c.cartela_number}
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '18px 0 0' }}>
            <Btn size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</Btn>
            <Btn size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</Btn>
          </div>
        )}
      </Card>

      {/* Preview modal with CRUD operations */}
      {previewNum !== null && (
        <PreviewModal
          num={previewNum}
          onClose={() => setPreviewNum(null)}
          onEdit={(c) => setEditCartela(c)}
          onDelete={(n) => { setDeleteTarget(n); setDeleteError(null); }}
        />
      )}

      {/* Edit modal */}
      {editCartela && (
        <Modal title={`Edit Cartela #${editCartela.cartela_number}`} onClose={() => setEditCartela(null)}>
          <CartelaForm
            initial={editCartela}
            onSaved={() => { setEditCartela(null); load(page, search); }}
            onClose={() => setEditCartela(null)}
          />
        </Modal>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal title="New Cartela" onClose={() => setShowCreate(false)}>
          <CartelaForm
            onSaved={() => { setShowCreate(false); load(1, ''); setPage(1); setSearch(''); }}
            onClose={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {/* Delete confirm modal */}
      {deleteTarget !== null && (
        <Modal title="Delete Cartela" onClose={() => setDeleteTarget(null)}>
          <p style={{ color: 'var(--c-text)', marginBottom: 16 }}>
            Are you sure you want to delete cartela <strong>#{deleteTarget}</strong>? This cannot be undone.
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
