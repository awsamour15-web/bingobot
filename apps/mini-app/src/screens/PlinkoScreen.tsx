import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile, dropPlinko, getPlinkoHistory, checkPlinkoAccess } from '../lib/api';

type Risk = 'easy' | 'medium' | 'hard';
type Rows = 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

// ─── Multiplier tables (from screenshots) ────────────────────────────────────

const MULTIPLIERS: Record<number, Record<Risk, number[]>> = {
  8:  { easy: [5,1.8,1.5,1,0.7,0.7,1,1.5,1.8,5],       medium: [10,3,1.2,0.6,0.3,0.6,1.2,3,10],       hard: [20,5,1.5,0.4,0.2,0.4,1.5,5,20] },
  9:  { easy: [5,1.8,1.5,1,0.7,0.7,1,1.5,1.8,5],       medium: [8.2,2.6,1.2,1.1,1,0.5,1,1.1,1.2,2.6,8.2], hard: [14,5,2.2,1,0.5,0.2,0.5,1,2.2,5,14] },
  10: { easy: [8.2,2.6,1.2,1.1,1,0.5,1,1.1,1.2,2.6,8.2], medium: [7.6,2.7,1.7,1.2,1,0.7,0.7,1,1.2,1.7,2.7,7.6], hard: [20,8,4,2,1,0.4,0.2,0.4,1,2,4,8,20] },
  11: { easy: [7.6,2.7,1.7,1.2,1,0.7,0.7,1,1.2,1.7,2.7,7.6], medium: [9,2.7,1.5,1.2,1.1,1,0.5,1,1.1,1.2,1.5,2.7,9], hard: [25,9,4,2,1,0.5,0.3,0.5,1,2,4,9,25] },
  12: { easy: [9,2.7,1.5,1.2,1.1,1,0.5,1,1.1,1.2,1.5,2.7,9], medium: [7.5,3.6,2.7,1.7,1,0.9,0.7,0.7,0.9,1,1.7,2.7,3.6,7.5], hard: [30,12,5,2,0.8,0.3,0.2,0.3,0.8,2,5,12,30] },
  13: { easy: [7.5,3.6,2.7,1.7,1,0.9,0.7,0.7,0.9,1,1.7,2.7,3.6,7.5], medium: [6.5,3.6,1.7,1.2,1.2,1.1,1,0.5,1,1.1,1.2,1.2,1.7,3.6,6.5], hard: [35,14,6,3,1.2,0.5,0.2,0.2,0.5,1.2,3,6,14,35] },
  14: { easy: [6.5,3.6,1.7,1.2,1.2,1.1,1,0.5,1,1.1,1.2,1.2,1.7,3.6,6.5], medium: [15,8,4,2,1.5,1,0.8,0.4,0.4,0.8,1,1.5,2,4,8,15], hard: [40,15,8,4,2,1,0.5,0.3,0.3,0.5,1,2,4,8,15,40] },
  15: { easy: [14,7,2.7,1.8,1.4,1.4,1,1,0.6,0.6,1,1.1,1.4,1.8,2.7,7,14], medium: [15,8,4,2,1.5,1,0.8,0.4,0.4,0.8,1,1.5,2,4,8,15,15], hard: [80,16,10,4.5,2.7,1.4,1,0.5,0.3,0.3,0.5,1,1.4,2.7,4.5,10,16,80] },
  16: { easy: [15,8,1.8,1.5,1,0.6,0.6,1,1.1,1.2,1.3,1.8,8,16,15],       medium: [20,8,4,2,1.5,1,0.8,0.4,0.4,0.8,1,1.5,2,4,8,20],       hard: [100,37,9,4.5,2.7,1.4,1,0.5,0.3,0.3,0.5,1,1.4,2.7,4.5,9,37,100] },
};

function getMultipliers(rows: Rows, risk: Risk): number[] {
  return MULTIPLIERS[rows]?.[risk] ?? MULTIPLIERS[16]![risk];
}

// Map UI rows to the 3 backend-supported row counts
function toApiRows(rows: Rows): 8 | 12 | 16 {
  if (rows <= 9) return 8;
  if (rows <= 13) return 12;
  return 16;
}

function slotColor(m: number): string {
  if (m >= 50)  return '#ef4444';
  if (m >= 10)  return '#f97316';
  if (m >= 3)   return '#eab308';
  if (m >= 1.5) return '#84cc16';
  if (m >= 1)   return '#22d3ee';
  if (m >= 0.5) return '#8b5cf6';
  return '#64748b';
}

function slotBg(m: number): string {
  if (m >= 50)  return 'rgba(239,68,68,0.25)';
  if (m >= 10)  return 'rgba(249,115,22,0.25)';
  if (m >= 3)   return 'rgba(234,179,8,0.22)';
  if (m >= 1.5) return 'rgba(132,204,22,0.22)';
  if (m >= 1)   return 'rgba(34,211,238,0.18)';
  if (m >= 0.5) return 'rgba(139,92,246,0.2)';
  return 'rgba(100,116,139,0.18)';
}

// ─── Audio ────────────────────────────────────────────────────────────────────

function createAudioCtx(): AudioContext | null {
  try { return new (window.AudioContext || (window as any).webkitAudioContext)(); }
  catch { return null; }
}

function playPegHit(ctx: AudioContext) {
  try {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(800 + Math.random() * 400, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.055);
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.065);
    o.start(); o.stop(ctx.currentTime + 0.07);
  } catch {}
}

function playLand(ctx: AudioContext, m: number) {
  try {
    const now = ctx.currentTime;
    if (m >= 10) {
      [523,659,784,1047].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine'; o.frequency.value = f;
        const t = now + i * 0.06;
        g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.start(t); o.stop(t + 0.45);
      });
    } else if (m >= 2) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'triangle'; o.frequency.value = 660;
      g.gain.setValueAtTime(0.14, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      o.start(); o.stop(now + 0.3);
    } else {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(160, now); o.frequency.exponentialRampToValueAtTime(55, now + 0.1);
      g.gain.setValueAtTime(0.1, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      o.start(); o.stop(now + 0.14);
    }
  } catch {}
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ball {
  id: string; x: number; y: number; vx: number; vy: number;
  color: string; glow: string; betAmount: number;
  trail: {x:number;y:number;a:number}[];
  status: 'falling'|'landed';
  serverSlot?: number; serverMult?: number; serverPayout?: number;
  serverPath?: number[];
  lastRow?: number;
}
interface PegRing { x:number;y:number;r:number;maxR:number;a:number;col:string; }
interface Particle { x:number;y:number;vx:number;vy:number;col:string;sz:number;a:number;dec:number; }
interface FloatTxt { x:number;y:number;text:string;col:string;a:number;vy:number;scale:number; }
interface SlotPop { intensity:number;ts:number; }
interface HistEntry { id:string;betAmount:number;rows:number;risk:string;slot:number;multiplier:number;payout:number;createdAt:string; }

const MIN_BET = 5;
const MAX_BET = 10_000;

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlinkoScreen() {
  const navigate = useNavigate();
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ballsRef     = useRef<Ball[]>([]);
  const ringsRef     = useRef<PegRing[]>([]);
  const partsRef     = useRef<Particle[]>([]);
  const floatsRef    = useRef<FloatTxt[]>([]);
  const slotPopsRef  = useRef<Map<number,SlotPop>>(new Map());
  const audioRef     = useRef<AudioContext|null>(null);
  const pegThrottle  = useRef(0);
  const autoTimer    = useRef<ReturnType<typeof setInterval>|null>(null);
  const [dims, setDims] = useState({ w: 390, h: 460 });

  const [mainBal, setMainBal] = useState<number|null>(null);
  const [playBal, setPlayBal] = useState<number|null>(null);
  const [serverBal, setServerBal] = useState<number|null>(null);
  const [bet, setBet]   = useState(2);
  const [rows, setRows] = useState<Rows>(16);
  const [risk, setRisk] = useState<Risk>('hard');
  const [dropping, setDropping] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [recent, setRecent] = useState<{m:number}[]>([]);
  const [history, setHistory] = useState<HistEntry[]>([]);
  const [tab, setTab]   = useState<'game'|'history'|'leaders'>('game');
  const [error, setError] = useState<string|null>(null);
  const [allowed, setAllowed] = useState<boolean|null>(null);

  // ─── Resize ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const w = Math.min(containerRef.current.offsetWidth, 480);
      const h = Math.max(340, Math.min(w * 1.05, 490));
      setDims({ w, h });
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ─── Audio unlock ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unlock = () => { if (!audioRef.current) audioRef.current = createAudioCtx(); };
    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('mousedown', unlock, { once: true });
    return () => { window.removeEventListener('touchstart', unlock); window.removeEventListener('mousedown', unlock); };
  }, []);

  // ─── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    getProfile().then(p => { setMainBal(p.mainWallet.balance); setPlayBal(p.playWallet.balance); }).catch(() => {});
    checkPlinkoAccess().then(r => setAllowed(r.allowed)).catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    if (tab === 'history') getPlinkoHistory().then(setHistory).catch(() => {});
  }, [tab]);

  // ─── Auto-play ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoPlay) { if (autoTimer.current) clearInterval(autoTimer.current); return; }
    autoTimer.current = setInterval(() => handleDrop(), 500);
    return () => { if (autoTimer.current) clearInterval(autoTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, bet, rows, risk]);

  // ─── Geometry ──────────────────────────────────────────────────────────────
  function calcGeom(w: number, h: number, r: number) {
    const topPad = 44, botPad = 56;
    const avail = h - topPad - botPad;
    const rowSpacing = avail / r;
    const pinR = Math.max(2.5, Math.min(4.2, 40 / r));
    const ballR = Math.max(4.5, Math.min(7.5, 58 / r));
    const bottomSpread = w * 0.9;
    const totalBottomPins = r + 2;
    const colSpacing = bottomSpread / (totalBottomPins - 1);
    const pegs: {x:number;y:number;row:number}[] = [];
    for (let row = 0; row < r; row++) {
      const pins = row + 3;
      const rowY = topPad + (row + 0.5) * rowSpacing;
      const rowW = (pins - 1) * colSpacing;
      const sx = (w - rowW) / 2;
      for (let c = 0; c < pins; c++) pegs.push({ x: sx + c * colSpacing, y: rowY, row });
    }
    const slotCount = r + 1;
    const slotsStartX = (w - slotCount * colSpacing) / 2;
    const slotY = h - botPad + 8;
    const slotH = 40;
    return { topPad, rowSpacing, colSpacing, pegs, pinR, ballR, slotY, slotH, slotsStartX, slotCount };
  }

  // ─── Win effects ───────────────────────────────────────────────────────────
  function spawnWinEffects(si: number, m: number, sx: number, sy: number, sw: number) {
    const big = m >= 5, jackpot = m >= 20;
    slotPopsRef.current.set(si, { intensity: jackpot ? 1 : big ? 0.7 : 0.4, ts: Date.now() });
    floatsRef.current.push({ x: sx+sw/2, y: sy-10, text: `${m}x`,
      col: jackpot?'#f87171':big?'#fbbf24':'#a5f3fc', a:1, vy: big?-1.6:-1.1, scale: jackpot?1.4:big?1.1:0.9 });
    const n = jackpot ? 40 : big ? 20 : 6;
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI/2 + (Math.random()-0.5)*Math.PI*0.85;
      const spd = Math.random()*(jackpot?7:big?5:3)+1.5;
      const cols = jackpot?['#ef4444','#f59e0b','#fff','#ec4899']:big?['#f59e0b','#22d3ee','#a3e635']:['#94a3b8','#22d3ee'];
      partsRef.current.push({
        x: sx+sw/2+(Math.random()-0.5)*sw*0.7, y: sy,
        vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd,
        col: cols[Math.floor(Math.random()*cols.length)]!, sz: Math.random()*(jackpot?5:3)+1.5,
        a: 1, dec: Math.random()*0.02+0.015,
      });
    }
  }

  // ─── Canvas loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) return;
    let afId: number, lastT = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastT) / 1000, 0.05); lastT = now;
      const { w, h } = dims;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== w*dpr || canvas.height !== h*dpr) {
        canvas.width = w*dpr; canvas.height = h*dpr;
      }
      ctx.save(); ctx.scale(dpr, dpr);
      const geom = calcGeom(w, h, rows);
      const { topPad, rowSpacing, colSpacing, pegs, pinR, ballR, slotY, slotH, slotsStartX, slotCount } = geom;
      const muls = getMultipliers(rows, risk);

      // ── BG ───────────────────────────────────────────────────────────────
      // Deep dark navy background
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0d0a1e');
      bg.addColorStop(1, '#07050f');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

      // Side rails (purple/pink gradient)
      const railW = Math.max(16, w * 0.08);
      // Left rail
      const lg = ctx.createLinearGradient(0, 0, railW, 0);
      lg.addColorStop(0, 'rgba(160,40,220,0.55)');
      lg.addColorStop(0.5, 'rgba(200,60,255,0.35)');
      lg.addColorStop(1, 'rgba(200,60,255,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, railW, h);
      // right rail
      const rg = ctx.createLinearGradient(w, 0, w-railW, 0);
      rg.addColorStop(0, 'rgba(160,40,220,0.55)');
      rg.addColorStop(0.5, 'rgba(200,60,255,0.35)');
      rg.addColorStop(1, 'rgba(200,60,255,0)');
      ctx.fillStyle = rg; ctx.fillRect(w-railW, 0, railW, h);

      // Rail shimmer lines
      ctx.save();
      ctx.strokeStyle = 'rgba(255,100,255,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(railW*0.6, 0); ctx.lineTo(railW*0.6, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w-railW*0.6, 0); ctx.lineTo(w-railW*0.6, h); ctx.stroke();
      ctx.restore();

      // Angled side decorations (like the diagonal yellow/green stripes in screenshot)
      ctx.save();
      ctx.globalAlpha = 0.18;
      // Left side stripes
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i%2===0 ? '#c4a000' : '#2d6a1f';
        ctx.beginPath();
        ctx.moveTo(0, h*0.25 + i*22); ctx.lineTo(railW*0.85, h*0.25 + i*22);
        ctx.lineTo(railW*0.85, h*0.25 + i*22 + 18); ctx.lineTo(0, h*0.25 + i*22 + 18);
        ctx.closePath(); ctx.fill();
      }
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i%2===0 ? '#c4a000' : '#2d6a1f';
        ctx.beginPath();
        ctx.moveTo(w, h*0.25 + i*22); ctx.lineTo(w-railW*0.85, h*0.25 + i*22);
        ctx.lineTo(w-railW*0.85, h*0.25 + i*22 + 18); ctx.lineTo(w, h*0.25 + i*22 + 18);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      // Subtle top glow where ball drops
      const tg = ctx.createRadialGradient(w/2, 0, 0, w/2, 0, w*0.35);
      tg.addColorStop(0, 'rgba(180,120,255,0.18)');
      tg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = tg; ctx.fillRect(0, 0, w, h*0.5);

      // ── Ball drop hole at top ────────────────────────────────────────────
      ctx.save();
      ctx.fillStyle = '#1a0a2e';
      ctx.beginPath(); ctx.ellipse(w/2, topPad-18, 16, 10, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(180,80,255,0.6)'; ctx.lineWidth = 2;
      ctx.stroke(); ctx.restore();

      // ── Physics ──────────────────────────────────────────────────────────
      const SUB = 4, subDt = dt / SUB, G = 660, rest = 0.5;
      for (let s = 0; s < SUB; s++) {
        for (let i = ballsRef.current.length - 1; i >= 0; i--) {
          const ball = ballsRef.current[i]!;
          if (ball.status !== 'falling') continue;
          ball.vy += G * subDt;
          ball.vx *= 1 - 0.1 * subDt;
          ball.vy *= 1 - 0.02 * subDt;
          ball.x += ball.vx * subDt;
          ball.y += ball.vy * subDt;

          if (s === 0 && Math.random() > 0.4) {
            ball.trail.unshift({ x: ball.x, y: ball.y, a: 0.7 });
            if (ball.trail.length > 9) ball.trail.pop();
          }

          // Pyramid walls
          const frac = Math.max(0, Math.min(1, (ball.y - topPad) / (rowSpacing * rows)));
          const halfW = (2 + (rows + 2 - 2) * frac) * colSpacing * 0.5;
          const wl = w/2 - halfW - ballR, wr = w/2 + halfW + ballR;
          if (ball.x < wl) { ball.x = wl; ball.vx = Math.abs(ball.vx)*0.5; }
          if (ball.x > wr) { ball.x = wr; ball.vx = -Math.abs(ball.vx)*0.5; }

          for (const peg of pegs) {
            const dx = ball.x - peg.x, dy = ball.y - peg.y;
            const d2 = dx*dx + dy*dy, md = ballR + pinR;
            if (d2 < md*md) {
              const d = Math.sqrt(d2) || 0.001;
              const nx = dx/d, ny = dy/d;
              ball.x += nx*(md-d); ball.y += ny*(md-d);
              const van = ball.vx*nx + ball.vy*ny;
              if (van < 0) {
                let jitter = (Math.random()-0.5)*0.15;
                if (ball.serverPath) {
                  const dir = ball.serverPath[peg.row];
                  if (dir !== undefined) {
                    const str = 0.52 + Math.random()*0.08;
                    jitter = dir === 1 ? str : -str;
                    ball.lastRow = peg.row;
                  }
                }
                const tx = -ny, ty = nx;
                const imp = -(1+rest)*van;
                ball.vx += (nx+tx*jitter)*imp; ball.vy += (ny+ty*jitter)*imp;
                if (ball.vy < -55) ball.vy = -55;
                ringsRef.current.push({ x:peg.x, y:peg.y, r:pinR, maxR:pinR*4, a:1, col:ball.color });
                const nowMs = performance.now();
                if (audioRef.current && nowMs - pegThrottle.current > 45) {
                  pegThrottle.current = nowMs;
                  playPegHit(audioRef.current);
                }
              }
            }
          }

          if (ball.y >= slotY) {
            ball.status = 'landed';
            const si = ball.serverSlot !== undefined
              ? ball.serverSlot
              : Math.max(0, Math.min(slotCount-1, Math.floor((ball.x-slotsStartX)/colSpacing)));
            const m = ball.serverMult ?? (muls[si] ?? 1);
            const payout = ball.serverPayout ?? ball.betAmount * m;
            ball.x = slotsStartX + si * colSpacing + colSpacing / 2;
            const col = slotColor(m);
            spawnWinEffects(si, m, slotsStartX+si*colSpacing, slotY, colSpacing);
            if (audioRef.current) playLand(audioRef.current, m);
          }
        }
      }

      // Handle landed balls
      const landed = ballsRef.current.filter(b => b.status === 'landed');
      if (landed.length) {
        ballsRef.current = ballsRef.current.filter(b => b.status === 'falling');
        const tp = landed.reduce((s,b)=>s+(b.serverPayout??b.betAmount),0);
        const tb = landed.reduce((s,b)=>s+b.betAmount,0);
        setRecent(p => [{ m: tp/tb }, ...p].slice(0, 20));
        if (ballsRef.current.length === 0) setDropping(false);
      }

      // ── Draw pegs ────────────────────────────────────────────────────────
      for (const peg of pegs) {
        ctx.save();
        // Outer glow
        ctx.shadowColor = 'rgba(220,200,80,0.4)'; ctx.shadowBlur = 6;
        // Peg body
        const pg = ctx.createRadialGradient(peg.x-pinR*0.25, peg.y-pinR*0.3, 0, peg.x, peg.y, pinR);
        pg.addColorStop(0, '#fffbe0'); pg.addColorStop(0.4, '#d4bc50'); pg.addColorStop(1, '#8a7020');
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.arc(peg.x, peg.y, pinR, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // ── Peg rings ────────────────────────────────────────────────────────
      for (let i = ringsRef.current.length-1; i >= 0; i--) {
        const rg2 = ringsRef.current[i]!;
        rg2.r += (rg2.maxR-rg2.r)*0.2+0.4; rg2.a *= 0.84;
        if (rg2.a > 0.04) {
          ctx.save(); ctx.strokeStyle=rg2.col; ctx.globalAlpha=rg2.a; ctx.lineWidth=1.5;
          ctx.beginPath(); ctx.arc(rg2.x,rg2.y,rg2.r,0,Math.PI*2); ctx.stroke(); ctx.restore();
        } else ringsRef.current.splice(i,1);
      }

      // ── Slot bars ────────────────────────────────────────────────────────
      const nowPop = Date.now();
      for (let i = 0; i < slotCount; i++) {
        const m = muls[i] ?? 0;
        const col = slotColor(m); const bg2 = slotBg(m);
        const sx = slotsStartX + i*colSpacing + 1.5, sw = colSpacing - 3;
        const pop = slotPopsRef.current.get(i);
        let scaleY = 1, offY = 0;
        if (pop) {
          const el = (nowPop-pop.ts)/1000;
          if (el < 0.4) {
            const spring = Math.sin((el/0.4)*Math.PI*2.8)*Math.exp(-el*5);
            scaleY = 1 + spring*pop.intensity*0.3; offY = -spring*pop.intensity*6;
          } else slotPopsRef.current.delete(i);
        }
        ctx.save();
        ctx.translate(sx+sw/2, slotY+offY+slotH/2); ctx.scale(1, scaleY); ctx.translate(-(sx+sw/2), -(slotY+offY+slotH/2));
        // Slot background
        ctx.fillStyle = bg2;
        ctx.beginPath(); ctx.roundRect(sx, slotY+offY, sw, slotH, Math.min(5, sw*0.22)); ctx.fill();
        // Slot border
        ctx.strokeStyle = col+'66'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(sx, slotY+offY, sw, slotH, Math.min(5, sw*0.22)); ctx.stroke();
        // Highlight
        const hl = ctx.createLinearGradient(sx, slotY+offY, sx, slotY+offY+slotH*0.4);
        hl.addColorStop(0, 'rgba(255,255,255,0.16)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hl;
        ctx.beginPath(); ctx.roundRect(sx, slotY+offY, sw, slotH*0.4, [Math.min(5,sw*0.22),Math.min(5,sw*0.22),0,0]); ctx.fill();
        // Text
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 4;
        const fs = Math.max(6, Math.min(10, sw*0.38));
        ctx.font = `bold ${fs}px Inter,sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${m}`, sx+sw/2, slotY+offY+slotH/2);
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // ── Ball trails + balls ───────────────────────────────────────────────
      for (const ball of ballsRef.current) {
        if (ball.status !== 'falling') continue;
        for (let t = ball.trail.length-1; t >= 0; t--) {
          const pt = ball.trail[t]!; pt.a *= 0.86;
          if (pt.a > 0.04) {
            ctx.save(); ctx.fillStyle = ball.color; ctx.globalAlpha = pt.a * 0.45;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, ballR*(0.35+(1-t/ball.trail.length)*0.55), 0, Math.PI*2); ctx.fill();
            ctx.restore();
          }
        }
        ctx.save();
        ctx.shadowColor = ball.glow; ctx.shadowBlur = 16;
        ctx.fillStyle = ball.color; ctx.beginPath(); ctx.arc(ball.x, ball.y, ballR, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(ball.x-ballR*0.3, ball.y-ballR*0.3, ballR*0.35, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }

      // ── Particles ────────────────────────────────────────────────────────
      for (let i = partsRef.current.length-1; i >= 0; i--) {
        const p = partsRef.current[i]!;
        p.x+=p.vx; p.y+=p.vy; p.vy+=0.14; p.a-=p.dec;
        if (p.a > 0) {
          ctx.save(); ctx.globalAlpha=p.a; ctx.fillStyle=p.col;
          ctx.beginPath(); ctx.arc(p.x,p.y,p.sz,0,Math.PI*2); ctx.fill();
          ctx.restore();
        } else partsRef.current.splice(i,1);
      }

      // ── Floating texts ───────────────────────────────────────────────────
      for (let i = floatsRef.current.length-1; i >= 0; i--) {
        const ft = floatsRef.current[i]!;
        ft.y+=ft.vy; ft.a-=0.02;
        if (ft.a > 0) {
          ctx.save(); ctx.globalAlpha=ft.a;
          ctx.font=`bold ${Math.round(15*ft.scale)}px Inter,sans-serif`;
          ctx.fillStyle=ft.col; ctx.textAlign='center';
          ctx.shadowColor='rgba(0,0,0,0.9)'; ctx.shadowBlur=5;
          ctx.fillText(ft.text,ft.x,ft.y);
          ctx.restore();
        } else floatsRef.current.splice(i,1);
      }

      ctx.restore();
      afId = requestAnimationFrame(loop);
    };

    afId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(afId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims, rows, risk]);

  // ─── Drop ──────────────────────────────────────────────────────────────────
  async function handleDrop() {
    const walletType: 'play'|'main' = (playBal??0) >= bet ? 'play' : 'main';
    const total = serverBal ?? ((mainBal??0)+(playBal??0));
    if (total < bet) { setError('Insufficient balance'); return; }
    setError(null); setDropping(true);
    try {
      const result = await dropPlinko(bet, toApiRows(rows), risk === 'easy' ? 'low' : risk === 'medium' ? 'medium' : 'high', walletType);
      setServerBal(result.totalBalance);
      if (walletType === 'play') setPlayBal(p=>(p??0)-bet+result.payout);
      else setMainBal(p=>(p??0)-bet+result.payout);

      const ballColor = risk==='hard'
        ? { color:'#f43f5e', glow:'rgba(244,63,94,0.8)' }
        : risk==='medium'
        ? { color:'#f59e0b', glow:'rgba(245,158,11,0.8)' }
        : { color:'#34d399', glow:'rgba(52,211,153,0.8)' };

      ballsRef.current.push({
        id: result.id ?? `${Date.now()}`,
        x: dims.w/2 + (Math.random()-0.5)*6, y: 24,
        vx: (Math.random()-0.5)*3, vy: Math.random()*12+30,
        ...ballColor, betAmount: bet,
        trail: [], status: 'falling',
        serverSlot: result.slot,
        serverMult: result.multiplier,
        serverPayout: result.payout,
        serverPath: result.path,
        lastRow: -1,
      });
    } catch(err: any) {
      setDropping(false);
      setError(err?.message ?? 'Something went wrong');
    }
  }

  const totalBalance = serverBal ?? ((mainBal??0)+(playBal??0));
  const muls = getMultipliers(rows, risk);
  const maxMul = Math.max(...muls);

  // ─── Access gate ───────────────────────────────────────────────────────────
  if (allowed === false) {
    return (
      <div style={{minHeight:'100dvh',background:'#0d0a1e',color:'#f8fafc',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,padding:24,maxWidth:480,margin:'0 auto',textAlign:'center'}}>
        <div style={{fontSize:48}}>🚫</div>
        <div style={{fontSize:20,fontWeight:900,color:'#a78bfa'}}>Plinko Not Available</div>
        <div style={{fontSize:13,color:'#6b7280',maxWidth:280}}>Plinko is not available for your account yet.</div>
        <button onClick={()=>navigate('/')} style={{marginTop:8,background:'#1e1b4b',border:'1px solid #4f46e5',color:'#a5b4fc',borderRadius:10,padding:'10px 24px',fontSize:13,fontWeight:700,cursor:'pointer'}}>← Back to Home</button>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:'100dvh',background:'linear-gradient(180deg,#0d0a1e 0%,#07050f 100%)',color:'#f8fafc',fontFamily:"'Inter',sans-serif",display:'flex',flexDirection:'column',maxWidth:480,margin:'0 auto',userSelect:'none'}}>

      {/* ── Top bar ── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'rgba(13,10,30,0.95)',borderBottom:'1px solid rgba(139,92,246,0.2)',flexShrink:0,backdropFilter:'blur(12px)'}}>
        <button onClick={()=>navigate('/')} style={{background:'rgba(139,92,246,0.1)',border:'1px solid rgba(139,92,246,0.3)',color:'#c4b5fd',borderRadius:10,padding:'7px 12px',fontSize:11,fontWeight:800,cursor:'pointer',letterSpacing:'0.02em'}}>← Back</button>

        {/* Plinko logo-ish */}
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{fontSize:10,fontWeight:900,color:'#a78bfa',letterSpacing:'0.25em',textTransform:'uppercase',textShadow:'0 0 12px rgba(167,139,250,0.5)'}}>PLINKO</div>
        </div>

        {/* Wallet */}
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:8,color:'#6b7280',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.12em'}}>Wallet</div>
          <div style={{fontSize:13,fontWeight:900,color:'#fbbf24'}}>
            {totalBalance >= 0 ? totalBalance.toFixed(2) : '—'} <span style={{fontSize:9,color:'#9ca3af'}}>ETB</span>
          </div>
        </div>
      </div>

      {/* ── Recent results strip ── */}
      <div style={{background:'rgba(7,5,15,0.9)',borderBottom:'1px solid rgba(139,92,246,0.12)',padding:'5px 10px',flexShrink:0,display:'flex',alignItems:'center',gap:5,overflowX:'auto',scrollbarWidth:'none'}}>
        <span style={{fontSize:8,color:'#4b5563',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em',flexShrink:0}}>Recent:</span>
        {recent.length===0 && <span style={{fontSize:9,color:'#374151'}}>—</span>}
        {recent.map((r,i)=>{
          const col = r.m>=10?'#f87171':r.m>=2?'#fbbf24':r.m>=1?'#86efac':'#6b7280';
          const bg2 = r.m>=10?'rgba(239,68,68,0.15)':r.m>=2?'rgba(251,191,36,0.12)':r.m>=1?'rgba(134,239,172,0.1)':'rgba(107,114,128,0.1)';
          return <div key={i} style={{flexShrink:0,padding:'2px 8px',borderRadius:20,background:bg2,fontSize:10,fontWeight:900,color:col}}>{r.m.toFixed(1)}x</div>;
        })}
      </div>

      {/* ── Board area ── */}
      <div ref={containerRef} style={{background:'transparent',flexShrink:0,position:'relative'}}>
        <canvas ref={canvasRef} style={{display:'block',width:'100%',height:dims.h,touchAction:'none'}}/>
        {dropping && ballsRef.current.length > 0 && (
          <div style={{position:'absolute',top:8,right:8,background:'rgba(244,63,94,0.15)',border:'1px solid rgba(244,63,94,0.35)',borderRadius:20,padding:'2px 10px',fontSize:8,fontWeight:800,color:'#f87171',letterSpacing:'0.15em'}}>● LIVE</div>
        )}
      </div>

      {error && <div style={{margin:'6px 12px',padding:'8px 12px',borderRadius:8,background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',fontSize:11,color:'#f87171'}}>{error}</div>}

      {/* ── LINES row selector ── */}
      <div style={{background:'rgba(7,5,15,0.96)',borderTop:'1px solid rgba(139,92,246,0.15)',padding:'10px 12px 8px',flexShrink:0}}>
        <div style={{fontSize:9,color:'#6b7280',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.14em',textAlign:'center',marginBottom:7}}>LINES</div>
        <div style={{display:'flex',gap:5,justifyContent:'center',flexWrap:'nowrap',overflowX:'auto',scrollbarWidth:'none'}}>
          {([8,9,10,11,12,13,14,15,16] as Rows[]).map(r => {
            const active = rows === r;
            return (
              <button key={r} onClick={()=>setRows(r)}
                style={{flexShrink:0,width:34,height:34,borderRadius:9,border:active?'2px solid #7c3aed':'1px solid rgba(139,92,246,0.25)',background:active?'linear-gradient(180deg,#7c3aed,#5b21b6)':'rgba(139,92,246,0.08)',color:active?'#fff':'#9ca3af',fontSize:13,fontWeight:900,cursor:'pointer',transition:'all .12s'}}>
                {r}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Bottom controls ── */}
      <div style={{background:'rgba(10,7,22,0.98)',borderTop:'1px solid rgba(139,92,246,0.15)',padding:'10px 12px 14px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>

          {/* Left: bet amount + controls */}
          <div style={{flex:1,display:'flex',flexDirection:'column',gap:6}}>
            {/* Amount display */}
            <div style={{background:'rgba(139,92,246,0.08)',border:'1px solid rgba(139,92,246,0.25)',borderRadius:10,padding:'7px 12px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:18,fontWeight:900,color:'#e9d5ff',fontFamily:'monospace'}}>{bet}</span>
              <span style={{fontSize:9,color:'#7c3aed',fontWeight:800}}>ETB</span>
            </div>
            {/* −  + row */}
            <div style={{display:'flex',gap:4}}>
              <button onClick={()=>setBet(b=>Math.max(MIN_BET,b-Math.max(1,Math.floor(b*0.5))))}
                style={{flex:1,padding:'8px 0',borderRadius:8,background:'rgba(139,92,246,0.1)',border:'1px solid rgba(139,92,246,0.25)',color:'#c4b5fd',fontSize:18,fontWeight:900,cursor:'pointer'}}>−</button>
              <button onClick={()=>setBet(b=>Math.min(MAX_BET,b+Math.max(1,Math.floor(b*0.5))))}
                style={{flex:1,padding:'8px 0',borderRadius:8,background:'rgba(139,92,246,0.1)',border:'1px solid rgba(139,92,246,0.25)',color:'#c4b5fd',fontSize:18,fontWeight:900,cursor:'pointer'}}>+</button>
            </div>
            {/* X2 / MAX */}
            <div style={{display:'flex',gap:4}}>
              <button onClick={()=>setBet(b=>Math.min(MAX_BET,b*2))}
                style={{flex:1,padding:'6px 0',borderRadius:8,background:'rgba(22,163,74,0.15)',border:'1px solid rgba(22,163,74,0.35)',color:'#4ade80',fontSize:11,fontWeight:900,cursor:'pointer'}}>X2</button>
              <button onClick={()=>setBet(Math.min(MAX_BET,Math.floor(totalBalance)))}
                style={{flex:1,padding:'6px 0',borderRadius:8,background:'rgba(22,163,74,0.15)',border:'1px solid rgba(22,163,74,0.35)',color:'#4ade80',fontSize:11,fontWeight:900,cursor:'pointer'}}>MAX</button>
            </div>
          </div>

          {/* Center: BET button */}
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
            <button onClick={handleDrop} disabled={dropping || totalBalance < bet}
              style={{width:90,height:90,borderRadius:'50%',background:(dropping||totalBalance<bet)?'#1f1635':'radial-gradient(circle at 40% 35%,#4ade80,#22c55e 55%,#15803d)',border:'none',color:(dropping||totalBalance<bet)?'#4b5563':'#052e16',fontSize:15,fontWeight:900,cursor:(dropping||totalBalance<bet)?'not-allowed':'pointer',boxShadow:(dropping||totalBalance<bet)?'none':'0 6px 0 #14532d, 0 0 24px rgba(34,197,94,0.35)',textTransform:'uppercase',letterSpacing:'0.05em',transition:'all .1s',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2}}>
              {dropping && ballsRef.current.length > 0
                ? <span style={{fontSize:20}}>⏳</span>
                : <><span style={{fontSize:18}}>▶</span><span style={{fontSize:11}}>BET</span></>
              }
            </button>
            <div style={{fontSize:9,color:'#6b7280',textAlign:'center'}}>
              max <span style={{color:'#a78bfa',fontWeight:800}}>{maxMul}x</span>
            </div>
          </div>

          {/* Right: HARD / MEDIUM / EASY */}
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {(['hard','medium','easy'] as Risk[]).map(r => {
              const active = risk === r;
              const cfg = r==='hard'
                ? { label:'HARD', col:'#ef4444', bg:'rgba(239,68,68,0.15)', border:'rgba(239,68,68,0.4)' }
                : r==='medium'
                ? { label:'MEDIUM', col:'#f59e0b', bg:'rgba(245,158,11,0.12)', border:'rgba(245,158,11,0.35)' }
                : { label:'EASY', col:'#4ade80', bg:'rgba(74,222,128,0.1)', border:'rgba(74,222,128,0.3)' };
              return (
                <button key={r} onClick={()=>setRisk(r)}
                  style={{padding:'8px 14px',borderRadius:9,background:active?cfg.bg:'rgba(255,255,255,0.04)',border:active?`1.5px solid ${cfg.border}`:'1px solid rgba(255,255,255,0.07)',color:active?cfg.col:'#4b5563',fontSize:10,fontWeight:900,cursor:'pointer',letterSpacing:'0.06em',transition:'all .12s',minWidth:68}}>
                  {cfg.label}
                </button>
              );
            })}
          </div>

        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{display:'flex',background:'rgba(7,5,15,0.98)',borderTop:'1px solid rgba(139,92,246,0.15)',flexShrink:0}}>
        {([
          { id:'game', icon:'▶', label:'GAME' },
          { id:'history', icon:'↺', label:'HISTORY' },
          { id:'leaders', icon:'✓', label:'LEADERS' },
        ] as const).map(t=>{
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{flex:1,padding:'10px 0 8px',background:'none',border:'none',borderTop:active?'2px solid #7c3aed':'2px solid transparent',color:active?'#a78bfa':'#4b5563',fontSize:10,fontWeight:800,cursor:'pointer',letterSpacing:'0.1em',display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
              <span style={{fontSize:14}}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content overlay (history / leaders) */}
      {tab !== 'game' && (
        <div style={{position:'fixed',inset:0,background:'rgba(7,5,15,0.97)',zIndex:50,maxWidth:480,margin:'0 auto',display:'flex',flexDirection:'column'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',borderBottom:'1px solid rgba(139,92,246,0.2)'}}>
            <span style={{fontSize:14,fontWeight:900,color:'#c4b5fd'}}>{tab==='history'?'My History':'Leaderboard'}</span>
            <button onClick={()=>setTab('game')} style={{background:'rgba(139,92,246,0.1)',border:'1px solid rgba(139,92,246,0.3)',color:'#c4b5fd',borderRadius:8,padding:'6px 14px',fontSize:12,fontWeight:700,cursor:'pointer'}}>✕ Close</button>
          </div>
          {tab==='history' ? <HistoryTab items={history}/> : <LeadersTab/>}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ items }: { items: HistEntry[] }) {
  if (!items.length) return (
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,color:'#374151',padding:48}}>
      <div style={{fontSize:32}}>📋</div>
      <div style={{fontSize:13,fontWeight:700}}>No history yet</div>
    </div>
  );
  return (
    <div style={{flex:1,overflowY:'auto'}}>
      {items.map(item=>{
        const diff = item.payout - item.betAmount;
        const col = diff>=0?'#4ade80':'#f87171';
        const mCol = slotColor(item.multiplier);
        return (
          <div key={item.id} style={{padding:'11px 14px',borderBottom:'1px solid rgba(139,92,246,0.1)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:38,height:38,borderRadius:9,background:slotBg(item.multiplier),border:`1px solid ${mCol}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:900,color:mCol,flexShrink:0}}>{item.multiplier}x</div>
              <div>
                <div style={{fontSize:12,fontWeight:800,color:'#d1d5db'}}>{item.rows}R · {item.risk}</div>
                <div style={{fontSize:10,color:'#4b5563',marginTop:2}}>{new Date(item.createdAt).toLocaleString()}</div>
              </div>
            </div>
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{fontSize:14,fontWeight:900,color:col}}>{diff>=0?'+':''}{diff.toFixed(2)}</div>
              <div style={{fontSize:9,color:'#6b7280',fontWeight:700}}>Bet {item.betAmount}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Leaders Tab ──────────────────────────────────────────────────────────────

function LeadersTab() {
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,color:'#374151',padding:48}}>
      <div style={{fontSize:32}}>🏆</div>
      <div style={{fontSize:13,fontWeight:700,color:'#6b7280'}}>Leaderboard coming soon</div>
    </div>
  );
}
