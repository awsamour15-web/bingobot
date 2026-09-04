import { HOT_NUMBERS, COLD_NUMBERS } from './types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onQuickPick: (count: number) => void;
  onSelectSpecific: (nums: number[]) => void;
  onClear: () => void;
}

const btnBase: React.CSSProperties = {
  borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '8px 0',
};

export function KenoQuickPickModal({ isOpen, onClose, onQuickPick, onSelectSpecific, onClear }: Props) {
  if (!isOpen) return null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#0d1117', borderRadius: '16px 16px 0 0', padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🎲</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#e2e8f0' }}>Quick Picks</span>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Quick pick spots */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#4a6a58', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pick Random Numbers</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {[1, 2, 3, 4, 5, 7, 8, 10].map(spots => (
              <button key={spots} onClick={() => { onQuickPick(spots); onClose(); }} style={{ ...btnBase, background: 'rgba(255,255,255,0.05)', color: '#4ade80' }}>
                Pick {spots}
              </button>
            ))}
          </div>
        </div>

        {/* Hot / Cold / Clear */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          <button onClick={() => { onSelectSpecific(HOT_NUMBERS.slice(0, 5)); onClose(); }} style={{ ...btnBase, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>🔥 Hot 5</button>
          <button onClick={() => { onSelectSpecific(COLD_NUMBERS.slice(0, 5)); onClose(); }} style={{ ...btnBase, background: 'rgba(100,180,255,0.08)', border: '1px solid rgba(100,180,255,0.2)', color: '#93c5fd' }}>❄️ Cold 5</button>
          <button onClick={() => { onClear(); onClose(); }} style={{ ...btnBase, background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}>↺ Clear</button>
        </div>
      </div>
    </div>
  );
}
