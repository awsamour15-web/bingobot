import { useState } from 'react';
import { X, Info, ShieldCheck, Gift } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'RULES' | 'FAIRNESS' | 'FREE_BET';

// Payments table: rows = matched (0-10), cols = picked (1-10)
const PAYMENTS: (number | null)[][] = [
  // matched=0
  [null, null, null, null, null, null, 1,    1,    2,    2   ],
  // matched=1
  [3.5,  1,    null, null, null, null, null, null, null, null],
  // matched=2
  [null, 10,   2,    1.5,  1,    null, null, null, null, null],
  // matched=3
  [null, null, 50,   10,   3,    2,    2,    null, null, null],
  // matched=4
  [null, null, null, 80,   30,   15,   4,    5,    2,    null],
  // matched=5
  [null, null, null, null, 150,  60,   20,   15,   10,   5   ],
  // matched=6
  [null, null, null, null, null, 500,  80,   50,   25,   30  ],
  // matched=7
  [null, null, null, null, null, null, 1000, 200,  125,  100 ],
  // matched=8
  [null, null, null, null, null, null, null, 2000, 1000, 300 ],
  // matched=9
  [null, null, null, null, null, null, null, null, 5000, 2000],
  // matched=10
  [null, null, null, null, null, null, null, null, null, 10000],
];

export function KenoInfoModal({ isOpen, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('RULES');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col" onClick={onClose}>
      <div
        className="mt-auto w-full max-h-[88dvh] bg-[#0d1117] rounded-t-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <div className="flex justify-end px-4 pt-3 pb-1 shrink-0">
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#1e2a2e] flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-2 px-4 pb-3 shrink-0 flex-wrap">
          <button
            onClick={() => setTab('RULES')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === 'RULES' ? 'bg-[#1e2a2e] text-white border border-[#2a3a3e]' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Info className="w-3.5 h-3.5 text-emerald-400" />
            RULES
          </button>
          <button
            onClick={() => setTab('FAIRNESS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === 'FAIRNESS' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            FAIRNESS
          </button>
          <button
            onClick={() => setTab('FREE_BET')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === 'FREE_BET' ? 'bg-[#1e2a2e] text-white border border-[#2a3a3e]' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Gift className="w-3.5 h-3.5 text-emerald-400" />
            FREE BET
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-8 text-slate-300 text-sm leading-relaxed">
          {tab === 'RULES' && <RulesContent />}
          {tab === 'FAIRNESS' && <FairnessContent />}
          {tab === 'FREE_BET' && <FreeBetContent />}
        </div>
      </div>
    </div>
  );
}

function RulesContent() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 text-sm text-slate-300">
        <p><span className="font-bold text-white">RTP: 97%</span></p>
        <p><span className="font-bold text-white">Max Win — 30 000 ETB</span></p>
        <p>Keno is a game where the player bets on balls numbered 1–80 by choosing a combination from balls numbered 1 to 10.</p>
        <p>During each round, 20 of the balls numbered from 1–80 are drawn in sequence using a random number generator.</p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-black text-white">How to play</h3>
        <p>To participate in the game, the player must perform the following actions during the round, which lasts one minute:</p>
        <ul className="flex flex-col gap-1 pl-3 text-slate-300">
          <li>· Choose the combination of numbers</li>
          <li>· Set the amount limit for betting</li>
          <li>· Click the "Bet" button</li>
        </ul>
        <p>The player can also delete the combination of already selected numbers.</p>
        <p>In the field where the numbers from 1 to 80 are present, HOT and COLD numbers are indicated in red and blue colors, with hot numbers being those that are frequently drawn and blue being those that are drawn more infrequently.</p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-black text-white">Payments</h3>
        <p>All winning ball combinations have corresponding odds, which is multiplied by the player's bet amount.</p>
        <p>The winning combination is calculated as the ratio of the number of balls bet to the number of guessed balls.</p>

        {/* Payments table */}
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-center text-xs border-collapse">
            <thead>
              <tr>
                <th className="w-7 py-1.5 text-slate-400 border border-[#1e2a2e] bg-[#0b1215]"></th>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                  <th key={n} className="py-1.5 text-slate-200 font-bold border border-[#1e2a2e] bg-[#0b1215]">{n}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PAYMENTS.map((row, matched) => (
                <tr key={matched}>
                  <td className="py-1.5 font-bold text-slate-400 border border-[#1e2a2e] bg-[#0b1215]">{matched}</td>
                  {row.map((val, colIdx) => (
                    <td
                      key={colIdx}
                      className={`py-1.5 border border-[#1e2a2e] font-mono text-[11px] ${val !== null ? 'text-[#1ee068] font-bold bg-[#0f1d1a]' : 'text-transparent bg-[#090d10]'}`}
                    >
                      {val ?? '·'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Disconnection policy: If a disconnection occurs after an active game round and your bets were accepted by the server, the game will proceed as normal and any winnings will be processed according to the game result regardless of the disconnection.
        </p>
      </div>
    </div>
  );
}

function FairnessContent() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 py-2">
        <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
        <span className="text-base font-black text-white">Provably Fair Draw System</span>
      </div>
      <p>Each round's 20 winning numbers are generated using a cryptographically secure random number generator (CSPRNG) server-side before the betting window opens.</p>
      <p>The draw result is committed to a server-side hash that can be verified after the round completes, ensuring no number sequence can be altered once betting begins.</p>
      <div className="flex flex-col gap-2 bg-[#0b1215] border border-[#1e2a2e] rounded-xl p-3">
        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Verification Steps</span>
        <ol className="flex flex-col gap-1.5 text-xs text-slate-300 pl-2">
          <li>1. Before betting opens, the server generates a seed and publishes its SHA-256 hash.</li>
          <li>2. After the round finishes, the original seed is revealed.</li>
          <li>3. You can verify that <span className="font-mono text-emerald-400">SHA256(seed) = published_hash</span>.</li>
          <li>4. The drawn numbers are deterministically derived from the seed.</li>
        </ol>
      </div>
      <p className="text-xs text-slate-400">RTP is set at 97%. The house edge of 3% is applied to all payouts uniformly.</p>
    </div>
  );
}

function FreeBetContent() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 py-2">
        <Gift className="w-6 h-6 text-emerald-400 shrink-0" />
        <span className="text-base font-black text-white">Free Bet Bonus</span>
      </div>
      <p>Free bets are awarded as part of promotions and bonuses. When you have an active free bet, it will be applied automatically to your next qualifying Keno round.</p>
      <div className="flex flex-col gap-2 bg-[#0b1215] border border-[#1e2a2e] rounded-xl p-3">
        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Terms</span>
        <ul className="flex flex-col gap-1 text-xs text-slate-300 pl-2">
          <li>· Free bets cannot be withdrawn directly.</li>
          <li>· Winnings from free bets are credited to your main balance.</li>
          <li>· Free bets expire after 7 days if unused.</li>
          <li>· One free bet per round per account.</li>
        </ul>
      </div>
      <p className="text-xs text-slate-400">Check the Promotions section in your profile for active free bet offers.</p>
    </div>
  );
}
