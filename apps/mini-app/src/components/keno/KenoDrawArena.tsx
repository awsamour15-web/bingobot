import { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  drawnNumbers: number[];
  currentBall: number | null;
  userPickedNumbers: number[];
  onGoToBetting?: (() => void) | undefined;
}

export function KenoDrawArena({ drawnNumbers, currentBall, userPickedNumbers, onGoToBetting }: Props) {
  const userPickedSet = useMemo(() => new Set(userPickedNumbers), [userPickedNumbers]);

  const row1 = drawnNumbers.slice(0, 10);
  const row2 = drawnNumbers.slice(10, 20);
  const latestIdx = drawnNumbers.length - 1;
  const centerDisplay = currentBall ?? drawnNumbers[drawnNumbers.length - 1] ?? null;
  const displayCount = drawnNumbers.length;

  return (
    <div className="w-full bg-[#081215] border border-[#16272c] rounded-2xl relative overflow-hidden flex flex-col justify-between p-3 min-h-[210px] shadow-2xl select-none">
      {/* Radar background */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.12, 0.18, 0.12] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute w-80 h-80 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(30,224,104,0.18) 0%, rgba(13,38,36,0.25) 45%, transparent 75%)' }}
        />
        {[80, 140, 210, 290].map(s => (
          <div key={s} className="absolute rounded-full border border-[#1ee068]/15" style={{ width: s, height: s }} />
        ))}
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: 'linear' }} className="absolute w-[300px] h-[300px] rounded-full flex items-center justify-center">
          <div className="w-full h-full rounded-full" style={{ background: 'conic-gradient(from 0deg, rgba(30,224,104,0.15) 0deg, transparent 60deg, transparent 360deg)' }} />
        </motion.div>
        <AnimatePresence mode="popLayout">
          <motion.div key={`ripple-${centerDisplay}`} initial={{ scale: 0.4, opacity: 0.8 }} animate={{ scale: 2.4, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 1.2, ease: 'easeOut' }} className="absolute w-28 h-28 rounded-full border-2 border-[#1ee068]/60" />
        </AnimatePresence>
      </div>

      {/* Top row: counter + toggle */}
      <div className="relative z-10 flex items-center justify-between w-full">
        {onGoToBetting && (
          <motion.button whileTap={{ scale: 0.94 }} onClick={onGoToBetting} className="px-2.5 py-0.5 rounded-lg bg-[#112226] hover:bg-[#183238] text-[#1ee068] border border-[#1c383f] text-xs font-bold cursor-pointer">
            Betting Board
          </motion.button>
        )}
        <div className="ml-auto flex items-center font-mono tracking-widest text-base font-bold">
          <AnimatePresence mode="popLayout">
            <motion.span key={`cnt-${displayCount}`} initial={{ y: -6, scale: 1.35, opacity: 0.7 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 6, scale: 0.8, opacity: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }} className="text-white font-black inline-block">
              {displayCount}
            </motion.span>
          </AnimatePresence>
          <span className="text-[#1ee068] mx-1.5 font-black">/</span>
          <span className="text-slate-100 font-black">20</span>
        </div>
      </div>

      {/* Center ball */}
      <div className="relative z-10 flex items-center justify-center my-1.5">
        <motion.div
          animate={{ boxShadow: ['0 0 20px rgba(30,224,104,0.25)', '0 0 32px rgba(30,224,104,0.45)', '0 0 20px rgba(30,224,104,0.25)'] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          className="relative w-14 h-14 rounded-full flex items-center justify-center font-mono font-bold text-lg"
          style={{ background: 'radial-gradient(circle at 35% 30%, #1e3338 0%, #0d1a1d 65%, #050c0e 100%)', border: '1.5px solid rgba(30,224,104,0.45)' }}
        >
          <AnimatePresence mode="popLayout">
            {centerDisplay !== null && (
              <motion.span key={`ball-${centerDisplay}`} initial={{ scale: 0.2, rotate: -30, opacity: 0 }} animate={{ scale: [0.2, 1.25, 1], rotate: 0, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }} className="text-white font-black inline-block">
                {centerDisplay}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Ball trays */}
      <div className="relative z-10 w-full flex flex-col gap-2 mt-auto">
        {[row2, row1].map((row, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-10 gap-1 w-full">
            {Array.from({ length: 10 }).map((_, idx) => {
              const globalIdx = rowIdx === 0 ? 10 + idx : idx;
              const ballNum = row[idx];
              const isLatest = globalIdx === latestIdx;
              const isHit = ballNum !== undefined && userPickedSet.has(ballNum);
              if (ballNum === undefined) return <div key={idx} className="w-7 h-7 rounded-full opacity-0" />;
              return (
                <motion.div
                  key={`${rowIdx}-${idx}-${ballNum}`}
                  initial={{ scale: 0, y: -22, opacity: 0 }}
                  animate={isLatest ? { scale: [1.05, 1.15, 1.05], y: [-4, -8, -4], opacity: 1 } : { scale: 1, y: 0, opacity: 1 }}
                  transition={isLatest ? { repeat: Infinity, duration: 1.5, ease: 'easeInOut' } : { type: 'spring', stiffness: 450, damping: 22 }}
                  className={`relative flex items-center justify-center ${isLatest ? 'z-20' : 'z-10'}`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-xs text-white shadow-md relative ${
                      isHit ? 'ring-2 ring-[#1ee068] ring-offset-1 ring-offset-[#081215] shadow-[0_0_12px_rgba(30,224,104,0.85)]'
                        : isLatest ? 'ring-1 ring-cyan-400/80 ring-offset-1 ring-offset-[#081215] shadow-[0_0_10px_rgba(34,211,238,0.7)]' : ''
                    }`}
                    style={{ background: 'radial-gradient(circle at 35% 26%, #415562 0%, #1a2a33 52%, #081115 100%)', boxShadow: 'inset -1.5px -2px 4px rgba(0,0,0,0.85), inset 1.5px 1.5px 2px rgba(255,255,255,0.45), 0 3px 6px rgba(0,0,0,0.7)' }}
                  >
                    {isHit && <motion.div animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 1, repeat: Infinity }} className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#1ee068] ring-2 ring-emerald-300" />}
                    <span className="relative z-10">{ballNum}</span>
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
