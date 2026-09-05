import { motion } from 'motion/react';
import { PAYOUT_TABLE, HOT_NUMBERS, COLD_NUMBERS, bestMultiplier } from './types';

const C = {
  bg: '#0d1117',
  card: '#131920',
  cell: '#161d28',
  cellBorder: 'rgba(255,255,255,0.08)',
  cellPicked: '#1a4a2a',
  cellPickedBorder: '#22c55e',
  green: '#22c55e',
  greenLight: '#4ade80',
  textWhite: '#e2e8f0',
  textMid: '#8ab89a',
  textDim: '#4a6a58',
  border: 'rgba(255,255,255,0.07)',
  yellow: '#f5a623',
  red: '#ef4444',
  blue: 'rgba(100,180,255,0.8)',
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
      {/* Card */}
      <div style={{ width: '100%', background: C.card, border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 16, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Header */}
        {spots === 0 ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {/* Ball cluster - repositioned */}
              <div style={{ position: 'relative', width: 120, height: 90, flexShrink: 0 }}>
                {/* Ball 80 — top left */}
                <div style={{
                  position: 'absolute', top: 0, left: 0,
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'radial-gradient(circle at 38% 28%, #3a5068 0%, #0d1e2e 55%, #060e18 100%)',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.7), inset 2px 2px 4px rgba(120,160,200,0.25), inset -2px -2px 5px rgba(0,0,0,0.7)',
                  border: '1px solid rgba(80,120,160,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 900, color: '#d0e4f0', fontFamily: 'monospace',
                }}>
                  <div style={{ position: 'absolute', top: 4, left: 7, width: 10, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', transform: 'rotate(-20deg)' }} />
                  80
                </div>
                {/* Ball 10 — top right */}
                <div style={{
                  position: 'absolute', top: 0, right: 0,
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'radial-gradient(circle at 38% 28%, #3a5068 0%, #0d1e2e 55%, #060e18 100%)',
                  boxShadow: '0 5px 12px rgba(0,0,0,0.8), inset 2px 2px 5px rgba(120,160,200,0.3), inset -2px -2px 6px rgba(0,0,0,0.7)',
                  border: '1px solid rgba(80,120,160,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 900, color: '#d0e4f0', fontStyle: 'italic', fontFamily: 'monospace',
                }}>
                  <div style={{ position: 'absolute', top: 5, left: 9, width: 14, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', transform: 'rotate(-20deg)' }} />
                  10
                </div>
                {/* Ball 1 — bottom left */}
                <div style={{
                  position: 'absolute', bottom: 0, left: 10,
                  width: 50, height: 50, borderRadius: '50%',
                  background: 'radial-gradient(circle at 38% 30%, #2a6a50 0%, #0d3828 50%, #041c14 100%)',
                  boxShadow: '0 0 18px rgba(30,224,104,0.5), 0 6px 16px rgba(0,0,0,0.8), inset 2px 2px 6px rgba(100,240,160,0.2), inset -3px -3px 8px rgba(0,0,0,0.8)',
                  border: '2px solid rgba(30,224,104,0.6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 900, color: '#3dba6a', fontFamily: 'monospace',
                }}>
                  <div style={{ position: 'absolute', top: 6, left: 10, width: 18, height: 9, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', transform: 'rotate(-25deg)' }} />
                  1
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: C.textWhite }}>Choose 10 numbers</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.green }}>From 1 to 80</span>
              </div>
            </div>
            {onOpenInfo && (
              <button onClick={onOpenInfo} style={{ width: 32, height: 32, borderRadius: 8, background: '#142327', border: '1px solid #1d353b', color: C.green, fontSize: 16, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 8 }}>?</button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Possible win row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, color: C.textMid, fontWeight: 600 }}>Possible win</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: C.green }}>{possibleWin > 0 ? possibleWin.toLocaleString() : '0'}</span>
              </div>
              {onOpenInfo && (
                <button onClick={onOpenInfo} style={{ width: 28, height: 28, borderRadius: 8, background: '#142327', border: '1px solid #1d353b', color: C.green, fontSize: 14, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>?</button>
              )}
            </div>
            {/* Pay table row */}
            {payEntries.length > 0 && (
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '6px 10px', border: `1px solid rgba(255,255,255,0.06)` }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 2 }}>
                  <span style={{ width: 44, fontSize: 11, color: C.textDim }}>Match</span>
                  {payEntries.map(p => <span key={p.hits} style={{ width: 28, textAlign: 'center', fontSize: 11, fontWeight: 700, color: C.textMid, fontFamily: 'monospace' }}>{p.hits}</span>)}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <span style={{ width: 44, fontSize: 11, color: C.textDim }}>Pays</span>
                  {payEntries.map(p => <span key={p.hits} style={{ width: 28, textAlign: 'center', fontSize: 11, fontWeight: 700, color: C.greenLight, fontFamily: 'monospace' }}>x{p.mul}</span>)}
                </div>
              </div>
            )}
            {/* Selected numbers tray */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3 }}>
              {Array.from({ length: 10 }).map((_, idx) => {
                const num = selectedNumbers[idx];
                return (
                  <div key={idx} style={{ height: 34, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, fontFamily: 'monospace', background: num !== undefined ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.3)', border: `1px solid ${num !== undefined ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)'}`, color: num !== undefined ? C.textWhite : 'transparent' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={dec} style={{ width: 40, height: 42, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.textWhite, fontSize: 22, fontWeight: 300, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>-</button>
          <div style={{ flex: 1, height: 42, background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: C.textWhite, fontFamily: 'monospace' }}>
            {betAmount % 1 === 0 ? betAmount : betAmount.toFixed(2)}
          </div>
          <button onClick={inc} style={{ width: 40, height: 42, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.textWhite, fontSize: 22, fontWeight: 300, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
          <button onClick={() => onChangeBet(betAmount * 2)} style={{ padding: '0 12px', height: 42, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.textMid, fontSize: 13, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>X2</button>
          <button onClick={() => onChangeBet(Math.min(Math.max(1, Math.floor(userBalance)), 500))} style={{ padding: '0 12px', height: 42, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.textMid, fontSize: 13, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>MAX</button>
          <button onClick={onOpenSettings} style={{ width: 42, height: 42, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.textMid, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>⚙</button>
        </div>

        {/* BET button */}
        <button
          onClick={onPlaceBet}
          style={{ width: '100%', padding: '14px 0', borderRadius: 12, background: '#1ea855', border: 'none', color: '#fff', fontSize: 17, fontWeight: 900, letterSpacing: '0.1em', cursor: 'pointer', marginTop: 2 }}
        >
          BET
        </button>
      </div>
    </div>
  );
}
