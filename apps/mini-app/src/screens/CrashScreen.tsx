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

function fmtMul(v: number): string { return v.toFixed(2) + 'x'; } // Updated

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
          { title: '💰 HOW TO BET', body: 'Set your bet amount, press BET to confirm, then press CASH OUT to collect Bet × Multiplier.' },
          { title: '⚡ AUTO CASH OUT', body: 'Set a target multiplier. If the plane reaches it, your bet cashes out automatically.' },
        ].map(s => (
          <section key={s.title}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#c44dff', letterSpacing: '0.08em', marginBottom: 8 }}>{s.title}</div>
            <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.75 }}>{s.body}</div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ─── Plane frames ─────────────────────────────────────────────────────────────
const planeFrames = [plane0, plane1, plane2, plane3];
function PlaneSVG({ crashed, tilt, frame }: { crashed: boolean; tilt: number; frame: number }) {
  return (
    <div style={{
      transform: `rotate(${tilt}deg)`,
      transition: crashed ? 'transform 0.5s ease-in' : 'transform 0.18s ease-out',
      filter: crashed
        ? 'drop-shadow(0 0 16px #e8073f) brightness(0.7)'
        : 'drop-shadow(0 0 14px rgba(180,100,255,0.9)) drop-shadow(0 0 4px rgba(255,180,80,0.6))',
    }}>
      <img src={planeFrames[frame % 4]} alt="plane" width={100} height={58} style={{ display: 'block', objectFit: 'contain' }} />
    </div>
  );
}

interface Particle { id: number; x: number; y: number; age: number; size: number; }
interface Star { x: number; y: number; speed: number; size: number; alpha: number; }

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
      <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#c44dff,#8822dd)', borderRadius: 4, transition: 'width 0.08s linear' }} />
    </div>
  );
}

// ─── History chips row ────────────────────────────────────────────────────────
function HistoryChips({ items }: { items: CrashHistoryEntry[] }) {
  if (!items.length) return null;
  const show = items.slice(0, 8);
  const midIdx = Math.floor(show.length / 2);
  return (
    <div style={{ display: 'flex', gap: 5, overflowX: 'auto', padding: '4px 2px', scrollbarWidth: 'none', alignItems: 'center' }}>
      {show.map((r, i) => {
        const v = r.crashPoint ?? 0;
        const isMid = i === midIdx;
        const color = v < 2 ? '#f5a623' : v < 10 ? '#c44dff' : '#ff4d8f';
        return (
          <div key={r.id ?? i} style={{
            flexShrink: 0, padding: '5px 12px', borderRadius: 999,
            background: isMid ? 'rgba(196,77,255,0.25)' : 'rgba(255,255,255,0.06)',
            border: isMid ? '1.5px solid #c44dff' : '1px solid rgba(255,255,255,0.1)',
            fontSize: 11, fontWeight: 800,
            color: isMid ? '#fff' : color,
            boxShadow: isMid ? '0 0 10px rgba(196,77,255,0.4)' : 'none',
          }}>
            {fmtMul(v)}
          </div>
        );
      })}
      <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
      </div>
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
  const [planeTilt, setPlaneTilt] = useState(-20);
  const [planeFrame, setPlaneFrame] = useState(0);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCrashed = phase === 'crashed';
  const displayVal = isCrashed ? (crashPoint ?? multiplier) : multiplier;

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      // Set internal resolution to match display size
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  useEffect(() => {
    const img = new Image(); img.src = bgSun;
    img.onload = () => { bgImgRef.current = img; };
  }, []);

  useEffect(() => {
    if (starsRef.current.length) return;
    starsRef.current = Array.from({ length: 80 }, () => ({
      x: Math.random() * 480, y: Math.random() * 280,
      speed: 8 + Math.random() * 60,
      size: Math.random() > 0.7 ? 1.1 + Math.random() * 0.7 : 0.3 + Math.random() * 0.5,
      alpha: 0.15 + Math.random() * 0.7,
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
      setPlanePct(null); setPlaneTilt(-20); particlesRef.current = [];
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

      // BG: deep navy
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      if (isCrashed) {
        bg.addColorStop(0, '#1a0520'); bg.addColorStop(1, '#080108');
      } else {
        bg.addColorStop(0, '#0d0b28'); bg.addColorStop(0.6, '#0a0820'); bg.addColorStop(1, '#06050f');
      }
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // Subtle grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < W; gx += W / 8) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (let gy = 0; gy < H; gy += H / 6) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }

      // Stars
      starsRef.current.forEach(s => {
        if (phase === 'running') {
          s.x -= s.speed * dt;
          if (s.x < 0) { s.x = W + 5; s.y = Math.random() * H; }
        }
        const tw = s.alpha * (0.5 + 0.5 * Math.sin(now / 900 + s.x * 0.5));
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = isCrashed ? `rgba(255,140,140,${tw * 0.3})` : `rgba(180,180,255,${tw * 0.7})`;
        ctx.fill();
      });

      // Padding for axes
      const pL = 46, pB = 30, pT = 12, pR = 10;
      const gW = W - pL - pR, gH = H - pT - pB;
      const pts = pointsRef.current;
      const last = pts[pts.length - 1];
      const maxT = last ? Math.max(last.x, 2) : 16;
      const rawM = last ? Math.max(last.y, 1.5) : 4;
      const lvls = [1.5, 2, 3, 4, 5, 8, 10, 15, 20, 30, 50];
      const maxM = lvls.find(l => l >= rawM * 1.2) ?? rawM * 1.3;

      const toX = (t: number) => pL + (t / maxT) * gW;
      const toY = (m: number) => H - pB - ((m - 1) / Math.max(maxM - 1, 0.1)) * gH;

      // Y axis labels
      const ySteps = [1, 2, 3, 4, 5].filter(v => v <= maxM + 0.5);
      ctx.fillStyle = 'rgba(100,180,220,0.7)';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      ySteps.forEach(v => {
        const y = toY(v);
        if (y >= pT && y <= H - pB + 4) {
          ctx.fillText(v.toFixed(2) + 'x', pL - 6, y + 3);
          ctx.strokeStyle = 'rgba(255,255,255,0.04)';
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(pL, y); ctx.lineTo(W - pR, y); ctx.stroke();
        }
      });

      // X axis labels (time)
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(100,180,220,0.7)';
      const xCount = Math.min(8, Math.floor(maxT / 2));
      for (let i = 0; i <= xCount; i++) {
        const t = (i / xCount) * maxT;
        const x = toX(t);
        if (x >= pL && x <= W - pR) {
          ctx.fillText(Math.round(t) + 's', x, H - pB + 14);
        }
      }

      if (pts.length < 2) { animId = requestAnimationFrame(draw); return; }

      const tipX = toX(last!.x), tipY = toY(last!.y);

      // Curve path helper (Catmull-Rom smooth)
      const curvePath = () => {
        ctx.moveTo(toX(pts[0]!.x), toY(pts[0]!.y));
        if (pts.length === 2) { ctx.lineTo(toX(pts[1]!.x), toY(pts[1]!.y)); return; }
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(i - 1, 0)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(i + 2, pts.length - 1)]!;
          const t = 0.45;
          const cp1x = toX(p1.x) + (toX(p2.x) - toX(p0.x)) * t / 3;
          const cp1y = toY(p1.y) + (toY(p2.y) - toY(p0.y)) * t / 3;
          const cp2x = toX(p2.x) - (toX(p3.x) - toX(p1.x)) * t / 3;
          const cp2y = toY(p2.y) - (toY(p3.y) - toY(p1.y)) * t / 3;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, toX(p2.x), toY(p2.y));
        }
      };

      // Fill gradient under curve (pink/magenta)
      const fill = ctx.createLinearGradient(0, tipY, 0, H - pB);
      if (isCrashed) {
        fill.addColorStop(0, 'rgba(232,7,63,0.3)'); fill.addColorStop(1, 'rgba(232,7,63,0)');
      } else {
        fill.addColorStop(0, 'rgba(196,77,255,0.25)'); fill.addColorStop(0.5, 'rgba(255,60,200,0.08)'); fill.addColorStop(1, 'rgba(196,77,255,0)');
      }
      ctx.beginPath(); ctx.moveTo(toX(pts[0]!.x), H - pB); curvePath(); ctx.lineTo(tipX, H - pB); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();

      // Outer glow
      ctx.beginPath(); curvePath();
      ctx.strokeStyle = isCrashed ? 'rgba(232,7,63,0.2)' : 'rgba(255,60,200,0.18)';
      ctx.lineWidth = 18; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();

      ctx.beginPath(); curvePath();
      ctx.strokeStyle = isCrashed ? 'rgba(232,7,63,0.4)' : 'rgba(220,80,255,0.35)';
      ctx.lineWidth = 8; ctx.stroke();

      // Main curve (pink/magenta)
      ctx.beginPath(); curvePath();
      const lineGrad = ctx.createLinearGradient(toX(pts[0]!.x), 0, tipX, 0);
      if (isCrashed) {
        lineGrad.addColorStop(0, '#ff6688'); lineGrad.addColorStop(1, '#ff2244');
      } else {
        lineGrad.addColorStop(0, '#dd44ff'); lineGrad.addColorStop(0.5, '#ff44cc'); lineGrad.addColorStop(1, '#ff88cc');
      }
      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = isCrashed ? '#ef4444' : '#ee44ff';
      ctx.shadowBlur = isCrashed ? 6 : 16;
      ctx.stroke(); ctx.shadowBlur = 0;

      // Engine exhaust particles
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
        ctx.fillStyle = `rgba(255,${Math.round(160 * lf)},${Math.round(50 * lf)},${lf * 0.5})`;
        ctx.fill();
      });

      // Tip dot (pink glow)
      if (!isCrashed) {
        const pulse = (now % 1000) / 1000;
        ctx.beginPath(); ctx.arc(tipX, tipY, 7 + pulse * 10, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,80,220,${(1 - pulse) * 0.3})`; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(tipX, tipY, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ff80dd'; ctx.shadowColor = '#ee44ff'; ctx.shadowBlur = 20; ctx.fill(); ctx.shadowBlur = 0;
      }

      // Crash explosion
      if (isCrashed && last) {
        [1, 0.65, 0.4].forEach((d, i) => {
          const a2 = Math.max(0, crashAge - (1 - d) * 0.25);
          const ring = a2 * (28 + i * 16), alpha = Math.max(0, (1 - a2) * (0.5 - i * 0.1));
          if (ring <= 0) return;
          ctx.beginPath(); ctx.arc(tipX, tipY, ring, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,${50 - i * 10},${30 - i * 5},${alpha})`;
          ctx.lineWidth = 2.5 - i * 0.5; ctx.shadowColor = '#ff2020'; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
        });
      }

      // Tilt calculation
      if (pts.length >= 2) {
        const prev = pts[Math.max(0, pts.length - 4)]!;
        const dx = toX(last!.x) - toX(prev.x), dy = toY(last!.y) - toY(prev.y);
        setPlaneTilt(isCrashed ? 55 : Math.max(-40, Math.min(4, (Math.atan2(dy, dx) * 180) / Math.PI)));
      }
      setPlanePct({ x: (tipX / W) * 100, y: (tipY / H) * 100 });

      if (phase === 'running' || phase === 'crashed') animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animId); };
  }, [phase, isCrashed]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      animation: isCrashed ? 'screenShake 0.5s cubic-bezier(.36,.07,.19,.97) both' : 'none'
    }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* Plane */}
      {(phase === 'running' || phase === 'crashed') && planePct && (
        <div style={{
          position: 'absolute',
          left: `${Math.min(planePct.x, 86)}%`,
          top: `${Math.max(Math.min(planePct.y, 88), 4)}%`,
          transform: 'translate(-50%, -100%)',
          transition: isCrashed ? 'left 0.5s ease-in, top 0.5s ease-in' : 'left 0.1s linear, top 0.1s linear',
          pointerEvents: 'none', zIndex: 10,
        }}>
          <PlaneSVG crashed={isCrashed} tilt={planeTilt} frame={planeFrame} />
        </div>
      )}

      {/* Multiplier overlay */}
      <div style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none', zIndex: 20 }}>
        {phase === 'waiting' && (
          <div style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>
            <div style={{ letterSpacing: '0.05em' }}>Next round starting...</div>
            <CountdownBar />
          </div>
        )}
        {(phase === 'running' || phase === 'crashed') && (
          <>
            <div style={{
              fontSize: 'clamp(48px,14vw,72px)', fontWeight: 900,
              color: isCrashed ? '#ef4444' : '#ffffff', lineHeight: 1,
              letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums',
              textShadow: isCrashed
                ? '0 0 50px rgba(239,68,68,0.9)'
                : '0 2px 20px rgba(255,255,255,0.3), 0 0 40px rgba(196,77,255,0.4)',
              animation: isCrashed ? 'crashShake 0.4s ease-out' : undefined,
            }}>
              {fmtMul(displayVal)}
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', marginTop: 5, color: isCrashed ? '#ef4444' : 'rgba(150,200,255,0.8)', textTransform: 'uppercase' }}>
              {isCrashed ? 'FLEW AWAY!' : 'CURRENT MULTIPLIER'}
            </div>
          </>
        )}
        {phase === 'idle' && <div style={{ color: '#2a3040', fontSize: 20, fontWeight: 700 }}>—</div>}
      </div>
    </div>
  );
}

// ─── Bottom Bet Panel (3-column Aviator style) ────────────────────────────────
interface BetPanelProps {
  phase: Phase; multiplier: number; myBet1: MyBet | null; myBet2: MyBet | null;
  onBet: (amount: number, auto: number, slot: 1 | 2) => void; onCashout: (slot: 1 | 2) => void;
  placing1: boolean; placing2: boolean; cashingOut1: boolean; cashingOut2: boolean;
}

function BetPanel({ phase, multiplier, myBet1, myBet2, onBet, onCashout, placing1, placing2, cashingOut1, cashingOut2 }: BetPanelProps) {
  const [amount1, setAmount1] = useState(100);
  const [amount2, setAmount2] = useState(100);
  const [autoCashout1, setAutoCashout1] = useState(5.0);
  const [autoCashout2, setAutoCashout2] = useState(5.0);
  const AUTO_PRESETS = [1.5, 2.0, 5.0, 10.0];
  const QUICK_BETS = [10, 50, 100, 500];

  const renderSlot = (slot: 1 | 2) => {
    const myBet = slot === 1 ? myBet1 : myBet2;
    const placing = slot === 1 ? placing1 : placing2;
    const cashingOut = slot === 1 ? cashingOut1 : cashingOut2;
    const amount = slot === 1 ? amount1 : amount2;
    const setAmount = slot === 1 ? setAmount1 : setAmount2;
    const autoCashout = slot === 1 ? autoCashout1 : autoCashout2;
    const setAutoCashout = slot === 1 ? setAutoCashout1 : setAutoCashout2;

    const canBet = phase === 'waiting' && !myBet && !placing;
    const canCashout = phase === 'running' && myBet && myBet.cashoutAt === null && !cashingOut;
    const cashedOut = myBet && myBet.cashoutAt !== null;
    const adj = (d: number) => setAmount(a => Math.max(MIN_BET, Math.min(MAX_BET, a + d)));

    return (
      <div key={slot} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 9, color: 'rgba(150,180,220,0.5)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center' }}>BET {slot}</div>

        {/* Amount row */}
        <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => adj(-10)} disabled={!canBet} style={{ width: 30, height: 34, background: 'none', border: 'none', color: canBet ? '#fff' : '#3a4455', fontSize: 18, fontWeight: 300, cursor: canBet ? 'pointer' : 'default', flexShrink: 0 }}>−</button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
            {amount.toFixed(2)} <span style={{ fontSize: 9, color: 'rgba(150,180,220,0.7)', fontWeight: 600 }}>ETB</span>
          </div>
          <button onClick={() => adj(10)} disabled={!canBet} style={{ width: 30, height: 34, background: 'none', border: 'none', color: canBet ? '#fff' : '#3a4455', fontSize: 18, fontWeight: 300, cursor: canBet ? 'pointer' : 'default', flexShrink: 0 }}>+</button>
        </div>

        {/* Quick bets */}
        <div style={{ display: 'flex', gap: 3 }}>
          {QUICK_BETS.map(q => (
            <button key={q} onClick={() => canBet && setAmount(q)} style={{ flex: 1, padding: '4px 0', borderRadius: 5, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(200,220,255,0.8)', fontSize: 9, fontWeight: 700, cursor: canBet ? 'pointer' : 'default' }}>{q}</button>
          ))}
        </div>

        {/* Auto cashout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 9, color: 'rgba(150,180,220,0.5)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>Auto</span>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, overflow: 'hidden' }}>
            <button onClick={() => setAutoCashout(v => Math.max(1.1, parseFloat((v - 0.5).toFixed(2))))} style={{ width: 24, height: 28, background: 'none', border: 'none', color: '#fff', fontSize: 14, fontWeight: 300, cursor: 'pointer', flexShrink: 0 }}>−</button>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>{autoCashout.toFixed(2)}x</div>
            <button onClick={() => setAutoCashout(v => parseFloat((v + 0.5).toFixed(2)))} style={{ width: 24, height: 28, background: 'none', border: 'none', color: '#fff', fontSize: 14, fontWeight: 300, cursor: 'pointer', flexShrink: 0 }}>+</button>
          </div>
        </div>

        {/* Auto cashout presets */}
        <div style={{ display: 'flex', gap: 3 }}>
          {AUTO_PRESETS.map(p => (
            <button key={p} onClick={() => setAutoCashout(p)} style={{ flex: 1, padding: '3px 0', borderRadius: 4, background: autoCashout === p ? 'rgba(196,77,255,0.2)' : 'rgba(255,255,255,0.07)', border: autoCashout === p ? '1px solid rgba(196,77,255,0.5)' : '1px solid rgba(255,255,255,0.1)', color: autoCashout === p ? '#dd88ff' : 'rgba(200,220,255,0.8)', fontSize: 8, fontWeight: 700, cursor: 'pointer' }}>{p.toFixed(1)}x</button>
          ))}
        </div>

        {/* Action button */}
        {canCashout ? (
          <button onClick={() => onCashout(slot)} style={{ borderRadius: 12, border: 'none', background: 'linear-gradient(145deg,#9d1fcc,#7a15aa)', color: '#fff', cursor: 'pointer', padding: '8px 6px', boxShadow: '0 4px 24px rgba(160,40,220,0.5)', animation: 'cashPulse 1s ease-in-out infinite', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em' }}>CASH OUT</div>
            <div style={{ fontSize: 16, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{(myBet!.betAmount * multiplier).toFixed(2)}</div>
          </button>
        ) : cashedOut ? (
          <button disabled style={{ borderRadius: 12, border: 'none', background: 'rgba(34,197,94,0.12)', color: '#4ade80', fontSize: 11, fontWeight: 800, cursor: 'default', padding: '14px 6px', textAlign: 'center' }}>
            ✓ {fmtMul(myBet!.cashoutAt!)}
          </button>
        ) : canBet ? (
          <button onClick={() => onBet(amount, autoCashout, slot)} style={{ borderRadius: 12, border: 'none', background: 'linear-gradient(145deg,#9d1fcc,#7a15aa)', color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer', padding: '12px 6px', boxShadow: '0 4px 24px rgba(160,40,220,0.45)', animation: 'betGlow 2s ease-in-out infinite', textAlign: 'center', letterSpacing: '0.06em' }}>
            {placing ? '...' : 'BET'}
          </button>
        ) : (
          <button disabled style={{ borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.05)', color: '#3a4455', fontSize: 11, fontWeight: 800, cursor: 'default', padding: '12px 6px', textAlign: 'center' }}>
            {phase === 'running' && myBet ? 'In Round' : 'Next Round'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ background: 'rgba(10,8,22,0.97)', borderTop: '1px solid rgba(255,255,255,0.07)', padding: '10px 10px 14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {renderSlot(1)}
        {renderSlot(2)}
      </div>
    </div>
  );
}

// ─── Bet Row ──────────────────────────────────────────────────────────────────
function BetRow({ bet, isMe }: { bet: CrashBetEntry; isMe: boolean }) {
  const cashed = bet.cashoutAt !== null;
  const init = (bet.username || 'P').charAt(0).toUpperCase();
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)', background: isMe ? 'rgba(196,77,255,0.04)' : 'transparent', gap: 8 }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: isMe ? 'linear-gradient(135deg,#c44dff,#8822dd)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 900 }}>{init}</div>
      <div style={{ flex: 1, fontSize: 12, color: isMe ? '#c44dff' : '#6b7a8d', fontWeight: isMe ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isMe ? 'You' : bet.username}</div>
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
  const [placing2, setPlacing2] = useState(false);
  const [cashingOut1, setCashingOut1] = useState(false);
  const [cashingOut2, setCashingOut2] = useState(false);
  const placingRef1 = useRef(false);
  const placingRef2 = useRef(false);
  const [betTab, setBetTab] = useState<'all' | 'mine'>('all');
  const [myUsername, setMyUsername] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [autoCashoutAt, setAutoCashoutAt] = useState(5.0);
  const [showRules, setShowRules] = useState(false);
  const [depositModal, setDepositModal] = useState(false);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);

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
      if (s.myBet2) setMyBet2(s.myBet2);
      setBets(s.bets);
    }).catch(() => {});
    getCrashHistory().then(setHistory).catch(() => {});
    getProfile().then(p => setBalance(p.playWallet.balance)).catch(() => {});
    try {
      const jwt = getJwtFromStorage() ?? '';
      const payload = JSON.parse(atob(jwt.split('.')[1]!));
      setMyUsername(payload.username ?? '');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const onBettingOpen = (d: { roundId: string }) => {
      setPhase('waiting'); setRoundId(d.roundId); setMultiplier(1.0);
      setCrashPoint(null); setMyBet1(null); setBets([]);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBet = useCallback(async (amount: number, autoCashout: number, slot: 1 | 2) => {
    const isSlot1 = slot === 1;
    const currentBet = isSlot1 ? myBet1 : myBet2;
    const placingRef = isSlot1 ? placingRef1 : placingRef2;
    const setPlacing = isSlot1 ? setPlacing1 : setPlacing2;
    const setMyBet = isSlot1 ? setMyBet1 : setMyBet2;

    if (currentBet || placingRef.current) return;
    placingRef.current = true; setPlacing(true);
    try {
      const res = await placeCrashBet(amount, slot, autoCashout);
      setMyBet({ betAmount: amount, cashoutAt: null, payout: null });
      setBets(prev => [{ username: myUsername || 'You', betAmount: amount, cashoutAt: null, payout: null }, ...prev]);
      setRoundId(res.roundId);
      getProfile().then(p => setBalance(p.playWallet.balance)).catch(() => {});
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (!msg.toLowerCase().includes('already')) {
        if (msg.includes('ቀሪ ሂሳብ') || msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('deposit')) {
          setDepositModal(true);
        } else { alert(msg || 'Failed to place bet'); }
      }
    } finally { placingRef.current = false; setPlacing(false); }
  }, [myUsername, myBet1, myBet2]);

  const handleCashout = useCallback((slot: 1 | 2) => {
    if (!roundId) return;
    const setCashingOut = slot === 1 ? setCashingOut1 : setCashingOut2;
    const setMyBet = slot === 1 ? setMyBet1 : setMyBet2;

    setCashingOut(true);
    (socket as any).emit('CRASH_CASHOUT', { roundId, slot }, (res: any) => {
      setCashingOut(false);
      if (res?.ok) {
        setMyBet(prev => prev ? { ...prev, cashoutAt: res.multiplier, payout: res.payout } : prev);
        getProfile().then(p => setBalance(p.playWallet.balance)).catch(() => {});
      }
    });
  }, [roundId]);

  const usernameInitial = (myUsername || 'P').charAt(0).toUpperCase();
  const liveBets = bets;
  const myBets = bets.filter(b => b.username === (myUsername || 'You'));

  return (
    <div style={{ height: '100dvh', background: '#080614', color: '#f8fafc', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 430, margin: '0 auto', fontFamily: "'Inter', sans-serif", overflow: 'hidden', boxSizing: 'border-box' }}>
      {showRules && <AviatorRulesModal onClose={() => setShowRules(false)} />}

      {/* Deposit modal */}
      {depositModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'linear-gradient(145deg,#140a28,#0d0618)', border: '1px solid rgba(196,77,255,0.3)', borderRadius: 24, padding: '32px 24px', maxWidth: 320, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>💳</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 8 }}>ቀሪ ሂሳብ አይበቃም!</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, lineHeight: 1.6 }}>Insufficient balance. Deposit to play Aviator.</div>
            <button onClick={() => { setDepositModal(false); navigate('/wallet'); }} style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#c44dff,#8822dd)', color: '#fff', fontWeight: 900, fontSize: 15, cursor: 'pointer', marginBottom: 10 }}>Deposit Now</button>
            <button onClick={() => setDepositModal(false)} style={{ width: '100%', padding: '11px 0', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, background: 'rgba(8,6,20,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '8px 14px' }}>
        {/* Top row: logo | balance | avatar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <img src={aviatorLogo} alt="Aviator" style={{ height: 22 }} />
            <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: '0.05em' }}>AVIATOR</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'rgba(150,180,220,0.6)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>BALANCE</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>
              {balance !== null ? balance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
              <span style={{ fontSize: 11, color: 'rgba(150,180,220,0.7)', fontWeight: 600, marginLeft: 4 }}>ETB</span>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#8822dd,#c44dff)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 14 }}>{usernameInitial}</div>
            <div style={{ position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, borderRadius: '50%', background: '#22c55e', border: '2px solid #080614' }} />
          </div>
        </div>
        {/* Nav row: Crash tab | icons | Deposit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(196,77,255,0.3)', borderRadius: 20, padding: '6px 14px' }}>
              <span style={{ fontSize: 13 }}>🚀</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Crash</span>
            </div>
            {[
              <svg key="home" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
              <svg key="star" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
              <svg key="shop" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>,
              <svg key="list" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
            ].map((icon, i) => (
              <button key={i} style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(150,180,220,0.7)', cursor: 'pointer' }}>{icon}</button>
            ))}
          </div>
          <button onClick={() => navigate('/wallet')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#9d1fcc,#c44dff)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 16px rgba(196,77,255,0.4)', flexShrink: 0 }}>
            Deposit
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', scrollbarWidth: 'none' }}>

        {/* History chips */}
        <div style={{ padding: '8px 14px 4px', flexShrink: 0 }}>
          <HistoryChips items={history} />
        </div>

        {/* Graph */}
        <div style={{ margin: '4px 10px 0', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(196,77,255,0.15)', boxShadow: '0 0 30px rgba(196,77,255,0.08)', flexShrink: 0, height: 280 }}>
          <CrashGraph phase={phase} multiplier={multiplier} crashPoint={crashPoint} />
        </div>

        {/* Bet panel */}
        <div style={{ flexShrink: 0 }}>
          <BetPanel
            phase={phase}
            multiplier={multiplier}
            myBet1={myBet1}
            myBet2={myBet2}
            onBet={handleBet}
            onCashout={handleCashout}
            placing1={placing1}
            placing2={placing2}
            cashingOut1={cashingOut1}
            cashingOut2={cashingOut2}
          />
        </div>

        {/* Bets table */}
        <div style={{ margin: '0 10px 16px', background: 'rgba(12,9,26,0.9)', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {(['all', 'mine'] as const).map(k => (
              <button key={k} onClick={() => setBetTab(k)} style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: betTab === k ? '2px solid #c44dff' : '2px solid transparent', color: betTab === k ? '#fff' : '#4a5568', padding: '10px 0', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                {k === 'all' ? `Live Bets (${liveBets.length})` : 'My Bets'}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.85fr 0.85fr', padding: '7px 12px 4px', fontSize: 9, fontWeight: 800, color: '#2a3040', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            <span>Player</span><span style={{ textAlign: 'right' }}>Bet</span><span style={{ textAlign: 'right' }}>Cashout</span><span style={{ textAlign: 'right' }}>Payout</span>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', scrollbarWidth: 'none' }}>
            {(betTab === 'all' ? liveBets : myBets).length === 0
              ? <div style={{ padding: '20px 12px', textAlign: 'center', color: '#2a3040', fontSize: 12 }}>{betTab === 'all' ? 'No bets this round yet' : 'No bets yet'}</div>
              : (betTab === 'all' ? liveBets : myBets).map((bet, i) => <BetRow key={`${bet.username}-${i}`} bet={bet} isMe={bet.username === (myUsername || 'You')} />)
            }
          </div>
        </div>
      </div>

      <style>{`
        @keyframes screenShake {
          0%, 100% { transform: translate(0, 0); }
          10%, 30%, 50%, 70%, 90% { transform: translate(-4px, -2px); }
          20%, 40%, 60%, 80% { transform: translate(4px, 2px); }
        }
        @keyframes crashShake {
          0%{transform:translate(-50%,-50%) translateX(0)}
          20%{transform:translate(-50%,-50%) translateX(-6px)}
          40%{transform:translate(-50%,-50%) translateX(6px)}
          60%{transform:translate(-50%,-50%) translateX(-4px)}
          80%{transform:translate(-50%,-50%) translateX(4px)}
          100%{transform:translate(-50%,-50%) translateX(0)}
        }
        @keyframes betGlow {
          0%,100%{box-shadow:0 4px 20px rgba(196,77,255,0.4)}
          50%{box-shadow:0 4px 32px rgba(196,77,255,0.7)}
        }
        @keyframes cashPulse {
          0%,100%{box-shadow:0 4px 20px rgba(160,40,220,0.45);transform:scale(1)}
          50%{box-shadow:0 4px 36px rgba(196,77,255,0.75);transform:scale(1.02)}
        }
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );
}
