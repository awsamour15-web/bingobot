import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHistory } from '../lib/api';
import type { HistoryEntry, PaginatedResponse } from '@fidel/shared';

const C = {
  bg: '#0a0e1a', surface: '#0d1b2e', surface2: '#112240',
  border: 'rgba(255,255,255,0.07)', amber: '#f59e0b',
  text: '#f1f5f9', muted: '#64748b', dim: '#475569',
  green: '#34d399', red: '#f87171',
};

const RESULT: Record<string, { label: string; color: string; bg: string }> = {
  win:       { label: '🏆 Won',      color: C.green,  bg: 'rgba(52,211,153,0.12)' },
  loss:      { label: '😔 Lost',     color: C.red,    bg: 'rgba(248,113,113,0.12)' },
  void:      { label: '↩ Voided',   color: C.amber,  bg: 'rgba(245,158,11,0.12)' },
  cancelled: { label: '✕ Cancelled', color: C.muted,  bg: 'rgba(100,116,139,0.12)' },
};

export default function HistoryScreen() {
  const navigate = useNavigate();
  const [data, setData] = useState<PaginatedResponse<HistoryEntry> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true); setError(null);
    try { setData(await getHistory(p)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(page); }, [page, load]);

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', paddingBottom: 80 }}>

      {/* ── Header ── */}
      <div style={{ background: `linear-gradient(135deg, ${C.surface2}, ${C.surface})`, padding: '20px 20px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>My Games</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: C.text }}>Game History</div>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Loading…</div>}
      {error && <div style={{ padding: 24, textAlign: 'center', color: C.red }}>{error}</div>}

      {!loading && !error && data?.items.length === 0 && (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: C.muted }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🎮</div>
          No games played yet.
        </div>
      )}

      <div style={{ padding: '12px 14px' }}>
        {!loading && data?.items.map(entry => {
          const r = RESULT[entry.result] ?? RESULT.cancelled!;
          return (
            <div key={entry.roundId}
              onClick={() => navigate(`/history/${entry.roundId}`)}
              style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 16, padding: '14px 16px', marginBottom: 10,
                cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: C.text, marginBottom: 4 }}>
                  Game #{entry.gameId.slice(-6).toUpperCase()}
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>
                  Cartela #{entry.cartelaNumber} · {entry.stake} Birr stake
                </div>
                <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                  {new Date(entry.date).toLocaleDateString('en-ET', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                <div style={{ background: r.bg, color: r.color, borderRadius: 10, padding: '5px 10px', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  {r.label}
                </div>
                {entry.prize > 0 && (
                  <div style={{ fontSize: 14, fontWeight: 900, color: C.green }}>+{entry.prize} Birr</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!loading && data && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: '8px 0 16px' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            style={{ padding: '8px 20px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: page <= 1 ? C.dim : C.amber, cursor: page <= 1 ? 'default' : 'pointer', fontWeight: 700 }}>
            ‹ Prev
          </button>
          <span style={{ alignSelf: 'center', fontSize: 13, color: C.muted }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            style={{ padding: '8px 20px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: page >= totalPages ? C.dim : C.amber, cursor: page >= totalPages ? 'default' : 'pointer', fontWeight: 700 }}>
            Next ›
          </button>
        </div>
      )}
    </div>
  );
}
