/**
 * KenoDrawArena
 *
 * Animation flow:
 *  1. New ball number appears in the centre "stage" — pops in big (scale 0 → 1.3 → 1)
 *  2. After a short hold the ball shrinks and flies into its grid slot using
 *     Framer Motion's shared layoutId so it smoothly transitions position.
 *  3. Once settled it stays in place; hit balls glow green.
 */

import { useMemo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  drawnNumbers: number[];
  currentBall: number | null;
  userPickedNumbers: number[];
  onGoToBetting?: (() => void) | undefined;
}

const STAGE_HOLD_MS = 800; // how long the ball stays large in the centre

export function KenoDrawArena({ drawnNumbers, currentBall, userPickedNumbers, onGoToBetting }: Props) {
  const pickedSet = useMemo(() => new Set(userPickedNumbers), [userPickedNumbers]);

  // Which ball is currently "staged" (popped big in centre), null when settled
  const [stagedBall, setStagedBall] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDrawnLen = useRef(drawnNumbers.length);

  useEffect(() => {
    if (drawnNumbers.length > prevDrawnLen.current) {
      const newBall = drawnNumbers[drawnNumbers.length - 1];
      if (newBall !== undefined) {
        // Show the ball staged in centre
        setStagedBall(newBall);
        if (timerRef.current) clearTimeout(timerRef.current);
        // After hold, clear staged so the ball settles into tray
        timerRef.current = setTimeout(() => setStagedBall(null), STAGE_HOLD_MS);
      }
    }
    prevDrawnLen.current = drawnNumbers.length;
  }, [drawnNumbers]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Balls that are already settled (all drawn except the one currently staged)
  const settledNumbers = useMemo(
    () => drawnNumbers.filter(n => n !== stagedBall),
    [drawnNumbers, stagedBall],
  );

  const row1 = settledNumbers.slice(0, 10);
  const row2 = settledNumbers.slice(10, 20);
  const count = drawnNumbers.length;

  // Display in centre: staged ball > currentBall > last drawn
  const centerNum = stagedBall ?? currentBall ?? drawnNumbers[drawnNumbers.length - 1] ?? null;

  return (
    <div style={{
      width: '100%',
      background: 'rgba(8,18,21,0.97)',
      border: '1px solid rgba(30,224,104,0.15)',
      borderRadius: 16,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: '12px 10px',
      minHeight: 220,
    }}>

      {/* ── Radar rings ───────────────────────────────────────────── */}
      {[80, 140, 210, 280].map(r => (
        <div key={r} style={{
          position: 'absolute', left: '50%', top: '50%',
          width: r, height: r, borderRadius: '50%',
          border: '1px solid rgba(30,224,104,0.09)',
          transform: 'translate(-50%,-50%)',
          pointerEvents: 'none',
        }} />
      ))}

      {/* ── Rotating radar sweep ──────────────────────────────────── */}
      {/* wrapper centres without motion touching translate */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, pointerEvents: 'none' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
          style={{
            width: 280, height: 280,
            marginLeft: -140, marginTop: -140,
            borderRadius: '50%',
            background: 'conic-gradient(from 0deg, rgba(30,224,104,0.12) 0deg, transparent 55deg, transparent 360deg)',
          }}
        />
      </div>

      {/* ── Header: toggle + counter ──────────────────────────────── */}
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

      {/* ── Centre stage ball ─────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 72 }}>

        {/* Sonar ripple keyed to each new ball */}
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, pointerEvents: 'none' }}>
          <AnimatePresence>
            {stagedBall !== null && (
              <motion.div
                key={`sonar-${stagedBall}`}
                initial={{ scale: 0.4, opacity: 0.75 }}
                animate={{ scale: 3, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
                style={{ width: 64, height: 64, marginLeft: -32, marginTop: -32, borderRadius: '50%', border: '2px solid rgba(30,224,104,0.6)' }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* The big staged ball — uses layoutId so it morphs into tray slot */}
        <AnimatePresence>
          {centerNum !== null && (
            <motion.div
              key={`stage-${centerNum}`}
              layoutId={`ball-${centerNum}`}
              initial={{ scale: 0.1, opacity: 0 }}
              animate={{ scale: [0.1, 1.35, 1], opacity: 1 }}
              exit={{ scale: 0.55, opacity: 0 }}
              transition={{ duration: 0.45, times: [0, 0.55, 1], ease: 'easeOut' }}
              style={{
                width: 68, height: 68, borderRadius: '50%',
                background: pickedSet.has(centerNum)
                  ? 'radial-gradient(circle at 38% 30%, #2a6a50 0%, #0d3828 50%, #041c14 100%)'
                  : 'radial-gradient(circle at 38% 28%, #3a5068 0%, #0d1e2e 55%, #060e18 100%)',
                border: pickedSet.has(centerNum)
                  ? '2px solid rgba(30,224,104,0.65)'
                  : '1.5px solid rgba(80,130,170,0.35)',
                boxShadow: pickedSet.has(centerNum)
                  ? '0 0 30px rgba(34,197,94,0.7), 0 6px 18px rgba(0,0,0,0.8), inset 2px 2px 6px rgba(100,240,160,0.2), inset -3px -3px 8px rgba(0,0,0,0.8)'
                  : '0 0 22px rgba(60,110,200,0.4), 0 6px 18px rgba(0,0,0,0.8), inset 2px 2px 5px rgba(120,160,200,0.25), inset -3px -3px 8px rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 900,
                color: pickedSet.has(centerNum) ? '#3dba6a' : '#d0e4f0',
                fontFamily: 'monospace', letterSpacing: '-0.5px',
                zIndex: 20, position: 'relative',
              }}
            >
              {/* glass highlight */}
              <div style={{ position: 'absolute', top: 9, left: 15, width: 24, height: 11, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', transform: 'rotate(-25deg)', pointerEvents: 'none' }} />
              {centerNum}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Ball trays ────────────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* row2: balls 11-20 */}
        <TrayRow balls={row2} startGlobalIdx={10} pickedSet={pickedSet} />
        {/* row1: balls 1-10 */}
        <TrayRow balls={row1} startGlobalIdx={0} pickedSet={pickedSet} />
      </div>
    </div>
  );
}

// ─── TrayRow ──────────────────────────────────────────────────────────────────

interface TrayRowProps {
  balls: number[];
  startGlobalIdx: number;
  pickedSet: Set<number>;
}

function TrayRow({ balls, startGlobalIdx: _start, pickedSet }: TrayRowProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3 }}>
      {Array.from({ length: 10 }).map((_, idx) => {
        const num = balls[idx];
        if (num === undefined) {
          // Empty placeholder
          return (
            <div key={`empty-${idx}`} style={{
              height: 28, borderRadius: '50%',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
            }} />
          );
        }

        const isHit = pickedSet.has(num);

        return (
          // layoutId matches the staged ball so it flies from centre to here
          <motion.div
            key={`tray-${num}`}
            layoutId={`ball-${num}`}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            style={{
              height: 28, borderRadius: '50%',
              background: isHit
                ? 'radial-gradient(circle at 38% 30%, #2a6a50 0%, #0d3828 50%, #041c14 100%)'
                : 'radial-gradient(circle at 38% 28%, #3a5068 0%, #0d1e2e 55%, #060e18 100%)',
              boxShadow: isHit
                ? '0 0 10px rgba(34,197,94,0.75), inset 2px 2px 3px rgba(100,240,160,0.15), inset -2px -2px 4px rgba(0,0,0,0.8)'
                : 'inset 2px 2px 3px rgba(120,160,200,0.2), inset -2px -2px 4px rgba(0,0,0,0.8), 0 2px 5px rgba(0,0,0,0.6)',
              border: isHit
                ? '1.5px solid rgba(30,224,104,0.7)'
                : '1px solid rgba(80,120,160,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800,
              color: isHit ? '#3dba6a' : '#d0e4f0',
              fontFamily: 'monospace',
              position: 'relative',
            }}
          >
            {isHit && (
              <div style={{
                position: 'absolute', top: -2, right: -2,
                width: 7, height: 7, borderRadius: '50%',
                background: '#1ee068', border: '1px solid #a7f3d0',
                boxShadow: '0 0 5px #1ee068',
              }} />
            )}
            {/* glass gloss */}
            <div style={{ position: 'absolute', top: 3, left: 5, width: 9, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', transform: 'rotate(-20deg)', pointerEvents: 'none' }} />
            {num}
          </motion.div>
        );
      })}
    </div>
  );
}
