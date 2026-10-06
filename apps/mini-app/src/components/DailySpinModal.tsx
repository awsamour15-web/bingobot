import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { getDailySpinStatus, claimDailySpin, type SpinPrize } from '../lib/api';
import { initAuth } from '../lib/auth';

const C = {
  bg:      'rgba(0,0,0,0.88)',
  surface: '#0d1b2e',
  border:  'rgba(255,255,255,0.08)',
  amber:   '#f59e0b',
  green:   '#34d399',
  text:    '#f1f5f9',
  muted:   '#64748b',
};

const SLICE_COLORS = [
  '#f59e0b', '#10b981', '#3b82f6', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
];
const SEGMENT_COUNT = 8;
const SPIN_DURATION = 3500;

// Bonus amounts shown on each slice — multiples around the base prize
// These are decorative; the actual prize comes from the server.
const SLICE_AMOUNTS = [5, 10, 3, 20, 7, 15, 2, 25];

function drawWheel(canvas: HTMLCanvasElement, angle: number, prize: SpinPrize | null) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const r = cx - 8;
  const sliceAngle = (2 * Math.PI) / SEGMENT_COUNT;

  ctx.clearRect(0, 0, size, size);

  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const start = angle + i * sliceAngle;
    const end = start + sliceAngle;
    const mid = start + sliceAngle / 2;

    // Slice fill
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = SLICE_COLORS[i % SLICE_COLORS.length] as string;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Number label on slice
    const labelR = r * 0.64;
    const lx = cx + Math.cos(mid) * labelR;
    const ly = cy + Math.sin(mid) * labelR;

    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(mid + Math.PI / 2);

    const fontSize = size < 280 ? 11 : 13;
    ctx.font = `900 ${fontSize}px DM Sans, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // White shadow for readability
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(`${SLICE_AMOUNTS[i]}`, 1, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${SLICE_AMOUNTS[i]}`, 0, 0);

    // Small "ETB" sub-label
    ctx.font = `700 ${fontSize - 3}px DM Sans, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('ETB', 0, fontSize);

    ctx.restore();
  }

  // Center circle
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, 2 * Math.PI);
  ctx.fillStyle = '#0a0e1a';
  ctx.fill();
  ctx.strokeStyle = C.amber;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Center content
  if (prize) {
    // Show won amount after spin
    ctx.fillStyle = C.amber;
    ctx.font = `900 ${size < 280 ? 9 : 10}px DM Sans, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(prize.label, cx, cy);
  } else {
    ctx.font = `${size < 280 ? 16 : 18}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎯', cx, cy);
  }
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

interface Props { onClose: () => void }

export default function DailySpinModal({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const angleRef = useRef<number>(0);

  const [phase, setPhase] = useState<'loading' | 'idle' | 'spinning' | 'result' | 'error'>('loading');
  const [result, setResult] = useState<SpinPrize | null>(null);
  const [error, setError] = useState('');

  const redraw = useCallback((angle: number, showPrize: SpinPrize | null = null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawWheel(canvas, angle, showPrize);
  }, []);

  const loadSpin = useCallback(() => {
    setPhase('loading');
    setError('');
    initAuth()
      .then(() => getDailySpinStatus())
      .then(status => {
        if (!status.canSpin) { onClose(); return; }
        setPhase('idle');
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[DailySpin] load failed:', msg, err);
        setError(msg || 'Could not load spin. Try again later.');
        setPhase('error');
      });
  }, [onClose]);

  useEffect(() => { loadSpin(); }, [loadSpin]);

  useLayoutEffect(() => { redraw(angleRef.current); }, [redraw]);

  useEffect(() => {
    if (phase !== 'loading') redraw(angleRef.current);
  }, [phase, redraw]);

  const startSpin = useCallback(async () => {
    if (phase !== 'idle') return;
    setPhase('spinning');

    let claimed: SpinPrize;
    try {
      const res = await claimDailySpin();
      claimed = res.prize;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Spin failed';
      setError(msg.toLowerCase().includes('already') ? 'You already spun today. Come back tomorrow! 🌅' : msg);
      setPhase('error');
      return;
    }

    const from = angleRef.current;
    const target = from + 5 * 2 * Math.PI + Math.PI * 1.5;
    const start = performance.now();

    const animate = (now: number) => {
      const t = Math.min((now - start) / SPIN_DURATION, 1);
      const angle = from + (target - from) * easeOut(t);
      angleRef.current = angle;
      redraw(angle, t === 1 ? claimed : null);
      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setResult(claimed);
        setPhase('result');
      }
    };

    animRef.current = requestAnimationFrame(animate);
  }, [phase, redraw]);

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  const size = Math.min(window.innerWidth - 48, 300);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: C.bg, backdropFilter: 'blur(6px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px',
    }}>
      <div style={{
        width: '100%', maxWidth: 360,
        background: C.surface, borderRadius: 24,
        border: `1px solid ${C.border}`,
        padding: '28px 20px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 4 }}>🎡</div>
          <div style={{ color: C.amber, fontWeight: 900, fontSize: 22, fontFamily: 'Space Grotesk, sans-serif' }}>
            Daily Lucky Spin
          </div>
          {phase === 'idle' && (
            <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
              Spin once per day for free bonus credits
            </div>
          )}
        </div>

        {/* Wheel */}
        <div style={{ position: 'relative', width: size, height: size }}>
          <div style={{
            position: 'absolute', top: -10, left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '10px solid transparent',
            borderRight: '10px solid transparent',
            borderTop: `22px solid ${C.amber}`,
            zIndex: 2,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
          }} />
          <canvas
            ref={canvasRef}
            width={size}
            height={size}
            style={{ borderRadius: '50%', display: 'block', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}
          />
        </div>

        {phase === 'loading' && (
          <div style={{ color: C.muted, fontSize: 14 }}>Loading…</div>
        )}

        {phase === 'idle' && (
          <button
            onClick={startSpin}
            style={{
              width: '100%', padding: '16px 0', borderRadius: 14, border: 'none',
              background: `linear-gradient(135deg, ${C.amber}, #d97706)`,
              color: '#0a0e1a', fontWeight: 900, fontSize: 18, cursor: 'pointer',
              boxShadow: `0 4px 20px rgba(245,158,11,0.4)`,
            }}
          >
            🎰 SPIN NOW!
          </button>
        )}

        {phase === 'spinning' && (
          <div style={{ color: C.amber, fontWeight: 700, fontSize: 16 }}>Spinning…</div>
        )}

        {phase === 'result' && result && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{
              background: 'rgba(52,211,153,0.12)', border: '1.5px solid rgba(52,211,153,0.3)',
              borderRadius: 16, padding: '16px 24px', textAlign: 'center', width: '100%',
            }}>
              <div style={{ fontSize: 36 }}>🎉</div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 15, marginTop: 4 }}>You won</div>
              <div style={{ color: C.green, fontWeight: 900, fontSize: 30, fontFamily: 'Space Grotesk, sans-serif' }}>
                {result.label}
              </div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Added to your play wallet</div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
                background: C.amber, color: '#0a0e1a', fontWeight: 800, fontSize: 16, cursor: 'pointer',
              }}
            >
              Awesome, let's play!
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ color: '#f87171', textAlign: 'center', fontSize: 14 }}>{error}</div>
            <button
              onClick={loadSpin}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
                background: `linear-gradient(135deg, ${C.amber}, #d97706)`,
                color: '#0a0e1a', fontWeight: 800, fontSize: 15, cursor: 'pointer',
              }}
            >
              Retry
            </button>
            <button
              onClick={onClose}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 14,
                border: `1px solid ${C.border}`, background: C.surface,
                color: C.muted, fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
