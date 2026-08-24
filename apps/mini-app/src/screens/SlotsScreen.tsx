import { useState, useRef, useCallback, useEffect } from "react";
import { spinSlots, gambleSlots, getProfile } from "../lib/api";
import type { SlotSymbol, PaylineWin, SpinResponse } from "../lib/api";

const EMOJI: Record<SlotSymbol, string> = {
  cherry: "🍒", watermelon: "🍉", orange: "🍊", lemon: "🍋",
  bell: "🔔", double_dollar: "💲", seven: "7️⃣",
};
const COLOR: Record<SlotSymbol, string> = {
  cherry: "#f87171", watermelon: "#4ade80", orange: "#fb923c",
  lemon: "#fde047", bell: "#fbbf24", double_dollar: "#a3e635", seven: "#f87171",
};
const BETS = [5, 8, 10, 20, 50, 100, 200, 500];
const SYMS: SlotSymbol[] = ["cherry","watermelon","orange","lemon","bell","double_dollar","seven"];
const PAYOUTS: Record<SlotSymbol, number> = {
  cherry: 44, watermelon: 44, orange: 88, lemon: 88,
  bell: 111, double_dollar: 222, seven: 333,
};
const LINES: [number,number,number][] = [[1,1,1],[0,0,0],[2,2,2],[0,1,2],[2,1,0]];
const INIT: SlotSymbol[][] = [
  ["cherry","lemon","orange"],
  ["watermelon","bell","cherry"],
  ["lemon","seven","watermelon"],
];

function rndSym(): SlotSymbol { return SYMS[Math.floor(Math.random()*SYMS.length)]!; }
function rndCol(): SlotSymbol[] { return [rndSym(),rndSym(),rndSym()]; }

function isWin(col: number, row: number, wins: PaylineWin[]): boolean {
  for (const w of wins) {
    const l = LINES[w.line-1];
    if (l && l[col as 0|1|2] === row) return true;
  }
  return false;
}

function ReelGrid({ reels, spinning, wins }: { reels: SlotSymbol[][], spinning: boolean, wins: PaylineWin[] }) {
  return (
    <div style={{ display:"flex", gap:8, flex:1 }}>
      {reels.map((col, ci) => (
        <div key={ci} style={{ display:"flex", flexDirection:"column", gap:4, flex:1 }}>
          {col.map((sym, row) => {
            const win = !spinning && isWin(ci, row, wins);
            return (
              <div key={row} style={{
                height:72, display:"flex", alignItems:"center", justifyContent:"center",
                borderRadius:12,
                background: win ? "rgba(251,191,36,0.18)" : "rgba(255,255,255,0.04)",
                border: win ? `1.5px solid ${COLOR[sym]}88` : "1.5px solid rgba(255,255,255,0.06)",
                fontSize:34,
                filter: spinning ? "blur(3px)" : "none",
                transition: spinning ? "none" : "all 0.25s",
                boxShadow: win ? `0 0 18px ${COLOR[sym]}44` : "none",
              }}>{EMOJI[sym]}</div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MulCol({ value, spinning }: { value: number, spinning: boolean }) {
  const c = value===1?"#94a3b8":value===2?"#fbbf24":value===3?"#fb923c":value===4?"#f87171":"#a78bfa";
  const prev = value===1?5:value-1;
  const next = value===5?1:value+1;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4, width:50 }}>
      {[prev,value,next].map((v,i) => (
        <div key={i} style={{
          height:72, display:"flex", alignItems:"center", justifyContent:"center",
          borderRadius:10,
          background: i===1?`${c}22`:"rgba(255,255,255,0.02)",
          border: i===1?`2px solid ${c}88`:"1px solid rgba(255,255,255,0.05)",
          fontSize: i===1?18:13, fontWeight:900,
          color: i===1?c:"#334155",
          filter: spinning?"blur(1px)":"none",
          transition: spinning?"none":"all 0.25s",
        }}>{v}x</div>
      ))}
    </div>
  );
}

function GambleModal({ win, onGuess, onCollect, result, loading }: {
  win: number, onGuess: (g:"red"|"black")=>void,
  onCollect: ()=>void,
  result: {won:boolean,actual:"red"|"black",payout:number}|null,
  loading: boolean,
}) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20 }}>
      <div style={{ background:"#0f172a",border:"1px solid rgba(255,255,255,0.1)",borderRadius:24,padding:28,width:"100%",maxWidth:340,textAlign:"center" }}>
        <div style={{ fontSize:13,color:"#94a3b8",marginBottom:6 }}>X2 Gamble</div>
        <div style={{ fontSize:28,fontWeight:900,color:"#fbbf24",marginBottom:4 }}>{win.toFixed(2)} ETB</div>
        <div style={{ fontSize:12,color:"#64748b",marginBottom:24 }}>Double it or lose it all</div>
        <div style={{ display:"flex",justifyContent:"center",gap:10,marginBottom:24 }}>
          {["♦","♥","♣","♠"].map((s,i) => (
            <div key={i} style={{
              width:44,height:60,
              background: result?(i<2?"#ef4444":"#1e293b"):"#1e293b",
              border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:22, color:i<2?"#ef4444":"#f8fafc",
              boxShadow: result&&((i<2&&result.actual==="red")||(i>=2&&result.actual==="black"))?"0 0 16px rgba(251,191,36,0.5)":"none",
            }}>{result?s:"?"}</div>
          ))}
        </div>
        {result ? (
          <div style={{ padding:"12px 16px",borderRadius:12,marginBottom:20,fontSize:15,fontWeight:700,
            background:result.won?"rgba(52,211,153,0.12)":"rgba(248,113,113,0.12)",
            border:`1px solid ${result.won?"rgba(52,211,153,0.3)":"rgba(248,113,113,0.3)"}`,
            color:result.won?"#34d399":"#f87171",
          }}>{result.won?`Won! +${result.payout.toFixed(2)} ETB`:`Lost! Card was ${result.actual}`}</div>
        ) : (
          <div style={{ display:"flex",gap:12,marginBottom:16 }}>
            <button onClick={()=>onGuess("red")} disabled={loading} style={{ flex:1,padding:"14px 0",borderRadius:12,border:"none",background:"linear-gradient(135deg,#ef4444,#dc2626)",color:"#fff",fontSize:16,fontWeight:800,cursor:loading?"default":"pointer",opacity:loading?0.6:1 }}>🟥 RED</button>
            <button onClick={()=>onGuess("black")} disabled={loading} style={{ flex:1,padding:"14px 0",borderRadius:12,border:"1px solid rgba(255,255,255,0.15)",background:"linear-gradient(135deg,#334155,#1e293b)",color:"#fff",fontSize:16,fontWeight:800,cursor:loading?"default":"pointer",opacity:loading?0.6:1 }}>⬛ BLACK</button>
          </div>
        )}
        <button onClick={onCollect} style={{ width:"100%",padding:"12px 0",borderRadius:12,border:"none",background:"rgba(255,255,255,0.06)",color:"#94a3b8",fontSize:14,fontWeight:700,cursor:"pointer" }}>
          Collect {win.toFixed(2)} ETB
        </button>
      </div>
    </div>
  );
}

export default function SlotsScreen() {
  const [reels, setReels] = useState<SlotSymbol[][]>(INIT);
  const [mul, setMul] = useState(1);
  const [spinning, setSpinning] = useState(false);
  const [betIdx, setBetIdx] = useState(0);
  const [balance, setBalance] = useState<number|null>(null);
  const [wins, setWins] = useState<PaylineWin[]>([]);
  const [totalWin, setTotalWin] = useState<number|null>(null);
  const [error, setError] = useState<string|null>(null);
  const [auto, setAuto] = useState(false);

  const lock = useRef(false);
  const autoRef = useRef(false);
  const betRef = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval>|null>(null);

  const [showGamble, setShowGamble] = useState(false);
  const [gambleId, setGambleId] = useState<string|null>(null);
  const [gambleWin, setGambleWin] = useState(0);
  const [gambleResult, setGambleResult] = useState<{won:boolean,actual:"red"|"black",payout:number}|null>(null);
  const [gambleLoading, setGambleLoading] = useState(false);

  useEffect(() => { betRef.current = betIdx; }, [betIdx]);
  useEffect(() => { getProfile().then(p=>setBalance(p.mainWallet.balance)).catch(()=>{}); }, []);
  useEffect(() => () => { if(timer.current) clearInterval(timer.current); }, []);

  function startScramble() {
    if(timer.current) clearInterval(timer.current);
    timer.current = setInterval(()=>{
      setReels([rndCol(),rndCol(),rndCol()]);
      setMul(Math.ceil(Math.random()*5));
    },80);
  }

  function stopScramble(r: SlotSymbol[][], m: number) {
    if(timer.current){ clearInterval(timer.current); timer.current=null; }
    setReels(r);
    setMul(m);
  }

  const doSpin = useCallback(async(fromAuto=false): Promise<boolean> => {
    if(lock.current) return false;
    lock.current = true;
    setSpinning(true);
    setWins([]);
    setTotalWin(null);
    setError(null);
    startScramble();

    const bet = BETS[betRef.current]!;
    let res: SpinResponse;
    try {
      res = await spinSlots(bet);
    } catch(e:any) {
      stopScramble(INIT,1);
      lock.current=false;
      setSpinning(false);
      setError(e?.message??"Spin failed — check your balance");
      autoRef.current=false;
      setAuto(false);
      return false;
    }

    await new Promise(r=>setTimeout(r,700));
    stopScramble(res.reels, res.multiplierReel);
    lock.current=false;
    setSpinning(false);

    await new Promise(r=>setTimeout(r,120));
    setWins(res.paylineWins);
    setTotalWin(res.totalWin);
    setBalance(res.balance);

    if(res.canGamble && !fromAuto) {
      setGambleId(res.spinId);
      setGambleWin(res.totalWin);
      setGambleResult(null);
      setShowGamble(true);
      return false;
    }
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    autoRef.current=auto;
    if(!auto) return;
    let alive=true;
    async function loop(){
      while(autoRef.current&&alive){
        const ok=await doSpin(true);
        if(!ok||!autoRef.current) break;
        await new Promise(r=>setTimeout(r,400));
      }
      if(alive) setAuto(false);
    }
    void loop();
    return ()=>{ alive=false; autoRef.current=false; };
  },[auto,doSpin]);

  const handleGamble = async(guess:"red"|"black")=>{
    if(!gambleId) return;
    setGambleLoading(true);
    try {
      const r=await gambleSlots(gambleId,guess);
      setGambleResult({won:r.won,actual:r.actual,payout:r.payout});
      setBalance(r.balance);
      setTotalWin(r.won?r.payout:0);
      if(!r.won) setWins([]);
    } catch(e:any){
      setError(e?.message??"Gamble failed");
      setShowGamble(false);
    } finally { setGambleLoading(false); }
  };

  const bet = BETS[betIdx]!;
  const winRowsPerCol = (col:number): number[] => {
    const rows = new Set<number>();
    for(const w of wins){ const l=LINES[w.line-1]; if(l) rows.add(l[col as 0|1|2]); }
    return [...rows];
  };

  return (
    <div style={{ minHeight:"100dvh",background:"linear-gradient(180deg,#071a0e 0%,#0a0e1a 100%)",color:"#f8fafc",display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto",padding:"0 0 80px",userSelect:"none" }}>

      <div style={{ padding:"16px 20px 10px",display:"flex",alignItems:"center",gap:10 }}>
        <div style={{ fontSize:22 }}>🎰</div>
        <div>
          <div style={{ fontSize:18,fontWeight:900,letterSpacing:"-0.5px" }}>Multi Hot 5</div>
          <div style={{ fontSize:11,color:"#4ade80",fontWeight:700 }}>5 LINES · RTP 96%</div>
        </div>
        <div style={{ marginLeft:"auto",textAlign:"right" }}>
          <div style={{ fontSize:11,color:"#64748b",fontWeight:600 }}>BALANCE</div>
          <div style={{ fontSize:18,fontWeight:800,color:"#fbbf24" }}>
            {balance!==null?balance.toFixed(2):"—"} <span style={{ fontSize:11 }}>ETB</span>
          </div>
        </div>
      </div>

      <div style={{ minHeight:44,display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"0 20px 6px" }}>
        {totalWin!==null&&totalWin>0&&!spinning&&(
          <div style={{ fontSize:22,fontWeight:900,color:"#fbbf24",filter:"drop-shadow(0 0 12px rgba(251,191,36,0.6))",animation:"winPop 0.35s ease" }}>
            +{totalWin.toFixed(2)} ETB
          </div>
        )}
        {wins.length>0&&!spinning&&(
          <div style={{ display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center" }}>
            {wins.map(w=>(
              <div key={w.line} style={{ padding:"3px 10px",borderRadius:20,background:"rgba(251,191,36,0.15)",border:"1px solid rgba(251,191,36,0.4)",fontSize:12,fontWeight:700,color:"#fbbf24" }}>
                Line {w.line} · +{w.payout.toFixed(2)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding:"0 16px",marginBottom:12 }}>
        <div style={{ background:"rgba(0,0,0,0.45)",border:"2px solid rgba(74,222,128,0.2)",borderRadius:20,padding:12 }}>
          <div style={{ display:"flex",gap:8 }}>
            <MulCol value={mul} spinning={spinning}/>
            <div style={{ width:1,background:"rgba(255,255,255,0.06)" }}/>
            <ReelGrid reels={reels} spinning={spinning} wins={spinning?[]:wins}/>
          </div>
          <div style={{ display:"flex",justifyContent:"center",gap:6,marginTop:10 }}>
            {[1,2,3,4,5].map(n=>{
              const active=wins.some(w=>w.line===n);
              return <div key={n} style={{ width:22,height:22,borderRadius:6,background:active?"rgba(251,191,36,0.25)":"rgba(255,255,255,0.04)",border:active?"1px solid rgba(251,191,36,0.6)":"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:active?"#fbbf24":"#334155" }}>{n}</div>;
            })}
          </div>
        </div>
      </div>

      {error&&<div style={{ margin:"0 16px 10px",padding:"10px 14px",background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:10,fontSize:13,color:"#f87171",fontWeight:600 }}>{error}</div>}

      <div style={{ padding:"0 16px" }}>
        <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:20,padding:16 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11,color:"#64748b",fontWeight:700,marginBottom:6 }}>BET</div>
              <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                <button onClick={()=>setBetIdx(i=>Math.max(0,i-1))} disabled={spinning||betIdx===0} style={cBtn(spinning||betIdx===0)}>−</button>
                <div style={{ flex:1,textAlign:"center",fontSize:22,fontWeight:900,color:"#fbbf24" }}>
                  {bet}<span style={{ fontSize:12,fontWeight:600,color:"#64748b",marginLeft:4 }}>ETB</span>
                </div>
                <button onClick={()=>setBetIdx(i=>Math.min(BETS.length-1,i+1))} disabled={spinning||betIdx===BETS.length-1} style={cBtn(spinning||betIdx===BETS.length-1)}>+</button>
              </div>
            </div>
            <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:3 }}>
              <div style={{ fontSize:10,color:"#64748b",fontWeight:700 }}>AUTO</div>
              <button onClick={()=>setAuto(a=>!a)} style={{ width:44,height:44,borderRadius:12,border:"none",background:auto?"rgba(74,222,128,0.2)":"rgba(255,255,255,0.05)",color:auto?"#4ade80":"#475569",fontSize:18,cursor:"pointer",boxShadow:auto?"0 0 12px rgba(74,222,128,0.3)":"none" }}>🔄</button>
            </div>
          </div>
          <button
            onClick={()=>{ if(!lock.current&&!auto) void doSpin(false); }}
            disabled={spinning||auto}
            style={{ width:"100%",height:58,borderRadius:16,border:"none",background:spinning||auto?"rgba(255,255,255,0.06)":"linear-gradient(135deg,#16a34a,#4ade80)",color:spinning||auto?"#475569":"#fff",fontSize:18,fontWeight:900,cursor:spinning||auto?"default":"pointer",boxShadow:spinning||auto?"none":"0 8px 24px rgba(74,222,128,0.3)",transition:"all 0.2s" }}
          >{spinning?"🎰  Spinning...":auto?"🔄  Auto":"▶  SPIN"}</button>
        </div>
      </div>

      <div style={{ padding:"14px 16px 0" }}>
        <div style={{ fontSize:11,color:"#475569",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8 }}>Payouts · 3 of a kind</div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6 }}>
          {(["seven","double_dollar","bell","lemon","orange","watermelon"] as SlotSymbol[]).map(sym=>{
            const p=((bet*PAYOUTS[sym])/333).toFixed(2);
            return <div key={sym} style={{ display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:10 }}>
              <span style={{ fontSize:16 }}>{EMOJI[sym]}{EMOJI[sym]}{EMOJI[sym]}</span>
              <span style={{ fontSize:13,fontWeight:700,color:COLOR[sym] }}>{p}</span>
            </div>;
          })}
        </div>
      </div>

      {showGamble&&<GambleModal win={gambleWin} onGuess={handleGamble} onCollect={()=>{ setShowGamble(false);setGambleId(null);setGambleResult(null); }} result={gambleResult} loading={gambleLoading}/>}

      <style>{`@keyframes winPop{0%{transform:scale(0.7);opacity:0}60%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

function cBtn(disabled:boolean): React.CSSProperties {
  return { width:36,height:36,borderRadius:10,border:"1px solid rgba(255,255,255,0.08)",background:"#1e293b",color:disabled?"#334155":"#f8fafc",fontSize:20,fontWeight:700,cursor:disabled?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:disabled?0.4:1,flexShrink:0 };
}
