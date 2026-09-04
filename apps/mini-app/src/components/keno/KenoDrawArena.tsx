/**
 * KenoDrawArena
 *
 * On mount: initialDrawnNumbers are placed in the tray instantly (no animation) —
 *           this handles the refresh/rejoin case where a draw is already in progress.
 *
 * Live balls: each new number in drawnNumbers triggers pop → fly → settle animation.
 *   Phase 1 "pop":  Ball appears BIG in centre (scale 0→1.4→1, POP_MS)
 *   Phase 2 "fly":  Ball shrinks out of centre (FLY_MS), tray ball springs in
 *   Phase 3 "rest": Ball is in tray, counter updates
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  drawnNumbers: number[];          // live-updated list from socket
  initialDrawnNumbers?: number[] | undefined;  // snapshot on mount (from REST), shown without animation
  currentBall: number | null;
  userPickedNumbers: number[];
  onGoToBetting?: (() => void) | undefined;
}

type Phase = 'pop' | 'fly';

interface ActiveBall {
  num: number;
  phase: Phase;
}

const POP_MS = 700;
const FLY_MS = 400;

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
      : `0 0 24px rgba(60,110,200,0.4), 0 8px 20px rgba(0,0,0,0.85), ${inner}`;
  }
  return isHit
    ? `0 0 10px rgba(34,197,94,0.7), ${inner}`
    : `0 2px 6px rgba(0,0,0,0.6), ${inner}`;
}

export function KenoDrawArena({
  drawnNumbers,
  initialDrawnNumbers,
  currentBall,
  userPickedNumbers,
  onGoToBetting,
}: Props) {
  const pickedSet = useMemo(() => new Set(userPickedNumbers), [userPickedNumbers]);

  // trayBalls = balls already settled in slots (shown without animation on mount)
  const [trayBalls, setTrayBalls] = useState<number[]>(() => initialDrawnNumbers ?? []);
  // activeBall = the one currently animating in centre
  const [activeBall, setActiveBall] = useState<ActiveBall | null>(null);

  // Track how many numbers we've already processed so we only animate new arrivals
  const processedCountRef = useRef(initialDrawnNumbers?.length ?? 0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When initialDrawnNumbers changes (e.g. after first syncState resolves)
  // silently hydrate the tray for any balls we haven't processed yet
  useEffect(() => {
    if (!initialDrawnNumbers || initialDrawnNumbers.length === 0) return;
    setTrayBalls(initialDrawnNumbers);
    processedCountRef.current = Math.max(processedCountRef.current, initialDrawnNumbers.length);
  }, [initialDrawnNumbers]);

  // Animate only NEW balls (those beyond what we've already processed)
  useEffect(() => {
    const newCount = drawnNumbers.length;
    if (newCount <= processedCountRef.current) return;

    const newBall = drawnNumbers[newCount - 1];
    if (newBall === undefined) return;

    processedCountRef.current = newCount;
    if (timerRef.current) clearTimeout(timerRef.current);

    // Phase 1: pop in centre
    setActiveBall({ num: newBall, phase: 'pop' });

    // Phase 2: fly out after POP_MS
    timerRef.current = setTimeout(() => {
      setActiveBall({ num: newBall, phase: 'fly' });

      // Settle into tray after FLY_MS
      timerRef.current = setTimeout(() => {
        setActiveBall(null);
        setTrayBalls(prev => prev.includes(newBall) ? prev : [...prev, newBall]);
      }, FLY_MS);
    }, POP_MS);
  }, [drawnNumbers]);

  // Reset when a new round starts (drawnNumbers emptied)
  useEffect(() => {
    if (drawnNumbers.length === 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setTrayBalls([]);
      setActiveBall(null);
      processedCountRef.current = 0;
    }
  }, [drawnNumbers.length]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const count = drawnNumbers.length;
  const trayRow1 = trayBalls.slice(0, 10);
  const trayRow2 = trayBalls.slice(10, 20);

  const isPopping   = activeBall?.phase === 'pop';
  const centreNum   = activeBall?.num ?? null;
  const isHitCentre = centreNum !== null && pickedSet.has(centreNum);

  return (
    <div style={{
      width: '100%', background: 'rgba(8,18,21,0.97)',
      border: '1px solid rgba(30,224,104,0.15)', borderRadius: 16,
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '12px 10px', minHeight: 220,
    }}>

      {/* Radar rings */}
      {[80, 140, 210, 280].map(r => (
        <div key={r} style={{
          position: 'absolute', left: '50%', top: '50%', width: r, height: r,
          borderRadius: '50%', border: '1px solid rgba(30,224,104,0.08)',
          transform: 'translate(-50%,-50%)', pointerEvents: 'none',
        }} />
      ))}

      {/* Rotating radar sweep */}
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

      {/* Header: toggle + counter */}
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

      {/* Centre stage */}
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
                position: 'absolute', width: 68, height: 68, borderRadius: '50%',
                border: `2px solid ${isHitCentre ? 'rgba(34,197,94,0.65)' : 'rgba(34,180,238,0.5)'}`,
                pointerEvents: 'none',
              }}
            />
          )}
        </AnimatePresence>

        {/* Centre ball */}
        <AnimatePresence>
          {activeBall !== null && centreNum !== null && (
            <motion.div
              key={`centre-${centreNum}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={isPopping ? { scale: [0, 1.4, 1.1], opacity: 1 } : { scale: 0.3, opacity: 0 }}
              exit={{ scale: 0, opacity: 0 }}
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
              <div style={{ position: 'absolute', top: 9, left: 14, width: 26, height: 12, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', transform: 'rotate(-22deg)', pointerEvents: 'none' }} />
              {centreNum}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Idle hint */}
        {activeBall === null && (
          <div style={{ width: 72, height: 72, borderRadius: '50%', border: '1px dashed rgba(30,224,104,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'rgba(30,224,104,0.2)', fontSize: 22 }}>?</span>
          </div>
        )}
      </div>

      {/* Ball trays */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <TrayRow balls={trayRow2} pickedSet={pickedSet} animate={false} />
        <TrayRow balls={trayRow1} pickedSet={pickedSet} animate={false} />
      </div>
    </div>
  );
}

// ── TrayRow ───────────────────────────────────────────────────────────────────

function TrayRow({ balls, pickedSet, animate }: { balls: number[]; pickedSet: Set<number>; animate: boolean }) {
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
        const ballEl = (
          <div
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
            <div style={{ position: 'absolute', top: 3, left: 5, width: 9, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', transform: 'rotate(-20deg)', pointerEvents: 'none' }} />
            {num}
          </div>
        );

        if (!animate) {
          return <div key={num}>{ballEl}</div>;
        }

        return (
          <motion.div
            key={num}
            initial={{ scale: 0.3, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 460, damping: 20 }}
          >
            {ballEl}
          </motion.div>
        );
      })}
    </div>
  );
}
