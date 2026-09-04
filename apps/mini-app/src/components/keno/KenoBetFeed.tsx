import type { BetFeedItem } from './types';

interface Props {
  bets: BetFeedItem[];
  drawnNumbers: number[];
  phase: string;
}

export function KenoBetFeed({ bets, drawnNumbers, phase }: Props) {
  const drawnSet = new Set(drawnNumbers);

  if (!bets.length) {
    return (
      <div className="bg-[#0b1416] border border-[#142327] rounded-xl p-6 text-center text-slate-400 text-xs flex flex-col items-center gap-1">
        <span>No tickets placed yet for this round.</span>
        <span className="text-[11px] text-slate-500">Pick numbers and tap BET to enter!</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
      {bets.map((bet, i) => {
        const isWon = (bet.payout ?? 0) > 0;
        return (
          <div key={i} className="bg-[#0b1416] border border-[#142327] rounded-xl p-2.5 flex flex-col gap-2">
            <span className="text-xs font-bold text-[#2bd671] font-mono">{bet.username}</span>
            {/* number slots — show pickedCount filled with dim placeholders */}
            <div className="grid grid-cols-10 gap-1">
              {Array.from({ length: 10 }).map((_, idx) => (
                <div key={idx} className={`h-8 rounded-md flex items-center justify-center font-mono font-bold text-xs ${idx < bet.pickedCount ? 'bg-[#18282c] text-slate-100 border border-[#23383e]' : 'bg-[#080e10] border border-[#101b1e]'}`}>
                  {idx < bet.pickedCount ? '·' : ''}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs font-bold pt-0.5">
              <span className="text-slate-100 font-mono">Bet {bet.betAmount}</span>
              <div>
                {phase === 'betting' || phase === 'drawing' ? (
                  <span className="text-[#eab308]">Waiting</span>
                ) : isWon ? (
                  <span className="text-[#1ee068]">Won {bet.payout?.toLocaleString()}</span>
                ) : (
                  <span className="text-slate-500">No Win</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
