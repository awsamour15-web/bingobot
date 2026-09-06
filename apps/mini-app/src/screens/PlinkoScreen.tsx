import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile, dropPlinko, getPlinkoHistory, checkPlinkoAccess } from '../lib/api';

type Risk = 'low' | 'medium' | 'high';
type Rows = 8 | 12 | 16;

// ─── Procedural audio ────────────────────────────────────────────────────────

function createAudioCtx(): AudioContext | null {
  try { return new (window.AudioContext || (window as any).webkitAudioContext)(); }
  catch { return null; }
}

function playPegHit(ctx: AudioContext, vol = 0.18) {
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(900 + Math.random() * 300, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.06);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
    o.start(); o.stop(ctx.currentTime + 0.08);
  } catch {}
}

function playDrop(ctx: AudioContext) {
  try {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / data.length);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.8;
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.35, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    src.start();
  } catch {}
}

function playLand(ctx: AudioContext, multiplier: number) {
  try {
    const now = ctx.currentTime;
    if (multiplier >= 10) {
      // Jackpot fanfare
      [523, 659, 784, 1047, 1319].forEach((freq, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine'; o.frequency.value = freq;
        const t = now + i * 0.07;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.start(t); o.stop(t + 0.55);
      });
    } else if (multiplier >= 2) {
      // Win chime
      [523, 784].forEach((freq, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'triangle'; o.frequency.value = freq;
        const t = now + i * 0.09;
        g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.start(t); o.stop(t + 0.35);
      });
    } else {
      // Thud
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(180, now); o.frequency.exponentialRampToValueAtTime(60, now + 0.12);
      g.gain.setValueAtTime(0.14, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      o.start(); o.stop(now + 0.18);
    }
  } catch {}
}

const MIN_BET = 5;
const MAX_BET = 10_000;

const MULTIPLIERS: Record<Rows, Record<Risk, number[]>> = {
  8: {
    low:    [3.0, 1.5, 1.0, 0.8, 0.5, 0.8, 1.0, 1.5, 3.0],
    medium: [5.0, 2.0, 1.0, 0.6, 0.3, 0.6, 1.0, 2.0, 5.0],
    high:   [10,  3.0, 1.2, 0.4, 0.2, 0.4, 1.2, 3.0, 10],
  },
  12: {
    low:    [4.0, 2.0, 1.2, 1.0, 0.8, 0.5, 0.3, 0.5, 0.8, 1.0, 1.2, 2.0, 4.0],
    medium: [8.0, 4.0, 2.0, 1.5, 0.8, 0.4, 0.2, 0.4, 0.8, 1.5, 2.0, 4.0, 8.0],
    high:   [25,  10,  4.0, 2.0, 0.8, 0.3, 0.2, 0.3, 0.8, 2.0, 4.0, 10,  25],
  },
  16: {
    low:    [5.0, 3.0, 1.5, 1.2, 1.0, 0.8, 0.5, 0.3, 0.3, 0.5, 0.8, 1.0, 1.2, 1.5, 3.0, 5.0],
    medium: [12,  6.0, 3.0, 2.0, 1.5, 1.0, 0.8, 0.4, 0.4, 0.8, 1.0, 1.5, 2.0, 3.0, 6.0, 12],
    high:   [50,  20,  10,  5.0, 3.0, 2.0, 0.5, 0.3, 0.3, 0.5, 2.0, 3.0, 5.0, 10,  20,  50],
  },
};

function slotColor(m: number): string {
  if (m >= 100) return '#ef4444';
  if (m >= 25)  return '#f97316';
  if (m >= 5)   return '#eab308';
  if (m >= 2)   return '#84cc16';
  if (m >= 1)   return '#06b6d4';
  if (m >= 0.5) return '#64748b';
  return '#475569';
}

function recentBg(m: number) {
  if (m >= 10) return '#450a0a';
  if (m >= 3)  return '#422006';
  if (m >= 1)  return '#052e16';
  return '#18181b';
}
function recentFg(m: number) {
  if (m >= 10) return '#fca5a5';
  if (m >= 3)  return '#fde68a';
  if (m >= 1)  return '#86efac';
  return '#6b7280';
}

interface Ball {
  id: string; x: number; y: number; vx: number; vy: number; radius: number;
  color: string; glowColor: string; betAmount: number; risk: Risk; rows: Rows;
  trail: {x:number;y:number;alpha:number}[]; status: 'falling'|'landed';
  landedSlot?: number; multiplier?: number; payout?: number;
  serverSlot?: number; serverMultiplier?: number; serverPayout?: number;
  // server path for guided steering: array of 0 (left) or 1 (right) per row
  serverPath?: number[];
  // track which row the ball last hit a peg in (for path steering)
  lastPegRow?: number;
}
interface PegHit { x:number;y:number;radius:number;maxRadius:number;alpha:number;color:string; }
interface Particle { x:number;y:number;vx:number;vy:number;color:string;size:number;alpha:number;decay:number;shape:'circle'|'star'; }
interface FloatText { x:number;y:number;text:string;color:string;alpha:number;vy:number;scale:number; }
interface SlotBounce { intensity:number;timestamp:number;color:string; }
interface HistEntry { id:string;betAmount:number;rows:number;risk:string;slot:number;multiplier:number;payout:number;createdAt:string; }

export default function PlinkoScreen() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const ballsRef     = useRef<Ball[]>([]);
  const pegHitsRef   = useRef<PegHit[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatTextsRef  = useRef<FloatText[]>([]);
  const slotBouncesRef = useRef<Map<number,SlotBounce>>(new Map());
  const rafRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundOnRef2 = useRef(localStorage.getItem('soundOn') !== 'false');
  const pegSoundThrottle = useRef(0);
  const [dims, setDims] = useState({ w: 380, h: 480 });

  const [mainBalance, setMainBalance] = useState<number|null>(null);
  const [playBalance, setPlayBalance] = useState<number|null>(null);
  const [bet,  setBet]   = useState(100);
  const [rows, setRows]  = useState<Rows>(16);
  const [risk, setRisk]  = useState<Risk>('high');
  const [dropping, setDropping] = useState(false);
  const [autoPlay, setAutoPlay]   = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(1);
  const [isAiming, setIsAiming]   = useState(false);
  const aimNormRef = useRef(0.5);
  const [aimNorm, setAimNorm]     = useState(0.5);
  const [recentResults, setRecentResults] = useState<{m:number}[]>([]);
  const [history,  setHistory]  = useState<HistEntry[]>([]);
  const [tab, setTab] = useState<'game'|'history'>('game');
  const [error, setError] = useState<string|null>(null);
  const [accessAllowed, setAccessAllowed] = useState<boolean|null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setInterval>|null>(null);

  // Resize observer
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const w = Math.min(containerRef.current.offsetWidth, 480);
        const h = Math.max(360, Math.min(w * 1.1, 520));
        setDims({ w, h });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const unlock = () => {
      if (audioCtxRef.current) return;
      audioCtxRef.current = createAudioCtx();
    };
    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('mousedown', unlock, { once: true });
    return () => {
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('mousedown', unlock);
    };
  }, []);

  useEffect(() => {
    getProfile().then(p => {
      setMainBalance(p.mainWallet.balance);
      setPlayBalance(p.playWallet.balance);
    }).catch(() => {});
    checkPlinkoAccess().then(r => setAccessAllowed(r.allowed)).catch(() => setAccessAllowed(false));
  }, []);

  useEffect(() => {
    if (tab === 'history') getPlinkoHistory().then(setHistory).catch(() => {});
  }, [tab]);

  // Auto-play
  useEffect(() => {
    if (!autoPlay) { if (autoTimerRef.current) clearInterval(autoTimerRef.current); return; }
    const ms = autoSpeed === 4 ? 180 : autoSpeed === 2 ? 350 : 600;
    autoTimerRef.current = setInterval(() => handleDrop(1), ms);
    return () => { if (autoTimerRef.current) clearInterval(autoTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, autoSpeed, bet, rows, risk]);

  function spawnWinEffects(slotIdx: number, mult: number, slotX: number, slotY: number, slotW: number, col: string) {
    const big = mult >= 10, jackpot = mult >= 100;
    slotBouncesRef.current.set(slotIdx, { intensity: jackpot ? 1 : big ? 0.75 : 0.45, timestamp: Date.now(), color: col });
    floatTextsRef.current.push({ x: slotX+slotW/2, y: slotY-12, text: mult+'x',
      color: jackpot?'#f87171':big?'#fbbf24':'#60a5fa', alpha:1, vy: big?-1.8:-1.2, scale: jackpot?1.4:big?1.15:0.95 });
    const count = jackpot ? 45 : big ? 25 : 8;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI/2 + (Math.random()-0.5)*Math.PI*0.9;
      const speed = Math.random()*(jackpot?8:big?5.5:3.5)+1.5;
      const colors = jackpot?['#ef4444','#f59e0b','#fbbf24','#fff','#ec4899']
        :big?['#f59e0b','#10b981','#38bdf8','#fbbf24']:['#94a3b8','#38bdf8','#fff'];
      particlesRef.current.push({
        x: slotX+slotW/2+(Math.random()-0.5)*slotW*0.8, y: slotY,
        vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
        color: colors[Math.floor(Math.random()*colors.length)] as string,
        size: Math.random()*(jackpot?5:3.5)+2, alpha:1,
        decay: Math.random()*0.02+0.015,
        shape: (jackpot && Math.random()>0.4) ? 'star' : 'circle',
      });
    }
  }

  function calcGeom(w: number, h: number, r: number) {
    const topPad = 48, botPad = 62;
    const avail = h - topPad - botPad;
    const rowSpacing = avail / r;
    const pinR  = Math.max(2.8, Math.min(4.5, 42/r));
    const ballR = Math.max(5,   Math.min(8,   64/r));
    const totalBottomPins = r + 2;
    const bottomSpread = w * 0.88;
    const colSpacing = bottomSpread / (totalBottomPins - 1);
    const pegs: {x:number;y:number;row:number}[] = [];
    for (let row = 0; row < r; row++) {
      const pins = row + 3;
      const rowY = topPad + (row + 0.5) * rowSpacing;
      const rowW = (pins - 1) * colSpacing;
      const sx = (w - rowW) / 2;
      for (let c = 0; c < pins; c++) pegs.push({ x: sx+c*colSpacing, y: rowY, row });
    }
    const slotCount = r + 1;
    const slotsStartX = (w - slotCount * colSpacing) / 2;
    const slotY = h - botPad + 10;
    const slotH = 44;
    return { topPad, rowSpacing, colSpacing, pegs, pinR, ballR, slotY, slotH, slotsStartX, slotCount };
  }

  // Main render+physics loop
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) return;
    let afId: number; let lastT = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastT) / 1000, 0.05); lastT = now;
      const { w, h } = dims;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== w*dpr || canvas.height !== h*dpr) { canvas.width = w*dpr; canvas.height = h*dpr; }
      ctx.save(); ctx.scale(dpr, dpr);
      const { topPad, rowSpacing, colSpacing, pegs, pinR, ballR, slotY, slotH, slotsStartX, slotCount } = calcGeom(w, h, rows);
      const muls = MULTIPLIERS[rows][risk];

      // BG
      ctx.fillStyle = '#111114'; ctx.fillRect(0, 0, w, h);
      const radGrad = ctx.createRadialGradient(w/2, h*0.4, 20, w/2, h*0.4, w*0.65);
      radGrad.addColorStop(0, 'rgba(30,30,35,0.5)'); radGrad.addColorStop(1, 'rgba(17,17,20,0.98)');
      ctx.fillStyle = radGrad; ctx.fillRect(0, 0, w, h);

      // Pyramid guide lines
      if (pegs.length > 0) {
        const lr = pegs.filter(p => p.row === rows - 1);
        if (lr.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(w/2, topPad - 14);
          ctx.lineTo(lr[lr.length-1]!.x + colSpacing*0.6, lr[lr.length-1]!.y + 12);
          ctx.lineTo(lr[0]!.x - colSpacing*0.6, lr[0]!.y + 12);
          ctx.closePath();
          ctx.fillStyle = 'rgba(26,26,29,0.35)'; ctx.fill();
          ctx.strokeStyle = 'rgba(250,204,21,0.08)'; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }

      // Aim indicator
      const aimX = (aimNormRef.current * 0.8 + 0.1) * w;
      ctx.save();
      ctx.strokeStyle = 'rgba(250,204,21,0.35)'; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(aimX, 10); ctx.lineTo(aimX, topPad); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#1A1A1D'; ctx.beginPath(); ctx.arc(aimX, 22, 12, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#FACC15'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#FACC15'; ctx.beginPath();
      ctx.moveTo(aimX-5, 19); ctx.lineTo(aimX+5, 19); ctx.lineTo(aimX, 26);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      // Physics sub-steps
      const SUB = 4, subDt = dt/SUB, gravity = 680, restitution = 0.52;
      for (let s = 0; s < SUB; s++) {
        for (let i = ballsRef.current.length-1; i >= 0; i--) {
          const ball = ballsRef.current[i]!; if (ball.status !== 'falling') continue;
          ball.vy += gravity * subDt;
          ball.vx *= (1 - 0.10*subDt); ball.vy *= (1 - 0.02*subDt);
          ball.x += ball.vx * subDt; ball.y += ball.vy * subDt;
          if (s === 0 && Math.random() > 0.3) {
            ball.trail.unshift({ x: ball.x, y: ball.y, alpha: 0.75 });
            if (ball.trail.length > 10) ball.trail.pop();
          }

          // Compute pyramid wall limits at current Y
          // Row 0 spans colSpacing*2 (3 pegs), row r spans colSpacing*(r+2) (r+3 pegs)
          // Interpolate based on how far down the ball is
          const rowFrac = Math.max(0, Math.min(1, (ball.y - topPad) / (rowSpacing * rows)));
          const bottomHalfW = (rows + 2) * colSpacing * 0.5;
          const topHalfW = 2 * colSpacing * 0.5; // row 0 has 3 pins = span 2*colSpacing
          const halfW = topHalfW + (bottomHalfW - topHalfW) * rowFrac;
          const wallLeft  = w/2 - halfW - ballR;
          const wallRight = w/2 + halfW + ballR;

          if (ball.x < wallLeft)  { ball.x = wallLeft;  ball.vx =  Math.abs(ball.vx)*0.5; }
          if (ball.x > wallRight) { ball.x = wallRight; ball.vx = -Math.abs(ball.vx)*0.5; }

          for (const peg of pegs) {
            const dx = ball.x-peg.x, dy = ball.y-peg.y;
            const distSq = dx*dx+dy*dy, minD = ballR+pinR;
            if (distSq < minD*minD) {
              const dist = Math.sqrt(distSq)||0.001;
              const nx = dx/dist, ny = dy/dist;
              const ov = minD-dist; ball.x += nx*ov; ball.y += ny*ov;
              const van = ball.vx*nx+ball.vy*ny;
              if (van < 0) {
                // Path-guided steering: if we have a server path, steer based on it
                let jitter = (Math.random()-0.5)*0.12;
                if (ball.serverPath && peg.row !== undefined && peg.row !== ball.lastPegRow) {
                  const dir = ball.serverPath[peg.row]; // 0=left, 1=right
                  if (dir !== undefined) {
                    // Bias jitter toward path direction: positive = right, negative = left
                    jitter = dir === 1 ? 0.25 + Math.random()*0.1 : -0.25 - Math.random()*0.1;
                  }
                  ball.lastPegRow = peg.row;
                }
                const tx = -ny, ty = nx;
                const imp = -(1+restitution)*van;
                ball.vx += (nx+tx*jitter)*imp; ball.vy += (ny+ty*jitter)*imp;
                if (ball.vy < -60) ball.vy = -60;
                pegHitsRef.current.push({ x:peg.x, y:peg.y, radius:pinR, maxRadius:pinR*3.8, alpha:1, color:ball.color });
                // Throttled peg hit sound (max ~20/sec)
                const nowMs2 = performance.now();
                if (soundOnRef2.current && audioCtxRef.current && nowMs2 - pegSoundThrottle.current > 50) {
                  pegSoundThrottle.current = nowMs2;
                  playPegHit(audioCtxRef.current);
                }
              }
            }
          }

          if (ball.y >= slotY) {
            ball.status = 'landed';
            // Use server-authoritative slot and multiplier if available
            const si = ball.serverSlot !== undefined
              ? ball.serverSlot
              : Math.max(0, Math.min(slotCount-1, Math.floor((ball.x-slotsStartX)/colSpacing)));
            ball.landedSlot = si;
            ball.multiplier = ball.serverMultiplier ?? (muls[si]??1);
            ball.payout = ball.serverPayout ?? ball.betAmount*(muls[si]??1);
            // Snap ball X to correct slot center for clean landing
            ball.x = slotsStartX + si * colSpacing + colSpacing / 2;
            spawnWinEffects(si, ball.multiplier, slotsStartX+si*colSpacing, slotY, colSpacing, slotColor(ball.multiplier));
            // Land sound
            if (soundOnRef2.current && audioCtxRef.current) {
              playLand(audioCtxRef.current, ball.multiplier);
            }
          }
        }
      }

      // Handle landed balls
      const landed = ballsRef.current.filter(b => b.status === 'landed');
      if (landed.length) {
        ballsRef.current = ballsRef.current.filter(b => b.status === 'falling');
        const tp = landed.reduce((s,b) => s+(b.payout??0), 0);
        const tb = landed.reduce((s,b) => s+b.betAmount, 0);
        setRecentResults(p => [{ m: tp/tb }, ...p].slice(0, 20));
        if (ballsRef.current.length === 0) {
          setDropping(false);
        }
      }

      // Pegs
      for (const peg of pegs) {
        ctx.save();
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath(); ctx.arc(peg.x, peg.y, pinR, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(peg.x-pinR*0.3, peg.y-pinR*0.3, pinR*0.45, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }

      // Peg hit waves
      for (let i = pegHitsRef.current.length-1; i >= 0; i--) {
        const h2 = pegHitsRef.current[i]!;
        h2.radius += (h2.maxRadius-h2.radius)*0.22+0.5; h2.alpha *= 0.86;
        if (h2.alpha > 0.05) {
          ctx.save(); ctx.strokeStyle=h2.color; ctx.globalAlpha=h2.alpha; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(h2.x,h2.y,h2.radius,0,Math.PI*2); ctx.stroke(); ctx.restore();
        } else pegHitsRef.current.splice(i,1);
      }

      // Slot bars
      const nowMs = Date.now();
      for (let i = 0; i < slotCount; i++) {
        const m = muls[i]??0, col = slotColor(m);
        const sx = slotsStartX+i*colSpacing+1.5, sw = colSpacing-3;
        const bounce = slotBouncesRef.current.get(i);
        let scaleY = 1, offY = 0;
        if (bounce) {
          const el = (nowMs-bounce.timestamp)/1000;
          if (el < 0.45) {
            const prog=el/0.45, spring=Math.sin(prog*Math.PI*3)*Math.exp(-prog*4);
            scaleY=1+spring*bounce.intensity*0.35; offY=-spring*bounce.intensity*8;
          } else slotBouncesRef.current.delete(i);
        }
        ctx.save();
        ctx.translate(sx+sw/2, slotY+offY+slotH/2); ctx.scale(1,scaleY); ctx.translate(-(sx+sw/2),-(slotY+offY+slotH/2));
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.roundRect(sx, slotY+offY, sw, slotH, Math.min(6,sw*0.25)); ctx.fill();
        const sg = ctx.createLinearGradient(sx,slotY+offY,sx,slotY+offY+slotH*0.45);
        sg.addColorStop(0,'rgba(255,255,255,0.2)'); sg.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=sg; ctx.beginPath(); ctx.roundRect(sx,slotY+offY,sw,slotH*0.45,[Math.min(6,sw*0.25),Math.min(6,sw*0.25),0,0]); ctx.fill();
        ctx.fillStyle='#fff';
        const fs=Math.max(7,Math.min(11,sw*0.42));
        ctx.font=`bold ${fs}px Inter,sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(`${m}x`, sx+sw/2, slotY+offY+slotH/2);
        ctx.restore();
      }

      // Trails + balls
      for (const ball of ballsRef.current) {
        if (ball.status !== 'falling') continue;
        for (let t = ball.trail.length-1; t >= 0; t--) {
          const pt = ball.trail[t]!; pt.alpha *= 0.88;
          if (pt.alpha > 0.05) {
            ctx.save(); ctx.fillStyle=ball.color; ctx.globalAlpha=pt.alpha*0.5;
            ctx.beginPath(); ctx.arc(pt.x,pt.y,ballR*(0.4+(1-t/ball.trail.length)*0.6),0,Math.PI*2); ctx.fill();
            ctx.restore();
          }
        }
        ctx.save();
        ctx.shadowColor=ball.glowColor; ctx.shadowBlur=14;
        ctx.fillStyle=ball.color; ctx.beginPath(); ctx.arc(ball.x,ball.y,ballR,0,Math.PI*2); ctx.fill();
        ctx.shadowBlur=0; ctx.fillStyle='rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(ball.x-ballR*0.3,ball.y-ballR*0.3,ballR*0.38,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }

      // Particles
      for (let i = particlesRef.current.length-1; i >= 0; i--) {
        const p = particlesRef.current[i]!;
        p.x+=p.vx; p.y+=p.vy; p.vy+=0.15; p.alpha-=p.decay;
        if (p.alpha > 0) {
          ctx.save(); ctx.globalAlpha=p.alpha; ctx.fillStyle=p.color;
          if (p.shape === 'star') {
            ctx.beginPath();
            for (let s2=0;s2<5;s2++) {
              ctx.lineTo(p.x+Math.cos((18+s2*72)*Math.PI/180)*p.size, p.y-Math.sin((18+s2*72)*Math.PI/180)*p.size);
              ctx.lineTo(p.x+Math.cos((54+s2*72)*Math.PI/180)*(p.size*0.5), p.y-Math.sin((54+s2*72)*Math.PI/180)*(p.size*0.5));
            }
            ctx.closePath(); ctx.fill();
          } else { ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill(); }
          ctx.restore();
        } else particlesRef.current.splice(i,1);
      }

      // Floating texts
      for (let i = floatTextsRef.current.length-1; i >= 0; i--) {
        const ft = floatTextsRef.current[i]!;
        ft.y+=ft.vy; ft.alpha-=0.022;
        if (ft.alpha > 0) {
          ctx.save(); ctx.globalAlpha=ft.alpha;
          ctx.font=`bold ${Math.round(16*ft.scale)}px Inter,sans-serif`;
          ctx.fillStyle=ft.color; ctx.textAlign='center';
          ctx.shadowColor='rgba(0,0,0,0.9)'; ctx.shadowBlur=6;
          ctx.fillText(ft.text,ft.x,ft.y);
          ctx.restore();
        } else floatTextsRef.current.splice(i,1);
      }

      ctx.restore();
      afId = requestAnimationFrame(loop);
    };

    afId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(afId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims, rows, risk]);

  async function handleDrop(count = 1) {
    const balance = (playBalance ?? 0) >= bet ? playBalance : mainBalance;
    const walletType: 'play' | 'main' = (playBalance ?? 0) >= bet ? 'play' : 'main';
    if ((balance??0) < bet*count) { setError('Insufficient balance'); return; }
    setError(null); setDropping(true);
    try {
      for (let i = 0; i < count; i++) {
        // Call backend first — get authoritative path, slot, multiplier, payout
        const result = await dropPlinko(bet, rows, risk, walletType);

        // Update balance immediately from server response
        setMainBalance(result.totalBalance);
        setPlayBalance(result.totalBalance);

        const ballColors = risk==='high'
          ? { color:'#f43f5e', glowColor:'rgba(244,63,94,0.8)' }
          : risk==='medium'
          ? { color:'#f59e0b', glowColor:'rgba(245,158,11,0.8)' }
          : { color:'#10b981', glowColor:'rgba(16,185,129,0.8)' };
        const w = dims.w;

        // Spawn at pyramid apex (center top) — path steering guides it to correct slot
        const spawnX = w / 2 + (Math.random()-0.5)*8;

        ballsRef.current.push({
          id: result.id ?? `${Date.now()}-${i}`,
          x: spawnX, y: 28,
          vx: (Math.random()-0.5)*8,
          vy: Math.random()*15+35,
          radius: 6.5, ...ballColors, betAmount: bet, risk, rows,
          trail: [], status: 'falling',
          serverSlot: result.slot,
          serverMultiplier: result.multiplier,
          serverPayout: result.payout,
          serverPath: result.path,
          lastPegRow: -1,
        });
        // Drop whoosh
        if (soundOnRef2.current && audioCtxRef.current) playDrop(audioCtxRef.current);
        if (i < count-1) await new Promise(r => setTimeout(r, count>10?80:140));
      }
    } catch(err: any) {
      setDropping(false);
      const msg = err?.response?.data?.message ?? err?.message ?? 'Something went wrong';
      setError(msg);
    }
  }

  function handleAim(clientX: number) {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const v = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    aimNormRef.current = v;
    setAimNorm(v);
  }

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // Auto-select wallet: play first, fall back to main
  const activeWallet: 'play' | 'main' = (playBalance ?? 0) >= bet ? 'play' : 'main';
  const balance = activeWallet === 'play' ? playBalance : mainBalance;
  const totalBalance = (mainBalance ?? 0) + (playBalance ?? 0);
  const maxProfit = bet * Math.max(...MULTIPLIERS[rows][risk]);

  if (accessAllowed === false) {
    return (
      <div style={{minHeight:'100dvh',background:'linear-gradient(180deg,#08161a,#071014)',color:'#f8fafc',fontFamily:"'DM Sans',sans-serif",display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,padding:24,maxWidth:480,margin:'0 auto',textAlign:'center'}}>
        <div style={{fontSize:48}}>🚫</div>
        <div style={{fontSize:20,fontWeight:900,color:'#facc15'}}>Plinko Not Available</div>
        <div style={{fontSize:13,color:'#71717a',maxWidth:280}}>Plinko is not available for your account yet. Contact support for access.</div>
        <button onClick={()=>navigate('/')} style={{marginTop:8,background:'#27272a',border:'1px solid #3f3f46',color:'#d4d4d8',borderRadius:10,padding:'10px 24px',fontSize:13,fontWeight:700,cursor:'pointer'}}>← Back to Home</button>
      </div>
    );
  }

  return (
    <div style={{minHeight:'100dvh',background:'radial-gradient(circle at 50% 0%,rgba(37,190,163,0.12),transparent 34%),linear-gradient(180deg,#08161a 0%,#071014 52%,#04090c 100%)',color:'#f8fafc',fontFamily:"'DM Sans',sans-serif",display:'flex',flexDirection:'column',maxWidth:480,margin:'0 auto'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 14px',background:'rgba(6,17,20,0.9)',borderBottom:'1px solid rgba(85,224,176,0.15)',flexShrink:0,backdropFilter:'blur(14px)'}}>
        <button onClick={()=>navigate('/')} style={{background:'rgba(85,224,176,0.08)',border:'1px solid rgba(85,224,176,0.2)',color:'#9deed1',borderRadius:10,padding:'7px 12px',fontSize:11,fontWeight:800,cursor:'pointer'}}>← Back</button>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:16,fontWeight:900,color:'#55e0b0',letterSpacing:'-0.5px',textTransform:'uppercase'}}>Plinko</span>
          <span style={{fontSize:9,background:'#1c1917',color:'#a8a29e',border:'1px solid #44403c',borderRadius:4,padding:'2px 6px',fontWeight:800}}>PRO</span>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:8,color:'#52525b',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em'}}>Balance</div>
          <div style={{fontSize:14,fontWeight:900,color:'#f7c948'}}>{totalBalance > 0 ? totalBalance.toFixed(0) : (balance !== null ? balance.toFixed(0) : '—')} <span style={{fontSize:9,color:'#7c9b92'}}>ETB</span></div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',background:'rgba(6,14,18,0.86)',borderBottom:'1px solid rgba(85,224,176,0.12)',flexShrink:0}}>
        {(['game','history'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:'9px 0',background:'none',border:'none',borderBottom:tab===t?'2px solid #facc15':'2px solid transparent',color:tab===t?'#facc15':'#52525b',fontSize:11,fontWeight:800,cursor:'pointer',textTransform:'uppercase',letterSpacing:'0.08em'}}>
            {t==='game'?'🎱 Play':'📋 History'}
          </button>
        ))}
      </div>

      {tab==='history' ? <HistoryTab items={history}/> : (
        <div style={{flex:1,display:'flex',flexDirection:'column',minHeight:0,overflowY:'auto'}}>

          {/* Recent results */}
          <div style={{background:'#18181b',borderBottom:'1px solid #27272a',padding:'7px 10px',flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',gap:6,overflowX:'auto',scrollbarWidth:'none'}}>
              <span style={{fontSize:9,color:'#52525b',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em',flexShrink:0}}>Recent:</span>
              {recentResults.length===0 ? <span style={{fontSize:10,color:'#3f3f46'}}>—</span>
                : recentResults.map((r,i)=>(
                  <div key={i} style={{flexShrink:0,padding:'3px 9px',borderRadius:20,background:recentBg(r.m),border:`1px solid ${recentFg(r.m)}33`,fontSize:11,fontWeight:900,color:recentFg(r.m)}}>
                    {r.m.toFixed(1)}x
                  </div>
              ))}
            </div>
          </div>

          {/* Board */}
          <div ref={containerRef} style={{background:'#111114',flexShrink:0,position:'relative',cursor:isAiming?'ew-resize':'default'}}
            onMouseDown={e=>{setIsAiming(true);handleAim(e.clientX);}}
            onMouseMove={e=>{if(isAiming)handleAim(e.clientX);}}
            onMouseUp={()=>setIsAiming(false)}
            onTouchStart={e=>{setIsAiming(true);if(e.touches[0])handleAim(e.touches[0].clientX);}}
            onTouchMove={e=>{if(e.touches[0])handleAim(e.touches[0].clientX);}}
            onTouchEnd={()=>setIsAiming(false)}
          >
            <div style={{position:'absolute',top:0,left:0,right:0,display:'flex',alignItems:'center',justifyContent:'center',height:36,zIndex:2,pointerEvents:'none'}}>
              <div style={{background:'rgba(26,26,29,0.92)',border:'1px solid rgba(250,204,21,0.3)',borderRadius:20,padding:'4px 14px',fontSize:10,fontWeight:900,color:'#facc15',letterSpacing:'0.1em',backdropFilter:'blur(6px)'}}>
                ↔ DRAG TO AIM DROP POSITION
              </div>
            </div>
            <canvas ref={canvasRef} style={{display:'block',width:'100%',height:dims.h,touchAction:'none'}}/>
            {dropping && ballsRef.current.length > 0 && (
              <div style={{position:'absolute',top:44,left:'50%',transform:'translateX(-50%)',background:'rgba(244,63,94,0.15)',border:'1px solid rgba(244,63,94,0.4)',borderRadius:20,padding:'3px 12px',fontSize:9,fontWeight:800,color:'#f87171',letterSpacing:'0.15em'}}>
                ● LIVE
              </div>
            )}
          </div>

          {error && <div style={{margin:'8px 12px 0',padding:'9px 12px',borderRadius:8,background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',fontSize:12,color:'#f87171'}}>{error}</div>}

          {/* Controls */}
          <div style={{background:'#18181b',padding:'14px 12px',display:'flex',flexDirection:'column',gap:14,borderTop:'1px solid #27272a'}}>

            {/* Bet */}
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <span style={{fontSize:10,color:'#52525b',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em'}}>Bet Amount</span>
                <span style={{fontSize:10,color:'#a3a3a3',fontWeight:700}}>Max profit: <span style={{color:'#facc15',fontWeight:900}}>{maxProfit.toLocaleString()} ETB</span></span>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                <div style={{flex:1,background:'#1c1c1f',border:'1px solid #3f3f46',borderRadius:12,padding:'10px 14px',display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:18}}>💎</span>
                  <input type='number' value={bet} min={MIN_BET} max={MAX_BET}
                    onChange={e=>setBet(Math.min(MAX_BET,Math.max(MIN_BET,Number(e.target.value)||MIN_BET)))}
                    style={{background:'none',border:'none',outline:'none',color:'#f8fafc',fontSize:20,fontWeight:900,width:'100%',fontFamily:'monospace'}}
                  />
                </div>
                <div style={{display:'flex',gap:4,background:'#1c1c1f',border:'1px solid #3f3f46',borderRadius:10,padding:3}}>
                  <button onClick={()=>setBet(b=>Math.max(MIN_BET,Math.floor(b/2)))} style={{padding:'8px 9px',borderRadius:7,background:'transparent',border:'none',color:'#a3a3a3',fontSize:11,fontWeight:900,cursor:'pointer'}}>½</button>
                  <button onClick={()=>setBet(b=>Math.min(MAX_BET,b*2))} style={{padding:'8px 9px',borderRadius:7,background:'transparent',border:'none',color:'#a3a3a3',fontSize:11,fontWeight:900,cursor:'pointer'}}>2×</button>
                  <button onClick={()=>setBet(MAX_BET)} style={{padding:'8px 9px',borderRadius:7,background:'transparent',border:'none',color:'#facc15',fontSize:11,fontWeight:900,cursor:'pointer'}}>MAX</button>
                </div>
              </div>
              <div style={{display:'flex',gap:5}}>
                {[10,50,100,500,1000].map(v=>(
                  <button key={v} onClick={()=>setBet(v)} style={{flex:1,padding:'6px 0',borderRadius:9,background:bet===v?'rgba(250,204,21,0.15)':'#1c1c1f',border:`1px solid ${bet===v?'rgba(250,204,21,0.5)':'#3f3f46'}`,color:bet===v?'#facc15':'#71717a',fontSize:10,fontWeight:800,cursor:'pointer',fontFamily:'monospace'}}>+{v}</button>
                ))}
              </div>
            </div>

            {/* Risk + Rows */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div>
                <div style={{fontSize:10,color:'#52525b',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7}}>🔥 Risk Level</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',background:'#1c1c1f',borderRadius:10,border:'1px solid #3f3f46',padding:3,gap:2}}>
                  {(['low','medium','high'] as Risk[]).map(r=>{
                    const active=risk===r;
                    const c=r==='low'?'#22c55e':r==='medium'?'#facc15':'#ef4444';
                    return <button key={r} onClick={()=>setRisk(r)} style={{padding:'7px 0',borderRadius:7,background:active?c:'transparent',border:'none',color:active?'#000':c,fontSize:10,fontWeight:900,cursor:'pointer',textTransform:'capitalize',transition:'all .12s'}}>{r==='low'?'Low':r==='medium'?'Med':'High'}</button>;
                  })}
                </div>
              </div>
              <div>
                <div style={{fontSize:10,color:'#52525b',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7}}>≡ Rows ({rows})</div>
                <div style={{display:'flex',background:'#1c1c1f',borderRadius:10,border:'1px solid #3f3f46',padding:3,gap:2}}>
                  {([8,12,16] as Rows[]).map(r=>(
                    <button key={r} onClick={()=>setRows(r)} style={{flex:1,padding:'7px 0',borderRadius:7,background:rows===r?'#0ea5e9':'transparent',border:'none',color:rows===r?'#fff':'#71717a',fontSize:12,fontWeight:900,cursor:'pointer',transition:'all .12s'}}>{r}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* DROP button */}
            <button onClick={()=>handleDrop(1)} disabled={dropping||(balance??0)<bet}
              style={{width:'100%',height:56,borderRadius:14,background:(dropping||(balance??0)<bet)?'#1c1c1f':'linear-gradient(180deg,#fde047 0%,#eab308 55%,#a16207 100%)',border:(dropping||(balance??0)<bet)?'1px solid #3f3f46':'none',color:(dropping||(balance??0)<bet)?'#52525b':'#1c1917',fontSize:18,fontWeight:900,cursor:(dropping||(balance??0)<bet)?'not-allowed':'pointer',letterSpacing:'-0.3px',boxShadow:(dropping||(balance??0)<bet)?'none':'0 8px 0 #92400e,0 1px 0 rgba(255,255,255,0.2) inset',transition:'all .12s',display:'flex',alignItems:'center',justifyContent:'center',gap:10,textTransform:'uppercase'}}>
              {dropping && ballsRef.current.length > 0 ? (
                <><span style={{display:'inline-block',width:16,height:16,borderRadius:'50%',border:'2px solid rgba(28,28,31,0.3)',borderTopColor:'#1c1917',animation:'spin .7s linear infinite'}}/> Dropping…</>
              ) : (
                <><span style={{fontSize:20}}>▶</span> Drop Ball <span style={{background:'rgba(0,0,0,0.2)',borderRadius:8,padding:'3px 12px',fontSize:14,fontWeight:900,marginLeft:4}}>{bet} ETB</span></>
              )}
            </button>

            {/* Multi-drop + Auto */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8}}>
              {[
                {label:'5x Drop', count:5,  icon:'⚡', col:'#facc15'},
                {label:'10x Rain',count:10, icon:'🌧', col:'#60a5fa'},
                {label:'25x Storm',count:25,icon:'🔥', col:'#f97316'},
              ].map(item=>(
                <button key={item.label} onClick={()=>handleDrop(item.count)} disabled={dropping||(balance??0)<bet*item.count}
                  style={{padding:'11px 4px',borderRadius:12,background:'#1c1c1f',border:`1px solid ${item.col}33`,color:'#e2e8f0',cursor:(dropping||(balance??0)<bet*item.count)?'not-allowed':'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,opacity:(dropping||(balance??0)<bet*item.count)?0.4:1,transition:'all .15s'}}>
                  <span style={{fontSize:18}}>{item.icon}</span>
                  <span style={{fontSize:9,fontWeight:900,color:item.col,textTransform:'uppercase'}}>{item.label}</span>
                  <span style={{fontSize:9,color:'#52525b',fontFamily:'monospace'}}>{(bet*item.count).toLocaleString()}</span>
                </button>
              ))}
              <button onClick={()=>setAutoPlay(a=>!a)}
                style={{padding:'11px 4px',borderRadius:12,background:autoPlay?'rgba(239,68,68,0.15)':'#1c1c1f',border:autoPlay?'1px solid rgba(239,68,68,0.5)':'1px solid #3f3f46',color:'#e2e8f0',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,transition:'all .15s'}}>
                <span style={{fontSize:18}}>{autoPlay?'⏸':'🔄'}</span>
                <span style={{fontSize:9,fontWeight:900,color:autoPlay?'#f87171':'#22d3ee',textTransform:'uppercase'}}>{autoPlay?'Stop':'Auto'}</span>
                <span style={{fontSize:9,color:'#52525b',fontFamily:'monospace'}}>{autoSpeed}x spd</span>
              </button>
            </div>

          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
      `}</style>
    </div>
  );
}

function HistoryTab({ items }: { items: HistEntry[] }) {
  if (!items.length) return (
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,color:'#3f3f46',padding:48}}>
      <div style={{fontSize:36}}>📋</div>
      <div style={{fontSize:13,fontWeight:700}}>No history yet</div>
    </div>
  );
  return (
    <div style={{flex:1,overflowY:'auto'}}>
      {items.map(item=>{
        const won=item.payout>=item.betAmount, diff=item.payout-item.betAmount;
        return (
          <div key={item.id} style={{padding:'12px 14px',borderBottom:'1px solid #27272a',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:40,height:40,borderRadius:10,background:slotColor(item.multiplier)+'22',border:`1px solid ${slotColor(item.multiplier)}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:900,color:slotColor(item.multiplier),flexShrink:0}}>{item.multiplier}x</div>
              <div>
                <div style={{fontSize:12,fontWeight:800,color:'#d4d4d8'}}>{item.rows}R · {item.risk}</div>
                <div style={{fontSize:10,color:'#52525b',marginTop:2}}>{new Date(item.createdAt).toLocaleString()}</div>
              </div>
            </div>
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{fontSize:14,fontWeight:900,color:won?'#4ade80':'#f87171'}}>{diff>=0?'+':''}{diff.toFixed(2)}</div>
              <div style={{fontSize:9,color:'#52525b',fontWeight:700}}>Bet {item.betAmount}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}