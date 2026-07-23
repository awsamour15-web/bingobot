import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getHistoryDetail } from '../lib/api';
import type { HistoryDetail } from '@beteseb/shared';

const COLS = ['B', 'I', 'N', 'G', 'O'];

const RESULT_LABELS: Record<string, string> = {
  win: '🏆 አሸነፍ',
  loss: '😔 አልተሳካም',
  void: '↩ ተሰርዟል',
  cancelled: '✕ ተሰረዘ',
};

export default function HistoryDetailScreen() {
  const { roundId } = useParams<{ roundId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId) return;
    getHistoryDetail(roundId)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [roundId]);

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>Loading…</div>;
  }

  if (error || !detail) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#e53e3e' }}>{error ?? 'Not found'}</div>;
  }

  const calledSet = new Set(detail.calledNumbers.map((cn) => cn.number));
  const grid = detail.cartelaGrid;

  return (
    <div>
      <div style={{ background: '#4f46e5', color: '#fff', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ cursor: 'pointer', fontSize: 18 }} onClick={() => navigate(-1)}>←</span>
          <span style={{ fontWeight: 700, fontSize: 17 }}>ጨዋታ #{detail.gameId.slice(-6).toUpperCase()}</span>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 20, fontSize: 13 }}>
          <div>
            <span style={{ opacity: 0.75 }}>ውጤት: </span>
            <strong>{RESULT_LABELS[detail.result] ?? detail.result}</strong>
          </div>
          <div>
            <span style={{ opacity: 0.75 }}>ዋጋ: </span>
            <strong>{detail.stake} ብር</strong>
          </div>
          {detail.prize > 0 && (
            <div>
              <span style={{ opacity: 0.75 }}>ሽልማት: </span>
              <strong>{detail.prize} ብር</strong>
            </div>
          )}
        </div>
      </div>

      {/* Cartela grid */}
      {grid.length > 0 && (
        <div style={{ padding: '16px' }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 600 }}>
            ካርቴላ #{detail.cartelaNumber}
          </div>
          <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', background: '#4f46e5' }}>
              {COLS.map((c) => (
                <div key={c} style={{ textAlign: 'center', color: '#fff', fontWeight: 900, padding: '10px 0', fontSize: 18 }}>{c}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, padding: 4 }}>
              {grid.map((val, i) => {
                const isFree = i === 12;
                const marked = isFree || calledSet.has(val);
                return (
                  <div
                    key={i}
                    style={{
                      aspectRatio: '1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isFree ? '#4f46e5' : marked ? '#c7d2fe' : '#fff',
                      color: isFree ? '#fff' : '#222',
                      borderRadius: 6,
                      fontWeight: marked ? 700 : 400,
                      fontSize: 14,
                      border: '1px solid #e0e0e0',
                    }}
                  >
                    {isFree ? '★' : val}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Called numbers sequence */}
      <div style={{ padding: '0 16px 24px' }}>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 600 }}>
          የተጠሩ ቁጥሮች ({detail.calledNumbers.length})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {detail.calledNumbers
            .sort((a, b) => a.sequence_index - b.sequence_index)
            .map(({ number, sequence_index }) => (
              <div
                key={sequence_index}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: calledSet.has(number) && grid.includes(number) ? '#4f46e5' : '#e0e7ff',
                  color: calledSet.has(number) && grid.includes(number) ? '#fff' : '#4f46e5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                {number}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
