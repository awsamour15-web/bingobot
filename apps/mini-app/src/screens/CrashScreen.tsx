import { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '../lib/socket';
import { getCrashState, placeCrashBet, getCrashHistory } from '../lib/api';
import type { CrashBetEntry, CrashHistoryEntry } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'waiting' | 'running' | 'crashed' | 'idle';

interface MyBet {
  betAmount: number;
  cashoutAt: number | null;
  payout: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_BET = 5;
const MAX_BET = 10_000;
const PRESET_AMOUNTS = [10, 25, 50, 100, 250, 500];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMul(v: number): string {
  return v.toFixed(2) + 'x';
}

function mulColor(v: number): string {
  if (v < 1.5) return '#f8fafc';
  if (v < 2) return '#fbbf24';
  if (v < 5) return '#34d399';
  return '#a78bfa';
}

function crashColor(v: number): string {
  if (v < 1.5) return '#f87171';
  if (v < 2) return '#fb923c';
  return '#f87171';
}

// ─── Animated multiplier display ─────────────────────────────────────────────

function MultiplierDisplay({ phase, multiplier, crashPoint }: {
  phase: Phase;
  multiplier: number;
  crashPoint: number | null;
}) {
  const isCrashed = phase === 'crashed';
  const displayVal = isCrashed ? (crashPoint ?? multiplier) : multiplier;
  const color = isCrashed ? crashColor(displayVal) : mulColor(displayVal);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: 180,
      position: 'relative',
    }}>
      {/* Glow ring */}
      <div style={{
        position: 'absolute',
        width: 160,
        height: 160,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color}18 0%, transparent 70%)`,
        transition: 'background 0.4s',
      }} />

      {phase === 'waiting' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, color: '#94a3b8', marginBottom: 8 }}>Next round in</div>
          <CountdownBar />
        </div>
      )}

      {(phase === 'running' || phase === 'crashed') && (
        <>
          <div style={{
            fontSize: 64,
            fontWeight: 900,
            letterSpacing: '-2px',
            color,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            transition: 'color 0.3s',
            filter: `drop-shadow(0 0 24px ${color}66)`,
          }}>
            {fmtMul(displayVal)}
          </div>
          {isCrashed && (
            <div style={{
              marginTop: 10,
              fontSize: 14,
              fontWeight: 700,
              color: '#f87171',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>
              Crashed!
            </div>
          )}
        </>
      )}

      {phase === 'idle' && (
        <div style={{ fontSize: 22, color: '#475569', fontWeight: 700 }}>—</div>
      )}
    </div>
  );
}

// ─── Countdown bar ────────────────────────────────────────────────────────────

function CountdownBar() {
  const [progress, setProgress] = useState(100);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const TOTAL = 10_000;
    startRef.current = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.max(0, 100 - (elapsed / TOTAL) * 100);
      setProgress(pct);
      if (pct <= 0) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ width: 120, height: 6, background: '#1e293b', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{
        height: '100%',
        width: `${progress}%`,
        background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
        borderRadius: 4,
        transition: 'width 0.08s linear',
      }} />
    </div>
  );
}

// ─── Bet history row ──────────────────────────────────────────────────────────

function BetRow({ bet, isMe }: { bet: CrashBetEntry; isMe: boolean }) {
  const cashed = bet.cashoutAt !== null;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '7px 12px',
      borderRadius: 10,
      background: isMe ? 'rgba(245,158,11,0.08)' : 'transparent',
      gap: 8,
    }}>
      <div style={{ flex: 1, fontSize: 13, color: isMe ? '#fbbf24' : '#94a3b8', fontWeight: isMe ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {isMe ? 'You' : bet.username}
      </div>
      <div style={{ fontSize: 13, color: '#e2e8f0', minWidth: 50, textAlign: 'right' }}>
        {bet.betAmount}
      </div>
      <div style={{ fontSize: 13, minWidth: 52, textAlign: 'right', color: cashed ? '#34d399' : '#475569', fontWeight: cashed ? 700 : 400 }}>
        {cashed ? fmtMul(bet.cashoutAt!) : '—'}
      </div>
      <div style={{ fontSize: 13, minWidth: 60, textAlign: 'right', color: cashed ? '#34d399' : '#f87171', fontWeight: 600 }}>
        {cashed ? `+${bet.payout ?? ''}` : 'BUST'}
      </div>
    </div>
  );
}

// ─── Crash history chips ──────────────────────────────────────────────────────

function HistoryChips({ items }: { items: CrashHistoryEntry[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, msOverflowStyle: 'none' }}>
      {items.slice(0, 20).map((r) => {
        const val = r.crashPoint ?? 0;
        const color = val < 1.5 ? '#f87171' : val < 2 ? '#fbbf24' : '#34d399';
        return (
          <div key={r.id} style={{
            flexShrink: 0,
            padding: '3px 9px',
            borderRadius: 20,
            background: `${color}18`,
            border: `1px solid ${color}44`,
            fontSize: 12,
            fontWeight: 700,
            color,
          }}>
            {fmtMul(val)}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CrashScreen() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [multiplier, setMultiplier] = useState(1.0);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [myBet, setMyBet] = useState<MyBet | null>(null);
  const [bets, setBets] = useState<CrashBetEntry[]>([]);
  const [history, setHistory] = useState<CrashHistoryEntry[]>([]);
  const [betInput, setBetInput] = useState('10');
  const [placing, setPlacing] = useState(false);
  const [cashingOut, setCashingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState<string>('');

  // Load initial state + history
  useEffect(() => {
    getCrashState().then((s) => {
      setPhase(s.phase === 'idle' ? 'idle' : s.phase);
      if (s.round) setRoundId(s.round.id);
      if (s.round?.crashPoint) setCrashPoint(s.round.crashPoint);
      if (s.myBet) setMyBet(s.myBet);
      setBets(s.bets);
    }).catch(() => {});

    getCrashHistory().then(setHistory).catch(() => {});

    // Get username from jwt payload
    try {
      const jwt = localStorage.getItem('jwt') ?? '';
      const payload = JSON.parse(atob(jwt.split('.')[1]!));
      setMyUsername(payload.username ?? '');
    } catch { /* ignore */ }
  }, []);

  // Socket events
  useEffect(() => {
    const onBettingOpen = (data: { roundId: string; countdownMs: number }) => {
      setPhase('waiting');
      setRoundId(data.roundId);
      setMultiplier(1.0);
      setCrashPoint(null);
      setMyBet(null);
      setBets([]);
      setError(null);
      setFeedback(null);
    };

    const onStarted = (data: { roundId: string; startedAt: number }) => {
      setPhase('running');
      setRoundId(data.roundId);
      setMultiplier(1.0);
    };

    const onTick = (data: { multiplier: number }) => {
      setMultiplier(data.multiplier);
    };

    const onCashedOut = (data: { playerId: string; username: string; multiplier: number; payout: number }) => {
      setBets((prev) => prev.map((b) =>
        b.username === data.username
          ? { ...b, cashoutAt: data.multiplier, payout: data.payout }
          : b,
      ));
    };

    const onEnded = (data: { roundId: string; crashPoint: number }) => {
      setPhase('crashed');
      setCrashPoint(data.crashPoint);
      setMultiplier(data.crashPoint);
      setHistory((prev) => [{ id: data.roundId, crashPoint: data.crashPoint, crashedAt: new Date().toISOString() }, ...prev]);
    };

    const onBetPlaced = (data: { playerId: string; betAmount: number }) => {
      void data; // triggers re-fetch of bets if needed
    };

    (socket as any).on('CRASH_BETTING_OPEN', onBettingOpen);
    (socket as any).on('CRASH_STARTED', onStarted);
    (socket as any).on('CRASH_TICK', onTick);
    (socket as any).on('CRASH_CASHED_OUT', onCashedOut);
    (socket as any).on('CRASH_ENDED', onEnded);
    (socket as any).on('CRASH_BET_PLACED', onBetPlaced);

    return () => {
      (socket as any).off('CRASH_BETTING_OPEN', onBettingOpen);
      (socket as any).off('CRASH_STARTED', onStarted);
      (socket as any).off('CRASH_TICK', onTick);
      (socket as any).off('CRASH_CASHED_OUT', onCashedOut);
      (socket as any).off('CRASH_ENDED', onEnded);
      (socket as any).off('CRASH_BET_PLACED', onBetPlaced);
    };
  }, []);

  const handleBet = useCallback(async () => {
    const amount = Number(betInput);
    if (isNaN(amount) || amount < MIN_BET || amount > MAX_BET) {
      setError(`Bet must be ${MIN_BET}–${MAX_BET}`);
      return;
    }
    setPlacing(true);
    setError(null);
    try {
      const res = await placeCrashBet(amount);
      setMyBet({ betAmount: amount, cashoutAt: null, payout: null });
      setBets((prev) => [{ username: myUsername || 'You', betAmount: amount, cashoutAt: null, payout: null }, ...prev]);
      setFeedback(`Bet of ${amount} placed!`);
      setRoundId(res.roundId);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to place bet');
    } finally {
      setPlacing(false);
    }
  }, [betInput, myUsername]);

  const handleCashout = useCallback(() => {
    if (!roundId || cashingOut) return;
    setCashingOut(true);
    (socket as any).emit('CRASH_CASHOUT', { roundId }, (res: any) => {
      setCashingOut(false);
      if (res?.ok) {
        setMyBet((prev) => prev ? { ...prev, cashoutAt: res.multiplier, payout: res.payout } : prev);
        setFeedback(`Cashed out at ${fmtMul(res.multiplier)} — won ${res.payout}`);
      } else {
        setError(res?.error ?? 'Cashout failed');
      }
    });
  }, [roundId, cashingOut]);

  const canBet = phase === 'waiting' && !myBet && !placing;
  const canCashout = phase === 'running' && myBet && myBet.cashoutAt === null && !cashingOut;

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#0a0e1a',
      color: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: 480,
      margin: '0 auto',
      padding: '0 0 80px',
    }}>

      {/* Header */}
      <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 22 }}>🚀</div>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px' }}>Crash</div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {phase === 'waiting' ? 'Betting open' : phase === 'running' ? 'In flight' : phase === 'crashed' ? 'Crashed' : 'Idle'}
        </div>
      </div>

      {/* History chips */}
      <div style={{ padding: '10px 20px 0' }}>
        <HistoryChips items={history} />
      </div>

      {/* Multiplier */}
      <div style={{ padding: '0 20px' }}>
        <MultiplierDisplay phase={phase} multiplier={multiplier} crashPoint={crashPoint} />
      </div>

      {/* Feedback / Error */}
      {feedback && (
        <div style={{ margin: '0 20px 8px', padding: '8px 14px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 10, fontSize: 13, color: '#34d399', fontWeight: 600 }}>
          {feedback}
        </div>
      )}
      {error && (
        <div style={{ margin: '0 20px 8px', padding: '8px 14px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, fontSize: 13, color: '#f87171', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Bet panel */}
      <div style={{ padding: '0 20px', marginBottom: 16 }}>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 18,
          padding: 16,
        }}>
          {/* Preset amounts */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {PRESET_AMOUNTS.map((a) => (
              <button
                key={a}
                onClick={() => setBetInput(String(a))}
                disabled={!canBet}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  border: betInput === String(a) ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
                  background: betInput === String(a) ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
                  color: betInput === String(a) ? '#fbbf24' : '#94a3b8',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: canBet ? 'pointer' : 'default',
                  opacity: canBet ? 1 : 0.5,
                }}
              >
                {a}
              </button>
            ))}
          </div>

          {/* Input row */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="number"
              value={betInput}
              onChange={(e) => setBetInput(e.target.value)}
              min={MIN_BET}
              max={MAX_BET}
              disabled={!canBet}
              placeholder="Amount"
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)',
                color: '#f8fafc',
                fontSize: 16,
                fontWeight: 700,
                outline: 'none',
                opacity: canBet ? 1 : 0.5,
              }}
            />

            {/* Bet / Cashout button */}
            {phase !== 'running' || !myBet || myBet.cashoutAt !== null ? (
              <button
                onClick={handleBet}
                disabled={!canBet}
                style={{
                  padding: '10px 22px',
                  borderRadius: 12,
                  border: 'none',
                  background: canBet
                    ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
                    : 'rgba(255,255,255,0.06)',
                  color: canBet ? '#0a0e1a' : '#475569',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: canBet ? 'pointer' : 'default',
                  whiteSpace: 'nowrap',
                  transition: 'transform 0.15s',
                }}
              >
                {placing ? '...' : 'Bet'}
              </button>
            ) : (
              <button
                onClick={handleCashout}
                disabled={!canCashout}
                style={{
                  padding: '10px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: canCashout
                    ? 'linear-gradient(135deg, #34d399, #10b981)'
                    : 'rgba(255,255,255,0.06)',
                  color: canCashout ? '#0a0e1a' : '#475569',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: canCashout ? 'pointer' : 'default',
                  whiteSpace: 'nowrap',
                  animation: canCashout ? 'cashoutPulse 1s ease-in-out infinite' : 'none',
                }}
              >
                {cashingOut ? '...' : `Cash ${fmtMul(multiplier)}`}
              </button>
            )}
          </div>

          {/* My active bet info */}
          {myBet && phase === 'running' && myBet.cashoutAt === null && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
              Bet: <span style={{ color: '#fbbf24', fontWeight: 700 }}>{myBet.betAmount}</span>
              {' · '}
              If cashed now: <span style={{ color: '#34d399', fontWeight: 700 }}>
                {(myBet.betAmount * multiplier).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Live bets table */}
      <div style={{ padding: '0 20px', flex: 1 }}>
        <div style={{ fontSize: 12, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Players this round
        </div>
        {bets.length === 0 ? (
          <div style={{ fontSize: 13, color: '#334155', textAlign: 'center', padding: '20px 0' }}>
            No bets yet
          </div>
        ) : (
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 14,
            overflow: 'hidden',
          }}>
            {/* Table header */}
            <div style={{ display: 'flex', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ flex: 1, fontSize: 11, color: '#475569', fontWeight: 700 }}>Player</div>
              <div style={{ minWidth: 50, textAlign: 'right', fontSize: 11, color: '#475569', fontWeight: 700 }}>Bet</div>
              <div style={{ minWidth: 52, textAlign: 'right', fontSize: 11, color: '#475569', fontWeight: 700 }}>Out</div>
              <div style={{ minWidth: 60, textAlign: 'right', fontSize: 11, color: '#475569', fontWeight: 700 }}>Result</div>
            </div>
            {bets.map((b, i) => (
              <BetRow key={i} bet={b} isMe={b.username === myUsername} />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes cashoutPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(52,211,153,0.4); }
          50% { transform: scale(1.03); box-shadow: 0 0 0 8px rgba(52,211,153,0); }
        }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
      `}</style>
    </div>
  );
}
