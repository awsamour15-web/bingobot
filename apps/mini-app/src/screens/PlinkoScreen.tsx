import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile, dropPlinko, getPlinkoHistory, checkPlinkoAccess } from '../lib/api';
import plinkoBg from '../assets/bg.jpg';
import plinkoLogo from '../assets/plinko_origin_v2_atlas_1.png';

type Risk = 'easy' | 'medium' | 'hard';
type Rows = 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

const MULTS: Record<number, Record<Risk, number[]>> = {
  8:  { easy:[5,1.8,1.5,1,0.7,0.7,1,1.5,1.8,5],         medium:[10,3,1.2,0.6,0.3,0.6,1.2,3,10],           hard:[20,5,1.5,0.4,0.2,0.4,1.5,5,20] },
  9:  { easy:[5,1.8,1.5,1,0.7,0.7,1,1.5,1.8,5],         medium:[8.2,2.6,1.2,1.1,1,0.5,1,1.1,1.2,2.6,8.2], hard:[14,5,2.2,1,0.5,0.2,0.5,1,2.2,5,14] },
  10: { easy:[8.2,2.6,1.2,1.1,1,0.5,1,1.1,1.2,2.6,8.2], medium:[7.6,2.7,1.7,1.2,1,0.7,0.7,1,1.2,1.7,2.7,7.6], hard:[20,8,4,2,1,0.4,0.2,0.4,1,2,4,8,20] },
  11: { easy:[7.6,2.7,1.7,1.2,1,0.7,0.7,1,1.2,1.7,2.7,7.6], medium:[9,2.7,1.5,1.2,1.1,1,0.5,1,1.1,1.2,1.5,2.7,9], hard:[25,9,4,2,1,0.5,0.3,0.5,1,2,4,9,25] },
  12: { easy:[9,2.7,1.5,1.2,1.1,1,0.5,1,1.1,1.2,1.5,2.7,9], medium:[7.5,3.6,2.7,1.7,1,0.9,0.7,0.7,0.9,1,1.7,2.7,3.6,7.5], hard:[30,12,5,2,0.8,0.3,0.2,0.3,0.8,2,5,12,30] },
  13: { easy:[7.5,3.6,2.7,1.7,1,0.9,0.7,0.7,0.9,1,1.7,2.7,3.6,7.5], medium:[6.5,3.6,1.7,1.2,1.2,1.1,1,0.5,1,1.1,1.2,1.2,1.7,3.6,6.5], hard:[35,14,6,3,1.2,0.5,0.2,0.2,0.5,1.2,3,6,14,35] },
  14: { easy:[6.5,3.6,1.7,1.2,1.2,1.1,1,0.5,1,1.1,1.2,1.2,1.7,3.6,6.5], medium:[15,8,4,2,1.5,1,0.8,0.4,0.4,0.8,1,1.5,2,4,8,15], hard:[40,15,8,4,2,1,0.5,0.3,0.3,0.5,1,2,4,8,15,40] },
  15: { easy:[14,7,2.7,1.8,1.4,1,0.6,0.6,1,1.4,1.8,2.7,7,14,14],  medium:[15,8,4,2,1.5,1,0.8,0.4,0.4,0.8,1,1.5,2,4,8,15], hard:[80,16,10,4.5,2.7,1.4,1,0.5,0.3,0.3,0.5,1,1.4,2.7,4.5,10,16,80] },
  16: { easy:[15,8,1.8,1.5,1,0.6,0.6,1,1.1,1.2,1.3,1.8,8,16,15,15], medium:[20,8,4,2,1.5,1,0.8,0.4,0.4,0.8,1,1.5,2,4,8,20], hard:[100,37,9,4.5,2.7,1.4,1,0.5,0.3,0.3,0.5,1,1.4,2.7,4.5,9,37,100] },
};

function getMults(r: Rows, risk: Risk): number[] {
  return MULTS[r]?.[risk] ?? MULTS[16]![risk];
}
function toApiRows(r: Rows): 8 | 12 | 16 {
  if (r <= 9) return 8;
  if (r <= 13) return 12;
  return 16;
}
function slotFg(m: number): string {
  if (m >= 50)  return '#ef4444';
  if (m >= 10)  return '#fb923c';
  if (m >= 3)   return '#facc15';
  if (m >= 1.5) return '#a3e635';
  if (m >= 0.8) return '#38bdf8';
  return '#818cf8';
}
function slotBg(m: number): string {
  if (m >= 50)  return 'rgba(239,68,68,0.28)';
  if (m >= 10)  return 'rgba(251,146,60,0.25)';
  if (m >= 3)   return 'rgba(250,204,21,0.2)';
  if (m >= 1.5) return 'rgba(163,230,53,0.18)';
  if (m >= 0.8) return 'rgba(56,189,248,0.16)';
  return 'rgba(129,140,248,0.15)';
}

function mkAudio(): AudioContext | null {
  try { return new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
}
function pegSound(ctx: AudioContext) {
  try {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.type = 'sine';
    o.frequency.setValueAtTime(750 + Math.random()*350, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(160, ctx.currentTime + 0.055);
    g.gain.setValueAtTime(0.1, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    o.start(); o.stop(ctx.currentTime + 0.065);
  } catch {}
}
function landSound(ctx: AudioContext, m: number) {
  try {
    const now = ctx.currentTime;
    if (m >= 10) {
      [523,659,784,1047].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = f;
        const t = now + i*0.065;
        g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.4);
        o.start(t); o.stop(t+0.45);
      });
    } else {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = m >= 2 ? 'triangle' : 'sine'; o.frequency.value = m >= 2 ? 660 : 140;
      g.gain.setValueAtTime(0.12, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      o.start(); o.stop(now + 0.28);
    }
  } catch {}
}

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
interface Spark   { x:number;y:number;vx:number;vy:number;col:string;sz:number;a:number;dec:number; }
interface FloatTx { x:number;y:number;text:string;col:string;a:number;vy:number;sc:number; }
interface SlotPop { intensity:number;ts:number; }
interface Hist    { id:string;betAmount:number;rows:number;risk:string;slot:number;multiplier:number;payout:number;createdAt:string; }

const MIN_BET = 5, MAX_BET = 10_000;

export default function PlinkoScreen() {
  const navigate = useNavigate();
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const boardRef    = useRef<HTMLDivElement>(null);
  const ballsRef    = useRef<Ball[]>([]);
  const ringsRef    = useRef<PegRing[]>([]);
  const sparksRef   = useRef<Spark[]>([]);
  const floatsRef   = useRef<FloatTx[]>([]);
  const popsRef     = useRef<Map<number,SlotPop>>(new Map());
  const audioRef    = useRef<AudioContext|null>(null);
  const pegThrot    = useRef(0);
  const autoTmr     = useRef<ReturnType<typeof setInterval>|null>(null);
  const droppingRef = useRef(false);

  const [boardH, setBoardH] = useState(320);
  const [boardW, setBoardW] = useState(390);
  const [mainBal, setMainBal] = useState<number|null>(null);
  const [playBal, setPlayBal] = useState<number|null>(null);
  const [serverBal, setServerBal] = useState<number|null>(null);
  const [bet, setBet]   = useState(5);
  const [rows, setRows] = useState<Rows>(16);
  const [risk, setRisk] = useState<Risk>('hard');
  const [activeWallet, setActiveWallet] = useState<'play'|'main'>('play');
  const [dropping, setDropping] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [recent, setRecent]   = useState<{m:number}[]>([]);
  const [history, setHistory] = useState<Hist[]>([]);
  const [tab, setTab]         = useState<'game'|'history'|'leaders'>('game');
  const [error, setError]     = useState<string|null>(null);
  const [allowed, setAllowed] = useState<boolean|null>(null);

  useEffect(() => { droppingRef.current = dropping; }, [dropping]);

  useEffect(() => {
    const measure = () => {
      if (!boardRef.current) return;
      const r = boardRef.current.getBoundingClientRect();
      setBoardW(r.width);
      setBoardH(Math.max(220, r.height));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (boardRef.current) ro.observe(boardRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const unlock = () => { if (!audioRef.current) audioRef.current = mkAudio(); };
    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('mousedown',  unlock, { once: true });
    return () => { window.removeEventListener('touchstart', unlock); window.removeEventListener('mousedown', unlock); };
  }, []);

  useEffect(() => {
    getProfile().then(p => { setMainBal(p.mainWallet.balance); setPlayBal(p.playWallet.balance); }).catch(() => {});
    checkPlinkoAccess().then(r => setAllowed(r.allowed)).catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    if (tab === 'history') getPlinkoHistory().then(setHistory).catch(() => {});
  }, [tab]);

  useEffect(() => {
    if (!autoPlay) { if (autoTmr.current) clearInterval(autoTmr.current); return; }
    autoTmr.current = setInterval(() => { if (!droppingRef.current) handleDrop(); }, 600);
    return () => { if (autoTmr.current) clearInterval(autoTmr.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, bet, rows, risk]);

  function geom(w: number, h: number, r: number) {
    const topPad = 38, botPad = 48;
    const avail = h - topPad - botPad;
    const rowSp = avail / r;
    const pinR  = Math.max(2.2, Math.min(4.0, 38 / r));
    const ballR = Math.max(4.0, Math.min(7.0, 54 / r));
    const spread = w * 0.88;
    const colSp  = spread / (r + 1);
    const pegs: {x:number;y:number;row:number}[] = [];
    for (let row = 0; row < r; row++) {
      const pins = row + 3;
      const rowY = topPad + (row + 0.5) * rowSp;
      const rowW = (pins - 1) * colSp;
      const sx   = (w - rowW) / 2;
      for (let c = 0; c < pins; c++) pegs.push({ x: sx + c*colSp, y: rowY, row });
    }
    const slots = r + 1;
    const slotX = (w - slots * colSp) / 2;
    const slotY = h - botPad + 6;
    const slotH = Math.max(28, Math.min(38, botPad - 10));
    return { topPad, rowSp, colSp, pegs, pinR, ballR, slotY, slotH, slotX, slots };
  }

  function winFx(si: number, m: number, sx: number, sy: number, sw: number) {
    const big = m >= 5, jp = m >= 20;
    popsRef.current.set(si, { intensity: jp?1:big?0.7:0.38, ts: Date.now() });
    floatsRef.current.push({ x: sx+sw/2, y: sy-8, text:`${m}x`,
      col: jp?'#f87171':big?'#fbbf24':'#7dd3fc', a:1, vy: big?-1.5:-1.0, sc: jp?1.4:big?1.1:0.9 });
    const n = jp?38:big?18:5;
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI/2 + (Math.random()-0.5)*Math.PI*0.9;
      const spd = Math.random()*(jp?7:big?5:2.5)+1.2;
      const cols = jp?['#ef4444','#f59e0b','#fff','#ec4899']:big?['#f59e0b','#22d3ee','#a3e635']:['#94a3b8','#7dd3fc'];
      sparksRef.current.push({
        x: sx+sw/2+(Math.random()-0.5)*sw*0.6, y: sy,
        vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd,
        col: cols[Math.floor(Math.random()*cols.length)]!,
        sz: Math.random()*(jp?4.5:3)+1.2, a:1, dec: Math.random()*0.022+0.014,
      });
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) return;
    let afId: number, lastT = performance.now();
    const bgImage = new Image();
    bgImage.src = plinkoBg;

    const loop = (now: number) => {
      const dt  = Math.min((now - lastT) / 1000, 0.05); lastT = now;
      const w   = boardW, h = boardH;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== w*dpr || canvas.height !== h*dpr) {
        canvas.width = w*dpr; canvas.height = h*dpr;
      }
      ctx.save(); ctx.scale(dpr, dpr);

      const g = geom(w, h, rows);
      const { topPad, rowSp, colSp, pegs, pinR, ballR, slotY, slotH, slotX, slots } = g;
      const muls = getMults(rows, risk);

      if (bgImage.complete && bgImage.naturalWidth > 0) {
        const scale = Math.max(w / bgImage.naturalWidth, h / bgImage.naturalHeight);
        const iw = bgImage.naturalWidth * scale, ih = bgImage.naturalHeight * scale;
        ctx.drawImage(bgImage, (w - iw) / 2, (h - ih) / 2, iw, ih);
        ctx.fillStyle = 'rgba(8,5,16,0.45)';
        ctx.fillRect(0, 0, w, h);
      } else {
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#110a24'); bgGrad.addColorStop(1, '#08050f');
        ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, w, h);
      }

      const tg = ctx.createRadialGradient(w/2, 0, 0, w/2, 0, w*0.38);
      tg.addColorStop(0, 'rgba(160,100,255,0.18)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = tg; ctx.fillRect(0, 0, w, h*0.5);

      ctx.save();
      ctx.fillStyle = '#200a3c';
      ctx.beginPath(); ctx.ellipse(w/2, topPad-14, 14, 9, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(180,70,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();

      const SUB = 4, sDt = dt/SUB, G = 650, rst = 0.50;
      for (let s = 0; s < SUB; s++) {
        for (let i = ballsRef.current.length-1; i >= 0; i--) {
          const b = ballsRef.current[i]!;
          if (b.status !== 'falling') continue;
          b.vy += G*sDt; b.vx *= 1-0.09*sDt; b.vy *= 1-0.015*sDt;
          b.x += b.vx*sDt; b.y += b.vy*sDt;
          if (s === 0 && Math.random() > 0.45) {
            b.trail.unshift({x:b.x, y:b.y, a:0.65});
            if (b.trail.length > 8) b.trail.pop();
          }
          const frac = Math.max(0, Math.min(1, (b.y-topPad)/(rowSp*rows)));
          const hw = (2 + (rows)*frac) * colSp * 0.5;
          const wl = w/2-hw-ballR, wr = w/2+hw+ballR;
          if (b.x < wl) { b.x = wl; b.vx = Math.abs(b.vx)*0.45; }
          if (b.x > wr) { b.x = wr; b.vx = -Math.abs(b.vx)*0.45; }
          for (const peg of pegs) {
            const dx = b.x-peg.x, dy = b.y-peg.y;
            const d2 = dx*dx+dy*dy, md = ballR+pinR;
            if (d2 < md*md) {
              const d = Math.sqrt(d2)||0.001;
              const nx = dx/d, ny = dy/d;
              b.x += nx*(md-d); b.y += ny*(md-d);
              const van = b.vx*nx+b.vy*ny;
              if (van < 0) {
                let jitter = (Math.random()-0.5)*0.14;
                if (b.serverPath) {
                  const dir = b.serverPath[peg.row];
                  if (dir !== undefined) {
                    const str = 0.50+Math.random()*0.08;
                    jitter = dir===1 ? str : -str;
                    b.lastRow = peg.row;
                  }
                }
                const tx=-ny, ty=nx, imp=-(1+rst)*van;
                b.vx += (nx+tx*jitter)*imp; b.vy += (ny+ty*jitter)*imp;
                if (b.vy < -50) b.vy = -50;
                ringsRef.current.push({x:peg.x,y:peg.y,r:pinR,maxR:pinR*3.8,a:1,col:b.color});
                const nowMs = performance.now();
                if (audioRef.current && nowMs-pegThrot.current > 48) {
                  pegThrot.current = nowMs; pegSound(audioRef.current);
                }
              }
            }
          }
          if (b.y >= slotY) {
            b.status = 'landed';
            const si = b.serverSlot !== undefined
              ? b.serverSlot
              : Math.max(0, Math.min(slots-1, Math.floor((b.x-slotX)/colSp)));
            const m = b.serverMult ?? (muls[si] ?? 1);
            b.serverPayout = b.serverPayout ?? b.betAmount*m;
            b.x = slotX + si*colSp + colSp/2;
            winFx(si, m, slotX+si*colSp, slotY, colSp);
            if (audioRef.current) landSound(audioRef.current, m);
          }
        }
      }

      const landed = ballsRef.current.filter(b => b.status==='landed');
      if (landed.length) {
        ballsRef.current = ballsRef.current.filter(b => b.status==='falling');
        const tp = landed.reduce((s,b)=>s+(b.serverPayout??b.betAmount),0);
        const tb = landed.reduce((s,b)=>s+b.betAmount,0);
        setRecent(p => [{m:tp/tb},...p].slice(0,20));
        if (ballsRef.current.length === 0) setDropping(false);
      }

      for (const peg of pegs) {
        ctx.save();
        ctx.shadowColor = 'rgba(230,200,60,0.5)'; ctx.shadowBlur = 5;
        const pg = ctx.createRadialGradient(peg.x-pinR*0.28,peg.y-pinR*0.32,0,peg.x,peg.y,pinR);
        pg.addColorStop(0, '#fffce0'); pg.addColorStop(0.4,'#d4b840'); pg.addColorStop(1,'#7a6018');
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.arc(peg.x,peg.y,pinR,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }

      for (let i=ringsRef.current.length-1; i>=0; i--) {
        const rg=ringsRef.current[i]!;
        rg.r += (rg.maxR-rg.r)*0.22+0.35; rg.a *= 0.83;
        if (rg.a>0.04) {
          ctx.save(); ctx.strokeStyle=rg.col; ctx.globalAlpha=rg.a; ctx.lineWidth=1.4;
          ctx.beginPath(); ctx.arc(rg.x,rg.y,rg.r,0,Math.PI*2); ctx.stroke(); ctx.restore();
        } else ringsRef.current.splice(i,1);
      }

      const nowMs = Date.now();
      for (let i=0; i<slots; i++) {
        const m = muls[i]??0, fg=slotFg(m), bg2=slotBg(m);
        const sx = slotX+i*colSp+1.5, sw2 = colSp-3;
        const pop = popsRef.current.get(i);
        let scY=1, oY=0;
        if (pop) {
          const el=(nowMs-pop.ts)/1000;
          if (el<0.38) {
            const sp=Math.sin((el/0.38)*Math.PI*2.7)*Math.exp(-el*5.5);
            scY=1+sp*pop.intensity*0.28; oY=-sp*pop.intensity*5;
          } else popsRef.current.delete(i);
        }
        ctx.save();
        ctx.translate(sx+sw2/2,slotY+oY+slotH/2); ctx.scale(1,scY); ctx.translate(-(sx+sw2/2),-(slotY+oY+slotH/2));
        ctx.fillStyle=bg2;
        ctx.beginPath(); ctx.roundRect(sx,slotY+oY,sw2,slotH,Math.min(4,sw2*0.2)); ctx.fill();
        ctx.strokeStyle=fg+'55'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.roundRect(sx,slotY+oY,sw2,slotH,Math.min(4,sw2*0.2)); ctx.stroke();
        const hl=ctx.createLinearGradient(sx,slotY+oY,sx,slotY+oY+slotH*0.45);
        hl.addColorStop(0,'rgba(255,255,255,0.14)'); hl.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=hl;
        ctx.beginPath(); ctx.roundRect(sx,slotY+oY,sw2,slotH*0.45,[Math.min(4,sw2*0.2),Math.min(4,sw2*0.2),0,0]); ctx.fill();
        ctx.fillStyle=fg; ctx.shadowColor=fg; ctx.shadowBlur=3;
        const fs=Math.max(5.5,Math.min(9.5,sw2*0.36));
        ctx.font=`bold ${fs}px Inter,sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(`${m}`,sx+sw2/2,slotY+oY+slotH/2);
        ctx.restore();
      }

      for (const b of ballsRef.current) {
        if (b.status!=='falling') continue;
        for (let t=b.trail.length-1; t>=0; t--) {
          const pt=b.trail[t]!; pt.a*=0.84;
          if (pt.a>0.03) {
            ctx.save(); ctx.fillStyle=b.color; ctx.globalAlpha=pt.a*0.42;
            ctx.beginPath(); ctx.arc(pt.x,pt.y,ballR*(0.3+(1-t/b.trail.length)*0.55),0,Math.PI*2); ctx.fill(); ctx.restore();
          }
        }
        ctx.save();
        ctx.shadowColor=b.glow; ctx.shadowBlur=14;
        ctx.fillStyle=b.color; ctx.beginPath(); ctx.arc(b.x,b.y,ballR,0,Math.PI*2); ctx.fill();
        ctx.shadowBlur=0; ctx.fillStyle='rgba(255,255,255,0.78)';
        ctx.beginPath(); ctx.arc(b.x-ballR*0.3,b.y-ballR*0.3,ballR*0.34,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }

      for (let i=sparksRef.current.length-1; i>=0; i--) {
        const p=sparksRef.current[i]!;
        p.x+=p.vx; p.y+=p.vy; p.vy+=0.12; p.a-=p.dec;
        if (p.a>0) {
          ctx.save(); ctx.globalAlpha=p.a; ctx.fillStyle=p.col;
          ctx.beginPath(); ctx.arc(p.x,p.y,p.sz,0,Math.PI*2); ctx.fill(); ctx.restore();
        } else sparksRef.current.splice(i,1);
      }

      for (let i=floatsRef.current.length-1; i>=0; i--) {
        const ft=floatsRef.current[i]!;
        ft.y+=ft.vy; ft.a-=0.018;
        if (ft.a>0) {
          ctx.save(); ctx.globalAlpha=ft.a;
          ctx.font=`bold ${Math.round(14*ft.sc)}px Inter,sans-serif`;
          ctx.fillStyle=ft.col; ctx.textAlign='center';
          ctx.shadowColor='rgba(0,0,0,0.95)'; ctx.shadowBlur=4;
          ctx.fillText(ft.text,ft.x,ft.y); ctx.restore();
        } else floatsRef.current.splice(i,1);
      }

      ctx.restore();
      afId = requestAnimationFrame(loop);
    };

    afId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(afId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardW, boardH, rows, risk]);

  async function handleDrop() {
    const play = playBal ?? 0;
    const main = mainBal ?? 0;
    const activeBal = play >= bet ? play : main;
    if (activeBal < bet) { setError('Insufficient balance'); return; }
    setError(null); setDropping(true);
    try {
      const apiRisk = risk==='easy' ? 'low' : risk==='medium' ? 'medium' : 'high';
      const result = await dropPlinko(bet, toApiRows(rows), apiRisk);
      setServerBal(result.totalBalance);
      const used = result.walletUsed ?? (play >= bet ? 'play' : 'main');
      setActiveWallet(used);
      if (used === 'play') setPlayBal(p => (p??0) - bet + result.payout);
      else setMainBal(p => (p??0) - bet + result.payout);

      const bc = risk==='hard'
        ? {color:'#f43f5e',glow:'rgba(244,63,94,0.85)'}
        : risk==='medium'
        ? {color:'#f59e0b',glow:'rgba(245,158,11,0.85)'}
        : {color:'#34d399',glow:'rgba(52,211,153,0.85)'};

      ballsRef.current.push({
        id: result.id ?? String(Date.now()),
        x: boardW/2 + (Math.random()-0.5)*5,
        y: 22,
        vx: (Math.random()-0.5)*2.5,
        vy: Math.random()*10+28,
        ...bc, betAmount: bet,
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

  const activeBal = (playBal??0) >= bet ? (playBal??0) : (mainBal??0);
  const totalBal  = serverBal ?? ((mainBal??0)+(playBal??0));
  const maxMul    = Math.max(...getMults(rows, risk));
  const canDrop   = !dropping && activeBal >= bet;

  if (allowed === false) {
    return (
      <div style={{height:'100dvh',background:'#0d0a1e',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,padding:24,color:'#f8fafc',fontFamily:'Inter,sans-serif',textAlign:'center'}}>
        <div style={{fontSize:44}}>🚫</div>
        <div style={{fontSize:18,fontWeight:900,color:'#a78bfa'}}>Plinko Not Available</div>
        <div style={{fontSize:12,color:'#6b7280',maxWidth:260}}>Plinko is not available for your account yet.</div>
        <button onClick={()=>navigate('/')} style={{marginTop:8,background:'#1e1b4b',border:'1px solid #4f46e5',color:'#a5b4fc',borderRadius:10,padding:'9px 22px',fontSize:12,fontWeight:700,cursor:'pointer'}}>Back</button>
      </div>
    );
  }

  return (
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'linear-gradient(180deg,#110a24 0%,#08050f 100%)',color:'#f8fafc',fontFamily:'Inter,sans-serif',maxWidth:480,margin:'0 auto',overflow:'hidden'}}>

      {/* Header */}
      <div style={{flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:'rgba(17,10,36,0.97)',borderBottom:'1px solid rgba(139,92,246,0.22)',backdropFilter:'blur(10px)'}}>
        <button onClick={()=>navigate('/')} style={{background:'rgba(139,92,246,0.12)',border:'1px solid rgba(139,92,246,0.32)',color:'#c4b5fd',borderRadius:9,padding:'6px 11px',fontSize:11,fontWeight:800,cursor:'pointer'}}>Back</button>
        <img src={plinkoLogo} alt="PLINKO" style={{height:22,objectFit:'contain',display:'block'}} />
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:7.5,color:'#6b7280',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.12em'}}>Total</div>
          <div style={{fontSize:12,fontWeight:900,color:'#fbbf24'}}>{totalBal.toFixed(2)} <span style={{fontSize:8,color:'#9ca3af'}}>ETB</span></div>
        </div>
      </div>

      {/* Recent strip */}
      <div style={{flexShrink:0,background:'rgba(8,5,16,0.92)',borderBottom:'1px solid rgba(139,92,246,0.1)',padding:'4px 10px',display:'flex',alignItems:'center',gap:5,overflowX:'auto',scrollbarWidth:'none',height:28}}>
        <span style={{fontSize:7.5,color:'#4b5563',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em',flexShrink:0}}>Recent:</span>
        {recent.length===0 && <span style={{fontSize:9,color:'#374151'}}>-</span>}
        {recent.map((r,i)=>{
          const c=r.m>=10?'#f87171':r.m>=2?'#fbbf24':r.m>=1?'#86efac':'#6b7280';
          return <div key={i} style={{flexShrink:0,padding:'1px 7px',borderRadius:20,background:`${c}18`,fontSize:9,fontWeight:900,color:c}}>{r.m.toFixed(1)}x</div>;
        })}
      </div>

      {/* Board */}
      <div ref={boardRef} style={{flex:1,position:'relative',overflow:'hidden',minHeight:0}}>
        <canvas ref={canvasRef} style={{display:'block',width:'100%',height:'100%',touchAction:'none'}}/>
        {dropping && ballsRef.current.length>0 && (
          <div style={{position:'absolute',top:6,right:8,background:'rgba(244,63,94,0.14)',border:'1px solid rgba(244,63,94,0.3)',borderRadius:20,padding:'2px 9px',fontSize:7.5,fontWeight:800,color:'#f87171',letterSpacing:'0.12em'}}>LIVE</div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{flexShrink:0,margin:'4px 12px',padding:'6px 12px',borderRadius:7,background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.22)',fontSize:11,color:'#f87171'}}>
          {error}
          <button onClick={()=>setError(null)} style={{float:'right',background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:12}}>x</button>
        </div>
      )}

      {/* Wallet display (auto-selected) */}
      <div style={{flexShrink:0,background:'rgba(8,5,16,0.97)',borderTop:'1px solid rgba(139,92,246,0.14)',padding:'6px 12px 5px'}}>
        <div style={{display:'flex',gap:6}}>
          {(['play','main'] as const).map(w => {
            const bal = w === 'play' ? (playBal??0) : (mainBal??0);
            const active = activeWallet === w;
            const col = w === 'play' ? '#a78bfa' : '#fbbf24';
            const label = w === 'play' ? 'Play Wallet' : 'Main Wallet';
            const isAutoSelected = w === 'play' ? (playBal??0) >= bet : (playBal??0) < bet;
            return (
              <div key={w} style={{
                flex:1, padding:'6px 8px', borderRadius:9, textAlign:'left',
                background: active ? `${col}18` : 'rgba(255,255,255,0.03)',
                border: active ? `1.5px solid ${col}55` : '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{fontSize:7.5,color: active ? col : '#4b5563',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:1,display:'flex',alignItems:'center',gap:4}}>
                  {label}
                  {isAutoSelected && <span style={{fontSize:6,background:`${col}22`,borderRadius:4,padding:'1px 4px',color:col}}>AUTO</span>}
                </div>
                <div style={{fontSize:13,fontWeight:900,color: active ? col : '#6b7280',fontFamily:'monospace'}}>{bal.toFixed(2)} <span style={{fontSize:8,fontWeight:600,color:'#6b7280'}}>ETB</span></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lines selector */}
      <div style={{flexShrink:0,background:'rgba(8,5,16,0.97)',borderTop:'1px solid rgba(139,92,246,0.14)',padding:'5px 10px 4px'}}>
        <div style={{fontSize:8,color:'#6b7280',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.14em',textAlign:'center',marginBottom:4}}>LINES</div>
        <div style={{display:'flex',gap:4,justifyContent:'center'}}>
          {([8,9,10,11,12,13,14,15,16] as Rows[]).map(r=>{
            const active=rows===r;
            return (
              <button key={r} onClick={()=>setRows(r)}
                style={{width:30,height:30,borderRadius:8,border:active?'2px solid #7c3aed':'1px solid rgba(139,92,246,0.22)',background:active?'linear-gradient(180deg,#7c3aed,#5b21b6)':'rgba(139,92,246,0.07)',color:active?'#fff':'#9ca3af',fontSize:12,fontWeight:900,cursor:'pointer',padding:0,transition:'all .1s'}}>
                {r}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom controls */}
      <div style={{flexShrink:0,background:'rgba(10,7,20,0.99)',borderTop:'1px solid rgba(139,92,246,0.14)',padding:'8px 12px 10px'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>

          {/* Left: bet controls */}
          <div style={{flex:1,display:'flex',flexDirection:'column',gap:5,minWidth:0}}>
            <div style={{background:'rgba(139,92,246,0.1)',border:'1px solid rgba(139,92,246,0.28)',borderRadius:9,padding:'5px 10px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:4}}>
              <span style={{fontSize:17,fontWeight:900,color:'#e9d5ff',fontFamily:'monospace',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{bet}</span>
              <span style={{fontSize:8,color:'#7c3aed',fontWeight:800,flexShrink:0}}>ETB</span>
            </div>
            <div style={{display:'flex',gap:4}}>
              <button onClick={()=>setBet(b=>Math.max(MIN_BET,b<=10?b-1:b<=100?b-5:b-50))}
                style={{flex:1,padding:'7px 0',borderRadius:8,background:'rgba(139,92,246,0.1)',border:'1px solid rgba(139,92,246,0.25)',color:'#c4b5fd',fontSize:17,fontWeight:900,cursor:'pointer'}}>-</button>
              <button onClick={()=>setBet(b=>Math.min(MAX_BET,b<10?b+1:b<100?b+5:b+50))}
                style={{flex:1,padding:'7px 0',borderRadius:8,background:'rgba(139,92,246,0.1)',border:'1px solid rgba(139,92,246,0.25)',color:'#c4b5fd',fontSize:17,fontWeight:900,cursor:'pointer'}}>+</button>
            </div>
            <div style={{display:'flex',gap:4}}>
              <button onClick={()=>setBet(b=>Math.min(MAX_BET,b*2))}
                style={{flex:1,padding:'5px 0',borderRadius:7,background:'rgba(22,163,74,0.13)',border:'1px solid rgba(22,163,74,0.32)',color:'#4ade80',fontSize:10,fontWeight:900,cursor:'pointer'}}>X2</button>
              <button onClick={()=>setBet(Math.max(MIN_BET,Math.min(MAX_BET,Math.floor(activeBal))))}
                style={{flex:1,padding:'5px 0',borderRadius:7,background:'rgba(22,163,74,0.13)',border:'1px solid rgba(22,163,74,0.32)',color:'#4ade80',fontSize:10,fontWeight:900,cursor:'pointer'}}>MAX</button>
            </div>
          </div>

          {/* Center: BET button */}
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,flexShrink:0}}>
            <button onClick={handleDrop} disabled={!canDrop} style={{
              width:82, height:82, borderRadius:'50%',
              background: canDrop ? 'radial-gradient(circle at 38% 32%,#4ade80,#22c55e 55%,#15803d)' : '#1a1030',
              border:'none', color: canDrop ? '#052e16' : '#4b5563',
              fontSize:13, fontWeight:900, cursor: canDrop?'pointer':'not-allowed',
              boxShadow: canDrop ? '0 5px 0 #14532d,0 0 22px rgba(34,197,94,0.3)' : 'none',
              textTransform:'uppercase', letterSpacing:'0.04em', transition:'all .1s',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2,
            }}>
              {dropping && ballsRef.current.length>0
                ? <span style={{fontSize:16,animation:'spin 0.8s linear infinite',display:'inline-block'}}>o</span>
                : <><span style={{fontSize:16}}>▶</span><span style={{fontSize:10}}>BET</span></>
              }
            </button>
            <div style={{fontSize:8,color:'#6b7280',textAlign:'center'}}>
              max <span style={{color:'#a78bfa',fontWeight:800}}>{maxMul}x</span>
            </div>
            <button onClick={()=>setAutoPlay(a=>!a)}
              style={{padding:'3px 10px',borderRadius:6,background:autoPlay?'rgba(239,68,68,0.15)':'rgba(255,255,255,0.04)',border:autoPlay?'1px solid rgba(239,68,68,0.4)':'1px solid rgba(255,255,255,0.08)',color:autoPlay?'#f87171':'#6b7280',fontSize:8,fontWeight:800,cursor:'pointer',letterSpacing:'0.06em'}}>
              {autoPlay?'STOP':'AUTO'}
            </button>
          </div>

          {/* Right: risk selector */}
          <div style={{display:'flex',flexDirection:'column',gap:5,flexShrink:0}}>
            {(['hard','medium','easy'] as Risk[]).map(r=>{
              const active=risk===r;
              const cfg = r==='hard'
                ? {label:'HARD',   col:'#ef4444', border:'rgba(239,68,68,0.4)',  bg:'rgba(239,68,68,0.14)'}
                : r==='medium'
                ? {label:'MED',    col:'#f59e0b', border:'rgba(245,158,11,0.35)',bg:'rgba(245,158,11,0.12)'}
                : {label:'EASY',   col:'#4ade80', border:'rgba(74,222,128,0.32)',bg:'rgba(74,222,128,0.1)'};
              return (
                <button key={r} onClick={()=>setRisk(r)}
                  style={{padding:'7px 10px',borderRadius:9,background:active?cfg.bg:'rgba(255,255,255,0.03)',border:active?`1.5px solid ${cfg.border}`:'1px solid rgba(255,255,255,0.06)',color:active?cfg.col:'#4b5563',fontSize:9,fontWeight:900,cursor:'pointer',letterSpacing:'0.05em',transition:'all .1s',minWidth:52,textAlign:'center'}}>
                  {cfg.label}
                </button>
              );
            })}
          </div>

        </div>
      </div>

      {/* Tab bar */}
      <div style={{flexShrink:0,display:'flex',background:'rgba(7,5,14,0.99)',borderTop:'1px solid rgba(139,92,246,0.14)'}}>
        {([{id:'game',icon:'▶',label:'GAME'},{id:'history',icon:'↺',label:'HISTORY'},{id:'leaders',icon:'✓',label:'LEADERS'}] as const).map(t=>{
          const active=tab===t.id;
          return (
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{flex:1,padding:'8px 0 6px',background:'none',border:'none',borderTop:active?'2px solid #7c3aed':'2px solid transparent',color:active?'#a78bfa':'#4b5563',fontSize:9,fontWeight:800,cursor:'pointer',letterSpacing:'0.1em',display:'flex',flexDirection:'column',alignItems:'center',gap:1}}>
              <span style={{fontSize:13}}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* History / Leaders overlay */}
      {tab !== 'game' && (
        <div style={{position:'fixed',inset:0,background:'rgba(8,5,16,0.97)',zIndex:60,maxWidth:480,margin:'0 auto',display:'flex',flexDirection:'column'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',borderBottom:'1px solid rgba(139,92,246,0.18)',flexShrink:0}}>
            <span style={{fontSize:13,fontWeight:900,color:'#c4b5fd'}}>{tab==='history'?'My History':'Leaderboard'}</span>
            <button onClick={()=>setTab('game')} style={{background:'rgba(139,92,246,0.1)',border:'1px solid rgba(139,92,246,0.28)',color:'#c4b5fd',borderRadius:8,padding:'5px 12px',fontSize:11,fontWeight:700,cursor:'pointer'}}>Close</button>
          </div>
          <div style={{flex:1,overflowY:'auto'}}>
            {tab==='history' ? <HistTab items={history}/> : <LeadTab/>}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

function HistTab({ items }: { items: { id:string;betAmount:number;rows:number;risk:string;slot:number;multiplier:number;payout:number;createdAt:string; }[] }) {
  if (!items.length) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,color:'#374151',padding:48,height:'100%'}}>
      <div style={{fontSize:30}}>📋</div>
      <div style={{fontSize:12,fontWeight:700}}>No history yet</div>
    </div>
  );
  return (
    <>
      {items.map(item => {
        const diff = item.payout - item.betAmount;
        const mc = slotFg(item.multiplier);
        return (
          <div key={item.id} style={{padding:'10px 14px',borderBottom:'1px solid rgba(139,92,246,0.1)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:36,height:36,borderRadius:8,background:slotBg(item.multiplier),border:`1px solid ${mc}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:900,color:mc,flexShrink:0}}>{item.multiplier}x</div>
              <div>
                <div style={{fontSize:11,fontWeight:800,color:'#d1d5db'}}>{item.rows}R · {item.risk}</div>
                <div style={{fontSize:9,color:'#4b5563',marginTop:2}}>{new Date(item.createdAt).toLocaleString()}</div>
              </div>
            </div>
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{fontSize:13,fontWeight:900,color:diff>=0?'#4ade80':'#f87171'}}>{diff>=0?'+':''}{diff.toFixed(2)}</div>
              <div style={{fontSize:8,color:'#6b7280',fontWeight:700}}>Bet {item.betAmount}</div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function LeadTab() {
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,color:'#374151',padding:48,height:'100%'}}>
      <div style={{fontSize:28}}>🏆</div>
      <div style={{fontSize:12,fontWeight:700,color:'#6b7280'}}>Leaderboard coming soon</div>
    </div>
  );
}
