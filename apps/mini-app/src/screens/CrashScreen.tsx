import { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '../lib/socket';
import { getCrashState, placeCrashBet, getCrashHistory } from '../lib/api';
import type { CrashBetEntry, CrashHistoryEntry } from '../lib/api';

type Phase = 'waiting' | 'running' | 'crashed' | 'idle';

interface MyBet {
  betAmount: number;
  cashoutAt: number | null;
  payout: number | null;
}

const MIN_BET = 4;
const MAX_BET = 10_000;

function fmtMul(v: number): string {
  return v.toFixed(2) + 'x';
}

// ─── Animated plane SVG ───────────────────────────────────────────────────────

function PlaneSVG({ crashed }: { crashed: boolean }) {
  return (
    <svg width="72" height="40" viewBox="0 0 72 40" fill="none" style={{
      filter: crashed ? 'drop-shadow(0 0 8px #ef4444)' : 'drop-shadow(0 0 8px #ef4444cc)',
      transition: 'filter 0.3s',
    }}>
      {/* Fuselage */}
      <path d="M4 22 Q18 14 40 18 L60 10 L68 14 L44 22 L40 28 Q20 32 8 26 Z" fill="#c0392b" />
      {/* Wing */}
      <path d="M22 18 L38 8 L42 12 L26 22 Z" fill="#e74c3c" />
      {/* Tail */}
      <path d="M6 22 L2 14 L10 18 Z" fill="#e74c3c" />
      {/* Window */}
      <circle cx="50" cy="16" r="3" fill="#fff" opacity="0.8" />
    </svg>
  );
}

// ─── Graph canvas ─────────────────────────────────────────────────────────────

function CrashGraph({ phase, multiplier, crashPoint }: {
  phase: Phase;
  multiplier: number;
  crashPoint: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  const startTimeRef = useRef<number>(0);
  const animRef = useRef<number>(0);

  const isCrashed = phase === 'crashed';
  const displayVal = isCrashed ? (crashPoint ?? multiplier) : multiplier;

  // Build curve points from multiplier history
  useEffect(() => {
    if (phase === 'waiting' || phase === 'idle') {
      pointsRef.current = [];
      startTimeRef.current = Date.now();
    }
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;

    // Add current point
    if (phase === 'running' || phase === 'crashed') {
      const now = Date.now();
      const t = (now - startTimeRef.current) / 1000;
      const pts = pointsRef.current;
      if (pts.length === 0 || Math.abs(multiplier - (pts[pts.length - 1]?.y ?? 1)) > 0.02) {
        pts.push({ x: t, y: multiplier });
        if (pts.length > 200) pts.splice(0, pts.length - 200);
      }
    }

    ctx.clearRect(0, 0, W, H);

    // Conic ray background
    const cx = 0, cy = H;
    const rays = 18;
    for (let i = 0; i < rays; i++) {
      const a1 = (-Math.PI / 2) * (i / rays);
      const a2 = (-Math.PI / 2) * ((i + 0.5) / rays);
      const r = Math.max(W, H) * 1.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
      ctx.lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0)';
      ctx.fill();
    }

    const pts = pointsRef.current;
    if (pts.length < 2) return;

    const lastPt = pts[pts.length - 1]!;
    const firstPt = pts[0]!;
    const maxT = lastPt.x;
    const maxM = Math.max(...pts.map(p => p.y), 2);
    const padX = 30, padY = 20;

    const toCanvasX = (t: number) => padX + (t / (maxT || 1)) * (W - padX - 10);
    const toCanvasY = (m: number) => H - padY - ((m - 1) / (maxM - 1 || 1)) * (H - padY - 20);

    // Red gradient fill under curve
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, isCrashed ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.18)');
    grad.addColorStop(1, 'rgba(239,68,68,0)');

    ctx.beginPath();
    ctx.moveTo(toCanvasX(firstPt.x), H - padY);
    pts.forEach(p => ctx.lineTo(toCanvasX(p.x), toCanvasY(p.y)));
    ctx.lineTo(toCanvasX(lastPt.x), H - padY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Curve line
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = toCanvasX(p.x);
      const y = toCanvasY(p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = isCrashed ? '#ef4444' : '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Dot grid (left axis)
    for (let i = 0; i <= 8; i++) {
      const y = padY + (i / 8) * (H - padY * 2);
      ctx.beginPath();
      ctx.arc(10, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(100,150,255,0.5)';
      ctx.fill();
    }

    animRef.current = requestAnimationFrame(() => {}); // trigger repaint on next tick
  });

  return (
    <div style={{ position: 'relative', width: '100%', height: 200 }}>
      <canvas
        ref={canvasRef}
        width={420}
        height={200}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      {/* Plane on the curve tip */}
      {(phase === 'running' || phase === 'crashed') && (
        <div style={{
          position: 'absolute',
          top: isCrashed ? '35%' : '20%',
          right: isCrashed ? '10%' : '12%',
          transition: 'top 0.5s ease',
          transform: isCrashed ? 'rotate(30deg)' : 'rotate(-8deg)',
        }}>
          <PlaneSVG crashed={isCrashed} />
        </div>
      )}
      {/* Multiplier overlay */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
        {phase === 'waiting' && (
          <div style={{ color: '#94a3b8', fontSize: 15, fontWeight: 600 }}>
            <div style={{ marginBottom: 6 }}>Waiting for next round...</div>
            <CountdownBar />
          </div>
        )}
        {(phase === 'running' || phase === 'crashed') && (
          <>
            <div style={{
              fontSize: 62,
              fontWeight: 900,
              color: isCrashed ? '#ef4444' : '#ffffff',
              lineHeight: 1,
              letterSpacing: '-2px',
              fontVariantNumeric: 'tabular-nums',
              textShadow: isCrashed
                ? '0 0 40px rgba(239,68,68,0.8)'
                : '0 0 30px rgba(255,255,255,0.6)',
            }}>
              {fmtMul(displayVal)}
            </div>
            {isCrashed && (
              <div style={{ color: '#ef4444', fontWeight: 800, fontSize: 13, letterSpacing: '0.15em', marginTop: 4 }}>
                FLEW AWAY!
              </div>
            )}
          </>
        )}
        {phase === 'idle' && (
          <div style={{ color: '#475569', fontSize: 22, fontWeight: 700 }}>—</div>
        )}
      </div>
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
      const pct = Math.max(0, 100 - ((Date.now() - startRef.current) / TOTAL) * 100);
      setProgress(pct);
      if (pct <= 0) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ width: 120, height: 5, background: '#1e293b', borderRadius: 4, overflow: 'hidden', margin: '0 auto' }}>
      <div style={{ height: '100%', width: `${progress}%`, background: '#ef4444', borderRadius: 4, transition: 'width 0.08s linear' }} />
    </div>
  );
}

// ─── History chips ────────────────────────────────────────────────────────────

function HistoryChips({ items }: { items: CrashHistoryEntry[] }) {
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', gap: 5, overflowX: 'auto', padding: '0 16px 0', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
      {items.slice(0, 12).map((r, i) => {
        const v = r.crashPoint ?? 0;
        const c = v < 2 ? '#ef4444' : v < 5 ? '#3b82f6' : '#a855f7';
        return (
          <div key={r.id ?? i} style={{
            flexShrink: 0,
            padding: '2px 8px',
            borderRadius: 12,
            background: `${c}22`,
            border: `1px solid ${c}55`,
            fontSize: 11,
            fontWeight: 700,
            color: c,
          }}>
            {fmtMul(v)}
          </div>
        );
      })}
      <div style={{
        flexShrink: 0,
        padding: '2px 8px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.07)',
        fontSize: 11,
        fontWeight: 700,
        color: '#64748b',
        cursor: 'pointer',
      }}>···</div>
    </div>
  );
}

// ─── Bet Panel (single) ───────────────────────────────────────────────────────

interface BetPanelProps {
  phase: Phase;
  multiplier: number;
  myBet: MyBet | null;
  onBet: (amount: number) => void;
  onCashout: () => void;
  placing: boolean;
  cashingOut: boolean;
}

function BetPanel({ phase, multiplier, myBet, onBet, onCashout, placing, cashingOut }: BetPanelProps) {
  const [tab, setTab] = useState<'bet' | 'auto'>('bet');
  const [amount, setAmount] = useState(4);
  const QUICK = [4, 10, 40, 100];

  const canBet = phase === 'waiting' && !myBet && !placing;
  const canCashout = phase === 'running' && myBet && myBet.cashoutAt === null && !cashingOut;
  const alreadyCashedOut = myBet && myBet.cashoutAt !== null;

  const adj = (delta: number) => setAmount(a => Math.max(MIN_BET, Math.min(MAX_BET, a + delta)));

  return (
    <div style={{
      background: '#1a1d2e',
      borderRadius: 14,
      padding: '10px 12px 12px',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 10, background: '#0d0f1a', borderRadius: 20, padding: 3, width: 'fit-content' }}>
        {(['bet', 'auto'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '5px 18px',
            borderRadius: 17,
            border: 'none',
            background: tab === t ? '#2d3047' : 'transparent',
            color: tab === t ? '#fff' : '#64748b',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            textTransform: 'capitalize',
          }}>{t === 'bet' ? 'Bet' : 'Auto'}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        {/* Left: amount controls */}
        <div style={{ flex: 1 }}>
          {/* +/- row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <button onClick={() => adj(-1)} disabled={!canBet} style={adjBtnStyle(canBet)}>−</button>
            <div style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 22,
              fontWeight: 800,
              color: '#fff',
              letterSpacing: '-0.5px',
            }}>
              {amount.toFixed(2)}
            </div>
            <button onClick={() => adj(1)} disabled={!canBet} style={adjBtnStyle(canBet)}>+</button>
          </div>
          {/* Quick picks */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            {QUICK.map(q => (
              <button key={q} onClick={() => canBet && setAmount(q)} style={{
                padding: '5px 0',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: amount === q ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                color: amount === q ? '#fff' : '#64748b',
                fontSize: 12,
                fontWeight: 700,
                cursor: canBet ? 'pointer' : 'default',
                opacity: canBet ? 1 : 0.5,
              }}>{q}</button>
            ))}
          </div>
        </div>

        {/* Right: main action button */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 130 }}>
          {canCashout ? (
            <button onClick={onCashout} style={{
              width: '100%',
              padding: '14px 10px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #16a34a, #22c55e)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 800,
              cursor: 'pointer',
              textAlign: 'center',
              lineHeight: 1.3,
              boxShadow: '0 0 20px rgba(34,197,94,0.4)',
              animation: 'cashoutPulse 1s ease-in-out infinite',
            }}>
              {cashingOut ? '...' : <>Cash Out<br /><span style={{ fontSize: 13 }}>{(myBet!.betAmount * multiplier).toFixed(2)} ETB</span></>}
            </button>
          ) : alreadyCashedOut ? (
            <button disabled style={{
              width: '100%',
              padding: '14px 10px',
              borderRadius: 12,
              border: 'none',
              background: 'rgba(34,197,94,0.15)',
              color: '#22c55e',
              fontSize: 13,
              fontWeight: 800,
              textAlign: 'center',
              lineHeight: 1.3,
            }}>
              Cashed out<br />{fmtMul(myBet!.cashoutAt!)}
            </button>
          ) : (
            <button onClick={() => canBet && onBet(amount)} disabled={!canBet} style={{
              width: '100%',
              padding: '14px 10px',
              borderRadius: 12,
              border: 'none',
              background: canBet
                ? 'linear-gradient(135deg, #16a34a, #22c55e)'
                : 'rgba(255,255,255,0.06)',
              color: canBet ? '#fff' : '#475569',
              fontSize: 15,
              fontWeight: 800,
              cursor: canBet ? 'pointer' : 'default',
              textAlign: 'center',
              lineHeight: 1.3,
              boxShadow: canBet ? '0 0 16px rgba(34,197,94,0.3)' : 'none',
            }}>
              {placing ? '...' : <>{phase === 'running' ? 'Bet Next' : 'Bet'}<br /><span style={{ fontSize: 13 }}>{amount.toFixed(2)} ETB</span></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function adjBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.07)',
    color: enabled ? '#fff' : '#475569',
    fontSize: 20,
    fontWeight: 700,
    cursor: enabled ? 'pointer' : 'default',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };
}

// ─── Bet table row ────────────────────────────────────────────────────────────

function BetRow({ bet, isMe }: { bet: CrashBetEntry; isMe: boolean }) {
  const cashed = bet.cashoutAt !== null;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '7px 12px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: isMe ? 'rgba(245,158,11,0.06)' : 'transparent',
      gap: 8,
    }}>
      <div style={{ flex: 1, fontSize: 12, color: isMe ? '#fbbf24' : '#94a3b8', fontWeight: isMe ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {isMe ? 'You' : bet.username}
      </div>
      <div style={{ fontSize: 12, color: '#cbd5e1', minWidth: 48, textAlign: 'right' }}>{bet.betAmount}</div>
      <div style={{ fontSize: 12, minWidth: 48, textAlign: 'right', color: cashed ? '#22c55e' : '#475569', fontWeight: 700 }}>
        {cashed ? fmtMul(bet.cashoutAt!) : '—'}
      </div>
      <div style={{ fontSize: 12, minWidth: 58, textAlign: 'right', color: cashed ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
        {cashed ? `+${bet.payout ?? ''}` : 'BUST'}
      </div>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CrashScreen() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [multiplier, setMultiplier] = useState(1.0);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [myBet1, setMyBet1] = useState<MyBet | null>(null);
  const [myBet2, setMyBet2] = useState<MyBet | null>(null);
  const [bets, setBets] = useState<CrashBetEntry[]>([]);
  const [history, setHistory] = useState<CrashHistoryEntry[]>([]);
  const [placing1, setPlacing1] = useState(false);
  const [placing2, setPlacing2] = useState(false);
  const [cashingOut1, setCashingOut1] = useState(false);
  const [cashingOut2, setCashingOut2] = useState(false);
  const [betTab, setBetTab] = useState<'all' | 'previous' | 'top'>('all');
  const [myUsername, setMyUsername] = useState('');

  useEffect(() => {
    getCrashState().then((s) => {
      const p = s.phase === 'idle' ? 'idle' : s.phase as Phase;
      setPhase(p);
      if (s.round) setRoundId(s.round.id);
      if (s.round?.crashPoint) setCrashPoint(s.round.crashPoint);
      if (p === 'running' && s.round?.currentMultiplier) setMultiplier(s.round.currentMultiplier);
      if (s.myBet) setMyBet1(s.myBet);
      setBets(s.bets);
    }).catch(() => {});
    getCrashHistory().then(setHistory).catch(() => {});
    try {
      const jwt = localStorage.getItem('jwt') ?? '';
      const payload = JSON.parse(atob(jwt.split('.')[1]!));
      setMyUsername(payload.username ?? '');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const onBettingOpen = (data: { roundId: string }) => {
      setPhase('waiting');
      setRoundId(data.roundId);
      setMultiplier(1.0);
      setCrashPoint(null);
      setMyBet1(null);
      setMyBet2(null);
      setBets([]);
    };
    const onStarted = (data: { roundId: string }) => {
      setPhase('running');
      setRoundId(data.roundId);
      setMultiplier(1.0);
    };
    const onTick = (data: { multiplier: number }) => setMultiplier(data.multiplier);
    const onCashedOut = (data: { username: string; multiplier: number; payout: number }) => {
      setBets(prev => prev.map(b =>
        b.username === data.username ? { ...b, cashoutAt: data.multiplier, payout: data.payout } : b
      ));
    };
    const onEnded = (data: { roundId: string; crashPoint: number }) => {
      setPhase('crashed');
      setCrashPoint(data.crashPoint);
      setMultiplier(data.crashPoint);
      setHistory(prev => [{ id: data.roundId, crashPoint: data.crashPoint, crashedAt: new Date().toISOString() }, ...prev]);
    };

    (socket as any).on('CRASH_BETTING_OPEN', onBettingOpen);
    (socket as any).on('CRASH_STARTED', onStarted);
    (socket as any).on('CRASH_TICK', onTick);
    (socket as any).on('CRASH_CASHED_OUT', onCashedOut);
    (socket as any).on('CRASH_ENDED', onEnded);
    return () => {
      (socket as any).off('CRASH_BETTING_OPEN', onBettingOpen);
      (socket as any).off('CRASH_STARTED', onStarted);
      (socket as any).off('CRASH_TICK', onTick);
      (socket as any).off('CRASH_CASHED_OUT', onCashedOut);
      (socket as any).off('CRASH_ENDED', onEnded);
    };
  }, []);

  const handleBet = useCallback(async (slotIdx: 1 | 2, amount: number) => {
    const setPlacing = slotIdx === 1 ? setPlacing1 : setPlacing2;
    const setMyBet = slotIdx === 1 ? setMyBet1 : setMyBet2;
    setPlacing(true);
    try {
      const res = await placeCrashBet(amount);
      setMyBet({ betAmount: amount, cashoutAt: null, payout: null });
      setBets(prev => [{ username: myUsername || 'You', betAmount: amount, cashoutAt: null, payout: null }, ...prev]);
      setRoundId(res.roundId);
    } catch { /* ignore */ } finally {
      setPlacing(false);
    }
  }, [myUsername]);

  const handleCashout = useCallback((slotIdx: 1 | 2) => {
    if (!roundId) return;
    const setCashingOut = slotIdx === 1 ? setCashingOut1 : setCashingOut2;
    const setMyBet = slotIdx === 1 ? setMyBet1 : setMyBet2;
    setCashingOut(true);
    (socket as any).emit('CRASH_CASHOUT', { roundId }, (res: any) => {
      setCashingOut(false);
      if (res?.ok) {
        setMyBet(prev => prev ? { ...prev, cashoutAt: res.multiplier, payout: res.payout } : prev);
      }
    });
  }, [roundId]);

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#0d0f1a',
      color: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: 480,
      margin: '0 auto',
      fontFamily: "'Inter', sans-serif",
    }}>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Aviator logo */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M2 16 Q8 8 16 12 L22 6 L23 9 L16 14 L14 20 Q8 22 4 18 Z" fill="#ef4444" />
          </svg>
          <span style={{
            fontSize: 20,
            fontWeight: 900,
            fontStyle: 'italic',
            background: 'linear-gradient(90deg, #ef4444, #f87171)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.5px',
          }}>Aviator</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>0.00 ETB</span>
          <span style={{ fontSize: 18, color: '#475569', cursor: 'pointer' }}>≡</span>
          <span style={{ fontSize: 18, color: '#475569', cursor: 'pointer' }}>💬</span>
        </div>
      </div>

      {/* History chips row */}
      <div style={{ padding: '8px 0 6px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <HistoryChips items={history} />
      </div>

      {/* Crash graph */}
      <div style={{ background: '#111320', position: 'relative', overflow: 'hidden' }}>
        <CrashGraph phase={phase} multiplier={multiplier} crashPoint={crashPoint} />
        {/* Bottom dot row */}
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', padding: '4px 0 8px' }}>
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i === 6 ? '#fff' : 'rgba(255,255,255,0.25)' }} />
          ))}
        </div>
      </div>

      {/* Bet panels */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <BetPanel
          phase={phase}
          multiplier={multiplier}
          myBet={myBet1}
          onBet={(a) => handleBet(1, a)}
          onCashout={() => handleCashout(1)}
          placing={placing1}
          cashingOut={cashingOut1}
        />
        <BetPanel
          phase={phase}
          multiplier={multiplier}
          myBet={myBet2}
          onBet={(a) => handleBet(2, a)}
          onCashout={() => handleCashout(2)}
          placing={placing2}
          cashingOut={cashingOut2}
        />
      </div>

      {/* Bets section tabs */}
      <div style={{ padding: '0 12px 8px' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 8 }}>
          {(['all', 'previous', 'top'] as const).map(t => (
            <button key={t} onClick={() => setBetTab(t)} style={{
              flex: 1,
              padding: '9px 0',
              border: 'none',
              background: 'transparent',
              color: betTab === t ? '#fff' : '#64748b',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              borderBottom: betTab === t ? '2px solid #ef4444' : '2px solid transparent',
              textTransform: 'capitalize',
            }}>
              {t === 'all' ? 'All Bets' : t === 'previous' ? 'Previous' : 'Top'}
            </button>
          ))}
        </div>

        {/* Bet count summary */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: ['#ef4444','#3b82f6','#8b5cf6'][i],
                  marginLeft: i > 0 ? -6 : 0,
                  border: '2px solid #0d0f1a',
                  fontSize: 9, color: '#fff', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} />
              ))}
            </div>
            <span style={{ fontSize: 12, color: '#64748b' }}>{bets.length}/118 Bets</span>
          </div>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>
            Total win ETB
          </span>
        </div>

        {/* Bet rows */}
        <div style={{
          background: '#1a1d2e',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.06)',
          maxHeight: 200,
          overflowY: 'auto',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#14172a' }}>
            <div style={{ flex: 1, fontSize: 11, color: '#475569', fontWeight: 700 }}>User</div>
            <div style={{ minWidth: 48, textAlign: 'right', fontSize: 11, color: '#475569', fontWeight: 700 }}>Bet</div>
            <div style={{ minWidth: 48, textAlign: 'right', fontSize: 11, color: '#475569', fontWeight: 700 }}>Out @</div>
            <div style={{ minWidth: 58, textAlign: 'right', fontSize: 11, color: '#475569', fontWeight: 700 }}>Profit</div>
          </div>
          {bets.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: '#334155' }}>
              No bets this round
            </div>
          ) : bets.map((b, i) => (
            <BetRow key={i} bet={b} isMe={b.username === myUsername} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes cashoutPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 16px rgba(34,197,94,0.4); }
          50% { transform: scale(1.02); box-shadow: 0 0 28px rgba(34,197,94,0.7); }
        }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
