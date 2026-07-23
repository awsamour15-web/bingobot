import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHistory } from '../lib/api';
import type { HistoryEntry, PaginatedResponse } from '@beteseb/shared';

const RESULT_COLORS: Record<string, string> = {
  win: '#065f46',
  loss: '#7f1d1d',
  void: '#78350f',
  cancelled: '#374151',
};

const RESULT_LABELS: Record<string, string> = {
  win: '🏆 አሸነፍ',
  loss: '😔 አልተሳካም',
  void: '↩ ተሰርዟል',
  cancelled: '✕ ተሰረዘ',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('am-ET', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryScreen() {
  const navigate = useNavigate();
  const [data, setData] = useState<PaginatedResponse<HistoryEntry> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getHistory(p);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [page, load]);

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div>
      <div style={{ background: '#4f46e5', color: '#fff', padding: '20px 16px 16px', fontSize: 18, fontWeight: 700 }}>
        📋 የጨዋታ ታሪክ
      </div>

      {loading && (
        <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>Loading…</div>
      )}

      {error && (
        <div style={{ padding: 24, textAlign: 'center', color: '#e53e3e' }}>{error}</div>
      )}

      {!loading && !error && data?.items.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>
          ገና ምንም ጨዋታ አልተጫወቱም።
        </div>
      )}

      {!loading && data && data.items.map((entry) => (
        <div
          key={entry.roundId}
          onClick={() => navigate(`/history/${entry.roundId}`)}
          style={{
            background: '#fff',
            margin: '10px 16px',
            borderRadius: 12,
            padding: '14px 16px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.07)',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              ጨዋታ #{entry.gameId.slice(-6).toUpperCase()}
            </div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 3 }}>
              {formatDate(entry.date)} · ካርቴላ #{entry.cartelaNumber}
            </div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
              ዋጋ: {entry.stake} ብር
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              background: RESULT_COLORS[entry.result] ?? '#374151',
              color: '#fff',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 4,
            }}>
              {RESULT_LABELS[entry.result] ?? entry.result}
            </div>
            {entry.prize > 0 && (
              <div style={{ fontSize: 14, fontWeight: 700, color: '#065f46' }}>
                +{entry.prize} ብር
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Pagination */}
      {!loading && data && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: '16px 0' }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: page <= 1 ? 'default' : 'pointer', color: '#4f46e5' }}
          >
            ‹ ቀዳሚ
          </button>
          <span style={{ alignSelf: 'center', fontSize: 13, color: '#888' }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: page >= totalPages ? 'default' : 'pointer', color: '#4f46e5' }}
          >
            ቀጣይ ›
          </button>
        </div>
      )}
    </div>
  );
}
