import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile, dropPlinko, getPlinkoHistory } from '../lib/api';

type Risk = 'low' | 'medium' | 'high';
type Rows = 8 | 12 | 16;

const MIN_BET = 5;
const MAX_BET = 10_000;

// Multiplier tables from reference repo (industry standard)
const MULTIPLIERS: Record<Rows, Record<Risk, number[]>> = {
  8:  { low:[5.6,2.1,1.1,1,0.5,1,1.1,2.1,5.6], medium:[13,3,1.3,0.7,0.4,0.7,1.3,3,13], high:[29,4,1.5,0.3,0.2,0.3,1.5,4,29] },
  12: { low:[10,3,1.6,1.4,1.1,1,0.5,1,1.1,1.4,1.6,3,10], medium:[33,11,4,2,1.1,0.6,0.3,0.6,1.1,2,4,11,33], high:[170,24,8.1,2,0.7,0.2,0.2,0.2,0.7,2,8.1,24,170] },
  16: { low:[16,9,2,1.4,1.4,1.2,1.1,1,0.5,1,1.1,1.2,1.4,1.4,2,9,16], medium:[110,41,10,5,3,1.5,1,0.5,0.3,0.5,1,1.5,3,5,10,41,110], high:[1000,130,26,9,4,2,0.2,0.2,0.2,0.2,0.2,2,4,9,26,130,1000] },
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
  if (m >= 10) return '#450a0a'; if (m >= 3) return '#422006'; if (m >= 1) return '#052e16'; return '#18181b';
}
function recentFg(m: number) {
  if (m >= 10) return '#fca5a5'; if (m >= 3) return '#fde68a'; if (m >= 1) return '#86efac'; return '#6b7280';
}

interface Ball {
  id: string; x: number; y: number; vx: number; vy: number; radius: number;
  color: string; glowColor: string; betAmount: number; risk: Risk; rows: Rows;
  trail: {x:number;y:number;alpha:number}[]; status: 'falling'|'landed';
  landedSlot?: number; multiplier?: number; payout?: number;
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
  const floatTextsRef = useRef<FloatText[]>([]);
  const slotBouncesRef = useRef<Map<number,SlotBounce>>(new Map());
  const rafRef = useRef<number>(0);
  const [dims, setDims] = useState({w:380,h:480});

  const [mainBalance, setMainBalance] = useState<number|null>(null);
  const [playBalance, setPlayBalance] = useState<number|null>(null);
  const [walletType, setWalletType]   = useState<'main'|'play'>('play');
  const [bet,  setBet]   = useState(100);
  const [rows, setRows]  = useState<Rows>(16);
  const [risk, setRisk]  = useState<Risk>('high');
  const [dropping, setDropping] = useState(false);
  const [autoPlay, setAutoPlay]   = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(1);
  const [isAiming, setIsAiming]   = useState(false);
  const [aimNorm, setAimNorm]     = useState(0.5);
  const [recentResults, setRecentResults] = useState<{m:number}[]>([]);
  const [history,  setHistory]  = useState<HistEntry[]>([]);
  const [tab, setTab] = useState<'game'|'history'>('game');
  const [error, setError] = useState<string|null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setInterval>|null>(null);

  // Resize observer
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const w = Math.min(containerRef.current.offsetWidth, 480);
        const h = Math.max(360, Math.min(w * 1.1, 520));
        setDims({w,h});
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    getProfile().then(p => {
      setMainBalance(p.mainWallet.balance);
      setPlayBalance(p.playWallet.balance);
    }).catch(()=>{});
  }, []);

  useEffect(() => {
    if (tab === 'history') getPlinkoHistory().then(setHistory).catch(()=>{});
  }, [tab]);

  // Auto-play loop
  useEffect(() => {
    if (!autoPlay) { if (autoTimerRef.current) clearInterval(autoTimerRef.current); return; }
    const ms = autoSpeed === 4 ? 180 : autoSpeed === 2 ? 350 : 600;
    autoTimerRef.current = setInterval(() => handleDrop(1), ms);
    return () => { if (autoTimerRef.current) clearInterval(autoTimerRef.current); };
  }, [autoPlay, autoSpeed, bet, rows, risk, walletType]);

  function spawnWinEffects(slotIdx: number, mult: number, slotX: number, slotY: number, slotW: number, col: string) {
    const big = mult >= 10, jackpot = mult >= 100;
    slotBouncesRef.current.set(slotIdx, { intensity: jackpot?1:big?.75:.45, timestamp:Date.now(), color:col });
    floatTextsRef.current.push({ x:slotX+slotW/2, y:slotY-12, text:\`\${mult}x\`, color:jackpot?'#f87171':big?'#fbbf24':'#60a5fa', alpha:1, vy:big?-1.8:-1.2, scale:jackpot?1.4:big?1.15:.95 });
    const count = jackpot?45:big?25:8;
    for (let i=0;i<count;i++) {
      const angle = -Math.PI/2+(Math.random()-.5)*Math.PI*.9;
      const speed = Math.random()*(jackpot?8:big?5.5:3.5)+1.5;
      const colors = jackpot?['#ef4444','#f59e0b','#fbbf24','#fff','#ec4899']:big?['#f59e0b','#10b981','#38bdf8','#fbbf24']:['#94a3b8','#38bdf8','#fff'];
      particlesRef.current.push({ x:slotX+slotW/2+(Math.random()-.5)*slotW*.8, y:slotY, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed, color:colors[Math.floor(Math.random()*colors.length)], size:Math.random()*(jackpot?5:3.5)+2, alpha:1, decay:Math.random()*.02+.015, shape:jackpot&&Math.random()>.4?'star':'circle' });
    }
  }

  // Board geometry
  function calcGeom(w:number, h:number, r:number) {
    const topPad=48, botPad=62;
    const avail=h-topPad-botPad;
    const rowSpacing=avail/r;
    const pinR=Math.max(2.8,Math.min(4.5,42/r));
    const ballR=Math.max(5,Math.min(8,64/r));
    const totalBottomPins=r+2;
    const bottomSpread=w*.88;
    const colSpacing=bottomSpread/(totalBottomPins-1);
    const pegs:{x:number;y:number;row:number}[]=[];
    for (let row=0;row<r;row++) {
      const pins=row+3; const rowY=topPad+(row+.5)*rowSpacing;
      const rowW=(pins-1)*colSpacing; const sx=(w-rowW)/2;
      for (let c=0;c<pins;c++) pegs.push({x:sx+c*colSpacing,y:rowY,row});
    }
    const slotCount=r+1;
    const slotsStartX=(w-(slotCount*colSpacing))/2;
    const slotY=h-botPad+10;
    const slotH=44;
    return {topPad,rowSpacing,colSpacing,pegs,pinR,ballR,slotY,slotH,slotsStartX,slotCount};
  }

  // Main render+physics loop
  useEffect(() => {
    const canvas=canvasRef.current; if (!canvas) return;
    const ctx=canvas.getContext('2d',{alpha:false}); if (!ctx) return;
    let afId:number; let lastT=performance.now();

    const loop=(now:number)=>{
      const dt=Math.min((now-lastT)/1000,.05); lastT=now;
      const {w,h}=dims;
      const dpr=window.devicePixelRatio||1;
      if (canvas.width!==w*dpr||canvas.height!==h*dpr) { canvas.width=w*dpr; canvas.height=h*dpr; }
      ctx.save(); ctx.scale(dpr,dpr);
      const {topPad,colSpacing,pegs,pinR,ballR,slotY,slotH,slotsStartX,slotCount}=calcGeom(w,h,rows);
      const muls=MULTIPLIERS[rows][risk];

      // BG
      ctx.fillStyle='#111114'; ctx.fillRect(0,0,w,h);
      const radGrad=ctx.createRadialGradient(w/2,h*.4,20,w/2,h*.4,w*.65);
      radGrad.addColorStop(0,'rgba(30,30,35,.5)'); radGrad.addColorStop(1,'rgba(17,17,20,.98)');
      ctx.fillStyle=radGrad; ctx.fillRect(0,0,w,h);

      // Pyramid guide
      if (pegs.length>0) {
        const lastRowPegs=pegs.filter(p=>p.row===rows-1);
        if (lastRowPegs.length>=2) {
          const bl=lastRowPegs[0], br=lastRowPegs[lastRowPegs.length-1];
          ctx.beginPath(); ctx.moveTo(w/2,topPad-14); ctx.lineTo(br.x+colSpacing*.6,br.y+12); ctx.lineTo(bl.x-colSpacing*.6,bl.y+12); ctx.closePath();
          ctx.fillStyle='rgba(26,26,29,.35)'; ctx.fill();
          ctx.strokeStyle='rgba(250,204,21,.08)'; ctx.lineWidth=1.5; ctx.stroke();
        }
      }

      // Aim indicator
      const aimX=(aimNorm*.8+.1)*w;
      ctx.save();
      ctx.strokeStyle='rgba(250,204,21,.35)'; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(aimX,10); ctx.lineTo(aimX,topPad); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle='#1A1A1D'; ctx.beginPath(); ctx.arc(aimX,22,12,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#FACC15'; ctx.lineWidth=2.5; ctx.stroke();
      ctx.fillStyle='#FACC15'; ctx.beginPath(); ctx.moveTo(aimX-5,19); ctx.lineTo(aimX+5,19); ctx.lineTo(aimX,26); ctx.closePath(); ctx.fill();
      ctx.restore();

      // Physics substeps
      const SUB=4, subDt=dt/SUB, gravity=680, restitution=.58;
      for (let s=0;s<SUB;s++) {
        for (let i=ballsRef.current.length-1;i>=0;i--) {
          const ball=ballsRef.current[i]; if (ball.status!=='falling') continue;
          ball.vy+=gravity*subDt; ball.vx*=(1-.12*subDt); ball.vy*=(1-.02*subDt);
          ball.x+=ball.vx*subDt; ball.y+=ball.vy*subDt;
          if (s===0&&Math.random()>.3) { ball.trail.unshift({x:ball.x,y:ball.y,alpha:.75}); if (ball.trail.length>10) ball.trail.pop(); }
          // Peg collisions
          for (const peg of pegs) {
            const dx=ball.x-peg.x, dy=ball.y-peg.y, distSq=dx*dx+dy*dy, minD=ballR+pinR;
            if (distSq<minD*minD) {
              const dist=Math.sqrt(distSq)||.001, nx=dx/dist, ny=dy/dist;
              const overlap=minD-dist; ball.x+=nx*overlap; ball.y+=ny*overlap;
              const van=ball.vx*nx+ball.vy*ny;
              if (van<0) {
                const jitter=(Math.random()-.5)*.15, tx=-ny, ty=nx, impulse=-(1+restitution)*van;
                ball.vx+=(nx+tx*jitter)*impulse; ball.vy+=(ny+ty*jitter)*impulse;
                if (ball.vy<-80) ball.vy=-80;
                pegHitsRef.current.push({x:peg.x,y:peg.y,radius:pinR,maxRadius:pinR*3.8,alpha:1,color:ball.color});
              }
            }
          }
          // Wall bounds
          if (ball.x<ballR+6){ball.x=ballR+6;ball.vx=Math.abs(ball.vx)*.6;}
          else if (ball.x>w-ballR-6){ball.x=w-ballR-6;ball.vx=-Math.abs(ball.vx)*.6;}
          // Landing
          if (ball.y>=slotY) {
            ball.status='landed';
            const relX=ball.x-slotsStartX;
            let si=Math.max(0,Math.min(slotCount-1,Math.floor(relX/colSpacing)));
            const mult=muls[si]??1;
            ball.landedSlot=si; ball.multiplier=mult; ball.payout=ball.betAmount*mult;
            const sx=slotsStartX+si*colSpacing;
            spawnWinEffects(si,mult,sx,slotY,colSpacing,slotColor(mult));
          }
        }
      }

      // Remove landed balls, update balance
      const landed=ballsRef.current.filter(b=>b.status==='landed');
      if (landed.length) {
        ballsRef.current=ballsRef.current.filter(b=>b.status==='falling');
        const totalPayout=landed.reduce((s,b)=>s+(b.payout??0),0);
        const totalBet=landed.reduce((s,b)=>s+b.betAmount,0);
        const avgMul=totalPayout/totalBet;
        setRecentResults(p=>[{m:avgMul},...p].slice(0,20));
        if (ballsRef.current.length===0) {
          setDropping(false);
          getProfile().then(p=>{setMainBalance(p.mainWallet.balance);setPlayBalance(p.playWallet.balance);}).catch(()=>{});
        }
      }

      // Pegs
      for (const peg of pegs) {
        ctx.save(); ctx.fillStyle='#cbd5e1';
        ctx.beginPath(); ctx.arc(peg.x,peg.y,pinR,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(peg.x-pinR*.3,peg.y-pinR*.3,pinR*.45,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }

      // Peg hit waves
      for (let i=pegHitsRef.current.length-1;i>=0;i--) {
        const h2=pegHitsRef.current[i];
        h2.radius+=(h2.maxRadius-h2.radius)*.22+.5; h2.alpha*=.86;
        if (h2.alpha>.05) { ctx.save(); ctx.strokeStyle=h2.color; ctx.globalAlpha=h2.alpha; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(h2.x,h2.y,h2.radius,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
        else pegHitsRef.current.splice(i,1);
      }

      // Slot bars
      const nowMs=Date.now();
      for (let i=0;i<slotCount;i++) {
        const m=muls[i]??0, col=slotColor(m);
        const sx=slotsStartX+i*colSpacing+1.5, sw=colSpacing-3;
        const bounce=slotBouncesRef.current.get(i);
        let scaleY=1, offY=0;
        if (bounce) {
          const el=(nowMs-bounce.timestamp)/1000;
          if (el<.45) { const prog=el/.45, spring=Math.sin(prog*Math.PI*3)*Math.exp(-prog*4); scaleY=1+spring*bounce.intensity*.35; offY=-spring*bounce.intensity*8; }
          else slotBouncesRef.current.delete(i);
        }
        ctx.save();
        ctx.translate(sx+sw/2,slotY+offY+slotH/2); ctx.scale(1,scaleY); ctx.translate(-(sx+sw/2),-(slotY+offY+slotH/2));
        ctx.fillStyle=col; ctx.beginPath(); ctx.roundRect(sx,slotY+offY,sw,slotH,Math.min(6,sw*.25)); ctx.fill();
        // shine
        const sg=ctx.createLinearGradient(sx,slotY+offY,sx,slotY+offY+slotH*.45);
        sg.addColorStop(0,'rgba(255,255,255,.2)'); sg.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=sg; ctx.beginPath(); ctx.roundRect(sx,slotY+offY,sw,slotH*.45,[Math.min(6,sw*.25),Math.min(6,sw*.25),0,0]); ctx.fill();
        ctx.fillStyle='#fff'; const fs=Math.max(7,Math.min(11,sw*.42)); ctx.font=\`900 \${fs}px Inter,sans-serif\`;
        ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(\`\${m}x\`,sx+sw/2,slotY+offY+slotH/2);
        ctx.restore();
      }

      // Ball trails + balls
      for (const ball of ballsRef.current) {
        if (ball.status!=='falling') continue;
        for (let t=ball.trail.length-1;t>=0;t--) {
          const pt=ball.trail[t]; pt.alpha*=.88;
          if (pt.alpha>.05) { ctx.save(); ctx.fillStyle=ball.color; ctx.globalAlpha=pt.alpha*.5; ctx.beginPath(); ctx.arc(pt.x,pt.y,ballR*(.4+(1-t/ball.trail.length)*.6),0,Math.PI*2); ctx.fill(); ctx.restore(); }
        }
        ctx.save();
        ctx.shadowColor=ball.glowColor; ctx.shadowBlur=14;
        ctx.fillStyle=ball.color; ctx.beginPath(); ctx.arc(ball.x,ball.y,ballR,0,Math.PI*2); ctx.fill();
        ctx.shadowBlur=0; ctx.fillStyle='rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(ball.x-ballR*.3,ball.y-ballR*.3,ballR*.38,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }

      // Particles
      for (let i=particlesRef.current.length-1;i>=0;i--) {
        const p=particlesRef.current[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=.15; p.alpha-=p.decay;
        if (p.alpha>0) {
          ctx.save(); ctx.globalAlpha=p.alpha; ctx.fillStyle=p.color;
          if (p.shape==='star') {
            ctx.beginPath();
            for (let s2=0;s2<5;s2++) { ctx.lineTo(p.x+Math.cos((18+s2*72)*Math.PI/180)*p.size,p.y-Math.sin((18+s2*72)*Math.PI/180)*p.size); ctx.lineTo(p.x+Math.cos((54+s2*72)*Math.PI/180)*(p.size*.5),p.y-Math.sin((54+s2*72)*Math.PI/180)*(p.size*.5)); }
            ctx.closePath(); ctx.fill();
          } else { ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill(); }
          ctx.restore();
        } else particlesRef.current.splice(i,1);
      }

      // Floating texts
      for (let i=floatTextsRef.current.length-1;i>=0;i--) {
        const ft=floatTextsRef.current[i]; ft.y+=ft.vy; ft.alpha-=.022;
        if (ft.alpha>0) {
          ctx.save(); ctx.globalAlpha=ft.alpha; ctx.font=\`bold \${Math.round(16*ft.scale)}px Inter,sans-serif\`;
          ctx.fillStyle=ft.color; ctx.textAlign='center'; ctx.shadowColor='rgba(0,0,0,.9)'; ctx.shadowBlur=6;
          ctx.fillText(ft.text,ft.x,ft.y); ctx.restore();
        } else floatTextsRef.current.splice(i,1);
      }

      ctx.restore();
      afId=requestAnimationFrame(loop);
    };

    afId=requestAnimationFrame(loop);
    return ()=>cancelAnimationFrame(afId);
  }, [dims, rows, risk, aimNorm]);

  async function handleDrop(count=1) {
    const balance=walletType==='main'?mainBalance:playBalance;
    if ((balance??0)<bet*count) { setError('Insufficient balance'); return; }
    setError(null); setDropping(true);
    try {
      for (let i=0;i<count;i++) {
        const result=await dropPlinko(bet,rows,risk,walletType);
        // Spawn ball — physics engine will handle animation, we just need final slot from API
        // We inject ball at aim position and rely on physics to guide it realistically
        const ballColors={low:{color:'#10b981',glowColor:'rgba(16,185,129,.8)'},medium:{color:'#f59e0b',glowColor:'rgba(245,158,11,.8)'},high:{color:'#f43f5e',glowColor:'rgba(244,63,94,.8)'}}[risk];
        const {w}=dims;
        const spawnX=(aimNorm*.8+.1)*w+(Math.random()-.5)*16;
        ballsRef.current.push({
          id:\`\${Date.now()}-\${i}\`,x:Math.max(30,Math.min(w-30,spawnX)),y:28,
          vx:(Math.random()-.5)*25,vy:Math.random()*20+40,
          radius:6.5,...ballColors,betAmount:bet,risk,rows,
          trail:[],status:'falling',
        });
        if (i<count-1) await new Promise(r=>setTimeout(r,count>10?80:140));
      }
    } catch(err:any) {
      setDropping(false); setError(err?.message??'Something went wrong');
    }
  }

  function handleAim(clientX:number) {
    if (!canvasRef.current) return;
    const rect=canvasRef.current.getBoundingClientRect();
    setAimNorm(Math.max(0,Math.min(1,(clientX-rect.left)/rect.width-.1)/.8));
  }

  useEffect(()=>()=>cancelAnimationFrame(rafRef.current),[]);

  const balance=walletType==='main'?mainBalance:playBalance;
  const maxProfit=bet*(risk==='high'?(rows===16?1000:170):risk==='medium'?(rows===16?110:33):16);

  return (
    <div style={{minHeight:'100dvh',background:'#111114',color:'#f8fafc',fontFamily:"'Inter',sans-serif",display:'flex',flexDirection:'column',maxWidth:480,margin:'0 auto'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'#18181b',borderBottom:'1px solid #27272a',flexShrink:0}}>
        <button onClick={()=>navigate('/')} style={{background:'#27272a',border:'1px solid #3f3f46',color:'#71717a',borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:700,cursor:'pointer'}}>← Back</button>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:16,fontWeight:900,color:'#facc15',letterSpacing:'-0.5px',textTransform:'uppercase'}}>Plinko</span>
          <span style={{fontSize:9,background:'#1c1917',color:'#a8a29e',border:'1px solid #44403c',borderRadius:4,padding:'2px 6px',fontWeight:800,letterSpacing:'0.05em'}}>PRO</span>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:8,color:'#52525b',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em'}}>Balance</div>
          <div style={{fontSize:14,fontWeight:900,color:'#facc15'}}>{balance!==null?balance.toFixed(0):'—'} <span style={{fontSize:9,color:'#78716c'}}>ETB</span></div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',background:'#18181b',borderBottom:'1px solid #27272a',flexShrink:0}}>
        {(['game','history'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:'9px 0',background:'none',border:'none',borderBottom:tab===t?'2px solid #facc15':'2px solid transparent',color:tab===t?'#facc15':'#52525b',fontSize:11,fontWeight:800,cursor:'pointer',textTransform:'uppercase',letterSpacing:'0.08em'}}>
            {t==='game'?'🎱 Play':'📋 History'}
          </button>
        ))}
      </div>

      {tab==='history'?<HistoryTab items={history}/>:(
        <div style={{flex:1,display:'flex',flexDirection:'column',minHeight:0,overflowY:'auto'}}>

          {/* Recent results */}
          <div style={{background:'#18181b',borderBottom:'1px solid #27272a',padding:'7px 10px',flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',gap:6,overflowX:'auto',scrollbarWidth:'none'}}>
              <span style={{fontSize:9,color:'#52525b',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em',flexShrink:0}}>Recent:</span>
              {recentResults.length===0?<span style={{fontSize:10,color:'#3f3f46'}}>—</span>:recentResults.map((r,i)=>(
                <div key={i} style={{flexShrink:0,padding:'3px 9px',borderRadius:20,background:recentBg(r.m),border:\`1px solid \${recentFg(r.m)}33\`,fontSize:11,fontWeight:900,color:recentFg(r.m)}}>
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
              <div style={{background:'rgba(26,26,29,.92)',border:'1px solid rgba(250,204,21,.3)',borderRadius:20,padding:'4px 14px',fontSize:10,fontWeight:900,color:'#facc15',letterSpacing:'0.1em',backdropFilter:'blur(6px)'}}>
                ↔ DRAG TO AIM DROP POSITION
              </div>
            </div>
            <canvas ref={canvasRef} style={{display:'block',width:'100%',height:dims.h,touchAction:'none'}}/>
            {dropping&&ballsRef.current.length>0&&(
              <div style={{position:'absolute',top:44,left:'50%',transform:'translateX(-50%)',background:'rgba(244,63,94,.15)',border:'1px solid rgba(244,63,94,.4)',borderRadius:20,padding:'3px 12px',fontSize:9,fontWeight:800,color:'#f87171',letterSpacing:'0.15em'}}>● LIVE · {ballsRef.current.length} ball{ballsRef.current.length>1?'s':''}</div>
            )}
          </div>

          {error&&<div style={{margin:'8px 12px 0',padding:'9px 12px',borderRadius:8,background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.25)',fontSize:12,color:'#f87171'}}>{error}</div>}

          {/* Controls */}
          <div style={{background:'#18181b',padding:'14px 12px',display:'flex',flexDirection:'column',gap:14,borderTop:'1px solid #27272a'}}>

            {/* Bet amount */}
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <span style={{fontSize:10,color:'#52525b',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em'}}>Bet Amount</span>
                <span style={{fontSize:10,color:'#a3a3a3',fontWeight:700}}>Max profit: <span style={{color:'#facc15',fontWeight:900}}>{maxProfit.toLocaleString()} ETB</span></span>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                <div style={{flex:1,background:'#1c1c1f',border:'1px solid #3f3f46',borderRadius:14,padding:'10px 14px',display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:18}}>💎</span>
                  <input type="number" value={bet} min={MIN_BET} max={MAX_BET}
                    onChange={e=>setBet(Math.min(MAX_BET,Math.max(MIN_BET,Number(e.target.value)||MIN_BET)))}
                    style={{background:'none',border:'none',outline:'none',color:'#f8fafc',fontSize:20,fontWeight:900,width:'100%',fontFamily:'monospace'}}
                  />
                </div>
                <div style={{display:'flex',gap:4,background:'#1c1c1f',border:'1px solid #3f3f46',borderRadius:12,padding:4}}>
                  {(['½','2×','MAX'] as const).map(v=>(
                    <button key={v} onClick={()=>{if(v==='½')setBet(b=>Math.max(MIN_BET,Math.floor(b/2)));else if(v==='2×')setBet(b=>Math.min(MAX_BET,b*2));else setBet(MAX_BET);}}
                      style={{padding:'8px 9px',borderRadius:8,background:'transparent',border:'none',color:v==='MAX'?'#facc15':'#a3a3a3',fontSize:11,fontWeight:900,cursor:'pointer',whiteSpace:'nowrap'}}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{display:'flex',gap:5}}>
                {[10,50,100,500,1000].map(v=>(
                  <button key={v} onClick={()=>setBet(v)} style={{flex:1,padding:'6px 0',borderRadius:10,background:bet===v?'rgba(250,204,21,.15)':'#1c1c1f',border:\`1px solid \${bet===v?'rgba(250,204,21,.5)':'#3f3f46'}\`,color:bet===v?'#facc15':'#71717a',fontSize:10,fontWeight:800,cursor:'pointer',fontFamily:'monospace'}}>
                    +{v}
                  </button>
                ))}
              </div>
            </div>

            {/* Risk + Rows */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div>
                <div style={{fontSize:10,color:'#52525b',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7}}>🔥 Risk Level</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',background:'#1c1c1f',borderRadius:12,border:'1px solid #3f3f46',padding:4,gap:3}}>
                  {(['low','medium','high'] as Risk[]).map(r=>{
                    const active=risk===r;
                    const c=r==='low'?'#22c55e':r==='medium'?'#facc15':'#ef4444';
                    return <button key={r} onClick={()=>setRisk(r)} style={{padding:'7px 0',borderRadius:8,background:active?c:'transparent',border:'none',color:active?'#000':c,fontSize:10,fontWeight:900,cursor:'pointer',textTransform:'capitalize',transition:'all .12s'}}>
                      {r==='low'?'Low':r==='medium'?'Med':'High'}
                    </button>;
                  })}
                </div>
              </div>
              <div>
                <div style={{fontSize:10,color:'#52525b',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7}}>≡ Rows ({rows})</div>
                <div style={{display:'flex',background:'#1c1c1f',borderRadius:12,border:'1px solid #3f3f46',padding:4,gap:3}}>
                  {([8,12,16] as Rows[]).map(r=>(
                    <button key={r} onClick={()=>setRows(r)} style={{flex:1,padding:'7px 0',borderRadius:8,background:rows===r?'#0ea5e9':'transparent',border:'none',color:rows===r?'#fff':'#71717a',fontSize:12,fontWeight:900,cursor:'pointer',transition:'all .12s'}}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Wallet */}
            <div style={{display:'flex',background:'#1c1c1f',borderRadius:12,border:'1px solid #3f3f46',padding:3,gap:3}}>
              {(['main','play'] as const).map(w=>(
                <button key={w} onClick={()=>setWalletType(w)} style={{flex:1,padding:'8px 0',borderRadius:8,background:walletType===w?'rgba(250,204,21,.15)':'transparent',border:'none',color:walletType===w?'#facc15':'#52525b',fontSize:11,fontWeight:800,cursor:'pointer',textTransform:'capitalize'}}>
                  {w==='main'?'💰':'🎮'} {w} · {(w==='main'?mainBalance:playBalance)?.toFixed(0)??'—'}
                </button>
              ))}
            </div>

            {/* Big DROP button */}
            <button onClick={()=>handleDrop(1)} disabled={dropping||(balance??0)<bet}
              style={{width:'100%',height:58,borderRadius:16,background:(dropping||(balance??0)<bet)?'#1c1c1f':'linear-gradient(180deg,#fde047 0%,#eab308 55%,#a16207 100%)',border:(dropping||(balance??0)<bet)?'1px solid #3f3f46':'none',color:(dropping||(balance??0)<bet)?'#52525b':'#1c1917',fontSize:18,fontWeight:900,cursor:(dropping||(balance??0)<bet)?'not-allowed':'pointer',letterSpacing:'-0.3px',boxShadow:(dropping||(balance??0)<bet)?'none':'0 8px 0 #92400e,0 1px 0 rgba(255,255,255,.2) inset',transform:'none',transition:'all .12s',display:'flex',alignItems:'center',justifyContent:'center',gap:10,textTransform:'uppercase'}}>
              {dropping&&ballsRef.current.length>0?(
                <><span style={{display:'inline-block',width:16,height:16,borderRadius:'50%',border:'2px solid rgba(28,28,31,.3)',borderTopColor:'#1c1917',animation:'spin .7s linear infinite'}}/> Dropping…</>
              ):(
                <><span style={{fontSize:20}}>▶</span> Drop Ball <span style={{background:'rgba(0,0,0,.2)',borderRadius:8,padding:'3px 12px',fontSize:14,fontWeight:900,marginLeft:4}}>{bet} ETB</span></>
              )}
            </button>

            {/* Multi-drop + Auto */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8}}>
              {[
                {label:'5x Drop',count:5,icon:'⚡',col:'#facc15'},
                {label:'10x Rain',count:10,icon:'🌧',col:'#60a5fa'},
                {label:'25x Storm',count:25,icon:'🔥',col:'#f97316'},
              ].map(item=>(
                <button key={item.label} onClick={()=>handleDrop(item.count)} disabled={dropping||(balance??0)<bet*item.count}
                  style={{padding:'12px 4px',borderRadius:14,background:'#1c1c1f',border:\`1px solid \${item.col}33\`,color:'#e2e8f0',cursor:(dropping||(balance??0)<bet*item.count)?'not-allowed':'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,opacity:(dropping||(balance??0)<bet*item.count)?.4:1,transition:'all .15s'}}>
                  <span style={{fontSize:18}}>{item.icon}</span>
                  <span style={{fontSize:9,fontWeight:900,color:item.col,textTransform:'uppercase'}}>{item.label}</span>
                  <span style={{fontSize:9,color:'#52525b',fontFamily:'monospace'}}>{(bet*item.count).toLocaleString()}</span>
                </button>
              ))}
              <button onClick={()=>setAutoPlay(a=>!a)}
                style={{padding:'12px 4px',borderRadius:14,background:autoPlay?'rgba(239,68,68,.15)':'#1c1c1f',border:autoPlay?'1px solid rgba(239,68,68,.5)':'1px solid #3f3f46',color:'#e2e8f0',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,animation:autoPlay?'pulse 1s ease infinite':undefined,transition:'all .15s'}}>
                <span style={{fontSize:18}}>{autoPlay?'⏸':'🔄'}</span>
                <span style={{fontSize:9,fontWeight:900,color:autoPlay?'#f87171':'#22d3ee',textTransform:'uppercase'}}>{autoPlay?'Stop':'Auto'}</span>
                <span style={{fontSize:9,color:'#52525b',fontFamily:'monospace'}}>{autoSpeed}x spd</span>
              </button>
            </div>

          </div>
        </div>
      )}

      <style>{\`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
      \`}</style>
    </div>
  );
}

function HistoryTab({items}:{items:HistEntry[]}) {
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
              <div style={{width:40,height:40,borderRadius:10,background:slotColor(item.multiplier)+'22',border:\`1px solid \${slotColor(item.multiplier)}44\`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:900,color:slotColor(item.multiplier),flexShrink:0}}>{item.multiplier}x</div>
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
`;

writeFileSync('apps/mini-app/src/screens/PlinkoScreen.tsx', code, 'utf8');
console.log('Written', code.length, 'chars');