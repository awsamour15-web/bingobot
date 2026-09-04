import { useState, useMemo } from 'react';
import type { HistoryRecord } from './types';

const C = {
  card: '#182326',
  border: 'rgba(255,255,255,0.07)',
  green: '#22c55e',
  textWhite: '#e2e8f0',
  textDim: '#4a6a58',
};

interface Props {
  history: HistoryRecord[];
  selectedNumbers: number[];
  onToggleNumber: (n: number) => void;
}

export function KenoStatsTab({ history, selectedNumbers, onToggleNumber }: Props) {
  const [sortBy, setSortBy] = useState<'number' | 'count_desc' | 'count_asc'>('number');

  const { freqMap, maxFreq, totalRounds } = useMemo(() => {
    const freq: Record<number, number> = {};
    for (let i = 1; i <= 80; i++) freq[i] = 0;
    const rounds = history.slice(0, 100);
    if (!rounds.length) {
      for (let i = 1; i <= 80; i++) freq[i] = 18 + ((i * 37 + 17) % 13);
      return { freqMap: freq, maxFreq: 32, totalRounds: 100 };
    }
    rounds.forEach(r => r.drawnNumbers.forEach(n => { freq[n] = (freq[n] ?? 0) + 1; }));
    const max = Math.max(...Object.values(freq), 1);
    return { freqMap: freq, maxFreq: Math.max(max, 20), totalRounds: rounds.length };
  }, [history]);

  const sorted = useMemo(() => {
    const list = Array.from({ length: 80 }, (_, i) => i + 1);
    if (sortBy === 'count_desc') return list.sort((a, b) => (freqMap[b] ?? 0) - (freqMap[a] ?? 0));
    if (sortBy === 'count_asc') return list.sort((a, b) => (freqMap[a] ?? 0) - (freqMap[b] ?? 0));
    return list;
  }, [freqMap, sortBy]);

  const cycleSort = () => setSortBy(s => s === 'number' ? 'count_desc' : s === 'count_desc' ? 'count_asc' : 'number');
  const sortLabel = sortBy === 'count_desc' ? ' (Hot)' : sortBy === 'count_asc' ? ' (Cold)' : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, userSelect: 'none' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
        <span style={{ fontSize: 12, color: C.textDim, fontWeight: 600 }}>Last {totalRounds} rounds</span>
        <button onClick={cycleSort} style={{ background: 'none', border: 'none', color: C.green, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
          Sort{sortLabel}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M6 12h12M10 18h4" /></svg>
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 520, overflowY: 'auto' }}>
        {sorted.map(num => {
          const count = freqMap[num] ?? 0;
          const pct = Math.min(100, Math.max(6, Math.round((count / maxFreq) * 100)));
          const isSel = selectedNumbers.includes(num);
          return (
            <div
              key={num}
              onClick={() => onToggleNumber(num)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 10, cursor: 'pointer', background: isSel ? 'rgba(18,43,38,0.9)' : C.card, border: `1px solid ${isSel ? 'rgba(34,197,94,0.45)' : 'rgba(255,255,255,0.06)'}` }}
            >
              <div style={{ width: 34, height: 28, borderRadius: 6, background: isSel ? C.green : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: isSel ? '#000' : '#94a3b8', flexShrink: 0 }}>
                {num}
              </div>
              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: C.green, borderRadius: 2, boxShadow: '0 0 5px rgba(34,197,94,0.4)', transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ width: 26, textAlign: 'right', fontSize: 13, fontWeight: 700, color: C.textWhite, fontFamily: 'monospace', flexShrink: 0 }}>{count}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
