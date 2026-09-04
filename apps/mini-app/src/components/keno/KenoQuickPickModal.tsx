import { useState } from 'react';
import { X, Dices, RotateCcw, Flame, Snowflake } from 'lucide-react';
import { HOT_NUMBERS, COLD_NUMBERS } from './types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onQuickPick: (count: number) => void;
  onSelectSpecific: (nums: number[]) => void;
  onClear: () => void;
}

export function KenoQuickPickModal({ isOpen, onClose, onQuickPick, onSelectSpecific, onClear }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="w-full max-w-md bg-[#0d171a] border border-[#1b3036] rounded-2xl p-4 shadow-2xl flex flex-col gap-4 text-slate-100">
        <div className="flex items-center justify-between border-b border-[#182c31] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Dices className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-base">Quick Picks</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-[#142327] hover:bg-[#1a2e33] flex items-center justify-center text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Pick Random Numbers</span>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4, 5, 7, 8, 10].map(spots => (
              <button key={spots} onClick={() => { onQuickPick(spots); onClose(); }} className="py-2 rounded-xl bg-[#142327] hover:bg-[#1e343a] text-xs font-bold text-emerald-400 border border-[#1e3338] transition-all">
                Pick {spots}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1.5 mt-1">
            <button onClick={() => { onSelectSpecific(HOT_NUMBERS.slice(0, 5)); onClose(); }} className="py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center justify-center gap-1">
              <Flame className="w-3.5 h-3.5" /> Hot 5
            </button>
            <button onClick={() => { onSelectSpecific(COLD_NUMBERS.slice(0, 5)); onClose(); }} className="py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-bold flex items-center justify-center gap-1">
              <Snowflake className="w-3.5 h-3.5" /> Cold 5
            </button>
            <button onClick={() => { onClear(); onClose(); }} className="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold flex items-center justify-center gap-1">
              <RotateCcw className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
