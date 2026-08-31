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
    low:    [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
    medium: [13,  3,   1.3, 0.7, 0.4, 0.7, 1.3, 3,   13],
    high:   [29,  4,   1.5, 0.3, 0.2, 0.3, 1.5, 4,   29],
  },
  12: {
    low:    [8.9, 3,   1.4, 1.1, 1.0, 0.5, 0.5, 1.0, 1.1, 1.4, 3,   8.9],
    medium: [33,  11,  4,   2,   1.1, 0.6, 0.6, 1.1, 2,   4,   11,  33],
    high:   [170, 24,  8.1, 2,   0.7, 0.2, 0.2, 0.7, 2,   8.1, 24,  170],
  },
  16: {
    low:    [16,  9,   2,   1.4, 1.1, 1.0, 0.5, 0.3, 0.3, 0.5, 1.0, 1.1, 1.4, 2,   9,   16],
    medium: [110, 41,  10,  5,   3,   1.5, 1.0, 0.5, 0.5, 1.0, 1.5, 3,   5,   10,  41,  110],
    high:   [1000,130, 26,  9,   4,   2,   0.2, 0.2, 0.2, 0.2, 2,   4,   9,   26,  130, 1000],
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
  ball: BallAnim;
  rowIdx: number;       // which row bounce we're at (0 = top, rows = landed)
  progress: number;     // 0..1 within current segment
  startMs: number;
  done: boolean;
  flashSlot: number;    // -1 or slot index when landed
}

const SEG_MS = 120; // ms per peg-to-peg hop

// ─── History entry ────────────────────────────────────────────────────────────
interface HistEntry {
  id: string; betAmount: number; rows: number; risk: string;
  slot: number; multiplier: number; payout: number; createdAt: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PlinkoScreen() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<AnimState | null>(null);
  const rafRef = useRef<number>(0);

  const [balance, setBalance] = useState<number | null>(null);
  const [bet, setBet] = useState(10);
  const [rows, setRows] = useState<Rows>(12);
  const [risk, setRisk] = useState<Risk>('medium');
  const [dropping, setDropping] = useState(false);
  const [lastResult, setLastResult] = useState<{ multiplier: number; payout: number; bet: number } | null>(null);
  const [history, setHistory] = useState<HistEntry[]>([]);
  const [tab, setTab] = useState<'game' | 'history'>('game');
  const [error, setError] = useState<string | null>(null);

  // Load profile
  useEffect(() => {
    getProfile().then(p => setBalance(p.mainWallet.balance)).catch(() => {});
  }, []);

  // Load history when tab switches
  useEffect(() => {
    if (tab === 'history') {
      getPlinkoHistory().then(setHistory).catch(() => {});
    }
  }, [tab]);

  // ─── Draw board ─────────────────────────────────────────────────────────────
  const drawBoard = useCallback((anim: AnimState | null) => {
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
      const isFlash = anim?.flashSlot === s;

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

    // Draw ball
    if (anim && !anim.done) {
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

      const col = mulColor(ball.multiplier);
      ctx.save();
      // Glow
      ctx.shadowBlur = 12;
      ctx.shadowColor = col;
      ctx.beginPath();
      ctx.arc(bx, by, ballR, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.restore();
    }
  }, [rows, risk]);

  // ─── Animation loop ──────────────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const anim = animRef.current;
    if (!anim) return;

    if (!anim.done) {
      const elapsed = Date.now() - anim.startMs;
      const totalSeg = anim.ball.rows + 1; // rows pegs + drop to slot
      const segIdx = Math.min(Math.floor(elapsed / SEG_MS), totalSeg - 1);
      const segProgress = Math.min((elapsed - segIdx * SEG_MS) / SEG_MS, 1);

      anim.rowIdx = segIdx;
      anim.progress = segProgress;

      if (segIdx >= totalSeg - 1 && segProgress >= 1) {
        anim.done = true;
        anim.flashSlot = anim.ball.slot;
        drawBoard(anim);
        setDropping(false);
        setLastResult({ multiplier: anim.ball.multiplier, payout: anim.ball.payout, bet: anim.ball.betAmount });
        // Refresh balance
        getProfile().then(p => setBalance(p.mainWallet.balance)).catch(() => {});
        return;
      }
    }

    drawBoard(anim);
    rafRef.current = requestAnimationFrame(runLoop);
  }, [drawBoard]);

  // Initial draw
  useEffect(() => {
    drawBoard(null);
  }, [drawBoard]);

  // ─── Drop handler ────────────────────────────────────────────────────────────
  async function handleDrop() {
    if (dropping) return;
    setError(null);
    setLastResult(null);
    setDropping(true);
    try {
      const result = await dropPlinko(bet, rows, risk);
      const anim: AnimState = {
        ball: { ...result, rows, risk },
        rowIdx: 0,
        progress: 0,
        startMs: Date.now(),
        done: false,
        flashSlot: -1,
      };
      animRef.current = anim;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(runLoop);
    } catch (err: any) {
      setDropping(false);
      setError(err?.message ?? 'Something went wrong');
    }
  }

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ─── Canvas size ─────────────────────────────────────────────────────────────
  const canvasH = rows === 8 ? 280 : rows === 12 ? 340 : 400;

  return (
    <div style={{ minHeight: '100dvh', background: '#060b18', color: '#f8fafc', fontFamily: "'Inter',sans-serif", display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <button onClick={() => navigate('/')} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>← Back</button>
        <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.3px' }}>🎱 Plinko</span>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Balance</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#fff7e6' }}>{balance !== null ? balance.toFixed(2) : '—'} <span style={{ fontSize: 9, color: '#d89b2b' }}>ETB</span></div>
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
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* Board */}
          <div style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '8px 0' }}>
            <canvas
              ref={canvasRef}
              width={Math.min(window.innerWidth, 480)}
              height={canvasH}
              style={{ display: 'block', width: '100%', height: canvasH }}
            />
          </div>

          {/* Result banner */}
          {lastResult && (
            <div style={{ margin: '10px 14px 0', padding: '12px 16px', borderRadius: 12, background: lastResult.payout >= lastResult.bet ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)', border: `1px solid ${lastResult.payout >= lastResult.bet ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.25)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>{lastResult.multiplier}x</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: lastResult.payout >= lastResult.bet ? '#4ade80' : '#f87171' }}>
                {lastResult.payout >= lastResult.bet ? '+' : ''}{(lastResult.payout - lastResult.bet).toFixed(2)} ETB
              </span>
            </div>
          )}

          {error && (
            <div style={{ margin: '10px 14px 0', padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 12, color: '#f87171' }}>{error}</div>
          )}

          {/* Controls */}
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Rows selector */}
            <div>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Rows</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {([8, 12, 16] as Rows[]).map(r => (
                  <button key={r} onClick={() => { setRows(r); setLastResult(null); }} style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: rows === r ? '#818cf8' : 'rgba(255,255,255,0.06)', border: `1px solid ${rows === r ? '#818cf8' : 'rgba(255,255,255,0.1)'}`, color: rows === r ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>{r}</button>
                ))}
              </div>
            </div>

            {/* Risk selector */}
            <div>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Risk</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['low', 'medium', 'high'] as Risk[]).map(r => {
                  const col = r === 'low' ? '#22c55e' : r === 'medium' ? '#eab308' : '#ef4444';
                  return (
                    <button key={r} onClick={() => setRisk(r)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: risk === r ? col + '33' : 'rgba(255,255,255,0.06)', border: `1px solid ${risk === r ? col : 'rgba(255,255,255,0.1)'}`, color: risk === r ? col : '#94a3b8', fontSize: 12, fontWeight: 800, cursor: 'pointer', textTransform: 'capitalize' }}>{r}</button>
                  );
                })}
              </div>
            </div>

            {/* Bet amount */}
            <div>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Bet (ETB)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <button onClick={() => setBet(b => Math.max(MIN_BET, b - (b >= 100 ? 10 : 1)))} style={{ width: 40, height: 42, borderRadius: '8px 0 0 8px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRight: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' }}>−</button>
                <input
                  type="number" value={bet} min={MIN_BET} max={MAX_BET}
                  onChange={e => setBet(Math.min(MAX_BET, Math.max(MIN_BET, Number(e.target.value) || MIN_BET)))}
                  style={{ flex: 1, height: 42, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderLeft: 'none', borderRight: 'none', color: '#fff', fontSize: 16, fontWeight: 800, textAlign: 'center', outline: 'none' }}
                />
                <button onClick={() => setBet(b => Math.min(MAX_BET, b + (b >= 100 ? 10 : 1)))} style={{ width: 40, height: 42, borderRadius: '0 8px 8px 0', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderLeft: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' }}>+</button>
                <button onClick={() => setBet(b => Math.min(MAX_BET, b * 2))} style={{ marginLeft: 6, padding: '0 12px', height: 42, borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>x2</button>
                <button onClick={() => setBet(MAX_BET)} style={{ marginLeft: 4, padding: '0 12px', height: 42, borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>MAX</button>
              </div>
            </div>

            {/* Drop button */}
            <button
              onClick={handleDrop}
              disabled={dropping}
              style={{ width: '100%', height: 52, borderRadius: 14, background: dropping ? 'rgba(129,140,248,0.3)' : 'linear-gradient(135deg,#818cf8,#6366f1)', border: 'none', color: '#fff', fontSize: 16, fontWeight: 900, cursor: dropping ? 'not-allowed' : 'pointer', letterSpacing: '-0.2px', transition: 'opacity 0.15s' }}
            >
              {dropping ? 'Dropping…' : '🎱 Drop Ball'}
            </button>

          </div>

          {/* Mini multiplier preview */}
          <div style={{ padding: '0 14px 20px' }}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Multipliers ({rows} rows · {risk})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {MULTIPLIERS[rows][risk].map((m, i) => (
                <div key={i} style={{ padding: '3px 8px', borderRadius: 6, background: mulColor(m) + '22', border: `1px solid ${mulColor(m)}55`, fontSize: 10, fontWeight: 800, color: mulColor(m) }}>{m}x</div>
              ))}
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
