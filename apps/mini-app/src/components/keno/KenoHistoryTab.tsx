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
  mode?: 'history' | 'results';
}

function formatTime(ts?: string | null) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return ''; }
}

function formatId(id: string) { return id.slice(-8).toUpperCase(); }

function formatDate(ts?: string | null) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch { return ''; }
}

export function KenoHistoryTab({ history, onReplayBet, mode = 'history' }: Props) {
  if (!history.length) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 32, textAlign: 'center', color: C.textDim, fontSize: 13 }}>
        No history yet. Results appear here after each draw.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxHeight: 620, overflowY: 'auto' }}>
        {history.map(record => {
          const bets = record.myBets?.length ? record.myBets : record.myBet ? [record.myBet] : [];
          const winning = bets.some(bet => (bet.payout ?? 0) > 0);

          if (mode === 'results') {
            const row1 = record.drawnNumbers.slice(0, 10);
            const row2 = record.drawnNumbers.slice(10, 20);
            return (
              <div key={record.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 6px 2px', color: C.textDim, fontSize: 10 }}>
                  <span>Draw ID</span>
                  <span>Combination</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, borderRadius: 8, background: C.card, border: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: 76, flexShrink: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#1ee068', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 6px rgba(30,224,104,0.4)' }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#071316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 700, color: C.green, lineHeight: 1.2 }}>{formatId(record.id)}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 8, color: C.textDim, lineHeight: 1.2 }}>{formatTime(record.finishedAt)}</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '3px 2px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {[row1, row2].map((row, ri) => (
                      <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 1, textAlign: 'center' }}>
                        {Array.from({ length: 10 }).map((_, idx) => {
                          const number = row[idx];
                          return <span key={idx} style={{ height: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, fontFamily: 'monospace', color: number === undefined ? 'transparent' : '#94a3b8' }}>{number ?? '·'}</span>;
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={record.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.greenLight }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(224,238,231,0.8)' }} />
                <div style={{ minWidth: 170, textAlign: 'center', lineHeight: 1.15 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Draw</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 14 }}>ID: {formatId(record.id)}</div>
                  <div style={{ color: C.textWhite, fontSize: 12, marginTop: 3 }}>{formatDate(record.finishedAt)} {formatTime(record.finishedAt)}</div>
                </div>
                <div style={{ flex: 1, height: 1, background: 'rgba(224,238,231,0.8)' }} />
              </div>

              {bets.map((bet, betIndex) => {
                const picked = new Set(bet.pickedNumbers);
                const drawn = new Set(record.drawnNumbers);
                const won = (bet.payout ?? 0) > 0;
                return (
                  <div key={`${record.id}-${betIndex}`} onClick={() => onReplayBet?.(bet.pickedNumbers, bet.betAmount)} style={{ background: won ? 'rgba(12,63,42,0.88)' : C.card, border: `1px solid ${won ? 'rgba(34,197,94,0.35)' : C.border}`, borderRadius: 10, overflow: 'hidden', cursor: onReplayBet ? 'pointer' : 'default' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 3, padding: 6 }}>
                      {Array.from({ length: 10 }).map((_, idx) => {
                        const number = bet.pickedNumbers[idx];
                        const matched = number !== undefined && picked.has(number) && drawn.has(number);
                        return <div key={idx} style={{ height: 40, borderRadius: 4, background: number === undefined ? 'rgba(0,0,0,0.22)' : matched ? '#4fba7b' : '#34434b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: number === undefined ? 'transparent' : '#e5edf0', fontSize: 16, fontWeight: 800, fontFamily: 'monospace' }}>{number ?? '·'}</div>;
                      })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderTop: `1px solid ${won ? 'rgba(34,197,94,0.25)' : C.border}`, color: C.textWhite, fontFamily: 'monospace', fontSize: 13, fontWeight: 700 }}>
                      <span>Bet {bet.betAmount}</span>
                      {won && <span style={{ color: C.greenLight }}>{bet.matched ?? 0}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
    </div>
  );
}
