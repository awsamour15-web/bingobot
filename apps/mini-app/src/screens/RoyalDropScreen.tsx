import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { spinRoyalDrop, getRoyalDropHistory, getProfile, checkRoyalDropAccess } from '../lib/api';
import type {
  RoyalDropSpinResponse, SpinOutcome, CrateCell, ReelSymbol,
  RoyalDropHistoryEntry, ChestResult,
} from '../lib/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const BET_OPTIONS = [1, 5, 10, 25, 50, 100, 200, 500, 1000, 5000];

const CRATE_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  wooden:     { bg: 'linear-gradient(145deg,#c4832b,#8b5a1e)', border: '#d4943a', label: 'Wood' },
  sturdy:     { bg: 'linear-gradient(145deg,#a0622a,#6b3e15)', border: '#b8743a', label: 'Sturdy' },
  reinforced: { bg: 'linear-gradient(145deg,#8a8a9a,#555568)', border: '#aaaabc', label: 'Reinf.' },
  metal:      { bg: 'linear-gradient(145deg,#7a8a9a,#4a5568)', border: '#9aaabb', label: 'Metal' },
  stone:      { bg: 'linear-gradient(145deg,#6a7280,#374151)', border: '#8a9ab0', label: 'Stone' },
  royal:      { bg: 'linear-gradient(145deg,#b8952a,#7a5e10)', border: '#d4ab3a', label: 'Royal' },
};

const ROCKET_COLORS: Record<string, string> = {
  blue:   '#3b82f6',
  green:  '#22c55e',
  purple: '#a855f7',
  red:    '#ef4444',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function RocketSvg({ color, size = 32 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <ellipse cx="16" cy="14" rx="5" ry="10" fill={color} opacity="0.9"/>
      <polygon points="16,2 20,12 12,12" fill={color}/>
      <polygon points="11,20 8,26 14,22" fill={color} opacity="0.7"/>
      <polygon points="21,20 24,26 18,22" fill={color} opacity="0.7"/>
      <circle cx="16" cy="16" r="3" fill="rgba(255,255,255,0.35)"/>
      <ellipse cx="16" cy="26" rx="4" ry="3" fill="#f97316" opacity="0.8"/>
    </svg>
  );
}

function BonusSvg({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <ellipse cx="16" cy="20" rx="10" ry="8" fill="#f59e0b"/>
      <ellipse cx="16" cy="19" rx="9" ry="7" fill="#fbbf24"/>
      {/* Comb */}
      <rect x="10" y="10" width="12" height="4" rx="2" fill="#b45309"/>
      {/* Eyes */}
      <circle cx="13" cy="19" r="2" fill="#1f1f1f"/>
      <circle cx="19" cy="19" r="2" fill="#1f1f1f"/>
      <circle cx="14" cy="18" r="0.7" fill="white"/>
      <circle cx="20" cy="18" r="0.7" fill="white"/>
      {/* Beak */}
      <path d="M14 22 L18 22 L16 25Z" fill="#f97316"/>
      <text x="5" y="31" fontSize="7" fontWeight="900" fill="#ef4444" fontFamily="Arial Black">BONUS</text>
    </svg>
  );
}

function BombSvg({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="20" r="10" fill="#1f2937"/>
      <circle cx="16" cy="20" r="9" fill="#374151"/>
      <path d="M16 10 L18 6 L22 5 L21 8" stroke="#6b7280" strokeWidth="1.5" fill="none"/>
      <circle cx="21" cy="5" r="2" fill="#f59e0b"/>
      <circle cx="12" cy="16" r="3" fill="rgba(255,255,255,0.15)"/>
    </svg>
  );
}

function CrateBlock({
  cell, isDestroying, isHit,
}: {
  cell: CrateCell;
  isDestroying?: boolean;
  isHit?: boolean;
}) {
  const cfg = CRATE_COLORS[cell.type] ?? CRATE_COLORS['wooden']!;
  const hpPct = cell.maxHp > 0 ? cell.hp / cell.maxHp : 0;

  return (
    <div
      className={isDestroying ? 'rd-destroy' : isHit ? 'rd-hit' : undefined}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1',
        background: cell.hp <= 0 ? 'transparent' : cfg.bg,
        border: cell.hp <= 0 ? '1px dashed rgba(255,255,255,0.06)' : `1.5px solid ${cfg.border}`,
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        transition: 'box-shadow 0.15s ease',
        boxShadow: isHit ? `0 0 10px ${cfg.border}, 0 0 20px ${cfg.border}55` : 'none',
      }}>
      {cell.hp > 0 && (
        <>
          {/* HP bar */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
            background: 'rgba(0,0,0,0.4)',
          }}>
            <div style={{
              height: '100%',
              width: `${hpPct * 100}%`,
              background: hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#f59e0b' : '#ef4444',
              transition: 'width 0.25s ease',
            }} />
          </div>
          <span style={{ fontSize: 8, opacity: 0.85 }}>
            {cell.type === 'royal' ? '👑' : cell.type === 'metal' ? '🔩' : cell.type === 'stone' ? '🪨' : '📦'}
          </span>
        </>
      )}
    </div>
  );
}

function ChestBlock({ opened, multiplier }: { opened: boolean; multiplier?: number }) {
  return (
    <div
      className={opened ? 'rd-chest-open' : undefined}
      style={{
        width: '100%',
        aspectRatio: '1',
        background: opened
          ? 'linear-gradient(145deg,#fbbf24,#d97706)'
          : 'linear-gradient(145deg,#7a5a20,#4a3510)',
        border: `1.5px solid ${opened ? '#fcd34d' : '#a0722a'}`,
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: opened ? '0 0 14px rgba(251,191,36,0.7), 0 0 28px rgba(251,191,36,0.3)' : 'none',
        transition: 'box-shadow 0.3s ease',
        fontSize: 7,
        fontWeight: 900,
        color: opened ? '#92400e' : '#d97706',
        gap: 1,
      }}>
      <span style={{ fontSize: 12 }}>{opened ? '🎁' : '🔒'}</span>
      {opened && multiplier && (
        <span style={{ fontSize: 8, color: '#92400e' }}>{multiplier}x</span>
      )}
    </div>
  );
}

function ReelSymbolCell({ sym, animKey }: { sym: ReelSymbol; animKey?: number }) {
  const size = 22;
  const style = animKey !== undefined
    ? { animation: `rdReelSpin 0.2s ease ${(animKey % 5) * 0.04}s both` }
    : {};
  if (sym.type === 'bonus') return <div style={style}><BonusSvg size={size} /></div>;
  if (sym.type === 'bomb') return <div style={style}><BombSvg size={size} /></div>;
  const color = ROCKET_COLORS[sym.color ?? 'blue'] ?? '#3b82f6';
  return (
    <div style={{ position: 'relative', ...style }}>
      <RocketSvg color={color} size={size} />
      <div style={{
        position: 'absolute', bottom: -1, right: -2,
        background: 'rgba(0,0,0,0.75)', borderRadius: 3,
        fontSize: 6, fontWeight: 900, color: '#fff',
        padding: '1px 2px', lineHeight: 1,
      }}>{sym.damage}</div>
    </div>
  );
}

// ─── Info / Rules modal ───────────────────────────────────────────────────────

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480, maxHeight: '85dvh',
        background: '#0f1623', borderRadius: '20px 20px 0 0',
        border: '1px solid rgba(255,255,255,0.08)',
        overflowY: 'auto', padding: '20px 20px 40px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#f5c518' }}>How to play?</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer', padding: 0 }}>✕</button>
        </div>

        <div style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p><b style={{ color: '#f5c518' }}>1.</b> Specify your bet amount.</p>
          <p><b style={{ color: '#f5c518' }}>2.</b> Press Spin. 5 reels × 3 rows spin to reveal rockets, bombs, and bonus symbols.</p>
          <p><b style={{ color: '#f5c518' }}>3.</b> Each rocket has a color and damage value. Rockets fire down their column, destroying crates and earning coin rewards.</p>

          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(['wooden','sturdy','reinforced','metal','stone','royal'] as const).map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                  background: CRATE_COLORS[t]!.bg, border: `1px solid ${CRATE_COLORS[t]!.border}`,
                }} />
                <span style={{ textTransform: 'capitalize' }}>{t} crate</span>
              </div>
            ))}
          </div>

          <p><b style={{ color: '#f5c518' }}>4.</b> At the bottom of each column is a locked chest. When all crates in a column are destroyed, the chest opens and awards a multiplier (2x–100x). If multiple chests open, their multipliers multiply together.</p>
          <p><b style={{ color: '#f5c518' }}>5.</b> The bonus game triggers when 3+ scatter symbols (chicken 🐓 BONUS) land. The bonus is 4 free spins on the same grid — destruction carries over between spins.</p>
          <p><b style={{ color: '#f5c518' }}>6.</b> Bombs 💣 destroy all remaining crates in a column instantly.</p>

          <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: 11 }}>
            Malfunction voids all pays and plays.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ history }: { history: RoyalDropHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#475569', padding: '48px 0', fontSize: 14 }}>
        No spins yet
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {history.map(h => (
        <div key={h.id} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.03)', borderRadius: 10,
          padding: '10px 14px', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
              Bet {h.betAmount.toLocaleString()} ETB
              {h.bonusTriggered && <span style={{ marginLeft: 6, fontSize: 10, background: '#f59e0b', color: '#000', borderRadius: 4, padding: '1px 4px' }}>BONUS</span>}
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
              {new Date(h.createdAt).toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: h.status === 'won' ? '#4ade80' : '#f87171' }}>
              {h.status === 'won' ? `+${(h.payout ?? 0).toLocaleString()}` : '–'} ETB
            </div>
            <div style={{ fontSize: 10, color: '#475569' }}>{h.multiplier.toFixed(2)}x</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

type GamePhase = 'idle' | 'spinning' | 'result' | 'bonus';
type ActiveTab = 'GAME' | 'HISTORY';

export default function RoyalDropScreen() {
  const navigate = useNavigate();

  const [phase, setPhase] = useState<GamePhase>('idle');
  const [betIdx, setBetIdx] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('GAME');
  const [showRules, setShowRules] = useState(false);
  const [history, setHistory] = useState<RoyalDropHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ── access ─────────────────────────────────────────────────────────────────
  const [access, setAccess] = useState<'loading' | 'allowed' | 'denied'>('loading');

  useEffect(() => {
    checkRoyalDropAccess()
      .then(r => setAccess(r.allowed ? 'allowed' : 'denied'))
      .catch(() => setAccess('denied'));
  }, []);

  // Result state
  const [result, setResult] = useState<RoyalDropSpinResponse | null>(null);
  const [activeSpin, setActiveSpin] = useState<SpinOutcome | null>(null);
  const [bonusSpinIdx, setBonusSpinIdx] = useState(0);
  const [hitCells, setHitCells] = useState<Set<string>>(new Set());
  const [destroyedCells, setDestroyedCells] = useState<Set<string>>(new Set());
  const [openedChests, setOpenedChests] = useState<ChestResult[]>([]);
  const [displayGrid, setDisplayGrid] = useState<CrateCell[][] | null>(null);

  const lock = useRef(false);

  const betAmount = BET_OPTIONS[betIdx] ?? 1;

  // ── balance ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (access !== 'allowed') return;
    getProfile()
      .then(p => setBalance((p.playWallet?.balance ?? 0) + (p.mainWallet?.balance ?? 0)))
      .catch(() => {});
  }, [access]);

  // ── history on tab switch ──────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'HISTORY') {
      getRoyalDropHistory().then(setHistory).catch(() => {});
    }
  }, [activeTab]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Animate crate hits/destructions ───────────────────────────────────────
  const animateSpin = useCallback(async (spin: SpinOutcome) => {
    setActiveSpin(spin);
    setDisplayGrid(spin.initialGrid.map(col => col.map(c => ({ ...c }))));
    setHitCells(new Set());
    setDestroyedCells(new Set());
    setOpenedChests([]);

    // Brief pause before hits
    await new Promise(r => setTimeout(r, 400));

    // Show hit cells momentarily
    const hitted = new Set<string>();
    const destroyed = new Set<string>();

    for (const d of spin.destroyedCrates) {
      hitted.add(`${d.col}-${d.row}`);
    }
    setHitCells(new Set(hitted));

    await new Promise(r => setTimeout(r, 250));

    // Destroy crates one-by-one with slight delay
    for (const d of spin.destroyedCrates) {
      const key = `${d.col}-${d.row}`;
      destroyed.add(key);
      setDestroyedCells(new Set(destroyed));
      await new Promise(r => setTimeout(r, 80));
    }

    await new Promise(r => setTimeout(r, 300));

    // Show final grid
    setDisplayGrid(spin.finalGrid.map(col => col.map(c => ({ ...c }))));
    setHitCells(new Set());
    setDestroyedCells(new Set());

    // Reveal opened chests
    if (spin.openedChests.length > 0) {
      await new Promise(r => setTimeout(r, 200));
      setOpenedChests(spin.openedChests);
    }
  }, []);

  // ── Spin ───────────────────────────────────────────────────────────────────
  const doSpin = useCallback(async () => {
    if (lock.current || phase === 'spinning') return;
    lock.current = true;
    setError(null);
    setPhase('spinning');
    setResult(null);
    setActiveSpin(null);
    setOpenedChests([]);

    try {
      const res = await spinRoyalDrop(betAmount);
      setResult(res);
      setBalance(res.balance);

      // Animate base spin
      await animateSpin(res.baseSpins[0]!);

      if (res.bonusSpins.length > 0) {
        setPhase('bonus');
        // Run bonus spins sequentially
        for (let i = 0; i < res.bonusSpins.length; i++) {
          setBonusSpinIdx(i + 1);
          showToast(`🎰 Bonus spin ${i + 1} / 4`);
          await new Promise(r => setTimeout(r, 600));
          await animateSpin(res.bonusSpins[i]!);
        }
      }

      setPhase('result');

      if (res.totalWin > 0) {
        showToast(`🎉 You won ${res.totalWin.toLocaleString()} ETB!`);
      }

      // Refresh history in background
      getRoyalDropHistory().then(setHistory).catch(() => {});
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message ?? 'Spin failed');
      setPhase('idle');
    } finally {
      lock.current = false;
    }
  }, [betAmount, phase, animateSpin, showToast]);

  const canSpin = phase === 'idle' || phase === 'result';

  // ── Access guard ───────────────────────────────────────────────────────────
  if (access === 'loading') {
    return <div style={{ minHeight: '100dvh', background: 'linear-gradient(180deg,#1a2a4a 0%,#07101c 100%)' }} />;
  }
  if (access === 'denied') {
    return (
      <div style={{
        minHeight: '100dvh',
        background: 'linear-gradient(180deg,#1a2a4a 0%,#07101c 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '0 24px', textAlign: 'center', gap: 16, color: '#f8fafc',
      }}>
        <div style={{ fontSize: 56 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#f5c518' }}>Not Available Yet</div>
        <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, maxWidth: 300 }}>
          Royal Drop isn't available for your account yet. Check back soon.
        </div>
        <button onClick={() => navigate(-1)} style={{
          marginTop: 8, padding: '12px 28px', borderRadius: 12, border: 'none',
          background: 'rgba(255,255,255,0.08)', color: '#94a3b8',
          fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}>← Go Back</button>
      </div>
    );
  }

  // ── Build display grid (initial state if no spin yet) ─────────────────────
  const currentGrid = displayGrid ?? buildEmptyGrid();

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      height: '100dvh',
      background: 'linear-gradient(180deg,#87ceeb 0%,#5ba3d0 30%,#3a7ab8 60%,#1a4a7a 100%)',
      color: '#f8fafc',
      display: 'flex', flexDirection: 'column',
      maxWidth: 480, margin: '0 auto',
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes rdPulse { 0%,100%{opacity:0.7} 50%{opacity:1} }
        @keyframes rdSlideUp { from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes rdGlow { 0%,100%{box-shadow:0 0 8px rgba(251,191,36,0.4)} 50%{box-shadow:0 0 22px rgba(251,191,36,0.9)} }
        @keyframes rdShake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-3px)} 40%,80%{transform:translateX(3px)} }
        @keyframes rdHitFlash { 0%{filter:brightness(1)} 30%{filter:brightness(2.5) saturate(2)} 100%{filter:brightness(1)} }
        @keyframes rdDestroy { 0%{transform:scale(1);opacity:1} 60%{transform:scale(1.3) rotate(8deg);opacity:0.6} 100%{transform:scale(0);opacity:0} }
        @keyframes rdChestOpen { 0%{transform:scale(0.8) rotate(-5deg);opacity:0} 60%{transform:scale(1.15) rotate(3deg)} 100%{transform:scale(1) rotate(0deg);opacity:1} }
        @keyframes rdReelSpin { 0%{transform:translateY(-14px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes rdWinPop { 0%{transform:scale(0.85);opacity:0} 60%{transform:scale(1.06)} 100%{transform:scale(1);opacity:1} }
        @keyframes rdSpinBtn { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes rdBonusBadge { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
        @keyframes rdArchFloat { 0%,100%{opacity:0.18} 50%{opacity:0.28} }
        .rd-spin-btn:active { transform: scale(0.92) !important; }
        .rd-hit { animation: rdHitFlash 0.3s ease forwards !important; }
        .rd-destroy { animation: rdDestroy 0.3s ease forwards !important; }
        .rd-chest-open { animation: rdChestOpen 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards !important; }
      `}</style>

      {/* ── Arch / castle background decoration ─────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        overflow: 'hidden',
      }}>
        {/* Left arch pillar */}
        <div style={{
          position: 'absolute', left: -18, top: 0, bottom: 0, width: 72,
          background: 'linear-gradient(90deg,rgba(210,180,120,0.55),rgba(210,180,120,0.15))',
          borderRadius: '0 60px 60px 0',
          animation: 'rdArchFloat 4s ease infinite',
        }} />
        {/* Right arch pillar */}
        <div style={{
          position: 'absolute', right: -18, top: 0, bottom: 0, width: 72,
          background: 'linear-gradient(270deg,rgba(210,180,120,0.55),rgba(210,180,120,0.15))',
          borderRadius: '60px 0 0 60px',
          animation: 'rdArchFloat 4s ease infinite 0.5s',
        }} />
        {/* Arch top curve */}
        <div style={{
          position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
          width: '90%', height: 120,
          border: '12px solid rgba(210,180,120,0.35)',
          borderRadius: '50% 50% 0 0',
          borderBottom: 'none',
        }} />
        {/* Purple carpet at bottom */}
        <div style={{
          position: 'absolute', bottom: 60, left: 0, right: 0, height: 32,
          background: 'linear-gradient(180deg,rgba(120,60,160,0.6),rgba(80,20,120,0.7))',
        }} />
      </div>

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', zIndex: 10, position: 'relative',
        background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(6px)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)',
          color: '#fff', borderRadius: 10, padding: '6px 12px',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>← Back</button>

        {/* Royal Drop logo style */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: '#fbbf24', letterSpacing: '0.05em', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>👑 ROYAL</span>
          <span style={{ fontSize: 11, fontWeight: 900, color: '#fbbf24', letterSpacing: '0.05em', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>DROP</span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setActiveTab(activeTab === 'HISTORY' ? 'GAME' : 'HISTORY')} style={{
            background: activeTab === 'HISTORY' ? 'rgba(245,197,24,0.25)' : 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: activeTab === 'HISTORY' ? '#f5c518' : '#fff', borderRadius: 10, padding: '6px 10px',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>📋</button>
          <button onClick={() => setShowRules(true)} style={{
            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)',
            color: '#fff', borderRadius: 10, padding: '6px 10px',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>☰</button>
        </div>
      </div>

      {activeTab === 'HISTORY' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', position: 'relative', zIndex: 1 }}>
          <HistoryTab history={history} />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, overflow: 'hidden' }}>

          {/* ── Reel panel (always shown, empty slots when no spin) ─────────── */}
          <div style={{
            margin: '8px 12px 0',
            background: 'rgba(235,220,180,0.92)',
            border: '2px solid rgba(200,170,100,0.8)',
            borderRadius: 12, padding: '6px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            animation: activeSpin ? 'rdSlideUp 0.2s ease' : undefined,
          }}>
            {phase === 'bonus' && (
              <div style={{ textAlign: 'center', fontSize: 9, fontWeight: 900, color: '#b45309', letterSpacing: '0.1em', marginBottom: 4, animation: 'rdBonusBadge 1s ease infinite' }}>
                🎰 BONUS SPIN {bonusSpinIdx}/4
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2 }}>
              {Array.from({ length: 5 }, (_, ci) => (
                <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {Array.from({ length: 3 }, (__, ri) => {
                    const sym = activeSpin?.reels[ci]?.[ri];
                    return (
                      <div key={ri} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: sym?.type === 'bonus' ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.5)',
                        border: `1px solid ${sym?.type === 'bonus' ? 'rgba(245,158,11,0.6)' : 'rgba(180,140,80,0.4)'}`,
                        borderRadius: 5, padding: '2px', aspectRatio: '1',
                        minHeight: 32,
                      }}>
                        {sym && <ReelSymbolCell sym={sym} animKey={ci * 3 + ri} />}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {activeSpin && activeSpin.scatterCount >= 1 && (
              <div style={{
                marginTop: 4, textAlign: 'center', fontSize: 9, fontWeight: 800,
                color: activeSpin.scatterCount >= 3 ? '#b45309' : '#78716c',
                animation: activeSpin.scatterCount >= 3 ? 'rdPulse 0.8s ease infinite' : undefined,
              }}>
                🐓 {activeSpin.scatterCount} scatter{activeSpin.scatterCount > 1 ? 's' : ''}
                {activeSpin.scatterCount >= 3 && ' — BONUS!'}
              </div>
            )}
          </div>

          {/* ── Crate grid ───────────────────────────────────────────────────── */}
          <div style={{ flex: 1, margin: '6px 12px 0', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              flex: 1,
              background: 'rgba(20,35,60,0.55)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12, padding: '6px',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              {/* 7 crate rows */}
              {Array.from({ length: 7 }, (_, row) => (
                <div key={row} style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2, flex: 1 }}>
                  {Array.from({ length: 5 }, (__, col) => {
                    const cell = currentGrid[col]?.[row];
                    if (!cell) return <div key={col} />;
                    const key = `${col}-${row}`;
                    return (
                      <CrateBlock
                        key={col}
                        cell={cell}
                        isHit={hitCells.has(key)}
                        isDestroying={destroyedCells.has(key)}
                      />
                    );
                  })}
                </div>
              ))}

              {/* Chest row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 2 }}>
                {Array.from({ length: 5 }, (_, col) => {
                  const opened = openedChests.find(c => c.column === col);
                  return (
                    <ChestBlock
                      key={col}
                      opened={!!opened}
                      {...(opened?.multiplier !== undefined && { multiplier: opened.multiplier })}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Win display ──────────────────────────────────────────────────── */}
          {phase === 'result' && result && result.totalWin > 0 && (
            <div style={{
              margin: '6px 12px 0',
              background: 'linear-gradient(135deg,rgba(251,191,36,0.2),rgba(245,158,11,0.1))',
              border: '1px solid rgba(251,191,36,0.5)',
              borderRadius: 10, padding: '8px 12px', textAlign: 'center',
              animation: 'rdWinPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards, rdGlow 2s ease 0.5s infinite',
            }}>
              <div style={{ fontSize: 9, color: '#d97706', fontWeight: 800, letterSpacing: '0.1em' }}>TOTAL WIN</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#fbbf24' }}>
                {result.totalWin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
              </div>
              <div style={{ fontSize: 10, color: '#92400e' }}>{result.multiplier.toFixed(2)}x</div>
            </div>
          )}

          {/* ── Error ────────────────────────────────────────────────────────── */}
          {error && (
            <div style={{
              margin: '4px 12px 0', padding: '8px 12px', borderRadius: 8,
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#fca5a5', fontSize: 11, fontWeight: 600, animation: 'rdShake 0.4s ease',
            }}>{error}</div>
          )}

          {/* ── Bottom controls bar ──────────────────────────────────────────── */}
          <div style={{
            background: 'rgba(10,18,35,0.97)',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            padding: '8px 14px',
            paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
          }}>
            {/* Bet chips row */}
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 8 }}>
              {BET_OPTIONS.map((b, i) => (
                <button key={b} onClick={() => setBetIdx(i)} disabled={phase === 'spinning'} style={{
                  flexShrink: 0, padding: '4px 8px', borderRadius: 6,
                  border: `1px solid ${betIdx === i ? 'rgba(245,197,24,0.7)' : 'rgba(255,255,255,0.1)'}`,
                  background: betIdx === i ? 'rgba(245,197,24,0.18)' : 'rgba(255,255,255,0.05)',
                  color: betIdx === i ? '#f5c518' : '#64748b',
                  fontSize: 10, fontWeight: 800, cursor: 'pointer',
                }}>{b >= 1000 ? `${b / 1000}K` : b}</button>
              ))}
            </div>

            {/* Action row: BET | SPIN | BALANCE */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Left: BET */}
              <div style={{
                flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 10,
                padding: '6px 10px', border: '1px solid rgba(255,255,255,0.1)',
              }}>
                <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700, letterSpacing: '0.08em' }}>BET: ETB</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => setBetIdx(i => Math.max(0, i - 1))} disabled={betIdx === 0 || phase === 'spinning'} style={{
                    background: 'none', border: 'none', color: '#94a3b8', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1,
                    opacity: betIdx === 0 ? 0.3 : 1,
                  }}>‹</button>
                  <span style={{ fontSize: 16, fontWeight: 900, color: '#f5c518', flex: 1, textAlign: 'center' }}>
                    {betAmount.toLocaleString()}
                  </span>
                  <button onClick={() => setBetIdx(i => Math.min(BET_OPTIONS.length - 1, i + 1))} disabled={betIdx === BET_OPTIONS.length - 1 || phase === 'spinning'} style={{
                    background: 'none', border: 'none', color: '#94a3b8', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1,
                    opacity: betIdx === BET_OPTIONS.length - 1 ? 0.3 : 1,
                  }}>›</button>
                </div>
              </div>

              {/* Center: SPIN button (large circle) */}
              <button
                className="rd-spin-btn"
                onClick={() => void doSpin()}
                disabled={!canSpin}
                style={{
                  width: 64, height: 64, borderRadius: '50%', border: 'none', flexShrink: 0,
                  background: phase === 'spinning'
                    ? 'linear-gradient(135deg,#374151,#1f2937)'
                    : 'linear-gradient(135deg,#22c55e,#16a34a)',
                  color: '#fff',
                  fontSize: 24,
                  cursor: canSpin ? 'pointer' : 'default',
                  boxShadow: canSpin ? '0 4px 18px rgba(34,197,94,0.5), 0 0 0 3px rgba(34,197,94,0.15)' : 'none',
                  transition: 'all 0.2s ease',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {phase === 'spinning'
                  ? <span style={{ animation: 'rdSpinBtn 0.8s linear infinite', display: 'inline-block' }}>⟳</span>
                  : '🔄'}
              </button>

              {/* Right: BALANCE */}
              <div style={{
                flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 10,
                padding: '6px 10px', border: '1px solid rgba(255,255,255,0.1)',
                textAlign: 'right',
              }}>
                <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700, letterSpacing: '0.08em' }}>ETB</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#94a3b8' }}>
                  {balance === null ? '—' : balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Phase label */}
            {phase === 'bonus' && (
              <div style={{ textAlign: 'center', marginTop: 6, fontSize: 11, fontWeight: 900, color: '#f59e0b', animation: 'rdBonusBadge 1s ease infinite' }}>
                🎰 BONUS SPIN {bonusSpinIdx}/4
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Toast ────────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 110, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12, padding: '9px 18px',
          fontSize: 12, fontWeight: 700, color: '#f0f9ff',
          whiteSpace: 'nowrap', zIndex: 400,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          animation: 'rdSlideUp 0.3s ease',
        }}>{toast}</div>
      )}

      {/* ── Rules modal ───────────────────────────────────────────────────────── */}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CRATE_TYPES = ['wooden', 'sturdy', 'reinforced', 'metal', 'stone', 'royal'] as const;
const CRATE_DEF: Record<string, { hp: number; reward: number }> = {
  wooden:     { hp: 1, reward: 0.05 },
  sturdy:     { hp: 2, reward: 0.08 },
  reinforced: { hp: 3, reward: 0.12 },
  metal:      { hp: 4, reward: 0.18 },
  stone:      { hp: 5, reward: 0.25 },
  royal:      { hp: 6, reward: 0.40 },
};

const ROW_DIST: (typeof CRATE_TYPES[number])[][] = [
  ['wooden', 'wooden', 'wooden', 'sturdy', 'wooden'],
  ['wooden', 'sturdy', 'wooden', 'sturdy', 'reinforced'],
  ['sturdy', 'reinforced', 'sturdy', 'metal', 'reinforced'],
  ['reinforced', 'metal', 'reinforced', 'metal', 'stone'],
  ['metal', 'stone', 'metal', 'stone', 'royal'],
  ['stone', 'royal', 'stone', 'royal', 'stone'],
  ['royal', 'royal', 'royal', 'royal', 'royal'],
];

function buildEmptyGrid(): CrateCell[][] {
  return Array.from({ length: 5 }, (_, col) =>
    Array.from({ length: 7 }, (__, row) => {
      const type = ROW_DIST[row]![col]!;
      const def = CRATE_DEF[type]!;
      return { type, hp: def.hp, maxHp: def.hp, reward: def.reward };
    }),
  );
}
