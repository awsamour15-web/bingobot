import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { socket } from "../lib/socket";
import { getKenoState, placeKenoBet, getKenoHistory, checkKenoAccess, getProfile } from "../lib/api";
import type { KenoState } from "../lib/api";

const MIN_BET = 5;
const MAX_BET = 5000;
const MAX_PICKS = 10;
const TOTAL_NUMBERS = 80;
const TOTAL_DRAWN = 20;

// PAYOUT_TABLE[picked][matched] — mirrors the backend keno-engine payout table
const PAYOUT_TABLE: Record<number, Record<number, number>> = {
  1:  { 1: 3.5 },
  2:  { 1: 1,   2: 10 },
  3:  {          2: 2,    3: 50 },
  4:  {          2: 1.5,  3: 10,   4: 80 },
  5:  {          2: 1,    3: 3,    4: 30,   5: 150 },
  6:  {                   3: 2,    4: 15,   5: 60,   6: 500 },
  7:  { 0: 1,             3: 2,    4: 4,    5: 20,   6: 80,   7: 1000 },
  8:  { 0: 1,                      4: 5,    5: 15,   6: 50,   7: 200,  8: 2000 },
  9:  { 0: 2,                      4: 2,    5: 10,   6: 25,   7: 125,  8: 1000, 9: 5000 },
  10: { 0: 2,                               5: 5,    6: 30,   7: 100,  8: 300,  9: 2000, 10: 10000 },
};

function getMultiplier(p: number, m: number): number { return PAYOUT_TABLE[p]?.[m] ?? 0; }
function calcPossibleWin(bet: number, p: number): number {
  if (p < 1) return 0;
  const vals = Object.values(PAYOUT_TABLE[p] ?? {});
  const best = vals.length ? Math.max(...vals) : 0;
  return Math.round(bet * best * 100) / 100;
}

function Countdown({ endsAt }: { endsAt: number }) {
  const [d, setD] = useState("00 : 00");
  useEffect(() => {
    const tick = () => {
      const rem = Math.max(0, endsAt - Date.now());
      const s = Math.ceil(rem / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      setD(`${mm} : ${ss}`);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return <span>{d}</span>;
}

function PossibleWinCard({ betAmount, pickedNumbers }: { betAmount: number; pickedNumbers: number[] }) {
  const p = pickedNumbers.length;

  // Empty state: prompt to choose numbers (matches screenshot exactly)
  if (p === 0) {
    return (
      <div style={{ margin:"0 10px 8px", background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px", position:"relative", display:"flex", alignItems:"center", gap:14, minHeight:72 }}>
        {/* Decorative balls — matching screenshot: "80" small top, "10" medium top-right, "1" large bottom-left green */}
        <div style={{ position:"relative", width:64, height:56, flexShrink:0 }}>
          <div style={{ position:"absolute", top:0, left:20, width:26, height:26, borderRadius:"50%", background:"radial-gradient(circle at 35% 30%, #3d5040 0%, #1a2820 100%)", border:"1px solid rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:"#8ab89a" }}>80</div>
          <div style={{ position:"absolute", top:0, left:38, width:30, height:30, borderRadius:"50%", background:"radial-gradient(circle at 35% 30%, #4a6080 0%, #1a2a40 100%)", border:"1px solid rgba(100,160,255,0.25)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:"#b0cce0" }}>10</div>
          <div style={{ position:"absolute", bottom:0, left:0, width:38, height:38, borderRadius:"50%", background:"radial-gradient(circle at 35% 30%, #3abe78 0%, #1a6040 50%, #0a3020 100%)", border:"2px solid rgba(74,222,128,0.5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:900, color:"#fff", boxShadow:"0 0 10px rgba(34,197,94,0.35)" }}>1</div>
        </div>
        <div>
          <div style={{ fontSize:17, fontWeight:800, color:C.textWhite }}>Choose {MAX_PICKS} numbers</div>
          <div style={{ fontSize:13, color:C.greenLight, fontWeight:600, marginTop:3 }}>From 1 to {TOTAL_NUMBERS}</div>
        </div>
        <div style={{ position:"absolute", top:10, right:12, width:22, height:22, borderRadius:"50%", border:`1px solid rgba(255,255,255,0.2)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:C.textMid, fontWeight:700 }}>?</div>
      </div>
    );
  }

  const possible = calcPossibleWin(betAmount, p);
  const rows: { match: number; mul: number }[] = [];
  for (let m = 0; m <= p; m++) { const mul = getMultiplier(p, m); if (mul > 0) rows.push({ match: m, mul }); }
  const show = rows.slice(-3);
  return (
    <div style={{ margin:"0 10px 8px", background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px", position:"relative" }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
        <span style={{ fontSize:15, color:C.textLight, fontWeight:700 }}>Possible win</span>
        <span style={{ fontSize:17, color:C.greenLight, fontWeight:900 }}>{possible.toFixed(0)}</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"50px 1fr", gap:"2px 0", marginBottom:8 }}>
        <span style={{ fontSize:11, color:C.textDim }}>Match</span>
        <span style={{ fontSize:11, color:C.textMid }}>{show.map(r => r.match).join("        ")}</span>
        <span style={{ fontSize:11, color:C.textDim }}>Pays</span>
        <span style={{ fontSize:11, color:C.textLight }}>{show.map(r => "x"+r.mul).join("      ")}</span>
      </div>
      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
        {pickedNumbers.map(n => (
          <div key={n} style={{ minWidth:30, height:26, borderRadius:5, padding:"0 6px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, color:C.textWhite }}>{n}</div>
        ))}
      </div>
      <div style={{ position:"absolute", top:10, right:12, width:22, height:22, borderRadius:"50%", border:`1px solid rgba(255,255,255,0.2)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:C.textMid, fontWeight:700 }}>?</div>
    </div>
  );
}

// Small colored dot shown on some grid cells (decorative, like in screenshot)
const DOT_CELLS: Record<number, string> = {
  3:"#ef4444", 6:"#ef4444", 10:"rgba(100,180,255,0.8)", 18:"#ef4444",
  27:"rgba(100,180,255,0.8)", 36:"rgba(100,180,255,0.8)", 41:"rgba(100,180,255,0.8)", 50:"#ef4444",
  71:"rgba(100,180,255,0.8)", 78:"#ef4444",
};

// Theme colors matching the screenshot
const C = {
  bg: "#0d1117",
  bgCard: "#131920",
  bgCell: "#161d28",
  bgCellBorder: "rgba(255,255,255,0.08)",
  bgCellPicked: "#1a4a2a",
  bgCellPickedBorder: "#22c55e",
  bgCellDrawn: "rgba(34,197,94,0.12)",
  bgCellDrawnBorder: "rgba(34,197,94,0.35)",
  bgCellHit: "#1a5c30",
  bgCellHitBorder: "#22c55e",
  textDim: "#4a6a58",
  textMid: "#8ab89a",
  textLight: "#c8ddd2",
  textWhite: "#e2e8f0",
  green: "#22c55e",
  greenLight: "#4ade80",
  yellow: "#f5a623",
  red: "#ef4444",
  topbar: "rgba(10,15,20,0.98)",
  border: "rgba(255,255,255,0.07)",
};

function NumberGrid({ picked, drawn, phase, onToggle }: { picked: Set<number>; drawn: Set<number>; phase: KenoState["phase"]; onToggle: (n: number) => void }) {
  const canPick = phase === "betting";
  const [justDrawn, setJustDrawn] = useState<number | null>(null);
  const prevDrawnRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    let newest: number | null = null;
    drawn.forEach(n => { if (!prevDrawnRef.current.has(n)) newest = n; });
    prevDrawnRef.current = new Set(drawn);
    if (newest !== null) {
      setJustDrawn(newest);
      const t = setTimeout(() => setJustDrawn(null), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [drawn]);

  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(10, 1fr)", gap:2, padding:"8px 8px" }}>
      {Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1).map(n => {
        const isPicked = picked.has(n), isDrawn = drawn.has(n);
        const isHit = isPicked && isDrawn;
        const isMiss = isPicked && !isDrawn && (phase === "drawing" || phase === "finished");
        const isNew = n === justDrawn;

        let bg = C.bgCell;
        let border = C.bgCellBorder;
        let color = "#8a9ab0";
        let shadow: string | undefined = undefined;

        if (isHit)        { bg = C.bgCellHit;   border = C.bgCellHitBorder;   color = C.greenLight; shadow = "0 0 8px rgba(34,197,94,0.4)"; }
        else if (isMiss)  { bg = "rgba(255,255,255,0.02)"; border = "rgba(255,255,255,0.04)"; color = "#2e4038"; }
        else if (isDrawn) { bg = C.bgCellDrawn;  border = C.bgCellDrawnBorder; color = "#6ee7a0"; }
        else if (isPicked){ bg = C.bgCellPicked; border = C.bgCellPickedBorder; color = "#e2e8f0"; shadow = "0 0 6px rgba(34,197,94,0.3)"; }

        const dot = DOT_CELLS[n];
        const flashColor = isHit ? "rgba(251,191,36,0.5)" : "rgba(34,197,94,0.4)";
        const litShadow = isHit
          ? "0 0 14px rgba(251,191,36,0.7), 0 0 4px rgba(251,191,36,0.5)"
          : "0 0 12px rgba(34,197,94,0.65), 0 0 4px rgba(34,197,94,0.4)";

        return (
          <motion.button
            key={n}
            onClick={() => canPick && onToggle(n)}
            disabled={!canPick}
            animate={isNew ? { scale: [1, 1.28, 1] } : { scale: 1 }}
            transition={isNew ? { duration: 0.32, ease: "easeOut" } : { duration: 0.1 }}
            style={{
              position: "relative", height: 33, borderRadius: 4,
              background: bg, border: `1px solid ${border}`, color,
              fontSize: 12, fontWeight: 700,
              cursor: canPick ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: isNew ? litShadow : shadow,
              outline: "none", padding: 0, fontFamily: "inherit",
              WebkitTapHighlightColor: "transparent", userSelect: "none",
              transformOrigin: "center",
            }}
          >
            {n}
            <AnimatePresence>
              {isNew && (
                <motion.span
                  key={`flash-${n}`}
                  initial={{ opacity: 0.85 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  style={{ position:"absolute", inset:0, borderRadius:4, background:flashColor, pointerEvents:"none" }}
                />
              )}
            </AnimatePresence>
            {dot && !isPicked && !isDrawn && (
              <span style={{ position:"absolute", top:3, right:3, width:4, height:4, borderRadius:"50%", background:dot, boxShadow:`0 0 3px ${dot}` }} />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

function BetControls({ amount, onChange }: { amount: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:0, padding:"6px 8px" }}>
      <button onClick={() => onChange(Math.max(MIN_BET, amount - 1))} style={{ width:40, height:42, borderRadius:"8px 0 0 8px", background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, borderRight:"none", color:"#e2e8f0", fontSize:22, fontWeight:300, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>-</button>
      <div style={{ flex:1, height:42, background:"rgba(0,0,0,0.4)", border:`1px solid ${C.border}`, borderLeft:"none", borderRight:"none", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, fontWeight:800, color:"#e2e8f0", letterSpacing:"-0.3px" }}>{amount.toFixed(2)}</div>
      <button onClick={() => onChange(Math.min(MAX_BET, amount + 1))} style={{ width:40, height:42, borderRadius:"0 8px 8px 0", background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, borderLeft:"none", color:"#e2e8f0", fontSize:22, fontWeight:300, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>+</button>
      <button onClick={() => onChange(Math.min(MAX_BET, amount * 2))} style={{ marginLeft:6, padding:"0 14px", height:42, borderRadius:8, background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, color:C.textMid, fontSize:13, fontWeight:800, cursor:"pointer", flexShrink:0 }}>X2</button>
      <button onClick={() => onChange(MAX_BET)} style={{ marginLeft:4, padding:"0 14px", height:42, borderRadius:8, background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, color:C.textMid, fontSize:13, fontWeight:800, cursor:"pointer", flexShrink:0 }}>MAX</button>
      <button style={{ marginLeft:4, width:42, height:42, borderRadius:8, background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, color:C.textMid, fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  );
}

function DrawnBallDisplay({ drawnNumbers, pickedSet }: { drawnNumbers: number[]; pickedSet: Set<number> }) {
  const latest = drawnNumbers[drawnNumbers.length - 1] ?? null;
  const prev = drawnNumbers.slice(0, -1);
  const isHit = latest !== null && pickedSet.has(latest);

  const prevToShow = prev.slice(-20);
  const rows: number[][] = [];
  if (prevToShow.length > 10) rows.push(prevToShow.slice(0, prevToShow.length - 10));
  if (prevToShow.length > 0) rows.push(prevToShow.slice(-10));

  return (
    <div style={{ position:"relative", flexShrink:0, background:"rgba(8,14,20,0.97)", borderBottom:`1px solid ${C.border}`, overflow:"hidden", paddingBottom:10 }}>
      {/* Subtle radar rings */}
      {[70, 110, 150].map(r => (
        <div key={r} style={{ position:"absolute", left:"50%", top:"50%", width:r, height:r, borderRadius:"50%", border:"1px solid rgba(255,255,255,0.03)", transform:"translate(-50%,-50%)", pointerEvents:"none" }} />
      ))}

      {/* Draw counter top-right */}
      <div style={{ position:"absolute", top:10, right:14, fontSize:13, fontWeight:700, color:C.textDim, letterSpacing:"0.08em" }}>
        {drawnNumbers.length} / {TOTAL_DRAWN}
      </div>

      {/* Main ball */}
      <div style={{ display:"flex", justifyContent:"center", paddingTop:14, paddingBottom:8 }}>
        {latest !== null ? (
          <div style={{
            width:76, height:76, borderRadius:"50%",
            background: isHit
              ? "radial-gradient(circle at 32% 28%, #5dde90 0%, #1a7a40 45%, #062418 100%)"
              : "radial-gradient(circle at 32% 28%, #c8d8e8 0%, #2a3d58 45%, #0a1828 100%)",
            boxShadow: isHit
              ? "0 0 28px rgba(34,197,94,0.7), 0 4px 14px rgba(0,0,0,0.7), inset 0 1px 3px rgba(255,255,255,0.15)"
              : "0 0 24px rgba(60,110,200,0.4), 0 4px 14px rgba(0,0,0,0.7), inset 0 1px 3px rgba(255,255,255,0.12)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:32, fontWeight:900, color:"#fff",
            border: isHit ? "2px solid rgba(74,222,128,0.7)" : "2px solid rgba(140,170,210,0.4)",
            letterSpacing:"-0.5px",
            textShadow:"0 2px 6px rgba(0,0,0,0.6)",
          }}>
            {latest}
          </div>
        ) : (
          <div style={{ width:76, height:76, borderRadius:"50%", background:"rgba(255,255,255,0.03)", border:`2px solid rgba(255,255,255,0.07)`, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:26, color:"rgba(255,255,255,0.1)" }}>?</span>
          </div>
        )}
      </div>

      {/* Previous drawn numbers rows */}
      {rows.map((row, ri) => (
        <div key={ri} style={{ display:"flex", justifyContent:"flex-start", gap:4, marginTop: ri === 0 ? 2 : 4, paddingLeft:8, paddingRight:8 }}>
          {row.map(n => {
            const hit = pickedSet.has(n);
            return (
              <div key={n} style={{
                width:30, height:30, borderRadius:"50%",
                background: hit
                  ? "radial-gradient(circle at 32% 28%, #5dde90 0%, #15803d 50%, #052e16 100%)"
                  : "radial-gradient(circle at 32% 28%, #90a8c0 0%, #1e3050 50%, #0a1828 100%)",
                border: hit ? "1.5px solid rgba(34,197,94,0.7)" : "1.5px solid rgba(80,110,160,0.3)",
                boxShadow: hit ? "0 0 7px rgba(34,197,94,0.35)" : "0 2px 5px rgba(0,0,0,0.5)",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:10, fontWeight:800,
                color: hit ? "#fff" : "#d0dce8",
                flexShrink:0,
              }}>{n}</div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

type HistEntry = { id: string; drawnNumbers: number[]; finishedAt: string; myBet: { pickedNumbers: number[]; betAmount: number; matched: number | null; payout: number | null } | null };

function StatisticsTab() {
  const [freq, setFreq] = useState<Record<number, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"number"|"count">("number");

  useEffect(() => {
    (getKenoHistory() as Promise<any[]>).then(d => {
      const counts: Record<number, number> = {};
      for (let i = 1; i <= 80; i++) counts[i] = 0;
      d.forEach(r => (r.drawnNumbers ?? []).forEach((n: number) => { counts[n] = (counts[n] ?? 0) + 1; }));
      setFreq(counts);
      setTotal(d.length);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign:"center", padding:40, color:"#475569" }}>Loading...</div>;

  const maxCount = Math.max(...Object.values(freq), 1);
  const entries = Array.from({ length: 80 }, (_, i) => i + 1);
  const sorted = sortBy === "count"
    ? [...entries].sort((a, b) => (freq[b] ?? 0) - (freq[a] ?? 0))
    : entries;

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 14px 6px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontSize:12, color:"#6b8a7a", fontWeight:600 }}>Last {total} rounds</span>
        <button
          onClick={() => setSortBy(s => s === "number" ? "count" : "number")}
          style={{ background:"none", border:"none", color:"#22c55e", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}
        >
          Sort
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M6 12h12M10 18h4"/>
          </svg>
        </button>
      </div>

      {/* Rows */}
      <div style={{ display:"flex", flexDirection:"column", gap:3, padding:"6px 10px" }}>
        {sorted.map(n => {
          const count = freq[n] ?? 0;
          const pct = (count / maxCount) * 100;
          return (
            <div key={n} style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.04)", borderRadius:7, padding:"7px 10px" }}>
              {/* Number badge */}
              <div style={{ width:32, height:28, borderRadius:6, background:"rgba(255,255,255,0.08)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#94a3b8", flexShrink:0 }}>
                {n}
              </div>
              {/* Bar */}
              <div style={{ flex:1, height:3, background:"rgba(255,255,255,0.07)", borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`, background:"#22c55e", borderRadius:2, transition:"width 0.4s ease" }} />
              </div>
              {/* Count */}
              <div style={{ width:28, textAlign:"right", fontSize:13, fontWeight:700, color:"#e2e8f0", flexShrink:0 }}>
                {count}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
      {/* Header row */}
      <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 14px 4px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontSize:12, color:"#6b8a7a", fontWeight:600 }}>Draw ID</span>
        <span style={{ fontSize:12, color:"#6b8a7a", fontWeight:600 }}>Combination</span>
      </div>

      {items.map(item => {
        const ps = new Set(item.myBet?.pickedNumbers ?? []);
        const nums = item.drawnNumbers;
        const row1 = nums.slice(0, 10);
        const row2 = nums.slice(10, 20);
        const drawId = item.id.slice(-8).toUpperCase();
        const time = new Date(item.finishedAt).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false });

        return (
          <div key={item.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.05)", padding:"10px 10px" }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
              {/* Left: shield icon + ID + time */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", minWidth:90, paddingTop:2 }}>
                <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.5C16.5 22.15 20 17.25 20 12V6L12 2z" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.5"/>
                    <path d="M9 12l2 2 4-4" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ fontSize:12, fontWeight:700, color:"#22c55e" }}>{drawId}</span>
                </div>
                <span style={{ fontSize:11, color:"#4a6a58", fontWeight:500 }}>{time}</span>
              </div>

              {/* Right: 2 rows of 10 numbers */}
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:3 }}>
                <div style={{ display:"flex", gap:3 }}>
                  {row1.map(n => (
                    <div key={n} style={{
                      flex:1, height:26, borderRadius:5,
                      background: ps.has(n) ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.07)",
                      border: `1px solid ${ps.has(n) ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.1)"}`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:11, fontWeight:700,
                      color: ps.has(n) ? "#4ade80" : "#94a3b8",
                    }}>{n}</div>
                  ))}
                </div>
                <div style={{ display:"flex", gap:3 }}>
                  {row2.map(n => (
                    <div key={n} style={{
                      flex:1, height:26, borderRadius:5,
                      background: ps.has(n) ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.07)",
                      border: `1px solid ${ps.has(n) ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.1)"}`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:11, fontWeight:700,
                      color: ps.has(n) ? "#4ade80" : "#94a3b8",
                    }}>{n}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResultsTab({ myBet, drawnNumbers, roundId }: { myBet: KenoState["myBet"]; drawnNumbers: number[]; roundId: string | null }) {
  const ds = new Set(drawnNumbers);
  const ps = new Set(myBet?.pickedNumbers ?? []);
  const row1 = drawnNumbers.slice(0, 10);
  const row2 = drawnNumbers.slice(10, 20);
  const drawId = roundId ? roundId.slice(-8).toUpperCase() : "--------";
  const now = new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false });

  return (
    <div style={{ display:"flex", flexDirection:"column" }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 14px 4px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontSize:12, color:"#6b8a7a", fontWeight:600 }}>Draw ID</span>
        <span style={{ fontSize:12, color:"#6b8a7a", fontWeight:600 }}>Combination</span>
      </div>

      {drawnNumbers.length === 0 ? (
        <div style={{ textAlign:"center", padding:40, color:"#475569" }}>No results yet</div>
      ) : (
        <div style={{ padding:"10px 10px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
            {/* Left: shield + ID + time */}
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", minWidth:90, paddingTop:2 }}>
              <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.5C16.5 22.15 20 17.25 20 12V6L12 2z" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.5"/>
                  <path d="M9 12l2 2 4-4" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{ fontSize:12, fontWeight:700, color:"#22c55e" }}>{drawId}</span>
              </div>
              <span style={{ fontSize:11, color:"#4a6a58", fontWeight:500 }}>{now}</span>
              {/* win/loss badge */}
              {myBet && (
                <div style={{ marginTop:6, fontSize:11, fontWeight:800, color:(myBet.payout??0)>0?"#4ade80":"#ef4444" }}>
                  {(myBet.payout??0)>0 ? `+${myBet.payout?.toFixed(2)}` : "No Win"}
                </div>
              )}
            </div>

            {/* Right: 2 rows of 10 numbers */}
            <div style={{ flex:1, display:"flex", flexDirection:"column", gap:3 }}>
              <div style={{ display:"flex", gap:3 }}>
                {row1.map(n => (
                  <div key={n} style={{
                    flex:1, height:26, borderRadius:5,
                    background: ps.has(n) ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.07)",
                    border: `1px solid ${ps.has(n) ? "rgba(34,197,94,0.6)" : "rgba(255,255,255,0.1)"}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:11, fontWeight:700,
                    color: ps.has(n) ? "#4ade80" : "#94a3b8",
                  }}>{n}</div>
                ))}
              </div>
              <div style={{ display:"flex", gap:3 }}>
                {row2.map(n => (
                  <div key={n} style={{
                    flex:1, height:26, borderRadius:5,
                    background: ps.has(n) ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.07)",
                    border: `1px solid ${ps.has(n) ? "rgba(34,197,94,0.6)" : "rgba(255,255,255,0.1)"}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:11, fontWeight:700,
                    color: ps.has(n) ? "#4ade80" : "#94a3b8",
                  }}>{n}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BetFeedRow({ bet, drawnSet }: { bet: KenoState["bets"][0]; drawnSet: Set<number> }) {
  const isDone = bet.matched !== null;
  const slots = Array.from({ length: Math.max(bet.pickedCount, 4) });
  return (
    <div style={{ borderBottom:`1px solid rgba(255,255,255,0.05)`, padding:"10px 14px" }}>
      <div style={{ fontSize:12, color:C.textDim, fontWeight:700, marginBottom:6 }}>{bet.username}</div>
      {/* Number slots — fixed width grid showing filled placeholders */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(10, 1fr)", gap:3, marginBottom:6 }}>
        {slots.map((_, i) => {
          const filled = i < bet.pickedCount;
          return (
            <div key={i} style={{
              height:28, borderRadius:4,
              background: filled ? C.bgCell : "rgba(255,255,255,0.02)",
              border: `1px solid ${filled ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)"}`,
            }} />
          );
        })}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:12, color:C.textMid, fontWeight:600 }}>Bet {bet.betAmount}</span>
        <span style={{ fontSize:12, fontWeight:800, color: isDone ? (bet.payout && bet.payout > 0 ? C.greenLight : C.red) : C.yellow }}>
          {isDone ? (bet.payout && bet.payout > 0 ? `+${bet.payout.toFixed(2)}` : "Lost") : "Waiting"}
        </span>
      </div>
    </div>
  );
}

function MyBetFeedRow({ myBet, drawnSet }: { myBet: NonNullable<KenoState["myBet"]>; drawnSet: Set<number> }) {
  const isDone = myBet.matched !== null;
  const slots = Array.from({ length: Math.max(myBet.pickedNumbers.length, 4) });
  return (
    <div style={{ borderBottom:`1px solid rgba(255,255,255,0.05)`, padding:"10px 14px", background:"rgba(0,160,60,0.03)" }}>
      <div style={{ fontSize:12, color:C.green, fontWeight:700, marginBottom:6 }}>You</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(10, 1fr)", gap:3, marginBottom:6 }}>
        {slots.map((_, i) => {
          const n = myBet.pickedNumbers[i];
          const hit = n !== undefined && drawnSet.has(n);
          const filled = n !== undefined;
          return (
            <div key={i} style={{
              height:28, borderRadius:4,
              background: hit ? "rgba(34,197,94,0.2)" : (filled ? C.bgCell : "rgba(255,255,255,0.02)"),
              border: `1px solid ${hit ? "rgba(34,197,94,0.5)" : (filled ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.04)")}`,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:11, fontWeight:800,
              color: hit ? C.greenLight : (filled ? C.textWhite : "transparent"),
            }}>
              {filled ? n : ""}
            </div>
          );
        })}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:12, color:C.textMid, fontWeight:600 }}>Bet {myBet.betAmount}</span>
        <span style={{ fontSize:12, fontWeight:800, color: isDone ? (myBet.payout && myBet.payout > 0 ? C.greenLight : C.red) : C.yellow }}>
          {isDone ? (myBet.payout && myBet.payout > 0 ? `+${myBet.payout.toFixed(2)}` : "Lost") : "Waiting"}
        </span>
      </div>
    </div>
  );
}

export default function KenoScreen() {
  const navigate = useNavigate();
  const [access, setAccess] = useState<"loading"|"allowed"|"denied">("loading");
  const [mainBalance, setMainBalance] = useState<number|null>(null);
  const [playBalance, setPlayBalance] = useState<number|null>(null);
  const [roundId, setRoundId] = useState<string|null>(null);
  const [phase, setPhase] = useState<KenoState["phase"]>("idle");
  const [bettingEndsAt, setBettingEndsAt] = useState(0);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [myBet, setMyBet] = useState<KenoState["myBet"]>(null);
  const [myBets, setMyBets] = useState<NonNullable<KenoState["myBet"]>[]>([]);
  const [liveBets, setLiveBets] = useState<KenoState["bets"]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [betAmount, setBetAmount] = useState(5);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [tab, setTab] = useState<"game"|"history"|"results"|"statistics">("game");
  const [gameSubTab, setGameSubTab] = useState<"all"|"mytickets"|"mybets">("all");
  const latestTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(() => {
    checkKenoAccess().then(r => setAccess(r.allowed?"allowed":"denied")).catch(() => setAccess("denied"));
    getProfile().then(p => {
      setMainBalance(p.mainWallet.balance);
      setPlayBalance(p.playWallet.balance);
    }).catch(() => {});
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
      if (state.myBet) { setMyBet(state.myBet); setMyBets(state.myBets ?? [state.myBet]); setPicked(state.myBet.pickedNumbers); }
    }).catch(() => {});
  }, [access]);

  useEffect(() => {
    if (access !== "allowed") return;
    const onBettingOpen = ({ roundId: rid, endsAt }: { roundId: string; endsAt: number }) => {
      setRoundId(rid); setPhase("betting"); setBettingEndsAt(endsAt);
      setDrawnNumbers([]); setMyBet(null); setMyBets([]); setLiveBets([]); setError(null); setPicked([]);
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
        if (state.myBet) { setMyBet(state.myBet); setMyBets(state.myBets ?? [state.myBet]); setTab("results"); }
        setLiveBets(state.bets);
      }).catch(() => {});
      setTimeout(() => { setPicked([]); setMyBet(null); setMyBets([]); }, 8000);
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
    if (phase !== "betting") return;
    setError(null);
    setPicked(prev => prev.includes(n) ? prev.filter(x => x !== n) : prev.length >= MAX_PICKS ? prev : [...prev, n]);
  }, [phase]);

  const handleBet = async () => {
    if (!roundId || picked.length === 0 || placing || phase !== "betting") return;
    setPlacing(true); setError(null);
    try {
      await placeKenoBet(betAmount, picked);
      const newBet = { id:"pending", pickedNumbers:[...picked], betAmount, matched:null, payout:null };
      setMyBet(newBet);
      setMyBets(prev => [...prev, newBet]);
      setPicked([]); // reset picks so player can place another bet
      getProfile().then(p => {
        setMainBalance(p.mainWallet.balance);
        setPlayBalance(p.playWallet.balance);
      }).catch(() => {});
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? "Failed";
      if (msg.includes("INSUFFICIENT")) setError("Insufficient balance");
      else if (msg.includes("No round")) setError("Betting closed");
      else setError(msg);
    } finally { setPlacing(false); }
  };

  const drawnSet = new Set(drawnNumbers);
  const pickedSet = new Set(picked);
  const canBet = phase === "betting" && !placing && picked.length > 0;

  if (access === "loading") return <div style={{ minHeight:"100dvh", background:C.bg }} />;
  if (access === "denied") return (
    <div style={{ minHeight:"100dvh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:24, textAlign:"center", fontFamily:"Inter,-apple-system,sans-serif", color:"#fff" }}>
      <div style={{ fontSize:48 }}>🎱</div>
      <div style={{ fontSize:20, fontWeight:800 }}>Keno Coming Soon</div>
      <div style={{ fontSize:14, color:C.textDim, lineHeight:1.7 }}>Currently in early access.</div>
      <button onClick={() => navigate("/")} style={{ padding:"12px 28px", borderRadius:12, border:"none", background:"#1a5c3a", color:C.greenLight, fontSize:14, fontWeight:800, cursor:"pointer" }}>Back to Games</button>
    </div>
  );

  return (
    <div style={{ minHeight:"100dvh", background:C.bg, display:"flex", flexDirection:"column", fontFamily:"Inter,-apple-system,BlinkMacSystemFont,sans-serif", color:"#fff", maxWidth:480, margin:"0 auto", overflowX:"hidden", overflowY:"auto" }}>

      {/* Top bar: FAST KENO | balance + ID | menu */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 14px", background:C.topbar, borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        {/* FAST KENO logo — tappable to go back */}
        <button onClick={() => navigate("/")} style={{ background:"none", border:"none", cursor:"pointer", padding:0, lineHeight:1.05, textAlign:"left" }}>
          <div style={{ fontSize:9, fontWeight:900, color:"#fff", letterSpacing:"0.16em" }}>FAST</div>
          <div style={{ fontSize:18, fontWeight:900, color:C.green, letterSpacing:"0.04em", marginTop:-1 }}>KENO</div>
        </button>

        {/* Balance pill + ID+checkmark */}
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ background:"rgba(0,0,0,0.5)", border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 12px", display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ fontSize:15, fontWeight:700, color:C.textWhite }}>{mainBalance !== null ? mainBalance.toFixed(0) : "0"}</span>
            <span style={{ fontSize:10, fontWeight:600, color:C.textDim, letterSpacing:"0.05em" }}>ETB</span>
          </div>
          <div style={{ background:"rgba(0,0,0,0.5)", border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 10px", display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:13, fontWeight:700, color:C.textWhite }}>ID: {roundId ? roundId.slice(-8) : "--------"}</span>
            <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${C.green}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6.5l3 3 5-5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>
        </div>

        {/* Hamburger + chat */}
        <div style={{ display:"flex", gap:8 }}>
          <button style={{ background:"none", border:"none", cursor:"pointer", color:C.textMid, padding:0, display:"flex", alignItems:"center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <button style={{ background:"none", border:"none", cursor:"pointer", color:C.textMid, padding:0, display:"flex", alignItems:"center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Timer row — centered */}
      <div style={{ display:"flex", justifyContent:"center", alignItems:"center", padding:"10px 14px 6px", flexShrink:0 }}>
        <span style={{ fontSize:22, fontWeight:900, color:C.textLight, letterSpacing:"6px", fontFamily:"'JetBrains Mono','Courier New',monospace" }}>
          {phase === "betting" && bettingEndsAt > 0
            ? <Countdown endsAt={bettingEndsAt} />
            : phase === "drawing"
            ? <span style={{ fontSize:16, letterSpacing:"2px", color:"#3b82f6" }}>{String(drawnNumbers.length).padStart(2,"0")} / {TOTAL_DRAWN}</span>
            : phase === "finished"
            ? <span style={{ fontSize:16, letterSpacing:"2px", color:C.green }}>DONE</span>
            : <span style={{ color:"#1e2e24" }}>00 : 00</span>}
        </span>
      </div>

      {/* Draw ball display during drawing/finished phase */}
      {(phase === "drawing" || phase === "finished") && drawnNumbers.length > 0 && (
        <DrawnBallDisplay drawnNumbers={drawnNumbers} pickedSet={pickedSet} />
      )}

      {/* Possible win card (always shown during betting) */}
      {phase === "betting" && (
        <PossibleWinCard betAmount={betAmount} pickedNumbers={picked} />
      )}

      {/* Number Grid - only shown during betting */}
      {phase === "betting" && (
        <div style={{ flexShrink:0, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, background:C.bgCard }}>
          <NumberGrid picked={pickedSet} drawn={drawnSet} phase={phase} onToggle={togglePick} />
        </div>
      )}

      {/* Bet controls row */}
      {phase === "betting" && (
        <div style={{ flexShrink:0, background:"rgba(8,12,16,0.98)" }}>
          <BetControls amount={betAmount} onChange={setBetAmount} />
          {error && <div style={{ padding:"2px 10px 4px", fontSize:12, color:C.red }}>{error}</div>}
          {myBets.length > 0 && (
            <div style={{ padding:"2px 10px 4px", fontSize:12, color:C.greenLight }}>{myBets.length} bet{myBets.length > 1 ? "s" : ""} placed - pick new numbers to bet again</div>
          )}
          <div style={{ padding:"4px 8px", paddingBottom:"max(8px, env(safe-area-inset-bottom))" }}>
            <button onClick={() => { void handleBet(); }} disabled={!canBet} style={{ width:"100%", padding:"15px", borderRadius:10, border:"none", background:canBet?"#236e3a":"rgba(255,255,255,0.05)", color:canBet?"#e2fce9":"#3a5048", fontSize:18, fontWeight:900, cursor:canBet?"pointer":"default", letterSpacing:"0.08em", boxShadow:canBet?"0 2px 18px rgba(0,140,60,0.3)":"none", transition:"background 0.2s" }}>
              {placing ? "PLACING..." : "BET"}
            </button>
          </div>
        </div>
      )}



      {(phase === "idle" || phase === "finished") && myBets.length === 0 && (
        <div style={{ flexShrink:0, padding:"12px 14px", background:"rgba(0,0,0,0.3)", borderTop:"1px solid rgba(255,255,255,0.06)", textAlign:"center", fontSize:13, color:"#4a6a58" }}>
          {phase === "finished" ? "Round finished � next round starting soon" : "Waiting for next round..."}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, borderTop:`1px solid ${C.border}`, flexShrink:0, background:"rgba(0,0,0,0.35)" }}>
        {([
          { key:"game", label:"GAME", icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> },
          { key:"history", label:"HISTORY", icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.96"/></svg> },
          { key:"results", label:"RESULTS", icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> },
          { key:"statistics", label:"STATISTICS", icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
        ] as const).map(({ key, label, icon }) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex:1, padding:"10px 2px", background:"none", border:"none", borderBottom:tab===key?`2px solid ${C.green}`:"2px solid transparent", color:tab===key?C.green:C.textDim, fontSize:9, fontWeight:800, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.05em", display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
            <span style={{ color:tab===key?C.green:C.textDim }}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Tab counts row - sub tabs for GAME */}
      {tab === "game" && (
        <div style={{ display:"flex", gap:0, padding:"0 14px", fontSize:12, color:C.textDim, fontWeight:600, borderBottom:`1px solid rgba(255,255,255,0.05)`, flexShrink:0, background:"rgba(0,0,0,0.2)" }}>
          {([
            { key:"all", label:"All", count: liveBets.length + myBets.length },
            { key:"mytickets", label:"My Tickets", count: myBets.length },
            { key:"mybets", label:"My Bets", count: null },
          ] as const).map(({ key, label, count }) => (
            <button key={key} onClick={() => setGameSubTab(key)} style={{ padding:"8px 12px 7px", background:"none", border:"none", borderBottom: gameSubTab===key ? `2px solid ${C.green}` : "2px solid transparent", color: gameSubTab===key ? C.textWhite : C.textDim, fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
              {label}{count !== null && <span style={{ marginLeft:4, color: gameSubTab===key ? C.green : C.textDim }}>{count}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable feed */}
      <div style={{ flex:1 }}>
        {tab === "game" && gameSubTab === "all" && (
          <>
            {myBets.map((b, i) => <MyBetFeedRow key={i} myBet={b} drawnSet={drawnSet} />)}
            {liveBets.map((b, i) => <BetFeedRow key={i} bet={b} drawnSet={drawnSet} />)}
            {myBets.length === 0 && liveBets.length === 0 && (
              <div style={{ padding:"20px 14px", fontSize:12, color:C.textDim, textAlign:"center" }}>No bets yet this round</div>
            )}
          </>
        )}
        {tab === "game" && gameSubTab === "mytickets" && (
          <>
            {myBets.length > 0
              ? myBets.map((b, i) => <MyBetFeedRow key={i} myBet={b} drawnSet={drawnSet} />)
              : <div style={{ padding:"20px 14px", fontSize:12, color:C.textDim, textAlign:"center" }}>No ticket this round</div>
            }
          </>
        )}
        {tab === "game" && gameSubTab === "mybets" && <HistoryTab />}
        {tab === "history" && <HistoryTab />}
        {tab === "results" && <ResultsTab myBet={myBet} drawnNumbers={drawnNumbers} roundId={roundId} />}
        {tab === "statistics" && <StatisticsTab />}
      </div>
    </div>
  );
}
