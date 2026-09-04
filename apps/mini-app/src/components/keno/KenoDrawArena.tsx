import { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  drawnNumbers: number[];
  currentBall: number | null;
  userPickedNumbers: number[];
  onGoToBetting?: (() => void) | undefined;
}

export function KenoDrawArena({ drawnNumbers, currentBall, userPickedNumbers, onGoToBetting }: Props) {
  const pickedSet = useMemo(() => new Set(userPickedNumbers), [userPickedNumbers]);

  const row1 = drawnNumbers.slice(0, 10);
  const row2 = drawnNumbers.slice(10, 20);
  const latestIdx = drawnNumbers.length - 1;
  const centerDisplay = currentBall ?? drawnNumbers[drawnNumbers.length - 1] ?? null;
  const count = drawnNumbers.length;

  const ballStyle = (num: number, globalIdx: number): React.CSSProperties => {
    const isHit = pickedSet.has(num);
    const isLatest = globalIdx === latestIdx;
    return {
      width: 30, height: 30, borderRadius: '50%',
      background: 'radial-gradient(circle at 35% 26%, #415562 0%, #1a2a33 52%, #081115 100%)',
      boxShadow: isHit
        ? '0 0 12px rgba(34,197,94,0.85), inset -1px -2px 4px rgba(0,0,0,0.85), inset 1px 1px 2px rgba(255,255,255,0.4)'
        : isLatest
          ? '0 0 10px rgba(34,211,238,0.7), inset -1px -2px 4px rgba(0,0,0,0.85), inset 1px 1px 2px rgba(255,255,255,0.4)'
          : 'inset -1px -2px 4px rgba(0,0,0,0.85), inset 1px 1px 2px rgba(255,255,255,0.4), 0 3px 6px rgba(0,0,0,0.7)',
      border: isHit ? '1.5px solid rgba(34,197,94,0.8)' : isLatest ? '1.5px solid rgba(34,211,238,0.6)' : '1px solid rgba(255,255,255,0.1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 800, color: '#fff', fontFamily: 'monospace',
      position: 'relative', flexShrink: 0,
    };
  };

  return (
    <div style={{ width: '100%', background: 'rgba(8,18,21,0.97)', border: '1px solid rgba(30,224,104,0.15)', borderRadius: 16, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '12px 10px', minHeight: 210 }}>
      {/* Radar rings */}
      {[80, 130, 190, 260].map(r => (
        <div key={r} style={{ position: 'absolute', left: '50%', top: '50%', width: r, height: r, borderRadius: '50%', border: '1px solid rgba(30,224,104,0.12)', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
      ))}

      {/* Rotating sweep */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        style={{ position: 'absolute', left: '50%', top: '50%', width: 300, height: 300, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'conic-gradient(from 0deg, rgba(30,224,104,0.12) 0deg, transparent 60deg, transparent 360deg)', pointerEvents: 'none' }}
      />

      {/* Ripple on new ball */}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={`ripple-${centerDisplay}`}
          initial={{ scale: 0.4, opacity: 0.7 }}
          animate={{ scale: 2.2, opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          style={{ position: 'absolute', left: '50%', top: '50%', width: 90, height: 90, borderRadius: '50%', border: '2px solid rgba(30,224,104,0.55)', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}
        />
      </AnimatePresence>

      {/* Top row: toggle btn + counter */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 4 }}>
        {onGoToBetting ? (
          <button onClick={onGoToBetting} style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(17,34,38,0.9)', border: '1px solid rgba(30,224,104,0.3)', color: '#1ee068', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            Betting Board
          </button>
        ) : <div />}
        <div style={{ display: 'flex', alignItems: 'center', fontFamily: 'monospace', fontSize: 16, fontWeight: 900, letterSpacing: '0.1em' }}>
          <AnimatePresence mode="popLayout">
            <motion.span key={count} initial={{ y: -6, scale: 1.3, opacity: 0.6 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 6, scale: 0.8, opacity: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }} style={{ color: '#fff', display: 'inline-block' }}>
              {count}
            </motion.span>
          </AnimatePresence>
          <span style={{ color: '#1ee068', margin: '0 4px', fontWeight: 900 }}>/</span>
          <span style={{ color: '#e2e8f0', fontWeight: 900 }}>20</span>
        </div>
      </div>

      {/* Center ball */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '6px 0' }}>
        <motion.div
          animate={{ boxShadow: ['0 0 20px rgba(30,224,104,0.25)', '0 0 32px rgba(30,224,104,0.5)', '0 0 20px rgba(30,224,104,0.25)'] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: 64, height: 64, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #1e3338 0%, #0d1a1d 65%, #050c0e 100%)', border: '1.5px solid rgba(30,224,104,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, color: '#fff', fontFamily: 'monospace', letterSpacing: '-0.5px' }}
        >
          <AnimatePresence mode="popLayout">
            {centerDisplay !== null && (
              <motion.span key={centerDisplay} initial={{ scale: 0.2, rotate: -30, opacity: 0 }} animate={{ scale: [0.2, 1.3, 1], rotate: 0, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }} style={{ display: 'inline-block' }}>
                {centerDisplay}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Ball trays: row2 (balls 11-20) then row1 (balls 1-10) */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto' }}>
        {[row2, row1].map((row, rowIdx) => (
          <div key={rowIdx} style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3 }}>
            {Array.from({ length: 10 }).map((_, idx) => {
              const globalIdx = rowIdx === 0 ? 10 + idx : idx;
              const num = row[idx];
              if (num === undefined) return <div key={idx} style={{ width: 30, height: 30, borderRadius: '50%', opacity: 0 }} />;
              const isHit = pickedSet.has(num);
              return (
                <motion.div
                  key={`${rowIdx}-${idx}-${num}`}
                  initial={{ scale: 0, y: -20, opacity: 0 }}
                  animate={globalIdx === latestIdx
                    ? { scale: [1.05, 1.15, 1.05], y: [-4, -8, -4], opacity: 1 }
                    : { scale: 1, y: 0, opacity: 1 }}
                  transition={globalIdx === latestIdx
                    ? { repeat: Infinity, duration: 1.5, ease: 'easeInOut' }
                    : { type: 'spring', stiffness: 450, damping: 22 }}
                  style={{ position: 'relative' }}
                >
                  <div style={ballStyle(num, globalIdx)}>
                    {isHit && (
                      <motion.div
                        animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        style={{ position: 'absolute', top: -3, right: -3, width: 9, height: 9, borderRadius: '50%', background: '#1ee068', border: '1px solid #a7f3d0' }}
                      />
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
