import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import { getCrashState, placeCrashBet, getCrashHistory, getProfile } from '../lib/api';
import type { CrashBetEntry, CrashHistoryEntry } from '../lib/api';
import { getJwtFromStorage } from '../lib/auth-storage';
import aviatorLogo from '../assets/avi/aviator-logo.svg';
import bgSun from '../assets/avi/bg-sun.svg';
import plane0 from '../assets/avi/plane-anim-0.svg';
import plane1 from '../assets/avi/plane-anim-1.svg';
import plane2 from '../assets/avi/plane-anim-2.svg';
import plane3 from '../assets/avi/plane-anim-3.svg';
import crashSound from '../assets/avi/flew_away.mp3';
import bgMusic from '../assets/avi/main-B_lEpEFg.wav';

type Phase = 'waiting' | 'running' | 'crashed' | 'idle';

interface MyBet {
  betAmount: number;
  cashoutAt: number | null;
  payout: number | null;
}

const MIN_BET = 5;
const MAX_BET = 10_000;

// ─── Rules Modal ──────────────────────────────────────────────────────────────
function AviatorRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: '#060a14', overflowY: 'auto', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>✈️ How to Play</span>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 10, padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>✕ Close</button>
      </div>
      <div style={{ padding: '24px 18px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {[
          { title: '🎯 OBJECTIVE', body: 'A plane takes off and a multiplier climbs from 1.00x upward. Cash out before the plane flies away to lock in your winnings.' },
          { title: '💰 HOW TO BET', body: 'Set your bet amount during the betting phase, press BET to confirm, then press CASH OUT anytime to collect Bet × Multiplier.' },
          { title: '⚡ AUTO CASH OUT', body: 'Set a target multiplier. If the plane reaches it, your bet cashes out automatically.' },
        ].map(s => (
          <section key={s.title}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#00d4ff', letterSpacing: '0.08em', marginBottom: 8 }}>{s.title}</div>
            <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.75 }}>{s.body}</div>
          </section>
        ))}
        <section>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#00d4ff', letterSpacing: '0.08em', marginBottom: 10 }}>📋 RULES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {['Min bet 5 ETB, max 10,000 ETB.', 'Bets only accepted during waiting phase.', 'Winnings credited immediately after cashout.', 'Failed cashout = full bet lost.', 'Crash point is provably fair.'].map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#00d4ff', minWidth: 18 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{r}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function fmtMul(v: number): string { return v.toFixed(2) + 'x'; }

// ─── Plane ────────────────────────────────────────────────────────────────────
const planeFrames = [plane0, plane1, plane2, plane3];
function PlaneSVG({ crashed, tilt, frame }: { crashed: boolean; tilt: number; frame: number }) {
  return (
    <div style={{
      transform: `rotate(${tilt}deg)`,
      transition: crashed ? 'transform 0.5s ease-in' : 'transform 0.18s ease-out',
      filter: crashed
        ? 'drop-shadow(0 0 16px #e8073f) brightness(0.7)'
        : 'drop-shadow(0 0 12px rgba(0,212,255,0.9)) drop-shadow(0 0 4px rgba(255,180,80,0.6))',
    }}>
      <img src={planeFrames[frame % 4]} alt="plane" width={100} height={58} style={{ display: 'block', objectFit: 'contain' }} />
    </div>
  );
}

// ─── Particles / Stars ────────────────────────────────────────────────────────
interface Particle { id: number; x: number; y: number; age: number; size: number; }
interface Star { x: number; y: number; speed: number; size: number; alpha: number; teal: boolean; }

// ─── Countdown bar ────────────────────────────────────────────────────────────
function CountdownBar() {
  const [pct, setPct] = useState(100);
  const startRef = useRef(Date.now());
  useEffect(() => {
    startRef.current = Date.now();
    const id = setInterval(() => {
      const p = Math.max(0, 100 - ((Date.now() - startRef.current) / 10000) * 100);
      setPct(p);
      if (p <= 0) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ width: 140, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', margin: '8px auto 0' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#00d4ff,#0099bb)', borderRadius: 4, transition: 'width 0.08s linear' }} />
    </div>
  );
}

// ─── History chips ────────────────────────────────────────────────────────────
function HistoryChips({ items }: { items: CrashHistoryEntry[] }) {
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 0', scrollbarWidth: 'none' }}>
      <div style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 999, background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff', fontSize: 9, fontWeight: 800, letterSpacing: '0.12em' }}>
        HISTORY
      </div>
      {items.slice(0, 14).map((r, i) => {
        const v = r.crashPoint ?? 0;
        const c = v < 2 ? '#f5a623' : v < 10 ? '#00d4ff' : '#a855f7';
        return (
          <div key={r.id ?? i} style={{ flexShrink: 0, padding: '5px 9px', borderRadius: 999, background: `${c}18`, border: `1px solid ${c}44`, fontSize: 10, fontWeight: 800, color: c }}>
            {fmtMul(v)}
          </div>
        );
      })}
    </div>
  );
}

// ─── Crash Graph ──────────────────────────────────────────────────────────────
function CrashGraph({ phase, multiplier, crashPoint }: { phase: Phase; multiplier: number; crashPoint: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  const startTimeRef = useRef(Date.now());
  const particlesRef = useRef<Particle[]>([]);
  const particleIdRef = useRef(0);
  const starsRef = useRef<Star[]>([]);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const [planePct, setPlanePct] = useState<{ x: number; y: number } | null>(null);
  const [planeTilt, setPlaneTilt] = useState(-15);
  const [planeFrame, setPlaneFrame] = useState(0);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCrashed = phase === 'crashed';
  const displayVal = isCrashed ? (crashPoint ?? multiplier) : multiplier;

  useEffect(() => {
    const img = new Image(); img.src = bgSun;
    img.onload = () => { bgImgRef.current = img; };
  }, []);

  useEffect(() => {
    if (starsRef.current.length) return;
    starsRef.current = Array.from({ length: 110 }, () => ({
      x: Math.random() * 480, y: Math.random() * 250,
      speed: 10 + Math.random() * 75,
      size: Math.random() > 0.7 ? 1.2 + Math.random() * 0.8 : 0.3 + Math.random() * 0.4,
      alpha: 0.2 + Math.random() * 0.8,
      teal: Math.random() > 0.6,
    }));
  }, []);

  useEffect(() => {
    if (phase === 'running') {
      frameTimerRef.current = setInterval(() => setPlaneFrame(f => (f + 1) % 4), 110);
    } else {
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);
      setPlaneFrame(0);
    }
    return () => { if (frameTimerRef.current) clearInterval(frameTimerRef.current); };
  }, [phase]);

  useEffect(() => {
    if (phase === 'waiting' || phase === 'idle') {
      pointsRef.current = []; startTimeRef.current = Date.now();
      setPlanePct(null); setPlaneTilt(-15); particlesRef.current = [];
    }
    if (phase === 'running') {
      startTimeRef.current = Date.now(); pointsRef.current = []; particlesRef.current = [];
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'running' && phase !== 'crashed') return;
    const t = (Date.now() - startTimeRef.current) / 1000;
    const pts = pointsRef.current;
    const last = pts[pts.length - 1];
    if (!last || Math.abs(multiplier - last.y) > 0.02 || t - last.x > 0.15) {
      pts.push({ x: t, y: multiplier });
      if (pts.length > 400) pts.splice(0, pts.length - 400);
    }
  }, [multiplier, phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let lastT = Date.now(), animId = 0, crashAge = 0;

    const draw = () => {
      const now = Date.now();
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      if (isCrashed) crashAge = Math.min(crashAge + dt * 1.6, 1);

      const ctx = canvas.getContext('2d')!;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // ── BG: deep radial purple-navy ──────────────────────────────────────
      const bg = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, W * 0.85);
      if (isCrashed) {
        bg.addColorStop(0, '#2a0510'); bg.addColorStop(0.5, '#140208'); bg.addColorStop(1, '#080104');
      } else {
        bg.addColorStop(0, '#1a1048'); bg.addColorStop(0.45, '#0d0b28'); bg.addColorStop(1, '#050610');
      }
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // ── bgSun overlay ────────────────────────────────────────────────────
      if (bgImgRef.current) {
        ctx.globalAlpha = isCrashed ? 0.04 : 0.10;
        ctx.drawImage(bgImgRef.current, W * 0.1, H * 0.05, W * 0.8, H * 0.9);
        ctx.globalAlpha = 1;
      }

      // ── Stars ────────────────────────────────────────────────────────────
      starsRef.current.forEach(s => {
        if (phase === 'running') {
          s.x -= s.speed * dt;
          if (s.x < 0) { s.x = W + 5; s.y = Math.random() * H; }
        }
        const tw = s.alpha * (0.5 + 0.5 * Math.sin(now / 900 + s.x * 0.5));
        if (phase === 'running' && s.speed > 45) {
          const tl = s.speed * 0.14;
          const g = ctx.createLinearGradient(s.x, s.y, s.x + tl, s.y);
          const col = s.teal ? `rgba(0,212,255,${tw * 0.5})` : `rgba(200,220,255,${tw * 0.5})`;
          g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + tl, s.y);
          ctx.strokeStyle = g; ctx.lineWidth = s.size * 0.7; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = isCrashed
          ? `rgba(255,140,140,${tw * 0.4})`
          : s.teal ? `rgba(0,212,255,${tw * 0.7})` : `rgba(200,220,255,${tw})`;
        ctx.fill();
      });

      const pL = 6, pB = 8, pT = 8, pR = 6;
      const gW = W - pL - pR, gH = H - pT - pB;
      const pts = pointsRef.current;
      const last = pts[pts.length - 1];
      const maxT = last ? Math.max(last.x, 1) : 1;
      const rawM = last ? Math.max(last.y, 1.5) : 2;
      const lvls = [1.5,2,3,5,8,10,15,20,30,50,100,200];
      const maxM = lvls.find(l => l >= rawM * 1.18) ?? rawM * 1.3;
      const toX = (t: number) => pL + (t / maxT) * gW;
      const toY = (m: number) => H - pB - ((m - 1) / Math.max(maxM - 1, 0.1)) * gH;

      if (pts.length < 2) { animId = requestAnimationFrame(draw); return; }

      const tipX = toX(last!.x), tipY = toY(last!.y);

      // ── Smooth curve path (Catmull-Rom) ──────────────────────────────────
      const curvePath = () => {
        ctx.moveTo(toX(pts[0]!.x), toY(pts[0]!.y));
        if (pts.length === 2) { ctx.lineTo(toX(pts[1]!.x), toY(pts[1]!.y)); return; }
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(i-1,0)]!, p1 = pts[i]!, p2 = pts[i+1]!, p3 = pts[Math.min(i+2,pts.length-1)]!;
          const t = 0.45;
          const cp1x = toX(p1.x) + (toX(p2.x) - toX(p0.x)) * t / 3;
          const cp1y = toY(p1.y) + (toY(p2.y) - toY(p0.y)) * t / 3;
          const cp2x = toX(p2.x) - (toX(p3.x) - toX(p1.x)) * t / 3;
          const cp2y = toY(p2.y) - (toY(p3.y) - toY(p1.y)) * t / 3;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, toX(p2.x), toY(p2.y));
        }
      };

      // ── Fill area ────────────────────────────────────────────────────────
      const fill = ctx.createLinearGradient(0, tipY, 0, H - pB);
      if (isCrashed) {
        fill.addColorStop(0, 'rgba(232,7,63,0.35)'); fill.addColorStop(1, 'rgba(232,7,63,0)');
      } else {
        fill.addColorStop(0, 'rgba(0,212,255,0.22)'); fill.addColorStop(0.5, 'rgba(0,212,255,0.06)'); fill.addColorStop(1, 'rgba(0,212,255,0)');
      }
      ctx.beginPath(); ctx.moveTo(toX(pts[0]!.x), H - pB); curvePath(); ctx.lineTo(tipX, H - pB); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();

      // ── Outer soft glow ──────────────────────────────────────────────────
      ctx.beginPath(); curvePath();
      ctx.strokeStyle = isCrashed ? 'rgba(232,7,63,0.18)' : 'rgba(0,212,255,0.16)';
      ctx.lineWidth = 16; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();

      ctx.beginPath(); curvePath();
      ctx.strokeStyle = isCrashed ? 'rgba(232,7,63,0.30)' : 'rgba(0,212,255,0.28)';
      ctx.lineWidth = 7; ctx.stroke();

      // ── Main curve ───────────────────────────────────────────────────────
      ctx.beginPath(); curvePath();
      ctx.strokeStyle = isCrashed ? '#f87171' : '#00d4ff';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = isCrashed ? '#ef4444' : '#00d4ff';
      ctx.shadowBlur = isCrashed ? 6 : 14;
      ctx.stroke(); ctx.shadowBlur = 0;

      // ── Engine exhaust particles ──────────────────────────────────────────
      if (!isCrashed) {
        for (let i = 0; i < 2; i++) {
          particlesRef.current.push({
            id: particleIdRef.current++,
            x: tipX - 2 + (Math.random() - 0.5) * 5,
            y: tipY + 1 + (Math.random() - 0.5) * 4,
            age: 0, size: 1.5 + Math.random() * 2,
          });
        }
        if (particlesRef.current.length > 70) particlesRef.current.splice(0, 10);
      }
      particlesRef.current = particlesRef.current.filter(p => p.age < 1);
      particlesRef.current.forEach(p => {
        p.age += dt * 1.2; p.x -= dt * 45; p.y += (Math.random() - 0.5) * dt * 5;
        const lf = 1 - p.age, r = p.size * (1 + p.age * 2);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,${Math.round(160*lf)},${Math.round(50*lf)},${lf * 0.5})`;
        ctx.fill();
      });

      // ── Tip pulsing dot ───────────────────────────────────────────────────
      if (!isCrashed) {
        const pulse = (now % 1000) / 1000;
        ctx.beginPath(); ctx.arc(tipX, tipY, 7 + pulse * 12, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,212,255,${(1 - pulse) * 0.28})`; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(tipX, tipY, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 20; ctx.fill(); ctx.shadowBlur = 0;
      }

      // ── Crash explosion ───────────────────────────────────────────────────
      if (isCrashed && last) {
        [1,0.65,0.4].forEach((d, i) => {
          const a2 = Math.max(0, crashAge - (1-d)*0.25);
          const ring = a2 * (28 + i*16), alpha = Math.max(0,(1-a2)*(0.5-i*0.1));
          if (ring <= 0) return;
          ctx.beginPath(); ctx.arc(tipX, tipY, ring, 0, Math.PI*2);
          ctx.strokeStyle = `rgba(255,${50-i*10},${30-i*5},${alpha})`;
          ctx.lineWidth = 2.5-i*0.5; ctx.shadowColor='#ff2020'; ctx.shadowBlur=10; ctx.stroke(); ctx.shadowBlur=0;
        });
        for (let i=0;i<8;i++) {
          const angle=(i/8)*Math.PI*2, dist=crashAge*32;
          const sx=tipX+Math.cos(angle)*dist, sy=tipY+Math.sin(angle)*dist;
          const al=Math.max(0,1-crashAge*1.4);
          ctx.beginPath(); ctx.arc(sx,sy,Math.max(0.2,2.5-crashAge*2),0,Math.PI*2);
          ctx.fillStyle=`rgba(255,${80+i*8},40,${al})`;ctx.shadowColor='#ff3030';ctx.shadowBlur=6;ctx.fill();ctx.shadowBlur=0;
        }
        ctx.beginPath(); ctx.arc(tipX,tipY,Math.max(0.5,6*(1-crashAge*0.5)),0,Math.PI*2);
        ctx.fillStyle=`rgba(255,80,50,${Math.max(0,0.9-crashAge*0.9)})`;ctx.shadowColor='#ff2020';ctx.shadowBlur=22;ctx.fill();ctx.shadowBlur=0;
      }

      // ── Tilt ─────────────────────────────────────────────────────────────
      if (pts.length >= 2) {
        const prev = pts[Math.max(0, pts.length-4)]!;
        const dx = toX(last!.x)-toX(prev.x), dy = toY(last!.y)-toY(prev.y);
        setPlaneTilt(isCrashed ? 55 : Math.max(-40, Math.min(4, (Math.atan2(dy,dx)*180)/Math.PI)));
      }
      setPlanePct({ x: (tipX/W)*100, y: (tipY/H)*100 });

      if (phase === 'running' || phase === 'crashed') animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animId); };
  }, [phase, isCrashed]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasRef} width={480} height={250} style={{ width: '100%', height: '100%', display: 'block' }} />

      {(phase === 'running' || phase === 'crashed') && planePct && (
        <div style={{
          position: 'absolute',
          left: `${Math.min(planePct.x, 88)}%`,
          top: `${Math.max(Math.min(planePct.y, 90), 2)}%`,
          transform: 'translate(-50%, -100%)',
          transition: isCrashed ? 'left 0.5s ease-in, top 0.5s ease-in' : 'left 0.1s linear, top 0.1s linear',
          pointerEvents: 'none', zIndex: 10,
        }}>
          <PlaneSVG crashed={isCrashed} tilt={planeTilt} frame={planeFrame} />
        </div>
      )}

      {/* Multiplier overlay */}
      <div style={{ position: 'absolute', top: '44%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none', zIndex: 20 }}>
        {phase === 'waiting' && (
          <div style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>
            <div style={{ letterSpacing: '0.05em' }}>✈️ Next round starting...</div>
            <CountdownBar />
          </div>
        )}
        {(phase === 'running' || phase === 'crashed') && (
          <>
            <div style={{
              fontSize: 'clamp(44px,13vw,70px)', fontWeight: 900,
              color: isCrashed ? '#ef4444' : '#ffffff', lineHeight: 1,
              letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums',
              textShadow: isCrashed ? '0 0 50px rgba(239,68,68,0.9)' : '0 0 40px rgba(0,212,255,0.6), 0 0 15px rgba(255,255,255,0.4)',
              animation: isCrashed ? 'crashShake 0.4s ease-out' : undefined,
            }}>
              {fmtMul(displayVal)}
            </div>
            {isCrashed && <div style={{ color: '#ef4444', fontWeight: 900, fontSize: 11, letterSpacing: '0.22em', marginTop: 6, textShadow: '0 0 16px rgba(239,68,68,0.8)' }}>FLEW AWAY!</div>}
          </>
        )}
        {phase === 'idle' && <div style={{ color: '#2a3040', fontSize: 20, fontWeight: 700 }}>—</div>}
      </div>
    </div>
  );
}

// ─── Bet Panel ────────────────────────────────────────────────────────────────
function adjBtnStyle(on: boolean): React.CSSProperties {
  return { width: 38, height: 38, borderRadius: '50%', border: 'none', background: on ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)', color: on ? '#fff' : '#3a4455', fontSize: 22, fontWeight: 300, cursor: on ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 };
}

interface BetPanelProps {
  phase: Phase; multiplier: number; myBet: MyBet | null;
  onBet: (amount: number) => void; onCashout: () => void;
  placing: boolean; cashingOut: boolean;
}

function BetPanel({ phase, multiplier, myBet, onBet, onCashout, placing, cashingOut }: BetPanelProps) {
  const [tab, setTab] = useState<'bet' | 'auto'>('bet');
  const [amount, setAmount] = useState(10);
  const QUICK = [5, 10, 40, 100];
  const [autoRounds, setAutoRounds] = useState(5);
  const [autoCashoutAt, setAutoCashoutAt] = useState(2.0);
  const [autoActive, setAutoActive] = useState(false);
  const [autoRoundsLeft, setAutoRoundsLeft] = useState(0);
  const autoActiveRef = useRef(false);
  const autoRoundsLeftRef = useRef(0);
  const autoBetPendingRef = useRef(false);
  const prevPhaseRef = useRef<Phase>(phase);

  useEffect(() => {
    const prev = prevPhaseRef.current; prevPhaseRef.current = phase;
    if (!autoActiveRef.current || phase !== 'waiting') return;
    if (prev !== 'waiting' || autoBetPendingRef.current) {
      autoBetPendingRef.current = false;
      if (autoRoundsLeftRef.current > 0 && !myBet && !placing) {
        onBet(amount); autoRoundsLeftRef.current--;
        setAutoRoundsLeft(autoRoundsLeftRef.current);
        if (autoRoundsLeftRef.current <= 0) { setAutoActive(false); autoActiveRef.current = false; }
      } else if (autoRoundsLeftRef.current <= 0) { setAutoActive(false); autoActiveRef.current = false; }
    }
  }, [phase, myBet, placing]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasCashedRef = useRef(false);
  useEffect(() => {
    if (!autoActive || !myBet || myBet.cashoutAt !== null || phase !== 'running') return;
    if (!hasCashedRef.current && multiplier >= autoCashoutAt) { hasCashedRef.current = true; onCashout(); }
  }, [multiplier, phase, autoActive, myBet, autoCashoutAt, onCashout]);
  useEffect(() => { if (phase === 'waiting') hasCashedRef.current = false; }, [phase]);

  const startAuto = () => {
    autoRoundsLeftRef.current = autoRounds; autoActiveRef.current = true;
    autoBetPendingRef.current = phase === 'waiting';
    setAutoRoundsLeft(autoRounds); setAutoActive(true);
  };
  const stopAuto = () => { autoActiveRef.current = false; autoBetPendingRef.current = false; setAutoActive(false); setAutoRoundsLeft(0); };
  const adj = (d: number) => setAmount(a => Math.max(MIN_BET, Math.min(MAX_BET, a + d)));

  const canBet = phase === 'waiting' && !myBet && !placing;
  const canCashout = phase === 'running' && myBet && myBet.cashoutAt === null && !cashingOut;
  const cashedOut = myBet && myBet.cashoutAt !== null;

  const phaseBadge = phase === 'waiting'
    ? { label: 'OPEN', color: '#00d4ff', bg: 'rgba(0,212,255,0.1)', border: 'rgba(0,212,255,0.3)' }
    : phase === 'running'
    ? { label: 'LIVE', color: '#f5a623', bg: 'rgba(245,166,35,0.12)', border: 'rgba(245,166,35,0.4)' }
    : { label: 'CLOSED', color: '#4a5568', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)' };

  return (
    <div style={{ background: '#12151f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '14px 14px 16px' }}>
      {/* Tab row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {(['bet','auto'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '7px 18px', background: 'none', border: 'none',
              borderBottom: tab === t ? '2px solid #00d4ff' : '2px solid transparent',
              color: tab === t ? '#fff' : '#4a5568',
              fontWeight: 800, fontSize: 13, cursor: 'pointer', letterSpacing: '0.04em',
            }}>{t === 'bet' ? 'BET' : 'AUTO'}</button>
          ))}
        </div>
        <div style={{ padding: '4px 11px', borderRadius: 999, background: phaseBadge.bg, border: `1px solid ${phaseBadge.border}`, color: phaseBadge.color, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', animation: phase === 'running' ? 'livePulse 1.4s ease-in-out infinite' : undefined }}>
          {phaseBadge.label}
        </div>
      </div>

      {tab === 'bet' ? (
        <>
          {/* Amount */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <button onClick={() => adj(-1)} disabled={!canBet} style={adjBtnStyle(canBet)}>−</button>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 32, fontWeight: 900, color: '#fff', letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>
              {amount.toFixed(2)}
            </div>
            <button onClick={() => adj(1)} disabled={!canBet} style={adjBtnStyle(canBet)}>+</button>
          </div>

          {/* Quick picks — single row */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {QUICK.map(q => (
              <button key={q} onClick={() => canBet && setAmount(q)} style={{
                flex: 1, padding: '9px 0', borderRadius: 999,
                border: amount === q ? '1.5px solid #00d4ff' : '1px solid rgba(255,255,255,0.1)',
                background: amount === q ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.04)',
                color: amount === q ? '#00d4ff' : '#64748b',
                fontSize: 12, fontWeight: 700, cursor: canBet ? 'pointer' : 'default',
              }}>{q} ETB</button>
            ))}
          </div>

          {/* Action button */}
          {canCashout ? (
            <button onClick={onCashout} style={{
              width: '100%', height: 56, borderRadius: 16, border: 'none',
              background: 'linear-gradient(135deg, #f5a623, #e8900a)',
              color: '#1a0800', fontSize: 16, fontWeight: 900, cursor: 'pointer',
              boxShadow: '0 0 24px rgba(245,166,35,0.5)', animation: 'cashPulse 1s ease-in-out infinite',
            }}>
              {cashingOut ? '...' : <><div style={{ lineHeight: 1.2 }}>CASH OUT</div><div style={{ fontSize: 12, opacity: 0.85 }}>{(myBet!.betAmount * multiplier).toFixed(2)} ETB</div></>}
            </button>
          ) : cashedOut ? (
            <button disabled style={{ width: '100%', height: 56, borderRadius: 16, border: 'none', background: 'rgba(34,197,94,0.12)', color: '#4ade80', fontSize: 13, fontWeight: 800, cursor: 'default' }}>
              ✓ Cashed {fmtMul(myBet!.cashoutAt!)}
            </button>
          ) : canBet ? (
            <button onClick={() => onBet(amount)} style={{
              width: '100%', height: 56, borderRadius: 16, border: 'none',
              background: 'linear-gradient(135deg, #00d4ff, #0099bb)',
              color: '#fff', fontSize: 16, fontWeight: 900, cursor: 'pointer',
              boxShadow: '0 0 20px rgba(0,212,255,0.4)', animation: 'betGlow 2s ease-in-out infinite',
            }}>
              {placing ? '...' : <><div style={{ lineHeight: 1.2 }}>BET</div><div style={{ fontSize: 12, opacity: 0.85 }}>{amount.toFixed(2)} ETB</div></>}
            </button>
          ) : (
            <button disabled style={{ width: '100%', height: 56, borderRadius: 16, border: 'none', background: 'rgba(255,255,255,0.05)', color: '#3a4455', fontSize: 14, fontWeight: 800, cursor: 'default' }}>
              Bet Next Round
            </button>
          )}
        </>
      ) : (
        /* AUTO TAB */
        <>
          {autoActive && (
            <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#f5a623', background: 'rgba(245,166,35,0.08)', borderRadius: 8, padding: '5px 8px', border: '1px solid rgba(245,166,35,0.22)', marginBottom: 12 }}>
              Auto — {autoRoundsLeft} round{autoRoundsLeft !== 1 ? 's' : ''} left
            </div>
          )}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: '#3a4455', marginBottom: 5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Bet Amount</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => adj(-1)} disabled={autoActive} style={adjBtnStyle(!autoActive)}>−</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 24, fontWeight: 900, color: '#fff' }}>{amount.toFixed(2)}</div>
              <button onClick={() => adj(1)} disabled={autoActive} style={adjBtnStyle(!autoActive)}>+</button>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: '#3a4455', marginBottom: 5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Auto Cashout At</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button disabled={autoActive} onClick={() => setAutoCashoutAt(v => Math.max(1.1, parseFloat((v-0.1).toFixed(2))))} style={adjBtnStyle(!autoActive)}>−</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 24, fontWeight: 900, color: '#f5a623' }}>{autoCashoutAt.toFixed(2)}x</div>
              <button disabled={autoActive} onClick={() => setAutoCashoutAt(v => parseFloat((v+0.1).toFixed(2)))} style={adjBtnStyle(!autoActive)}>+</button>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: '#3a4455', marginBottom: 5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Rounds</div>
            <div style={{ display: 'flex', gap: 5 }}>
              {[3,5,10,20,50].map(v => (
                <button key={v} disabled={autoActive} onClick={() => setAutoRounds(v)} style={{
                  flex: 1, padding: '7px 0', borderRadius: 8, border: autoRounds===v?'1.5px solid #00d4ff':'1px solid rgba(255,255,255,0.08)',
                  background: autoRounds===v?'rgba(0,212,255,0.1)':'rgba(255,255,255,0.04)',
                  color: autoRounds===v?'#00d4ff':'#4a5568', fontSize: 11, fontWeight: 700, cursor: autoActive?'default':'pointer',
                }}>{v}</button>
              ))}
            </div>
          </div>
          {autoActive
            ? <button onClick={stopAuto} style={{ width: '100%', height: 50, borderRadius: 14, border: 'none', background: 'rgba(232,7,63,0.8)', color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>Stop Auto</button>
            : <button onClick={startAuto} style={{ width: '100%', height: 50, borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#00d4ff,#0099bb)', color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer', boxShadow: '0 0 16px rgba(0,212,255,0.3)' }}>Start Auto ({autoRounds} rounds)</button>
          }
        </>
      )}
    </div>
  );
}

// ─── Bet Row ──────────────────────────────────────────────────────────────────
function BetRow({ bet, isMe }: { bet: CrashBetEntry; isMe: boolean }) {
  const cashed = bet.cashoutAt !== null;
  const init = (bet.username || 'P').charAt(0).toUpperCase();
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)', background: isMe ? 'rgba(0,212,255,0.04)' : 'transparent', gap: 8 }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: isMe ? 'linear-gradient(135deg,#00d4ff,#0077aa)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isMe ? '#003' : '#4a5568', fontSize: 10, fontWeight: 900 }}>{init}</div>
      <div style={{ flex: 1, fontSize: 12, color: isMe ? '#00d4ff' : '#6b7a8d', fontWeight: isMe ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isMe ? 'You' : bet.username}</div>
      <div style={{ fontSize: 12, color: '#8892a4', minWidth: 44, textAlign: 'right' }}>{bet.betAmount}</div>
      <div style={{ fontSize: 12, minWidth: 46, textAlign: 'right', color: cashed ? '#22c55e' : '#3a4455', fontWeight: 700 }}>{cashed ? fmtMul(bet.cashoutAt!) : '—'}</div>
      <div style={{ fontSize: 12, minWidth: 54, textAlign: 'right', color: cashed ? '#4ade80' : '#ef4444', fontWeight: 700 }}>{cashed ? `+${bet.payout ?? ''}` : 'BUST'}</div>
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CrashScreen() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('idle');
  const [multiplier, setMultiplier] = useState(1.0);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [myBet1, setMyBet1] = useState<MyBet | null>(null);
  const [myBet2, setMyBet2] = useState<MyBet | null>(null);
  const [bets, setBets] = useState<CrashBetEntry[]>([]);
  const [history, setHistory] = useState<CrashHistoryEntry[]>([]);
  const [placing1, setPlacing1] = useState(false);
  const [cashingOut1, setCashingOut1] = useState(false);
  const placingRef1 = useRef(false);
  const [betTab, setBetTab] = useState<'all' | 'previous'>('all');
  const [myUsername, setMyUsername] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [depositModal, setDepositModal] = useState(false);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);

  // Background music
  useEffect(() => {
    const audio = new Audio(bgMusic);
    audio.loop = true; audio.volume = 0.25;
    bgAudioRef.current = audio;
    void audio.play().catch(() => {
      const start = () => { void audio.play().catch(() => {}); };
      window.addEventListener('pointerdown', start, { once: true });
    });
    return () => { audio.pause(); };
  }, []);

  const playRoundSound = useCallback((kind: 'start' | 'finish') => {
    const a = new Audio(crashSound); a.volume = kind === 'finish' ? 0.85 : 0.55; a.currentTime = 0; void a.play().catch(() => {});
  }, []);

  useEffect(() => {
    getCrashState().then(s => {
      const p = s.phase === 'idle' ? 'idle' : s.phase as Phase;
      setPhase(p);
      if (s.round) setRoundId(s.round.id);
      if (s.round?.crashPoint) setCrashPoint(s.round.crashPoint);
      if (p === 'running' && s.round?.currentMultiplier) setMultiplier(s.round.currentMultiplier);
      if (s.myBet) setMyBet1(s.myBet);
      setBets(s.bets);
    }).catch(() => {});
    getCrashHistory().then(setHistory).catch(() => {});
    getProfile().then(p => setBalance(p.mainWallet.balance)).catch(() => {});
    try {
      const jwt = getJwtFromStorage() ?? '';
      const payload = JSON.parse(atob(jwt.split('.')[1]!));
      setMyUsername(payload.username ?? '');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const onBettingOpen = (d: { roundId: string }) => {
      setPhase('waiting'); setRoundId(d.roundId); setMultiplier(1.0);
      setCrashPoint(null); setMyBet1(null); setMyBet2(null); setBets([]);
    };
    const onStarted = (d: { roundId: string }) => {
      setPhase('running'); setRoundId(d.roundId); setMultiplier(1.0); playRoundSound('start');
    };
    const onTick = (d: { multiplier: number }) => setMultiplier(d.multiplier);
    const onCashedOut = (d: { username: string; multiplier: number; payout: number }) => {
      setBets(prev => prev.map(b => b.username === d.username ? { ...b, cashoutAt: d.multiplier, payout: d.payout } : b));
    };
    const onEnded = (d: { roundId: string; crashPoint: number }) => {
      setPhase('crashed'); setCrashPoint(d.crashPoint); setMultiplier(d.crashPoint);
      playRoundSound('finish');
      setHistory(prev => [{ id: d.roundId, crashPoint: d.crashPoint, crashedAt: new Date().toISOString() }, ...prev]);
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
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleBet = useCallback(async (slotIdx: 1 | 2, amount: number) => {
    const setPlacing = slotIdx === 1 ? setPlacing1 : (() => {});
    const setMyBet = slotIdx === 1 ? setMyBet1 : setMyBet2;
    const currentBet = slotIdx === 1 ? myBet1 : myBet2;
    const placingRef = placingRef1;
    if (currentBet || placingRef.current) return;
    placingRef.current = true; setPlacing(true);
    try {
      const res = await placeCrashBet(amount, slotIdx);
      setMyBet({ betAmount: amount, cashoutAt: null, payout: null });
      setBets(prev => [{ username: myUsername || 'You', betAmount: amount, cashoutAt: null, payout: null }, ...prev]);
      setRoundId(res.roundId);
      getProfile().then(p => setBalance(p.mainWallet.balance)).catch(() => {});
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (!msg.toLowerCase().includes('already')) {
        if (msg.includes('ቀሪ ሂሳብ') || msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('deposit')) {
          setDepositModal(true);
        } else { alert(msg || 'Failed to place bet'); }
      }
    } finally { placingRef.current = false; setPlacing(false); }
  }, [myUsername, myBet1, myBet2]);

  const handleCashout = useCallback((slotIdx: 1 | 2) => {
    if (!roundId) return;
    const setCO = slotIdx === 1 ? setCashingOut1 : (() => {});
    const setMyBet = slotIdx === 1 ? setMyBet1 : setMyBet2;
    setCO(true);
    (socket as any).emit('CRASH_CASHOUT', { roundId, slot: slotIdx }, (res: any) => {
      setCO(false);
      if (res?.ok) {
        setMyBet(prev => prev ? { ...prev, cashoutAt: res.multiplier, payout: res.payout } : prev);
        getProfile().then(p => setBalance(p.mainWallet.balance)).catch(() => {});
      }
    });
  }, [roundId]);

  const usernameInitial = (myUsername || 'P').charAt(0).toUpperCase();
  const liveBets = bets;
  const myBets = bets.filter(b => b.username === (myUsername || 'You'));

  return (
    <div style={{ height: '100dvh', background: '#0d0f1a', color: '#f8fafc', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 430, margin: '0 auto', fontFamily: "'Inter', sans-serif", overflow: 'hidden', boxSizing: 'border-box' }}>
      {showRules && <AviatorRulesModal onClose={() => setShowRules(false)} />}

      {/* Deposit modal */}
      {depositModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'linear-gradient(145deg,#0f1e2e,#0a1220)', border: '1px solid rgba(0,212,255,0.25)', borderRadius: 24, padding: '32px 24px', maxWidth: 320, width: '100%', textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>💳</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 8 }}>ቀሪ ሂሳብ አይበቃም!</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, lineHeight: 1.6 }}>Insufficient balance. Welcome bonus only works for Bingo. Deposit to play Aviator.</div>
            <button onClick={() => { setDepositModal(false); navigate('/wallet'); }} style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#f5a623,#e8900a)', color: '#1a0800', fontWeight: 900, fontSize: 15, cursor: 'pointer', marginBottom: 10 }}>Deposit Now</button>
            <button onClick={() => setDepositModal(false)} style={{ width: '100%', padding: '11px 0', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ height: 50, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(13,15,26,0.98)', borderBottom: '1px solid rgba(0,212,255,0.08)', padding: '0 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#4a5568', fontSize: 22, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>‹</button>
          <img src={aviatorLogo} alt="Aviator" style={{ height: 20 }} />
          <button onClick={() => setShowRules(true)} style={{ background: 'rgba(0,212,255,0.07)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 999, color: '#00d4ff', fontSize: 10, fontWeight: 700, padding: '3px 10px', cursor: 'pointer' }}>Rules</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ padding: '5px 10px', borderRadius: 999, background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.25)', color: '#00d4ff', fontSize: 11, fontWeight: 800 }}>
            {balance !== null ? balance.toFixed(2) : '—'} ETB
          </div>
          <button onClick={() => navigate('/wallet')} style={{ border: 'none', background: 'linear-gradient(135deg,#f5a623,#e8900a)', color: '#1a0800', borderRadius: 999, padding: '6px 14px', fontSize: 11, fontWeight: 900, cursor: 'pointer', boxShadow: '0 0 14px rgba(245,166,35,0.35)' }}>Deposit</button>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#00d4ff,#0077aa)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#003', fontWeight: 900, fontSize: 12, flexShrink: 0 }}>{usernameInitial}</div>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0 20px', scrollbarWidth: 'none' }}>

        {/* History */}
        <div style={{ padding: '0 14px' }}>
          <HistoryChips items={history} />
        </div>

        {/* Graph */}
        <div style={{ margin: '0 14px', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(0,212,255,0.12)', boxShadow: '0 0 32px rgba(0,212,255,0.07)', height: 250, flexShrink: 0 }}>
          <CrashGraph phase={phase} multiplier={multiplier} crashPoint={crashPoint} />
        </div>

        {/* Bet panel */}
        <div style={{ padding: '0 14px' }}>
          <BetPanel phase={phase} multiplier={multiplier} myBet={myBet1} onBet={amt => void handleBet(1, amt)} onCashout={() => handleCashout(1)} placing={placing1} cashingOut={cashingOut1} />
        </div>

        {/* Bets table */}
        <div style={{ margin: '0 14px', background: '#12151f', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {(['all','previous'] as const).map(k => (
              <button key={k} onClick={() => setBetTab(k)} style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: betTab===k?'2px solid #00d4ff':'2px solid transparent', color: betTab===k?'#fff':'#4a5568', padding: '10px 0', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                {k === 'all' ? `Live Bets (${liveBets.length})` : 'My Bets'}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.85fr 0.85fr', padding: '8px 12px 4px', fontSize: 9, fontWeight: 800, color: '#2a3040', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            <span>Player</span><span style={{ textAlign: 'right' }}>Bet</span><span style={{ textAlign: 'right' }}>Cashout</span><span style={{ textAlign: 'right' }}>Payout</span>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', scrollbarWidth: 'none' }}>
            {(betTab==='all'?liveBets:myBets).length===0
              ? <div style={{ padding: '20px 12px', textAlign: 'center', color: '#2a3040', fontSize: 12 }}>{betTab==='all'?'No bets this round yet':'No bets yet'}</div>
              : (betTab==='all'?liveBets:myBets).map((bet,i) => <BetRow key={`${bet.username}-${i}`} bet={bet} isMe={bet.username===(myUsername||'You')} />)
            }
          </div>
        </div>

      </div>

      <style>{`
        @keyframes crashShake {
          0%{transform:translate(-50%,-50%) translateX(0)}
          20%{transform:translate(-50%,-50%) translateX(-6px)}
          40%{transform:translate(-50%,-50%) translateX(6px)}
          60%{transform:translate(-50%,-50%) translateX(-4px)}
          80%{transform:translate(-50%,-50%) translateX(4px)}
          100%{transform:translate(-50%,-50%) translateX(0)}
        }
        @keyframes livePulse {
          0%,100%{box-shadow:0 0 0 0 rgba(245,166,35,0)}
          50%{box-shadow:0 0 8px 3px rgba(245,166,35,0.35)}
        }
        @keyframes betGlow {
          0%,100%{box-shadow:0 0 18px rgba(0,212,255,0.35)}
          50%{box-shadow:0 0 30px rgba(0,212,255,0.65)}
        }
        @keyframes cashPulse {
          0%,100%{box-shadow:0 0 18px rgba(245,166,35,0.4);transform:scale(1)}
          50%{box-shadow:0 0 32px rgba(245,166,35,0.7);transform:scale(1.015)}
        }
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );
}
