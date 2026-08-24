import { useState, useRef, useCallback, useEffect } from "react";
import { spinSlots, gambleSlots, getProfile } from "../lib/api";
import type { SlotSymbol, PaylineWin, SpinResponse } from "../lib/api";

const EMOJI: Record<SlotSymbol, string> = {
  cherry: "🍒", watermelon: "🍉", orange: "🍊", lemon: "🍋",
  bell: "🔔", double_dollar: "💵", seven: "7️⃣",
};
const GLOW: Record<SlotSymbol, string> = {
  cherry: "#ef4444", watermelon: "#22c55e", orange: "#f97316",
  lemon: "#eab308", bell: "#f59e0b", double_dollar: "#84cc16", seven: "#ec4899",
};
const BETS = [5, 8, 10, 20, 50, 100, 200, 500];
const SYMS: SlotSymbol[] = ["cherry","watermelon","orange","lemon","bell","double_dollar","seven"];
const PAYOUTS: Record<SlotSymbol, number> = {
  cherry:44, watermelon:44, orange:88, lemon:88, bell:111, double_dollar:222, seven:333,
};
const LINES: [number,number,number][] = [[1,1,1],[0,0,0],[2,2,2],[0,1,2],[2,1,0]];
const INIT: SlotSymbol[][] = [
  ["bell","cherry","lemon"],
  ["seven","orange","watermelon"],
  ["lemon","bell","cherry"],
];

function rnd() { return SYMS[Math.floor(Math.random()*SYMS.length)]!; }
function rndCol(): SlotSymbol[] { return [rnd(),rnd(),rnd()]; }

function winCells(wins: PaylineWin[]): Set<string> {
  const s = new Set<string>();
  for (const w of wins) {
    const l = LINES[w.line-1];
    if (l) { s.add(`0-${l[0]}`); s.add(`1-${l[1]}`); s.add(`2-${l[2]}`); }
  }
  return s;
}

// Rolling slot animation per column
function ReelCol({ symbols, spinning, winSet, colIdx }: {
  symbols: SlotSymbol[], spinning: boolean, winSet: Set<string>, colIdx: number
}) {
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", gap:3 }}>
      {symbols.map((sym, row) => {
        const key = `${colIdx}-${row}`;
        const win = !spinning && winSet.has(key);
        return (
          <div key={row} style={{
            height: 76,
            display:"flex", alignItems:"center", justifyContent:"center",
            borderRadius: 14,
            background: win
              ? `linear-gradient(135deg, ${GLOW[sym]}22, ${GLOW[sym]}11)`
              : "rgba(255,255,255,0.03)",
            border: win
              ? `1.5px solid ${GLOW[sym]}66`
              : "1.5px solid rgba(255,255,255,0.07)",
            boxShadow: win ? `0 0 20px ${GLOW[sym]}33, inset 0 1px 0 rgba(255,255,255,0.08)` : "inset 0 1px 0 rgba(255,255,255,0.04)",
            transition: "all 0.3s cubic-bezier(0.22,1,0.36,1)",
            position: "relative",
            overflow: "hidden",
          }}>
            {win && (
              <div style={{
                position:"absolute", inset:0,
                background: `radial-gradient(circle at center, ${GLOW[sym]}22 0%, transparent 70%)`,
                animation: "pulse 1s ease-in-out infinite",
              }}/>
            )}
            <span style={{
              fontSize: 36,
              filter: win ? `drop-shadow(0 0 8px ${GLOW[sym]})` : "none",
              transition: "filter 0.3s",
              position: "relative",
            }}>{EMOJI[sym]}</span>
          </div>
        );
      })}
    </div>
  );
}

function MulBadge({ value, spinning }: { value: number, spinning: boolean }) {
  const colors = ["","#64748b","#f59e0b","#f97316","#ef4444","#a855f7"];
  const c = colors[value] ?? "#64748b";
  const labels = ["","1×","2×","3×","4×","5×"];
  return (
    <div style={{
      width: 44,
      display:"flex", flexDirection:"column", gap:3,
    }}>
      {[-1, 0, 1].map((offset) => {
        const v = value + offset;
        const isMid = offset === 0;
        const color = isMid ? c : "#334155";
        return (
          <div key={offset} style={{
            height: 76,
            display:"flex", alignItems:"center", justifyContent:"center",
            borderRadius: 14,
            background: isMid ? `${c}18` : "rgba(255,255,255,0.02)",
            border: isMid ? `1.5px solid ${c}55` : "1px solid rgba(255,255,255,0.04)",
            transition: spinning ? "none" : "all 0.3s",
            boxShadow: isMid ? `0 0 16px ${c}22` : "none",
          }}>
            <span style={{
              fontSize: isMid ? 16 : 11,
              fontWeight: 900,
              color: isMid ? c : "#1e293b",
              letterSpacing: "-0.5px",
            }}>{v >= 1 && v <= 5 ? labels[v] : ""}</span>
          </div>
        );
      })}
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
    <div style={{
      position:"fixed",inset:0,
      background:"rgba(2,6,23,0.92)",
      backdropFilter:"blur(12px)",
      display:"flex",alignItems:"center",justifyContent:"center",
      zIndex:300,padding:24,
    }}>
      <div style={{
        background:"linear-gradient(145deg,#0f1829,#0a0e1a)",
        border:"1px solid rgba(255,255,255,0.08)",
        borderRadius:28,padding:32,
        width:"100%",maxWidth:340,
        boxShadow:"0 40px 80px rgba(0,0,0,0.6)",
      }}>
        <div style={{ textAlign:"center",marginBottom:24 }}>
          <div style={{ fontSize:12,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8 }}>Double or Nothing</div>
          <div style={{ fontSize:36,fontWeight:900,color:"#f59e0b",letterSpacing:"-1px" }}>{win.toFixed(2)}</div>
          <div style={{ fontSize:13,color:"#64748b",marginTop:2 }}>ETB to gamble</div>
        </div>

        <div style={{ display:"flex",justifyContent:"center",gap:8,marginBottom:28 }}>
          {["♦","♥","♣","♠"].map((s,i) => (
            <div key={i} style={{
              width:52,height:72,
              background: result?(i<2?"linear-gradient(135deg,#ef4444,#dc2626)":"linear-gradient(135deg,#1e293b,#0f172a)"):"linear-gradient(135deg,#1e293b,#0f172a)",
              border:`1px solid ${result?(i<2?"rgba(239,68,68,0.4)":"rgba(255,255,255,0.08)"):"rgba(255,255,255,0.08)"}`,
              borderRadius:12,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:26,
              color: i<2?"#fca5a5":"#94a3b8",
              boxShadow: result&&((i<2&&result.actual==="red")||(i>=2&&result.actual==="black"))
                ? "0 0 24px rgba(245,158,11,0.5)" : "none",
              transition:"all 0.3s",
            }}>{result?s:"?"}</div>
          ))}
        </div>

        {result ? (
          <>
            <div style={{
              padding:"14px 20px",borderRadius:16,marginBottom:20,
              background: result.won?"rgba(34,197,94,0.1)":"rgba(239,68,68,0.1)",
              border:`1px solid ${result.won?"rgba(34,197,94,0.25)":"rgba(239,68,68,0.25)"}`,
              textAlign:"center",fontSize:16,fontWeight:800,
              color: result.won?"#4ade80":"#f87171",
            }}>
              {result.won?`🎉 Won! +${result.payout.toFixed(2)} ETB`:`💥 Lost! It was ${result.actual}`}
            </div>
            <button onClick={onCollect} style={{
              width:"100%",padding:"14px",borderRadius:14,border:"none",
              background:"linear-gradient(135deg,#f59e0b,#f97316)",
              color:"#000",fontSize:15,fontWeight:800,cursor:"pointer",
            }}>Collect & Continue</button>
          </>
        ) : (
          <>
            <div style={{ display:"flex",gap:10,marginBottom:12 }}>
              <button onClick={()=>onGuess("red")} disabled={loading} style={{
                flex:1,padding:"16px 0",borderRadius:14,border:"none",
                background:"linear-gradient(135deg,#ef4444,#dc2626)",
                color:"#fff",fontSize:15,fontWeight:800,
                cursor:loading?"default":"pointer",opacity:loading?0.6:1,
                boxShadow:"0 4px 16px rgba(239,68,68,0.3)",
              }}>🔴 RED</button>
              <button onClick={()=>onGuess("black")} disabled={loading} style={{
                flex:1,padding:"16px 0",borderRadius:14,
                border:"1px solid rgba(255,255,255,0.12)",
                background:"linear-gradient(135deg,#374151,#1f2937)",
                color:"#fff",fontSize:15,fontWeight:800,
                cursor:loading?"default":"pointer",opacity:loading?0.6:1,
                boxShadow:"0 4px 16px rgba(0,0,0,0.3)",
              }}>⚫ BLACK</button>
            </div>
            <button onClick={onCollect} style={{
              width:"100%",padding:"12px",borderRadius:14,border:"1px solid rgba(255,255,255,0.07)",
              background:"transparent",color:"#64748b",fontSize:13,fontWeight:600,cursor:"pointer",
            }}>Take {win.toFixed(2)} ETB &amp; skip</button>
          </>
        )}
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
  const [spinCount, setSpinCount] = useState(0);

  const lock = useRef(false);
  const autoRef = useRef(false);
  const betRef = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval>|null>(null);

  const [showGamble, setShowGamble] = useState(false);
  const [gambleId, setGambleId] = useState<string|null>(null);
  const [gambleWin, setGambleWin] = useState(0);
  const [gambleResult, setGambleResult] = useState<{won:boolean,actual:"red"|"black",payout:number}|null>(null);
  const [gambleLoading, setGambleLoading] = useState(false);

  useEffect(()=>{ betRef.current=betIdx; },[betIdx]);
  useEffect(()=>{ getProfile().then(p=>setBalance(p.mainWallet.balance)).catch(()=>{}); },[]);
  useEffect(()=>()=>{ if(timer.current) clearInterval(timer.current); },[]);

  function startScramble() {
    if(timer.current) clearInterval(timer.current);
    timer.current = setInterval(()=>{
      setReels([rndCol(),rndCol(),rndCol()]);
      setMul(Math.ceil(Math.random()*5));
    },90);
  }

  function stopScramble(r: SlotSymbol[][], m: number) {
    if(timer.current){ clearInterval(timer.current); timer.current=null; }
    setReels(r); setMul(m);
  }

  const doSpin = useCallback(async(fromAuto=false): Promise<boolean>=>{
    if(lock.current) return false;
    lock.current=true;
    setSpinning(true); setWins([]); setTotalWin(null); setError(null);
    startScramble();

    const bet = BETS[betRef.current]!;
    let res: SpinResponse;
    try {
      res = await spinSlots(bet);
    } catch(e:any) {
      stopScramble(INIT,1);
      lock.current=false; setSpinning(false);
      setError(e?.message??"Spin failed — check your balance");
      autoRef.current=false; setAuto(false);
      return false;
    }

    await new Promise(r=>setTimeout(r,650));
    stopScramble(res.reels, res.multiplierReel);
    lock.current=false; setSpinning(false);
    setSpinCount(c=>c+1);

    await new Promise(r=>setTimeout(r,100));
    setWins(res.paylineWins);
    setTotalWin(res.totalWin);
    setBalance(res.balance);

    if(res.canGamble&&!fromAuto){
      setGambleId(res.spinId); setGambleWin(res.totalWin);
      setGambleResult(null); setShowGamble(true);
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
        await new Promise(r=>setTimeout(r,350));
      }
      if(alive) setAuto(false);
    }
    void loop();
    return ()=>{ alive=false; autoRef.current=false; };
  },[auto,doSpin]);

  const handleGamble=async(guess:"red"|"black")=>{
    if(!gambleId) return;
    setGambleLoading(true);
    try {
      const r=await gambleSlots(gambleId,guess);
      setGambleResult({won:r.won,actual:r.actual,payout:r.payout});
      setBalance(r.balance); setTotalWin(r.won?r.payout:0);
      if(!r.won) setWins([]);
    } catch(e:any){ setError(e?.message??"Gamble failed"); setShowGamble(false); }
    finally { setGambleLoading(false); }
  };

  const bet = BETS[betIdx]!;
  const ws = winCells(spinning?[]:wins);

  return (
    <div className="slots-screen" style={{
      minHeight:"100dvh",
      background:"radial-gradient(circle at 50% -10%, rgba(245,158,11,0.12), transparent 34%), linear-gradient(180deg,#07111d 0%,#050912 55%,#03060b 100%)",
      color:"#f8fafc",
      display:"flex", flexDirection:"column",
      maxWidth:480, margin:"0 auto",
      padding:"0 0 88px",
    }}>

      {/* Header */}
      <div style={{
        padding:"22px 20px 18px",
        display:"flex", alignItems:"center", gap:12,
        borderBottom:"1px solid rgba(255,255,255,0.07)",
        background:"rgba(3,7,14,0.42)",
        boxShadow:"0 12px 28px rgba(0,0,0,0.14)",
      }}>
        <div style={{
          width:46,height:46,borderRadius:15,
          background:"linear-gradient(145deg,#ffd166 0%,#f59e0b 48%,#c2410c 100%)",
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:23,boxShadow:"0 8px 24px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.45)",
        }}>🎰</div>
        <div>
          <div style={{ fontSize:19,fontWeight:900,letterSpacing:"-0.7px" }}>Multi Hot 5</div>
          <div style={{ fontSize:10,color:"#7c8da3",fontWeight:700,letterSpacing:"0.13em",marginTop:3 }}>
            5 LINES <span style={{ color:"#d89b2b" }}>·</span> 96% RTP
          </div>
        </div>
        <div style={{ marginLeft:"auto",textAlign:"right" }}>
          <div style={{ fontSize:9,color:"#7c8da3",fontWeight:800,textTransform:"uppercase",letterSpacing:"0.13em" }}>Available</div>
          <div style={{ fontSize:21,fontWeight:900,color:"#fff7e6",letterSpacing:"-0.6px",marginTop:3 }}>
            {balance!==null?balance.toFixed(2):"—"}
            <span style={{ fontSize:10,color:"#d89b2b",fontWeight:800,marginLeft:4 }}>ETB</span>
          </div>
        </div>
      </div>

      {/* Win banner */}
      <div style={{ minHeight:60,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:7,padding:"12px 20px" }}>
        {totalWin!==null&&totalWin>0&&!spinning&&(
          <div style={{ display:"flex",alignItems:"center",gap:10,animation:"winPop 0.4s cubic-bezier(0.22,1,0.36,1)" }}>
            <div style={{ fontSize:10,color:"#d89b2b",fontWeight:800,textTransform:"uppercase",letterSpacing:"0.16em" }}>WIN</div>
            <div style={{ fontSize:30,fontWeight:900,color:"#ffd166",letterSpacing:"-1px",filter:"drop-shadow(0 0 16px rgba(245,158,11,0.7))" }}>
              +{totalWin.toFixed(2)}
            </div>
            <div style={{ fontSize:11,color:"#64748b",fontWeight:700 }}>ETB</div>
          </div>
        )}
        {wins.length>0&&!spinning&&(
          <div style={{ display:"flex",gap:5,flexWrap:"wrap",justifyContent:"center" }}>
            {wins.map(w=>(
              <div key={w.line} style={{
                padding:"2px 10px",borderRadius:20,
                background:"rgba(245,158,11,0.12)",
                border:"1px solid rgba(245,158,11,0.3)",
                fontSize:11,fontWeight:700,color:"#fbbf24",
              }}>L{w.line} +{w.payout.toFixed(2)}</div>
            ))}
          </div>
        )}
        {(!totalWin||totalWin===0)&&!spinning&&wins.length===0&&spinCount>0&&(
          <div style={{ fontSize:13,color:"#334155",fontWeight:600 }}>No win this round</div>
        )}
      </div>

      {/* Slot machine */}
      <div style={{ padding:"0 16px",marginBottom:16 }}>
        <div style={{
          background:"linear-gradient(145deg,#172331 0%,#0d1723 42%,#09111b 100%)",
          border:"1px solid rgba(245,158,11,0.22)",
          borderRadius:22,
          padding:12,
          boxShadow:"0 24px 56px rgba(0,0,0,0.52), 0 0 0 5px rgba(245,158,11,0.035), inset 0 1px 0 rgba(255,255,255,0.1)",
          position:"relative",
          overflow:"hidden",
        }}>
          {/* Top light strip */}
          <div style={{
            position:"absolute",top:0,left:"20%",right:"20%",height:2,
            background:"linear-gradient(90deg,transparent,rgba(255,209,102,0.9),transparent)",
            borderRadius:2,
          }}/>

          <div style={{ display:"flex",gap:7,alignItems:"stretch" }}>
            <MulBadge value={mul} spinning={spinning}/>
            <div style={{ width:1,background:"rgba(255,255,255,0.05)",margin:"0 2px" }}/>
            {reels.map((col,ci)=>(
              <ReelCol key={ci} symbols={col} spinning={spinning} winSet={ws} colIdx={ci}/>
            ))}
          </div>

          {/* Payline dots */}
          <div style={{ display:"flex",justifyContent:"center",gap:8,marginTop:13 }}>
            {[1,2,3,4,5].map(n=>{
              const active=wins.some(w=>w.line===n);
              return (
                <div key={n} style={{
                  width:24,height:24,borderRadius:8,
                  background:active?"rgba(245,158,11,0.2)":"rgba(255,255,255,0.03)",
                  border:active?"1px solid rgba(245,158,11,0.5)":"1px solid rgba(255,255,255,0.06)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:10,fontWeight:800,
                  color:active?"#f59e0b":"#1e293b",
                  boxShadow:active?"0 0 8px rgba(245,158,11,0.3)":"none",
                  transition:"all 0.3s",
                }}>{n}</div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error */}
      {error&&(
        <div style={{ margin:"0 16px 12px",padding:"12px 16px",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:14,fontSize:13,color:"#f87171",fontWeight:600,display:"flex",alignItems:"center",gap:8 }}>
          <span>⚠️</span>{error}
        </div>
      )}

      {/* Controls */}
      <div style={{ padding:"0 16px" }}>
        <div style={{
          background:"linear-gradient(145deg,rgba(18,31,45,0.96),rgba(8,15,24,0.96))",
          border:"1px solid rgba(148,163,184,0.14)",
          borderRadius:20,padding:18,
          boxShadow:"0 16px 34px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.07)",
        }}>
          {/* Bet + Auto row */}
          <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:16 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10,color:"#475569",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8 }}>Bet per spin</div>
              <div style={{ display:"flex",alignItems:"center",gap:0,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,overflow:"hidden" }}>
                <button onClick={()=>setBetIdx(i=>Math.max(0,i-1))} disabled={spinning||betIdx===0}
                  style={{ width:44,height:48,background:"none",border:"none",color:spinning||betIdx===0?"#1e293b":"#94a3b8",fontSize:22,cursor:spinning||betIdx===0?"default":"pointer",fontWeight:700,flexShrink:0 }}>−</button>
                <div style={{ flex:1,textAlign:"center",fontSize:20,fontWeight:900,color:"#f8fafc",letterSpacing:"-0.5px" }}>
                  {bet}<span style={{ fontSize:11,color:"#475569",marginLeft:3,fontWeight:600 }}>ETB</span>
                </div>
                <button onClick={()=>setBetIdx(i=>Math.min(BETS.length-1,i+1))} disabled={spinning||betIdx===BETS.length-1}
                  style={{ width:44,height:48,background:"none",border:"none",color:spinning||betIdx===BETS.length-1?"#1e293b":"#94a3b8",fontSize:22,cursor:spinning||betIdx===BETS.length-1?"default":"pointer",fontWeight:700,flexShrink:0 }}>+</button>
              </div>
            </div>

            <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:6 }}>
              <div style={{ fontSize:10,color:"#475569",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em" }}>Auto</div>
              <button onClick={()=>setAuto(a=>!a)} style={{
                width:48,height:48,borderRadius:14,border:"none",
                background:auto?"linear-gradient(135deg,#22c55e,#16a34a)":"rgba(255,255,255,0.04)",
                color:auto?"#fff":"#334155",
                fontSize:20,cursor:"pointer",
                boxShadow:auto?"0 4px 16px rgba(34,197,94,0.35)":"none",
                transition:"all 0.2s",
              }}>⟳</button>
            </div>
          </div>

          {/* Spin button */}
          <button
            onClick={()=>{ if(!lock.current&&!auto) void doSpin(false); }}
            disabled={spinning||auto}
            style={{
              width:"100%",height:60,borderRadius:18,border:"none",
              background: spinning||auto
                ? "rgba(255,255,255,0.04)"
                : "linear-gradient(135deg,#ffd166 0%,#f59e0b 52%,#ea580c 100%)",
              color: spinning||auto?"#334155":"#000",
              fontSize:17,fontWeight:900,letterSpacing:"0.04em",
              cursor:spinning||auto?"default":"pointer",
              boxShadow: spinning||auto?"none":"0 10px 30px rgba(245,158,11,0.34), inset 0 1px 0 rgba(255,255,255,0.45)",
              transition:"all 0.2s",
              position:"relative",overflow:"hidden",
            }}
          >
            {spinning?(
              <span style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
                <span style={{ display:"inline-block",animation:"spin 0.8s linear infinite" }}>⟳</span>
                Spinning...
              </span>
            ):auto?"Auto Spin Active":"▶  SPIN"}
          </button>
        </div>
      </div>

      {/* Paytable */}
      <div style={{ padding:"16px 16px 0" }}>
        <div style={{ fontSize:10,color:"#334155",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:10 }}>
          Paytable at {bet} ETB
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6 }}>
          {(["seven","double_dollar","bell","lemon","orange","watermelon","cherry"] as SlotSymbol[]).slice(0,6).map(sym=>{
            const p=((bet*PAYOUTS[sym])/333).toFixed(2);
            return (
              <div key={sym} style={{
                padding:"8px 10px",
                background:"rgba(255,255,255,0.02)",
                border:"1px solid rgba(255,255,255,0.04)",
                borderRadius:12,
                display:"flex",flexDirection:"column",alignItems:"center",gap:3,
              }}>
                <span style={{ fontSize:20 }}>{EMOJI[sym]}{EMOJI[sym]}{EMOJI[sym]}</span>
                <span style={{ fontSize:12,fontWeight:800,color:GLOW[sym] }}>{p}</span>
              </div>
            );
          })}
        </div>
      </div>

      {showGamble&&(
        <GambleModal
          win={gambleWin}
          onGuess={handleGamble}
          onCollect={()=>{ setShowGamble(false);setGambleId(null);setGambleResult(null); }}
          result={gambleResult}
          loading={gambleLoading}
        />
      )}

      <style>{`
        @keyframes winPop {
          0%   { transform: scale(0.5); opacity:0; }
          60%  { transform: scale(1.08); }
          100% { transform: scale(1); opacity:1; }
        }
        @keyframes pulse {
          0%,100% { opacity:0.6; }
          50%      { opacity:1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
