import os

part2 = r"""
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
"""

part3 = r"""
export default function KenoScreen() {
  const navigate = useNavigate();
  const [access, setAccess] = useState<"loading"|"allowed"|"denied">("loading");
  const [balance, setBalance] = useState<number|null>(null);
  const [roundId, setRoundId] = useState<string|null>(null);
  const [roundCounter, setRoundCounter] = useState("0/20");
  const [phase, setPhase] = useState<KenoState["phase"]>("idle");
  const [bettingEndsAt, setBettingEndsAt] = useState(0);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [latestNum, setLatestNum] = useState<number|null>(null);
  const latestTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const [myBet, setMyBet] = useState<KenoState["myBet"]>(null);
  const [liveBets, setLiveBets] = useState<KenoState["bets"]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [betAmount, setBetAmount] = useState(4);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [tab, setTab] = useState<"game"|"history"|"results"|"statistics">("game");

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
        setRoundCounter(`${nums.length}/${TOTAL_DRAWN}`);
        if (nums.length > 0) setLatestNum(nums[nums.length-1] ?? null);
      }
      if (state.myBet) { setMyBet(state.myBet); setPicked(state.myBet.pickedNumbers); }
    }).catch(() => {});
  }, [access]);

  useEffect(() => {
    if (access !== "allowed") return;
    const onBettingOpen = ({ roundId: rid, endsAt }: { roundId: string; endsAt: number }) => {
      setRoundId(rid); setPhase("betting"); setBettingEndsAt(endsAt);
      setDrawnNumbers([]); setLatestNum(null); setRoundCounter(`0/${TOTAL_DRAWN}`);
      setMyBet(null); setLiveBets([]); setError(null); setPicked([]);
    };
    const onNumberDrawn = ({ roundId: rid, number, drawnSoFar }: { roundId: string; number: number; drawnSoFar: number[] }) => {
      if (rid !== roundId && roundId !== null) return;
      setPhase("drawing"); setDrawnNumbers([...drawnSoFar]); setLatestNum(number);
      setRoundCounter(`${drawnSoFar.length}/${TOTAL_DRAWN}`);
      if (latestTimer.current) clearTimeout(latestTimer.current);
      latestTimer.current = setTimeout(() => setLatestNum(null), 1800);
    };
    const onRoundFinished = ({ drawnNumbers: nums }: { roundId: string; drawnNumbers: number[] }) => {
      setPhase("finished"); setDrawnNumbers(nums); setRoundCounter(`${TOTAL_DRAWN}/${TOTAL_DRAWN}`);
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
    <div style={{ minHeight:"100dvh", background:"linear-gradient(180deg,#0a1410 0%,#071009 100%)", display:"flex", flexDirection:"column", fontFamily:"Inter,-apple-system,BlinkMacSystemFont,sans-serif", color:"#fff", maxWidth:480, margin:"0 auto", overflowX:"hidden" }}>

      {/* Top bar */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px 8px", background:"rgba(0,0,0,0.4)", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0 }}>
        <button onClick={() => navigate("/")} style={{ background:"none", border:"none", color:"#9ab8a8", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:4, padding:0 }}>&#8592; Back</button>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"4px 10px", display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:13, fontWeight:700, color:"#e2e8f0" }}>{balance !== null ? balance.toFixed(2) : "0.00"}</span>
            <span style={{ fontSize:11, color:"#6a8a78", fontWeight:600 }}>ETB</span>
          </div>
          {roundId && (
            <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#6a8a78" }}>
              <span>ID: {roundId.slice(-5)}</span>
              <span style={{ width:8, height:8, borderRadius:"50%", background:phase==="betting"||phase==="drawing"?"#22c55e":"#475569", display:"inline-block", boxShadow:phase==="betting"||phase==="drawing"?"0 0 6px #22c55e":"none" }} />
            </div>
          )}
        </div>
        <div style={{ fontSize:13, color:"#6a8a78", fontWeight:700 }}>{roundCounter}</div>
      </div>

      {/* FAST KENO logo + timer */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 14px 0", flexShrink:0 }}>
        <div style={{ lineHeight:1 }}>
          <div style={{ fontSize:11, fontWeight:900, color:"#22c55e", letterSpacing:"0.05em" }}>FAST</div>
          <div style={{ fontSize:16, fontWeight:900, color:"#22c55e" }}>KENO</div>
        </div>
        <div style={{ fontSize:18, fontWeight:900, color:"#e2e8f0", letterSpacing:"2px", fontFamily:"monospace" }}>
          {phase==="betting"&&bettingEndsAt>0 ? <Countdown endsAt={bettingEndsAt} />
            : phase==="drawing" ? <span style={{ fontSize:13, color:"#3b82f6", letterSpacing:"0.05em" }}>DRAWING</span>
            : phase==="finished" ? <span style={{ fontSize:13, color:"#22c55e" }}>FINISHED</span>
            : <span style={{ color:"#475569" }}>- : -</span>}
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <span style={{ fontSize:18, color:"#4a6a58", cursor:"pointer" }}>&#9776;</span>
          <span style={{ fontSize:18, color:"#4a6a58", cursor:"pointer" }}>&#128172;</span>
        </div>
      </div>

      {/* Center area */}
      <div style={{ flexShrink:0 }}>
        {phase==="betting" && picked.length>0 ? (
          <div style={{ padding:"10px 0 0" }}><PossibleWinCard betAmount={betAmount} pickedNumbers={picked} /></div>
        ) : phase==="betting" ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"20px 0 10px", background:"radial-gradient(ellipse at 50% 60%, rgba(0,200,80,0.06) 0%, transparent 70%)" }}>
            <div style={{ position:"relative", width:110, height:110, marginBottom:8 }}>
              <svg style={{ position:"absolute", inset:0 }} width="110" height="110" viewBox="0 0 110 110">
                <circle cx="55" cy="55" r="52" fill="none" stroke="rgba(0,200,80,0.1)" strokeWidth="1"/>
                <circle cx="55" cy="55" r="42" fill="none" stroke="rgba(0,200,80,0.06)" strokeWidth="1" strokeDasharray="4 6"/>
              </svg>
              <div style={{ position:"absolute", inset:10, borderRadius:"50%", background:"radial-gradient(circle at 38% 35%,#1e2d24 0%,#0d1a12 100%)", border:"2px solid rgba(0,180,70,0.15)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2 }}>
                <span style={{ fontSize:12, fontWeight:800, color:"#6a8a78" }}>Pick</span>
                <span style={{ fontSize:22, fontWeight:900, color:"#22c55e" }}>10</span>
                <span style={{ fontSize:9, color:"#4a6a58" }}>numbers</span>
              </div>
            </div>
            <div style={{ fontSize:16, fontWeight:800, color:"#e2e8f0", marginBottom:2 }}>Choose {MAX_PICKS} numbers</div>
            <div style={{ fontSize:13, color:"#22c55e", fontWeight:700 }}>From 1 to {TOTAL_NUMBERS}</div>
          </div>
        ) : (
          <>
            <CenterBall number={latestNum ?? (drawnNumbers.length>0 ? drawnNumbers[drawnNumbers.length-1] ?? null : null)} />
            <DrawnRow numbers={drawnNumbers} pickedSet={pickedSet} />
          </>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.07)", flexShrink:0 }}>
        {(["game","history","results","statistics"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex:1, padding:"10px 4px", background:"none", border:"none", borderBottom:tab===t?"2px solid #22c55e":"2px solid transparent", color:tab===t?"#22c55e":"#4a6a58", fontSize:10, fontWeight:800, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.06em" }}>
            {t==="game"?"GAME":t==="history"?"HISTORY":t==="results"?"RESULTS":"STATS"}
          </button>
        ))}
      </div>

      {/* Tab counts */}
      {tab==="game" && (
        <div style={{ display:"flex", gap:20, padding:"8px 14px", fontSize:12, color:"#4a6a58", fontWeight:700, borderBottom:"1px solid rgba(255,255,255,0.05)", flexShrink:0 }}>
          <span>All <span style={{ color:"#6a8a78" }}>{liveBets.length+(myBet?1:0)}</span></span>
          <span>My Tickets <span style={{ color:"#6a8a78" }}>{myBet?1:0}</span></span>
          <span>My Bets <span style={{ color:"#6a8a78" }}>{myBet?1:0}</span></span>
        </div>
      )}

      {/* Scrollable content */}
      <div style={{ flex:1, overflowY:"auto", minHeight:0 }}>
        {tab==="game" && (
          <>
            {myBet && <MyBetFeedRow myBet={myBet} drawnSet={drawnSet} />}
            {liveBets.map((b,i) => <BetFeedRow key={i} bet={b} drawnSet={drawnSet} />)}
            {!myBet && liveBets.length===0 && <div style={{ textAlign:"center", padding:"32px 16px", color:"#2a4a38", fontSize:13 }}>No bets yet this round</div>}
          </>
        )}
        {tab==="history" && <HistoryTab />}
        {tab==="results" && <ResultsTab myBet={myBet} drawnNumbers={drawnNumbers} />}
        {tab==="statistics" && <div style={{ textAlign:"center", padding:40, color:"#475569" }}>Statistics coming soon</div>}
      </div>

      {/* Betting panel */}
      {phase==="betting" && !myBet && tab==="game" && (
        <div style={{ flexShrink:0, background:"rgba(5,12,8,0.97)", borderTop:"1px solid rgba(255,255,255,0.07)" }}>
          <NumberGrid picked={pickedSet} drawn={drawnSet} phase={phase} onToggle={togglePick} />
          <BetControls amount={betAmount} onChange={setBetAmount} />
          {error && <div style={{ padding:"4px 10px", fontSize:12, color:"#f87171" }}>{error}</div>}
          <div style={{ padding:"6px 10px", paddingBottom:"max(10px, env(safe-area-inset-bottom))" }}>
            <button onClick={() => { void handleBet(); }} disabled={!canBet} style={{ width:"100%", padding:"16px", borderRadius:10, border:"none", background:canBet?"linear-gradient(180deg,#2d8a50 0%,#1a6a38 100%)":"rgba(255,255,255,0.06)", color:canBet?"#fff":"#475569", fontSize:18, fontWeight:900, cursor:canBet?"pointer":"default", letterSpacing:"0.05em", boxShadow:canBet?"0 4px 20px rgba(0,160,70,0.3)":"none", transition:"all 0.2s" }}>
              {placing ? "PLACING..." : "BET"}
            </button>
          </div>
        </div>
      )}

      {phase==="betting" && myBet && (
        <div style={{ flexShrink:0, padding:"12px 14px", background:"rgba(0,100,50,0.15)", borderTop:"1px solid rgba(0,180,70,0.2)", textAlign:"center", fontSize:13, color:"#4ade80", fontWeight:700 }}>
          Bet placed - waiting for draw
        </div>
      )}

      {(phase==="idle"||phase==="finished") && !myBet && (
        <div style={{ flexShrink:0, padding:"14px", background:"rgba(0,0,0,0.3)", borderTop:"1px solid rgba(255,255,255,0.06)", textAlign:"center", fontSize:13, color:"#4a6a58" }}>
          {phase==="finished" ? "Round finished - next round starting soon" : "Waiting for next round..."}
        </div>
      )}
    </div>
  );
}
"""

path = "apps/mini-app/src/screens/KenoScreen.tsx"
with open(path, "a", encoding="utf-8", newline="\n") as f:
    f.write(part2)
    f.write(part3)

size = os.path.getsize(path)
print(f"OK: {size} bytes")
