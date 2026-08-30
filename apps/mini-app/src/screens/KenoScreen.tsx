import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../lib/socket";
import { getKenoState, placeKenoBet, getKenoHistory, checkKenoAccess, getProfile } from "../lib/api";
import type { KenoState } from "../lib/api";

const MIN_BET = 5;
const MAX_BET = 5000;
const MAX_PICKS = 10;
const TOTAL_NUMBERS = 80;
const TOTAL_DRAWN = 20;

const PAYOUT_TABLE: Record<number, Record<number, number>> = {
  1:{1:3.5}, 2:{2:9}, 3:{2:2,3:25}, 4:{2:1.5,3:6,4:75},
  5:{2:1,3:3,4:15,5:120}, 6:{2:1,3:2,4:5,5:30,6:300},
  7:{3:1.5,4:3,5:10,6:75,7:700}, 8:{3:1,4:2,5:6,6:25,7:150,8:1500},
  9:{3:1,4:1.5,5:4,6:12,7:50,8:300,9:3000},
  10:{3:1,4:1.2,5:3,6:8,7:25,8:100,9:500,10:5000},
};

function getMultiplier(p: number, m: number): number { return PAYOUT_TABLE[p]?.[m] ?? 0; }
function calcPossibleWin(bet: number, p: number): number {
  if (p < 1) return 0;
  const best = Math.max(...Object.values(PAYOUT_TABLE[p] ?? {}));
  return Math.round(bet * best * 100) / 100;
}

function Countdown({ endsAt }: { endsAt: number }) {
  const [d, setD] = useState("00 : 00");
  useEffect(() => {
    const tick = () => {
      const rem = Math.max(0, endsAt - Date.now());
      const s = Math.ceil(rem / 1000);
      setD(String(Math.floor(s / 60)).padStart(2, "0") + " : " + String(s % 60).padStart(2, "0"));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return <span>{d}</span>;
}

function PossibleWinCard({ betAmount, pickedNumbers }: { betAmount: number; pickedNumbers: number[] }) {
  const p = pickedNumbers.length;
  if (p === 0) return null;
  const possible = calcPossibleWin(betAmount, p);
  const rows: { match: number; mul: number }[] = [];
  for (let m = 1; m <= p; m++) { const mul = getMultiplier(p, m); if (mul > 0) rows.push({ match: m, mul }); }
  const show = rows.slice(-3);
  return (
    <div style={{ margin:"0 10px 8px", background:"rgba(20,30,24,0.95)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:"10px 12px", position:"relative" }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
        <span style={{ fontSize:15, color:"#c8ddd2", fontWeight:700 }}>Possible win</span>
        <span style={{ fontSize:17, color:"#4ade80", fontWeight:900 }}>{possible.toFixed(0)}</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"50px 1fr", gap:"2px 0", marginBottom:8 }}>
        <span style={{ fontSize:11, color:"#6a8a78" }}>Match</span>
        <span style={{ fontSize:11, color:"#8ab89a" }}>{show.map(r => r.match).join("        ")}</span>
        <span style={{ fontSize:11, color:"#6a8a78" }}>Pays</span>
        <span style={{ fontSize:11, color:"#c8e6d4" }}>{show.map(r => "x"+r.mul).join("      ")}</span>
      </div>
      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
        {pickedNumbers.map(n => (
          <div key={n} style={{ minWidth:30, height:26, borderRadius:5, padding:"0 6px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, color:"#e2e8f0" }}>{n}</div>
        ))}
      </div>
      <div style={{ position:"absolute", top:10, right:12, width:22, height:22, borderRadius:"50%", border:"1px solid rgba(255,255,255,0.22)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#8ab89a", fontWeight:700 }}>?</div>
    </div>
  );
}

// Small colored dot shown on some grid cells (decorative, like in screenshot)
const DOT_CELLS: Record<number, string> = {
  3:"#ef4444", 6:"#ef4444", 10:"rgba(100,180,255,0.8)", 18:"#ef4444",
  27:"rgba(100,180,255,0.8)", 36:"rgba(100,180,255,0.8)", 41:"rgba(100,180,255,0.8)", 50:"#ef4444",
  71:"rgba(100,180,255,0.8)", 78:"#ef4444",
};

function NumberGrid({ picked, drawn, phase, onToggle }: { picked: Set<number>; drawn: Set<number>; phase: KenoState["phase"]; onToggle: (n: number) => void }) {
  const canPick = phase === "betting";
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(10, 1fr)", gap:3, padding:"6px 8px" }}>
      {Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1).map(n => {
        const isPicked = picked.has(n), isDrawn = drawn.has(n);
        const isHit = isPicked && isDrawn;
        const isMiss = isPicked && !isDrawn && (phase === "drawing" || phase === "finished");
        let bg = "rgba(255,255,255,0.055)", border = "rgba(255,255,255,0.09)", color = "#9ab8a8", shadow = "none";
        if (isHit) { bg="#1a5c30"; border="#22c55e"; color="#4ade80"; shadow="0 0 8px rgba(34,197,94,0.45)"; }
        else if (isMiss) { bg="rgba(255,255,255,0.03)"; border="rgba(255,255,255,0.05)"; color="#3a5a48"; }
        else if (isDrawn) { bg="rgba(59,130,246,0.15)"; border="rgba(59,130,246,0.35)"; color="#93c5fd"; }
        else if (isPicked) { bg="#1a5c30"; border="#22c55e"; color="#e2e8f0"; shadow="0 0 6px rgba(34,197,94,0.3)"; }
        const dot = DOT_CELLS[n];
        return (
          <button key={n} onClick={() => canPick && onToggle(n)} disabled={!canPick}
            style={{ position:"relative", height:34, borderRadius:5, background:bg, border:`1px solid ${border}`, color, fontSize:12, fontWeight:700, cursor:canPick?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.12s", boxShadow:shadow, outline:"none", padding:0, fontFamily:"inherit", WebkitTapHighlightColor:"transparent", userSelect:"none" }}>
            {n}
            {dot && !isPicked && !isDrawn && (
              <span style={{ position:"absolute", top:3, right:3, width:5, height:5, borderRadius:"50%", background:dot, boxShadow:`0 0 3px ${dot}` }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

function BetControls({ amount, onChange }: { amount: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:0, padding:"6px 8px" }}>
      <button onClick={() => onChange(Math.max(MIN_BET, amount - 1))} style={{ width:38, height:40, borderRadius:"8px 0 0 8px", background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRight:"none", color:"#fff", fontSize:22, fontWeight:300, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>−</button>
      <div style={{ flex:1, height:40, background:"rgba(0,0,0,0.3)", border:"1px solid rgba(255,255,255,0.12)", borderLeft:"none", borderRight:"none", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, fontWeight:800, color:"#fff", letterSpacing:"-0.3px" }}>{amount.toFixed(2)}</div>
      <button onClick={() => onChange(Math.min(MAX_BET, amount + 1))} style={{ width:38, height:40, borderRadius:"0 8px 8px 0", background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderLeft:"none", color:"#fff", fontSize:22, fontWeight:300, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>+</button>
      <button onClick={() => onChange(Math.min(MAX_BET, amount * 2))} style={{ marginLeft:6, padding:"0 12px", height:40, borderRadius:8, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", color:"#8ab89a", fontSize:12, fontWeight:800, cursor:"pointer", flexShrink:0 }}>X2</button>
      <button onClick={() => onChange(MAX_BET)} style={{ marginLeft:4, padding:"0 12px", height:40, borderRadius:8, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", color:"#8ab89a", fontSize:12, fontWeight:800, cursor:"pointer", flexShrink:0 }}>MAX</button>
      {/* Gear icon */}
      <button style={{ marginLeft:4, width:40, height:40, borderRadius:8, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", color:"#8ab89a", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  );
}

type HistEntry = { id: string; drawnNumbers: number[]; finishedAt: string; myBet: { pickedNumbers: number[]; betAmount: number; matched: number | null; payout: number | null } | null };
function HistoryTab() {
  const [items, setItems] = useState<HistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (getKenoHistory() as Promise<any[]>)
      .then(d => setItems(d.map(r => ({ ...r, myBet: r.myBet ?? r.myBets?.[0] ?? null }))))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <div style={{ textAlign:"center", padding:40, color:"#475569" }}>Loading...</div>;
  if (!items.length) return <div style={{ textAlign:"center", padding:40, color:"#475569" }}>No history yet</div>;
  return (
    <div style={{ display:"flex", flexDirection:"column" }}>
      {items.map(item => {
        const won = (item.myBet?.payout ?? 0) > 0;
        const ps = new Set(item.myBet?.pickedNumbers ?? []);
        return (
          <div key={item.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.05)", padding:"10px 14px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontSize:11, color:"#475569" }}>{new Date(item.finishedAt).toLocaleString()}</span>
              {item.myBet && <span style={{ fontSize:12, fontWeight:800, color:won?"#4ade80":"#ef4444" }}>{won?`+${item.myBet.payout?.toFixed(2)} ETB`:`-${item.myBet.betAmount} ETB`}</span>}
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
              {item.drawnNumbers.map(n => <span key={n} style={{ width:24, height:24, borderRadius:"50%", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, background:ps.has(n)?"#1a4a2a":"rgba(255,255,255,0.06)", color:ps.has(n)?"#4ade80":"#64748b", border:`1px solid ${ps.has(n)?"#22c55e":"rgba(255,255,255,0.08)"}` }}>{n}</span>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResultsTab({ myBet, drawnNumbers }: { myBet: KenoState["myBet"]; drawnNumbers: number[] }) {
  if (!myBet) return <div style={{ textAlign:"center", padding:40, color:"#475569" }}>No active bet</div>;
  const ds = new Set(drawnNumbers);
  const matched = myBet.pickedNumbers.filter(n => ds.has(n)).length;
  const won = (myBet.payout ?? 0) > 0;
  return (
    <div style={{ padding:"16px 14px" }}>
      <div style={{ textAlign:"center", marginBottom:16 }}>
        <div style={{ fontSize:32, marginBottom:6 }}>{won ? "🎉" : "😔"}</div>
        <div style={{ fontSize:24, fontWeight:900, color:won?"#4ade80":"#ef4444" }}>{won ? `+${myBet.payout?.toFixed(2)} ETB` : "No Win"}</div>
        <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>{matched}/{myBet.pickedNumbers.length} matched</div>
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6, justifyContent:"center" }}>
        {myBet.pickedNumbers.map(n => <span key={n} style={{ width:36, height:36, borderRadius:"50%", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, background:ds.has(n)?"#1a4a2a":"rgba(255,255,255,0.07)", color:ds.has(n)?"#4ade80":"#64748b", border:ds.has(n)?"2px solid #22c55e":"2px solid rgba(255,255,255,0.1)" }}>{n}</span>)}
      </div>
    </div>
  );
}

function BetFeedRow({ bet, drawnSet }: { bet: KenoState["bets"][0]; drawnSet: Set<number> }) {
  const isDone = bet.matched !== null;
  return (
    <div style={{ borderBottom:"1px solid rgba(255,255,255,0.05)", padding:"8px 14px" }}>
      <div style={{ fontSize:12, color:"#6b8a7a", fontWeight:700, marginBottom:5 }}>{bet.username}</div>
      <div style={{ display:"flex", gap:4, marginBottom:5, flexWrap:"wrap" }}>
        {Array.from({ length: 10 }).map((_, i) => {
          const filled = i < bet.pickedCount;
          return <div key={i} style={{ width:30, height:26, borderRadius:4, background:filled?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.04)", border:`1px solid ${filled?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.06)"}` }} />;
        })}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <span style={{ fontSize:12, color:"#8a9a94" }}>Bet {bet.betAmount}</span>
        <span style={{ fontSize:12, fontWeight:800, color:isDone?(bet.payout&&bet.payout>0?"#4ade80":"#ef4444"):"#f59e0b" }}>{isDone?(bet.payout&&bet.payout>0?`+${bet.payout.toFixed(2)}`:"Lost"):"Waiting"}</span>
      </div>
    </div>
  );
}

function MyBetFeedRow({ myBet, drawnSet }: { myBet: NonNullable<KenoState["myBet"]>; drawnSet: Set<number> }) {
  const isDone = myBet.matched !== null;
  return (
    <div style={{ borderBottom:"1px solid rgba(255,255,255,0.05)", padding:"8px 14px", background:"rgba(0,180,70,0.04)" }}>
      <div style={{ fontSize:12, color:"#4ade80", fontWeight:700, marginBottom:5 }}>You</div>
      <div style={{ display:"flex", gap:4, marginBottom:5, flexWrap:"wrap" }}>
        {myBet.pickedNumbers.map(n => {
          const hit = drawnSet.has(n);
          return <div key={n} style={{ minWidth:30, height:26, borderRadius:4, padding:"0 4px", background:hit?"#1a4a2a":"rgba(255,255,255,0.1)", border:`1px solid ${hit?"#22c55e":"rgba(255,255,255,0.18)"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:hit?"#4ade80":"#e2e8f0" }}>{n}</div>;
        })}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <span style={{ fontSize:12, color:"#8a9a94" }}>Bet {myBet.betAmount}</span>
        <span style={{ fontSize:12, fontWeight:800, color:isDone?(myBet.payout&&myBet.payout>0?"#4ade80":"#ef4444"):"#f59e0b" }}>{isDone?(myBet.payout&&myBet.payout>0?`+${myBet.payout.toFixed(2)}`:"Lost"):"Waiting"}</span>
      </div>
    </div>
  );
}

export default function KenoScreen() {
  const navigate = useNavigate();
  const [access, setAccess] = useState<"loading"|"allowed"|"denied">("loading");
  const [balance, setBalance] = useState<number|null>(null);
  const [roundId, setRoundId] = useState<string|null>(null);
  const [phase, setPhase] = useState<KenoState["phase"]>("idle");
  const [bettingEndsAt, setBettingEndsAt] = useState(0);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [myBet, setMyBet] = useState<KenoState["myBet"]>(null);
  const [liveBets, setLiveBets] = useState<KenoState["bets"]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [betAmount, setBetAmount] = useState(4);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [tab, setTab] = useState<"game"|"history"|"results"|"statistics">("game");
  const latestTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(() => {
    checkKenoAccess().then(r => setAccess(r.allowed?"allowed":"denied")).catch(() => setAccess("denied"));
    getProfile().then(p => setBalance(p.mainWallet.balance)).catch(() => {});
  }, []);

  useEffect(() => {
    if (access !== "allowed") return;
    getKenoState().then(state => {
      setPhase(state.phase);
      setLiveBets(state.bets);
      if (state.round) {
        setRoundId(state.round.id);
        setBettingEndsAt(new Date(state.round.bettingEndsAt).getTime());
        const nums = state.round.drawnNumbers ?? [];
        setDrawnNumbers(nums);
      }
      if (state.myBet) { setMyBet(state.myBet); setPicked(state.myBet.pickedNumbers); }
    }).catch(() => {});
  }, [access]);

  useEffect(() => {
    if (access !== "allowed") return;
    const onBettingOpen = ({ roundId: rid, endsAt }: { roundId: string; endsAt: number }) => {
      setRoundId(rid); setPhase("betting"); setBettingEndsAt(endsAt);
      setDrawnNumbers([]); setMyBet(null); setLiveBets([]); setError(null); setPicked([]);
    };
    const onNumberDrawn = ({ roundId: rid, number, drawnSoFar }: { roundId: string; number: number; drawnSoFar: number[] }) => {
      if (rid !== roundId && roundId !== null) return;
      setPhase("drawing"); setDrawnNumbers([...drawnSoFar]);
      if (latestTimer.current) clearTimeout(latestTimer.current);
      latestTimer.current = setTimeout(() => {}, 1800);
    };
    const onRoundFinished = ({ drawnNumbers: nums }: { roundId: string; drawnNumbers: number[] }) => {
      setPhase("finished"); setDrawnNumbers(nums);
      getKenoState().then(state => {
        if (state.myBet) { setMyBet(state.myBet); setTab("results"); }
        setLiveBets(state.bets);
      }).catch(() => {});
      setTimeout(() => { setPicked([]); setMyBet(null); }, 8000);
    };
    socket.on("KENO_BETTING_OPEN", onBettingOpen);
    socket.on("KENO_NUMBER_DRAWN", onNumberDrawn);
    socket.on("KENO_ROUND_FINISHED", onRoundFinished);
    return () => {
      socket.off("KENO_BETTING_OPEN", onBettingOpen);
      socket.off("KENO_NUMBER_DRAWN", onNumberDrawn);
      socket.off("KENO_ROUND_FINISHED", onRoundFinished);
    };
  }, [access, roundId]);

  useEffect(() => () => { if (latestTimer.current) clearTimeout(latestTimer.current); }, []);

  const togglePick = useCallback((n: number) => {
    if (phase !== "betting" || myBet) return;
    setError(null);
    setPicked(prev => prev.includes(n) ? prev.filter(x => x !== n) : prev.length >= MAX_PICKS ? prev : [...prev, n]);
  }, [phase, myBet]);

  const handleBet = async () => {
    if (!roundId || picked.length === 0 || placing || myBet || phase !== "betting") return;
    setPlacing(true); setError(null);
    try {
      await placeKenoBet(betAmount, picked);
      setMyBet({ id:"pending", pickedNumbers:picked, betAmount, matched:null, payout:null });
      getProfile().then(p => setBalance(p.mainWallet.balance)).catch(() => {});
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? "Failed";
      if (msg.includes("INSUFFICIENT")) setError("Insufficient balance");
      else if (msg.includes("No round")) setError("Betting closed");
      else setError(msg);
    } finally { setPlacing(false); }
  };

  const drawnSet = new Set(drawnNumbers);
  const pickedSet = new Set(picked);
  const canBet = phase === "betting" && !myBet && !placing && picked.length > 0;
  const roundShortId = roundId ? roundId.slice(-5) : null;

  if (access === "loading") return <div style={{ minHeight:"100dvh", background:"#0a1410" }} />;
  if (access === "denied") return (
    <div style={{ minHeight:"100dvh", background:"#0a1410", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:24, textAlign:"center", fontFamily:"Inter,-apple-system,sans-serif", color:"#fff" }}>
      <div style={{ fontSize:48 }}>🎱</div>
      <div style={{ fontSize:20, fontWeight:800 }}>Keno Coming Soon</div>
      <div style={{ fontSize:14, color:"#6b8a7a", lineHeight:1.7 }}>Currently in early access.</div>
      <button onClick={() => navigate("/")} style={{ padding:"12px 28px", borderRadius:12, border:"none", background:"#1a5c3a", color:"#4ade80", fontSize:14, fontWeight:800, cursor:"pointer" }}>Back to Games</button>
    </div>
  );

  return (
    <div style={{ minHeight:"100dvh", background:"linear-gradient(180deg,#0d1a14 0%,#08110d 100%)", display:"flex", flexDirection:"column", fontFamily:"Inter,-apple-system,BlinkMacSystemFont,sans-serif", color:"#fff", maxWidth:480, margin:"0 auto", overflowX:"hidden" }}>

      {/* Top bar: Back | balance + ID | icons */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px 8px", background:"rgba(0,0,0,0.45)", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0 }}>
        <button onClick={() => navigate("/")} style={{ background:"none", border:"none", color:"#c8d8d0", fontSize:14, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:5, padding:0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </button>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"5px 10px", display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ fontSize:13, fontWeight:700, color:"#e2e8f0" }}>{balance !== null ? balance.toFixed(2) : "0.00"}</span>
            <span style={{ fontSize:11, color:"#6a8a78", fontWeight:600 }}>ETB</span>
          </div>
          {roundShortId && (
            <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:"#9ab8a8", fontWeight:600 }}>
              <span>ID: {roundShortId}</span>
              <span style={{ width:16, height:16, borderRadius:"50%", border:"2px solid #22c55e", display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6.5l3 3 5-5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
            </div>
          )}
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <button style={{ background:"none", border:"none", cursor:"pointer", color:"#6a8a78", padding:0, display:"flex", alignItems:"center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <button style={{ background:"none", border:"none", cursor:"pointer", color:"#6a8a78", padding:0, display:"flex", alignItems:"center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </button>
        </div>
      </div>

      {/* FAST KENO row + timer centered */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 14px 6px", flexShrink:0 }}>
        <div style={{ lineHeight:1.1 }}>
          <div style={{ fontSize:10, fontWeight:900, color:"#fff", letterSpacing:"0.12em" }}>FAST</div>
          <div style={{ fontSize:18, fontWeight:900, color:"#22c55e", letterSpacing:"0.04em", marginTop:-1 }}>KENO</div>
        </div>
        {/* Timer pill */}
        <div style={{ background:"rgba(0,0,0,0.55)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, padding:"5px 18px", display:"flex", alignItems:"center", justifyContent:"center", minWidth:100 }}>
          <span style={{ fontSize:18, fontWeight:900, color:"#e2e8f0", letterSpacing:"3px", fontFamily:"monospace" }}>
            {phase === "betting" && bettingEndsAt > 0
              ? <Countdown endsAt={bettingEndsAt} />
              : phase === "drawing"
              ? <span style={{ fontSize:13, color:"#3b82f6", letterSpacing:"0.05em" }}>DRAWING</span>
              : phase === "finished"
              ? <span style={{ fontSize:13, color:"#22c55e" }}>DONE</span>
              : <span style={{ color:"#475569" }}>--:--</span>}
          </span>
        </div>
        <div style={{ width:60 }} />
      </div>

      {/* Possible win card (when picks made) */}
      {picked.length > 0 && phase === "betting" && (
        <PossibleWinCard betAmount={betAmount} pickedNumbers={picked} />
      )}

      {/* Number Grid - always visible */}
      <div style={{ flexShrink:0, borderTop:"1px solid rgba(255,255,255,0.05)", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
        <NumberGrid picked={pickedSet} drawn={drawnSet} phase={phase} onToggle={togglePick} />
      </div>

      {/* Bet controls row */}
      {phase === "betting" && !myBet && (
        <div style={{ flexShrink:0, background:"rgba(8,15,10,0.97)" }}>
          <BetControls amount={betAmount} onChange={setBetAmount} />
          {error && <div style={{ padding:"2px 10px 4px", fontSize:12, color:"#f87171" }}>{error}</div>}
          <div style={{ padding:"4px 8px", paddingBottom:"max(8px, env(safe-area-inset-bottom))" }}>
            <button onClick={() => { void handleBet(); }} disabled={!canBet} style={{ width:"100%", padding:"15px", borderRadius:10, border:"none", background:canBet?"#2d7a45":"rgba(255,255,255,0.06)", color:canBet?"#fff":"#475569", fontSize:18, fontWeight:900, cursor:canBet?"pointer":"default", letterSpacing:"0.08em", boxShadow:canBet?"0 2px 16px rgba(0,160,70,0.35)":"none", transition:"background 0.2s" }}>
              {placing ? "PLACING..." : "BET"}
            </button>
          </div>
        </div>
      )}

      {phase === "betting" && myBet && (
        <div style={{ flexShrink:0, padding:"12px 14px", background:"rgba(0,100,50,0.15)", borderTop:"1px solid rgba(0,180,70,0.2)", textAlign:"center", fontSize:13, color:"#4ade80", fontWeight:700 }}>
          Bet placed – waiting for draw
        </div>
      )}

      {(phase === "idle" || phase === "finished") && !myBet && (
        <div style={{ flexShrink:0, padding:"12px 14px", background:"rgba(0,0,0,0.3)", borderTop:"1px solid rgba(255,255,255,0.06)", textAlign:"center", fontSize:13, color:"#4a6a58" }}>
          {phase === "finished" ? "Round finished – next round starting soon" : "Waiting for next round..."}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.07)", borderTop:"1px solid rgba(255,255,255,0.06)", flexShrink:0, background:"rgba(0,0,0,0.3)" }}>
        {([
          { key:"game", label:"GAME", icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> },
          { key:"history", label:"HISTORY", icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.96"/></svg> },
          { key:"results", label:"RESULTS", icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> },
          { key:"statistics", label:"STATISTICS", icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
        ] as const).map(({ key, label, icon }) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex:1, padding:"10px 2px", background:"none", border:"none", borderBottom:tab===key?"2px solid #22c55e":"2px solid transparent", color:tab===key?"#22c55e":"#4a6a58", fontSize:9, fontWeight:800, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.05em", display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
            <span style={{ color:tab===key?"#22c55e":"#4a6a58" }}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Tab counts row */}
      {tab === "game" && (
        <div style={{ display:"flex", gap:0, padding:"7px 14px", fontSize:12, color:"#4a6a58", fontWeight:600, borderBottom:"1px solid rgba(255,255,255,0.05)", flexShrink:0 }}>
          <span style={{ marginRight:20 }}>All <span style={{ color:"#8ab89a" }}>{liveBets.length + (myBet ? 1 : 0)}</span></span>
          <span style={{ marginRight:20 }}>My Tickets <span style={{ color:"#8ab89a" }}>{myBet ? 1 : 0}</span></span>
          <span>My Bets <span style={{ color:"#8ab89a" }}>{myBet ? 1 : 0}</span></span>
        </div>
      )}

      {/* Scrollable feed */}
      <div style={{ flex:1, overflowY:"auto", minHeight:0 }}>
        {tab === "game" && (
          <>
            {myBet && <MyBetFeedRow myBet={myBet} drawnSet={drawnSet} />}
            {liveBets.map((b, i) => <BetFeedRow key={i} bet={b} drawnSet={drawnSet} />)}
            {!myBet && liveBets.length === 0 && (
              <div style={{ padding:"10px 14px", fontSize:12, color:"#4a6a58" }}>h***s</div>
            )}
          </>
        )}
        {tab === "history" && <HistoryTab />}
        {tab === "results" && <ResultsTab myBet={myBet} drawnNumbers={drawnNumbers} />}
        {tab === "statistics" && <div style={{ textAlign:"center", padding:40, color:"#475569" }}>Statistics coming soon</div>}
      </div>
    </div>
  );
}
