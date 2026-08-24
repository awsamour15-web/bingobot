import { useState, useRef, useCallback, useEffect } from 'react';
import { spinSlots, gambleSlots, getProfile } from '../lib/api';
import type { SlotSymbol, PaylineWin, SpinResponse } from '../lib/api';

// ─── Symbol config ────────────────────────────────────────────────────────────

const SYMBOL_EMOJI: Record<SlotSymbol, string> = {
  cherry:        '🍒',
  watermelon:    '🍉',
  orange:        '🍊',
  lemon:         '🍋',
  bell:          '🔔',
  double_dollar: '💲',
  seven:         '7️⃣',
};

const SYMBOL_COLOR: Record<SlotSymbol, string> = {
  cherry:        '#f87171',
  watermelon:    '#4ade80',
  orange:        '#fb923c',
  lemon:         '#fde047',
  bell:          '#fbbf24',
  double_dollar: '#a3e635',
  seven:         '#f87171',
};

const BET_STEPS = [5, 8, 10, 20, 50, 100, 200, 500];
const SPIN_REQUEST_TIMEOUT_MS = 15_000;

// ─── Spinning reel column ─────────────────────────────────────────────────────

const ALL_SYMBOLS: SlotSymbol[] = ['cherry', 'watermelon', 'orange', 'lemon', 'bell', 'double_dollar', 'seven'];

function ReelColumn({ symbols, spinning, delay, winRows }: {
  symbols: SlotSymbol[];
  spinning: boolean;
  delay: number;
  winRows: number[];
}) {
  const [displaySymbols, setDisplaySymbols] = useState<SlotSymbol[]>(symbols);
  const [isBlur, setIsBlur] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (spinning) {
      setIsBlur(true);
      intervalRef.current = setInterval(() => {
        setDisplaySymbols([
          ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)]!,
          ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)]!,
          ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)]!,
        ]);
      }, 80);
    } else {
      // Stop after delay, show final symbols
      const t = setTimeout(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsBlur(false);
        setDisplaySymbols(symbols);
      }, delay);
      return () => clearTimeout(t);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [spinning, symbols, delay]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      flex: 1,
    }}>
      {displaySymbols.map((sym, row) => {
        const isWin = winRows.includes(row);
        return (
          <div
            key={row}
            style={{
              height: 72,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
              background: isWin
                ? `rgba(${sym === 'seven' ? '248,113,113' : '251,191,36'},0.18)`
                : 'rgba(255,255,255,0.04)',
              border: isWin
                ? `1.5px solid ${SYMBOL_COLOR[sym]}88`
                : '1.5px solid rgba(255,255,255,0.06)',
              fontSize: 34,
              filter: isBlur ? 'blur(3px)' : 'none',
              transition: isBlur ? 'none' : 'background 0.3s, border 0.3s',
              boxShadow: isWin ? `0 0 18px ${SYMBOL_COLOR[sym]}44` : 'none',
            }}
          >
            {SYMBOL_EMOJI[sym]}
          </div>
        );
      })}
    </div>
  );
}

// ─── Multiplier reel ──────────────────────────────────────────────────────────

function MultiplierReel({ value, spinning }: { value: number; spinning: boolean }) {
  const [display, setDisplay] = useState(value);
  const ALL_MULTS = [1, 2, 3, 4, 5];
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (spinning) {
      intervalRef.current = setInterval(() => {
        setDisplay(ALL_MULTS[Math.floor(Math.random() * ALL_MULTS.length)]!);
      }, 100);
    } else {
      const t = setTimeout(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setDisplay(value);
      }, 400);
      return () => clearTimeout(t);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [spinning, value]);

  const color = display === 1 ? '#94a3b8' : display === 2 ? '#fbbf24' : display === 3 ? '#fb923c' : display === 4 ? '#f87171' : '#a78bfa';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      width: 48,
    }}>
      {[display === 1 ? 3 : display - 1 < 1 ? 1 : display - 1,
        display,
        display + 1 > 5 ? 1 : display + 1,
      ].map((v, i) => (
        <div key={i} style={{
          height: 72,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 10,
          background: i === 1 ? `${color}22` : 'rgba(255,255,255,0.02)',
          border: i === 1 ? `2px solid ${color}88` : '1px solid rgba(255,255,255,0.05)',
          fontSize: i === 1 ? 18 : 13,
          fontWeight: 900,
          color: i === 1 ? color : '#334155',
          transition: 'all 0.2s',
        }}>
          {v}x
        </div>
      ))}
    </div>
  );
}

// ─── Payline indicator ────────────────────────────────────────────────────────

function PaylineIndicator({ wins }: { wins: PaylineWin[] }) {
  if (wins.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      {wins.map((w) => (
        <div key={w.line} style={{
          padding: '4px 10px',
          borderRadius: 20,
          background: 'rgba(251,191,36,0.15)',
          border: '1px solid rgba(251,191,36,0.4)',
          fontSize: 12,
          fontWeight: 700,
          color: '#fbbf24',
        }}>
          Line {w.line}: +{w.payout.toFixed(2)}
        </div>
      ))}
    </div>
  );
}

// ─── Gamble modal ─────────────────────────────────────────────────────────────

function GambleModal({ win, onGuess, onCollect, result, loading }: {
  win: number;
  onGuess: (g: 'red' | 'black') => void;
  onCollect: () => void;
  result: { won: boolean; actual: 'red' | 'black'; payout: number } | null;
  loading: boolean;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, padding: 20,
    }}>
      <div style={{
        background: '#0f172a',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 24,
        padding: 28,
        width: '100%',
        maxWidth: 340,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>X2 Gamble</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#fbbf24', marginBottom: 4 }}>
          {win.toFixed(2)} ETB
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 24 }}>
          Double it or lose it all
        </div>

        {/* Cards display */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 24 }}>
          {['♦', '♥', '♣', '♠'].map((s, i) => (
            <div key={i} style={{
              width: 44, height: 60,
              background: result
                ? (i < 2 ? '#ef4444' : '#1e293b')
                : (result === null ? '#1e293b' : '#1e293b'),
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22,
              color: i < 2 ? '#ef4444' : '#f8fafc',
              boxShadow: result && ((i < 2 && result.actual === 'red') || (i >= 2 && result.actual === 'black'))
                ? '0 0 16px rgba(251,191,36,0.5)' : 'none',
            }}>
              {result ? s : '?'}
            </div>
          ))}
        </div>

        {result ? (
          <div style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: result.won ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
            border: `1px solid ${result.won ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
            marginBottom: 20,
            fontSize: 15,
            fontWeight: 700,
            color: result.won ? '#34d399' : '#f87171',
          }}>
            {result.won ? `Won! +${result.payout.toFixed(2)} ETB` : `Lost! Actual: ${result.actual}`}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button
              onClick={() => onGuess('red')}
              disabled={loading}
              style={{
                flex: 1, padding: '14px 0', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: '#fff', fontSize: 16, fontWeight: 800,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              🟥 RED
            </button>
            <button
              onClick={() => onGuess('black')}
              disabled={loading}
              style={{
                flex: 1, padding: '14px 0', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #334155, #1e293b)',
                color: '#fff', fontSize: 16, fontWeight: 800,
                borderTop: '1px solid rgba(255,255,255,0.15)',
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.6 : 1,
              } as React.CSSProperties}
            >
              ⬛ BLACK
            </button>
          </div>
        )}

        <button
          onClick={onCollect}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
            background: 'rgba(255,255,255,0.06)',
            color: '#94a3b8', fontSize: 14, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Collect {win.toFixed(2)} ETB
        </button>
      </div>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const EMPTY_REELS: SlotSymbol[][] = [
  ['cherry', 'lemon', 'orange'],
  ['watermelon', 'bell', 'cherry'],
  ['lemon', 'seven', 'watermelon'],
];

export default function SlotsScreen() {
  const [reels, setReels] = useState<SlotSymbol[][]>(EMPTY_REELS);
  const [multiplierReel, setMultiplierReel] = useState(1);
  const [spinning, setSpinning] = useState(false);
  const [betIndex, setBetIndex] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  const [paylineWins, setPaylineWins] = useState<PaylineWin[]>([]);
  const [totalWin, setTotalWin] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoSpin, setAutoSpin] = useState(false);
  const autoRef = useRef(false);

  // Gamble state
  const [showGamble, setShowGamble] = useState(false);
  const [gambleSpinId, setGambleSpinId] = useState<string | null>(null);
  const [gambleWin, setGambleWin] = useState(0);
  const [gambleResult, setGambleResult] = useState<{ won: boolean; actual: 'red' | 'black'; payout: number } | null>(null);
  const [gambleLoading, setGambleLoading] = useState(false);

  // Refs to avoid stale closures
  const spinningRef = useRef(false);
  const betIndexRef = useRef(betIndex);
  useEffect(() => { betIndexRef.current = betIndex; }, [betIndex]);

  const betAmount = BET_STEPS[betIndex]!;

  // Load balance on mount
  useEffect(() => {
    getProfile().then((p) => setBalance(p.mainWallet.balance)).catch(() => {});
  }, []);

  // Compute which rows are winners per column
  const winRowsPerCol = useCallback((col: number): number[] => {
    const rows = new Set<number>();
    const PAYLINES: [number, number, number][] = [
      [1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0],
    ];
    for (const w of paylineWins) {
      const line = PAYLINES[w.line - 1];
      if (line) rows.add(line[col as 0 | 1 | 2] as number);
    }
    return [...rows];
  }, [paylineWins]);

  // Stable doSpin — uses refs so it never goes stale in loops
  const doSpin = useCallback(async (fromAutoSpin = false): Promise<boolean> => {
    if (spinningRef.current) return false;
    spinningRef.current = true;
    setSpinning(true);
    setPaylineWins([]);
    setTotalWin(null);
    setError(null);

    const bet = BET_STEPS[betIndexRef.current]!;

    try {
      const res: SpinResponse = await Promise.race([
        spinSlots(bet),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Spin request timed out. Please try again.')), SPIN_REQUEST_TIMEOUT_MS);
        }),
      ]);

      // Animate for 1.2s then snap to result
      await new Promise((r) => setTimeout(r, 1200));

      setReels(res.reels);
      setMultiplierReel(res.multiplierReel);
      spinningRef.current = false;
      setSpinning(false);

      await new Promise((r) => setTimeout(r, 200));
      setPaylineWins(res.paylineWins);
      setTotalWin(res.totalWin);
      setBalance(res.balance);

      if (res.canGamble && !fromAutoSpin) {
        setGambleSpinId(res.spinId);
        setGambleWin(res.totalWin);
        setGambleResult(null);
        setShowGamble(true);
        return false; // signal auto-spin to pause
      }

      return true;
    } catch (err: any) {
      spinningRef.current = false;
      setSpinning(false);
      setError(err?.message ?? 'Spin failed');
      autoRef.current = false;
      setAutoSpin(false);
      return false;
    }
  }, []); // stable — no deps needed, all via refs

  // Auto spin loop
  useEffect(() => {
    autoRef.current = autoSpin;
    if (!autoSpin) return;

    let cancelled = false;
    async function loop() {
      while (autoRef.current && !cancelled) {
        const ok = await doSpin(true);
        if (!ok) break; // error or gamble prompt — stop auto
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!cancelled) setAutoSpin(false);
    }
    void loop();
    return () => { cancelled = true; autoRef.current = false; };
  }, [autoSpin, doSpin]);

  const handleGamble = async (guess: 'red' | 'black') => {
    if (!gambleSpinId) return;
    setGambleLoading(true);
    try {
      const res = await gambleSlots(gambleSpinId, guess);
      setGambleResult({ won: res.won, actual: res.actual, payout: res.payout });
      setBalance(res.balance);
      setTotalWin(res.won ? res.payout : 0);
    } catch (err: any) {
      setError(err?.message ?? 'Gamble failed');
    } finally {
      setGambleLoading(false);
    }
  };

  const handleCollect = () => {
    setShowGamble(false);
    setGambleSpinId(null);
    setGambleResult(null);
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(180deg, #071a0e 0%, #0a0e1a 100%)',
      color: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: 480,
      margin: '0 auto',
      padding: '0 0 80px',
      userSelect: 'none',
    }}>

      {/* Header */}
      <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 22 }}>🎰</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.5px' }}>Multi Hot 5</div>
          <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 700 }}>5 LINES FIXED · RTP 96%</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>BALANCE</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fbbf24' }}>
            {balance !== null ? balance.toFixed(2) : '—'} <span style={{ fontSize: 11 }}>ETB</span>
          </div>
        </div>
      </div>

      {/* Win display */}
      <div style={{ minHeight: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0 20px 8px' }}>
        {totalWin !== null && totalWin > 0 && (
          <div style={{
            fontSize: 22,
            fontWeight: 900,
            color: '#fbbf24',
            filter: 'drop-shadow(0 0 12px rgba(251,191,36,0.6))',
            animation: 'winPop 0.4s cubic-bezier(0.22,1,0.36,1)',
          }}>
            +{totalWin.toFixed(2)} ETB
          </div>
        )}
        <PaylineIndicator wins={paylineWins} />
      </div>

      {/* Reel area */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{
          background: 'rgba(0,0,0,0.4)',
          border: '2px solid rgba(74,222,128,0.2)',
          borderRadius: 20,
          padding: 12,
          boxShadow: '0 0 40px rgba(74,222,128,0.05), inset 0 0 40px rgba(0,0,0,0.3)',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            {/* Multiplier reel */}
            <MultiplierReel value={multiplierReel} spinning={spinning} />

            {/* Divider */}
            <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }} />

            {/* 3 symbol reels */}
            {reels.map((col, ci) => (
              <ReelColumn
                key={ci}
                symbols={col}
                spinning={spinning}
                delay={ci * 180}
                winRows={spinning ? [] : winRowsPerCol(ci)}
              />
            ))}
          </div>

          {/* Payline decorators */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
            {[1, 2, 3, 4, 5].map((n) => {
              const active = paylineWins.some((w) => w.line === n);
              return (
                <div key={n} style={{
                  width: 22, height: 22,
                  borderRadius: 6,
                  background: active ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.04)',
                  border: active ? '1px solid rgba(251,191,36,0.6)' : '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700,
                  color: active ? '#fbbf24' : '#334155',
                }}>
                  {n}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ margin: '0 16px 10px', padding: '8px 14px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, fontSize: 13, color: '#f87171', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Controls */}
      <div style={{ padding: '0 16px' }}>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 20,
          padding: 16,
        }}>

          {/* Bet row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>BET</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setBetIndex((i) => Math.max(0, i - 1))}
                  disabled={spinning || betIndex === 0}
                  style={btnStyle('#1e293b', spinning || betIndex === 0)}
                >
                  −
                </button>
                <div style={{
                  flex: 1, textAlign: 'center',
                  fontSize: 20, fontWeight: 900, color: '#fbbf24',
                }}>
                  {betAmount} <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>ETB</span>
                </div>
                <button
                  onClick={() => setBetIndex((i) => Math.min(BET_STEPS.length - 1, i + 1))}
                  disabled={spinning || betIndex === BET_STEPS.length - 1}
                  style={btnStyle('#1e293b', spinning || betIndex === BET_STEPS.length - 1)}
                >
                  +
                </button>
              </div>
            </div>

            {/* Auto spin toggle */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>AUTO</div>
              <button
                onClick={() => setAutoSpin((a) => !a)}
                disabled={spinning && !autoSpin}
                style={{
                  width: 44, height: 44, borderRadius: 12,
                  border: 'none',
                  background: autoSpin ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.05)',
                  color: autoSpin ? '#4ade80' : '#475569',
                  fontSize: 18,
                  cursor: 'pointer',
                  boxShadow: autoSpin ? '0 0 12px rgba(74,222,128,0.3)' : 'none',
                }}
              >
                🔄
              </button>
            </div>
          </div>

          {/* Spin button */}
          <button
            onClick={() => {
              if (autoSpin || spinningRef.current) return;
              autoRef.current = false;
              void doSpin();
            }}
            disabled={spinning || autoSpin}
            style={{
              width: '100%',
              height: 58,
              borderRadius: 16,
              border: 'none',
              background: spinning || autoSpin
                ? 'rgba(255,255,255,0.06)'
                : 'linear-gradient(135deg, #16a34a, #4ade80)',
              color: spinning || autoSpin ? '#475569' : '#fff',
              fontSize: 18,
              fontWeight: 900,
              cursor: spinning || autoSpin ? 'default' : 'pointer',
              letterSpacing: '0.05em',
              boxShadow: spinning || autoSpin ? 'none' : '0 8px 24px rgba(74,222,128,0.3)',
              transition: 'all 0.2s',
            }}
          >
            {spinning ? '🎰 Spinning...' : autoSpin ? '🔄 Auto' : '▶ SPIN'}
          </button>
        </div>
      </div>

      {/* Symbol payout table */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontSize: 11, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Payouts (at 5 ETB bet)
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 6,
        }}>
          {(['seven', 'double_dollar', 'bell', 'lemon', 'orange', 'watermelon'] as SlotSymbol[]).map((sym) => {
            const BASE_PAYOUTS: Record<SlotSymbol, number> = {
              cherry: 44, watermelon: 44, orange: 88, lemon: 88, bell: 111, double_dollar: 222, seven: 333,
            };
            const payout = ((5 * BASE_PAYOUTS[sym]) / 333).toFixed(2);
            return (
              <div key={sym} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 10,
              }}>
                <span style={{ fontSize: 20 }}>{SYMBOL_EMOJI[sym]}{SYMBOL_EMOJI[sym]}{SYMBOL_EMOJI[sym]}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: SYMBOL_COLOR[sym] }}>{payout}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gamble modal */}
      {showGamble && (
        <GambleModal
          win={gambleWin}
          onGuess={handleGamble}
          onCollect={handleCollect}
          result={gambleResult}
          loading={gambleLoading}
        />
      )}

      <style>{`
        @keyframes winPop {
          0% { transform: scale(0.7); opacity: 0; }
          60% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function btnStyle(bg: string, disabled: boolean): React.CSSProperties {
  return {
    width: 36, height: 36,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    background: bg,
    color: disabled ? '#334155' : '#f8fafc',
    fontSize: 18,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: disabled ? 0.4 : 1,
  };
}
