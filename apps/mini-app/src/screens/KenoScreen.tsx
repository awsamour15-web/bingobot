import { useEffect, useRef, useState, useCallback, memo } from 'react';
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
  myBets: {
    id: string;
    pickedNumbers: number[];
    betAmount: number;
    matched: number | null;
    payout: number | null;
  }[];
  myBet: {
    id: string;
    pickedNumbers: number[];
    betAmount: number;
    matched: number | null;
    payout: number | null;
  } | null;
  bets: {
    username: string;
    pickedNumbers: number[];
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
  myBets: {
    pickedNumbers: number[];
    betAmount: number;
    matched: number | null;
    payout: number | null;
  }[];
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

// ─── Payout table ─────────────────────────────────────────────────────────────
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

function getPossibleWins(picked: number, betAmount: number): { matched: number; pay: number }[] {
  if (picked < 1) return [];
  const table = PAYOUT_TABLE[picked] ?? {};
  return Object.entries(table)
    .filter(([, mul]) => mul > 0)
    .map(([m, mul]) => ({ matched: Number(m), pay: Math.round(betAmount * mul * 100) / 100 }))
    .sort((a, b) => a.matched - b.matched);
}

function getBestPossibleWin(picked: number, betAmount: number): number {
  const wins = getPossibleWins(picked, betAmount);
  if (wins.length === 0) return 0;
  return wins[wins.length - 1]!.pay;
}

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

// Decorative dots matching reference screenshots
const DOT_NUMBERS = new Set([1, 4, 8, 14, 28, 38, 43, 58, 60, 64]);

// ─── Number cell ──────────────────────────────────────────────────────────────
const NumberCell = memo(function NumberCell({
  num, picked, drawn, justDrawn, onClick,
}: {
  num: number;
  picked: boolean;
  drawn: boolean;
  justDrawn: boolean;
  onClick: () => void;
}) {
  let bg = '#1e2d42';
  let color = '#8fa8c8';
  let borderColor = 'rgba(255,255,255,0.06)';
  let fontWeight = 600;

  if (justDrawn) {
    bg = '#22c55e';
    color = '#fff';
    borderColor = '#22c55e';
    fontWeight = 900;
  } else if (picked && drawn) {
    bg = '#22c55e';
    color = '#fff';
    borderColor = '#22c55e';
    fontWeight = 900;
  } else if (picked) {
    bg = 'rgba(34,197,94,0.3)';
    color = '#fff';
    borderColor = '#22c55e';
    fontWeight = 800;
  } else if (drawn) {
    bg = '#2a3a52';
    color = '#e2e8f0';
    borderColor = 'rgba(255,255,255,0.15)';
    fontWeight = 700;
  }

  const hasDot = DOT_NUMBERS.has(num);
  // Reference: blue dots on some numbers, red on others
  const dotColor = drawn ? '#22c55e' : (num % 2 === 0 ? '#ef4444' : '#3b82f6');

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        aspectRatio: '1',
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 7,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        fontWeight,
        color,
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'background 0.15s, border-color 0.15s',
        transform: justDrawn ? 'scale(1.12)' : 'scale(1)',
        boxShadow: justDrawn
          ? '0 0 12px rgba(34,197,94,0.8)'
          : (picked && drawn)
          ? '0 0 8px rgba(34,197,94,0.5)'
          : picked
          ? '0 0 6px rgba(34,197,94,0.3)'
          : 'none',
      }}
    >
      {num}
      {hasDot && (
        <div style={{
          position: 'absolute',
          top: 2,
          left: 3,
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: dotColor,
          opacity: 0.9,
        }} />
      )}
    </div>
  );
});

// ─── Tab bar ──────────────────────────────────────────────────────────────────
type Tab = 'game' | 'history' | 'results' | 'statistics';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'game',       label: 'GAME',       icon: '▶' },
  { key: 'history',    label: 'HISTORY',    icon: '↺' },
  { key: 'results',    label: 'RESULTS',    icon: '✔' },
  { key: 'statistics', label: 'STATISTICS', icon: '📊' },
];

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div style={{
      display: 'flex',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      background: '#0d1120',
      flexShrink: 0,
    }}>
      {TABS.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            flex: 1,
            padding: '10px 0',
            border: 'none',
            background: 'transparent',
            color: tab === t.key ? '#22c55e' : '#475569',
            fontWeight: 700,
            fontSize: 10,
            cursor: 'pointer',
            borderBottom: tab === t.key ? '2px solid #22c55e' : '2px solid transparent',
            borderTop: 'none',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
          }}
        >
          <span style={{ fontSize: 11 }}>{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function KenoScreen() {
  const navigate = useNavigate();
  const [state, setState] = useState<KenoRoundState>({ phase: 'idle', round: null, myBets: [], myBet: null, bets: [] });
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [betAmount, setBetAmount] = useState(MIN_BET);
  const [placing, setPlacing] = useState(false);
  const [tab, setTab] = useState<Tab>('game');
  const [history, setHistory] = useState<HistoryRound[]>([]);
  const [lastDrawn, setLastDrawn] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [winFlash, setWinFlash] = useState<{ amount: number } | null>(null);
  const lastDrawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [revealedCount, setRevealedCount] = useState<number>(0);
  const revealIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const endsAt = state.round?.bettingEndsAt ? new Date(state.round.bettingEndsAt).getTime() : null;
  const countdown = useCountdown(endsAt);
  const countdownSec = Math.ceil(countdown / 1000);

  const fetchState = useCallback(async () => {
    try {
      const s = await apiRequest<KenoRoundState>('GET', '/api/keno/state');
      setState(s);
      if (s.phase === 'drawing' && s.round && s.round.drawnNumbers.length > 0) {
        const nums = s.round.drawnNumbers;
        setRevealedCount(0);
        if (revealIntervalRef.current) clearInterval(revealIntervalRef.current);
        let idx = 0;
        revealIntervalRef.current = setInterval(() => {
          idx++;
          setLastDrawn(nums[idx - 1] ?? null);
          setRevealedCount(idx);
          if (lastDrawnTimerRef.current) clearTimeout(lastDrawnTimerRef.current);
          lastDrawnTimerRef.current = setTimeout(() => setLastDrawn(null), 1500);
          if (idx >= nums.length) {
            clearInterval(revealIntervalRef.current!);
            revealIntervalRef.current = null;
          }
        }, 300);
      } else if (s.phase === 'finished') {
        setRevealedCount(s.round?.drawnNumbers.length ?? 0);
      } else {
        setRevealedCount(0);
      }
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
      const p = await apiRequest<{ mainWallet: { balance: number }; id: string }>('GET', '/api/players/me');
      setBalance(p.mainWallet?.balance ?? null);
      if (p.id) setPlayerId(String(p.id).slice(-8).toUpperCase());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchState();
    fetchBalance();
    return () => {
      if (revealIntervalRef.current) clearInterval(revealIntervalRef.current);
      if (lastDrawnTimerRef.current) clearTimeout(lastDrawnTimerRef.current);
    };
  }, [fetchState, fetchBalance]);

  useEffect(() => {
    if (tab === 'history' || tab === 'results' || tab === 'statistics') fetchHistory();
  }, [tab, fetchHistory]);

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
        myBets: [],
        myBet: null,
        bets: [],
      }));
      setPicked(new Set());
      setLastDrawn(null);
      setRevealedCount(0);
      if (revealIntervalRef.current) { clearInterval(revealIntervalRef.current); revealIntervalRef.current = null; }
      setWinFlash(null);
      fetchBalance();
    };

    const onNumberDrawn = (data: { roundId: string; number: number; drawnSoFar: number[] }) => {
      setLastDrawn(data.number);
      setRevealedCount(data.drawnSoFar.length);
      if (lastDrawnTimerRef.current) clearTimeout(lastDrawnTimerRef.current);
      lastDrawnTimerRef.current = setTimeout(() => setLastDrawn(null), 1500);
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
      if (revealIntervalRef.current) { clearInterval(revealIntervalRef.current); revealIntervalRef.current = null; }
      setRevealedCount(data.drawnNumbers.length);
      setState(prev => {
        if (!prev.round || prev.round.id !== data.roundId) return prev;
        return {
          ...prev,
          phase: 'finished' as const,
          round: { ...prev.round, drawnNumbers: data.drawnNumbers, status: 'finished' },
        };
      });
      setTimeout(async () => {
        const s = await apiRequest<KenoRoundState>('GET', '/api/keno/state').catch(() => null);
        if (s?.myBets && s.myBets.length > 0) {
          const totalPayout = s.myBets.reduce((sum, b) => sum + (b.payout ?? 0), 0);
          if (totalPayout > 0) {
            setWinFlash({ amount: totalPayout });
            setTimeout(() => setWinFlash(null), 4000);
          }
        }
        fetchBalance();
        if (tab === 'history' || tab === 'results') fetchHistory();
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

  const togglePick = useCallback((n: number) => {
    if (state.phase !== 'betting') return;
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(n)) { next.delete(n); return next; }
      if (next.size >= MAX_PICKS) return prev;
      next.add(n);
      return next;
    });
  }, [state.phase]);

  const placeBet = async () => {
    if (placing || picked.size === 0) return;
    setError(null);
    setPlacing(true);
    const pickedArr = Array.from(picked);
    // Optimistically clear picks immediately for snappy UX
    setPicked(new Set());
    try {
      const res = await apiRequest<{ betId: string; roundId: string; pickedNumbers: number[]; betAmount: number }>('POST', '/api/keno/bet', {
        betAmount,
        pickedNumbers: pickedArr,
      });
      // Optimistically add the bet to state without waiting for fetchState
      setState(prev => ({
        ...prev,
        myBets: [...prev.myBets, {
          id: res.betId,
          pickedNumbers: pickedArr,
          betAmount,
          matched: null,
          payout: null,
        }],
      }));
      // Refresh in background — no await
      fetchState().catch(() => {});
      fetchBalance().catch(() => {});
    } catch (e: any) {
      // Restore picks on failure
      setPicked(new Set(pickedArr));
      setError(e.message ?? 'Bet failed');
    } finally {
      setPlacing(false);
    }
  };

  // Stable per-cell click handlers — use a ref to always call latest togglePick
  const togglePickRef = useRef(togglePick);
  useEffect(() => { togglePickRef.current = togglePick; }, [togglePick]);
  const cellClickHandlers = useRef<Map<number, () => void>>(new Map());
  const getCellHandler = useCallback((n: number) => {
    if (!cellClickHandlers.current.has(n)) {
      cellClickHandlers.current.set(n, () => togglePickRef.current(n));
    }
    return cellClickHandlers.current.get(n)!;
  }, []);

  const allDrawnNumbers = state.round?.drawnNumbers ?? [];
  const visibleDrawnNumbers = allDrawnNumbers.slice(0, revealedCount);
  const drawnSet = new Set(visibleDrawnNumbers);
  const activePicked: Set<number> = (state.myBets.length > 0)
    ? new Set(state.myBets.flatMap(b => b.pickedNumbers))
    : picked;
  const activePickedArr = Array.from(activePicked);
  const activeBetAmount = state.myBets.length > 0 ? state.myBets[0]!.betAmount : betAmount;
  const liveMatched = state.myBets.length > 0
    ? state.myBets[0]!.pickedNumbers.filter(n => drawnSet.has(n)).length
    : activePickedArr.filter(n => drawnSet.has(n)).length;
  const possibleWins = getPossibleWins(picked.size > 0 ? picked.size : (state.myBets[0]?.pickedNumbers.length ?? 0), betAmount);
  const bestWin = getBestPossibleWin(picked.size > 0 ? picked.size : (state.myBets[0]?.pickedNumbers.length ?? 0), betAmount);

  const cdMins = String(Math.floor(countdownSec / 60)).padStart(2, '0');
  const cdSecs = String(countdownSec % 60).padStart(2, '0');

  return (
    <div style={{
      height: '100dvh',
      background: '#131a2e',
      color: '#fff',
      fontFamily: "'Inter', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      maxWidth: '100vw',
      position: 'relative',
    }}>
      {/* ── Top header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        background: '#0d1120',
        flexShrink: 0,
        minHeight: 42,
      }}>
        {/* FAST KENO logo */}
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, minWidth: 50 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: '#22c55e', letterSpacing: 1 }}>FAST</span>
          <span style={{ fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: 1 }}>KENO</span>
        </div>

        {/* Balance + ID */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 5,
            padding: '3px 8px',
            fontSize: 12,
            fontWeight: 700,
            color: '#fff',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ fontSize: 11, color: '#fff', fontWeight: 700 }}>
              {balance !== null ? balance.toFixed(2) : '0.00'}
            </span>
            <span style={{ fontSize: 10, color: '#64748b' }}>ETB</span>
          </div>
          {(state.round?.id || playerId) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 700, color: '#94a3b8',
            }}>
              <span>ID: {state.round?.id
                ? state.round.id.replace(/\D/g, '').slice(-8).padStart(8, '0')
                : playerId}</span>
              <span style={{
                width: 16, height: 16, borderRadius: '50%',
                background: '#22c55e',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: '#fff', fontWeight: 900,
              }}>✔</span>
            </div>
          )}
        </div>

        {/* Hamburger */}
        <button
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', gap: 3.5, padding: '2px 4px',
          }}
          title="Menu"
        >
          <span style={{ display: 'block', width: 18, height: 2, background: '#22c55e', borderRadius: 2 }} />
          <span style={{ display: 'block', width: 18, height: 2, background: '#22c55e', borderRadius: 2 }} />
          <span style={{ display: 'block', width: 18, height: 2, background: '#22c55e', borderRadius: 2 }} />
        </button>
      </div>

      {/* ── Countdown — only show during betting phase ── */}
      {state.phase === 'betting' && (
      <div style={{ textAlign: 'center', padding: '4px 0 2px', background: '#0d1120', flexShrink: 0 }}>
        <div style={{
          display: 'inline-block',
          background: '#1a2340',
          borderRadius: 5,
          padding: '2px 18px',
          fontSize: 18,
          fontWeight: 900,
          color: countdownSec <= 5 ? '#ef4444' : '#fff',
          letterSpacing: 4,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {cdMins} : {cdSecs}
        </div>
      </div>
      )}

      {/* ── Win flash ── */}
      {winFlash && (
        <div style={{
          background: 'linear-gradient(135deg, #14532d, #166534)',
          padding: '5px 12px',
          textAlign: 'center',
          flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 13, color: '#86efac', fontWeight: 700 }}>🎉 YOU WON!</span>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#22c55e' }}>+{winFlash.amount.toFixed(2)} ETB</span>
        </div>
      )}

      {/* ── Scrollable middle content ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0, WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>

      {/* ── Drawing/finished phase — always visible on all tabs ── */}
      {(state.phase === 'drawing' || state.phase === 'finished') && (
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <DrawingMachine
            drawnNumbers={visibleDrawnNumbers}
            lastDrawn={lastDrawn}
            totalDraw={TOTAL_DRAW}
          />
          {/* Called numbers: two rows of balls */}
          <div style={{ padding: '6px 10px 4px', background: '#0d1120' }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4, flexWrap: 'nowrap' }}>
              {Array.from({ length: 10 }, (_, i) => visibleDrawnNumbers[i] ?? null).map((n, i) => (
                <div key={i} style={{
                  flex: 1, height: 32, borderRadius: '50%',
                  background: n !== null
                    ? (n === lastDrawn ? 'radial-gradient(circle at 35% 30%, #5a6578, #2a3545)' : 'radial-gradient(circle at 35% 30%, #4a5568, #1e2a3a)')
                    : 'transparent',
                  border: n !== null ? '1.5px solid rgba(255,255,255,0.18)' : 'none',
                  boxShadow: n === lastDrawn ? '0 0 10px rgba(34,197,94,0.5)' : n !== null ? 'inset 0 1px 3px rgba(255,255,255,0.1)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 900,
                  color: n !== null ? '#e2e8f0' : 'transparent',
                  transition: 'background 0.2s', minWidth: 0,
                }}>{n ?? ''}</div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
              {Array.from({ length: 10 }, (_, i) => visibleDrawnNumbers[i + 10] ?? null).map((n, i) => (
                <div key={i} style={{
                  flex: 1, height: 32, borderRadius: '50%',
                  background: n !== null
                    ? (n === lastDrawn ? 'radial-gradient(circle at 35% 30%, #5a6578, #2a3545)' : 'radial-gradient(circle at 35% 30%, #4a5568, #1e2a3a)')
                    : 'transparent',
                  border: n !== null ? '1.5px solid rgba(255,255,255,0.18)' : 'none',
                  boxShadow: n === lastDrawn ? '0 0 10px rgba(34,197,94,0.5)' : n !== null ? 'inset 0 1px 3px rgba(255,255,255,0.1)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 900,
                  color: n !== null ? '#e2e8f0' : 'transparent',
                  transition: 'background 0.2s', minWidth: 0,
                }}>{n ?? ''}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Betting/idle phase — always visible on all tabs ── */}
      {(state.phase === 'betting' || state.phase === 'idle') && (
        <>
          {/* Info panel */}
          <div style={{ background: 'linear-gradient(135deg, #1a2a40 0%, #162035 60%, #0f1a2e 100%)', margin: '4px 6px', borderRadius: 12, padding: '10px 12px', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
            {/* subtle wave lines */}
            <div style={{ position: 'absolute', right: -10, top: -10, width: 120, height: 120, borderRadius: '50%', border: '1.5px solid rgba(34,197,94,0.06)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', right: 10, top: 10, width: 80, height: 80, borderRadius: '50%', border: '1.5px solid rgba(34,197,94,0.05)', pointerEvents: 'none' }} />
            {picked.size === 0 ? (
              /* No picks yet */
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '4px 0' }}>
                <div style={{ position: 'relative', width: 60, height: 42, flexShrink: 0, marginTop: 4 }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, width: 34, height: 34, borderRadius: '50%',
                    background: 'radial-gradient(circle at 35% 30%, #5a6880, #1e2a3a)',
                    border: '2px solid rgba(255,255,255,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 900, color: '#cbd5e1',
                    boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1)',
                  }}>80</div>
                  <div style={{
                    position: 'absolute', top: 6, left: 22, width: 34, height: 34, borderRadius: '50%',
                    background: 'radial-gradient(circle at 35% 30%, #4a5a70, #1a2535)',
                    border: '2px solid rgba(255,255,255,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 900, color: '#e2e8f0',
                    boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.12)',
                  }}>10</div>
                </div>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 28%, #34d058, #15803d)',
                  border: '3px solid rgba(34,197,94,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 900, color: '#fff', flexShrink: 0,
                  boxShadow: '0 0 16px rgba(34,197,94,0.5)',
                }}>1</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1.15 }}>Choose {MAX_PICKS}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1.15, marginBottom: 2 }}>numbers</div>
                  <div style={{ fontSize: 16, color: '#22c55e', fontWeight: 700 }}>From 1 to 80</div>
                </div>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: '#1a3a2a', border: '1.5px solid rgba(34,197,94,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, color: '#22c55e', cursor: 'pointer', flexShrink: 0, fontWeight: 900,
                }}>?</div>
              </div>
            ) : (
              /* Has picks */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ position: 'relative', width: 40, height: 28, flexShrink: 0 }}>
                      <div style={{
                        position: 'absolute', top: 0, left: 0, width: 22, height: 22, borderRadius: '50%',
                        background: 'radial-gradient(circle at 35% 30%, #4a5568, #1e293b)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 8, fontWeight: 900, color: '#cbd5e1',
                      }}>80</div>
                      <div style={{
                        position: 'absolute', top: 3, left: 13, width: 22, height: 22, borderRadius: '50%',
                        background: 'radial-gradient(circle at 35% 30%, #374151, #1e293b)',
                        border: '1px solid rgba(255,255,255,0.25)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 8, fontWeight: 900, color: '#e2e8f0',
                      }}>10</div>
                    </div>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: 'radial-gradient(circle at 35% 30%, #22c55e, #15803d)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 900, color: '#fff', flexShrink: 0,
                    }}>{picked.size}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Choose {MAX_PICKS} numbers</div>
                      <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>From 1 to 80</div>
                    </div>
                  </div>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: '#1a3a2a', border: '1px solid rgba(34,197,94,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, color: '#22c55e', cursor: 'pointer', flexShrink: 0,
                  }}>?</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{picked.size}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>Possible win</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: '#22c55e' }}>{Math.round(bestWin)}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 9, color: '#64748b', marginBottom: 1 }}>Match</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {possibleWins.map(pw => (
                        <span key={pw.matched} style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>{pw.matched}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: '#64748b', marginBottom: 1 }}>Pays</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {possibleWins.map(pw => (
                        <span key={pw.matched} style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>
                          x{PAYOUT_TABLE[picked.size]?.[pw.matched] ?? 0}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {Array.from(picked).sort((a,b)=>a-b).map(n => (
                    <span key={n} style={{
                      background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 700, color: '#fff',
                    }}>{n}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Number grid 1–80 */}
          <div style={{ padding: '4px 6px', flexShrink: 0 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(10, 1fr)',
              gap: 3,
            }}>
              {Array.from({ length: 80 }, (_, i) => i + 1).map(n => (
                <NumberCell
                  key={n}
                  num={n}
                  picked={picked.has(n)}
                  drawn={drawnSet.has(n)}
                  justDrawn={lastDrawn === n}
                  onClick={getCellHandler(n)}
                />
              ))}
            </div>
          </div>

          {/* ── Bet controls ── */}
          <div style={{ padding: '5px 6px 4px', background: '#0d1120', flexShrink: 0 }}>
            {error && (
              <div style={{ color: '#f87171', fontSize: 11, marginBottom: 3, textAlign: 'center' }}>{error}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
              {/* − button */}
              <button onClick={() => setBetAmount(v => Math.max(MIN_BET, v - 1))} style={ctrlBtn}>−</button>
              {/* Amount */}
              <div style={{
                flex: 1, background: '#1a2340', borderRadius: 8, height: 42,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 900, color: '#fff',
              }}>
                {betAmount}
              </div>
              {/* + button */}
              <button onClick={() => setBetAmount(v => Math.min(MAX_BET, v + 1))} style={ctrlBtn}>+</button>
              {/* X2 */}
              <button
                onClick={() => setBetAmount(v => Math.min(MAX_BET, v * 2))}
                style={{ ...ctrlBtn, color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)', background: '#0d1a14', width: 46 }}
              >X2</button>
              {/* MAX */}
              <button
                onClick={() => setBetAmount(MAX_BET)}
                style={{ ...ctrlBtn, color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)', background: '#0d1a14', width: 46 }}
              >MAX</button>
            </div>

            {/* BET button */}
            <button
              onClick={placeBet}
              disabled={placing || picked.size === 0 || state.phase !== 'betting'}
              style={{
                width: '100%',
                padding: '14px 0',
                background: 'linear-gradient(180deg, #1a6b2e 0%, #145524 100%)',
                border: 'none',
                borderRadius: 8,
                color: (state.phase === 'betting' && picked.size > 0 && !placing)
                  ? '#22c55e'
                  : 'rgba(34,197,94,0.35)',
                fontSize: 18,
                fontWeight: 900,
                cursor: (state.phase === 'betting' && picked.size > 0 && !placing) ? 'pointer' : 'not-allowed',
                letterSpacing: '0.12em',
                opacity: (state.phase === 'betting' && picked.size > 0 && !placing) ? 1 : 0.7,
              }}
            >
              {placing ? 'Placing...' : state.myBets.length > 0 ? `BET #${state.myBets.length + 1}` : 'BET'}
            </button>
          </div>
        </>
      )}

      </div>{/* end scrollable middle content */}

      {/* ── Tab bar ── */}
      <TabBar tab={tab} onChange={setTab} />

      {/* ── Content below tab bar ── */}
      {tab === 'game' && (
        <BetsFeed bets={state.bets} myBets={state.myBets} drawnSet={drawnSet} phase={state.phase} />
      )}

      {tab === 'history' && (
        <div style={{ flex: 1, overflowY: 'auto', background: '#0d1120', minHeight: 0 }}>
          {history.length === 0 ? (
            <FairnessEmptyState />
          ) : (
            <div style={{ padding: '8px 10px 16px' }}>
              {history.map(r => <HistoryCard key={r.id} round={r} />)}
            </div>
          )}
        </div>
      )}

      {tab === 'results' && (
        <div style={{ flex: 1, overflowY: 'auto', background: '#0d1120', minHeight: 0 }}>
          {history.length === 0 ? (
            <FairnessEmptyState />
          ) : (
            <div style={{ padding: '8px 8px 16px' }}>
              {history.slice(0, 20).map(r => {
                const date = new Date(r.finishedAt);
                const dateStr = `${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getFullYear().toString().slice(-2)} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}:${date.getSeconds().toString().padStart(2,'0')}`;
                const shortId = r.id.slice(-8).toUpperCase();
                const myBetsR = r.myBets ?? (r.myBet ? [r.myBet] : []);
                const firstRow = r.drawnNumbers.slice(0, 10);
                const secondRow = r.drawnNumbers.slice(10, 20);
                return (
                  <div key={r.id} style={{
                    background: '#111827', borderRadius: 8, padding: '8px 10px',
                    marginBottom: 6, border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%',
                          background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, color: '#22c55e',
                        }}>✔</div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#e2e8f0' }}>{shortId}</div>
                          <div style={{ fontSize: 9, color: '#475569' }}>{dateStr}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: 9, color: '#475569', fontWeight: 600 }}>Combination</span>
                    </div>
                    <div style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
                      {firstRow.map(n => {
                        const isMyPick = myBetsR.some(b => b.pickedNumbers.includes(n));
                        return (
                          <div key={n} style={{
                            flex: 1, height: 22,
                            background: isMyPick ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
                            border: `1px solid ${isMyPick ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 3,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 800,
                            color: isMyPick ? '#4ade80' : '#64748b',
                          }}>{n}</div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {secondRow.map(n => {
                        const isMyPick = myBetsR.some(b => b.pickedNumbers.includes(n));
                        return (
                          <div key={n} style={{
                            flex: 1, height: 22,
                            background: isMyPick ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
                            border: `1px solid ${isMyPick ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 3,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 800,
                            color: isMyPick ? '#4ade80' : '#64748b',
                          }}>{n}</div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'statistics' && (
        <div style={{ flex: 1, overflowY: 'auto', background: '#0d1120', padding: '8px 8px 16px', minHeight: 0 }}>
          <StatisticsView history={history} />
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ctrlBtn: React.CSSProperties = {
  width: 40,
  height: 42,
  borderRadius: 8,
  background: '#1a2340',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff',
  fontSize: 18,
  fontWeight: 700,
  cursor: 'pointer',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function DrawingMachine({
  drawnNumbers, lastDrawn, totalDraw,
}: {
  drawnNumbers: number[];
  lastDrawn: number | null;
  totalDraw: number;
}) {
  const current = lastDrawn ?? drawnNumbers[drawnNumbers.length - 1] ?? null;

  return (
    <div style={{
      position: 'relative',
      background: 'radial-gradient(ellipse at 50% 55%, rgba(34,197,94,0.07) 0%, #0a1208 55%, #0d1120 100%)',
      flexShrink: 0,
      height: 200,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {/* Counter top-right */}
      <div style={{ position: 'absolute', top: 8, right: 12, fontSize: 11, fontWeight: 700, color: '#475569' }}>
        {drawnNumbers.length} / {totalDraw}
      </div>
      {/* Circular rings */}
      {[160, 120, 85].map((size, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: size, height: size,
          borderRadius: '50%',
          border: `1px solid rgba(34,197,94,${0.07 - i * 0.02})`,
        }} />
      ))}
      {/* Main ball */}
      {current !== null ? (
        <div style={{
          width: 90, height: 90, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 28%, #5a6a80, #1a2535)',
          border: '2px solid rgba(255,255,255,0.2)',
          boxShadow: '0 0 24px rgba(34,197,94,0.25), inset 0 2px 6px rgba(255,255,255,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, fontWeight: 900, color: '#fff',
          zIndex: 2,
          transform: lastDrawn !== null ? 'scale(1.06)' : 'scale(1)',
          transition: 'transform 0.15s ease-out',
        }}>
          {current}
        </div>
      ) : (
        <div style={{
          width: 90, height: 90, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, rgba(34,197,94,0.1), rgba(34,197,94,0.02))',
          border: '2px solid rgba(34,197,94,0.08)',
          zIndex: 2,
        }} />
      )}
    </div>
  );
}

function FairnessEmptyState() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      paddingTop: 60, gap: 14,
    }}>
      {/* Shield */}
      <div style={{
        width: 70, height: 75,
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Outer shield shape */}
        <svg width="70" height="75" viewBox="0 0 70 75" fill="none">
          <path d="M35 2L5 14V38C5 54 18 68 35 73C52 68 65 54 65 38V14L35 2Z"
            fill="rgba(34,197,94,0.08)"
            stroke="rgba(34,197,94,0.5)"
            strokeWidth="1.5"
          />
          <path d="M35 8L11 18V38C11 51 21 63 35 67C49 63 59 51 59 38V18L35 8Z"
            fill="rgba(34,197,94,0.12)"
          />
          <text x="35" y="46" textAnchor="middle" fontSize="22" fontWeight="900" fill="#22c55e">✔</text>
        </svg>
      </div>
      <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: 3 }}>FAIRNESS</div>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
      }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: '#e2e8f0', letterSpacing: 4 }}>ATLAS-V</div>
        <div style={{ fontSize: 9, fontWeight: 600, color: '#64748b', letterSpacing: 6 }}>GAMING</div>
      </div>
    </div>
  );
}

function HistoryCard({ round }: { round: HistoryRound }) {
  const myBets = round.myBets ?? (round.myBet ? [round.myBet] : []);
  if (myBets.length === 0) return null;

  const date = new Date(round.finishedAt);
  const dateStr = `${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getFullYear().toString().slice(-2)} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}:${date.getSeconds().toString().padStart(2,'0')}`;

  return (
    <div style={{
      background: '#111827', borderRadius: 10, padding: '10px 12px',
      marginBottom: 8, border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: 10, color: '#475569', marginBottom: 6 }}>{dateStr}</div>
      {myBets.map((b, i) => {
        const won = (b.payout ?? 0) > 0;
        return (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '5px 0',
            borderBottom: i < myBets.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
          }}>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Bet #{i + 1} · {b.betAmount} ETB · Matched {b.matched ?? 0}/{b.pickedNumbers.length}
            </div>
            <div style={{
              fontSize: 13, fontWeight: 800,
              color: won ? '#22c55e' : '#f87171',
            }}>
              {won ? `+${b.payout!.toFixed(2)}` : 'Lost'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Bets feed ────────────────────────────────────────────────────────────────
function BetsFeed({
  bets, myBets, drawnSet, phase,
}: {
  bets: KenoRoundState['bets'];
  myBets: KenoRoundState['myBets'];
  drawnSet: Set<number>;
  phase: string;
}) {
  const isDrawingOrFinished = phase === 'drawing' || phase === 'finished';
  const myBetCount = myBets.length;

  return (
    <div style={{
      background: '#0d1120',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      flex: 1,
      overflowY: 'auto',
      minHeight: 0,
    }}>
      {/* Counts row */}
      <div style={{
        display: 'flex', gap: 18,
        padding: '5px 12px 4px',
        fontSize: 11, color: '#475569', fontWeight: 700,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <span>All {bets.length}</span>
        <span>My Tickets {myBetCount}</span>
        <span>My Bets {myBetCount}</span>
      </div>

      {bets.map((b, i) => {
        const masked = b.username.length > 2
          ? b.username[0] + '***' + b.username[b.username.length - 1]
          : b.username;
        const slots = Array.from({ length: 10 }, (_, j) => b.pickedNumbers[j] ?? null);
        return (
          <div key={i} style={{
            padding: '6px 10px 5px',
            borderBottom: '1px solid rgba(255,255,255,0.03)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
              {masked}
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {slots.map((num, j) => {
                const isMatched = num !== null && drawnSet.has(num) && isDrawingOrFinished;
                const hasNum = num !== null;
                return (
                  <div key={j} style={{
                    flex: 1, height: 26,
                    background: isMatched ? '#22c55e' : hasNum ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isMatched ? '#22c55e' : hasNum ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'}`,
                    borderRadius: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 800,
                    color: isMatched ? '#fff' : hasNum ? '#e2e8f0' : 'transparent',
                  }}>
                    {num ?? ''}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Statistics view ──────────────────────────────────────────────────────────
function StatisticsView({ history }: { history: HistoryRound[] }) {
  // Frequency: how many times each number was drawn across all rounds
  const freq: Record<number, number> = {};
  for (const r of history) {
    for (const n of r.drawnNumbers) {
      freq[n] = (freq[n] ?? 0) + 1;
    }
  }

  // Build sorted list: number → count, sorted by number
  const allNums = Array.from({ length: 80 }, (_, i) => i + 1);
  const maxCount = Math.max(...allNums.map(n => freq[n] ?? 0), 1);

  return (
    <div>
      {/* Last N rounds header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 2px 8px',
      }}>
        <span style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>
          Last {history.length} rounds
        </span>
        <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, cursor: 'pointer' }}>
          Sort
        </span>
      </div>

      {history.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#475569', padding: 30, fontSize: 13 }}>No data yet</div>
      ) : (
        /* Show frequency bar list matching screenshot style */
        allNums.slice(0, 30).map(n => {
          const count = freq[n] ?? 0;
          const pct = (count / maxCount) * 100;
          return (
            <div key={n} style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 5,
              padding: '5px 10px',
              marginBottom: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', width: 18, textAlign: 'right', flexShrink: 0 }}>{n}</span>
              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                  borderRadius: 2,
                  transition: 'width 0.3s',
                }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', width: 22, textAlign: 'right', flexShrink: 0 }}>{count}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
