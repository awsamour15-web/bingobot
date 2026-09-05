import { motion } from 'motion/react';
import { PAYOUT_TABLE, HOT_NUMBERS, COLD_NUMBERS, bestMultiplier } from './types';

const C = {
  bg: '#0a0f14',
  card: '#141a22',
  cell: '#1a2230',
  cellBorder: 'rgba(255,255,255,0.1)',
  cellPicked: '#1e5a3a',
  cellPickedBorder: '#1ee068',
  green: '#1ee068',
  greenLight: '#5af0a0',
  textWhite: '#f0f4f8',
  textMid: '#90c0a8',
  textDim: '#5a7a68',
  border: 'rgba(255,255,255,0.08)',
  yellow: '#ffa500',
  red: '#ff4444',
  blue: 'rgba(100,180,255,0.9)',
};

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
  const timer = `${String(mins).padStart(2, '0')} : ${String(secs).padStart(2, '0')}`;

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

  const isUrgent = countdown <= 10;

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}>
      <div style={{ width: '100%', background: 'rgba(17,24,28,0.98)', border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 12, padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {spots === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(0,0,0,0.18)', borderRadius: 12, padding: '8px 6px 4px', minHeight: 128 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ position: 'relative', width: 100, height: 72 }}>
                  <div style={{ position: 'absolute', top: 8, left: 0, width: 34, height: 34, borderRadius: '50%', background: 'radial-gradient(circle at 35% 25%, #6984a5 0%, #233750 42%, #0d1d2b 100%)', border: '1px solid rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dfefff', fontWeight: 900, fontSize: 14 }}>80</div>
                  <div style={{ position: 'absolute', top: 0, right: 4, width: 40, height: 40, borderRadius: '50%', background: 'radial-gradient(circle at 35% 25%, #6984a5 0%, #233750 42%, #0d1d2b 100%)', border: '1px solid rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dfefff', fontWeight: 900, fontSize: 18 }}>10</div>
                  <div style={{ position: 'absolute', bottom: 0, left: 20, width: 48, height: 48, borderRadius: '50%', background: 'radial-gradient(circle at 35% 25%, #6de8a8 0%, #1d4c3f 45%, #091d1a 100%)', border: '2px solid rgba(92,244,168,0.7)', boxShadow: '0 0 16px rgba(92,244,168,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7ef0b6', fontWeight: 900, fontSize: 22 }}>1</div>
                </div>
              </div>
              {onOpenInfo && (
                <button onClick={onOpenInfo} style={{ width: 28, height: 28, borderRadius: 7, background: '#142327', border: '1px solid #1d353b', color: C.green, fontSize: 16, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>?</button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#edf5fb', letterSpacing: '-0.05em' }}>Choose 10 numbers</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#6ce7b0', letterSpacing: '-0.04em' }}>From 1 to 80</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, background: 'rgba(0,0,0,0.2)', borderRadius: 11, padding: '11px', minHeight: 90 }}>
            {/* Possible win row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 12, color: C.textMid, fontWeight: 600 }}>Possible win</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: C.green }}>{possibleWin > 0 ? possibleWin.toLocaleString() : '0'}</span>
              </div>
              {onOpenInfo && (
                <button onClick={onOpenInfo} style={{ width: 29, height: 29, borderRadius: 7, background: '#142327', border: '1px solid #1d353b', color: C.green, fontSize: 14, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>?</button>
              )}
            </div>
            {/* Pay table row */}
            {payEntries.length > 0 && (
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '5px 8px', border: `1px solid rgba(255,255,255,0.06)` }}>
                <div style={{ display: 'flex', gap: 3, marginBottom: 2 }}>
                  <span style={{ width: 40, fontSize: 9, color: C.textDim }}>Match</span>
                  {payEntries.map(p => <span key={p.hits} style={{ width: 24, textAlign: 'center', fontSize: 9, fontWeight: 700, color: C.textMid, fontFamily: 'monospace' }}>{p.hits}</span>)}
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                  <span style={{ width: 40, fontSize: 9, color: C.textDim }}>Pays</span>
                  {payEntries.map(p => <span key={p.hits} style={{ width: 24, textAlign: 'center', fontSize: 9, fontWeight: 700, color: C.greenLight, fontFamily: 'monospace' }}>x{p.mul}</span>)}
                </div>
              </div>
            )}
            {/* Selected numbers tray */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2 }}>
              {Array.from({ length: 10 }).map((_, idx) => {
                const num = selectedNumbers[idx];
                return (
                  <div key={idx} style={{ height: 28, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, fontFamily: 'monospace', background: num !== undefined ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.3)', border: `1px solid ${num !== undefined ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)'}`, color: num !== undefined ? C.textWhite : 'transparent' }}>
                    {num ?? '·'}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 80-number grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2, margin: '2px 0' }}>
          {Array.from({ length: 80 }, (_, i) => i + 1).map(num => {
            const isSel = selectedNumbers.includes(num);
            const isHot = HOT_NUMBERS.includes(num);
            const isCold = COLD_NUMBERS.includes(num);
            return (
              <motion.button
                key={num}
                whileTap={{ scale: 0.85 }}
                onClick={() => onToggleNumber(num)}
                style={{
                  position: 'relative',
                  height: 33,
                  borderRadius: 4,
                  border: `1px solid ${isSel ? C.cellPickedBorder : C.cellBorder}`,
                  background: isSel ? C.cellPicked : C.cell,
                  color: isSel ? '#fff' : '#8a9ab0',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isSel ? '0 0 6px rgba(34,197,94,0.3)' : 'none',
                  outline: 'none',
                  padding: 0,
                  WebkitTapHighlightColor: 'transparent',
                  userSelect: 'none',
                }}
              >
                {!isSel && isHot && <span style={{ position: 'absolute', top: 2, right: 2, width: 5, height: 5, borderRadius: '50%', background: C.red }} />}
                {!isSel && isCold && <span style={{ position: 'absolute', top: 2, left: 2, width: 5, height: 5, borderRadius: '50%', background: C.blue }} />}
                {num}
              </motion.button>
            );
          })}
        </div>

        {/* Bet controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <button onClick={dec} style={{ width: 38, height: 40, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.textWhite, fontSize: 20, fontWeight: 300, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>−</button>
          <div style={{ flex: 1, height: 40, background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: C.textWhite, fontFamily: 'monospace' }}>
            {betAmount % 1 === 0 ? betAmount : betAmount.toFixed(2)}
          </div>
          <button onClick={inc} style={{ width: 38, height: 40, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.textWhite, fontSize: 20, fontWeight: 300, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
          <button onClick={() => onChangeBet(betAmount * 2)} style={{ padding: '0 12px', height: 40, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.textMid, fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>X2</button>
          <button onClick={() => onChangeBet(Math.min(Math.max(1, Math.floor(userBalance)), 500))} style={{ padding: '0 12px', height: 40, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.textMid, fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>MAX</button>
          <button onClick={onOpenSettings} style={{ width: 40, height: 40, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.textMid, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>⚙</button>
        </div>

        {/* BET button */}
        <button
          onClick={onPlaceBet}
          style={{ width: '100%', padding: '16px 0', borderRadius: 16, background: '#1ea855', border: 'none', color: '#fff', fontSize: 18, fontWeight: 900, letterSpacing: '0.1em', cursor: 'pointer' }}
        >
          BET
        </button>
      </div>
    </div>
  );
}
