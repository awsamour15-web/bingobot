import { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'RULES' | 'FAIRNESS' | 'FREE_BET';

// PAYMENTS[matched][picked-1] — picked columns 1..10, matched rows 0..10
const PAYMENTS: (number | null)[][] = [
  [null, null, null, null, null, null, 1,    1,    2,    2   ],
  [3.5,  1,    null, null, null, null, null, null, null, null],
  [null, 10,   2,    1.5,  1,    null, null, null, null, null],
  [null, null, 50,   10,   3,    2,    2,    null, null, null],
  [null, null, null, 80,   30,   15,   4,    5,    2,    null],
  [null, null, null, null, 150,  60,   20,   15,   10,   5   ],
  [null, null, null, null, null, 500,  80,   50,   25,   30  ],
  [null, null, null, null, null, null, 1000, 200,  125,  100 ],
  [null, null, null, null, null, null, null, 2000, 1000, 300 ],
  [null, null, null, null, null, null, null, null, 5000, 2000],
  [null, null, null, null, null, null, null, null, null, 10000],
];

export function KenoInfoModal({ isOpen, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('RULES');

  if (!isOpen) return null;

  const tabStyle = (t: Tab): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    border: 'none',
    background: tab === t
      ? t === 'FAIRNESS' ? '#16a34a' : 'rgba(255,255,255,0.1)'
      : 'transparent',
    color: tab === t ? '#fff' : '#64748b',
  });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '88dvh', background: '#0d1117', borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Close */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 14px 4px', flexShrink: 0 }}>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px 10px', flexShrink: 0, flexWrap: 'wrap' }}>
          <button style={tabStyle('RULES')} onClick={() => setTab('RULES')}>ℹ RULES</button>
          <button style={tabStyle('FAIRNESS')} onClick={() => setTab('FAIRNESS')}>✅ FAIRNESS</button>
          <button style={tabStyle('FREE_BET')} onClick={() => setTab('FREE_BET')}>🎁 FREE BET</button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 32px', color: '#94a3b8', fontSize: 14, lineHeight: 1.65 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0 }}><strong style={{ color: '#e2e8f0' }}>RTP: 97%</strong></p>
      <p style={{ margin: 0 }}><strong style={{ color: '#e2e8f0' }}>Max Win — 30 000 ETB</strong></p>
      <p style={{ margin: 0 }}>Keno is a game where the player bets on balls numbered 1–80 by choosing a combination from balls numbered 1 to 10.</p>
      <p style={{ margin: 0 }}>During each round, 20 of the balls numbered from 1–80 are drawn in sequence using a random number generator.</p>

      <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 800, margin: '4px 0 0' }}>How to play</h3>
      <p style={{ margin: 0 }}>To participate in the game, the player must perform the following actions during the round, which lasts one minute:</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 10 }}>
        <span>· Choose the combination of numbers</span>
        <span>· Set the amount limit for betting</span>
        <span>· Click the "Bet" button</span>
      </div>
      <p style={{ margin: 0 }}>The player can also delete the combination of already selected numbers.</p>
      <p style={{ margin: 0 }}>In the field where the numbers from 1 to 80 are present, HOT and COLD numbers are indicated in red and blue colors, with hot numbers being those that are frequently drawn and blue being those that are drawn more infrequently.</p>

      <h3 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 800, margin: '4px 0 0' }}>Payments</h3>
      <p style={{ margin: 0 }}>All winning ball combinations have corresponding odds, which is multiplied by the player's bet amount.</p>
      <p style={{ margin: 0 }}>The winning combination is calculated as the ratio of the number of balls bet to the number of guessed balls.</p>

      {/* Payments table */}
      <div style={{ overflowX: 'auto', margin: '0 -4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'center', minWidth: 300 }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 4px', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)', background: '#0b1215', width: 22 }}></th>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <th key={n} style={{ padding: '6px 2px', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.08)', background: '#0b1215', fontWeight: 700 }}>{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PAYMENTS.map((row, matched) => (
              <tr key={matched}>
                <td style={{ padding: '5px 4px', fontWeight: 700, color: '#64748b', border: '1px solid rgba(255,255,255,0.08)', background: '#0b1215' }}>{matched}</td>
                {row.map((val, ci) => (
                  <td key={ci} style={{ padding: '5px 2px', border: '1px solid rgba(255,255,255,0.08)', background: val !== null ? '#0f1d1a' : '#090d10', color: val !== null ? '#4ade80' : 'transparent', fontWeight: val !== null ? 700 : 400, fontFamily: 'monospace', fontSize: 11 }}>
                    {val ?? '·'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: '#4a6a58' }}>
        Disconnection policy: If a disconnection occurs after an active game round and your bets were accepted by the server, the game will proceed as normal and any winnings will be processed according to the game result regardless of the disconnection.
      </p>
    </div>
  );
}

function FairnessContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
        <span style={{ fontSize: 24 }}>🛡️</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0' }}>Provably Fair Draw System</span>
      </div>
      <p style={{ margin: 0 }}>Each round's 20 winning numbers are generated using a cryptographically secure random number generator (CSPRNG) server-side before the betting window opens.</p>
      <p style={{ margin: 0 }}>The draw result is committed to a server-side hash that can be verified after the round completes, ensuring no number sequence can be altered once betting begins.</p>
      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Verification Steps</span>
        <ol style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <li>Before betting opens, the server generates a seed and publishes its SHA-256 hash.</li>
          <li>After the round finishes, the original seed is revealed.</li>
          <li>You can verify that <code style={{ color: '#4ade80', fontFamily: 'monospace' }}>SHA256(seed) = published_hash</code>.</li>
          <li>The drawn numbers are deterministically derived from the seed.</li>
        </ol>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: '#4a6a58' }}>RTP is set at 97%. The house edge of 3% is applied to all payouts uniformly.</p>
    </div>
  );
}

function FreeBetContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
        <span style={{ fontSize: 24 }}>🎁</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0' }}>Free Bet Bonus</span>
      </div>
      <p style={{ margin: 0 }}>Free bets are awarded as part of promotions and bonuses. When you have an active free bet, it will be applied automatically to your next qualifying Keno round.</p>
      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Terms</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13 }}>
          <span>· Free bets cannot be withdrawn directly.</span>
          <span>· Winnings from free bets are credited to your main balance.</span>
          <span>· Free bets expire after 7 days if unused.</span>
          <span>· One free bet per round per account.</span>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: '#4a6a58' }}>Check the Promotions section in your profile for active free bet offers.</p>
    </div>
  );
}
