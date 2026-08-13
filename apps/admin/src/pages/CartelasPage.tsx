import React, { useState, useEffect, useCallback } from 'react';
import type { CartelaDefinition } from '../lib/api';
import { getCartelas, getCartela, createCartela, updateCartela, deleteCartela } from '../lib/api';
import {
  C, Btn, Card, CardHeader, Table, Th, Td,
  TrEmpty, TrLoading, Alert, Field, PageHeader, inputCss,
} from '../components/ui';

// ─── Bingo grid column labels ─────────────────────────────────────────────────
const COLS = ['B', 'I', 'N', 'G', 'O'];

// ─── Grid display ─────────────────────────────────────────────────────────────
function CartelaGrid({ grid }: { grid: number[] }) {
  return (
    <div style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(5, 32px)', gap: 2 }}>
      {COLS.map((c) => (
        <div key={c} style={{
          width: 32, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: C.primary, background: 'var(--c-bg)',
          borderRadius: 4,
        }}>{c}</div>
      ))}
      {grid.map((val, i) => (
        <div key={i} style={{
          width: 32, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 500,
          background: i === 12 ? C.primary : 'var(--c-bg-card)',
          color: i === 12 ? '#fff' : 'var(--c-text)',
          border: '1px solid var(--c-border)', borderRadius: 4,
        }}>
          {i === 12 ? '★' : val}
        </div>
      ))}
    </div>
  );
}

// ─── Grid editor — 25 number inputs ──────────────────────────────────────────
function GridEditor({ value, onChange }: { value: number[]; onChange: (g: number[]) => void }) {
  function set(i: number, v: string) {
    const n = parseInt(v, 10);
    const next = [...value];
    next[i] = isNaN(n) ? 0 : n;
    onChange(next);
  }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, marginBottom: 6 }}>
        {COLS.map((c) => (
          <div key={c} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: C.primary }}>{c}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
        {value.map((v, i) => (
          i === 12
            ? <div key={i} style={{
                ...inputCss, textAlign: 'center', background: C.primary,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, borderRadius: 6,
              }}>★</div>
            : <input
                key={i}
                type="number"
                value={v || ''}
                onChange={(e) => set(i, e.target.value)}
                style={{ ...inputCss, textAlign: 'center', padding: '6px 2px' }}
                min={1}
                max={99}
              />
        ))}
      </div>
    </div>
  );
}

// ─── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--c-bg-card)', border: '1px solid var(--c-border)', borderRadius: 12,
        padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--c-text)' }}>{title}</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 20,
            color: 'var(--c-muted)', lineHeight: 1,
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Create / Edit form ───────────────────────────────────────────────────────
function CartelaForm({
  initial, onSaved, onClose,
}: {
  initial?: CartelaDefinition;
  onSaved: () => void;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const emptyGrid = Array.from({ length: 25 }, (_, i) => (i === 12 ? 0 : 0));
  const [num, setNum] = useState(initial ? String(initial.cartela_number) : '');
  const [grid, setGrid] = useState<number[]>(initial?.grid ?? emptyGrid);
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
    <form onSubmit={handleSubmit}>
      {error && <Alert type="error">{error}</Alert>}
      {!isEdit && (
        <Field label="Cartela Number">
          <input
            style={inputCss}
            type="number" min={1} max={9999}
            value={num} onChange={(e) => setNum(e.target.value)}
            required
          />
        </Field>
      )}
      <Field label="Grid (25 cells, center = free space)">
        <GridEditor value={grid} onChange={setGrid} />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
        <Btn variant="outline" onClick={onClose}>Cancel</Btn>
        <Btn type="submit" disabled={loading}>{loading ? 'Saving…' : isEdit ? 'Update' : 'Create'}</Btn>
      </div>
    </form>
  );
}

// ─── View modal ───────────────────────────────────────────────────────────────
function ViewModal({ num, onClose }: { num: number; onClose: () => void }) {
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <CartelaGrid grid={cartela.grid} />
          <p style={{ fontSize: 12, color: 'var(--c-muted)' }}>Numbers: {cartela.grid.filter((_, i) => i !== 12).join(', ')}</p>
        </div>
      )}
    </Modal>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export function CartelasPage() {
  const [cartelas, setCartelas] = useState<CartelaDefinition[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewNum, setViewNum] = useState<number | null>(null);
  const [editCartela, setEditCartela] = useState<CartelaDefinition | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async (p: number, s: string) => {
    setLoading(true); setError(null);
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
    setDeleteLoading(true); setDeleteError(null);
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

  return (
    <div>
      <PageHeader title="Cartelas" action={<Btn onClick={() => setShowCreate(true)}>+ New Cartela</Btn>} />
      <p style={{ color: 'var(--c-muted)', fontSize: 13, marginBottom: 16, marginTop: -16 }}>{total} cartela definitions</p>

      {error && <Alert type="error">{error}</Alert>}

      <Card>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--c-border)' }}>
          <input
            style={{ ...inputCss, maxWidth: 260 }}
            placeholder="Search by number…"
            value={search}
            onChange={handleSearch}
          />
        </div>

        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Preview</Th>
              <Th>Numbers (first 10)</Th>
              <Th right>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <TrLoading cols={4} />}
            {!loading && cartelas.length === 0 && <TrEmpty cols={4} message="No cartelas found" />}
            {!loading && cartelas.map((c) => (
              <tr key={c.cartela_number}>
                <Td style={{ fontWeight: 600 }}>{c.cartela_number}</Td>
                <Td><CartelaGrid grid={c.grid} /></Td>
                <Td style={{ fontSize: 12, color: 'var(--c-muted)' }}>
                  {c.grid.filter((_, i) => i !== 12).slice(0, 10).join(', ')}…
                </Td>
                <Td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Btn size="sm" variant="ghost" onClick={() => setViewNum(c.cartela_number)}>View</Btn>
                    <Btn size="sm" variant="outline" onClick={() => setEditCartela(c)}>Edit</Btn>
                    <Btn size="sm" variant="danger" onClick={() => { setDeleteTarget(c.cartela_number); setDeleteError(null); }}>Delete</Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 16 }}>
            <Btn size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</Btn>
            <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--c-muted)' }}>
              Page {page} of {totalPages}
            </span>
            <Btn size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</Btn>
          </div>
        )}
      </Card>

      {/* View modal */}
      {viewNum !== null && <ViewModal num={viewNum} onClose={() => setViewNum(null)} />}

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
