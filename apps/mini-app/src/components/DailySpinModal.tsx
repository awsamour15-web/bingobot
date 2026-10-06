import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { getDailySpinStatus, claimDailySpin, type SpinPrize } from '../lib/api';
import { initAuth } from '../lib/auth';

// ─── Theme ────────────────────────────────────────────────────────────────────
const C = {
  bg:      'rgba(4,8,20,0.96)',
  surface: '#080f1e',
  card:    '#0d1729',
  border:  'rgba(255,255,255,0.07)',
  amber:   '#f59e0b',
  amberDim:'#92600a',
  green:   '#34d399',
  text:    '#f1f5f9',
  muted:   '#475569',
};

// ─── Wheel config ─────────────────────────────────────────────────────────────
const SEGMENTS = [
  { amount: 5,  color: '#1d4ed8', dim: '#1e3a6e' },
  { amount: 10, color: '#059669', dim: '#065f46' },
  { amount: 3,  color: '#7c3aed', dim: '#4c1d95' },
  { amount: 20, color: '#dc2626', dim: '#7f1d1d' },
  { amount: 7,  color: '#0891b2', dim: '#164e63' },
  { amount: 15, color: '#d97706', dim: '#78350f' },
  { amount: 2,  color: '#be185d', dim: '#831843' },
  { amount: 25, color: '#15803d', dim: '#14532d' },
];
const SEG_COUNT = SEGMENTS.length;
const SPIN_MS   = 4800; // longer = smoother feel

// ─── Canvas draw ─────────────────────────────────────────────────────────────
function drawWheel(canvas: HTMLCanvasElement, angle: number, wonPrize: SpinPrize | null) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const S  = canvas.width;
  const cx = S / 2, cy = S / 2;
  const R  = cx - 6;
  const sa = (2 * Math.PI) / SEG_COUNT;

  ctx.clearRect(0, 0, S, S);

  // Outer glow ring
  const glow = ctx.createRadialGradient(cx, cy, R - 4, cx, cy, R + 8);
  glow.addColorStop(0, 'rgba(245,158,11,0.25)');
  glow.addColorStop(1, 'rgba(245,158,11,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, R + 8, 0, 2 * Math.PI);
  ctx.fillStyle = glow;
  ctx.fill();

  for (let i = 0; i < SEG_COUNT; i++) {
    const seg   = SEGMENTS[i]!;
    const start = angle + i * sa;
    const end   = start + sa;
    const mid   = start + sa / 2;

    // Gradient fill per slice
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0.35, seg.color);
    grad.addColorStop(1,    seg.dim);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, start, end);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Subtle divider line
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Amount text
    const tr = R * 0.65;
    const tx = cx + Math.cos(mid) * tr;
    const ty = cy + Math.sin(mid) * tr;

    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(mid + Math.PI / 2);

    const fs = S < 260 ? 12 : 14;

    // Drop shadow
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur  = 4;

    ctx.font = `900 ${fs}px "DM Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(String(seg.amount), 0, -3);

    ctx.shadowBlur = 0;
    ctx.font = `600 ${fs - 4}px "DM Sans", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('ETB', 0, fs - 2);

    ctx.restore();
  }

  // Center hub
  const hubR = 26;
  const hubGrad = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, hubR);
  hubGrad.addColorStop(0, '#1e2d47');
  hubGrad.addColorStop(1, '#080f1e');
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, 2 * Math.PI);
  ctx.fillStyle = hubGrad;
  ctx.fill();
  ctx.strokeStyle = C.amber;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  if (wonPrize) {
    ctx.fillStyle = C.amber;
    ctx.font = `900 ${S < 260 ? 8 : 9}px "DM Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(wonPrize.label, cx, cy);
  } else {
    ctx.font = `${S < 260 ? 15 : 17}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎯', cx, cy);
  }
}

// ─── Easing ───────────────────────────────────────────────────────────────────
// Cubic ease-in-out for natural deceleration
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props { onClose: () => void }

export default function DailySpinModal({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const angleRef  = useRef<number>(0);

  const [phase, setPhase]   = useState<'loading' | 'idle' | 'spinning' | 'result' | 'error'>('loading');
  const [result, setResult] = useState<SpinPrize | null>(null);
  const [error, setError]   = useState('');

  const redraw = useCallback((a: number, p: SpinPrize | null = null) => {
    const c = canvasRef.current;
    if (c) drawWheel(c, a, p);
  }, []);

  const loadSpin = useCallback(() => {
    setPhase('loading');
    setError('');
    initAuth()
      .then(() => getDailySpinStatus())
      .then(s => {
        if (!s.canSpin) { onClose(); return; }
        setPhase('idle');
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[DailySpin]', msg);
        setError(msg || 'Could not load spin. Try again later.');
        setPhase('error');
      });
  }, [onClose]);

  useEffect(() => { loadSpin(); }, [loadSpin]);
  useLayoutEffect(() => { redraw(angleRef.current); }, [redraw]);
  useEffect(() => { if (phase !== 'loading') redraw(angleRef.current); }, [phase, redraw]);

  const startSpin = useCallback(async () => {
    if (phase !== 'idle') return;
    setPhase('spinning');

    let claimed: SpinPrize;
    try {
      claimed = (await claimDailySpin()).prize;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Spin failed';
      setError(msg.toLowerCase().includes('already') ? 'You already spun today. Come back tomorrow! 🌅' : msg);
      setPhase('error');
      return;
    }

    const from   = angleRef.current;
    // Guarantee at least 7 full rotations + overshoot for excitement
    const spins  = 7 + Math.random() * 2;
    const target = from + spins * 2 * Math.PI;
    const t0     = performance.now();

    const animate = (now: number) => {
      const raw = Math.min((now - t0) / SPIN_MS, 1);
      const t   = easeInOutCubic(raw);
      const a   = from + (target - from) * t;
      angleRef.current = a;
      redraw(a, raw >= 1 ? claimed : null);
      if (raw < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setResult(claimed);
        setPhase('result');
      }
    };
    animRef.current = requestAnimationFrame(animate);
  }, [phase, redraw]);

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  const size = Math.min(window.innerWidth - 40, 290);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: C.bg,
      backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px 16px',
    }}>
      <div style={{
        width: '100%', maxWidth: 340,
        background: C.surface,
        borderRadius: 28,
        border: `1px solid ${C.border}`,
        overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(245,158,11,0.08)',
      }}>

        {/* Top accent bar */}
        <div style={{
          height: 3,
          background: `linear-gradient(90deg, #7c3aed, ${C.amber}, #059669)`,
        }} />

        <div style={{ padding: '24px 20px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>

          {/* Header */}
          <div style={{ textAlign: 'center', lineHeight: 1 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🎡</div>
            <div style={{
              color: C.amber, fontWeight: 900, fontSize: 20,
              fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '-0.3px',
            }}>
              Daily Lucky Spin
            </div>
            {phase === 'idle' && (
              <div style={{ color: C.muted, fontSize: 11, marginTop: 5, letterSpacing: '0.02em' }}>
                One free spin every day — good luck!
              </div>
            )}
          </div>

          {/* Wheel container */}
          <div style={{ position: 'relative', width: size + 24, height: size + 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Glow behind wheel */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />
            {/* Pointer */}
            <div style={{
              position: 'absolute', top: 0, left: '50%',
              transform: 'translateX(-50%)',
              width: 0, height: 0,
              borderLeft: '9px solid transparent',
              borderRight: '9px solid transparent',
              borderTop: `20px solid ${C.amber}`,
              zIndex: 2,
              filter: 'drop-shadow(0 3px 6px rgba(245,158,11,0.6))',
            }} />
            <canvas
              ref={canvasRef}
              width={size}
              height={size}
              style={{
                borderRadius: '50%',
                display: 'block',
                boxShadow: '0 0 0 3px rgba(245,158,11,0.2), 0 12px 40px rgba(0,0,0,0.5)',
              }}
            />
          </div>

          {/* Phase UI */}
          {phase === 'loading' && (
            <div style={{ color: C.muted, fontSize: 13, padding: '4px 0' }}>Loading…</div>
          )}

          {phase === 'idle' && (
            <button onClick={startSpin} style={{
              width: '100%', padding: '15px 0', borderRadius: 14, border: 'none',
              background: `linear-gradient(135deg, #f59e0b 0%, #d97706 100%)`,
              color: '#0a0e1a', fontWeight: 900, fontSize: 17, cursor: 'pointer',
              letterSpacing: '0.03em',
              boxShadow: '0 6px 24px rgba(245,158,11,0.45)',
              transition: 'transform 0.1s',
            }}>
              🎰  SPIN NOW
            </button>
          )}

          {phase === 'spinning' && (
            <div style={{
              color: C.amber, fontWeight: 700, fontSize: 15,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
                border: `2px solid ${C.amber}`, borderTopColor: 'transparent',
                animation: 'spin360 0.7s linear infinite',
              }} />
              Spinning…
            </div>
          )}

          {phase === 'result' && result && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: '100%', borderRadius: 16, padding: '18px 20px', textAlign: 'center',
                background: 'linear-gradient(135deg, rgba(52,211,153,0.1), rgba(16,185,129,0.05))',
                border: '1.5px solid rgba(52,211,153,0.25)',
              }}>
                <div style={{ fontSize: 40, lineHeight: 1 }}>🎉</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 8, fontWeight: 600 }}>YOU WON</div>
                <div style={{
                  color: C.green, fontWeight: 900, fontSize: 36, lineHeight: 1.1,
                  fontFamily: '"Space Grotesk", sans-serif', marginTop: 4,
                }}>
                  {result.label}
                </div>
                <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>Credited to your play wallet</div>
              </div>
              <button onClick={onClose} style={{
                width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
                background: C.amber, color: '#0a0e1a', fontWeight: 800, fontSize: 15, cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(245,158,11,0.35)',
              }}>
                Let's play! 🎱
              </button>
            </div>
          )}

          {phase === 'error' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 12, padding: '12px 16px',
                color: '#f87171', textAlign: 'center', fontSize: 13, width: '100%',
              }}>{error}</div>
              <button onClick={loadSpin} style={{
                width: '100%', padding: '13px 0', borderRadius: 14, border: 'none',
                background: `linear-gradient(135deg, ${C.amber}, #d97706)`,
                color: '#0a0e1a', fontWeight: 800, fontSize: 14, cursor: 'pointer',
              }}>
                Try Again
              </button>
              <button onClick={onClose} style={{
                width: '100%', padding: '11px 0', borderRadius: 14,
                border: `1px solid ${C.border}`, background: 'transparent',
                color: C.muted, fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}>
                Close
              </button>
            </div>
          )}

        </div>
      </div>

      <style>{`
        @keyframes spin360 { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
