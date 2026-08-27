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
const DOT_NUMBERS = new Set([3, 6, 10, 11, 18, 24, 27, 29, 33, 36, 48, 56, 57, 65, 68, 71, 74, 78]);

// ─── Number cell ──────────────────────────────────────────────────────────────
function NumberCell({
  num, picked, drawn, justDrawn, onClick,
}: {
  num: number;
  picked: boolean;
  drawn: boolean;
  justDrawn: boolean;
  onClick: () => void;
}) {
  let bg = 'transparent';
  let color = '#94a3b8';
  let borderColor = 'rgba(255,255,255,0.08)';
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
    bg = 'rgba(34,197,94,0.25)';
    color = '#fff';
    borderColor = '#22c55e';
    fontWeight = 800;
  } else if (drawn) {
    bg = 'rgba(255,255,255,0.08)';
    color = '#e2e8f0';
    borderColor = 'rgba(255,255,255,0.15)';
    fontWeight = 700;
  }

  const hasDot = DOT_NUMBERS.has(num);
  const dotColor = drawn ? '#22c55e' : picked ? '#f87171' : '#3b82f6';

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        aspectRatio: '1',
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight,
        color,
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'background 0.2s, border-color 0.2s',
        transform: justDrawn ? 'scale(1.12)' : 'scale(1)',
        boxShadow: justDrawn
          ? '0 0 10px rgba(34,197,94,0.7)'
          : (picked && drawn)
          ? '0 0 6px rgba(34,197,94,0.4)'
          : 'none',
      }}
    >
      {num}
      {hasDot && (
        <div style={{
          position: 'absolute',
          top: 2,
          right: 2,
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: dotColor,
          opacity: 0.85,
        }} />
      )}
    </div>
  );
}

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
          lastDrawnTimerRef.current = setTimeout(() => setLastDrawn(null), 500);
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
      const p = await apiRequest<{ mainBalance: number; id?: string }>('GET', '/api/players/me');
      setBalance((p as any).mainBalance ?? (p as any).balance ?? null);
      const rawId = (p as any).id ?? (p as any).playerId ?? null;
      if (rawId) setPlayerId(String(rawId).slice(-8).toUpperCase());
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
      lastDrawnTimerRef.current = setTimeout(() => setLastDrawn(null), 900);
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

  const togglePick = (n: number) => {
    if (state.phase !== 'betting') return;
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(n)) { next.delete(n); return next; }
      if (next.size >= MAX_PICKS) return prev;
      next.add(n);
      return next;
    });
  };

  const placeBet = async () => {
    if (placing || picked.size === 0) return;
    setError(null);
    setPlacing(true);
    try {
      await apiRequest('POST', '/api/keno/bet', {
        betAmount,
        pickedNumbers: Array.from(picked),
      });
      setPicked(new Set());
      await fetchState();
      await fetchBalance();
    } catch (e: any) {
      setError(e.message ?? 'Bet failed');
    } finally {
      setPlacing(false);
    }
  };

  const allDrawnNumbers = state.round?.drawnNumbers ?? [];
  const visibleDrawnNumbers = allDrawnNumbers.slice(0, revealedCount);
  const drawnSet = new Set(visibleDrawnNumbers);
  const activePicked: Set<number> = (state.myBets.length > 0 && state.phase !== 'betting')
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
      maxWidth: 480,
      margin: '0 auto',
      overflow: 'hidden',
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
            <span style={{ fontSize: 11, color: '#64748b' }}>0</span>
            <span style={{ fontSize: 10, color: '#64748b' }}>ETB</span>
          </div>
          {playerId && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 700, color: '#94a3b8',
            }}>
              <span>ID: {playerId}</span>
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

      {/* ── Countdown ── */}
      <div style={{ textAlign: 'center', padding: '4px 0 2px', background: '#0d1120', flexShrink: 0 }}>
        <div style={{
          display: 'inline-block',
          background: '#1a2340',
          borderRadius: 5,
          padding: '2px 18px',
          fontSize: 18,
          fontWeight: 900,
          color: countdownSec <= 5 && state.phase === 'betting' ? '#ef4444' : '#fff',
          letterSpacing: 4,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {state.phase === 'betting' || state.phase === 'drawing' ? `${cdMins} : ${cdSecs}` : '00 : 00'}
        </div>
      </div>

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

      {/* ── GAME TAB ── */}
      {tab === 'game' && (
        <>
          {/* Info panel */}
          <div style={{
            background: '#1a2340',
            margin: '4px 6px',
            borderRadius: 8,
            padding: '7px 8px',
            flexShrink: 0,
          }}>
            {(state.phase === 'drawing' || state.phase === 'finished') && activePicked.size > 0 ? (
              /* Drawing phase: "N Possible win X / Match / Pays" */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>{liveMatched}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Possible win</span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: '#22c55e' }}>
                      {Math.round(activeBetAmount * getMultiplier(activePicked.size, liveMatched))}
                    </span>
                  </div>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: '#1a3a2a',
                    border: '1px solid rgba(34,197,94,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, color: '#22c55e', cursor: 'pointer',
                  }}>?</div>
                </div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 5, fontSize: 11, color: '#64748b' }}>
                  <span>Match <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{liveMatched}</span></span>
                  <span>Pays <span style={{ color: '#e2e8f0', fontWeight: 700 }}>x{getMultiplier(activePicked.size, liveMatched)}</span></span>
                </div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {Array.from(activePicked).sort((a,b)=>a-b).map(n => (
                    <span key={n} style={{
                      width: 28, height: 26,
                      background: drawnSet.has(n) ? '#22c55e' : 'rgba(255,255,255,0.1)',
                      border: `1px solid ${drawnSet.has(n) ? '#22c55e' : 'rgba(255,255,255,0.15)'}`,
                      borderRadius: 5,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800,
                      color: drawnSet.has(n) ? '#fff' : '#cbd5e1',
                    }}>{n}</span>
                  ))}
                </div>
              </div>
            ) : activePicked.size === 0 ? (
              /* No picks */
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Two stacked balls */}
                <div style={{ position: 'relative', width: 46, height: 32, flexShrink: 0 }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0,
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'radial-gradient(circle at 35% 30%, #4a5568, #1e293b)',
                    border: '1.5px solid rgba(255,255,255,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 900, color: '#cbd5e1',
                  }}>80</div>
                  <div style={{
                    position: 'absolute', top: 4, left: 16,
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'radial-gradient(circle at 35% 30%, #374151, #1e293b)',
                    border: '1.5px solid rgba(255,255,255,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 900, color: '#e2e8f0',
                  }}>10</div>
                </div>
                {/* Green ball with "1" */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 30%, #22c55e, #15803d)',
                  border: '2px solid rgba(34,197,94,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 900, color: '#fff', flexShrink: 0,
                  boxShadow: '0 0 8px rgba(34,197,94,0.4)',
                }}>1</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Choose {MAX_PICKS} numbers</div>
                  <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>From 1 to 80</div>
                </div>
                <div style={{
                  marginLeft: 'auto',
                  width: 24, height: 24, borderRadius: '50%',
                  background: '#1a3a2a', border: '1px solid rgba(34,197,94,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, color: '#22c55e', cursor: 'pointer', flexShrink: 0,
                }}>?</div>
              </div>
            ) : (
              /* Has picks: show possible win + payout table + picked numbers */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Small balls indicator */}
                    <div style={{ position: 'relative', width: 40, height: 28, flexShrink: 0 }}>
                      <div style={{
                        position: 'absolute', top: 0, left: 0,
                        width: 22, height: 22, borderRadius: '50%',
                        background: 'radial-gradient(circle at 35% 30%, #4a5568, #1e293b)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 8, fontWeight: 900, color: '#cbd5e1',
                      }}>80</div>
                      <div style={{
                        position: 'absolute', top: 3, left: 13,
                        width: 22, height: 22, borderRadius: '50%',
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
                          x{PAYOUT_TABLE[activePicked.size]?.[pw.matched] ?? 0}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {Array.from(activePicked).sort((a,b)=>a-b).map(n => (
                    <span key={n} style={{
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 700, color: '#fff',
                    }}>{n}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Number grid 1–80 */}
          <div style={{ padding: '2px 6px', flexShrink: 0 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(10, 1fr)',
              gap: 2,
            }}>
              {Array.from({ length: 80 }, (_, i) => i + 1).map(n => (
                <NumberCell
                  key={n}
                  num={n}
                  picked={activePicked.has(n)}
                  drawn={drawnSet.has(n)}
                  justDrawn={lastDrawn === n}
                  onClick={() => togglePick(n)}
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

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px 16px' }}>
          {history.length === 0 ? (
            <FairnessEmptyState />
          ) : (
            history.map(r => <HistoryCard key={r.id} round={r} />)
          )}
        </div>
      )}

      {/* ── RESULTS TAB ── */}
      {tab === 'results' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 16px' }}>
          {history.length === 0 ? (
            <FairnessEmptyState />
          ) : (
            history.slice(0, 20).map(r => {
              const date = new Date(r.finishedAt);
              const dateStr = `${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getFullYear().toString().slice(-2)} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}:${date.getSeconds().toString().padStart(2,'0')}`;
              const shortId = r.id.slice(-8).toUpperCase();
              const myBetsR = r.myBets ?? (r.myBet ? [r.myBet] : []);
              const firstRow = r.drawnNumbers.slice(0, 10);
              const secondRow = r.drawnNumbers.slice(10, 20);
              return (
                <div key={r.id} style={{
                  background: '#111827',
                  borderRadius: 8,
                  padding: '8px 10px',
                  marginBottom: 6,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {/* Header row: checkmark + id + date + Combination */}
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
                  {/* First row of 10 */}
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
                  {/* Second row of 10 */}
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
            })
          )}
        </div>
      )}

      {/* ── STATISTICS TAB ── */}
      {tab === 'statistics' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 16px' }}>
          <StatisticsView history={history} />
        </div>
      )}

      {/* ── Tab bar ── */}
      <TabBar tab={tab} onChange={setTab} />

      {/* ── Bottom bets feed ── */}
      <BetsFeed bets={state.bets} myBets={state.myBets} drawnSet={drawnSet} phase={state.phase} />
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
  return (
    <div style={{
      background: '#111827',
      borderRadius: 10,
      padding: '10px 12px',
      marginBottom: 8,
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
        {round.drawnNumbers.map(n => {
          const isMyPick = myBets.some(b => b.pickedNumbers.includes(n));
          return (
            <span key={n} style={{
              width: 24, height: 24, borderRadius: '50%',
              background: isMyPick ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${isMyPick ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.1)'}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700,
              color: isMyPick ? '#4ade80' : '#64748b',
            }}>{n}</span>
          );
        })}
      </div>
      {myBets.map((b, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 3 }}>
          <span style={{ color: '#64748b' }}>
            Bet #{i + 1} · {b.betAmount} ETB · Matched {b.matched ?? 0}/{b.pickedNumbers.length}
          </span>
          <span style={{ fontWeight: 800, color: (b.payout ?? 0) > 0 ? '#22c55e' : '#f87171' }}>
            {(b.payout ?? 0) > 0 ? `+${b.payout!.toFixed(2)}` : 'Lost'}
          </span>
        </div>
      ))}
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
      flexShrink: 0,
      maxHeight: 150,
      overflowY: 'auto',
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
