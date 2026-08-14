import React, { useState, useEffect, useCallback } from 'react';
import type { CartelaDefinition } from '../lib/api';
import { getCartelas, getCartela, createCartela, updateCartela, deleteCartela } from '../lib/api';
import {
  C, Btn, Card, CardHeader, Table, Th, Td,
  TrEmpty, TrLoading, Alert, Field, PageHeader, inputCss, StatCard,
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
          <p style={{ margin: 0, fontSize: 12, color: 'var(--c-muted)', textAlign: 'center' }}>
            Numbers: {cartela.grid.filter((_, i) => i !== 12).join(', ')}
          </p>
        </div>
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

  const [viewNum, setViewNum] = useState<number | null>(null);
  const [editCartela, setEditCartela] = useState<CartelaDefinition | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const pageSize = 50;
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
    { label: 'Visible rows', value: cartelas.length, color: '#3b82f6', icon: '📋' },
    { label: 'Free center', value: '★', color: '#f59e0b', icon: '🎯' },
  ];

  return (
    <div className="fade-in">
      <PageHeader title="Cartelas" action={<Btn onClick={() => setShowCreate(true)}>+ New Cartela</Btn>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {summaryCards.map((card) => (
          <StatCard key={card.label} icon={card.icon} label={card.label} value={card.value} color={card.color} />
        ))}
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <Card>
        <CardHeader
          title="Cartela library"
          subtitle="Manage bingo templates and preview layouts before publishing"
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

        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Preview</Th>
              <Th>Numbers</Th>
              <Th right>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <TrLoading cols={4} />}
            {!loading && cartelas.length === 0 && <TrEmpty cols={4} message="No cartelas found" />}
            {!loading && cartelas.map((c) => (
              <tr key={c.cartela_number}>
                <Td style={{ fontWeight: 800, color: 'var(--c-text)' }}>{c.cartela_number}</Td>
                <Td>
                  <CartelaGrid grid={c.grid} compact />
                </Td>
                <Td style={{ fontSize: 12, color: 'var(--c-muted)', lineHeight: 1.6 }}>
                  {c.grid.filter((_, i) => i !== 12).slice(0, 10).join(', ')}
                  {c.grid.filter((_, i) => i !== 12).length > 10 ? '…' : ''}
                </Td>
                <Td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <Btn size="sm" variant="ghost" onClick={() => setViewNum(c.cartela_number)}>View</Btn>
                    <Btn size="sm" variant="outline" onClick={() => setEditCartela(c)}>Edit</Btn>
                    <Btn size="sm" variant="danger" onClick={() => { setDeleteTarget(c.cartela_number); setDeleteError(null); }}>Delete</Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '18px 0 6px' }}>
            <Btn size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</Btn>
            <Btn size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</Btn>
          </div>
        )}
      </Card>

      {viewNum !== null && <ViewModal num={viewNum} onClose={() => setViewNum(null)} />}

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
