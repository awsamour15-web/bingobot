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

// ─── Aviator Rules Modal ──────────────────────────────────────────────────────
function AviatorRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: '#060a14',
      overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>✈️ How to Play</span>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
          color: '#fff', borderRadius: 10, padding: '7px 16px',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>✕ Close</button>
      </div>

      <div style={{ padding: '24px 18px 48px', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* Objective */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#e8073f', letterSpacing: '0.06em', marginBottom: 10 }}>
            🎯 OBJECTIVE
          </div>
          <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.75 }}>
            A plane takes off and a multiplier climbs from <strong style={{ color: '#fff' }}>1.00x</strong> upward.
            Cash out before the plane flies away to lock in your winnings.
            If the plane crashes before you cash out, you lose your bet.
          </div>
        </section>

        {/* How to bet */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#e8073f', letterSpacing: '0.06em', marginBottom: 10 }}>
            💰 HOW TO BET
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: '1️⃣', text: 'Set your bet amount during the betting phase (before the plane takes off).' },
              { icon: '2️⃣', text: 'Press BET to confirm. You can place up to 2 simultaneous bets in separate panels.' },
              { icon: '3️⃣', text: 'Watch the multiplier rise. Press CASH OUT at any time to collect Bet × Multiplier.' },
              { icon: '4️⃣', text: 'If the plane crashes before you cash out, the round is lost.' },
            ].map(({ icon, text }) => (
              <div key={icon} style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                background: 'rgba(255,255,255,0.03)', borderRadius: 12,
                padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
                <span style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Auto cashout */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#e8073f', letterSpacing: '0.06em', marginBottom: 10 }}>
            ⚡ AUTO CASH OUT
          </div>
          <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.75 }}>
            Set a target multiplier in the bet panel. If the plane reaches that multiplier,
            your bet cashes out automatically — no need to watch or click manually.
          </div>
        </section>

        {/* Payout table */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#e8073f', letterSpacing: '0.06em', marginBottom: 10 }}>
            📊 EXAMPLE PAYOUTS
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14, overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              padding: '8px 16px', background: 'rgba(255,255,255,0.05)',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}>
              {['Bet (ETB)', 'Cash Out @', 'Win (ETB)'].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textAlign: 'center' }}>{h}</span>
              ))}
            </div>
            {[
              [100, '1.50x', 150],
              [100, '2.00x', 200],
              [100, '5.00x', 500],
              [100, '10.00x', 1000],
              [100, '50.00x', 5000],
            ].map(([bet, mul, win]) => (
              <div key={String(mul)} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <span style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>{bet}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', textAlign: 'center' }}>{mul}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#4ade80', textAlign: 'center' }}>+{win}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Rules */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#e8073f', letterSpacing: '0.06em', marginBottom: 10 }}>
            📋 RULES & REGULATIONS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'Minimum bet is 5 ETB. Maximum bet is 10,000 ETB.',
              'Each player may place up to 2 bets per round.',
              'Bets can only be placed during the betting (waiting) phase before takeoff.',
              'Once the round starts (plane takes off), no new bets are accepted.',
              'Cashing out is only possible during a running round.',
              'Winnings are credited to your balance immediately after cashout.',
              'If you fail to cash out before a crash, the full bet is lost.',
              'The crash point is determined by a provably fair algorithm.',
              'All outcomes are final. No refunds after a round has started.',
              'Management reserves the right to void rounds due to technical issues.',
            ].map((rule, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#e8073f', minWidth: 20, marginTop: 1 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{rule}</span>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}

function fmtMul(v: number): string {
  return v.toFixed(2) + 'x';
}

// ─── Animated plane ───────────────────────────────────────────────────────────

const planeFrames = [plane0, plane1, plane2, plane3];

function PlaneSVG({ crashed, tilt, frame }: { crashed: boolean; tilt: number; frame: number }) {
  const src = planeFrames[frame % planeFrames.length]!;
  return (
    <div style={{
      transform: `rotate(${tilt}deg)`,
      transition: crashed ? 'transform 0.5s ease-in' : 'transform 0.2s ease-out',
      filter: crashed
        ? 'drop-shadow(0 0 18px #e8073f) drop-shadow(0 0 8px #ff0000) brightness(0.7)'
        : 'drop-shadow(0 0 14px rgba(232,7,63,0.9)) drop-shadow(0 0 5px rgba(255,120,80,0.6))',
    }}>
      <img src={src} alt="plane" width={110} height={64} style={{ display: 'block', objectFit: 'contain' }} />
    </div>
  );
}

// ─── Smoke trail particle ─────────────────────────────────────────────────────

interface Particle {
  id: number;
  x: number;
  y: number;
  age: number; // 0→1
  size: number;
}

interface Star {
  x: number;
  y: number;
  speed: number; // px/s scrolling left
  size: number;
  alpha: number;
}

// ─── Graph canvas ─────────────────────────────────────────────────────────────

function CrashGraph({ phase, multiplier, crashPoint }: {
  phase: Phase;
  multiplier: number;
  crashPoint: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  const startTimeRef = useRef<number>(Date.now());
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const particleIdRef = useRef(0);
  const starsRef = useRef<Star[]>([]);

  const [planePct, setPlanePct] = useState<{ x: number; y: number } | null>(null);
  const [planeTilt, setPlaneTilt] = useState(-12);
  const [planeFrame, setPlaneFrame] = useState(0);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isCrashed = phase === 'crashed';
  const displayVal = isCrashed ? (crashPoint ?? multiplier) : multiplier;

  // Initialise stars once
  useEffect(() => {
    if (starsRef.current.length) return;
    starsRef.current = Array.from({ length: 80 }, () => ({
      x: Math.random() * 420,
      y: Math.random() * 210,
      speed: 20 + Math.random() * 60,
      size: 0.5 + Math.random() * 1.5,
      alpha: 0.3 + Math.random() * 0.7,
    }));
  }, []);

  // Animate plane frames when running
  useEffect(() => {
    if (phase === 'running') {
      frameTimerRef.current = setInterval(() => setPlaneFrame(f => (f + 1) % 4), 120);
    } else {
      if (frameTimerRef.current) { clearInterval(frameTimerRef.current); frameTimerRef.current = null; }
      setPlaneFrame(0);
    }
    return () => { if (frameTimerRef.current) clearInterval(frameTimerRef.current); };
  }, [phase]);

  useEffect(() => {
    if (phase === 'waiting' || phase === 'idle') {
      pointsRef.current = [];
      startTimeRef.current = Date.now();
      setPlanePct(null);
      setPlaneTilt(-12);
      particlesRef.current = [];
    }
    if (phase === 'running') {
      startTimeRef.current = Date.now();
      pointsRef.current = [];
      particlesRef.current = [];
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'running' && phase !== 'crashed') return;
    const t = (Date.now() - startTimeRef.current) / 1000;
    const pts = pointsRef.current;
    const last = pts[pts.length - 1];
    if (!last || Math.abs(multiplier - last.y) > 0.01 || t - last.x > 0.3) {
      pts.push({ x: t, y: multiplier });
      if (pts.length > 300) pts.splice(0, pts.length - 300);
    }
  }, [multiplier, phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let lastFrameTime = Date.now();
    let animId = 0;

    const draw = () => {
      const now = Date.now();
      const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;

      const ctx = canvas.getContext('2d')!;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // ── Background ──
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      if (isCrashed) {
        bgGrad.addColorStop(0, '#1a0408');
        bgGrad.addColorStop(1, '#0d0204');
      } else {
        bgGrad.addColorStop(0, '#0a0d1f');
        bgGrad.addColorStop(1, '#060810');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // ── Stars ──
      starsRef.current.forEach(s => {
        if (phase === 'running') {
          s.x -= s.speed * dt;
          if (s.x < 0) { s.x = W + 10; s.y = Math.random() * H; }
        }
        const twinkle = s.alpha * (0.6 + 0.4 * Math.sin(now / 700 + s.x * 0.3));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = isCrashed
          ? `rgba(255,160,160,${twinkle * 0.5})`
          : `rgba(180,210,255,${twinkle})`;
        ctx.fill();
      });

      const padL = 38, padB = 22, padT = 16, padR = 12;
      const gW = W - padL - padR;
      const gH = H - padT - padB;

      const pts = pointsRef.current;
      const lastPt = pts[pts.length - 1];
      const maxT = lastPt ? Math.max(lastPt.x, 1) : 1;
      const rawMaxM = lastPt ? Math.max(lastPt.y, 1.5) : 2;
      // Round up maxM to next nice level for stable grid
      const levels = [2, 3, 5, 8, 10, 15, 20, 30, 50, 80, 100, 200, 500];
      const maxM = levels.find(l => l >= rawMaxM * 1.15) ?? rawMaxM * 1.25;

      const toX = (t: number) => padL + (t / maxT) * gW;
      const toY = (m: number) => H - padB - ((m - 1) / Math.max(maxM - 1, 0.1)) * gH;

      // ── Dashed grid lines + Y labels ──
      const gridMultipliers = [1, 2, 3, 5, 10, 20, 50, 100].filter(m => m >= 1 && m <= maxM);
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 0.5;
      gridMultipliers.forEach(m => {
        const y = toY(m);
        if (y < padT || y > H - padB + 4) return;
        ctx.strokeStyle = isCrashed ? 'rgba(255,80,80,0.10)' : 'rgba(99,140,255,0.13)';
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        // Label
        ctx.fillStyle = isCrashed ? 'rgba(255,120,120,0.5)' : 'rgba(99,140,255,0.55)';
        ctx.font = '600 9px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${m}x`, padL - 4, y + 3.5);
      });
      ctx.setLineDash([]);

      // ── X axis baseline ──
      ctx.strokeStyle = isCrashed ? 'rgba(255,80,80,0.25)' : 'rgba(99,140,255,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, H - padB);
      ctx.lineTo(W - padR, H - padB);
      ctx.stroke();

      // ── Y axis ──
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, H - padB);
      ctx.stroke();

      if (pts.length < 2) {
        animId = requestAnimationFrame(draw);
        return;
      }

      const tipX = toX(lastPt!.x);
      const tipY = toY(lastPt!.y);

      // ── Filled glow area under curve ──
      const fillGrad = ctx.createLinearGradient(0, tipY, 0, H - padB);
      if (isCrashed) {
        fillGrad.addColorStop(0, 'rgba(239,68,68,0.35)');
        fillGrad.addColorStop(0.6, 'rgba(239,68,68,0.08)');
        fillGrad.addColorStop(1, 'rgba(239,68,68,0)');
      } else {
        fillGrad.addColorStop(0, 'rgba(232,7,63,0.30)');
        fillGrad.addColorStop(0.5, 'rgba(232,7,63,0.08)');
        fillGrad.addColorStop(1, 'rgba(232,7,63,0)');
      }
      ctx.beginPath();
      ctx.moveTo(toX(pts[0]!.x), H - padB);
      // Smooth bezier through points
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1]!, p1 = pts[i]!;
        const mx = (toX(p0.x) + toX(p1.x)) / 2;
        ctx.bezierCurveTo(mx, toY(p0.y), mx, toY(p1.y), toX(p1.x), toY(p1.y));
      }
      ctx.lineTo(tipX, H - padB);
      ctx.closePath();
      ctx.fillStyle = fillGrad;
      ctx.fill();

      // ── Curve outer glow (wide, soft) ──
      ctx.beginPath();
      ctx.moveTo(toX(pts[0]!.x), toY(pts[0]!.y));
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1]!, p1 = pts[i]!;
        const mx = (toX(p0.x) + toX(p1.x)) / 2;
        ctx.bezierCurveTo(mx, toY(p0.y), mx, toY(p1.y), toX(p1.x), toY(p1.y));
      }
      ctx.strokeStyle = isCrashed ? 'rgba(239,68,68,0.25)' : 'rgba(232,7,63,0.22)';
      ctx.lineWidth = 8;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowBlur = 0;
      ctx.stroke();

      // ── Curve main line ──
      ctx.beginPath();
      ctx.moveTo(toX(pts[0]!.x), toY(pts[0]!.y));
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1]!, p1 = pts[i]!;
        const mx = (toX(p0.x) + toX(p1.x)) / 2;
        ctx.bezierCurveTo(mx, toY(p0.y), mx, toY(p1.y), toX(p1.x), toY(p1.y));
      }
      ctx.strokeStyle = isCrashed ? '#ef4444' : '#e8073f';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = isCrashed ? '#ef4444' : '#ff2060';
      ctx.shadowBlur = isCrashed ? 6 : 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // ── Smoke particles ──
      if (!isCrashed) {
        if (Math.random() < 0.6) {
          particlesRef.current.push({
            id: particleIdRef.current++,
            x: tipX - 6,
            y: tipY + 2,
            age: 0,
            size: 2 + Math.random() * 3,
          });
        }
        if (particlesRef.current.length > 60) particlesRef.current.shift();
      }
      particlesRef.current = particlesRef.current.filter(p => p.age < 1);
      particlesRef.current.forEach(p => {
        p.age += dt * 0.9;
        p.x -= dt * 28;
        p.y -= dt * 4;
        const a = (1 - p.age) * 0.22;
        const r = p.size * (1 + p.age * 1.8);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,200,180,${a})`;
        ctx.fill();
      });

      // ── Tip glow dot ──
      if (!isCrashed) {
        // outer ring
        ctx.beginPath();
        ctx.arc(tipX, tipY, 9, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232,7,63,0.18)';
        ctx.fill();
        // inner dot
        ctx.beginPath();
        ctx.arc(tipX, tipY, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#ff2060';
        ctx.shadowBlur = 18;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // ── Crash explosion ──
      if (isCrashed) {
        const rings = [14, 22, 34];
        rings.forEach((r, i) => {
          ctx.beginPath();
          ctx.arc(tipX, tipY, r, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(239,68,68,${0.35 - i * 0.1})`;
          ctx.lineWidth = 2 - i * 0.4;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 10;
          ctx.stroke();
        });
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 20;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // ── Tilt ──
      if (pts.length >= 2) {
        const prev = pts[pts.length - 2]!;
        const dx = toX(lastPt!.x) - toX(prev.x);
        const dy = toY(lastPt!.y) - toY(prev.y);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        setPlaneTilt(isCrashed ? 55 : Math.max(-38, Math.min(5, angle)));
      }
      setPlanePct({ x: (tipX / W) * 100, y: (tipY / H) * 100 });

      if (phase === 'running') animId = requestAnimationFrame(draw);
      if (phase === 'crashed') animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animId); };
  }, [phase, isCrashed]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 200 }}>
      {/* Sunburst background — subtle */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${bgSun})`,
        backgroundSize: '110% 110%',
        backgroundPosition: 'center bottom',
        opacity: isCrashed ? 0.05 : 0.08,
        transition: 'opacity 0.6s',
        mixBlendMode: 'screen',
      }} />
      <canvas
        ref={canvasRef}
        width={480}
        height={240}
        style={{ width: '100%', height: '100%', display: 'block', position: 'relative' }}
      />

      {/* Plane follows curve tip */}
      {(phase === 'running' || phase === 'crashed') && planePct && (
        <div style={{
          position: 'absolute',
          left: `${Math.min(planePct.x, 82)}%`,
          top: `${Math.max(planePct.y - 16, 0)}%`,
          transform: 'translateX(-50%)',
          transition: isCrashed
            ? 'left 0.5s ease-in, top 0.5s ease-in'
            : 'left 0.1s linear, top 0.1s linear',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          <PlaneSVG crashed={isCrashed} tilt={planeTilt} frame={planeFrame} />
        </div>
      )}

      {/* Multiplier overlay */}
      <div style={{
        position: 'absolute',
        top: '44%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: 20,
      }}>
        {phase === 'waiting' && (
          <div style={{ color: '#94a3b8', fontSize: 14, fontWeight: 600 }}>
            <div style={{ marginBottom: 8, letterSpacing: '0.04em' }}>Waiting for next round...</div>
            <CountdownBar />
          </div>
        )}
        {(phase === 'running' || phase === 'crashed') && (
          <>
            <div style={{
              fontSize: 'clamp(44px, 13vw, 70px)',
              fontWeight: 900,
              color: isCrashed ? '#ef4444' : '#ffffff',
              lineHeight: 1,
              letterSpacing: '-2px',
              fontVariantNumeric: 'tabular-nums',
              textShadow: isCrashed
                ? '0 0 50px rgba(239,68,68,0.9), 0 2px 8px rgba(0,0,0,0.8)'
                : '0 0 40px rgba(255,255,255,0.55), 0 2px 8px rgba(0,0,0,0.6)',
              animation: isCrashed ? 'crashShake 0.4s ease-out' : undefined,
            }}>
              {fmtMul(displayVal)}
            </div>
            {isCrashed && (
              <div style={{
                color: '#ef4444', fontWeight: 900, fontSize: 12,
                letterSpacing: '0.22em', marginTop: 6,
                textShadow: '0 0 20px rgba(239,68,68,0.8)',
              }}>
                FLEW AWAY!
              </div>
            )}
          </>
        )}
        {phase === 'idle' && (
          <div style={{ color: '#334155', fontSize: 20, fontWeight: 700 }}>—</div>
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
    <div style={{
      display: 'flex',
      gap: 8,
      overflowX: 'auto',
      padding: '0 4px',
      msOverflowStyle: 'none',
      scrollbarWidth: 'none',
    }}>
      <div style={{
        flexShrink: 0,
        padding: '6px 10px',
        borderRadius: 999,
        background: 'rgba(15, 23, 42, 0.9)',
        border: '1px solid rgba(148, 163, 184, 0.18)',
        color: '#94a3b8',
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}>
        Recent
      </div>
      {items.slice(0, 12).map((r, i) => {
        const v = r.crashPoint ?? 0;
        const c = v < 2 ? '#f97316' : v < 5 ? '#38bdf8' : '#a78bfa';
        return (
          <div key={r.id ?? i} style={{
            flexShrink: 0,
            padding: '6px 10px',
            borderRadius: 999,
            background: `${c}18`,
            border: `1px solid ${c}55`,
            fontSize: 10,
            fontWeight: 800,
            color: c,
            boxShadow: `inset 0 0 0 1px ${c}12`,
          }}>
            {fmtMul(v)}
          </div>
        );
      })}
      <div style={{
        flexShrink: 0,
        padding: '6px 10px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        fontSize: 10,
        fontWeight: 800,
        color: '#64748b',
      }}>···</div>
    </div>
  );
}

// ─── Bet Panel (matches screenshot style) ─────────────────────────────────────

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

  const [autoRounds, setAutoRounds] = useState(5);
  const [autoCashoutAt, setAutoCashoutAt] = useState(2.0);
  const [autoActive, setAutoActive] = useState(false);
  const [autoRoundsLeft, setAutoRoundsLeft] = useState(0);
  const autoActiveRef = useRef(false);
  const autoRoundsLeftRef = useRef(0);
  const autoBetPendingRef = useRef(false);
  const prevPhaseRef = useRef<Phase>(phase);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (!autoActiveRef.current) return;
    if (phase !== 'waiting') return;
    const isNewRound = prev !== 'waiting';
    const isFirstActivation = autoBetPendingRef.current;
    if (isNewRound || isFirstActivation) {
      autoBetPendingRef.current = false;
      if (autoRoundsLeftRef.current > 0 && !myBet && !placing) {
        onBet(amount);
        autoRoundsLeftRef.current -= 1;
        setAutoRoundsLeft(autoRoundsLeftRef.current);
        if (autoRoundsLeftRef.current <= 0) { setAutoActive(false); autoActiveRef.current = false; }
      } else if (autoRoundsLeftRef.current <= 0) { setAutoActive(false); autoActiveRef.current = false; }
    }
  }, [phase, myBet, placing]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasCashedOutRef = useRef(false);
  useEffect(() => {
    if (!autoActive || !myBet || myBet.cashoutAt !== null) return;
    if (phase !== 'running') return;
    if (!hasCashedOutRef.current && multiplier >= autoCashoutAt) {
      hasCashedOutRef.current = true;
      onCashout();
    }
  }, [multiplier, phase, autoActive, myBet, autoCashoutAt, onCashout]);

  useEffect(() => { if (phase === 'waiting') hasCashedOutRef.current = false; }, [phase]);

  const startAuto = () => {
    autoRoundsLeftRef.current = autoRounds;
    autoActiveRef.current = true;
    autoBetPendingRef.current = phase === 'waiting';
    setAutoRoundsLeft(autoRounds);
    setAutoActive(true);
  };
  const stopAuto = () => {
    autoActiveRef.current = false;
    autoBetPendingRef.current = false;
    setAutoActive(false);
    setAutoRoundsLeft(0);
  };

  const canBet = phase === 'waiting' && !myBet && !placing;
  const canCashout = phase === 'running' && myBet && myBet.cashoutAt === null && !cashingOut;
  const alreadyCashedOut = myBet && myBet.cashoutAt !== null;
  const adj = (delta: number) => setAmount(a => Math.max(MIN_BET, Math.min(MAX_BET, a + delta)));

  return (
    <div style={{
      background: '#1a1f2e',
      borderRadius: 16,
      padding: '12px 12px 14px',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      {/* Tabs + LIVE badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {(['bet', 'auto'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '7px 20px', borderRadius: 999, border: 'none',
              background: tab === t ? 'linear-gradient(135deg, #f97316, #e8073f)' : 'transparent',
              color: tab === t ? '#fff' : '#64748b',
              fontWeight: 800, fontSize: 13, cursor: 'pointer',
            }}>{t === 'bet' ? 'Bet' : 'Auto'}</button>
          ))}
        </div>
        <div style={{
          padding: '5px 12px', borderRadius: 999,
          background: 'rgba(180,0,40,0.25)', border: '1px solid rgba(232,7,63,0.4)',
          color: '#ff6b8a', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
        }}>
          {phase === 'waiting' ? 'OPEN' : phase === 'running' ? 'LIVE' : 'CLOSED'}
        </div>
      </div>

      {tab === 'bet' ? (
        <>
          {/* Amount row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <button onClick={() => adj(-1)} disabled={!canBet} style={adjBtnStyle(canBet)}>−</button>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>
              {amount.toFixed(2)}
            </div>
            <button onClick={() => adj(1)} disabled={!canBet} style={adjBtnStyle(canBet)}>+</button>
          </div>

          {/* Quick picks 2×2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
            {QUICK.map(q => (
              <button key={q} onClick={() => canBet && setAmount(q)} style={{
                padding: '10px 0', borderRadius: 10, border: 'none',
                background: amount === q ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
                color: amount === q ? '#fff' : '#94a3b8',
                fontSize: 13, fontWeight: 700,
                cursor: canBet ? 'pointer' : 'default',
              }}>{q} ETB</button>
            ))}
          </div>

          {/* Action button */}
          {canCashout ? (
            <button onClick={onCashout} style={{
              width: '100%', padding: '16px', borderRadius: 12, border: 'none',
              background: '#e8073f',
              color: '#fff', fontSize: 16, fontWeight: 900, cursor: 'pointer',
              lineHeight: 1.25, textAlign: 'center',
              animation: 'cashoutPulse 1s ease-in-out infinite',
            }}>
              {cashingOut ? '...' : <><div>Cash Out</div><div style={{ fontSize: 13, opacity: 0.9 }}>{(myBet!.betAmount * multiplier).toFixed(2)} ETB</div></>}
            </button>
          ) : alreadyCashedOut ? (
            <button disabled style={{
              width: '100%', padding: '16px', borderRadius: 12, border: 'none',
              background: 'rgba(34,197,94,0.15)', color: '#4ade80',
              fontSize: 14, fontWeight: 800, textAlign: 'center',
            }}>
              ✓ Cashed out {fmtMul(myBet!.cashoutAt!)}
            </button>
          ) : (
            <button onClick={() => canBet && onBet(amount)} disabled={!canBet} style={{
              width: '100%', padding: '16px', borderRadius: 12, border: 'none',
              background: canBet ? '#22c55e' : 'rgba(255,255,255,0.07)',
              color: canBet ? '#fff' : '#475569',
              fontSize: 16, fontWeight: 900, cursor: canBet ? 'pointer' : 'default',
              lineHeight: 1.25, textAlign: 'center',
            }}>
              {placing ? '...' : <><div>Bet</div><div style={{ fontSize: 13, opacity: 0.9 }}>{amount.toFixed(2)} ETB</div></>}
            </button>
          )}
        </>
      ) : (
        /* Auto tab */
        <>
          {autoActive && (
            <div style={{
              textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#fbbf24',
              background: 'rgba(251,191,36,0.08)', borderRadius: 8, padding: '5px 8px',
              border: '1px solid rgba(251,191,36,0.2)', marginBottom: 10,
            }}>
              Auto — {autoRoundsLeft} round{autoRoundsLeft !== 1 ? 's' : ''} left
            </div>
          )}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Bet</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => adj(-1)} disabled={autoActive} style={adjBtnStyle(!autoActive)}>−</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 900, color: '#fff' }}>{amount.toFixed(2)}</div>
              <button onClick={() => adj(1)} disabled={autoActive} style={adjBtnStyle(!autoActive)}>+</button>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Auto cashout at</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button disabled={autoActive} onClick={() => setAutoCashoutAt(v => Math.max(1.1, parseFloat((v - 0.1).toFixed(2))))} style={adjBtnStyle(!autoActive)}>−</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 900, color: '#fbbf24' }}>{autoCashoutAt.toFixed(2)}x</div>
              <button disabled={autoActive} onClick={() => setAutoCashoutAt(v => parseFloat((v + 0.1).toFixed(2)))} style={adjBtnStyle(!autoActive)}>+</button>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Rounds</div>
            <div style={{ display: 'flex', gap: 5 }}>
              {[3, 5, 10, 20, 50].map(v => (
                <button key={v} disabled={autoActive} onClick={() => setAutoRounds(v)} style={{
                  flex: 1, padding: '7px 0', borderRadius: 8, border: 'none',
                  background: autoRounds === v ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.07)',
                  color: autoRounds === v ? '#fca5a5' : '#64748b',
                  fontSize: 11, fontWeight: 700,
                  cursor: autoActive ? 'default' : 'pointer',
                }}>{v}</button>
              ))}
            </div>
          </div>
          {autoActive ? (
            <button onClick={stopAuto} style={{
              width: '100%', padding: '13px', borderRadius: 12, border: 'none',
              background: '#e8073f', color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer',
            }}>Stop Auto</button>
          ) : (
            <button onClick={startAuto} style={{
              width: '100%', padding: '13px', borderRadius: 12, border: 'none',
              background: '#22c55e', color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer',
            }}>Start Auto ({autoRounds} rounds)</button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Bet table row ────────────────────────────────────────────────────────────

function BetRow({ bet, isMe }: { bet: CrashBetEntry; isMe: boolean }) {
  const cashed = bet.cashoutAt !== null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: '7px 12px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: isMe ? 'rgba(245,158,11,0.06)' : 'transparent', gap: 8,
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
  // Sync refs prevent double-submit before React re-renders
  const placingRef1 = useRef(false);
  const placingRef2 = useRef(false);
  const [betTab, setBetTab] = useState<'all' | 'previous' | 'top'>('all');
  const [myUsername, setMyUsername] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [depositModal, setDepositModal] = useState(false);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);

  // Background music — loops forever, starts on first user interaction
  useEffect(() => {
    const audio = new Audio(bgMusic);
    audio.loop = true;
    audio.volume = 0.25;
    bgAudioRef.current = audio;
    const start = () => { void audio.play().catch(() => {}); };
    // Try immediately (works if page was already interacted with)
    void audio.play().catch(() => {
      // Blocked by autoplay policy — wait for first tap
      window.addEventListener('pointerdown', start, { once: true });
    });
    return () => {
      audio.pause();
      window.removeEventListener('pointerdown', start);
    };
  }, []);
  const playRoundSound = useCallback((kind: 'start' | 'finish') => {
    const audio = new Audio(crashSound);
    audio.volume = kind === 'finish' ? 0.85 : 0.55;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  }, []);

  useEffect(() => {
    getCrashState().then((s) => {
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
    getProfile().then(p => setBalance(p.mainWallet.balance)).catch(() => {});
    try {
      const jwt = getJwtFromStorage() ?? '';
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
      playRoundSound('start');
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
      playRoundSound('finish');
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
    const currentBet = slotIdx === 1 ? myBet1 : myBet2;
    const placingRef = slotIdx === 1 ? placingRef1 : placingRef2;
    // Sync guard — prevents double-submit before React re-renders
    if (currentBet || placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    try {
      const res = await placeCrashBet(amount, slotIdx);
      setMyBet({ betAmount: amount, cashoutAt: null, payout: null });
      setBets(prev => [{ username: myUsername || 'You', betAmount: amount, cashoutAt: null, payout: null }, ...prev]);
      setRoundId(res.roundId);
      getProfile().then(p => setBalance(p.mainWallet.balance)).catch(() => {});
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      // Silently ignore 409 "already have a bet" — can happen during auto-play
      if (!msg.toLowerCase().includes('already')) {
        if (msg.includes('ቀሪ ሂሳብ') || msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('deposit')) {
          setDepositModal(true);
        } else {
          alert(msg || 'Failed to place bet');
        }
      }
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  }, [myUsername, myBet1, myBet2]);

  const handleCashout = useCallback((slotIdx: 1 | 2) => {
    if (!roundId) return;
    const setCashingOut = slotIdx === 1 ? setCashingOut1 : setCashingOut2;
    const setMyBet = slotIdx === 1 ? setMyBet1 : setMyBet2;
    setCashingOut(true);
    (socket as any).emit('CRASH_CASHOUT', { roundId, slot: slotIdx }, (res: any) => {
      setCashingOut(false);
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
    <div style={{
      height: '100dvh',
      background: '#070b12',
      color: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      maxWidth: 430,
      margin: '0 auto',
      fontFamily: "'Inter', sans-serif",
      overflow: 'hidden',
      position: 'relative',
      boxSizing: 'border-box',
    }}>
      {showRules && <AviatorRulesModal onClose={() => setShowRules(false)} />}

      {depositModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div style={{
            background: 'linear-gradient(145deg,#0f1e2e,#0a1220)',
            border: '1px solid rgba(232,7,63,0.3)',
            borderRadius: 24, padding: '32px 24px', maxWidth: 320, width: '100%',
            textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💳</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 8 }}>ቀሪ ሂሳብ አይበቃም!</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6, lineHeight: 1.6 }}>
              Insufficient balance to place a bet.
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 24, lineHeight: 1.6 }}>
              Welcome bonus only works for <span style={{ color: '#f59e0b', fontWeight: 700 }}>Bingo</span>. To play Aviator, please deposit to your main balance.
            </div>
            <button onClick={() => { setDepositModal(false); navigate('/wallet'); }} style={{
              width: '100%', padding: '13px 0', borderRadius: 14, border: 'none',
              background: 'linear-gradient(135deg,#e8073f,#b00530)',
              color: '#fff', fontWeight: 900, fontSize: 15, cursor: 'pointer', marginBottom: 10,
            }}>Deposit Now</button>
            <button onClick={() => setDepositModal(false)} style={{
              width: '100%', padding: '11px 0', borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
              color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{
        height: 46, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#070b12', borderBottom: '1px solid rgba(255,255,255,0.05)',
        padding: '0 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate(-1)} style={{
            background: 'none', border: 'none', color: '#94a3b8',
            fontSize: 20, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
          }}>‹</button>
          <img src={aviatorLogo} alt="Aviator" style={{ height: 22 }} />
          <button onClick={() => setShowRules(true)} style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 999, color: '#94a3b8', fontSize: 11, fontWeight: 700,
            padding: '3px 10px', cursor: 'pointer',
          }}>Rules</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            padding: '5px 10px', borderRadius: 999,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#f8fafc', fontSize: 11, fontWeight: 800,
          }}>
            {balance !== null ? balance.toFixed(2) : '—'} ETB
          </div>
          <button onClick={() => navigate('/wallet')} style={{
            border: 'none', background: 'linear-gradient(135deg, #1dd3a5, #10b981)',
            color: '#032916', borderRadius: 999, padding: '6px 12px',
            fontSize: 11, fontWeight: 900, cursor: 'pointer',
            boxShadow: '0 0 16px rgba(16,185,129,0.35)',
          }}>Deposit</button>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 8px 4px 4px', borderRadius: 999,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              background: 'linear-gradient(180deg, #4de2a1, #05a95c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#032916', fontWeight: 900, fontSize: 10,
            }}>{usernameInitial}</div>
            <div style={{ color: '#f8fafc', fontSize: 12, fontWeight: 700, maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {myUsername || 'Player'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0 16px' }}>

        {/* History chips */}
        <div style={{ padding: '0 12px' }}>
          <HistoryChips items={history} />
        </div>

        {/* Graph */}
        <div style={{
          margin: '0 12px',
          borderRadius: 18,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.06)',
          height: 240,
          flexShrink: 0,
        }}>
          <CrashGraph phase={phase} multiplier={multiplier} crashPoint={crashPoint} />
        </div>

        {/* Bet panel */}
        <div style={{ padding: '0 12px' }}>
          <BetPanel
            phase={phase}
            multiplier={multiplier}
            myBet={myBet1}
            onBet={(amt) => void handleBet(1, amt)}
            onCashout={() => handleCashout(1)}
            placing={placing1}
            cashingOut={cashingOut1}
          />
        </div>

        {/* Bets table */}
        <div style={{
          margin: '0 12px',
          background: '#141a24',
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {(['all', 'previous'] as const).map((tabKey) => (
              <button key={tabKey} onClick={() => setBetTab(tabKey)} style={{
                flex: 1, background: 'transparent', border: 'none',
                borderBottom: betTab === tabKey ? '2px solid #ff3f65' : '2px solid transparent',
                color: betTab === tabKey ? '#fff' : '#8a94a7',
                padding: '10px 0', fontSize: 12, fontWeight: 800, cursor: 'pointer',
              }}>
                {tabKey === 'all' ? `Live Bets (${liveBets.length})` : 'My Bets'}
              </button>
            ))}
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: '1.3fr 0.7fr 0.9fr 0.9fr',
            padding: '8px 12px 4px',
            fontSize: 10, fontWeight: 800, color: '#64748b',
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            <span>Player</span>
            <span style={{ textAlign: 'right' }}>Bet</span>
            <span style={{ textAlign: 'right' }}>Cashout</span>
            <span style={{ textAlign: 'right' }}>Payout</span>
          </div>

          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {(betTab === 'all' ? liveBets : myBets).length === 0 ? (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: '#475569', fontSize: 12 }}>
                {betTab === 'all' ? 'No bets this round yet' : 'No bets placed yet'}
              </div>
            ) : (
              (betTab === 'all' ? liveBets : myBets).map((bet, i) => (
                <BetRow key={`${bet.username}-${i}`} bet={bet} isMe={bet.username === (myUsername || 'You')} />
              ))
            )}
          </div>
        </div>

      </div>

      <style>{`
        @keyframes propSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes cashoutPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 16px rgba(34,197,94,0.4); }
          50% { transform: scale(1.02); box-shadow: 0 0 28px rgba(34,197,94,0.7); }
        }
        @keyframes crashShake {
          0% { transform: translate(-50%,-50%) translateX(0); }
          20% { transform: translate(-50%,-50%) translateX(-6px); }
          40% { transform: translate(-50%,-50%) translateX(6px); }
          60% { transform: translate(-50%,-50%) translateX(-4px); }
          80% { transform: translate(-50%,-50%) translateX(4px); }
          100% { transform: translate(-50%,-50%) translateX(0); }
        }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
