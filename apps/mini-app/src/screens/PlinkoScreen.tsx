import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile, dropPlinko, getPlinkoHistory } from '../lib/api';

type Risk = 'low' | 'medium' | 'high';
type Rows = 8 | 12 | 16;

const MIN_BET = 5;
const MAX_BET = 10_000;

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
  if (m >= 25) return '#ff6b35';
  if (m >= 10) return '#f97316';
  if (m >= 5)  return '#eab308';
  if (m >= 2)  return '#22c55e';
  if (m >= 1)  return '#3b82f6';
  return '#ef4444';
}

function mulGlow(m: number): string {
  if (m >= 25) return 'rgba(255,107,53,0.8)';
  if (m >= 10) return 'rgba(249,115,22,0.7)';
  if (m >= 5)  return 'rgba(234,179,8,0.7)';
  if (m >= 2)  return 'rgba(34,197,94,0.6)';
  if (m >= 1)  return 'rgba(59,130,246,0.6)';
  return 'rgba(239,68,68,0.6)';
}

const PAD_X = 16;
const PAD_TOP = 22;
const PAD_BOT = 52;

function boardGeometry(canvasW: number, canvasH: number, rows: number) {
  const cols = rows + 1;
  const slotCount = rows + 1;
  const boardW = canvasW - PAD_X * 2;
  const boardH = canvasH - PAD_TOP - PAD_BOT;
  const colSpacing = boardW / cols;
  const rowSpacing = boardH / (rows + 1);
  const pegR = Math.max(3.5, Math.min(6.5, colSpacing * 0.19));
  const ballR = pegR * 1.35;

  function pegPos(row: number, col: number) {
    const pegsInRow = row + 2;
    const totalW = (pegsInRow - 1) * colSpacing;
    const startX = PAD_X + (boardW - totalW) / 2;
    return { x: startX + col * colSpacing, y: PAD_TOP + (row + 1) * rowSpacing };
  }

  function slotPos(slot: number) {
    const totalW = (slotCount - 1) * colSpacing;
    const startX = PAD_X + (boardW - totalW) / 2;
    return {
      x: startX + slot * colSpacing - colSpacing / 2,
      cx: startX + slot * colSpacing,
    };
  }

  return { pegPos, slotPos, pegR, ballR, rowSpacing, colSpacing, slotCount, boardH };
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; r: number; color: string; }
interface BallAnim { path: number[]; rows: number; risk: Risk; slot: number; multiplier: number; payout: number; betAmount: number; }
interface AnimState {
  id: string; ball: BallAnim; rowIdx: number; progress: number;
  startMs: number; done: boolean; flashSlot: number; trail: { x: number; y: number; t: number }[];
}
interface HistEntry { id: string; betAmount: number; rows: number; risk: string; slot: number; multiplier: number; payout: number; createdAt: string; }

const SEG_MS = 110;
const MULTI_DROP_DELAY = 280;

// Easing for smooth arc motion
function easeInOut(t: number): number { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
function easeOut(t: number): number { return 1 - Math.pow(1 - t, 3); }

export default function PlinkoScreen() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animsRef = useRef<AnimState[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const pegHitsRef = useRef<{ x: number; y: number; t: number; r: number }[]>([]);
  const rafRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

  const [mainBalance, setMainBalance] = useState<number | null>(null);
  const [playBalance, setPlayBalance] = useState<number | null>(null);
  const [walletType, setWalletType] = useState<'main' | 'play'>('play');
  const [bet, setBet] = useState(10);
  const [ballCount, setBallCount] = useState(1);
  const [rows, setRows] = useState<Rows>(12);
  const [risk, setRisk] = useState<Risk>('medium');
  const [dropping, setDropping] = useState(false);
  const [lastResult, setLastResult] = useState<{ multiplier: number; payout: number; bet: number } | null>(null);
  const [history, setHistory] = useState<HistEntry[]>([]);
  const [tab, setTab] = useState<'game' | 'history'>('game');
  const [error, setError] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    getProfile().then(p => {
      setMainBalance(p.mainWallet.balance);
      setPlayBalance(p.playWallet.balance);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'history') getPlinkoHistory().then(setHistory).catch(() => {});
  }, [tab]);

  // Spawn landing particles
  function spawnParticles(x: number, y: number, color: string, count = 18) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 1.5 + Math.random() * 3.5;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 1, maxLife: 1,
        r: 1.5 + Math.random() * 2.5,
        color,
      });
    }
  }

  // ─── Draw ────────────────────────────────────────────────────────────────────
  const drawBoard = useCallback((anims: AnimState[], now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const { pegPos, slotPos, pegR, ballR, slotCount, colSpacing } = boardGeometry(W, H, rows);
    const muls = MULTIPLIERS[rows][risk];

    ctx.clearRect(0, 0, W, H);

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d1b2e');
    bg.addColorStop(1, '#060b18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle grid lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.02)';
    ctx.lineWidth = 1;
    for (let i = 0; i < W; i += 30) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); }
    for (let i = 0; i < H; i += 30) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke(); }
    ctx.restore();

    // ── Multiplier slots ──
    for (let s = 0; s < slotCount; s++) {
      const { x } = slotPos(s);
      const slotW = colSpacing - 5;
      const slotH = PAD_BOT - 12;
      const slotY = H - slotH - 8;
      const m = muls[s] ?? 0;
      const col = mulColor(m);
      const glow = mulGlow(m);
      const isFlash = anims.some(a => a.done && a.flashSlot === s);
      const pulse = isFlash ? 0.9 + 0.1 * Math.sin(now * 0.015) : 0;

      ctx.save();
      if (isFlash) {
        ctx.shadowBlur = 18 + pulse * 10;
        ctx.shadowColor = glow;
      }
      // Slot background
      const slotGrad = ctx.createLinearGradient(x, slotY, x, slotY + slotH);
      if (isFlash) {
        slotGrad.addColorStop(0, col + 'cc');
        slotGrad.addColorStop(1, col + '66');
      } else {
        slotGrad.addColorStop(0, col + '28');
        slotGrad.addColorStop(1, col + '10');
      }
      ctx.fillStyle = slotGrad;
      ctx.strokeStyle = isFlash ? col : col + '55';
      ctx.lineWidth = isFlash ? 1.5 : 1;
      ctx.beginPath();
      ctx.roundRect(x, slotY, slotW, slotH, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isFlash ? '#fff' : col + 'cc';
      ctx.font = `bold ${Math.max(8, Math.min(11, colSpacing * 0.36))}px Inter,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${m}x`, x + slotW / 2, slotY + slotH / 2);
      ctx.restore();
    }

    // ── Peg hit ripples ──
    pegHitsRef.current = pegHitsRef.current.filter(h => {
      const age = (now - h.t) / 400;
      if (age >= 1) return false;
      ctx.save();
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r + age * 8, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(129,140,248,${0.6 * (1 - age)})`;
      ctx.lineWidth = 1.5 * (1 - age);
      ctx.stroke();
      ctx.restore();
      return true;
    });

    // ── Pegs ──
    for (let r = 0; r < rows; r++) {
      const pegsInRow = r + 2;
      for (let c = 0; c < pegsInRow; c++) {
        const { x, y } = pegPos(r, c);
        ctx.save();
        // Peg glow
        ctx.shadowBlur = 6;
        ctx.shadowColor = 'rgba(129,140,248,0.4)';
        // Peg gradient for 3D look
        const pegGrad = ctx.createRadialGradient(x - pegR * 0.3, y - pegR * 0.3, pegR * 0.05, x, y, pegR);
        pegGrad.addColorStop(0, '#c7d2fe');
        pegGrad.addColorStop(0.5, '#818cf8');
        pegGrad.addColorStop(1, '#4338ca');
        ctx.beginPath();
        ctx.arc(x, y, pegR, 0, Math.PI * 2);
        ctx.fillStyle = pegGrad;
        ctx.fill();
        // Highlight
        ctx.beginPath();
        ctx.arc(x - pegR * 0.3, y - pegR * 0.35, pegR * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fill();
        ctx.restore();
      }
    }

    // ── Ball trails ──
    anims.forEach(anim => {
      if (anim.done || !anim.trail.length) return;
      const col = mulColor(anim.ball.multiplier);
      anim.trail.forEach((pt, i) => {
        const age = (now - pt.t) / 300;
        if (age >= 1) return;
        const alpha = (1 - age) * 0.35 * ((i + 1) / anim.trail.length);
        const r = ballR * 0.7 * (1 - age * 0.5);
        ctx.save();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fillStyle = col + Math.round(alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();
        ctx.restore();
      });
    });

    // ── Balls ──
    anims.forEach(anim => {
      if (anim.done) return;
      const { rowIdx, progress, ball } = anim;
      const ep = easeInOut(progress);
      let bx: number, by: number;

      if (rowIdx === 0) {
        const targetPeg = pegPos(0, ball.path[0] === 1 ? 1 : 0);
        bx = (W / 2) * (1 - ep) + targetPeg.x * ep;
        by = PAD_TOP * (1 - ep) + targetPeg.y * ep;
      } else if (rowIdx < rows) {
        const fromRow = rowIdx - 1;
        let fromCol = 0;
        for (let i = 0; i < fromRow; i++) fromCol += ball.path[i] ?? 0;
        const toCol = fromCol + (ball.path[rowIdx] ?? 0);
        const fromPeg = pegPos(fromRow, fromCol);
        const toPeg = pegPos(rowIdx, toCol);
        // Arc bounce
        const arc = Math.sin(progress * Math.PI) * 4;
        bx = fromPeg.x + (toPeg.x - fromPeg.x) * ep;
        by = fromPeg.y + (toPeg.y - fromPeg.y) * ep - arc;
      } else {
        const lastRow = rows - 1;
        let lastCol = 0;
        for (let i = 0; i < lastRow; i++) lastCol += ball.path[i] ?? 0;
        const lastPeg = pegPos(lastRow, lastCol);
        const { cx } = slotPos(ball.slot);
        const slotY = H - PAD_BOT + 6;
        bx = lastPeg.x + (cx - lastPeg.x) * easeOut(progress);
        by = lastPeg.y + (slotY - lastPeg.y) * easeOut(progress);
      }

      // Update trail
      anim.trail.push({ x: bx, y: by, t: now });
      if (anim.trail.length > 12) anim.trail.shift();

      const col = mulColor(ball.multiplier);

      ctx.save();
      // Outer glow
      ctx.shadowBlur = 16;
      ctx.shadowColor = col + 'aa';

      // Ball gradient (3D sphere look)
      const ballGrad = ctx.createRadialGradient(bx - ballR * 0.32, by - ballR * 0.32, ballR * 0.05, bx, by, ballR);
      ballGrad.addColorStop(0, '#ffffff');
      ballGrad.addColorStop(0.25, '#f0f4ff');
      ballGrad.addColorStop(0.6, col + 'dd');
      ballGrad.addColorStop(1, col + '88');

      ctx.beginPath();
      ctx.arc(bx, by, ballR, 0, Math.PI * 2);
      ctx.fillStyle = ballGrad;
      ctx.fill();

      // Rim
      ctx.strokeStyle = col + 'cc';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Shine
      ctx.beginPath();
      ctx.arc(bx - ballR * 0.33, by - ballR * 0.33, ballR * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fill();
      ctx.restore();
    });

    // ── Particles ──
    particlesRef.current = particlesRef.current.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= 0.03;
      if (p.life <= 0) return false;
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 4;
      ctx.shadowColor = p.color;
      ctx.fill();
      ctx.restore();
      return true;
    });

  }, [rows, risk]);

  // ─── Animation loop ──────────────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const now = Date.now();
    timeRef.current = now;
    const anims = animsRef.current;
    if (!anims.length && !particlesRef.current.length) return;

    let allDone = true;
    anims.forEach(anim => {
      if (!anim.done) {
        allDone = false;
        const elapsed = now - anim.startMs;
        const totalSeg = anim.ball.rows + 1;
        const segIdx = Math.min(Math.floor(elapsed / SEG_MS), totalSeg - 1);
        const rawProgress = Math.min((elapsed - segIdx * SEG_MS) / SEG_MS, 1);
        const prevRow = anim.rowIdx;
        anim.rowIdx = segIdx;
        anim.progress = rawProgress;

        // Spawn peg hit effect when transitioning rows
        if (segIdx !== prevRow && segIdx < anim.ball.rows) {
          const { pegPos } = boardGeometry(
            canvasRef.current?.width ?? 360,
            canvasRef.current?.height ?? 320,
            rows
          );
          let col = 0;
          for (let i = 0; i < segIdx - 1; i++) col += anim.ball.path[i] ?? 0;
          col += anim.ball.path[segIdx] ?? 0;
          const peg = pegPos(segIdx, col);
          pegHitsRef.current.push({ x: peg.x, y: peg.y, t: now, r: 5 });
        }

        if (segIdx >= totalSeg - 1 && rawProgress >= 1) {
          anim.done = true;
          anim.flashSlot = anim.ball.slot;
          // Landing particles
          const canvas = canvasRef.current;
          if (canvas) {
            const { slotPos } = boardGeometry(canvas.width, canvas.height, rows);
            const { cx } = slotPos(anim.ball.slot);
            spawnParticles(cx, canvas.height - PAD_BOT + 6, mulColor(anim.ball.multiplier), 22);
          }
        }
      }
    });

    drawBoard(anims, now);

    if (allDone && !particlesRef.current.length) {
      setDropping(false);
      const totalPayout = anims.reduce((s, a) => s + a.ball.payout, 0);
      const totalBet = anims.reduce((s, a) => s + a.ball.betAmount, 0);
      setLastResult({ multiplier: totalPayout / totalBet, payout: totalPayout, bet: totalBet });
      setShowResult(true);
      getProfile().then(p => {
        setMainBalance(p.mainWallet.balance);
        setPlayBalance(p.playWallet.balance);
      }).catch(() => {});
      setTimeout(() => { animsRef.current = []; drawBoard([], Date.now()); }, 2500);
      return;
    }

    rafRef.current = requestAnimationFrame(runLoop);
  }, [drawBoard, rows]);

  useEffect(() => { drawBoard([], Date.now()); }, [drawBoard]);

  async function handleDrop() {
    if (dropping) return;
    setError(null);
    setLastResult(null);
    setShowResult(false);
    setDropping(true);
    animsRef.current = [];
    particlesRef.current = [];

    try {
      for (let i = 0; i < ballCount; i++) {
        const result = await dropPlinko(bet, rows, risk, walletType);
        animsRef.current.push({
          id: `${Date.now()}-${i}`,
          ball: { ...result, rows, risk },
          rowIdx: 0, progress: 0,
          startMs: Date.now(),
          done: false, flashSlot: -1, trail: [],
        });
        if (i === 0) { cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(runLoop); }
        if (i < ballCount - 1) await new Promise(r => setTimeout(r, MULTI_DROP_DELAY));
      }
    } catch (err: any) {
      setDropping(false);
      animsRef.current = [];
      setError(err?.message ?? 'Something went wrong');
    }
  }

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const canvasH = rows === 8 ? 250 : rows === 12 ? 300 : 340;
  const balance = walletType === 'main' ? mainBalance : playBalance;

  return (
    <div style={{ minHeight: '100dvh', background: '#060b18', color: '#f8fafc', fontFamily: "'Inter',sans-serif", display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto', position: 'relative', overflow: 'hidden' }}>

      {/* Ambient background orbs */}
      <div style={{ position: 'absolute', top: -80, left: -60, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'absolute', top: 120, right: -80, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.09) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, position: 'relative', zIndex: 1, background: 'rgba(6,11,24,0.85)', backdropFilter: 'blur(12px)' }}>
        <button onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: 10, padding: '7px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}>
          ← Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🎱</div>
          <span style={{ fontSize: 16, fontWeight: 900, background: 'linear-gradient(135deg,#c7d2fe,#a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Plinko</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 8, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 1 }}>{walletType} wallet</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: walletType === 'main' ? '#4ade80' : '#818cf8' }}>
            {balance !== null ? balance.toFixed(2) : '—'} <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.7 }}>ETB</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, position: 'relative', zIndex: 1, background: 'rgba(6,11,24,0.6)' }}>
        {(['game', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '11px 0', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #818cf8' : '2px solid transparent', color: tab === t ? '#a5b4fc' : '#475569', fontSize: 11, fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em', transition: 'color 0.15s' }}>
            {t === 'game' ? '🎱 Play' : '📋 History'}
          </button>
        ))}
      </div>

      {tab === 'history' ? (
        <HistoryTab items={history} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', zIndex: 1 }}>

          {/* Board */}
          <div style={{ background: 'linear-gradient(180deg, rgba(13,27,46,0.9) 0%, rgba(6,11,24,0.95) 100%)', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, position: 'relative' }}>
            <canvas
              ref={canvasRef}
              width={Math.min(window.innerWidth, 480)}
              height={canvasH}
              style={{ display: 'block', width: '100%', height: canvasH }}
            />
            {/* Dropping overlay text */}
            {dropping && (
              <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 20, padding: '4px 14px', fontSize: 10, fontWeight: 800, color: '#a5b4fc', letterSpacing: '0.1em', backdropFilter: 'blur(8px)' }}>
                ● LIVE
              </div>
            )}
          </div>

          {/* Scrollable controls */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* Result banner */}
            {showResult && lastResult && (
              <div style={{ margin: '10px 14px 0', padding: '12px 16px', borderRadius: 14, background: lastResult.payout >= lastResult.bet ? 'linear-gradient(135deg,rgba(34,197,94,0.15),rgba(16,185,129,0.08))' : 'linear-gradient(135deg,rgba(239,68,68,0.15),rgba(220,38,38,0.08))', border: `1px solid ${lastResult.payout >= lastResult.bet ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: 'fadeSlideIn 0.3s ease' }}>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Result</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: lastResult.payout >= lastResult.bet ? '#4ade80' : '#f87171', marginTop: 2 }}>
                    {lastResult.payout >= lastResult.bet ? '+' : ''}{(lastResult.payout - lastResult.bet).toFixed(2)} ETB
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800 }}>MULTIPLIER</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: mulColor(lastResult.multiplier) }}>{lastResult.multiplier.toFixed(2)}x</div>
                </div>
              </div>
            )}

            {error && (
              <div style={{ margin: '8px 14px 0', padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 12, color: '#f87171' }}>{error}</div>
            )}

            {/* Controls */}
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Wallet toggle */}
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', padding: 3, gap: 2 }}>
                {(['main', 'play'] as const).map(w => (
                  <button key={w} onClick={() => setWalletType(w)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: walletType === w ? (w === 'main' ? 'rgba(74,222,128,0.15)' : 'rgba(129,140,248,0.15)') : 'transparent', border: `1px solid ${walletType === w ? (w === 'main' ? 'rgba(74,222,128,0.3)' : 'rgba(129,140,248,0.3)') : 'transparent'}`, color: walletType === w ? (w === 'main' ? '#4ade80' : '#818cf8') : '#475569', fontSize: 11, fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize' }}>
                    {w === 'main' ? '💰' : '🎮'} {w} · {w === 'main' ? (mainBalance?.toFixed(0) ?? '—') : (playBalance?.toFixed(0) ?? '—')} ETB
                  </button>
                ))}
              </div>

              {/* Rows + Risk inline */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 9, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Rows</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {([8, 12, 16] as Rows[]).map(r => (
                      <button key={r} onClick={() => { setRows(r); setLastResult(null); setShowResult(false); }} style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: rows === r ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${rows === r ? '#818cf8' : 'rgba(255,255,255,0.08)'}`, color: rows === r ? '#a5b4fc' : '#475569', fontSize: 13, fontWeight: 900, cursor: 'pointer', transition: 'all 0.15s' }}>{r}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Risk</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['low', 'medium', 'high'] as Risk[]).map(r => {
                      const c = r === 'low' ? '#22c55e' : r === 'medium' ? '#eab308' : '#ef4444';
                      return (
                        <button key={r} onClick={() => setRisk(r)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: risk === r ? c + '22' : 'rgba(255,255,255,0.04)', border: `1px solid ${risk === r ? c + '88' : 'rgba(255,255,255,0.08)'}`, color: risk === r ? c : '#475569', fontSize: 10, fontWeight: 900, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.15s' }}>
                          {r === 'low' ? '🟢' : r === 'medium' ? '🟡' : '🔴'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Ball count */}
              <div>
                <div style={{ fontSize: 9, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Balls</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 3, 5, 10].map(count => (
                    <button key={count} onClick={() => setBallCount(count)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: ballCount === count ? 'rgba(129,140,248,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${ballCount === count ? '#818cf8' : 'rgba(255,255,255,0.08)'}`, color: ballCount === count ? '#a5b4fc' : '#475569', fontSize: 13, fontWeight: 900, cursor: 'pointer', transition: 'all 0.15s' }}>
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bet */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: 9, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Bet per ball</div>
                  <div style={{ fontSize: 9, color: '#475569', fontWeight: 700 }}>Total: {(bet * ballCount).toFixed(0)} ETB</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => setBet(b => Math.max(MIN_BET, b <= 10 ? b - 1 : b <= 100 ? b - 5 : b - 10))} style={{ width: 40, height: 42, borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 300 }}>−</button>
                  <input type="number" value={bet} min={MIN_BET} max={MAX_BET}
                    onChange={e => setBet(Math.min(MAX_BET, Math.max(MIN_BET, Number(e.target.value) || MIN_BET)))}
                    style={{ flex: 1, height: 42, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: '#f8fafc', fontSize: 16, fontWeight: 900, textAlign: 'center', outline: 'none' }}
                  />
                  <button onClick={() => setBet(b => Math.min(MAX_BET, b <= 10 ? b + 1 : b <= 100 ? b + 5 : b + 10))} style={{ width: 40, height: 42, borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 300 }}>+</button>
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  {[10, 50, 100, 500].map(v => (
                    <button key={v} onClick={() => setBet(v)} style={{ flex: 1, padding: '5px 0', borderRadius: 7, background: bet === v ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${bet === v ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.07)'}`, color: bet === v ? '#a5b4fc' : '#475569', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>{v}</button>
                  ))}
                  <button onClick={() => setBet(b => Math.min(MAX_BET, b * 2))} style={{ flex: 1, padding: '5px 0', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#475569', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>×2</button>
                </div>
              </div>

              {/* Drop button */}
              <button onClick={handleDrop} disabled={dropping}
                style={{ width: '100%', height: 52, borderRadius: 14, background: dropping ? 'rgba(99,102,241,0.25)' : 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%)', border: dropping ? '1px solid rgba(99,102,241,0.3)' : 'none', color: '#fff', fontSize: 15, fontWeight: 900, cursor: dropping ? 'not-allowed' : 'pointer', letterSpacing: '-0.2px', boxShadow: dropping ? 'none' : '0 4px 24px rgba(99,102,241,0.45), 0 0 0 1px rgba(255,255,255,0.05) inset', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {dropping ? (
                  <>
                    <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
                    Dropping…
                  </>
                ) : (
                  `🎱 Drop ${ballCount > 1 ? `${ballCount} Balls` : 'Ball'} · ${(bet * ballCount).toFixed(0)} ETB`
                )}
              </button>

              {/* Multiplier preview */}
              <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 8, color: '#334155', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
                  Payouts · {rows}R · {risk}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {MULTIPLIERS[rows][risk].map((m, i) => (
                    <div key={i} style={{ padding: '3px 8px', borderRadius: 6, background: mulColor(m) + '18', border: `1px solid ${mulColor(m)}44`, fontSize: 9, fontWeight: 900, color: mulColor(m) }}>{m}x</div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function HistoryTab({ items }: { items: HistEntry[] }) {
  if (!items.length) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#334155', padding: 48 }}>
      <div style={{ fontSize: 36 }}>📋</div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>No history yet</div>
    </div>
  );
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {items.map(item => {
        const won = item.payout >= item.betAmount;
        const diff = item.payout - item.betAmount;
        return (
          <div key={item.id} style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: won ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)', border: `1px solid ${won ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: mulColor(item.multiplier), flexShrink: 0 }}>
                {item.multiplier}x
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#cbd5e1' }}>{item.rows} rows · {item.risk}</div>
                <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>{new Date(item.createdAt).toLocaleString()}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: won ? '#4ade80' : '#f87171' }}>
                {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
              </div>
              <div style={{ fontSize: 9, color: '#475569', fontWeight: 700 }}>Bet {item.betAmount} ETB</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
