import { motion } from 'motion/react';
import { Settings, Minus, Plus } from 'lucide-react';
import { PAYOUT_TABLE, HOT_NUMBERS, COLD_NUMBERS, bestMultiplier } from './types';

interface Props {
  countdown: number;
  selectedNumbers: number[];
  onToggleNumber: (n: number) => void;
  betAmount: number;
  onChangeBet: (v: number) => void;
  onPlaceBet: () => void;
  onOpenSettings: () => void;
  onOpenInfo?: () => void;
  userBalance: number;
}

export function KenoBettingStage({
  countdown, selectedNumbers, onToggleNumber,
  betAmount, onChangeBet, onPlaceBet, onOpenSettings, onOpenInfo, userBalance,
}: Props) {
  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;
  const timer = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const spots = selectedNumbers.length;
  const payConfig = spots > 0 ? PAYOUT_TABLE[spots] ?? {} : {};
  const payEntries = Object.entries(payConfig)
    .map(([hit, mul]) => ({ hits: Number(hit), mul }))
    .filter(e => e.mul > 0);
  const possibleWin = spots > 0 ? betAmount * bestMultiplier(spots) : 0;

  const dec = () => {
    if (betAmount <= 5) onChangeBet(Math.max(1, betAmount - 1));
    else if (betAmount <= 20) onChangeBet(betAmount - 2);
    else onChangeBet(Math.max(1, betAmount - 10));
  };
  const inc = () => {
    if (betAmount < 5) onChangeBet(betAmount + 1);
    else if (betAmount < 20) onChangeBet(betAmount + 2);
    else onChangeBet(betAmount + 10);
  };

  return (
    <div className="w-full flex flex-col items-center select-none">
      {/* Timer */}
      <div className="my-2 w-full flex items-center justify-center">
        <motion.span
          animate={countdown <= 10
            ? { scale: [1, 1.08, 1], color: ['#ef4444', '#f87171', '#ef4444'], textShadow: ['0 0 12px rgba(239,68,68,0.75)', '0 0 20px rgba(239,68,68,0.95)', '0 0 12px rgba(239,68,68,0.75)'] }
            : { scale: [1, 1.02, 1], color: '#22d3ee', textShadow: '0 0 12px rgba(34,211,238,0.75)' }}
          transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
          className="font-mono text-3xl font-black tracking-widest"
        >
          {timer}
        </motion.span>
      </div>

      <div className="w-full bg-[#0d1618] border border-[#162529] rounded-2xl p-3 shadow-xl flex flex-col gap-2.5">
        {/* Header */}
        {spots === 0 ? (
          <div className="flex items-center justify-between py-1 px-1">
            <div className="flex items-center gap-3">
              <div className="relative w-16 h-14 flex items-center justify-center">
                <div className="absolute top-0 left-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-slate-200" style={{ background: 'radial-gradient(circle at 35% 30%, #475569 0%, #1e293b 60%, #0f172a 100%)', boxShadow: 'inset -1px -1px 3px rgba(0,0,0,0.8)' }}>80</div>
                <div className="absolute top-0 right-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-slate-200" style={{ background: 'radial-gradient(circle at 35% 30%, #475569 0%, #1e293b 60%, #0f172a 100%)', boxShadow: 'inset -1px -1px 3px rgba(0,0,0,0.8)' }}>10</div>
                <div className="relative z-10 w-11 h-11 rounded-full flex items-center justify-center font-black text-lg text-white" style={{ background: 'radial-gradient(circle at 35% 30%, #166534 0%, #0f3822 55%, #051c10 100%)', boxShadow: '0 0 16px rgba(30,224,104,0.45), inset 1px 1px 3px rgba(255,255,255,0.4)', border: '2px solid #1ee068' }}>1</div>
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-black text-white tracking-tight">Choose 10 numbers</span>
                <span className="text-sm font-bold text-[#1ee068]">From 1 to 80</span>
              </div>
            </div>
            {onOpenInfo && (
              <button onClick={onOpenInfo} className="w-7 h-7 rounded-lg bg-[#142327] hover:bg-[#1c3238] text-[#1ee068] flex items-center justify-center border border-[#1d353b] font-black text-sm">?</button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-slate-400">Possible win</span>
                <span className="text-xl font-black text-[#1ee068]">{possibleWin > 0 ? possibleWin.toLocaleString() : '0'}</span>
              </div>
              {onOpenInfo && (
                <button onClick={onOpenInfo} className="w-7 h-7 rounded-lg bg-[#142327] hover:bg-[#1c3238] text-[#1ee068] flex items-center justify-center border border-[#1d353b] font-black text-sm">?</button>
              )}
            </div>
            {payEntries.length > 0 && (
              <div className="bg-[#091113] rounded-lg px-3 py-1.5 border border-[#142327]">
                <div className="flex flex-col gap-0.5 text-xs font-mono">
                  <div className="flex items-center gap-4 text-slate-400">
                    <span className="w-12 font-sans">Match</span>
                    <div className="flex items-center gap-5">{payEntries.map(p => <span key={p.hits} className="w-6 text-center font-bold text-slate-200">{p.hits}</span>)}</div>
                  </div>
                  <div className="flex items-center gap-4 text-slate-300">
                    <span className="w-12 font-sans text-slate-400">Pays</span>
                    <div className="flex items-center gap-5">{payEntries.map(p => <span key={p.hits} className="w-6 text-center font-bold text-emerald-400">x{p.mul}</span>)}</div>
                  </div>
                </div>
              </div>
            )}
            {/* Selected numbers tray */}
            <div className="grid grid-cols-10 gap-1">
              {Array.from({ length: 10 }).map((_, idx) => {
                const num = selectedNumbers[idx];
                return (
                  <motion.div
                    key={idx}
                    animate={num !== undefined ? { scale: [0.85, 1.08, 1] } : { scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                    className={`h-9 rounded-lg flex items-center justify-center font-bold text-xs font-mono transition-colors ${num !== undefined ? 'bg-[#1a2b2f] text-slate-100 border border-[#2b444a]' : 'bg-[#091113] border border-[#132226] text-transparent'}`}
                  >
                    {num ?? ''}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* 80-number grid */}
        <div className="grid grid-cols-10 gap-1 my-1">
          {Array.from({ length: 80 }, (_, i) => i + 1).map(num => {
            const isSel = selectedNumbers.includes(num);
            const isHot = HOT_NUMBERS.includes(num);
            const isCold = COLD_NUMBERS.includes(num);
            return (
              <motion.button
                key={num}
                whileTap={{ scale: 0.88 }}
                animate={isSel ? { scale: [0.92, 1.06, 1] } : { scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                onClick={() => onToggleNumber(num)}
                className={`relative aspect-square rounded-lg flex items-center justify-center font-bold text-xs select-none cursor-pointer ${
                  isSel
                    ? 'bg-[#1ea855] text-white font-extrabold shadow-md ring-1 ring-emerald-300/40'
                    : 'bg-[#162225] hover:bg-[#1e2f33] text-slate-100 border border-[#1d2d31]'
                }`}
              >
                {!isSel && isHot && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[#ef4444]" />}
                {!isSel && isCold && <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-[#38bdf8]" />}
                <span>{num}</span>
              </motion.button>
            );
          })}
        </div>

        {/* Bet controls */}
        <div className="flex items-center gap-1.5">
          <motion.button whileTap={{ scale: 0.9 }} onClick={dec} className="w-10 h-10 rounded-lg bg-[#152326] hover:bg-[#1c3034] text-slate-200 flex items-center justify-center border border-[#1d2d31] cursor-pointer">
            <Minus className="w-4 h-4" />
          </motion.button>
          <div className="flex-1 h-10 rounded-lg bg-[#0a1214] border border-[#162529] flex items-center justify-center font-mono font-bold text-lg text-slate-100">
            {betAmount % 1 === 0 ? betAmount : betAmount.toFixed(2)}
          </div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={inc} className="w-10 h-10 rounded-lg bg-[#152326] hover:bg-[#1c3034] text-slate-200 flex items-center justify-center border border-[#1d2d31] cursor-pointer">
            <Plus className="w-4 h-4" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.92 }} onClick={() => onChangeBet(betAmount * 2)} className="px-3 h-10 rounded-lg bg-[#152326] hover:bg-[#1c3034] text-[#2bd671] font-bold text-sm border border-[#1d2d31] cursor-pointer">X2</motion.button>
          <motion.button whileTap={{ scale: 0.92 }} onClick={() => onChangeBet(Math.min(Math.floor(userBalance), 500))} className="px-3 h-10 rounded-lg bg-[#152326] hover:bg-[#1c3034] text-[#2bd671] font-bold text-sm border border-[#1d2d31] cursor-pointer">MAX</motion.button>
          <motion.button whileTap={{ scale: 0.9 }} whileHover={{ rotate: 45 }} onClick={onOpenSettings} className="w-10 h-10 rounded-lg bg-[#152326] hover:bg-[#1c3034] text-[#2bd671] flex items-center justify-center border border-[#1d2d31] cursor-pointer">
            <Settings className="w-4 h-4" />
          </motion.button>
        </div>

        {/* BET button */}
        <motion.button
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.97 }}
          onClick={onPlaceBet}
          className="w-full py-3.5 rounded-xl font-black text-lg tracking-wider uppercase bg-[#1ea855] hover:bg-[#169647] text-white cursor-pointer"
        >
          BET
        </motion.button>
      </div>
    </div>
  );
}
