import React, { useEffect, useRef, useState } from 'react';
import { doSpin } from '../lib/api';

// ── Segment config (must match backend SEGMENTS order exactly) ────────────────
const SEGMENTS = [
  { label: 'No Luck',  prize: 0,   color: '#1e293b', text: '#64748b' },
  { label: '5 ETB',    prize: 5,   color: '#1a3a2a', text: '#34d399' },
  { label: '10 ETB',   prize: 10,  color: '#1e3351', text: '#60a5fa' },
  { label: '20 ETB',   prize: 20,  color: '#2d1f54', text: '#a78bfa' },
  { label: '50 ETB',   prize: 50,  color: '#3a1f1f', text: '#f87171' },
  { label: '100 ETB',  prize: 100, color: '#3a2e00', text: '#f59e0b' },
  { label: '200 ETB',  prize: 200, color: '#1a3535', text: '#2dd4bf' },
];

const SEG_COUNT = SEGMENTS.length;
const SEG_ANGLE = 360 / SEG_COUNT; // degrees per segment

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function SpinWheelModal({ isOpen, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ label: string; prize: number; prizeType: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // rotation in degrees
  const rotRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // Draw the wheel onto canvas
  useEffect(() => {
    if (!isOpen) return;
    drawWheel(rotRef.current);
  }, [isOpen]);

  function drawWheel(rotation: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const cx = W / 2, cy = W / 2;
    const R = W / 2 - 4;

    ctx.clearRect(0, 0, W, W);

    for (let i = 0; i < SEG_COUNT; i++) {
      const startAngle = ((rotation + i * SEG_ANGLE - 90) * Math.PI) / 180;
      const endAngle = ((rotation + (i + 1) * SEG_ANGLE - 90) * Math.PI) / 180;
      const seg = SEGMENTS[i]!;

      // Slice
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(((rotation + i * SEG_ANGLE + SEG_ANGLE / 2 - 90) * Math.PI) / 180);
      ctx.textAlign = 'right';
      ctx.fillStyle = seg.text;
      ctx.font = `bold ${W < 280 ? 10 : 12}px sans-serif`;
      ctx.fillText(seg.label, R - 8, 4);
      ctx.restore();
    }

    // Center circle
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0e1a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(245,158,11,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎰', cx, cy);
  }

  async function handleSpin() {
    if (spinning || result) return;
    setError(null);
    setSpinning(true);

    let outcome: Awaited<ReturnType<typeof doSpin>>;
    try {
      outcome = await doSpin();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to spin. Try again.');
      setSpinning(false);
      return;
    }

    // Animate: spin to land on the winning segment
    // The pointer is at the top (12 o'clock). Segment i starts at i*SEG_ANGLE degrees.
    // We want segment `outcome.segmentIndex` centered under the pointer.
    const targetSegMid = outcome.segmentIndex * SEG_ANGLE + SEG_ANGLE / 2;
    // Pointer at 0 degrees (top). To center segment mid under pointer:
    // finalRotation = 360*N - targetSegMid  (N full rotations for drama)
    const N = 5;
    const finalRot = N * 360 - targetSegMid;

    const startRot = rotRef.current % 360;
    const totalDelta = finalRot + (360 - startRot);
    const duration = 4000;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      const current = startRot + totalDelta * ease;
      rotRef.current = current;
      drawWheel(current % 360);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setSpinning(false);
        setResult({ label: outcome.label, prize: outcome.prize, prizeType: outcome.prizeType });
      }
    }

    rafRef.current = requestAnimationFrame(animate);
  }

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const won = result && result.prize > 0;

  return (
    <div
      onClick={!spinning ? onClose : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 360,
          background: '#0d1425',
          borderRadius: 20,
          border: '1px solid rgba(245,158,11,0.2)',
          boxShadow: '0 0 40px rgba(245,158,11,0.1)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '20px 20px 28px',
          gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: '#f59e0b', fontWeight: 800, fontSize: 17 }}>
            🎡 Daily Spin
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#64748b', fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ color: '#94a3b8', fontSize: 13, margin: 0, textAlign: 'center' }}>
          Spin once a day for a chance to win free ETB
        </p>

        {/* Wheel + pointer */}
        <div style={{ position: 'relative', width: 260, height: 260 }}>
          {/* Pointer at top center */}
          <div style={{
            position: 'absolute', top: -6, left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '18px solid #f59e0b',
            zIndex: 2,
            filter: 'drop-shadow(0 2px 4px rgba(245,158,11,0.6))',
          }} />
          <canvas
            ref={canvasRef}
            width={260}
            height={260}
            style={{ borderRadius: '50%', display: 'block' }}
          />
        </div>

        {/* Result banner */}
        {result && (
          <div style={{
            width: '100%',
            background: won ? 'rgba(52,211,153,0.1)' : 'rgba(100,116,139,0.1)',
            border: `1px solid ${won ? 'rgba(52,211,153,0.3)' : 'rgba(100,116,139,0.2)'}`,
            borderRadius: 12,
            padding: '14px 16px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>{won ? '🎉' : '😔'}</div>
            <div style={{ color: won ? '#34d399' : '#64748b', fontWeight: 800, fontSize: 18 }}>
              {won ? `You won ${result.prize} ETB!` : 'No luck today'}
            </div>
            {won && (
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                Credited to your Play Wallet
              </div>
            )}
            {!won && (
              <div style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>
                Try again tomorrow
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ color: '#f87171', fontSize: 13, textAlign: 'center' }}>{error}</div>
        )}

        {/* Spin button */}
        {!result && (
          <button
            onClick={handleSpin}
            disabled={spinning}
            style={{
              width: '100%', padding: '14px 0',
              borderRadius: 14, border: 'none',
              background: spinning ? '#1e293b' : 'linear-gradient(135deg,#f59e0b,#f97316)',
              color: spinning ? '#64748b' : '#0a0e1a',
              fontWeight: 800, fontSize: 16,
              cursor: spinning ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s',
            }}
          >
            {spinning ? 'Spinning…' : '🎰 SPIN NOW'}
          </button>
        )}

        {result && (
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '14px 0',
              borderRadius: 14, border: '1px solid rgba(245,158,11,0.3)',
              background: 'transparent',
              color: '#f59e0b',
              fontWeight: 700, fontSize: 15,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
