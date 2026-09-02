import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import { getCrashState, placeCrashBet, getCrashHistory, getProfile } from '../lib/api';
import type { CrashBetEntry, CrashHistoryEntry } from '../lib/api';
import { getJwtFromStorage } from '../lib/auth-storage';
import aviatorLogo from '../assets/avi/logo-yEkF9SfW.svg';
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

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; alpha: number;
  color: string; life: number;
}

const MIN_BET = 5;
const MAX_BET = 10_000;
const planeFrames = [plane0, plane1, plane2, plane3];

function fmtMul(v: number): string { return v.toFixed(2) + 'x'; }

// ─── Rules Modal ─────────────────────────────────────────────────────────────
function AviatorRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: '#0d0e14', overflowY: 'auto', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', sans-serif" }}>
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
            <div style={{ fontSize: 12, fontWeight: 800, color: '#e5053a', letterSpacing: '0.08em', marginBottom: 8 }}>{s.title}</div>
            <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.75 }}>{s.body}</div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ─── History Pills ────────────────────────────────────────────────────────────
function HistoryPills({ items }: { items: CrashHistoryEntry[] }) {
  if (!items.length) return null;
  const getPillColor = (v: number) => {
    if (v >= 10) return '#e879f9';
    if (v >= 2) return '#c084fc';
    return '#38bdf8';
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', padding: '4px 2px', scrollbarWidth: 'none' }}>
      {items.slice(0, 20).map((r, i) => {
        const v = r.crashPoint ?? 0;
        const color = getPillColor(v);
        return (
          <div key={r.id ?? i} style={{
            flexShrink: 0, padding: '3px 10px', borderRadius: 999,
            fontSize: 12, fontWeight: 700, color,
            cursor: 'pointer',
          }}>
            {fmtMul(v)}
          </div>
        );
      })}
    </div>
  );
}

// ─── Countdown bar ────────────────────────────────────────────────────────────
function CountdownBar({ remaining }: { remaining: number }) {
  const pct = Math.max(0, Math.min(100, (remaining / 10) * 100));
  return (
    <div style={{ width: 192, height: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 999, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', padding: '2px' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #eab308, #ef4444, #dc2626)', borderRadius: 999, transition: 'width 0.3s linear', boxShadow: '0 0 10px rgba(220,38,38,0.6)' }} />
    </div>
  );
}

// ─── Aviator Canvas ───────────────────────────────────────────────────────────
interface CanvasProps {
  phase: Phase;
  multiplier: number;
  crashPoint: number | null;
  roundNumber: number;
  countdownRemaining: number;
  onOpenRules: () => void;
}

function AviatorCanvas({ phase, multiplier, crashPoint, roundNumber, countdownRemaining, onOpenRules }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameId = useRef<number>(0);
  const planePos = useRef<{ x: number; y: number; angle: number }>({ x: 0, y: 0, angle: 0 });
  const particles = useRef<Particle[]>([]);
  const crashProgress = useRef<number>(0);
  const planeImages = useRef<HTMLImageElement[]>([]);
  const imagesLoaded = useRef(false);
  const multiplierRef = useRef(multiplier);
  const phaseRef = useRef(phase);

  useEffect(() => { multiplierRef.current = multiplier; }, [multiplier]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    const srcs = [plane0, plane1, plane2, plane3];
    let loaded = 0;
    planeImages.current = srcs.map(src => {
      const img = new Image();
      img.onload = () => { loaded++; if (loaded === 4) imagesLoaded.current = true; };
      img.src = src;
      return img;
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0, height = 0;

    const handleResize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width; height = rect.height;
      canvas.width = width * dpr; canvas.height = height * dpr;
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
      ctx.scale(dpr, dpr);
    };

    handleResize();
    const ro = new ResizeObserver(handleResize);
    if (containerRef.current) ro.observe(containerRef.current);

    const spawnExhaust = (x: number, y: number, angle: number) => {
      const tailX = x + Math.cos(angle) * -42 - Math.sin(angle) * 4;
      const tailY = y + Math.sin(angle) * -42 + Math.cos(angle) * 4;
      for (let i = 0; i < 2; i++) {
        const isFire = Math.random() < 0.45;
        particles.current.push({
          x: tailX + (Math.random() - 0.5) * 4,
          y: tailY + (Math.random() - 0.5) * 4,
          vx: -Math.cos(angle) * (2.5 + Math.random() * 2) + (Math.random() - 0.5) * 1.5,
          vy: -Math.sin(angle) * (2.5 + Math.random() * 2) + (Math.random() - 0.5) * 1.5,
          size: isFire ? 2.5 + Math.random() * 3 : 3 + Math.random() * 6,
          alpha: 0.85, color: isFire ? '#ff5500' : '#e5053a', life: 1,
        });
      }
      if (particles.current.length > 120) particles.current = particles.current.slice(-100);
    };

    const updateParticles = () => {
      for (let i = particles.current.length - 1; i >= 0; i--) {
        const p = particles.current[i]!;
        p.x += p.vx; p.y += p.vy; p.size += 0.25; p.alpha -= 0.025; p.life -= 0.025;
        if (p.alpha <= 0 || p.life <= 0) { particles.current.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = p.alpha; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    };

    const drawTrajectory = (sx: number, sy: number, ex: number, ey: number, isCrash = false) => {
      const cpX = sx + (ex - sx) * 0.42, cpY = sy;
      ctx.save();
      if (!isCrash) {
        const g = ctx.createLinearGradient(0, ey, 0, sy);
        g.addColorStop(0, 'rgba(215,8,48,0.85)');
        g.addColorStop(0.5, 'rgba(188,6,42,0.88)');
        g.addColorStop(1, 'rgba(145,4,30,0.92)');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = 'rgba(175,15,25,0.45)';
      }
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cpX, cpY, ex, ey);
      ctx.lineTo(ex, sy); ctx.lineTo(sx, sy); ctx.closePath(); ctx.fill();

      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cpX, cpY, ex, ey);
      ctx.strokeStyle = isCrash ? '#ef4444' : '#ff144c';
      ctx.lineWidth = 3.5; ctx.shadowColor = isCrash ? '#dc2626' : '#e5053a'; ctx.shadowBlur = 12;
      ctx.stroke(); ctx.restore();
    };

    const drawPlane = (x: number, y: number, angle: number, frame: number, alpha = 1.0, scale = 0.72) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha = alpha;
      const img = planeImages.current[frame % 4];
      if (img && img.complete && img.naturalWidth > 0) {
        const w = 150 * scale, h = 75 * scale;
        ctx.drawImage(img, -w * 0.52, -h * 0.5, w, h);
      } else {
        ctx.fillStyle = '#e5053a';
        ctx.beginPath(); ctx.ellipse(0, 0, 24, 8, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      const startX = 0, startY = height;
      const maxX = width - 65, maxY = 45;
      const currentPhase = phaseRef.current;
      const currentMult = multiplierRef.current;

      if (currentPhase === 'running') {
        crashProgress.current = 0;
        const t = Math.min(1, Math.max(0, (currentMult - 1) / 4.0));
        const progress = Math.min(0.92, 0.24 + Math.pow(t, 0.52) * 0.68);
        const hover = Math.sin(Date.now() / 260) * 3;
        const cx = startX + (maxX - startX) * progress;
        const cy = startY - (startY - maxY) * Math.pow(progress, 0.78) + hover;
        const angle = -0.26 + Math.cos(Date.now() / 320) * 0.03;
        planePos.current = { x: cx, y: cy, angle };
        drawTrajectory(startX, startY, cx, cy);
        spawnExhaust(cx, cy, angle);
        updateParticles();
        drawPlane(cx, cy, angle, Math.floor(Date.now() / 65) % 4);
      } else if (currentPhase === 'crashed') {
        crashProgress.current += 1;
        const cp = crashProgress.current;
        const lx = planePos.current.x, ly = planePos.current.y;
        const fx = lx + cp * 14, fy = ly - cp * 12;
        if (cp < 45) {
          drawTrajectory(startX, startY, fx, fy, true);
          drawPlane(fx, fy, -0.65, Math.floor(Date.now() / 45) % 4, 0.85);
        }
        updateParticles();
      } else {
        crashProgress.current = 0;
        particles.current = [];
        planePos.current = { x: startX, y: startY, angle: 0 };
        drawPlane(35, startY - 18, -0.05, 0, 0.55);
      }

      animFrameId.current = requestAnimationFrame(render);
    };

    animFrameId.current = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(animFrameId.current); ro.disconnect(); };
  }, []); // run once — phase/multiplier read via refs

  const displayVal = phase === 'crashed' ? (crashPoint ?? multiplier) : multiplier;

  const multColor = displayVal >= 10 ? '#fbbf24' : displayVal >= 2 ? '#f87171' : '#ffffff';
  const multGlow = displayVal >= 10
    ? '0 0 25px rgba(251,191,36,0.6)'
    : displayVal >= 2 ? '0 0 20px rgba(248,113,113,0.5)' : '0 0 15px rgba(255,255,255,0.4)';

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: 256, background: '#000', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', flexShrink: 0 }}>
      {/* Sunburst bg */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <img src={bgSun} alt="" style={{
          position: 'absolute', left: 0, bottom: 0,
          width: 1800, height: 1800,
          transform: 'translate(-50%, 50%)',
          opacity: phase === 'running' ? 0.22 : 0.1,
          animation: 'aviSpin 90s linear infinite',
        }} />
      </div>

      {/* Cyan atmospheric glow during flight */}
      {phase === 'running' && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 65% 55% at 52% 48%, rgba(56,189,248,0.42) 0%, rgba(14,165,233,0.18) 35%, transparent 80%)' }} />
      )}

      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />

      {/* Top-left: round badge */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px rgba(239,68,68,0.8)', animation: 'aviPulse 1.5s ease-in-out infinite', display: 'inline-block' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', fontFamily: 'monospace' }}>#{roundNumber}</span>
      </div>

      {/* Top-right: provably fair / rules */}
      <button onClick={onOpenRules} style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', color: '#d1d5db', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
        <span style={{ color: '#34d399' }}>✓</span> How to Play
      </button>

      {/* Center HUD */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 10 }}>
        {phase === 'running' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 'clamp(52px,14vw,80px)', fontWeight: 900, lineHeight: 1, color: multColor, textShadow: multGlow, letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums' }}>
              {fmtMul(displayVal)}
            </span>
          </div>
        )}
        {phase === 'crashed' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'aviZoomIn 0.2s ease-out' }}>
            <span style={{ fontSize: 'clamp(52px,14vw,80px)', fontWeight: 900, lineHeight: 1, color: '#ef4444', textShadow: '0 0 35px rgba(220,38,38,0.6)', letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums' }}>
              {fmtMul(displayVal)}
            </span>
            <span style={{ color: '#ef4444', fontWeight: 800, fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', marginTop: 6 }}>Flew away!</span>
          </div>
        )}
        {phase === 'waiting' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 'clamp(40px,12vw,68px)', fontWeight: 900, color: '#fff', textShadow: '0 0 25px rgba(255,255,255,0.2)', lineHeight: 1 }}>
              {countdownRemaining.toFixed(1)}s
            </span>
            <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase' }}>Next round starting</span>
            <CountdownBar remaining={countdownRemaining} />
          </div>
        )}
      </div>

      {/* Bottom-right: active players */}
      <div style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}>
        <div style={{ display: 'flex', marginRight: -6 }}>
          {['🧑‍✈️', '🐼', '🏇'].map((e, i) => (
            <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: ['#f97316', '#1e293b', '#0284c7'][i], border: '1.5px solid #34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, marginLeft: i === 0 ? 0 : -6, zIndex: 3 - i }}>
              {e}
            </div>
          ))}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginLeft: 10 }}>3,244</span>
      </div>
    </div>
  );
}

// ─── Bet Panel ────────────────────────────────────────────────────────────────
interface BetPanelProps {
  slot: 1 | 2;
  phase: Phase; multiplier: number;
  myBet: MyBet | null;
  onBet: (amount: number, auto: number | null, slot: 1 | 2) => void;
  onCashout: (slot: 1 | 2) => void;
  placing: boolean; cashingOut: boolean;
  userBalance: number;
}

function BetPanel({ slot, phase, multiplier, myBet, onBet, onCashout, placing, cashingOut, userBalance }: BetPanelProps) {
  const [mode, setMode] = useState<'bet' | 'auto'>('bet');
  const [amount, setAmount] = useState(100);
  const [autoCashout, setAutoCashout] = useState(2.0);
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const PRESETS = [16, 40, 80, 400];

  const adj = (d: number) => setAmount(a => Math.max(MIN_BET, Math.min(MAX_BET, a + d)));

  const isBetPlaced = Boolean(myBet && myBet.cashoutAt === null);
  const isCashedOut = Boolean(myBet && myBet.cashoutAt !== null);
  const currentCashoutVal = isBetPlaced ? +(myBet!.betAmount * multiplier).toFixed(2) : 0;

  const canBet = phase === 'waiting' && !myBet && !placing;
  const canCashout = phase === 'running' && myBet && myBet.cashoutAt === null && !cashingOut;

  const handleMainBtn = () => {
    if (phase === 'waiting') {
      if (isBetPlaced) return; // cancel not yet supported
      onBet(amount, mode === 'auto' && autoCashoutEnabled ? autoCashout : null, slot);
    } else if (phase === 'running' && canCashout) {
      onCashout(slot);
    }
  };

  if (minimized && slot === 2) {
    return (
      <div style={{ background: '#141518', borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Bet Panel 2</span>
        <button onClick={() => setMinimized(false)} style={{ width: 24, height: 24, borderRadius: 6, background: '#24262b', border: '1px solid rgba(255,255,255,0.05)', color: '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>+</button>
      </div>
    );
  }

  const borderColor = isBetPlaced && phase === 'running' ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.05)';
  const boxShadow = isBetPlaced && phase === 'running' ? '0 0 20px rgba(245,158,11,0.12)' : undefined;

  return (
    <div style={{ background: '#141518', borderRadius: 16, border: `1px solid ${borderColor}`, padding: '10px', display: 'flex', flexDirection: 'column', gap: 8, boxShadow }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 24 }} />
        <div style={{ background: '#0e0f12', padding: 2, borderRadius: 999, display: 'inline-flex', border: '1px solid rgba(255,255,255,0.05)' }}>
          {(['bet', 'auto'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ padding: '2px 16px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: mode === m ? '#2c2e33' : 'transparent', color: mode === m ? '#fff' : '#6b7280', transition: 'all 0.15s' }}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ width: 24, display: 'flex', justifyContent: 'flex-end' }}>
          {slot === 2 && <button onClick={() => setMinimized(true)} style={{ width: 24, height: 24, borderRadius: 6, background: '#202227', border: '1px solid rgba(255,255,255,0.05)', color: '#9ca3af', cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>}
        </div>
      </div>

      {/* Controls + Action */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {/* Left: stepper + presets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ background: '#0e0f12', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 999, padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={() => adj(-10)} disabled={isBetPlaced || phase === 'running'} style={{ width: 24, height: 24, borderRadius: '50%', background: '#23252a', border: 'none', color: '#d1d5db', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (isBetPlaced || phase === 'running') ? 0.2 : 1 }}>−</button>
            <span style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{amount.toFixed(2)}</span>
            <button onClick={() => adj(10)} disabled={isBetPlaced || phase === 'running'} style={{ width: 24, height: 24, borderRadius: '50%', background: '#23252a', border: 'none', color: '#d1d5db', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (isBetPlaced || phase === 'running') ? 0.2 : 1 }}>+</button>
          </div>

          {mode === 'bet' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {PRESETS.map(p => (
                <button key={p} onClick={() => canBet && setAmount(p)} style={{ padding: '4px 0', borderRadius: 999, fontSize: 11, fontWeight: 700, border: '1px solid rgba(255,255,255,0.1)', background: amount === p ? '#2f3138' : '#1c1d22', color: amount === p ? '#fff' : '#6b7280', cursor: canBet ? 'pointer' : 'default', opacity: canBet ? 1 : 0.4 }}>
                  {p}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ background: '#0e0f12', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => setAutoCashoutEnabled(v => !v)} style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${autoCashoutEnabled ? '#10b981' : 'rgba(255,255,255,0.2)'}`, background: autoCashoutEnabled ? '#10b981' : 'transparent', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10 }}>
                  {autoCashoutEnabled ? '✓' : ''}
                </button>
                <span style={{ fontSize: 11, color: '#d1d5db', fontWeight: 600 }}>Auto</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <input type="number" step="0.1" min="1.05" value={autoCashout} onChange={e => setAutoCashout(Math.max(1.05, +e.target.value))} style={{ width: 48, textAlign: 'right', background: 'transparent', border: 'none', outline: 'none', fontSize: 12, fontWeight: 700, color: '#34d399', fontFamily: 'monospace' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#34d399', fontFamily: 'monospace' }}>x</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: action button */}
        <div style={{ display: 'flex', minHeight: 82 }}>
          {/* WAITING — no bet */}
          {phase === 'waiting' && !isBetPlaced && (
            <button onClick={handleMainBtn} style={{ width: '100%', borderRadius: 12, border: '1.5px solid #3ddc63', background: '#28a745', color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px', boxShadow: '0 0 18px rgba(40,167,69,0.3)', transition: 'all 0.15s' }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{placing ? '...' : 'Bet'}</span>
              <span style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{amount.toFixed(2)} ETB</span>
            </button>
          )}
          {/* WAITING — bet placed */}
          {phase === 'waiting' && isBetPlaced && (
            <div style={{ width: '100%', borderRadius: 12, border: '1.5px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.15)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 8, textAlign: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#ef4444' }}>Waiting</span>
              <span style={{ fontSize: 11, color: '#fca5a5', marginTop: 2 }}>for flight</span>
            </div>
          )}
          {/* RUNNING — active bet cashout */}
          {phase === 'running' && isBetPlaced && !isCashedOut && (
            <button onClick={handleMainBtn} style={{ width: '100%', borderRadius: 12, border: '1.5px solid #fcd34d', background: '#ff7700', color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 8, boxShadow: '0 0 24px rgba(255,119,0,0.5)', animation: 'aviCashPulse 1s ease-in-out infinite' }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>Cash Out</span>
              <span style={{ fontSize: 14, fontWeight: 900, fontFamily: 'monospace', marginTop: 2 }}>{currentCashoutVal.toFixed(2)} ETB</span>
            </button>
          )}
          {/* RUNNING — cashed out */}
          {isCashedOut && (
            <div style={{ width: '100%', borderRadius: 12, border: '1px solid rgba(52,211,153,0.4)', background: 'rgba(52,211,153,0.15)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 8, textAlign: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Cashed Out</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#6ee7b7', fontFamily: 'monospace' }}>+{myBet!.payout?.toFixed(2)} ETB</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#34d399', fontFamily: 'monospace' }}>@ {myBet!.cashoutAt?.toFixed(2)}x</span>
            </div>
          )}
          {/* RUNNING — no bet */}
          {phase === 'running' && !isBetPlaced && !isCashedOut && (
            <div style={{ width: '100%', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', background: '#0e0f12', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 8, textAlign: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Flight Active</span>
              <span style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>Waiting for next round</span>
            </div>
          )}
          {/* CRASHED */}
          {phase === 'crashed' && (
            <div style={{ width: '100%', borderRadius: 12, border: `1px solid ${isCashedOut ? 'rgba(52,211,153,0.4)' : myBet ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.05)'}`, background: isCashedOut ? 'rgba(52,211,153,0.15)' : myBet ? 'rgba(239,68,68,0.15)' : '#0e0f12', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 8, textAlign: 'center' }}>
              {isCashedOut ? (
                <>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#6ee7b7', textTransform: 'uppercase' }}>Won Round</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#6ee7b7', fontFamily: 'monospace' }}>+{myBet!.payout?.toFixed(2)} ETB</span>
                </>
              ) : myBet ? (
                <>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#f87171', textTransform: 'uppercase' }}>Flew Away</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#f87171', fontFamily: 'monospace' }}>−{myBet.betAmount.toFixed(2)} ETB</span>
                </>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preparing next round...</span>
              )}
            </div>
          )}
          {/* IDLE */}
          {(phase === 'idle') && (
            <div style={{ width: '100%', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', background: '#0e0f12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: '#4b5563', fontWeight: 600 }}>—</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Live Bets Feed ───────────────────────────────────────────────────────────
function LiveBetsFeed({ bets, multiplier, myUsername }: { bets: CrashBetEntry[]; multiplier: number; myUsername: string }) {
  const [tab, setTab] = useState<'all' | 'mine'>('all');

  const mask = (name: string) => {
    if (!name) return 'u***1';
    const c = name.replace(/^@/, '');
    return c.length <= 2 ? `${c[0]}***${c[c.length - 1] || '0'}` : `${c[0]}***${c[c.length - 1]}`;
  };

  const getMultBadge = (m: number) => {
    const [bg, color, border] = m < 2 ? ['rgba(56,189,248,0.15)', '#38bdf8', 'rgba(56,189,248,0.2)']
      : m < 10 ? ['rgba(192,132,252,0.15)', '#c084fc', 'rgba(192,132,252,0.2)']
      : ['rgba(232,121,249,0.15)', '#e879f9', 'rgba(232,121,249,0.2)'];
    return <span style={{ padding: '2px 8px', borderRadius: 999, background: bg, color, border: `1px solid ${border}`, fontSize: 11, fontWeight: 700 }}>{m.toFixed(2)}x</span>;
  };

  const displayBets = tab === 'all' ? [...bets].sort((a, b) => {
    if (a.cashoutAt && !b.cashoutAt) return 1;
    if (!a.cashoutAt && b.cashoutAt) return -1;
    return b.betAmount - a.betAmount;
  }) : bets.filter(b => b.username === (myUsername || 'You'));

  const totalWin = displayBets.reduce((s, b) => b.cashoutAt && b.payout ? s + b.payout : s, 0);

  return (
    <div style={{ background: '#141518', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['all', 'mine'] as const).map(k => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '4px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: tab === k ? '#2c2d30' : 'transparent', color: tab === k ? '#fff' : '#6b7280', transition: 'all 0.15s' }}>
            {k === 'all' ? 'All Bets' : 'My Bets'}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 8 }}>
        <div>
          <div style={{ display: 'flex', marginBottom: 4 }}>
            {['🏇', '🐼', '🧑‍✈️'].map((e, i) => (
              <div key={i} style={{ width: 24, height: 24, borderRadius: '50%', background: ['#ea580c', '#1e293b', '#0284c7'][i], border: '2px solid #34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i }}>
                {e}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12 }}>
            <span style={{ fontWeight: 700, color: '#fff' }}>{bets.length}</span>
            <span style={{ color: '#6b7280' }}> Bets</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>{totalWin.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Total win ETB</div>
        </div>
      </div>

      <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.05)' }} />

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '5fr 3fr 2fr 2fr', gap: 8, padding: '0 12px', fontSize: 11, color: '#4b5563', fontWeight: 600 }}>
        <span>Player</span><span style={{ textAlign: 'right' }}>Bet ETB</span><span style={{ textAlign: 'center' }}>X</span><span style={{ textAlign: 'right' }}>Win ETB</span>
      </div>

      {/* Rows */}
      <div style={{ maxHeight: 200, overflowY: 'auto', scrollbarWidth: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {displayBets.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#374151', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Waiting for bets...</div>
        ) : displayBets.map((bet, i) => {
          const isMe = bet.username === (myUsername || 'You');
          const init = (bet.username || 'P').charAt(0).toUpperCase();
          return (
            <div key={`${bet.username}-${i}`} style={{ display: 'grid', gridTemplateColumns: '5fr 3fr 2fr 2fr', gap: 8, alignItems: 'center', padding: '6px 12px', borderRadius: 12, background: '#101114' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: isMe ? 'linear-gradient(135deg,#e5053a,#9f1239)' : '#1e293b', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700 }}>{init}</div>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mask(bet.username)}</span>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 500, color: '#fff', fontFamily: 'monospace' }}>{bet.betAmount.toFixed(2)}</div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>{bet.cashoutAt ? getMultBadge(bet.cashoutAt) : null}</div>
              <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#34d399', fontFamily: 'monospace' }}>{bet.cashoutAt && bet.payout ? bet.payout.toFixed(2) : null}</div>
            </div>
          );
        })}
      </div>
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
  const [roundNumber, setRoundNumber] = useState(0);
  const [countdown, setCountdown] = useState(10);
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
  const [myUsername, setMyUsername] = useState('');
  const [mainBalance, setMainBalance] = useState<number | null>(null);
  const [playBalance, setPlayBalance] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [depositModal, setDepositModal] = useState(false);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const startCountdown = useCallback((from = 10) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(from);
    const start = Date.now();
    countdownRef.current = setInterval(() => {
      const remaining = Math.max(0, from - (Date.now() - start) / 1000);
      setCountdown(remaining);
      if (remaining <= 0 && countdownRef.current) clearInterval(countdownRef.current);
    }, 80);
  }, []);

  useEffect(() => {
    getCrashState().then(s => {
      const p = s.phase === 'idle' ? 'idle' : s.phase as Phase;
      setPhase(p);
      if (s.round) { setRoundId(s.round.id); if ((s.round as any).roundNumber) setRoundNumber((s.round as any).roundNumber); }
      if (s.round?.crashPoint) setCrashPoint(s.round.crashPoint);
      if (p === 'running' && s.round?.currentMultiplier) setMultiplier(s.round.currentMultiplier);
      if (p === 'waiting') startCountdown(10);
      if (s.myBet) setMyBet1(s.myBet);
      if (s.myBet2) setMyBet2(s.myBet2);
      setBets(s.bets);
    }).catch(() => {});
    getCrashHistory().then(setHistory).catch(() => {});
    getProfile().then(p => { setMainBalance(p.mainWallet.balance); setPlayBalance(p.playWallet.balance); }).catch(() => {});
    try {
      const jwt = getJwtFromStorage() ?? '';
      const payload = JSON.parse(atob(jwt.split('.')[1]!));
      setMyUsername(payload.username ?? '');
    } catch { /* ignore */ }
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onBettingOpen = (d: { roundId: string; roundNumber?: number }) => {
      setPhase('waiting'); setRoundId(d.roundId); if (d.roundNumber) setRoundNumber(d.roundNumber);
      setMultiplier(1.0); setCrashPoint(null); setMyBet1(null); setMyBet2(null); setBets([]);
      startCountdown(10);
    };
    const onStarted = (d: { roundId: string }) => {
      setPhase('running'); setRoundId(d.roundId); setMultiplier(1.0);
      if (countdownRef.current) clearInterval(countdownRef.current);
      playRoundSound('start');
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
  }, [playRoundSound, startCountdown]);

  const handleBet = useCallback(async (amount: number, auto: number | null, slot: 1 | 2) => {
    const isSlot1 = slot === 1;
    const currentBet = isSlot1 ? myBet1 : myBet2;
    const placingRef = isSlot1 ? placingRef1 : placingRef2;
    const setPlacing = isSlot1 ? setPlacing1 : setPlacing2;
    const setMyBet = isSlot1 ? setMyBet1 : setMyBet2;
    if (currentBet || placingRef.current) return;
    placingRef.current = true; setPlacing(true);
    try {
      const res = await placeCrashBet(amount, slot, auto ?? undefined);
      setMyBet({ betAmount: amount, cashoutAt: null, payout: null });
      setBets(prev => [{ username: myUsername || 'You', betAmount: amount, cashoutAt: null, payout: null }, ...prev]);
      setRoundId(res.roundId);
      getProfile().then(p => { setMainBalance(p.mainWallet.balance); setPlayBalance(p.playWallet.balance); }).catch(() => {});
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
        getProfile().then(p => { setMainBalance(p.mainWallet.balance); setPlayBalance(p.playWallet.balance); }).catch(() => {});
      }
    });
  }, [roundId]);

  const usernameInitial = (myUsername || 'P').charAt(0).toUpperCase();

  return (
    <div style={{ height: '100dvh', background: '#0d0e14', color: '#f8fafc', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 430, margin: '0 auto', fontFamily: "'Inter', sans-serif", overflow: 'hidden', boxSizing: 'border-box' }}>
      {showRules && <AviatorRulesModal onClose={() => setShowRules(false)} />}

      {/* Deposit modal */}
      {depositModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'linear-gradient(145deg,#0d0e14,#0d0e14)', border: '1px solid rgba(229,5,58,0.3)', borderRadius: 24, padding: '32px 24px', maxWidth: 320, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>💳</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 8 }}>ቀሪ ሂሳብ አይበቃም!</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, lineHeight: 1.6 }}>Insufficient balance. Deposit to play Aviator.</div>
            <button onClick={() => { setDepositModal(false); navigate('/wallet'); }} style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#e5053a,#9f1239)', color: '#fff', fontWeight: 900, fontSize: 15, cursor: 'pointer', marginBottom: 10 }}>Deposit Now</button>
            <button onClick={() => setDepositModal(false)} style={{ width: '100%', padding: '11px 0', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header style={{ flexShrink: 0, background: 'rgba(18,20,28,0.95)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '8px 14px', position: 'sticky', top: 0, zIndex: 30, backdropFilter: 'blur(8px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Left: back + logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => navigate('/')} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94a3b8', fontSize: 18 }}>‹</button>
            <img src={aviatorLogo} alt="Aviator" style={{ height: 22, filter: 'drop-shadow(0 0 15px rgba(229,5,58,0.5))' }} />
          </div>

          {/* Center: balance */}
          <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Balance</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24', fontFamily: 'monospace' }}>
              {mainBalance !== null ? mainBalance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
            </span>
            <span style={{ fontSize: 11, color: '#818cf8', fontWeight: 700, fontFamily: 'monospace' }}>
              P: {playBalance !== null ? playBalance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
            </span>
          </div>

          {/* Right: avatar */}
          <div style={{ position: 'relative' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#e5053a,#9f1239)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 14 }}>{usernameInitial}</div>
            <div style={{ position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, borderRadius: '50%', background: '#22c55e', border: '2px solid #0d0e14' }} />
          </div>
        </div>
      </header>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', scrollbarWidth: 'none', padding: '10px 10px 16px', gap: 10 }}>

        {/* History pills */}
        <HistoryPills items={history} />

        {/* Canvas */}
        <AviatorCanvas
          phase={phase}
          multiplier={multiplier}
          crashPoint={crashPoint}
          roundNumber={roundNumber}
          countdownRemaining={countdown}
          onOpenRules={() => setShowRules(true)}
        />

        {/* Bet panels */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <BetPanel slot={1} phase={phase} multiplier={multiplier} myBet={myBet1} onBet={handleBet} onCashout={handleCashout} placing={placing1} cashingOut={cashingOut1} userBalance={mainBalance ?? 0} />
          <BetPanel slot={2} phase={phase} multiplier={multiplier} myBet={myBet2} onBet={handleBet} onCashout={handleCashout} placing={placing2} cashingOut={cashingOut2} userBalance={mainBalance ?? 0} />
        </div>

        {/* Live bets feed */}
        <LiveBetsFeed bets={bets} multiplier={multiplier} myUsername={myUsername} />
      </div>

      <style>{`
        @keyframes aviSpin { from { transform: translate(-50%,50%) rotate(0deg); } to { transform: translate(-50%,50%) rotate(360deg); } }
        @keyframes aviPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes aviZoomIn { from{transform:scale(0.9);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes aviCashPulse { 0%,100%{box-shadow:0 0 20px rgba(255,119,0,0.4);transform:scale(1)} 50%{box-shadow:0 0 32px rgba(255,119,0,0.7);transform:scale(1.02)} }
        ::-webkit-scrollbar{display:none}
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
        input[type=number]{-moz-appearance:textfield}
      `}</style>
    </div>
  );
}
