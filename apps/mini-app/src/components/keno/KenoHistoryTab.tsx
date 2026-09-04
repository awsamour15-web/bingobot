import type { HistoryRecord } from './types';

const C = {
  card: '#141e21',
  border: 'rgba(255,255,255,0.07)',
  green: '#22c55e',
  greenLight: '#4ade80',
  textWhite: '#e2e8f0',
  textDim: '#4a6a58',
};

interface Props {
  history: HistoryRecord[];
  onReplayBet?: (numbers: number[], bet: number) => void;
}

function formatTime(ts?: string | null) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return ''; }
}

function formatId(id: string) { return id.slice(-8).toUpperCase(); }

export function KenoHistoryTab({ history, onReplayBet }: Props) {
  if (!history.length) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 32, textAlign: 'center', color: C.textDim, fontSize: 13 }}>
        No history yet. Results appear here after each draw.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px 6px' }}>
        <span style={{ fontSize: 12, color: C.textDim, fontWeight: 600 }}>Draw ID</span>
        <span style={{ fontSize: 12, color: C.textDim, fontWeight: 600 }}>Combination</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520, overflowY: 'auto' }}>
        {history.map(record => {
          const row1 = record.drawnNumbers.slice(0, 10);
          const row2 = record.drawnNumbers.slice(10, 20);
          const ps = new Set(record.myBet?.pickedNumbers ?? []);
          const won = (record.myBet?.payout ?? 0) > 0;

          return (
            <div
              key={record.id}
              onClick={() => record.myBet && onReplayBet?.(record.myBet.pickedNumbers, record.myBet.betAmount)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 12, cursor: record.myBet ? 'pointer' : 'default', background: won ? 'rgba(10,36,34,0.9)' : C.card, border: `1px solid ${won ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.07)'}` }}
            >
              {/* Left: ID + time */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 96, flexShrink: 0 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#1ee068', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 6px rgba(30,224,104,0.4)' }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#071316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: C.green, lineHeight: 1.2 }}>{formatId(record.id)}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: C.textDim, lineHeight: 1.2 }}>{formatTime(record.finishedAt)}</span>
                </div>
              </div>

              {/* Right: number grid */}
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '5px 4px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[row1, row2].map((row, ri) => (
                  <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 1, textAlign: 'center' }}>
                    {row.map((num, idx) => (
                      <span key={idx} style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: ps.has(num) ? C.greenLight : '#94a3b8' }}>{num}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
