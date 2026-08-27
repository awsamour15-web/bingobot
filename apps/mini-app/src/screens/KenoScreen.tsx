import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import { apiRequest } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KenoRoundState {
  phase: 'betting' | 'drawing' | 'finished' | 'idle';
  round: {
    id: string;
    status: string;
    bettingEndsAt: string;
    drawnNumbers: number[];
  } | null;
  myBet: {
    id: string;
    pickedNumbers: number[];
    betAmount: number;
    matched: number | null;
    payout: number | null;
  } | null;
  bets: {
    username: string;
    pickedCount: number;
    betAmount: number;
    matched: number | null;
    payout: number | null;
  }[];
}

interface HistoryRound {
  id: string;
  drawnNumbers: number[];
  finishedAt: string;
  myBet: {
    pickedNumbers: number[];
    betAmount: number;
    matched: number | null;
    payout: number | null;
  } | null;
}

const MIN_BET = 5;
const MAX_BET = 5000;
const MAX_PICKS = 10;
const TOTAL_DRAW = 20;

// ─── Payout table (mirrors backend) ──────────────────────────────────────────
const PAYOUT_TABLE: Record<number, Record<number, number>> = {
  1:  { 1: 3.5 },
  2:  { 2: 9 },
  3:  { 2: 2, 3: 25 },
  4:  { 2: 1.5, 3: 6, 4: 75 },
  5:  { 2: 1, 3: 3, 4: 15, 5: 120 },
  6:  { 2: 1, 3: 2, 4: 5, 5: 30, 6: 300 },
  7:  { 3: 1.5, 4: 3, 5: 10, 6: 75, 7: 700 },
  8:  { 3: 1, 4: 2, 5: 6, 6: 25, 7: 150, 8: 1500 },
  9:  { 3: 1, 4: 1.5, 5: 4, 6: 12, 7: 50, 8: 300, 9: 3000 },
  10: { 3: 1, 4: 1.2, 5: 3, 6: 8, 7: 25, 8: 100, 9: 500, 10: 5000 },
};

function getMultiplier(picked: number, matched: number): number {
  return PAYOUT_TABLE[picked]?.[matched] ?? 0;
}

// ─── Possible win calculator ──────────────────────────────────────────────────
function getPossibleWins(picked: number, betAmount: number): { matched: number; pay: number }[] {
  if (picked < 1) return [];
  const table = PAYOUT_TABLE[picked] ?? {};
  return Object.entries(table)
    .filter(([, mul]) => mul > 0)
    .map(([m, mul]) => ({ matched: Number(m), pay: Math.round(betAmount * mul * 100) / 100 }))
    .sort((a, b) => a.matched - b.matched);
}

// ─── Countdown ────────────────────────────────────────────────────────────────
function useCountdown(endsAt: number | null) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!endsAt) { setRemaining(0); return; }
    const tick = () => setRemaining(Math.max(0, endsAt - Date.now()));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [endsAt]);
  return remaining;
}

// ─── Number ball ─────────────────────────────────────────────────────────────
function Ball({
  num, picked, drawn, justDrawn,
}: {
  num: number;
  picked: boolean;
  drawn: boolean;
  justDrawn: boolean;
}) {
  const bg = justDrawn
    ? '#f59e0b'
    : picked && drawn
    ? '#22c55e'
    : picked
    ? '#3b82f6'
    : drawn
    ? 'rgba(245,158,11,0.25)'
    : 'rgba(255,255,255,0.07)';

  const color = picked || drawn || justDrawn ? '#fff' : '#94a3b8';
  const border = justDrawn
    ? '2px solid #f59e0b'
    : picked && drawn
    ? '2px solid #22c55e'
    : picked
    ? '2px solid #3b82f6'
    : drawn
    ? '1.5px solid rgba(245,158,11,0.4)'
    : '1px solid rgba(255,255,255,0.1)';

  return (
    <div style={{
      width: 34, height: 34, borderRadius: '50%',
      background: bg, border, color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 800,
      transition: 'background 0.3s, border 0.3s',
      transform: justDrawn ? 'scale(1.2)' : 'scale(1)',
      boxShadow: justDrawn ? '0 0 12px rgba(245,158,11,0.7)' : picked && drawn ? '0 0 8px rgba(34,197,94,0.5)' : 'none',
      cursor: 'pointer',
      userSelect: 'none',
    }}>
      {num}
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────
type Tab = 'game' | 'history' | 'payouts';

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'game', label: 'GAME', icon: '▶' },
    { key: 'history', label: 'HISTORY', icon: '⟳' },
    { key: 'payouts', label: 'PAYS', icon: '💰' },
  ];
  return (
    <div style={{
      display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)',
      background: '#0d1120',
    }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          flex: 1, padding: '10px 0', border: 'none', background: 'transparent',
          color: tab === t.key ? '#22c55e' : '#64748b',
          fontWeight: 700, fontSize: 12, cursor: 'pointer',
          borderBottom: tab === t.key ? '2px solid #22c55e' : '2px solid transparent',
          letterSpacing: '0.06em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        }}>
          <span>{t.icon}</span> {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function KenoScreen() {
  const navigate = useNavigate();
  const [state, setState] = useState<KenoRoundState>({ phase: 'idle', round: null, myBet: null, bets: [] });
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [betAmount, setBetAmount] = useState(10);
  const [placing, setPlacing] = useState(false);
  const [tab, setTab] = useState<Tab>('game');
  const [history, setHistory] = useState<HistoryRound[]>([]);
  const [lastDrawn, setLastDrawn] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [winFlash, setWinFlash] = useState<{ amount: number } | null>(null);
  const lastDrawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const endsAt = state.round?.bettingEndsAt ? new Date(state.round.bettingEndsAt).getTime() : null;
  const countdown = useCountdown(endsAt);
  const countdownSec = Math.ceil(countdown / 1000);

  // ── Fetch initial state ───────────────────────────────────────────────────
  const fetchState = useCallback(async () => {
    try {
      const s = await apiRequest<KenoRoundState>('GET', '/api/keno/state');
      setState(s);
    } catch { /* ignore */ }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const h = await apiRequest<HistoryRound[]>('GET', '/api/keno/history');
      setHistory(h);
    } catch { /* ignore */ }
  }, []);

  const fetchBalance = useCallback(async () => {
    try {
      const p = await apiRequest<{ mainBalance: number }>('GET', '/api/players/me');
      setBalance((p as any).mainBalance ?? (p as any).balance ?? null);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchState();
    fetchBalance();
  }, [fetchState, fetchBalance]);

  useEffect(() => {
    if (tab === 'history') fetchHistory();
  }, [tab, fetchHistory]);

  // ── Socket events ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onBettingOpen = (data: { roundId: string; endsAt: number }) => {
      setState(prev => ({
        ...prev,
        phase: 'betting',
        round: {
          id: data.roundId,
          status: 'betting',
          bettingEndsAt: new Date(data.endsAt).toISOString(),
          drawnNumbers: [],
        },
        myBet: null,
        bets: [],
      }));
      setPicked(new Set());
      setLastDrawn(null);
      setWinFlash(null);
      fetchBalance();
    };

    const onNumberDrawn = (data: { roundId: string; number: number; drawnSoFar: number[] }) => {
      setLastDrawn(data.number);
      if (lastDrawnTimerRef.current) clearTimeout(lastDrawnTimerRef.current);
      lastDrawnTimerRef.current = setTimeout(() => setLastDrawn(null), 800);

      setState(prev => {
        if (!prev.round || prev.round.id !== data.roundId) return prev;
        return {
          ...prev,
          phase: 'drawing',
          round: { ...prev.round, drawnNumbers: data.drawnSoFar, status: 'drawing' },
        };
      });
    };

    const onRoundFinished = (data: { roundId: string; drawnNumbers: number[] }) => {
      setState(prev => {
        if (!prev.round || prev.round.id !== data.roundId) return prev;
        const newState = {
          ...prev,
          phase: 'finished' as const,
          round: { ...prev.round, drawnNumbers: data.drawnNumbers, status: 'finished' },
        };
        return newState;
      });
      // Refresh to get payout info, then flash win
      setTimeout(async () => {
        const s = await apiRequest<KenoRoundState>('GET', '/api/keno/state').catch(() => null);
        if (s?.myBet?.payout && s.myBet.payout > 0) {
          setWinFlash({ amount: s.myBet.payout });
          setTimeout(() => setWinFlash(null), 4000);
        }
        fetchBalance();
        if (tab === 'history') fetchHistory();
      }, 1500);
    };

    socket.on('KENO_BETTING_OPEN', onBettingOpen);
    socket.on('KENO_NUMBER_DRAWN', onNumberDrawn);
    socket.on('KENO_ROUND_FINISHED', onRoundFinished);

    return () => {
      socket.off('KENO_BETTING_OPEN', onBettingOpen);
      socket.off('KENO_NUMBER_DRAWN', onNumberDrawn);
      socket.off('KENO_ROUND_FINISHED', onRoundFinished);
    };
  }, [tab, fetchBalance, fetchHistory]);

  // ── Pick toggle ───────────────────────────────────────────────────────────
  const togglePick = (n: number) => {
    if (state.phase !== 'betting' || state.myBet) return;
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(n)) { next.delete(n); return next; }
      if (next.size >= MAX_PICKS) return prev;
      next.add(n);
      return next;
    });
  };

  // ── Place bet ─────────────────────────────────────────────────────────────
  const placeBet = async () => {
    if (placing || picked.size === 0) return;
    setError(null);
    setPlacing(true);
    try {
      await apiRequest('POST', '/api/keno/bet', {
        betAmount,
        pickedNumbers: Array.from(picked),
      });
      await fetchState();
      await fetchBalance();
    } catch (e: any) {
      setError(e.message ?? 'Bet failed');
    } finally {
      setPlacing(false);
    }
  };

  const drawnSet = new Set(state.round?.drawnNumbers ?? []);
  const pickedArr = Array.from(picked);
  const possibleWins = getPossibleWins(
    state.myBet ? state.myBet.pickedNumbers.length : picked.size,
    state.myBet ? state.myBet.betAmount : betAmount,
  );

  // ── Derived: matched count live ───────────────────────────────────────────
  const liveMatched = state.myBet
    ? state.myBet.pickedNumbers.filter((n) => drawnSet.has(n)).length
    : pickedArr.filter((n) => drawnSet.has(n)).length;

  const activePicked: Set<number> = state.myBet ? new Set(state.myBet.pickedNumbers) : picked;

  return (
    <div style={{
      minHeight: '100dvh', background: '#070c1a', color: '#fff',
      fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column',
      maxWidth: 480, margin: '0 auto',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        background: 'linear-gradient(135deg, #0d1f0d 0%, #0a1628 100%)',
        borderBottom: '1px solid rgba(34,197,94,0.2)',
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          color: '#94a3b8', borderRadius: 10, padding: '6px 12px', cursor: 'pointer', fontSize: 13,
        }}>← Back</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: '#22c55e', letterSpacing: '-1px' }}>FAST</span>
          <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-1px' }}>KENO</span>
        </div>

        <div style={{
          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 10, padding: '5px 10px', fontSize: 12, fontWeight: 700, color: '#22c55e',
        }}>
          {balance !== null ? `${balance.toFixed(2)} ETB` : '—'}
        </div>
      </div>

      {/* ── Phase banner ── */}
      <PhaseBanner
        phase={state.phase}
        countdownSec={countdownSec}
        drawnCount={state.round?.drawnNumbers.length ?? 0}
        lastDrawn={lastDrawn}
        liveMatched={liveMatched}
        totalPicked={activePicked.size}
        winFlash={winFlash}
        myBet={state.myBet}
      />

      <TabBar tab={tab} onChange={setTab} />

      {/* ── GAME tab ── */}
      {tab === 'game' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 90px' }}>
          {/* Possible win row */}
          {possibleWins.length > 0 && (
            <div style={{
              background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
              borderRadius: 12, padding: '8px 12px', marginBottom: 10,
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>POSSIBLE WIN</span>
              {possibleWins.map(pw => (
                <span key={pw.matched} style={{
                  fontSize: 12, fontWeight: 800,
                  color: pw.matched === liveMatched && (state.phase === 'drawing' || state.phase === 'finished') ? '#22c55e' : '#f59e0b',
                  background: pw.matched === liveMatched && (state.phase === 'drawing' || state.phase === 'finished') ? 'rgba(34,197,94,0.15)' : 'transparent',
                  borderRadius: 6, padding: '2px 6px',
                }}>
                  Match {pw.matched} → {pw.pay.toFixed(2)}
                </span>
              ))}
            </div>
          )}

          {/* Number grid 1–80 */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)',
            gap: 4, marginBottom: 14,
          }}>
            {Array.from({ length: 80 }, (_, i) => i + 1).map(n => (
              <div key={n} onClick={() => togglePick(n)} style={{ display: 'flex', justifyContent: 'center' }}>
                <Ball
                  num={n}
                  picked={activePicked.has(n)}
                  drawn={drawnSet.has(n)}
                  justDrawn={lastDrawn === n}
                />
              </div>
            ))}
          </div>

          {/* Bet controls — only show while in betting phase and no bet placed yet */}
          {!state.myBet && state.phase === 'betting' && (
            <BetControls
              betAmount={betAmount}
              onBetAmount={setBetAmount}
              picked={picked}
              onClearPicks={() => setPicked(new Set())}
              onBet={placeBet}
              placing={placing}
              error={error}
            />
          )}

          {/* Already bet info */}
          {state.myBet && (
            <BetInfo myBet={state.myBet} liveMatched={liveMatched} drawnSet={drawnSet} phase={state.phase} />
          )}

          {/* Live bets list */}
          {state.bets.length > 0 && (
            <BetsList bets={state.bets} />
          )}
        </div>
      )}

      {/* ── HISTORY tab ── */}
      {tab === 'history' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 24px' }}>
          {history.length === 0 && (
            <div style={{ textAlign: 'center', color: '#475569', padding: 40, fontSize: 14 }}>No history yet</div>
          )}
          {history.map(r => <HistoryCard key={r.id} round={r} />)}
        </div>
      )}

      {/* ── PAYOUTS tab ── */}
      {tab === 'payouts' && <PayoutsTable />}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PhaseBanner({
  phase, countdownSec, drawnCount, lastDrawn, liveMatched, totalPicked, winFlash, myBet,
}: {
  phase: string;
  countdownSec: number;
  drawnCount: number;
  lastDrawn: number | null;
  liveMatched: number;
  totalPicked: number;
  winFlash: { amount: number } | null;
  myBet: KenoRoundState['myBet'];
}) {
  if (winFlash) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #14532d, #166534)',
        padding: '14px 16px', textAlign: 'center',
        borderBottom: '1px solid rgba(34,197,94,0.3)',
        animation: 'pulse 0.5s ease-out',
      }}>
        <div style={{ fontSize: 13, color: '#86efac', fontWeight: 700 }}>🎉 YOU WON!</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#22c55e' }}>+{winFlash.amount.toFixed(2)} ETB</div>
      </div>
    );
  }

  if (phase === 'betting') {
    return (
      <div style={{
        background: 'rgba(59,130,246,0.08)', padding: '10px 16px',
        borderBottom: '1px solid rgba(59,130,246,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>PICK UP TO {MAX_PICKS} NUMBERS</div>
          <div style={{ fontSize: 13, color: '#93c5fd', fontWeight: 700 }}>
            {totalPicked > 0 ? `${totalPicked} selected` : 'Choose your numbers'}
          </div>
        </div>
        <div style={{
          background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)',
          borderRadius: 10, padding: '6px 14px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, color: '#64748b' }}>CLOSES IN</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: countdownSec <= 5 ? '#ef4444' : '#60a5fa',
            fontVariantNumeric: 'tabular-nums' }}>
            {String(Math.floor(countdownSec / 60)).padStart(2, '0')}:{String(countdownSec % 60).padStart(2, '0')}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'drawing') {
    return (
      <div style={{
        background: 'rgba(245,158,11,0.08)', padding: '10px 16px',
        borderBottom: '1px solid rgba(245,158,11,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>DRAWING NUMBERS</div>
          {totalPicked > 0 && (
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>
              Matched: {liveMatched}/{totalPicked}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'center' }}>
          {lastDrawn ? (
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 900, boxShadow: '0 0 20px rgba(245,158,11,0.6)',
            }}>{lastDrawn}</div>
          ) : (
            <div style={{ fontSize: 11, color: '#64748b' }}>{drawnCount}/{TOTAL_DRAW}</div>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'finished') {
    const payout = myBet?.payout;
    return (
      <div style={{
        background: payout && payout > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.06)',
        padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>ROUND FINISHED</div>
          {myBet && (
            <div style={{ fontSize: 13, fontWeight: 700, color: payout && payout > 0 ? '#22c55e' : '#f87171' }}>
              {payout && payout > 0 ? `Won ${payout.toFixed(2)} ETB` : `Matched ${myBet.matched ?? 0}/${myBet.pickedNumbers.length}`}
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#475569' }}>Next round starting...</div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', padding: '10px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
      textAlign: 'center', color: '#475569', fontSize: 13,
    }}>
      Waiting for next round...
    </div>
  );
}

function BetControls({
  betAmount, onBetAmount, picked, onClearPicks, onBet, placing, error,
}: {
  betAmount: number;
  onBetAmount: (v: number) => void;
  picked: Set<number>;
  onClearPicks: () => void;
  onBet: () => void;
  placing: boolean;
  error: string | null;
}) {
  const QUICK = [5, 10, 50, 100, 200];
  const adj = (d: number) => onBetAmount(Math.max(MIN_BET, Math.min(MAX_BET, betAmount + d)));

  return (
    <div style={{
      background: '#111827', borderRadius: 14, padding: '12px',
      border: '1px solid rgba(255,255,255,0.07)', marginBottom: 12,
    }}>
      {/* Bet amount row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <button onClick={() => adj(-10)} style={adjBtn}>−</button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 22, fontWeight: 900, color: '#fff' }}>
          {betAmount.toFixed(2)}
        </div>
        <button onClick={() => adj(10)} style={adjBtn}>+</button>
        <button onClick={() => onBetAmount(MAX_BET)} style={{
          ...adjBtn, fontSize: 10, padding: '6px 8px', color: '#f59e0b',
        }}>MAX</button>
      </div>

      {/* Quick picks */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
        {QUICK.map(q => (
          <button key={q} onClick={() => onBetAmount(q)} style={{
            flex: 1, padding: '5px 0', background: betAmount === q ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${betAmount === q ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 8, color: betAmount === q ? '#22c55e' : '#94a3b8',
            fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>{q}</button>
        ))}
      </div>

      {/* Picks summary */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {picked.size === 0
            ? <span style={{ fontSize: 12, color: '#475569' }}>Tap numbers above to pick</span>
            : Array.from(picked).sort((a, b) => a - b).map(n => (
                <span key={n} style={{
                  background: '#1e40af', borderRadius: 6, padding: '2px 8px',
                  fontSize: 12, fontWeight: 700, color: '#93c5fd',
                }}>{n}</span>
              ))}
        </div>
        {picked.size > 0 && (
          <button onClick={onClearPicks} style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            color: '#f87171', borderRadius: 8, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
          }}>Clear</button>
        )}
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{error}</div>}

      {/* BET button */}
      <button
        onClick={onBet}
        disabled={placing || picked.size === 0}
        style={{
          width: '100%', padding: '14px 0',
          background: picked.size === 0 || placing
            ? 'rgba(255,255,255,0.05)'
            : 'linear-gradient(135deg, #16a34a, #15803d)',
          border: 'none', borderRadius: 12,
          color: picked.size === 0 || placing ? '#475569' : '#fff',
          fontSize: 16, fontWeight: 900, cursor: picked.size === 0 || placing ? 'not-allowed' : 'pointer',
          letterSpacing: '0.05em',
        }}
      >
        {placing ? 'Placing...' : picked.size === 0 ? 'Select numbers to bet' : `BET ${betAmount} ETB`}
      </button>
    </div>
  );
}

const adjBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 10,
  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
};

function BetInfo({
  myBet, liveMatched, drawnSet, phase,
}: {
  myBet: NonNullable<KenoRoundState['myBet']>;
  liveMatched: number;
  drawnSet: Set<number>;
  phase: string;
}) {
  const multiplier = getMultiplier(myBet.pickedNumbers.length, liveMatched);
  return (
    <div style={{
      background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)',
      borderRadius: 14, padding: '12px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>YOUR BET</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#22c55e' }}>{myBet.betAmount.toFixed(2)} ETB</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {myBet.pickedNumbers.sort((a, b) => a - b).map(n => (
          <span key={n} style={{
            borderRadius: 8, padding: '3px 8px', fontSize: 12, fontWeight: 800,
            background: drawnSet.has(n) ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)',
            color: drawnSet.has(n) ? '#4ade80' : '#93c5fd',
            border: drawnSet.has(n) ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(59,130,246,0.3)',
          }}>{n}</span>
        ))}
      </div>

      {(phase === 'drawing' || phase === 'finished') && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: '#64748b' }}>Matched: <strong style={{ color: '#fff' }}>{liveMatched}/{myBet.pickedNumbers.length}</strong></span>
          {multiplier > 0 && (
            <span style={{ color: '#f59e0b', fontWeight: 800 }}>
              x{multiplier} → {(myBet.betAmount * multiplier).toFixed(2)} ETB
            </span>
          )}
        </div>
      )}

      {phase === 'finished' && myBet.payout !== null && (
        <div style={{
          marginTop: 8, textAlign: 'center', fontWeight: 900, fontSize: 16,
          color: myBet.payout > 0 ? '#22c55e' : '#f87171',
        }}>
          {myBet.payout > 0 ? `+${myBet.payout.toFixed(2)} ETB` : 'No win this round'}
        </div>
      )}
    </div>
  );
}

function BetsList({ bets }: { bets: KenoRoundState['bets'] }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: '#475569', fontWeight: 700, marginBottom: 6 }}>
        ALL BETS ({bets.length})
      </div>
      {bets.map((b, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '7px 10px', borderRadius: 8,
          background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
          fontSize: 12,
        }}>
          <span style={{ color: '#94a3b8', fontWeight: 700 }}>
            {b.username.substring(0, 8).replace(/./g, (c, i2) => i2 > 1 && i2 < b.username.length - 1 ? '*' : c)}
          </span>
          <span style={{ color: '#64748b' }}>{b.pickedCount} picks</span>
          <span style={{ color: '#f59e0b', fontWeight: 700 }}>{b.betAmount.toFixed(0)} ETB</span>
          {b.payout !== null && (
            <span style={{ fontWeight: 800, color: b.payout > 0 ? '#22c55e' : '#475569' }}>
              {b.payout > 0 ? `+${b.payout.toFixed(0)}` : '—'}
            </span>
          )}
          {b.payout === null && <span style={{ color: '#64748b' }}>Waiting</span>}
        </div>
      ))}
    </div>
  );
}

function HistoryCard({ round }: { round: HistoryRound }) {
  return (
    <div style={{
      background: '#111827', borderRadius: 12, padding: '12px', marginBottom: 10,
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
        {round.drawnNumbers.map(n => {
          const isMyPick = round.myBet?.pickedNumbers.includes(n);
          return (
            <span key={n} style={{
              width: 26, height: 26, borderRadius: '50%',
              background: isMyPick ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.06)',
              border: isMyPick ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.1)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700,
              color: isMyPick ? '#4ade80' : '#64748b',
            }}>{n}</span>
          );
        })}
      </div>
      {round.myBet && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: '#64748b' }}>
            Matched {round.myBet.matched ?? 0}/{round.myBet.pickedNumbers.length} · {round.myBet.betAmount} ETB
          </span>
          <span style={{ fontWeight: 800, color: (round.myBet.payout ?? 0) > 0 ? '#22c55e' : '#f87171' }}>
            {(round.myBet.payout ?? 0) > 0 ? `+${round.myBet.payout!.toFixed(2)}` : 'Lost'}
          </span>
        </div>
      )}
    </div>
  );
}

function PayoutsTable() {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 24px' }}>
      <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 12 }}>
        Multiplier applied to your bet amount
      </div>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(picked => {
        const table = PAYOUT_TABLE[picked] ?? {};
        const entries = Object.entries(table).filter(([, m]) => m > 0);
        return (
          <div key={picked} style={{
            background: '#111827', borderRadius: 12, padding: '10px 12px', marginBottom: 8,
            border: '1px solid rgba(255,255,255,0.07)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', marginBottom: 6 }}>
              Pick {picked}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {entries.map(([m, mul]) => (
                <div key={m} style={{
                  background: 'rgba(255,255,255,0.04)', borderRadius: 8,
                  padding: '4px 10px', fontSize: 11, fontWeight: 700,
                }}>
                  <span style={{ color: '#64748b' }}>Match {m}: </span>
                  <span style={{ color: '#f59e0b' }}>x{mul}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
