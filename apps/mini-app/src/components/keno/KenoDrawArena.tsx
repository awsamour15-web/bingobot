/**
 * KenoDrawArena — Ball animation:
 *  Phase 1 "pop":  New ball appears BIG in centre with overshoot (scale 0→1.4→1, ~600ms)
 *  Phase 2 "fly":  Ball shrinks + slides up into its tray slot  (~400ms CSS transition)
 *  Phase 3 "rest": Ball sits in tray, next ball can start
 *
 * No layoutId / shared-layout — uses a plain state machine + CSS animations.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  drawnNumbers: number[];
  currentBall: number | null;
  userPickedNumbers: number[];
  onGoToBetting?: (() => void) | undefined;
}

type Phase = 'pop' | 'fly' | 'rest';

interface BallState {
  num: number;
  phase: Phase;
}

const POP_MS  = 650;   // big centre display
const FLY_MS  = 420;   // shrink + slide into tray

// 3-D ball style helpers
function ballBg(isHit: boolean) {
  return isHit
    ? 'radial-gradient(circle at 38% 30%, #2a7a58 0%, #0d3828 50%, #041c14 100%)'
    : 'radial-gradient(circle at 38% 28%, #3a5068 0%, #0d1e2e 55%, #060e18 100%)';
}
function ballBorder(isHit: boolean) {
  return isHit ? '1.5px solid rgba(30,224,104,0.7)' : '1px solid rgba(80,120,160,0.25)';
}
function ballShadow(isHit: boolean, big = false) {
  const inner = 'inset 2px 2px 4px rgba(120,180,220,0.18), inset -2px -2px 5px rgba(0,0,0,0.75)';
  if (big) {
    return isHit
      ? `0 0 32px rgba(34,197,94,0.75), 0 8px 20px rgba(0,0,0,0.85), ${inner}`
      : `0 0 24px rgba(60,110,200,0.4),  0 8px 20px rgba(0,0,0,0.85), ${inner}`;
  }
  return isHit
    ? `0 0 10px rgba(34,197,94,0.7), ${inner}`
    : `0 2px 6px rgba(0,0,0,0.6), ${inner}`;
}

export function KenoDrawArena({ drawnNumbers, currentBall, userPickedNumbers, onGoToBetting }: Props) {
  const pickedSet = useMemo(() => new Set(userPickedNumbers), [userPickedNumbers]);
  const count = drawnNumbers.length;

  // State machine: which ball is animating and in which phase
  const [activeBall, setActiveBall] = useState<BallState | null>(null);
  // Balls already settled into tray slots
  const [trayBalls, setTrayBalls] = useState<number[]>([]);

  const prevCountRef = useRef(0);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When a new ball arrives, run the pop → fly → rest sequence
  useEffect(() => {
    if (drawnNumbers.length <= prevCountRef.current) {
      prevCountRef.current = drawnNumbers.length;
      return;
    }
    prevCountRef.current = drawnNumbers.length;

    const newBall = drawnNumbers[drawnNumbers.length - 1];
    if (newBall === undefined) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    // Phase 1: pop
    setActiveBall({ num: newBall, phase: 'pop' });

    // Phase 2: fly after POP_MS
    timerRef.current = setTimeout(() => {
      setActiveBall({ num: newBall, phase: 'fly' });

      // Phase 3: rest — move into tray after FLY_MS
      timerRef.current = setTimeout(() => {
        setActiveBall(null);
        setTrayBalls(prev => [...prev, newBall]);
      }, FLY_MS);
    }, POP_MS);
  }, [drawnNumbers]);

  // On round reset (drawnNumbers clears) reset tray
  useEffect(() => {
    if (drawnNumbers.length === 0) {
      setTrayBalls([]);
      setActiveBall(null);
      prevCountRef.current = 0;
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  }, [drawnNumbers.length]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const trayRow1 = trayBalls.slice(0, 10);
  const trayRow2 = trayBalls.slice(10, 20);

  // Centre display: active ball num, or last drawn if nothing animating, or null
  const showCentre = activeBall !== null;
  const centreNum  = activeBall?.num ?? null;
  const isPopping  = activeBall?.phase === 'pop';
  const isFlying   = activeBall?.phase === 'fly';
  const isHitCentre = centreNum !== null && pickedSet.has(centreNum);

  return (
    <div style={{
      width: '100%', background: 'rgba(8,18,21,0.97)',
      border: '1px solid rgba(30,224,104,0.15)', borderRadius: 16,
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '12px 10px', minHeight: 220,
    }}>

      {/* ── Radar rings ── */}
      {[80, 140, 210, 280].map(r => (
        <div key={r} style={{
          position: 'absolute', left: '50%', top: '50%', width: r, height: r,
          borderRadius: '50%', border: '1px solid rgba(30,224,104,0.08)',
          transform: 'translate(-50%,-50%)', pointerEvents: 'none',
        }} />
      ))}

      {/* ── Radar sweep (wrapper keeps centring, inner rotates only) ── */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, pointerEvents: 'none' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
          style={{
            width: 280, height: 280, marginLeft: -140, marginTop: -140,
            borderRadius: '50%',
            background: 'conic-gradient(from 0deg, rgba(30,224,104,0.11) 0deg, transparent 55deg, transparent 360deg)',
          }}
        />
      </div>

      {/* ── Header ── */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {onGoToBetting ? (
          <button onClick={onGoToBetting} style={{
            padding: '4px 10px', borderRadius: 8,
            background: 'rgba(17,34,38,0.9)', border: '1px solid rgba(30,224,104,0.3)',
            color: '#1ee068', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>
            Betting Board
          </button>
        ) : <div />}
        <div style={{ display: 'flex', alignItems: 'center', fontFamily: 'monospace', fontSize: 16, fontWeight: 900, letterSpacing: '0.1em' }}>
          <AnimatePresence mode="popLayout">
            <motion.span
              key={count}
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 10, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 26 }}
              style={{ color: '#fff', display: 'inline-block', minWidth: 22, textAlign: 'right' }}
            >
              {count}
            </motion.span>
          </AnimatePresence>
          <span style={{ color: '#1ee068', margin: '0 4px' }}>/</span>
          <span style={{ color: '#e2e8f0' }}>20</span>
        </div>
      </div>

      {/* ── Centre stage ── */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 90 }}>

        {/* Sonar ripple */}
        <AnimatePresence>
          {isPopping && centreNum !== null && (
            <motion.div
              key={`sonar-${centreNum}`}
              initial={{ scale: 0.3, opacity: 0.8 }}
              animate={{ scale: 3.2, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                width: 68, height: 68,
                borderRadius: '50%',
                border: `2px solid ${isHitCentre ? 'rgba(34,197,94,0.65)' : 'rgba(34,180,238,0.55)'}`,
                pointerEvents: 'none',
              }}
            />
          )}
        </AnimatePresence>

        {/* Centre ball */}
        <AnimatePresence>
          {showCentre && centreNum !== null && (
            <motion.div
              key={`centre-${centreNum}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: isPopping ? [0, 1.4, 1.1] : [1.1, 0.4],
                opacity: 1,
              }}
              exit={{ scale: 0.2, opacity: 0 }}
              transition={
                isPopping
                  ? { duration: POP_MS / 1000, times: [0, 0.55, 1], ease: 'easeOut' }
                  : { duration: FLY_MS / 1000, ease: 'easeIn' }
              }
              style={{
                width: 72, height: 72, borderRadius: '50%',
                background: ballBg(isHitCentre),
                border: isHitCentre ? '2px solid rgba(30,224,104,0.7)' : '2px solid rgba(80,130,170,0.4)',
                boxShadow: ballShadow(isHitCentre, true),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 900,
                color: isHitCentre ? '#5effa0' : '#d8eeff',
                fontFamily: 'monospace', letterSpacing: '-0.5px',
                position: 'relative',
              }}
            >
              {/* gloss */}
              <div style={{ position: 'absolute', top: 9, left: 14, width: 26, height: 12, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', transform: 'rotate(-22deg)', pointerEvents: 'none' }} />
              {centreNum}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Idle state: faint circle hint when no ball */}
        {!showCentre && (
          <div style={{ width: 72, height: 72, borderRadius: '50%', border: '1px dashed rgba(30,224,104,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'rgba(30,224,104,0.2)', fontSize: 22 }}>?</span>
          </div>
        )}
      </div>

      {/* ── Ball trays ── */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <TrayRow balls={trayRow2} pickedSet={pickedSet} />
        <TrayRow balls={trayRow1} pickedSet={pickedSet} />
      </div>
    </div>
  );
}

// ── TrayRow ───────────────────────────────────────────────────────────────────

function TrayRow({ balls, pickedSet }: { balls: number[]; pickedSet: Set<number> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3 }}>
      {Array.from({ length: 10 }).map((_, idx) => {
        const num = balls[idx];
        if (num === undefined) {
          return (
            <div key={`e-${idx}`} style={{
              height: 28, borderRadius: '50%',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
            }} />
          );
        }
        const isHit = pickedSet.has(num);
        return (
          <motion.div
            key={num}
            initial={{ scale: 0.3, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 460, damping: 20 }}
            style={{
              height: 28, borderRadius: '50%',
              background: ballBg(isHit),
              boxShadow: ballShadow(isHit),
              border: ballBorder(isHit),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800,
              color: isHit ? '#5effa0' : '#d0e8f8',
              fontFamily: 'monospace',
              position: 'relative',
            }}
          >
            {isHit && (
              <div style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: '50%', background: '#1ee068', border: '1px solid #a7f3d0', boxShadow: '0 0 5px #1ee068' }} />
            )}
            {/* gloss */}
            <div style={{ position: 'absolute', top: 3, left: 5, width: 9, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', transform: 'rotate(-20deg)', pointerEvents: 'none' }} />
            {num}
          </motion.div>
        );
      })}
    </div>
  );
}
