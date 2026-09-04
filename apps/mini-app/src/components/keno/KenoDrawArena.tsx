import { useMemo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  drawnNumbers: number[];
  currentBall: number | null;
  userPickedNumbers: number[];
  onGoToBetting?: (() => void) | undefined;
}

// Tracks which ball index was just added so we can animate it
function useJustAdded(drawnNumbers: number[]) {
  const prevLen = useRef(drawnNumbers.length);
  const [justAddedIdx, setJustAddedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (drawnNumbers.length > prevLen.current) {
      setJustAddedIdx(drawnNumbers.length - 1);
      const t = setTimeout(() => setJustAddedIdx(null), 700);
      prevLen.current = drawnNumbers.length;
      return () => clearTimeout(t);
    }
    prevLen.current = drawnNumbers.length;
    return undefined;
  }, [drawnNumbers.length]);

  return justAddedIdx;
}

export function KenoDrawArena({ drawnNumbers, currentBall, userPickedNumbers, onGoToBetting }: Props) {
  const pickedSet = useMemo(() => new Set(userPickedNumbers), [userPickedNumbers]);
  const justAddedIdx = useJustAdded(drawnNumbers);

  const row1 = drawnNumbers.slice(0, 10);
  const row2 = drawnNumbers.slice(10, 20);
  const centerDisplay = currentBall ?? drawnNumbers[drawnNumbers.length - 1] ?? null;
  const count = drawnNumbers.length;

  return (
    <div style={{ width: '100%', background: 'rgba(8,18,21,0.97)', border: '1px solid rgba(30,224,104,0.15)', borderRadius: 16, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 10px', minHeight: 210 }}>

      {/* ── Radar rings (pure CSS, no motion) ── */}
      {[80, 130, 190, 260].map(r => (
        <div key={r} style={{ position: 'absolute', left: '50%', top: '50%', width: r, height: r, borderRadius: '50%', border: '1px solid rgba(30,224,104,0.10)', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
      ))}

      {/* ── Radar sweep: wrapper keeps translate, inner rotates ── */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, pointerEvents: 'none' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          style={{ width: 280, height: 280, marginLeft: -140, marginTop: -140, borderRadius: '50%', background: 'conic-gradient(from 0deg, rgba(30,224,104,0.13) 0deg, transparent 60deg, transparent 360deg)' }}
        />
      </div>

      {/* ── Sonar ripple on new ball ── */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, pointerEvents: 'none' }}>
        <AnimatePresence mode="popLayout">
          <motion.div
            key={`ripple-${count}`}
            initial={{ scale: 0.3, opacity: 0.8 }}
            animate={{ scale: 2.6, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            style={{ width: 80, height: 80, marginLeft: -40, marginTop: -40, borderRadius: '50%', border: '2px solid rgba(30,224,104,0.6)' }}
          />
        </AnimatePresence>
      </div>

      {/* ── Header: Betting Board toggle + counter ── */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {onGoToBetting ? (
          <button onClick={onGoToBetting} style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(17,34,38,0.9)', border: '1px solid rgba(30,224,104,0.3)', color: '#1ee068', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            Betting Board
          </button>
        ) : <div />}
        <div style={{ display: 'flex', alignItems: 'center', fontFamily: 'monospace', fontSize: 16, fontWeight: 900, letterSpacing: '0.1em' }}>
          <AnimatePresence mode="popLayout">
            <motion.span
              key={count}
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              style={{ color: '#fff', display: 'inline-block', minWidth: 20, textAlign: 'right' }}
            >
              {count}
            </motion.span>
          </AnimatePresence>
          <span style={{ color: '#1ee068', margin: '0 4px' }}>/</span>
          <span style={{ color: '#e2e8f0' }}>20</span>
        </div>
      </div>

      {/* ── Center ball ── */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, #1e3338 0%, #0d1a1d 65%, #050c0e 100%)',
          border: '1.5px solid rgba(30,224,104,0.5)',
          boxShadow: '0 0 24px rgba(30,224,104,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, fontWeight: 900, color: '#fff', fontFamily: 'monospace',
        }}>
          <AnimatePresence mode="popLayout">
            {centerDisplay !== null && (
              <motion.span
                key={centerDisplay}
                initial={{ scale: 0.15, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.3, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                style={{ display: 'inline-block', lineHeight: 1 }}
              >
                {centerDisplay}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Ball trays: row2 (11-20) then row1 (1-10) ── */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {[row2, row1].map((row, rowIdx) => (
          <div key={rowIdx} style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3 }}>
            {Array.from({ length: 10 }).map((_, idx) => {
              const globalIdx = rowIdx === 0 ? 10 + idx : idx;
              const num = row[idx];

              if (num === undefined) {
                return <div key={`empty-${rowIdx}-${idx}`} style={{ height: 30 }} />;
              }

              const isHit = pickedSet.has(num);
              const isNew = globalIdx === justAddedIdx;

              return (
                <motion.div
                  key={`ball-${num}`}
                  initial={{ scale: 0, opacity: 0, y: -16 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 22, delay: 0 }}
                  style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {/* Pop flash on newest ball */}
                  {isNew && (
                    <motion.div
                      initial={{ scale: 1, opacity: 0.6 }}
                      animate={{ scale: 2, opacity: 0 }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: isHit ? 'rgba(34,197,94,0.5)' : 'rgba(34,211,238,0.4)', pointerEvents: 'none' }}
                    />
                  )}
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'radial-gradient(circle at 35% 26%, #415562 0%, #1a2a33 52%, #081115 100%)',
                    boxShadow: isHit
                      ? '0 0 10px rgba(34,197,94,0.8), inset -1px -2px 3px rgba(0,0,0,0.8), inset 1px 1px 2px rgba(255,255,255,0.35)'
                      : isNew
                        ? '0 0 10px rgba(34,211,238,0.7), inset -1px -2px 3px rgba(0,0,0,0.8), inset 1px 1px 2px rgba(255,255,255,0.35)'
                        : 'inset -1px -2px 3px rgba(0,0,0,0.8), inset 1px 1px 2px rgba(255,255,255,0.35), 0 2px 5px rgba(0,0,0,0.6)',
                    border: isHit ? '1.5px solid rgba(34,197,94,0.75)' : isNew ? '1.5px solid rgba(34,211,238,0.6)' : '1px solid rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 800, color: '#fff', fontFamily: 'monospace',
                    position: 'relative',
                  }}>
                    {/* Hit dot */}
                    {isHit && (
                      <div style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: '50%', background: '#1ee068', border: '1px solid #a7f3d0', boxShadow: '0 0 4px #1ee068' }} />
                    )}
                    {num}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
