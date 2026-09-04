import type { HistoryRecord } from './types';

interface Props {
  history: HistoryRecord[];
  onReplayBet?: (numbers: number[], bet: number) => void;
}

function formatTime(ts?: string | null) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

function formatDrawId(id: string) {
  return id.slice(-8).toUpperCase();
}

export function KenoHistoryTab({ history, onReplayBet }: Props) {
  if (!history.length) {
    return (
      <div className="bg-[#0b1416] border border-[#142327] rounded-xl p-8 text-center text-slate-400 text-xs">
        No history yet. Results appear here after each draw.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-0.5 select-none">
      {/* header */}
      <div className="flex items-center justify-between px-1 text-xs">
        <span className="text-slate-400">Draw ID</span>
        <span className="text-slate-400 mr-2">Combination</span>
      </div>

      {history.map(record => {
        const row1 = record.drawnNumbers.slice(0, 10);
        const row2 = record.drawnNumbers.slice(10, 20);
        const ps = new Set(record.myBet?.pickedNumbers ?? []);
        const won = (record.myBet?.payout ?? 0) > 0;

        return (
          <div
            key={record.id}
            onClick={() => record.myBet && onReplayBet?.(record.myBet.pickedNumbers, record.myBet.betAmount)}
            className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer transition-all ${won ? 'bg-[#102422] border border-emerald-500/40' : 'bg-[#141e21] border border-[#1e2c31]'}`}
          >
            {/* Left: ID + time */}
            <div className="flex items-center gap-2 shrink-0 min-w-[100px]">
              <div className="w-5 h-5 rounded-full bg-[#1ee068] flex items-center justify-center shadow-[0_0_6px_rgba(30,224,104,0.4)]">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#071316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-xs font-bold text-[#1ee068] leading-tight">{formatDrawId(record.id)}</span>
                <span className="font-mono text-[11px] text-slate-400 leading-tight">{formatTime(record.finishedAt)}</span>
              </div>
            </div>

            {/* Right: number grid */}
            <div className="flex-1 bg-[#1c282c] border border-[#27373d] rounded-lg p-1.5 flex flex-col gap-1">
              {[row1, row2].map((row, ri) => (
                <div key={ri} className="grid grid-cols-10 gap-0.5 text-center font-mono text-[11px]">
                  {row.map((num, idx) => (
                    <span key={idx} className={`font-medium ${ps.has(num) ? 'text-[#4ade80]' : 'text-slate-200'}`}>{num}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
