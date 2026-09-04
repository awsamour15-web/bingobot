import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';

export interface KenoTicket {
  numbers: number[];
}

export interface PlayerFeedItem {
  id: string;
  playerName: string;
  numbers: number[];
  winAmount?: number;
}

const sounds = {
  playBallGlide: () => {},
  playBallDock: (_index: number) => {},
};

interface DrawStageProps {
  drawnNumbers: number[];
  currentDrawnNumber: number | null;
  drawProgress: number;
  totalDrawCount?: number;
  tickets: KenoTicket[];
  playerFeed: PlayerFeedItem[];
  userSelectedNumbers?: number[];
  isPlaying?: boolean;
  drawSpeed?: 'NORMAL' | 'FAST';
  onSetPreset?: (preset: '0/20' | '3/20' | '6/20' | '17/20' | 'LIVE') => void;
  onDrawNext?: () => void;
  onRestartDraw?: () => void;
  onTogglePlayPause?: () => void;
  onToggleSpeed?: () => void;
}

interface FlightBallState {
  num: number;
  targetIndex: number;
  deltaX: number;
  deltaY: number;
  targetScale: number;
  isHit: boolean;
}

export const DrawStage: React.FC<DrawStageProps> = ({
  drawnNumbers,
  currentDrawnNumber,
  drawProgress,
  totalDrawCount = 20,
  tickets,
  playerFeed: _playerFeed,
  userSelectedNumbers = [],
  isPlaying: _isPlaying = true,
  drawSpeed = 'NORMAL',
  onSetPreset: _onSetPreset,
  onDrawNext: _onDrawNext,
  onRestartDraw: _onRestartDraw,
  onTogglePlayPause: _onTogglePlayPause,
  onToggleSpeed: _onToggleSpeed,
}) => {
  const activeBall: number | null =
    currentDrawnNumber !== null
      ? currentDrawnNumber
      : drawnNumbers.length > 0
      ? (drawnNumbers[drawnNumbers.length - 1] as number)
      : null;

  const isNumberUserHit = (num: number): boolean =>
    userSelectedNumbers.includes(num) || tickets.some((t) => t.numbers.includes(num));

  const isCurrentHit = activeBall !== null && isNumberUserHit(activeBall);

  const centerBallContainerRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [seatedNumbers, setSeatedNumbers] = useState<(number | null)[]>(() => {
    const arr: (number | null)[] = Array(20).fill(null);
    drawnNumbers.forEach((n, i) => { if (i < 20) arr[i] = n; });
    return arr;
  });

  const [flightBall, setFlightBall] = useState<FlightBallState | null>(null);
  const [justLandedIndex, setJustLandedIndex] = useState<number | null>(null);
  const prevDrawnRef = useRef<number[]>(drawnNumbers);
  const popTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rippleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measureOffset = (targetIndex: number) => {
    const centerEl = centerBallContainerRef.current;
    const slotEl = slotRefs.current[targetIndex];
    if (centerEl && slotEl) {
      const cRect = centerEl.getBoundingClientRect();
      const sRect = slotEl.getBoundingClientRect();
      return {
        dx: sRect.left + sRect.width / 2 - (cRect.left + cRect.width / 2),
        dy: sRect.top + sRect.height / 2 - (cRect.top + cRect.height / 2),
        scale: sRect.width / cRect.width,
      };
    }
    return { dx: 0, dy: 100, scale: 0.38 };
  };

  useEffect(() => {
    const prev = prevDrawnRef.current;
    const current = drawnNumbers;
    prevDrawnRef.current = current;

    if (popTimerRef.current) clearTimeout(popTimerRef.current);
    if (landTimerRef.current) clearTimeout(landTimerRef.current);
    if (rippleTimerRef.current) clearTimeout(rippleTimerRef.current);

    if (current.length === 0) {
      setSeatedNumbers(Array(20).fill(null));
      setFlightBall(null);
      setJustLandedIndex(null);
      return;
    }

    if (current.length > prev.length + 1 || current.length < prev.length) {
      const arr: (number | null)[] = Array(20).fill(null);
      current.forEach((n, i) => { if (i < 20) arr[i] = n; });
      setSeatedNumbers(arr);
      setFlightBall(null);
      setJustLandedIndex(null);
      return;
    }

    if (current.length === prev.length + 1) {
      const newIndex = current.length - 1;
      const newNum = current[newIndex] as number;
      const isHit = isNumberUserHit(newNum);
      const isFast = drawSpeed === 'FAST';
      const totalDuration = isFast ? 440 : 920;
      const { dx, dy, scale } = measureOffset(newIndex);

      setFlightBall({ num: newNum, targetIndex: newIndex, deltaX: dx, deltaY: dy, targetScale: scale, isHit });

      popTimerRef.current = setTimeout(() => { sounds.playBallGlide(); }, totalDuration * 0.35);

      landTimerRef.current = setTimeout(() => {
        setSeatedNumbers((prevSeated) => {
          const next = [...prevSeated];
          next[newIndex] = newNum;
          return next;
        });
        setFlightBall(null);
        setJustLandedIndex(newIndex);
        sounds.playBallDock(newIndex);
        rippleTimerRef.current = setTimeout(() => {
          setJustLandedIndex((cur) => (cur === newIndex ? null : cur));
        }, 500);
      }, totalDuration);
    }
  }, [drawnNumbers, drawSpeed]);

  const isFast = drawSpeed === 'FAST';

  const ballStyle = (isHit: boolean) => ({
    background: isHit
      ? 'radial-gradient(circle at 35% 30%, #059669 0%, #047857 60%, #064e3b 100%)'
      : 'radial-gradient(circle at 35% 30%, #475569 0%, #1e293b 60%, #0f172a 100%)',
  });

  const SlotBall = ({ num, slotIndex, isJustLanded }: { num: number; slotIndex: number; isJustLanded: boolean }) => {
    const isHit = isNumberUserHit(num);
    const landedTransition = { duration: 0.4, ease: [0.175, 0.885, 0.32, 1.275] as const };
    return (
      <motion.div
        key={`seated-${num}-${slotIndex}`}
        initial={isJustLanded ? { scale: 1.25 } : false}
        animate={isJustLanded ? { scale: [1.25, 0.94, 1.03, 1] } : { scale: 1 }}
        transition={isJustLanded ? landedTransition : { duration: 0 }}
        className={`relative w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-black border shrink-0 ${
          isHit ? 'border-emerald-500 text-white' : 'border-slate-600 text-white'
        }`}
        style={ballStyle(isHit)}
      >
        <div className="absolute top-0.5 left-1 w-2 h-1 rounded-full bg-white/25 pointer-events-none" />
        <span>{num}</span>
      </motion.div>
    );
  };

  const EmptySlot = () => (
    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-slate-800 bg-slate-900/40 flex items-center justify-center mx-auto">
      <div className="w-1 h-1 rounded-full bg-slate-700/50" />
    </div>
  );

  return (
    <div className="w-full bg-[#0a121a] flex flex-col items-center pt-2 pb-2 px-3 border-b border-[#182635] select-none relative overflow-hidden">
      <div className="w-full flex justify-end items-center px-1 mb-1 z-20">
        <div className="font-mono text-sm sm:text-base font-bold text-white tracking-wider pl-2 shrink-0">
          <span className="text-emerald-400">{drawProgress}</span> / {totalDrawCount}
        </div>
      </div>

      <div className="relative w-full max-w-sm flex flex-col items-center justify-center pt-2 pb-3 px-1 min-h-[200px]">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
          <div className="w-56 h-56 sm:w-64 sm:h-64 rounded-full border border-emerald-500/20" />
          <div className="absolute w-44 h-44 sm:w-52 sm:h-52 rounded-full border border-emerald-500/25" />
          <div className="absolute w-32 h-32 sm:w-40 sm:h-40 rounded-full border border-emerald-500/30" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-emerald-500/15" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-emerald-500/15" />
          <motion.div
            className="absolute w-56 h-56 rounded-full pointer-events-none overflow-hidden"
            animate={{ rotate: 360 }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
          >
            <div className="w-1/2 h-1/2 origin-bottom-right bg-gradient-to-br from-emerald-500/15 via-teal-500/5 to-transparent rounded-tl-full" />
          </motion.div>
        </div>

        <AnimatePresence>
          {isCurrentHit && activeBall !== null && (
            <motion.div
              key={`hit-badge-${activeBall}`}
              className="absolute top-1 z-30 flex items-center space-x-1 px-3 py-0.5 bg-gradient-to-r from-amber-500 to-emerald-500 text-slate-950 font-black text-xs rounded-full shadow-lg border border-amber-300"
              initial={{ y: 15, scale: 0.5, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: -15, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Sparkles size={12} className="text-white fill-white" />
              <span>MATCH!</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={centerBallContainerRef} className="relative z-20 w-20 h-20 sm:w-22 sm:h-22 flex items-center justify-center my-2">
          {flightBall !== null ? (
            <motion.div
              key={`ball-${flightBall.num}`}
              initial={{ x: 0, y: 32, scale: 0.25, opacity: 0 }}
              animate={{
                x: [0, 0, flightBall.deltaX * 0.15, flightBall.deltaX * 0.55, flightBall.deltaX * 0.88, flightBall.deltaX],
                y: [32, 0, flightBall.deltaY * 0.08 - 18, flightBall.deltaY * 0.45 - 24, flightBall.deltaY * 0.82 - 8, flightBall.deltaY],
                scale: [0.25, 1.05, 1.02, 0.88, flightBall.targetScale * 1.04, flightBall.targetScale],
                opacity: [0, 1, 1, 1, 1, 1],
              }}
              transition={{ duration: isFast ? 0.44 : 0.92, times: [0, 0.28, 0.42, 0.65, 0.88, 1], ease: [0.22, 1, 0.36, 1] }}
              className={`absolute w-full h-full rounded-full flex items-center justify-center border-2 ${
                flightBall.isHit ? 'border-emerald-500' : 'border-slate-500'
              } text-white z-40 pointer-events-none will-change-transform`}
              style={{
                background: flightBall.isHit
                  ? 'radial-gradient(circle at 35% 30%, #059669 0%, #047857 52%, #064e3b 100%)'
                  : 'radial-gradient(circle at 35% 30%, #475569 0%, #1e293b 55%, #0f172a 100%)',
              }}
            >
              <div className="absolute top-1.5 left-2.5 w-7 h-3 rounded-full bg-white/30 -rotate-12 pointer-events-none" />
              <span className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-none select-none">{flightBall.num}</span>
            </motion.div>
          ) : drawnNumbers.length === totalDrawCount ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full h-full rounded-full border border-emerald-600 bg-emerald-950/40 flex flex-col items-center justify-center p-1 text-center"
            >
              <span className="text-[11px] font-black text-emerald-300 tracking-wider">DRAW</span>
              <span className="text-[10px] font-bold text-emerald-400">COMPLETE</span>
            </motion.div>
          ) : activeBall !== null && drawnNumbers.length > 0 ? (
            <div
              className={`relative w-full h-full rounded-full flex items-center justify-center border-2 ${
                isCurrentHit ? 'border-emerald-500' : 'border-slate-500'
              } text-white`}
              style={{
                background: isCurrentHit
                  ? 'radial-gradient(circle at 35% 30%, #059669 0%, #047857 52%, #064e3b 100%)'
                  : 'radial-gradient(circle at 35% 30%, #475569 0%, #1e293b 55%, #0f172a 100%)',
              }}
            >
              <div className="absolute top-1.5 left-2.5 w-7 h-3 rounded-full bg-white/30 -rotate-12 pointer-events-none" />
              <span className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-none select-none">{activeBall}</span>
            </div>
          ) : (
            <div className="h-16 my-2 flex items-center justify-center text-slate-500 font-mono text-xs">Awaiting Next Draw...</div>
          )}
        </div>

        <div className="w-full max-w-[340px] sm:max-w-[360px] flex flex-col items-center justify-center z-20 space-y-1 sm:space-y-1.5 mt-1 px-1">
          <div className="grid grid-cols-10 gap-1 sm:gap-1.5 w-full">
            {Array.from({ length: 10 }).map((_, colIdx) => {
              const slotIndex = 10 + colIdx;
              const num = seatedNumbers[slotIndex] ?? null;
              return (
                <div key={`slot-top-${colIdx}`} ref={(el) => { slotRefs.current[slotIndex] = el; }} className="relative w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center mx-auto">
                  {num !== null ? <SlotBall num={num} slotIndex={slotIndex} isJustLanded={justLandedIndex === slotIndex} /> : <EmptySlot />}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-10 gap-1 sm:gap-1.5 w-full">
            {Array.from({ length: 10 }).map((_, colIdx) => {
              const slotIndex = colIdx;
              const num = seatedNumbers[slotIndex] ?? null;
              return (
                <div key={`slot-bottom-${colIdx}`} ref={(el) => { slotRefs.current[slotIndex] = el; }} className="relative w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center mx-auto">
                  {num !== null ? <SlotBall num={num} slotIndex={slotIndex} isJustLanded={justLandedIndex === slotIndex} /> : <EmptySlot />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
