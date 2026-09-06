/**
 * KenoDrawArena — clean animation, no sound.
 *
 * Per-ball sequence:
 *  1. Pop    (650ms) — ball appears big in centre, scale 0→1 with spring overshoot
 *  2. Shrink (350ms) — centre ball fades out
 *  3. Drop   —        tray slot spring-drops in when ball settles
 *
 * On mount / refresh: initialDrawnNumbers fills the tray instantly, no animation.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  drawnNumbers: number[];
  initialDrawnNumbers?: number[] | undefined;
  currentBall: number | null;
  userPickedNumbers: number[];
  onGoToBetting?: (() => void) | undefined;
}

const POP_MS   = 650;
const SHRINK_MS = 300;

// ── Ball visual helpers ────────────────────────────────────────────────────────
function bg(hit: boolean, big = false) {
  if (hit) return big
    ? 'radial-gradient(circle at 36% 28%, #4ae080 0%, #0e5a30 45%, #051820 100%)'
    : 'radial-gradient(circle at 36% 28%, #3a8a68 0%, #0e4830 50%, #051c14 100%)';
  return big
    ? 'radial-gradient(circle at 36% 28%, #5a7898 0%, #142248 48%, #0a121a 100%)'
    : 'radial-gradient(circle at 36% 28%, #3a5a78 0%, #0f1f38 52%, #0a121a 100%)';
}
function border(hit: boolean, big = false) {
  return hit
    ? `${big ? 2 : 1.5}px solid rgba(30,240,104,${big ? 0.9 : 0.75})`
    : `${big ? 2 : 1}px solid rgba(100,150,200,${big ? 0.5 : 0.3})`;
}
function shadow(hit: boolean, big = false) {
  const base = 'inset 2px 2px 5px rgba(160,210,255,0.2), inset -2px -2px 6px rgba(0,0,0,0.8)';
  if (big) return hit
    ? `0 0 40px rgba(30,240,104,0.9), 0 8px 24px rgba(0,0,0,0.95), ${base}`
    : `0 0 30px rgba(80,150,240,0.55), 0 8px 24px rgba(0,0,0,0.95), ${base}`;
  return hit
    ? `0 0 12px rgba(30,240,104,0.75), ${base}`
    : `0 2px 8px rgba(0,0,0,0.75), ${base}`;
}

export function KenoDrawArena({ drawnNumbers, initialDrawnNumbers, currentBall, userPickedNumbers, onGoToBetting }: Props) {
  const pickedSet = useMemo(() => new Set(userPickedNumbers), [userPickedNumbers]);

  const [trayBalls,   setTrayBalls]   = useState<number[]>(() => initialDrawnNumbers ?? []);
  const [centreNum,   setCentreNum]   = useState<number | null>(null);
  const [centrePhase, setCentrePhase] = useState<'pop' | 'shrink' | 'none'>('none');

  const processedRef = useRef(initialDrawnNumbers?.length ?? 0);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef   = useRef<number[]>([]);
  const animatingRef = useRef(false);
  const runNextRef   = useRef<() => void>(() => {});

  // Hydrate tray silently when initial snapshot arrives
  useEffect(() => {
    if (!initialDrawnNumbers?.length) return;
    setTrayBalls(initialDrawnNumbers);
    processedRef.current = Math.max(processedRef.current, initialDrawnNumbers.length);
  }, [initialDrawnNumbers]);

  // Animate every new ball in order, including numbers received during a reconnect.
  runNextRef.current = () => {
    if (animatingRef.current || pendingRef.current.length === 0) return;
    const ball = pendingRef.current.shift();
    if (ball === undefined) return;
    animatingRef.current = true;

    setCentreNum(ball);
    setCentrePhase('pop');

    timerRef.current = setTimeout(() => {
      setCentrePhase('shrink');
      timerRef.current = setTimeout(() => {
        setCentrePhase('none');
        setCentreNum(null);
        setTrayBalls(prev => prev.includes(ball) ? prev : [...prev, ball]);
        animatingRef.current = false;
        runNextRef.current();
      }, SHRINK_MS);
    }, POP_MS);
  };

  useEffect(() => {
    if (drawnNumbers.length <= processedRef.current) return;
    pendingRef.current.push(...drawnNumbers.slice(processedRef.current));
    processedRef.current = drawnNumbers.length;
    runNextRef.current();
  }, [drawnNumbers]);

  // Round reset
  useEffect(() => {
    if (drawnNumbers.length === 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setTrayBalls([]);
      setCentreNum(null);
      setCentrePhase('none');
      processedRef.current = 0;
      pendingRef.current = [];
      animatingRef.current = false;
    }
  }, [drawnNumbers.length]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const count      = drawnNumbers.length;
  const trayRow1   = trayBalls.slice(0, 10);
  const trayRow2   = trayBalls.slice(10, 20);
  const isHitCentre = centreNum !== null && pickedSet.has(centreNum);
  const showCentre  = centrePhase !== 'none' && centreNum !== null;

  return (
    <div style={{
      width: '100%', height: '100%', minHeight: 242, background: 'rgba(6,14,18,0.98)',
      border: 'none', borderRadius: 0,
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 5,
      padding: '7px 7px',
    }}>

      {/* Radar rings — subtle */}
      {[58, 98, 150, 207].map(r => (
        <div key={r} style={{
          position: 'absolute', left: '50%', top: '50%',
          width: r, height: r, borderRadius: '50%',
          border: '1px solid rgba(30,240,104,0.08)',
          transform: 'translate(-50%,-50%)', pointerEvents: 'none',
        }} />
      ))}

      {/* Slow rotating sweep */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, pointerEvents: 'none' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          style={{
            width: 207, height: 207, marginLeft: -103.5, marginTop: -103.5,
            borderRadius: '50%',
            background: 'conic-gradient(from 0deg, rgba(30,240,104,0.08) 0deg, transparent 50deg, transparent 360deg)',
          }}
        />
      </div>

      {/* Header */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 2 }}>
        {onGoToBetting ? (
          <button onClick={onGoToBetting} style={{
            padding: '3px 8px', borderRadius: 6,
            background: 'rgba(14,26,30,0.95)', border: '1px solid rgba(30,240,104,0.3)',
            color: '#1ee068', fontSize: 9, fontWeight: 600, cursor: 'pointer',
          }}>
            ← Bet
          </button>
        ) : <div />}

        <div style={{ display: 'flex', alignItems: 'center', fontFamily: 'monospace', fontSize: 12, fontWeight: 800, gap: 1 }}>
          <AnimatePresence mode="popLayout">
            <motion.span
              key={count}
              initial={{ y: -6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 6, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 600, damping: 30 }}
              style={{ color: '#fff', display: 'inline-block', minWidth: 14, textAlign: 'right' }}
            >
              {count}
            </motion.span>
          </AnimatePresence>
          <span style={{ color: 'rgba(30,240,104,0.7)', margin: '0 2px', fontWeight: 400 }}>/</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>20</span>
        </div>
      </div>

      {/* Centre stage */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 0 }}>

        {/* Centre ball */}
        <AnimatePresence>
          {showCentre && (
            <motion.div
              key={`ball-centre-${centreNum}`}
              layoutId={`keno-ball-${centreNum}`}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={centrePhase === 'pop'
                ? { scale: 1, opacity: 1 }
                : { scale: 0.75, opacity: 0, y: 52 }
              }
              exit={{ scale: 0, opacity: 0 }}
              transition={centrePhase === 'pop'
                ? { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
                : { duration: SHRINK_MS / 1000, ease: [0.4, 0, 0.2, 1] }
              }
              style={{
                width: 60, height: 60, borderRadius: '50%',
                background: bg(isHitCentre, true),
                border: border(isHitCentre, true),
                boxShadow: shadow(isHitCentre, true),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 25, fontWeight: 900,
                color: isHitCentre ? '#7affc0' : '#daeeff',
                fontFamily: 'monospace', letterSpacing: '-0.35px',
                position: 'relative',
              }}
            >
              {/* glass gloss */}
              <div style={{ position: 'absolute', top: 8, left: 12, width: 20, height: 10, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', transform: 'rotate(-22deg)', pointerEvents: 'none' }} />
              {centreNum}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Waiting hint */}
        {!showCentre && (
          <div style={{ width: 60, height: 60, borderRadius: '50%', border: '1px dashed rgba(30,240,104,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
            <span style={{ color: 'rgba(30,240,104,0.22)', fontSize: 20 }}>◎</span>
          </div>
        )}
      </div>

      {/* Ball trays */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
        <TrayRow balls={trayRow2} pickedSet={pickedSet} />
        <TrayRow balls={trayRow1} pickedSet={pickedSet} />
      </div>
    </div>
  );
}

// ── TrayRow ───────────────────────────────────────────────────────────────────

function TrayRow({ balls, pickedSet }: { balls: number[]; pickedSet: Set<number> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2.3 }}>
      {Array.from({ length: 10 }).map((_, idx) => {
        const num = balls[idx];

        if (num === undefined) {
          return (
            <div key={`slot-${idx}`} style={{
              height: 28, borderRadius: '50%',
              background: 'rgba(255,255,255,0.015)',
              border: '1px solid rgba(255,255,255,0.04)',
            }} />
          );
        }

        const isHit = pickedSet.has(num);

        return (
          <motion.div
            key={`tray-${num}`}
            layoutId={`keno-ball-${num}`}
            initial={{ scale: 0.75, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            style={{
              height: 28, borderRadius: '50%',
              background: bg(isHit),
              boxShadow: shadow(isHit),
              border: border(isHit),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800,
              color: isHit ? '#6effa8' : '#c8e4f8',
              fontFamily: 'monospace',
              position: 'relative',
            }}
          >
            {/* hit dot */}
            {isHit && (
              <div style={{
                position: 'absolute', top: -2, right: -2,
                width: 6, height: 6, borderRadius: '50%',
                background: '#1ee068', border: '1px solid rgba(167,243,208,0.9)',
                boxShadow: '0 0 6px rgba(30,240,104,1)',
              }} />
            )}
            {/* gloss */}
            <div style={{ position: 'absolute', top: 2.5, left: 4.5, width: 8, height: 3.5, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', transform: 'rotate(-18deg)', pointerEvents: 'none' }} />
            {num}
          </motion.div>
        );
      })}
    </div>
  );
}
