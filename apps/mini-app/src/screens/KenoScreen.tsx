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

function getPossibleWins(picked: number, betAmount: number): { matched: number; pay: number }[] {
  if (picked < 1) return [];
  const table = PAYOUT_TABLE[picked] ?? {};
  return Object.entries(table)
    .filter(([, mul]) => mul > 0)
    .map(([m, mul]) => ({ matched: Number(m), pay: Math.round(betAmount * mul * 100) / 100 }))
    .sort((a, b) => a.matched - b.matched);
}

// best possible payout from current picks
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

// ─── Dot indicator helper – small coloured dot in corner of each number cell ─
// These are decorative random dots like in the reference screenshot
const DOT_NUMBERS = new Set([3, 6, 10, 11, 18, 27, 36, 42, 49, 50, 65, 71, 78]);

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

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        aspectRatio: '1',
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight,
        color,
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'background 0.2s, border-color 0.2s',
        transform: justDrawn ? 'scale(1.15)' : 'scale(1)',
        boxShadow: justDrawn
          ? '0 0 10px rgba(34,197,94,0.7)'
          : picked && drawn
          ? '0 0 6px rgba(34,197,94,0.4)'
          : 'none',
      }}
    >
      {num}
      {hasDot && (
        <div style={{
          position: 'absolute',
          top: 2,
          right: 3,
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: drawn ? '#22c55e' : '#3b82f6',
          opacity: 0.8,
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
            borderTop: tab === t.key ? '2px solid #22c55e' : '2px solid transparent',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
          }}
        >
          <span style={{ fontSize: 12 }}>{t.icon}</span>
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
  const [betAmount, setBetAmount] = useState(4);
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
    if (tab === 'history' || tab === 'results') fetchHistory();
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
      setWinFlash(null);
      fetchBalance();
    };

    const onNumberDrawn = (data: { roundId: string; number: number; drawnSoFar: number[] }) => {
      setLastDrawn(data.number);
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
      setPicked(new Set()); // clear picks so player can place another
      await fetchState();
      await fetchBalance();
    } catch (e: any) {
      setError(e.message ?? 'Bet failed');
    } finally {
      setPlacing(false);
    }
  };

  const drawnSet = new Set(state.round?.drawnNumbers ?? []);
  // For display purposes use the first bet's picks when in draw/finished, otherwise current picks
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

  // Countdown display
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
      {/* ── Top header ───────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px 6px',
        background: '#0d1120',
        flexShrink: 0,
      }}>
        {/* Logo + balance */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: 20,
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
            }}
          >←</button>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: '#22c55e', letterSpacing: 1 }}>FAST</span>
            <span style={{ fontSize: 11, fontWeight: 900, color: '#fff', letterSpacing: 1 }}>KENO</span>
          </div>
        </div>

        {/* Balance */}
        <div style={{
          background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: 8,
          padding: '4px 10px',
          fontSize: 12,
          fontWeight: 700,
          color: '#22c55e',
        }}>
          {balance !== null ? `${balance.toFixed(2)} ETB` : '0.00 ETB'}
        </div>
      </div>

      {/* ── Countdown ────────────────────────────────────────────────── */}
      <div style={{
        textAlign: 'center',
        padding: '6px 0 4px',
        background: '#0d1120',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'inline-block',
          background: '#1a2340',
          borderRadius: 8,
          padding: '3px 18px',
          fontSize: 20,
          fontWeight: 900,
          color: countdownSec <= 5 && state.phase === 'betting' ? '#ef4444' : '#fff',
          letterSpacing: 2,
          fontVariantNumeric: 'tabular-nums',
          minWidth: 90,
          textAlign: 'center',
        }}>
          {state.phase === 'betting' || state.phase === 'drawing'
            ? `${cdMins} : ${cdSecs}`
            : '00 : 00'}
        </div>
      </div>

      {/* ── Win flash overlay ─────────────────────────────────────────── */}
      {winFlash && (
        <div style={{
          background: 'linear-gradient(135deg, #14532d, #166534)',
          padding: '10px 16px',
          textAlign: 'center',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 12, color: '#86efac', fontWeight: 700 }}>🎉 YOU WON!</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#22c55e' }}>+{winFlash.amount.toFixed(2)} ETB</div>
        </div>
      )}

      {/* ── GAME TAB CONTENT ─────────────────────────────────────────── */}
      {tab === 'game' && !winFlash && (
        <>
          {/* ── Top panel: Drawing machine OR info panel ── */}
          {(state.phase === 'drawing' || state.phase === 'finished') ? (
            <DrawingMachine
              drawnNumbers={state.round?.drawnNumbers ?? []}
              lastDrawn={lastDrawn}
              totalDraw={TOTAL_DRAW}
            />
          ) : (
          <div style={{
            background: '#1a2340',
            margin: '6px 10px',
            borderRadius: 10,
            padding: '10px 12px',
            flexShrink: 0,
            minHeight: 68,
          }}>
            {picked.size === 0 ? (
              /* No picks yet – show "Choose X numbers" guide */
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {[MAX_PICKS, MAX_PICKS - 1].map(n => (
                    <div key={n} style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: '#94a3b8',
                    }}>{n}</div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #16a34a, #15803d)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 900, flexShrink: 0,
                    boxShadow: '0 0 12px rgba(34,197,94,0.5)',
                  }}>1</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Choose {MAX_PICKS} numbers</div>
                    <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>From 1 to 80</div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 600 }}>Possible win</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#22c55e' }}>{bestWin.toFixed(0)}</span>
                </div>
                <div style={{ display: 'flex', gap: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginRight: 16 }}>
                    <span style={{ fontSize: 10, color: '#64748b' }}>Match</span>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {possibleWins.map(pw => (
                        <span key={pw.matched} style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{pw.matched}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 10, color: '#64748b' }}>Pays</span>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {possibleWins.map(pw => (
                        <span key={pw.matched} style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>
                          x{PAYOUT_TABLE[activePicked.size]?.[pw.matched] ?? 0}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                {state.myBet && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                    {state.myBet.pickedNumbers.sort((a, b) => a - b).map(n => (
                      <span key={n} style={{
                        background: drawnSet.has(n) ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)',
                        border: `1px solid ${drawnSet.has(n) ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.15)'}`,
                        borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700,
                        color: drawnSet.has(n) ? '#4ade80' : '#fff',
                      }}>{n}</span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          )}

          {/* Number grid 1–80 */}
          <div style={{
            flex: 1,
            padding: '2px 10px 0',
            overflowY: 'auto',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(10, 1fr)',
              gap: 3,
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
          <div style={{
            padding: '8px 10px 4px',
            background: '#0d1120',
            flexShrink: 0,
          }}>
            {error && (
              <div style={{ color: '#f87171', fontSize: 12, marginBottom: 6, textAlign: 'center' }}>{error}</div>
            )}
            {/* Amount row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 8,
            }}>
              <button
                onClick={() => setBetAmount(v => Math.max(MIN_BET, v - 1))}
                style={ctrlBtn}
              >−</button>

              <div style={{
                flex: 1,
                background: '#1a2340',
                borderRadius: 10,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                fontWeight: 900,
                color: '#fff',
              }}>
                {betAmount.toFixed(2)}
              </div>

              <button
                onClick={() => setBetAmount(v => Math.min(MAX_BET, v + 1))}
                style={ctrlBtn}
              >+</button>

              <button
                onClick={() => setBetAmount(v => Math.min(MAX_BET, v * 2))}
                style={{ ...ctrlBtn, color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)', minWidth: 38 }}
              >X2</button>

              <button
                onClick={() => setBetAmount(MAX_BET)}
                style={{ ...ctrlBtn, color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)', minWidth: 44 }}
              >MAX</button>

              <button
                style={{ ...ctrlBtn, fontSize: 14, color: '#64748b' }}
                title="Settings"
              >⚙</button>
            </div>

            {/* BET button */}
            <button
              onClick={placeBet}
              disabled={placing || picked.size === 0 || state.phase !== 'betting'}
              style={{
                width: '100%',
                padding: '15px 0',
                background: (state.phase === 'betting' && picked.size > 0 && !placing)
                  ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'
                  : 'rgba(255,255,255,0.06)',
                border: 'none',
                borderRadius: 12,
                color: (state.phase === 'betting' && picked.size > 0 && !placing)
                  ? '#fff'
                  : 'rgba(255,255,255,0.3)',
                fontSize: 18,
                fontWeight: 900,
                cursor: (state.phase === 'betting' && picked.size > 0 && !placing) ? 'pointer' : 'not-allowed',
                letterSpacing: '0.06em',
                marginBottom: 4,
              }}
            >
              {placing ? 'Placing...' : state.myBets.length > 0 ? `BET #${state.myBets.length + 1}` : 'BET'}
            </button>
          </div>
        </>
      )}

      {/* ── HISTORY TAB ──────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px 16px' }}>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#475569', padding: 40, fontSize: 14 }}>No history yet</div>
          ) : (
            history.map(r => <HistoryCard key={r.id} round={r} />)
          )}
        </div>
      )}

      {/* ── RESULTS TAB ──────────────────────────────────────────────── */}
      {tab === 'results' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px 16px' }}>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#475569', padding: 40, fontSize: 14 }}>No results yet</div>
          ) : (
            history.slice(0, 10).map(r => (
              <div key={r.id} style={{
                background: '#111827',
                borderRadius: 10,
                padding: '10px 12px',
                marginBottom: 8,
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>
                  {new Date(r.finishedAt).toLocaleString()}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {r.drawnNumbers.map(n => {
                    const rMyBets = r.myBets ?? (r.myBet ? [r.myBet] : []);
                    const isMyPick = rMyBets.some(b => b.pickedNumbers.includes(n));
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
              </div>
            ))
          )}
        </div>
      )}

      {/* ── STATISTICS TAB ───────────────────────────────────────────── */}
      {tab === 'statistics' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px 16px' }}>
          <StatisticsView history={history} />
        </div>
      )}

      {/* ── Tab bar ──────────────────────────────────────────────────── */}
      <TabBar tab={tab} onChange={setTab} />

      {/* ── Bottom bets feed ─────────────────────────────────────────── */}
      <BetsFeed bets={state.bets} myBets={state.myBets} drawnSet={drawnSet} phase={state.phase} />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ctrlBtn: React.CSSProperties = {
  width: 40,
  height: 44,
  borderRadius: 10,
  background: '#1a2340',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function HistoryCard({ round }: { round: HistoryRound }) {
  const myBets = round.myBets ?? (round.myBet ? [round.myBet] : []);
  return (
    <div style={{
      background: '#111827',
      borderRadius: 12,
      padding: '12px',
      marginBottom: 10,
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
        {round.drawnNumbers.map(n => {
          const isMyPick = myBets.some(b => b.pickedNumbers.includes(n));
          return (
            <span key={n} style={{
              width: 26, height: 26, borderRadius: '50%',
              background: isMyPick ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${isMyPick ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.1)'}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700,
              color: isMyPick ? '#4ade80' : '#64748b',
            }}>{n}</span>
          );
        })}
      </div>
      {myBets.map((b, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
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

// ─── Drawing machine visual ───────────────────────────────────────────────────
function DrawingMachine({
  drawnNumbers, lastDrawn, totalDraw,
}: {
  drawnNumbers: number[];
  lastDrawn: number | null;
  totalDraw: number;
}) {
  const current = lastDrawn ?? drawnNumbers[drawnNumbers.length - 1] ?? null;
  const previous = drawnNumbers.slice(0, -1).slice(-6); // last few before current

  return (
    <div style={{
      position: 'relative',
      background: 'radial-gradient(ellipse at 50% 60%, rgba(34,197,94,0.08) 0%, #0d1a0d 60%, #0d1120 100%)',
      flexShrink: 0,
      height: 160,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {/* Counter top-right */}
      <div style={{
        position: 'absolute', top: 8, right: 12,
        fontSize: 11, fontWeight: 700, color: '#475569',
      }}>
        {drawnNumbers.length} / {totalDraw}
      </div>

      {/* Circular glow backdrop */}
      <div style={{
        position: 'absolute',
        width: 140, height: 140,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(34,197,94,0.06) 0%, transparent 70%)',
        border: '1px solid rgba(34,197,94,0.08)',
      }} />

      {/* Main ball */}
      {current !== null ? (
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, #4a5568, #1a202c)',
          border: '2px solid rgba(255,255,255,0.15)',
          boxShadow: '0 0 30px rgba(34,197,94,0.3), inset 0 2px 4px rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, fontWeight: 900, color: '#fff',
          zIndex: 2,
          transition: 'transform 0.15s ease-out',
          transform: lastDrawn !== null ? 'scale(1.08)' : 'scale(1)',
        }}>
          {current}
        </div>
      ) : (
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, rgba(34,197,94,0.15), rgba(34,197,94,0.03))',
          border: '2px solid rgba(34,197,94,0.1)',
          zIndex: 2,
        }} />
      )}

      {/* Previous balls row */}
      {previous.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 14,
          left: 10,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
        }}>
          {previous.slice(-4).map((n, i) => (
            <div key={`${n}-${i}`} style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 30%, #3a4555, #1a2030)',
              border: '1.5px solid rgba(255,255,255,0.12)',
              boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: '#94a3b8',
            }}>{n}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Bets feed with per-player number cells ────────────────────────────────────
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
      maxHeight: 260,
      overflowY: 'auto',
    }}>
      {/* Counts row */}
      <div style={{
        display: 'flex', gap: 20,
        padding: '6px 14px 5px',
        fontSize: 11, color: '#475569', fontWeight: 700,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <span style={{ color: '#64748b' }}>All {bets.length}</span>
        <span>My Tickets {myBetCount}</span>
        <span>My Bets {myBetCount}</span>
      </div>

      {/* Each bet row */}
      {bets.map((b, i) => {
        const masked = b.username.length > 4
          ? b.username[0] + '***' + b.username[b.username.length - 1]
          : b.username;

        // slots: always show 10 cells, fill with actual numbers then empty
        const slots = Array.from({ length: 10 }, (_, j) => b.pickedNumbers[j] ?? null);

        return (
          <div key={i} style={{
            padding: '7px 10px 6px',
            borderBottom: '1px solid rgba(255,255,255,0.03)',
          }}>
            {/* Username */}
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 5 }}>
              {masked}
            </div>

            {/* Number slots row */}
            <div style={{ display: 'flex', gap: 3, marginBottom: 5 }}>
              {slots.map((num, j) => {
                const isMatched = num !== null && drawnSet.has(num) && isDrawingOrFinished;
                const hasNum = num !== null;
                return (
                  <div key={j} style={{
                    width: 30, height: 28,
                    background: isMatched
                      ? '#22c55e'
                      : hasNum
                      ? 'rgba(255,255,255,0.1)'
                      : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isMatched ? '#22c55e' : hasNum ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800,
                    color: isMatched ? '#fff' : hasNum ? '#e2e8f0' : 'transparent',
                  }}>
                    {num ?? ''}
                  </div>
                );
              })}
            </div>

            {/* Bet amount + status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#64748b', fontWeight: 700 }}>Bet {b.betAmount.toFixed(0)}</span>
              {isDrawingOrFinished && b.payout !== null ? (
                <span style={{ fontWeight: 800, color: (b.payout ?? 0) > 0 ? '#22c55e' : '#f59e0b' }}>
                  {(b.payout ?? 0) > 0 ? `+${b.payout.toFixed(0)}` : `${b.matched ?? 0} matched`}
                </span>
              ) : (
                <span style={{ fontWeight: 700, color: '#f59e0b' }}>Waiting</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatisticsView({ history }: { history: HistoryRound[] }) {
  if (history.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#475569', padding: 40, fontSize: 14 }}>
        No data yet
      </div>
    );
  }

  const myBets = history.filter(r => r.myBet);
  const totalWagered = myBets.reduce((s, r) => s + (r.myBet?.betAmount ?? 0), 0);
  const totalWon = myBets.reduce((s, r) => s + (r.myBet?.payout ?? 0), 0);
  const wins = myBets.filter(r => (r.myBet?.payout ?? 0) > 0).length;

  // Frequency: how many times each number was drawn
  const freq: Record<number, number> = {};
  for (const r of history) {
    for (const n of r.drawnNumbers) {
      freq[n] = (freq[n] ?? 0) + 1;
    }
  }
  const hot = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => Number(n));
  const cold = Object.entries(freq).sort((a, b) => a[1] - b[1]).slice(0, 5).map(([n]) => Number(n));

  return (
    <div>
      {myBets.length > 0 && (
        <div style={{
          background: '#111827',
          borderRadius: 12,
          padding: '12px 14px',
          marginBottom: 10,
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>My Performance</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
            {[
              { label: 'Bets', value: myBets.length },
              { label: 'Wins', value: wins },
              { label: 'Wagered', value: `${totalWagered.toFixed(0)} ETB` },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{s.value}</div>
                <div style={{ fontSize: 10, color: '#475569' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, textAlign: 'center', fontSize: 13, fontWeight: 800, color: totalWon > totalWagered ? '#22c55e' : '#f87171' }}>
            Net: {(totalWon - totalWagered) >= 0 ? '+' : ''}{(totalWon - totalWagered).toFixed(2)} ETB
          </div>
        </div>
      )}

      <div style={{
        background: '#111827',
        borderRadius: 12,
        padding: '12px 14px',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>Hot Numbers</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {hot.map(n => (
            <span key={n} style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: '#fca5a5',
            }}>{n}</span>
          ))}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Cold Numbers</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {cold.map(n => (
            <span key={n} style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: '#93c5fd',
            }}>{n}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
