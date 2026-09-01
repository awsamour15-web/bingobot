import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile, dropPlinko, getPlinkoHistory } from '../lib/api';

type Risk = 'low' | 'medium' | 'high';
type Rows = 8 | 12 | 16;

const MIN_BET = 5;
const MAX_BET = 10_000;

// ─── Multiplier tables (must match backend) ───────────────────────────────────
const MULTIPLIERS: Record<Rows, Record<Risk, number[]>> = {
  8: {
    low:    [3.0, 1.5, 1.0, 0.8, 0.5, 0.8, 1.0, 1.5, 3.0],
    medium: [5.0, 2.0, 1.0, 0.6, 0.3, 0.6, 1.0, 2.0, 5.0],
    high:   [10,  3.0, 1.2, 0.4, 0.2, 0.4, 1.2, 3.0, 10],
  },
  12: {
    low:    [4.0, 2.0, 1.2, 1.0, 0.8, 0.5, 0.5, 0.8, 1.0, 1.2, 2.0, 4.0],
    medium: [8.0, 4.0, 2.0, 1.5, 0.8, 0.4, 0.4, 0.8, 1.5, 2.0, 4.0, 8.0],
    high:   [25,  10,  4.0, 2.0, 0.8, 0.3, 0.3, 0.8, 2.0, 4.0, 10,  25],
  },
  16: {
    low:    [5.0, 3.0, 1.5, 1.2, 1.0, 0.8, 0.5, 0.3, 0.3, 0.5, 0.8, 1.0, 1.2, 1.5, 3.0, 5.0],
    medium: [12,  6.0, 3.0, 2.0, 1.5, 1.0, 0.8, 0.4, 0.4, 0.8, 1.0, 1.5, 2.0, 3.0, 6.0, 12],
    high:   [50,  20,  10,  5.0, 3.0, 2.0, 0.5, 0.3, 0.3, 0.5, 2.0, 3.0, 5.0, 10,  20,  50],
  },
};

function mulColor(m: number): string {
  if (m >= 10)  return '#f97316';
  if (m >= 3)   return '#eab308';
  if (m >= 1.5) return '#22c55e';
  if (m >= 1.0) return '#3b82f6';
  return '#ef4444';
}

// ─── Canvas board geometry ────────────────────────────────────────────────────
const PAD_X = 18;
const PAD_TOP = 20;
const PAD_BOT = 48; // room for multiplier labels

function boardGeometry(canvasW: number, canvasH: number, rows: number) {
  const cols = rows + 1; // number of pegs on widest row
  const slotCount = rows + 1;
  const boardW = canvasW - PAD_X * 2;
  const boardH = canvasH - PAD_TOP - PAD_BOT;
  const colSpacing = boardW / cols;
  const rowSpacing = boardH / (rows + 1);
  const pegR = Math.max(3, Math.min(6, colSpacing * 0.18));
  const ballR = pegR * 1.3;

  // Peg positions: row r has (r+2) pegs, centred
  function pegPos(row: number, col: number): { x: number; y: number } {
    const pegsInRow = row + 2;
    const totalW = (pegsInRow - 1) * colSpacing;
    const startX = PAD_X + (boardW - totalW) / 2;
    return {
      x: startX + col * colSpacing,
      y: PAD_TOP + (row + 1) * rowSpacing,
    };
  }

  // Slot centres at the bottom
  function slotPos(slot: number): { x: number; cx: number } {
    const totalW = (slotCount - 1) * colSpacing;
    const startX = PAD_X + (boardW - totalW) / 2;
    return {
      x: startX + slot * colSpacing - colSpacing / 2,
      cx: startX + slot * colSpacing,
    };
  }

  return { pegPos, slotPos, pegR, ballR, rowSpacing, colSpacing, slotCount, boardH };
}

// ─── Ball animation ───────────────────────────────────────────────────────────
interface BallAnim {
  path: number[];   // 0=left,1=right per row
  rows: number;
  risk: Risk;
  slot: number;
  multiplier: number;
  payout: number;
  betAmount: number;
}

interface AnimState {
  id: string;          // unique id for this ball
  ball: BallAnim;
  rowIdx: number;       // which row bounce we're at (0 = top, rows = landed)
  progress: number;     // 0..1 within current segment
  startMs: number;
  done: boolean;
  flashSlot: number;    // -1 or slot index when landed
}

const SEG_MS = 120; // ms per peg-to-peg hop
const MULTI_DROP_DELAY = 300; // ms delay between each ball drop

// ─── History entry ────────────────────────────────────────────────────────────
interface HistEntry {
  id: string; betAmount: number; rows: number; risk: string;
  slot: number; multiplier: number; payout: number; createdAt: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PlinkoScreen() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animsRef = useRef<AnimState[]>([]); // Support multiple balls
  const rafRef = useRef<number>(0);

  const [mainBalance, setMainBalance] = useState<number | null>(null);
  const [playBalance, setPlayBalance] = useState<number | null>(null);
  const [walletType, setWalletType] = useState<'main' | 'play'>('play');
  const [bet, setBet] = useState(10);
  const [ballCount, setBallCount] = useState(1); // Number of balls to drop
  const [rows, setRows] = useState<Rows>(12);
  const [risk, setRisk] = useState<Risk>('medium');
  const [dropping, setDropping] = useState(false);
  const [lastResult, setLastResult] = useState<{ multiplier: number; payout: number; bet: number } | null>(null);
  const [history, setHistory] = useState<HistEntry[]>([]);
  const [tab, setTab] = useState<'game' | 'history'>('game');
  const [error, setError] = useState<string | null>(null);

  // Load profile
  useEffect(() => {
    getProfile().then(p => {
      setMainBalance(p.mainWallet.balance);
      setPlayBalance(p.playWallet.balance);
    }).catch(() => {});
  }, []);

  // Load history when tab switches
  useEffect(() => {
    if (tab === 'history') {
      getPlinkoHistory().then(setHistory).catch(() => {});
    }
  }, [tab]);

  // ─── Draw board ─────────────────────────────────────────────────────────────
  const drawBoard = useCallback((anims: AnimState[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const { pegPos, slotPos, pegR, ballR, rowSpacing, colSpacing, slotCount } = boardGeometry(W, H, rows);
    const muls = MULTIPLIERS[rows][risk];

    ctx.clearRect(0, 0, W, H);

    // Draw multiplier slots
    for (let s = 0; s < slotCount; s++) {
      const { x } = slotPos(s);
      const slotW = colSpacing - 4;
      const slotH = PAD_BOT - 10;
      const slotY = H - slotH - 6;
      const m = muls[s] ?? 0;
      const col = mulColor(m);
      const isFlash = anims.some(a => a.done && a.flashSlot === s);

      ctx.save();
      ctx.fillStyle = isFlash ? col : col + '33';
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, slotY, slotW, slotH, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = isFlash ? '#fff' : col;
      ctx.font = `bold ${Math.max(8, Math.min(11, colSpacing * 0.35))}px Inter,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = `${m}x`;
      ctx.fillText(label, x + slotW / 2, slotY + slotH / 2);
      ctx.restore();
    }

    // Draw pegs
    for (let r = 0; r < rows; r++) {
      const pegsInRow = r + 2;
      for (let c = 0; c < pegsInRow; c++) {
        const { x, y } = pegPos(r, c);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, pegR, 0, Math.PI * 2);
        ctx.fillStyle = '#94a3b8';
        ctx.fill();
        ctx.restore();
      }
    }

    // Draw all active balls
    anims.forEach(anim => {
      if (anim.done) return;
      
      const { rowIdx, progress, ball } = anim;
      let bx: number, by: number;

      if (rowIdx === 0) {
        // Dropping from top to first peg row
        const targetPeg = pegPos(0, ball.path[0] === 1 ? 1 : 0);
        bx = (W / 2) * (1 - progress) + targetPeg.x * progress;
        by = PAD_TOP * (1 - progress) + targetPeg.y * progress;
      } else if (rowIdx < rows) {
        // Moving peg to peg
        const fromRow = rowIdx - 1;
        const toRow = rowIdx;
        let fromCol = 0;
        for (let i = 0; i < fromRow; i++) fromCol += ball.path[i] ?? 0;
        const toCol = fromCol + (ball.path[rowIdx] ?? 0);
        const fromPeg = pegPos(fromRow, fromCol);
        const toPeg = pegPos(toRow, toCol);
        bx = fromPeg.x * (1 - progress) + toPeg.x * progress;
        by = fromPeg.y * (1 - progress) + toPeg.y * progress;
      } else {
        // Last peg to slot
        const lastRow = rows - 1;
        let lastCol = 0;
        for (let i = 0; i < lastRow; i++) lastCol += ball.path[i] ?? 0;
        const lastPeg = pegPos(lastRow, lastCol);
        const { cx } = slotPos(ball.slot);
        const slotY = H - PAD_BOT + 4;
        bx = lastPeg.x * (1 - progress) + cx * progress;
        by = lastPeg.y * (1 - progress) + slotY * progress;
      }

      // Draw realistic 3D ball
      ctx.save();
      
      // Outer glow
      const col = mulColor(ball.multiplier);
      ctx.shadowBlur = 10;
      ctx.shadowColor = col + '66';
      
      // Create radial gradient for 3D effect
      const gradient = ctx.createRadialGradient(
        bx - ballR * 0.3, by - ballR * 0.3, ballR * 0.1,
        bx, by, ballR
      );
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.3, '#f0f0f0');
      gradient.addColorStop(0.7, '#d0d0d0');
      gradient.addColorStop(1, '#a0a0a0');
      
      // Draw ball with gradient
      ctx.beginPath();
      ctx.arc(bx, by, ballR, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // Add subtle border
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Highlight (shine effect)
      ctx.beginPath();
      ctx.arc(bx - ballR * 0.35, by - ballR * 0.35, ballR * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();
      
      ctx.restore();
    });
  }, [rows, risk]);


  // ─── Animation loop ──────────────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const anims = animsRef.current;
    if (!anims.length) return;

    let allDone = true;
    anims.forEach(anim => {
      if (!anim.done) {
        allDone = false;
        const elapsed = Date.now() - anim.startMs;
        const totalSeg = anim.ball.rows + 1; // rows pegs + drop to slot
        const segIdx = Math.min(Math.floor(elapsed / SEG_MS), totalSeg - 1);
        const segProgress = Math.min((elapsed - segIdx * SEG_MS) / SEG_MS, 1);

        anim.rowIdx = segIdx;
        anim.progress = segProgress;

        if (segIdx >= totalSeg - 1 && segProgress >= 1) {
          anim.done = true;
          anim.flashSlot = anim.ball.slot;
        }
      }
    });

    drawBoard(anims);

    // If all balls are done, stop animation and refresh balance
    if (allDone) {
      setDropping(false);
      // Calculate total payout from all balls
      const totalPayout = anims.reduce((sum, a) => sum + a.ball.payout, 0);
      const totalBet = anims.reduce((sum, a) => sum + a.ball.betAmount, 0);
      const avgMultiplier = totalPayout / totalBet;
      setLastResult({ multiplier: avgMultiplier, payout: totalPayout, bet: totalBet });
      
      // Refresh balance
      getProfile().then(p => {
        setMainBalance(p.mainWallet.balance);
        setPlayBalance(p.playWallet.balance);
      }).catch(() => {});
      
      // Clear animations after a delay
      setTimeout(() => {
        animsRef.current = [];
        drawBoard([]);
      }, 2000);
      return;
    }

    rafRef.current = requestAnimationFrame(runLoop);
  }, [drawBoard]);

  // Initial draw
  useEffect(() => {
    drawBoard([]);
  }, [drawBoard]);

  // ─── Drop handler ────────────────────────────────────────────────────────────
  async function handleDrop() {
    if (dropping) return;
    setError(null);
    setLastResult(null);
    setDropping(true);
    animsRef.current = [];
    
    try {
      // Drop balls one by one with delay
      for (let i = 0; i < ballCount; i++) {
        const result = await dropPlinko(bet, rows, risk, walletType);
        const anim: AnimState = {
          id: `${Date.now()}-${i}`,
          ball: { ...result, rows, risk },
          rowIdx: 0,
          progress: 0,
          startMs: Date.now(),
          done: false,
          flashSlot: -1,
        };
        animsRef.current.push(anim);
        
        // Start animation loop on first ball
        if (i === 0) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(runLoop);
        }
        
        // Wait before dropping next ball (except for last one)
        if (i < ballCount - 1) {
          await new Promise(resolve => setTimeout(resolve, MULTI_DROP_DELAY));
        }
      }
    } catch (err: any) {
      setDropping(false);
      animsRef.current = [];
      setError(err?.message ?? 'Something went wrong');
    }
  }

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ─── Canvas size ─────────────────────────────────────────────────────────────
  const canvasH = rows === 8 ? 240 : rows === 12 ? 280 : 320;

  return (
    <div style={{ minHeight: '100dvh', background: '#060b18', color: '#f8fafc', fontFamily: "'Inter',sans-serif", display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <button onClick={() => navigate('/')} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>← Back</button>
        <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.3px' }}>🎱 Plinko</span>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Balance</div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#4ade80' }}>M: {mainBalance !== null ? mainBalance.toFixed(2) : '—'}</div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#818cf8' }}>P: {playBalance !== null ? playBalance.toFixed(2) : '—'}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        {(['game', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '10px 0', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #818cf8' : '2px solid transparent', color: tab === t ? '#818cf8' : '#475569', fontSize: 12, fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {t === 'game' ? '🎱 Game' : '📋 History'}
          </button>
        ))}
      </div>

      {tab === 'history' ? (
        <HistoryTab items={history} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

          {/* Board */}
          <div style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '6px 0', flexShrink: 0 }}>
            <canvas
              ref={canvasRef}
              width={Math.min(window.innerWidth, 480)}
              height={canvasH}
              style={{ display: 'block', width: '100%', height: canvasH }}
            />
          </div>

          {/* Scrollable controls area */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* Result banner */}
            {lastResult && (
              <div style={{ margin: '8px 14px 0', padding: '10px 14px', borderRadius: 10, background: lastResult.payout >= lastResult.bet ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)', border: `1px solid ${lastResult.payout >= lastResult.bet ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.25)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>{lastResult.multiplier}x</span>
                <span style={{ fontSize: 15, fontWeight: 900, color: lastResult.payout >= lastResult.bet ? '#4ade80' : '#f87171' }}>
                  {lastResult.payout >= lastResult.bet ? '+' : ''}{(lastResult.payout - lastResult.bet).toFixed(2)} ETB
                </span>
              </div>
            )}

            {error && (
              <div style={{ margin: '8px 14px 0', padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 11, color: '#f87171', flexShrink: 0 }}>{error}</div>
            )}

            {/* Controls */}
            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* Rows selector */}
              <div>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Rows</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([8, 12, 16] as Rows[]).map(r => (
                    <button key={r} onClick={() => { setRows(r); setLastResult(null); }} style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: rows === r ? '#818cf8' : 'rgba(255,255,255,0.06)', border: `1px solid ${rows === r ? '#818cf8' : 'rgba(255,255,255,0.1)'}`, color: rows === r ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>{r}</button>
                  ))}
                </div>
              </div>

              {/* Risk selector */}
              <div>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Risk</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['low', 'medium', 'high'] as Risk[]).map(r => {
                    const col = r === 'low' ? '#22c55e' : r === 'medium' ? '#eab308' : '#ef4444';
                    return (
                      <button key={r} onClick={() => setRisk(r)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: risk === r ? col + '33' : 'rgba(255,255,255,0.06)', border: `1px solid ${risk === r ? col : 'rgba(255,255,255,0.1)'}`, color: risk === r ? col : '#94a3b8', fontSize: 12, fontWeight: 800, cursor: 'pointer', textTransform: 'capitalize' }}>{r}</button>
                    );
                  })}
                </div>
              </div>

              {/* Ball count selector */}
              <div>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Number of Balls</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 3, 5, 10].map(count => (
                    <button key={count} onClick={() => setBallCount(count)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: ballCount === count ? '#818cf8' : 'rgba(255,255,255,0.06)', border: `1px solid ${ballCount === count ? '#818cf8' : 'rgba(255,255,255,0.1)'}`, color: ballCount === count ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>{count}</button>
                  ))}
                </div>
              </div>

              {/* Bet amount */}
              <div>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Bet (ETB)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <button onClick={() => setBet(b => Math.max(MIN_BET, b - (b >= 100 ? 10 : 1)))} style={{ width: 38, height: 40, borderRadius: '8px 0 0 8px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRight: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>−</button>
                  <input
                    type="number" value={bet} min={MIN_BET} max={MAX_BET}
                    onChange={e => setBet(Math.min(MAX_BET, Math.max(MIN_BET, Number(e.target.value) || MIN_BET)))}
                    style={{ flex: 1, height: 40, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderLeft: 'none', borderRight: 'none', color: '#fff', fontSize: 15, fontWeight: 800, textAlign: 'center', outline: 'none' }}
                  />
                  <button onClick={() => setBet(b => Math.min(MAX_BET, b + (b >= 100 ? 10 : 1)))} style={{ width: 38, height: 40, borderRadius: '0 8px 8px 0', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderLeft: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>+</button>
                  <button onClick={() => setBet(b => Math.min(MAX_BET, b * 2))} style={{ marginLeft: 5, padding: '0 11px', height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>x2</button>
                  <button onClick={() => setBet(MAX_BET)} style={{ marginLeft: 4, padding: '0 11px', height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>MAX</button>
                </div>
              </div>

              {/* Drop button */}
              <button
                onClick={handleDrop}
                disabled={dropping}
                style={{ width: '100%', height: 48, borderRadius: 12, background: dropping ? 'rgba(129,140,248,0.3)' : 'linear-gradient(135deg,#818cf8,#6366f1)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 900, cursor: dropping ? 'not-allowed' : 'pointer', letterSpacing: '-0.2px', transition: 'opacity 0.15s', marginTop: 2 }}
              >
                {dropping ? 'Dropping…' : `🎱 Drop ${ballCount} Ball${ballCount > 1 ? 's' : ''} (${(bet * ballCount).toFixed(0)} ETB)`}
              </button>

              {/* Mini multiplier preview */}
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Multipliers ({rows} rows · {risk})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {MULTIPLIERS[rows][risk].map((m, i) => (
                    <div key={i} style={{ padding: '2px 7px', borderRadius: 5, background: mulColor(m) + '22', border: `1px solid ${mulColor(m)}55`, fontSize: 9, fontWeight: 800, color: mulColor(m) }}>{m}x</div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────
function HistoryTab({ items }: { items: HistEntry[] }) {
  if (!items.length) return <div style={{ textAlign: 'center', padding: 48, color: '#475569' }}>No history yet</div>;
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {items.map(item => {
        const won = item.payout >= item.betAmount;
        return (
          <div key={item.id} style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0' }}>{item.rows} rows · {item.risk} · {item.multiplier}x</div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{new Date(item.createdAt).toLocaleString()} · Bet {item.betAmount} ETB</div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, color: won ? '#4ade80' : '#f87171' }}>
              {won ? '+' : ''}{(item.payout - item.betAmount).toFixed(2)} ETB
            </div>
          </div>
        );
      })}
    </div>
  );
}
