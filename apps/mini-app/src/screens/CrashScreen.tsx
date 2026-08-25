import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import { getCrashState, placeCrashBet, getCrashHistory, getProfile } from '../lib/api';
import type { CrashBetEntry, CrashHistoryEntry } from '../lib/api';
import { getJwtFromStorage } from '../lib/auth-storage';

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

function PlaneSVG({ crashed, tilt }: { crashed: boolean; tilt: number }) {
  return (
    <div style={{
      transform: `rotate(${tilt}deg)`,
      transition: crashed ? 'transform 0.5s ease-in' : 'transform 0.2s ease-out',
      filter: crashed
        ? 'drop-shadow(0 0 18px #e8073f) drop-shadow(0 0 8px #ff0000)'
        : 'drop-shadow(0 0 14px rgba(232,7,63,0.9)) drop-shadow(0 0 5px rgba(255,120,80,0.6))',
    }}>
      <svg width="110" height="64" viewBox="0 0 220 120" fill="none" xmlns="http://www.w3.org/2000/svg">

        {/* ── Spinning propeller (CSS animation) ── */}
        {!crashed ? (
          <g style={{ transformOrigin: '198px 52px', animation: 'propSpin 0.12s linear infinite' }}>
            {/* blade 1 */}
            <ellipse cx="198" cy="52" rx="4" ry="24" fill="#c0052e" opacity="0.95" />
            {/* blade 2 — 60° */}
            <ellipse cx="198" cy="52" rx="4" ry="24" fill="#c0052e" opacity="0.95" transform="rotate(60 198 52)" />
            {/* blade 3 — 120° */}
            <ellipse cx="198" cy="52" rx="4" ry="24" fill="#c0052e" opacity="0.95" transform="rotate(120 198 52)" />
          </g>
        ) : (
          /* stopped propeller on crash */
          <g>
            <ellipse cx="198" cy="52" rx="4" ry="24" fill="#7f0020" opacity="0.7" />
            <ellipse cx="198" cy="52" rx="4" ry="24" fill="#7f0020" opacity="0.7" transform="rotate(60 198 52)" />
          </g>
        )}

        {/* ── Propeller hub ── */}
        <circle cx="198" cy="52" r="7" fill="#8b0020" stroke="#000" strokeWidth="1.5" />

        {/* ── Engine cowl / nose ── */}
        <path d="M180 40 Q198 40 205 52 Q198 64 180 64 Z" fill="#a00428" stroke="#000" strokeWidth="1.5" />

        {/* ── Main fuselage ── */}
        <path d="M18 72 Q55 60 105 55 L172 40 L180 44 L180 60 L172 64 L105 69 Q55 76 22 82 Z"
          fill="#e8073f" stroke="#000" strokeWidth="2" strokeLinejoin="round" />

        {/* ── Bottom hull / belly ── */}
        <path d="M22 82 Q70 88 172 70 L180 66 L172 74 Q70 92 26 86 Z"
          fill="#b00530" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" />

        {/* ── Main wing (top) ── */}
        <path d="M88 62 L108 14 L126 20 L110 66 Z"
          fill="#e8073f" stroke="#000" strokeWidth="2" strokeLinejoin="round" />
        {/* wing shading */}
        <path d="M96 61 L112 18 L118 20 L104 65 Z" fill="#c0052e" />

        {/* ── Dorsal fin ── */}
        <path d="M138 54 L126 30 L116 33 L124 56 Z"
          fill="#e8073f" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M132 54 L122 34 L118 35 L122 56 Z" fill="#c0052e" />

        {/* ── Cockpit canopy ── */}
        <path d="M118 55 L148 44 L156 48 L156 60 L126 65 Z"
          fill="#b00530" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" />
        {/* window glass */}
        <path d="M124 57 L146 47 L152 50 L152 58 L130 62 Z"
          fill="#0d0010" opacity="0.88" />
        {/* window glint */}
        <path d="M128 57 L138 50 L140 52 L131 59 Z" fill="rgba(255,255,255,0.18)" />

        {/* ── Tail fuselage taper ── */}
        <path d="M18 72 L6 65 L14 60 L34 68 Z"
          fill="#e8073f" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" />

        {/* ── Tail vertical fin ── */}
        <path d="M22 72 L16 52 L28 56 L32 72 Z"
          fill="#e8073f" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" />

        {/* ── Tail horizontal stabilisers ── */}
        <path d="M14 70 L2 78 L8 83 L26 76 Z"
          fill="#e8073f" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M12 65 L2 56 L8 52 L22 62 Z"
          fill="#e8073f" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" />

      </svg>
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
  // Stars initialised once
  const starsRef = useRef<Star[]>([]);

  const [planePct, setPlanePct] = useState<{ x: number; y: number } | null>(null);
  const [planeTilt, setPlaneTilt] = useState(-12);

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

    const draw = () => {
      const now = Date.now();
      const dt = (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      const ctx = canvas.getContext('2d')!;
      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);

      // ── Deep space background gradient ──
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      if (isCrashed) {
        bgGrad.addColorStop(0, 'rgba(40,0,8,1)');
        bgGrad.addColorStop(1, 'rgba(15,0,4,1)');
      } else {
        bgGrad.addColorStop(0, 'rgba(8,10,28,1)');
        bgGrad.addColorStop(1, 'rgba(5,7,18,1)');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // ── Animated stars (scroll left when running) ──
      const starSpeed = phase === 'running' ? 1 : 0;
      starsRef.current.forEach(s => {
        if (starSpeed) {
          s.x -= s.speed * dt;
          if (s.x < 0) {
            s.x = W + Math.random() * 20;
            s.y = Math.random() * H;
          }
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        // Twinkle: oscillate alpha
        const twinkle = s.alpha * (0.7 + 0.3 * Math.sin(now / 600 + s.x));
        ctx.fillStyle = isCrashed
          ? `rgba(255,120,120,${twinkle * 0.6})`
          : `rgba(200,220,255,${twinkle})`;
        ctx.fill();
      });

      // ── Conic ray background ──
      const rays = 18;
      for (let i = 0; i < rays; i++) {
        const a1 = (-Math.PI / 2) * (i / rays);
        const a2 = (-Math.PI / 2) * ((i + 0.5) / rays);
        const r = Math.max(W, H) * 2;
        ctx.beginPath();
        ctx.moveTo(0, H);
        ctx.lineTo(Math.cos(a1) * r, H + Math.sin(a1) * r);
        ctx.lineTo(Math.cos(a2) * r, H + Math.sin(a2) * r);
        ctx.closePath();
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0)';
        ctx.fill();
      }

      // ── Left axis dots ──
      const padX = 32, padY = 24;
      for (let i = 0; i <= 6; i++) {
        const y = padY + (i / 6) * (H - padY - 10);
        ctx.beginPath();
        ctx.arc(10, y, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(99,140,255,0.35)';
        ctx.fill();
      }

      const pts = pointsRef.current;
      if (pts.length < 2) {
        if (phase === 'running' || phase === 'crashed') rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const lastPt = pts[pts.length - 1]!;
      const maxT = Math.max(lastPt.x, 0.5);
      const maxM = Math.max(...pts.map(p => p.y), 2);

      const toX = (t: number) => padX + (t / maxT) * (W - padX - 14);
      const toY = (m: number) => H - 10 - ((m - 1) / Math.max(maxM - 1, 0.5)) * (H - padY - 10);

      const tipX = toX(lastPt.x);
      const tipY = toY(lastPt.y);

      // ── Filled area under curve ──
      const grad = ctx.createLinearGradient(0, tipY, 0, H);
      if (isCrashed) {
        grad.addColorStop(0, 'rgba(239,68,68,0.4)');
        grad.addColorStop(1, 'rgba(239,68,68,0.03)');
      } else {
        grad.addColorStop(0, 'rgba(232,7,63,0.28)');
        grad.addColorStop(1, 'rgba(232,7,63,0.02)');
      }
      ctx.beginPath();
      ctx.moveTo(toX(pts[0]!.x), H - 10);
      pts.forEach(p => ctx.lineTo(toX(p.x), toY(p.y)));
      ctx.lineTo(tipX, H - 10);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // ── Curve line ──
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = toX(p.x), y = toY(p.y);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#e8073f';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.shadowColor = '#e8073f';
      ctx.shadowBlur = isCrashed ? 4 : 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // ── Glow dot at tip ──
      if (!isCrashed) {
        ctx.beginPath();
        ctx.arc(tipX, tipY, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#e8073f';
        ctx.shadowBlur = 16;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // ── Smoke / exhaust trail particles ──
      if (!isCrashed && pts.length >= 2) {
        particlesRef.current.push({
          id: particleIdRef.current++,
          x: tipX - 8,
          y: tipY + 4,
          age: 0,
          size: 3 + Math.random() * 4,
        });
        if (particlesRef.current.length > 80) particlesRef.current.shift();
      }

      particlesRef.current = particlesRef.current.filter(p => p.age < 1);
      particlesRef.current.forEach(p => {
        p.age += dt * 0.7;
        p.x -= dt * 35;
        p.y += dt * 6;
        const alpha = (1 - p.age) * 0.3;
        const r = p.size * (1 + p.age * 2);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220,200,200,${alpha})`;
        ctx.fill();
      });

      // ── Compute tilt from last two curve points ──
      if (pts.length >= 2) {
        const prev = pts[pts.length - 2]!;
        const dx = toX(lastPt.x) - toX(prev.x);
        const dy = toY(lastPt.y) - toY(prev.y);
        const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (!isCrashed) {
          setPlaneTilt(Math.max(-40, Math.min(5, angleDeg)));
        } else {
          setPlaneTilt(60);
        }
      }

      // Update plane overlay position — offset left so nose is at tip
      setPlanePct({ x: (tipX / W) * 100, y: (tipY / H) * 100 });

      if (phase === 'running') rafRef.current = requestAnimationFrame(draw);
      // One final frame on crash to render crashed state
      if (phase === 'crashed' && !rafRef.current) rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); rafRef.current = 0; };
  }, [phase, isCrashed]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 160 }}>
      <canvas
        ref={canvasRef}
        width={420}
        height={210}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />

      {/* Plane follows curve tip */}
      {(phase === 'running' || phase === 'crashed') && planePct && (
        <div style={{
          position: 'absolute',
          left: `${Math.min(planePct.x, 80)}%`,
          top: `${Math.max(planePct.y - 14, 1)}%`,
          transition: isCrashed
            ? 'left 0.4s ease-in, top 0.4s ease-in'
            : 'left 0.12s linear, top 0.12s linear',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          <PlaneSVG crashed={isCrashed} tilt={planeTilt} />
        </div>
      )}

      {/* Multiplier overlay */}
      <div style={{
        position: 'absolute',
        top: '42%',
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
              fontSize: 'clamp(38px, 11vw, 62px)',
              fontWeight: 900,
              color: isCrashed ? '#ef4444' : '#ffffff',
              lineHeight: 1,
              letterSpacing: '-2px',
              fontVariantNumeric: 'tabular-nums',
              textShadow: isCrashed
                ? '0 0 40px rgba(239,68,68,0.8)'
                : '0 0 30px rgba(255,255,255,0.5)',
              animation: isCrashed ? 'crashShake 0.4s ease-out' : undefined,
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
            flexShrink: 0, padding: '2px 8px', borderRadius: 12,
            background: `${c}22`, border: `1px solid ${c}55`,
            fontSize: 11, fontWeight: 700, color: c,
          }}>
            {fmtMul(v)}
          </div>
        );
      })}
      <div style={{
        flexShrink: 0, padding: '2px 8px', borderRadius: 12,
        background: 'rgba(255,255,255,0.07)',
        fontSize: 11, fontWeight: 700, color: '#64748b', cursor: 'pointer',
      }}>···</div>
    </div>
  );
}

// ─── Bet Panel ────────────────────────────────────────────────────────────────

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
  const [amount, setAmount] = useState(5);
  const QUICK = [5, 10, 40, 100];

  // ── Auto-play state ──
  const [autoRounds, setAutoRounds] = useState(5);
  const [autoCashoutAt, setAutoCashoutAt] = useState(2.0);
  const [autoActive, setAutoActive] = useState(false);
  const [autoRoundsLeft, setAutoRoundsLeft] = useState(0);
  // Use a single ref-based state machine to avoid React render/effect timing races.
  // All auto logic reads from refs; React state is only for display.
  const autoActiveRef = useRef(false);
  const autoRoundsLeftRef = useRef(0);
  const autoBetPendingRef = useRef(false); // set true when we want ONE bet placed on next waiting phase

  const prevPhaseRef = useRef<Phase>(phase);

  // This effect is the ONLY place that calls onBet for auto-play.
  // It fires when phase changes to 'waiting' OR when autoBetPendingRef is set.
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    if (!autoActiveRef.current) return;
    if (phase !== 'waiting') return;

    // Fire on genuine transition to 'waiting', or on first activation (prev === phase === 'waiting')
    const isNewRound = prev !== 'waiting';
    const isFirstActivation = autoBetPendingRef.current;

    if (isNewRound || isFirstActivation) {
      autoBetPendingRef.current = false;
      if (autoRoundsLeftRef.current > 0 && !myBet && !placing) {
        onBet(amount);
        autoRoundsLeftRef.current -= 1;
        setAutoRoundsLeft(autoRoundsLeftRef.current);
        if (autoRoundsLeftRef.current <= 0) {
          setAutoActive(false);
          autoActiveRef.current = false;
        }
      } else if (autoRoundsLeftRef.current <= 0) {
        setAutoActive(false);
        autoActiveRef.current = false;
      }
    }
  }, [phase, myBet, placing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-cashout: when multiplier reaches the target
  const hasCashedOutRef = useRef(false);
  useEffect(() => {
    if (!autoActive || !myBet || myBet.cashoutAt !== null) return;
    if (phase !== 'running') return;
    if (!hasCashedOutRef.current && multiplier >= autoCashoutAt) {
      hasCashedOutRef.current = true;
      onCashout();
    }
  }, [multiplier, phase, autoActive, myBet, autoCashoutAt, onCashout]);

  // Reset cash-out guard each round
  useEffect(() => {
    if (phase === 'waiting') hasCashedOutRef.current = false;
  }, [phase]);

  const startAuto = () => {
    const rounds = autoRounds;
    autoRoundsLeftRef.current = rounds;
    autoActiveRef.current = true;
    // Signal the phase effect to fire a bet immediately (handles phase === 'waiting' already)
    autoBetPendingRef.current = phase === 'waiting';
    setAutoRoundsLeft(rounds);
    setAutoActive(true); // triggers re-render → effect runs with autoBetPendingRef = true
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
      background: '#1a1d2e',
      borderRadius: 14,
      padding: '10px 12px 12px',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 10, background: '#0d0f1a', borderRadius: 20, padding: 3, width: 'fit-content' }}>
        {(['bet', 'auto'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '5px 18px', borderRadius: 17, border: 'none',
            background: tab === t ? '#2d3047' : 'transparent',
            color: tab === t ? '#fff' : '#64748b',
            fontWeight: 700, fontSize: 13, cursor: 'pointer', textTransform: 'capitalize',
          }}>{t === 'bet' ? 'Bet' : 'Auto'}</button>
        ))}
      </div>

      {tab === 'bet' ? (
        /* ── Manual bet UI ── */
        <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <button onClick={() => adj(-1)} disabled={!canBet} style={adjBtnStyle(canBet)}>−</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>
                {amount.toFixed(2)}
              </div>
              <button onClick={() => adj(1)} disabled={!canBet} style={adjBtnStyle(canBet)}>+</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              {QUICK.map(q => (
                <button key={q} onClick={() => canBet && setAmount(q)} style={{
                  padding: '5px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
                  background: amount === q ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                  color: amount === q ? '#fff' : '#64748b',
                  fontSize: 12, fontWeight: 700, cursor: canBet ? 'pointer' : 'default', opacity: canBet ? 1 : 0.5,
                }}>{q}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 130 }}>
            {canCashout ? (
              <button onClick={onCashout} style={{
                width: '100%', padding: '14px 10px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
                textAlign: 'center', lineHeight: 1.3,
                boxShadow: '0 0 20px rgba(34,197,94,0.4)',
                animation: 'cashoutPulse 1s ease-in-out infinite',
              }}>
                {cashingOut ? '...' : <>Cash Out<br /><span style={{ fontSize: 13 }}>{(myBet!.betAmount * multiplier).toFixed(2)} ETB</span></>}
              </button>
            ) : alreadyCashedOut ? (
              <button disabled style={{
                width: '100%', padding: '14px 10px', borderRadius: 12, border: 'none',
                background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                fontSize: 13, fontWeight: 800, textAlign: 'center', lineHeight: 1.3,
              }}>
                Cashed out<br />{fmtMul(myBet!.cashoutAt!)}
              </button>
            ) : (
              <button onClick={() => canBet && onBet(amount)} disabled={!canBet} style={{
                width: '100%', padding: '14px 10px', borderRadius: 12, border: 'none',
                background: canBet ? 'linear-gradient(135deg, #16a34a, #22c55e)' : 'rgba(255,255,255,0.06)',
                color: canBet ? '#fff' : '#475569', fontSize: 15, fontWeight: 800,
                cursor: canBet ? 'pointer' : 'default',
                textAlign: 'center', lineHeight: 1.3,
                boxShadow: canBet ? '0 0 16px rgba(34,197,94,0.3)' : 'none',
              }}>
                {placing ? '...' : <>{phase === 'running' ? 'Bet Next' : 'Bet'}<br /><span style={{ fontSize: 13 }}>{amount.toFixed(2)} ETB</span></>}
              </button>
            )}
          </div>
        </div>
      ) : (
        /* ── Auto bet UI ── */
        <div>
          {autoActive && (
            <div style={{
              textAlign: 'center', fontSize: 12, fontWeight: 700,
              color: '#fbbf24', marginBottom: 8,
              background: 'rgba(251,191,36,0.1)', borderRadius: 8, padding: '4px 8px',
            }}>
              Auto running — {autoRoundsLeft} round{autoRoundsLeft !== 1 ? 's' : ''} left
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {/* Bet amount */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>BET AMOUNT</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => adj(-1)} disabled={autoActive} style={adjBtnStyle(!autoActive)}>−</button>
                <div style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 800, color: '#fff' }}>
                  {amount.toFixed(2)}
                </div>
                <button onClick={() => adj(1)} disabled={autoActive} style={adjBtnStyle(!autoActive)}>+</button>
              </div>
            </div>
          </div>

          {/* Auto cashout at */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>AUTO CASHOUT AT</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                disabled={autoActive}
                onClick={() => setAutoCashoutAt(v => Math.max(1.1, parseFloat((v - 0.1).toFixed(2))))}
                style={adjBtnStyle(!autoActive)}>−</button>
              <div style={{
                flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 800,
                color: '#fbbf24', letterSpacing: '-0.5px',
              }}>
                {autoCashoutAt.toFixed(2)}x
              </div>
              <button
                disabled={autoActive}
                onClick={() => setAutoCashoutAt(v => parseFloat((v + 0.1).toFixed(2)))}
                style={adjBtnStyle(!autoActive)}>+</button>
            </div>
            {/* Preset cashouts */}
            <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
              {[1.5, 2, 3, 5, 10].map(v => (
                <button key={v} disabled={autoActive} onClick={() => setAutoCashoutAt(v)} style={{
                  flex: 1, padding: '4px 0', borderRadius: 7,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: autoCashoutAt === v ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.05)',
                  color: autoCashoutAt === v ? '#fbbf24' : '#64748b',
                  fontSize: 11, fontWeight: 700, cursor: autoActive ? 'default' : 'pointer',
                }}>{v}x</button>
              ))}
            </div>
          </div>

          {/* Rounds */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>NUMBER OF ROUNDS</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button disabled={autoActive} onClick={() => setAutoRounds(r => Math.max(1, r - 1))} style={adjBtnStyle(!autoActive)}>−</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 800, color: '#fff' }}>
                {autoRounds}
              </div>
              <button disabled={autoActive} onClick={() => setAutoRounds(r => Math.min(100, r + 1))} style={adjBtnStyle(!autoActive)}>+</button>
            </div>
            <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
              {[3, 5, 10, 20, 50].map(v => (
                <button key={v} disabled={autoActive} onClick={() => setAutoRounds(v)} style={{
                  flex: 1, padding: '4px 0', borderRadius: 7,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: autoRounds === v ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
                  color: autoRounds === v ? '#ef4444' : '#64748b',
                  fontSize: 11, fontWeight: 700, cursor: autoActive ? 'default' : 'pointer',
                }}>{v}</button>
              ))}
            </div>
          </div>

          {/* Start / Stop button */}
          {autoActive ? (
            <button onClick={stopAuto} style={{
              width: '100%', padding: '13px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #dc2626, #ef4444)',
              color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 0 16px rgba(239,68,68,0.4)',
            }}>
              Stop Auto
            </button>
          ) : (
            <button onClick={startAuto} style={{
              width: '100%', padding: '13px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #d97706, #fbbf24)',
              color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 0 16px rgba(251,191,36,0.4)',
            }}>
              Start Auto ({autoRounds} rounds)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function adjBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    width: 34, height: 34, borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.07)',
    color: enabled ? '#fff' : '#475569',
    fontSize: 20, fontWeight: 700,
    cursor: enabled ? 'pointer' : 'default',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  };
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
        alert(msg || 'Failed to place bet');
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

  return (
    <div style={{
      height: '100dvh',
      background: '#0d0f1a',
      color: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      maxWidth: 520,
      margin: '0 auto',
      fontFamily: "'Inter', sans-serif",
      overflow: 'hidden',
    }}>

      {showRules && <AviatorRulesModal onClose={() => setShowRules(false)} />}

      {/* Header */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            onClick={() => navigate('/')}
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, cursor: 'pointer', flexShrink: 0,
            }}
          >🏠</div>
          <svg width="110" height="28" viewBox="0 0 340 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 72 L28 8 L48 8 L68 72 L54 72 L50 58 L26 58 L22 72 Z M30 46 L46 46 L38 18 Z" fill="#e8073f"/>
            <path d="M72 22 L86 62 L100 22 L114 22 L94 72 L78 72 L58 22 Z" fill="#e8073f"/>
            <circle cx="126" cy="10" r="7" fill="#e8073f"/>
            <rect x="120" y="22" width="12" height="50" rx="6" fill="#e8073f"/>
            <path d="M148 34 Q162 20 178 22 Q196 22 200 36 L200 72 L188 72 L188 66 Q180 74 168 74 Q152 74 148 62 Q144 48 156 40 Q164 34 188 36 Q186 26 174 26 Q164 26 158 34 Z M188 46 Q164 42 160 52 Q158 62 168 64 Q180 66 188 58 Z" fill="#e8073f"/>
            <path d="M210 8 L222 8 L222 22 L236 22 L236 34 L222 34 L222 60 Q222 68 230 68 L236 68 L236 72 Q228 76 220 74 Q208 70 208 60 L208 34 L200 34 L200 22 L210 22 Z" fill="#e8073f"/>
            <path d="M244 47 Q244 22 268 22 Q292 22 292 47 Q292 72 268 72 Q244 72 244 47 Z M256 47 Q256 62 268 62 Q280 62 280 47 Q280 32 268 32 Q256 32 256 47 Z" fill="#e8073f"/>
            <path d="M298 22 L310 22 L310 32 Q316 20 330 22 L330 34 Q314 30 312 44 L312 72 L298 72 Z" fill="#e8073f"/>
          </svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>
            {balance !== null ? balance.toFixed(2) : '—'} ETB
          </span>
          <span onClick={() => setShowRules(true)} style={{ fontSize: 18, color: '#475569', cursor: 'pointer' }}>≡</span>
          <span style={{ fontSize: 18, color: '#475569', cursor: 'pointer' }}>💬</span>
        </div>
      </div>

      {/* History chips */}
      <div style={{ flexShrink: 0, padding: '6px 0 4px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <HistoryChips items={history} />
      </div>

      {/* Crash graph — flex-grows to fill available space */}
      <div style={{ flex: '1 1 0', position: 'relative', overflow: 'hidden', background: '#080a1c', minHeight: 140 }}>
        <CrashGraph phase={phase} multiplier={multiplier} crashPoint={crashPoint} />
      </div>

      {/* Scrollable bottom section */}
      <div style={{ flexShrink: 0, overflowY: 'auto', maxHeight: '52vh' }}>
        {/* Bet panels */}
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <BetPanel
            phase={phase} multiplier={multiplier}
            myBet={myBet1} onBet={(a) => handleBet(1, a)} onCashout={() => handleCashout(1)}
            placing={placing1} cashingOut={cashingOut1}
          />
          <BetPanel
            phase={phase} multiplier={multiplier}
            myBet={myBet2} onBet={(a) => handleBet(2, a)} onCashout={() => handleCashout(2)}
            placing={placing2} cashingOut={cashingOut2}
          />
        </div>

        {/* Bets section */}
        <div style={{ padding: '0 10px 10px' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 8 }}>
            {(['all', 'previous', 'top'] as const).map(t => (
              <button key={t} onClick={() => setBetTab(t)} style={{
                flex: 1, padding: '8px 0', border: 'none', background: 'transparent',
                color: betTab === t ? '#fff' : '#64748b', fontWeight: 700, fontSize: 12,
                cursor: 'pointer', textTransform: 'capitalize',
                borderBottom: betTab === t ? '2px solid #ef4444' : '2px solid transparent',
              }}>
                {t === 'all' ? 'All Bets' : t === 'previous' ? 'Previous' : 'Top'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 20, height: 20, borderRadius: '50%',
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
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>Total win ETB</span>
          </div>

          <div style={{
            background: '#1a1d2e', borderRadius: 12, overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#14172a' }}>
              <div style={{ flex: 1, fontSize: 11, color: '#475569', fontWeight: 700 }}>User</div>
              <div style={{ minWidth: 48, textAlign: 'right', fontSize: 11, color: '#475569', fontWeight: 700 }}>Bet</div>
              <div style={{ minWidth: 48, textAlign: 'right', fontSize: 11, color: '#475569', fontWeight: 700 }}>Out @</div>
              <div style={{ minWidth: 58, textAlign: 'right', fontSize: 11, color: '#475569', fontWeight: 700 }}>Profit</div>
            </div>
            {bets.length === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 13, color: '#334155' }}>No bets this round</div>
            ) : bets.map((b, i) => (
              <BetRow key={i} bet={b} isMe={b.username === myUsername} />
            ))}
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
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
