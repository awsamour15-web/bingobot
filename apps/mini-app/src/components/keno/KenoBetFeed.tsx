import type { BetFeedItem } from './types';

const C = {
  card: '#131920',
  border: 'rgba(255,255,255,0.07)',
  green: '#22c55e',
  greenLight: '#4ade80',
  textWhite: '#e2e8f0',
  textMid: '#8ab89a',
  textDim: '#4a6a58',
  yellow: '#f5a623',
};

interface Props {
  bets: BetFeedItem[];
  drawnNumbers: number[];
  phase: string;
}

export function KenoBetFeed({ bets, drawnNumbers, phase }: Props) {
  const drawnSet = new Set(drawnNumbers);

  if (!bets.length) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '24px 16px', textAlign: 'center', color: C.textDim, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        <span>No tickets placed yet for this round.</span>
        <span style={{ fontSize: 12, color: '#33463e' }}>Pick numbers and tap BET to enter!</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
      {bets.map((bet, i) => {
        const isWon = (bet.payout ?? 0) > 0;
        return (
          <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.greenLight, fontFamily: 'monospace' }}>{bet.username}</span>
            {/* number slots */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3 }}>
              {Array.from({ length: 10 }).map((_, idx) => {
                const number = bet.pickedNumbers[idx];
                const isPicked = number !== undefined && idx < bet.pickedCount;
                const isMatched = isPicked && drawnSet.has(number);
                return (
                  <div key={idx} style={{
                    height: 30, borderRadius: 5,
                    background: isMatched ? 'rgba(30,224,104,0.22)' : isPicked ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.3)',
                    border: `1px solid ${isMatched ? 'rgba(30,224,104,0.7)' : isPicked ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: isMatched ? C.greenLight : '#94a3b8',
                  }}>
                    {isPicked ? number : ''}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
              <span style={{ color: C.textWhite, fontFamily: 'monospace' }}>Bet {bet.betAmount}</span>
              <span style={{ color: phase === 'betting' || phase === 'drawing' ? C.yellow : isWon ? C.green : C.textDim }}>
                {phase === 'betting' || phase === 'drawing' ? 'Waiting' : isWon ? `Won ${bet.payout?.toLocaleString()}` : 'No Win'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
