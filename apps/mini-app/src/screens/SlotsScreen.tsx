import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { spinSlots, gambleSlots, getProfile } from "../lib/api";
import type { SlotSymbol, PaylineWin, SpinResponse } from "../lib/api";



// SVG symbols rendered inline
function SymbolSvg({ sym, size = 56 }: { sym: SlotSymbol; size?: number }) {
  const s = size;
  if (sym === "seven") return (
    <svg width={s} height={s} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g77r" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff6b6b"/>
          <stop offset="50%" stopColor="#ee0000"/>
          <stop offset="100%" stopColor="#aa0000"/>
        </linearGradient>
        <linearGradient id="g77g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffd700"/>
          <stop offset="50%" stopColor="#ffa000"/>
          <stop offset="100%" stopColor="#e65100"/>
        </linearGradient>
      </defs>
      <text x="3" y="44" fontSize="42" fontWeight="900" fontFamily="Arial Black, sans-serif" fill="url(#g77r)" stroke="url(#g77g)" strokeWidth="2">77</text>
    </svg>
  );
  if (sym === "double_dollar") return (
    <svg width={s} height={s} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gds" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffd700"/>
          <stop offset="50%" stopColor="#ff9800"/>
          <stop offset="100%" stopColor="#e65100"/>
        </linearGradient>
      </defs>
      <text x="2" y="44" fontSize="40" fontWeight="900" fontFamily="Arial Black, sans-serif" fill="url(#gds)" stroke="#b8620010" strokeWidth="1">$$</text>
    </svg>
  );
  if (sym === "bell") return (
    <svg width={s} height={s} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gbell" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#fff176"/>
          <stop offset="40%" stopColor="#fdd835"/>
          <stop offset="100%" stopColor="#f57f17"/>
        </linearGradient>
      </defs>
      {/* Bell body */}
      <path d="M30 8 C18 8 13 20 13 30 L13 40 L47 40 L47 30 C47 20 42 8 30 8Z" fill="url(#gbell)" stroke="#e65100" strokeWidth="1.5"/>
      {/* Rim */}
      <rect x="10" y="39" width="40" height="6" rx="3" fill="#f57f17"/>
      {/* Clapper */}
      <circle cx="30" cy="49" r="4" fill="#e65100"/>
      {/* Shine */}
      <ellipse cx="23" cy="18" rx="5" ry="3" fill="rgba(255,255,255,0.4)" transform="rotate(-20,23,18)"/>
    </svg>
  );
  if (sym === "lemon") return (
    <svg width={s} height={s} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="glem" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#fff9c4"/>
          <stop offset="50%" stopColor="#ffee58"/>
          <stop offset="100%" stopColor="#f9a825"/>
        </linearGradient>
      </defs>
      <ellipse cx="30" cy="32" rx="20" ry="16" fill="url(#glem)" stroke="#f9a825" strokeWidth="1.5"/>
      <path d="M30 16 C30 16 28 8 30 6 C32 8 30 16 30 16Z" fill="#4caf50"/>
      <ellipse cx="23" cy="24" rx="5" ry="3" fill="rgba(255,255,255,0.4)" transform="rotate(-20,23,24)"/>
    </svg>
  );
  if (sym === "orange") return (
    <svg width={s} height={s} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gorg" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#ffcc80"/>
          <stop offset="50%" stopColor="#ffa726"/>
          <stop offset="100%" stopColor="#e65100"/>
        </linearGradient>
      </defs>
      <circle cx="30" cy="34" r="20" fill="url(#gorg)" stroke="#e65100" strokeWidth="1.5"/>
      <path d="M30 14 C30 14 26 6 28 4 C30 2 32 6 30 14Z" fill="#4caf50"/>
      <ellipse cx="23" cy="24" rx="5" ry="3" fill="rgba(255,255,255,0.4)" transform="rotate(-20,23,24)"/>
    </svg>
  );
  if (sym === "watermelon") return (
    <svg width={s} height={s} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gwm" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#66bb6a"/>
          <stop offset="100%" stopColor="#2e7d32"/>
        </linearGradient>
        <linearGradient id="gwmr" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ef9a9a"/>
          <stop offset="100%" stopColor="#c62828"/>
        </linearGradient>
      </defs>
      <path d="M8 46 A28 28 0 0 1 52 46Z" fill="url(#gwm)"/>
      <path d="M11 46 A25 25 0 0 1 49 46Z" fill="url(#gwmr)"/>
      <circle cx="22" cy="40" r="2" fill="#1b5e20"/>
      <circle cx="30" cy="38" r="2" fill="#1b5e20"/>
      <circle cx="38" cy="40" r="2" fill="#1b5e20"/>
    </svg>
  );
  // cherry
  return (
    <svg width={s} height={s} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gch" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#ef9a9a"/>
          <stop offset="50%" stopColor="#e53935"/>
          <stop offset="100%" stopColor="#b71c1c"/>
        </linearGradient>
      </defs>
      {/* Stems */}
      <path d="M20 42 C20 30 30 26 30 18" stroke="#4caf50" strokeWidth="2" fill="none"/>
      <path d="M40 42 C40 30 30 26 30 18" stroke="#4caf50" strokeWidth="2" fill="none"/>
      <path d="M28 18 C24 12 20 10 18 12" stroke="#4caf50" strokeWidth="2" fill="none"/>
      {/* Left cherry */}
      <circle cx="18" cy="44" r="10" fill="url(#gch)" stroke="#b71c1c" strokeWidth="1"/>
      <ellipse cx="14" cy="40" rx="3" ry="2" fill="rgba(255,255,255,0.3)" transform="rotate(-20,14,40)"/>
      {/* Right cherry */}
      <circle cx="42" cy="44" r="10" fill="url(#gch)" stroke="#b71c1c" strokeWidth="1"/>
      <ellipse cx="38" cy="40" rx="3" ry="2" fill="rgba(255,255,255,0.3)" transform="rotate(-20,38,40)"/>
    </svg>
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────
const BETS = [5, 8, 10, 20, 50, 100, 200, 500];
const SYMS: SlotSymbol[] = ["cherry","watermelon","orange","lemon","bell","double_dollar","seven"];
const PAYOUTS: Record<SlotSymbol, number> = {
  seven: 15, double_dollar: 10, bell: 5,
  watermelon: 4, orange: 2, lemon: 2, cherry: 2,
};
const LINES: [number,number,number][] = [[1,1,1],[0,0,0],[2,2,2],[0,1,2],[2,1,0]];
const INIT_SAFE: SlotSymbol[][] = [
  ["lemon","orange","watermelon"],
  ["seven","bell","cherry"],
  ["double_dollar","cherry","bell"],
];

const MUL_COLORS: Record<number, { text: string; border: string; bg: string; glow: string }> = {
  1: { text: "#94a3b8", border: "#475569",  bg: "rgba(71,85,105,0.18)",   glow: "rgba(71,85,105,0.35)"  },
  2: { text: "#34d399", border: "#059669",  bg: "rgba(5,150,105,0.22)",   glow: "rgba(52,211,153,0.45)" },
  3: { text: "#fbbf24", border: "#d97706",  bg: "rgba(217,119,6,0.22)",   glow: "rgba(251,191,36,0.5)"  },
  4: { text: "#c084fc", border: "#9333ea",  bg: "rgba(147,51,234,0.22)",  glow: "rgba(192,132,252,0.5)" },
  5: { text: "#fb923c", border: "#ea580c",  bg: "rgba(234,88,12,0.22)",   glow: "rgba(251,146,60,0.55)" },
};

function rnd() { return SYMS[Math.floor(Math.random() * SYMS.length)]!; }
function rndCol(): SlotSymbol[] { return [rnd(), rnd(), rnd()]; }

function winCells(wins: PaylineWin[]): Set<string> {
  const s = new Set<string>();
  for (const w of wins) {
    const l = LINES[w.line - 1];
    if (l) { s.add(`0-${l[0]}`); s.add(`1-${l[1]}`); s.add(`2-${l[2]}`); }
  }
  return s;
}

// ─── Multiplier reel (left column) ───────────────────────────────────────────
function MulReel({ value, spinning }: { value: number; spinning: boolean }) {
  const offsets = [-1, 0, 1];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 58 }}>
      {offsets.map((off) => {
        const v = value + off;
        const isMid = off === 0;
        const cfg = MUL_COLORS[Math.min(5, Math.max(1, v))] ?? MUL_COLORS[1]!;
        const valid = v >= 1 && v <= 5;
        return (
          <div key={off} style={{
            height: 72,
            borderRadius: 10,
            border: isMid ? `2px solid ${cfg.border}` : "1.5px solid rgba(255,255,255,0.05)",
            background: isMid
              ? `linear-gradient(145deg, ${cfg.bg}, rgba(0,0,0,0.45))`
              : "rgba(0,0,0,0.22)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: isMid
              ? `0 0 18px ${cfg.glow}, inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.3)`
              : "none",
            transition: spinning ? "none" : "all 0.35s cubic-bezier(0.22,1,0.36,1)",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* inner radial highlight */}
            {isMid && (
              <div style={{
                position: "absolute", inset: 0,
                background: `radial-gradient(ellipse at 40% 30%, rgba(255,255,255,0.12), transparent 65%)`,
                pointerEvents: "none",
              }}/>
            )}
            {valid && (
              <span style={{
                fontFamily: "Arial Black, Impact, sans-serif",
                fontSize: isMid ? 23 : 14,
                fontWeight: 900,
                color: isMid ? cfg.text : "rgba(255,255,255,0.12)",
                letterSpacing: "-0.5px",
                textShadow: isMid ? `0 0 14px ${cfg.glow}, 0 1px 2px rgba(0,0,0,0.6)` : "none",
                position: "relative",
              }}>{v}x</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Single reel column ───────────────────────────────────────────────────────
function ReelCol({ symbols, spinning, winSet, colIdx }: {
  symbols: SlotSymbol[]; spinning: boolean; winSet: Set<string>; colIdx: number;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
      {symbols.map((sym, row) => {
        const key = `${colIdx}-${row}`;
        const isWin = !spinning && winSet.has(key);
        return (
          <div key={row} style={{
            height: 72,
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 8,
            background: isWin
              ? "rgba(255,220,50,0.12)"
              : "rgba(0,0,0,0.2)",
            border: isWin
              ? "1.5px solid rgba(255,220,50,0.5)"
              : "1px solid rgba(255,255,255,0.07)",
            boxShadow: isWin ? "0 0 16px rgba(255,220,50,0.25)" : "none",
            transition: "all 0.3s",
            position: "relative",
            overflow: "hidden",
          }}>
            {isWin && (
              <div style={{
                position: "absolute", inset: 0,
                background: "radial-gradient(circle at center, rgba(255,220,50,0.15) 0%, transparent 70%)",
                animation: "pulse 1s ease-in-out infinite",
              }}/>
            )}
            <div style={{ position: "relative", filter: isWin ? "drop-shadow(0 0 8px rgba(255,220,50,0.8))" : "none" }}>
              <SymbolSvg sym={sym} size={54} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Hexagon button ───────────────────────────────────────────────────────────
function HexBtn({
  children, onClick, disabled, color = "linear-gradient(145deg,#1e3a2a,#0f2018)", border = "#2d6a42", size = 72,
}: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  color?: string; border?: string; size?: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: size, height: size,
        clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
        background: disabled ? "linear-gradient(145deg,#161e16,#0d140d)" : color,
        border: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        position: "relative",
        padding: 0,
        opacity: disabled ? 0.5 : 1,
        transition: "opacity 0.2s",
        outline: "none",
      }}
    >
      <div style={{
        position: "absolute", inset: 0,
        clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
        border: `2px solid ${disabled ? "#1e2e1e" : border}`,
        pointerEvents: "none",
        boxShadow: disabled ? "none" : `inset 0 1px 0 rgba(255,255,255,0.08)`,
      }}/>
      {children}
    </button>
  );
}

// ─── Gamble modal ─────────────────────────────────────────────────────────────
function GambleModal({ win, onGuess, onCollect, result, loading }: {
  win: number; onGuess: (g: "red" | "black") => void;
  onCollect: () => void;
  result: { won: boolean; actual: "red" | "black"; payout: number } | null;
  loading: boolean;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(2,6,23,0.92)",
      backdropFilter: "blur(12px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 300, padding: 24,
    }}>
      <div style={{
        background: "linear-gradient(145deg,#0f1829,#0a0e1a)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 28, padding: 32,
        width: "100%", maxWidth: 340,
        boxShadow: "0 40px 80px rgba(0,0,0,0.6)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>Double or Nothing</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#f59e0b", letterSpacing: "-1px" }}>{win.toFixed(2)}</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>ETB to gamble</div>
        </div>

        {/* Multiplier card visual */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28, flexDirection: "column", alignItems: "center", gap: 6 }}>
          {[{v:"1x",val:1,mid:false},{v:"2x",val:2,mid:true},{v:"5x",val:5,mid:false}].map(({v, val, mid}) => {
            const cfg = MUL_COLORS[val]!;
            return (
              <div key={v} style={{
                width: 100, height: 72, borderRadius: 12,
                background: mid
                  ? `linear-gradient(145deg, ${cfg.bg}, rgba(0,0,0,0.5))`
                  : "rgba(0,0,0,0.3)",
                border: mid ? `2px solid ${cfg.border}` : "1.5px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: mid ? `0 0 20px ${cfg.glow}` : "none",
              }}>
                <span style={{
                  fontFamily: "Arial Black, Impact, sans-serif",
                  fontSize: mid ? 28 : 20,
                  fontWeight: 900,
                  color: mid ? cfg.text : "rgba(255,255,255,0.15)",
                  textShadow: mid ? `0 0 16px ${cfg.glow}` : "none",
                }}>{v}</span>
              </div>
            );
          })}
        </div>

        {result ? (
          <>
            <div style={{
              padding: "14px 20px", borderRadius: 16, marginBottom: 20,
              background: result.won ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
              border: `1px solid ${result.won ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
              textAlign: "center", fontSize: 16, fontWeight: 800,
              color: result.won ? "#4ade80" : "#f87171",
            }}>
              {result.won ? `🎉 Won! +${result.payout.toFixed(2)} ETB` : `💥 Lost! It was ${result.actual}`}
            </div>
            <button onClick={onCollect} style={{
              width: "100%", padding: "14px", borderRadius: 14, border: "none",
              background: "linear-gradient(135deg,#f59e0b,#f97316)",
              color: "#000", fontSize: 15, fontWeight: 800, cursor: "pointer",
            }}>Collect & Continue</button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <button onClick={() => onGuess("red")} disabled={loading} style={{
                flex: 1, padding: "16px 0", borderRadius: 14, border: "none",
                background: "linear-gradient(135deg,#ef4444,#dc2626)",
                color: "#fff", fontSize: 15, fontWeight: 800,
                cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
                boxShadow: "0 4px 16px rgba(239,68,68,0.3)",
              }}>🔴 RED</button>
              <button onClick={() => onGuess("black")} disabled={loading} style={{
                flex: 1, padding: "16px 0", borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "linear-gradient(135deg,#374151,#1f2937)",
                color: "#fff", fontSize: 15, fontWeight: 800,
                cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
              }}>⚫ BLACK</button>
            </div>
            <button onClick={onCollect} style={{
              width: "100%", padding: "12px", borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.07)",
              background: "transparent", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Take {win.toFixed(2)} ETB &amp; skip</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Rules / Paytable screen ──────────────────────────────────────────────────
function RulesScreen({ bet, onClose }: { bet: number; onClose: () => void }) {
  const PAYTABLE: { sym: SlotSymbol; payout: number }[] = [
    { sym: "seven",         payout: 15 },
    { sym: "double_dollar", payout: 10 },
    { sym: "bell",          payout:  5 },
    { sym: "watermelon",    payout:  4 },
    { sym: "orange",        payout:  2 },
    { sym: "lemon",         payout:  2 },
    { sym: "cherry",        payout:  2 },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "#060e0a",
      overflowY: "auto",
      display: "flex", flexDirection: "column",
    }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <button onClick={onClose} style={{
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
          color: "#fff", borderRadius: 10, padding: "8px 18px",
          fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}>Exit</button>
        <button onClick={onClose} style={{
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
          color: "#fff", borderRadius: 10, padding: "8px 18px",
          fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}>Close</button>
      </div>

      <div style={{ padding: "24px 20px 40px" }}>
        {/* Title */}
        <div style={{
          fontSize: 13, fontWeight: 800, color: "#f5c518",
          textAlign: "center", marginBottom: 24, letterSpacing: "0.04em",
        }}>
          All Symbol wins are in ETB
        </div>

        {/* Bet selector display */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 28 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(0,0,0,0.4)", border: "2px solid #1e7a3a",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#22c55e", fontSize: 22, fontWeight: 900,
          }}>−</div>
          <div style={{
            padding: "10px 32px", borderRadius: 12,
            background: "linear-gradient(145deg, #1e2d3d, #0f1a28)",
            border: "1px solid rgba(255,255,255,0.1)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{bet}</div>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginTop: 2 }}>ETB</div>
          </div>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(0,0,0,0.4)", border: "2px solid #1e7a3a",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#22c55e", fontSize: 22, fontWeight: 900,
          }}>+</div>
        </div>

        {/* Paytable — top symbol (77) centered */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 16, padding: "18px 32px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          }}>
            <SymbolSvg sym="seven" size={72} />
            <span style={{ fontSize: 20, fontWeight: 900, color: "#fff" }}>
              {(bet * PAYOUTS["seven"]).toFixed(2)}
            </span>
          </div>
        </div>

        {/* 2-column grid for rest */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {(["double_dollar","bell","watermelon","lemon","orange","cherry"] as SlotSymbol[]).map((sym) => (
            <div key={sym} style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16, padding: "18px 12px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            }}>
              {sym === "double_dollar" || sym === "bell" ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <SymbolSvg sym={sym} size={60} />
                  <SymbolSvg sym={sym} size={60} />
                </div>
              ) : (
                <div style={{ display: "flex", gap: 2 }}>
                  <SymbolSvg sym={sym} size={48} />
                  <SymbolSvg sym={sym} size={48} />
                  <SymbolSvg sym={sym} size={48} />
                </div>
              )}
              <span style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>
                {(bet * PAYOUTS[sym]).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        {/* Multiplier reel section */}
        <div style={{ marginTop: 36 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#e91e8c", marginBottom: 8, letterSpacing: "0.05em" }}>
            ✦ MULTIPLIER REEL
          </div>
          <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, marginBottom: 20 }}>
            Besides these standard rules, the game also includes the X Multiplier, which can appear on the left side reel. With five possible multipliers (1x, 2x, 3x, 4x, 5x) your wins will be multiplied for even greater rewards.
          </div>
          {/* Multiplier reel illustration */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{
              border: "2px solid #c9a84c", borderRadius: 14, overflow: "hidden",
              display: "inline-flex", flexDirection: "column",
            }}>
              {([
                { v: "1x", val: 1, mid: false },
                { v: "2x", val: 2, mid: true  },
              ] as const).map(({ v, val, mid }) => {
                const cfg = MUL_COLORS[val]!;
                return (
                  <div key={v} style={{
                    width: 100, height: 80,
                    background: mid
                      ? `linear-gradient(145deg, ${cfg.bg}, rgba(0,0,0,0.5))`
                      : "rgba(0,0,0,0.35)",
                    border: mid ? `2px solid ${cfg.border}` : "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: mid ? `0 0 18px ${cfg.glow}` : "none",
                  }}>
                    <span style={{
                      fontFamily: "Arial Black, Impact, sans-serif",
                      fontSize: mid ? 30 : 20,
                      fontWeight: 900,
                      color: mid ? cfg.text : "rgba(255,255,255,0.15)",
                      textShadow: mid ? `0 0 16px ${cfg.glow}` : "none",
                    }}>{v}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Gamble feature section */}
        <div style={{ marginTop: 36 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#e91e8c", marginBottom: 8, letterSpacing: "0.05em" }}>
            ✦ GAMBLE FEATURE
          </div>
          <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, marginBottom: 20 }}>
            After a winning spin, players can access the Gamble round by clicking the 2x button. The gamble screen appears with a card in the middle of the screen face down, indicating the gamble feature is active. Players must correctly guess the color of the card that will be revealed. If they guess correctly, their winnings will be doubled. However if they guess incorrectly, their winnings will be lost. At any point, players can use the "Take Win" button to collect and add them to their main balance.
          </div>
          {/* Gamble card illustration */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{
              border: "2px solid #c9a84c", borderRadius: 14, overflow: "hidden",
              display: "inline-flex", flexDirection: "column",
            }}>
              {([
                { v: "1x", val: 1, mid: false },
                { v: "2x", val: 2, mid: true  },
                { v: "5x", val: 5, mid: false },
              ] as const).map(({ v, val, mid }) => {
                const cfg = MUL_COLORS[val]!;
                return (
                  <div key={v} style={{
                    width: 100, height: 80,
                    background: mid
                      ? `linear-gradient(145deg, ${cfg.bg}, rgba(0,0,0,0.5))`
                      : "rgba(0,0,0,0.35)",
                    border: mid ? `2px solid ${cfg.border}` : "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: mid ? `0 0 18px ${cfg.glow}` : "none",
                  }}>
                    <span style={{
                      fontFamily: "Arial Black, Impact, sans-serif",
                      fontSize: mid ? 30 : 20,
                      fontWeight: 900,
                      color: mid ? cfg.text : "rgba(255,255,255,0.15)",
                      textShadow: mid ? `0 0 16px ${cfg.glow}` : "none",
                    }}>{v}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function SlotsScreen() {
  const [reels, setReels] = useState<SlotSymbol[][]>(INIT_SAFE);
  const [mul, setMul] = useState(1);
  const [spinning, setSpinning] = useState(false);
  const [betIdx, setBetIdx] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  const [wins, setWins] = useState<PaylineWin[]>([]);
  const [totalWin, setTotalWin] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [spinCount, setSpinCount] = useState(0);
  const [showRules, setShowRules] = useState(false);

  const navigate = useNavigate();
  const lock = useRef(false);
  const autoRef = useRef(false);
  const betRef = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showGamble, setShowGamble] = useState(false);
  const [gambleId, setGambleId] = useState<string | null>(null);
  const [depositModal, setDepositModal] = useState(false);
  const [gambleWin, setGambleWin] = useState(0);
  const [gambleResult, setGambleResult] = useState<{ won: boolean; actual: "red" | "black"; payout: number } | null>(null);
  const [gambleLoading, setGambleLoading] = useState(false);

  useEffect(() => { betRef.current = betIdx; }, [betIdx]);
  useEffect(() => { getProfile().then(p => setBalance(p.mainWallet.balance)).catch(() => {}); }, []);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function startScramble() {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setReels([rndCol(), rndCol(), rndCol()]);
      setMul(Math.ceil(Math.random() * 5));
    }, 90);
  }

  function stopScramble(r: SlotSymbol[][], m: number) {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    setReels(r); setMul(m);
  }

  const doSpin = useCallback(async (fromAuto = false): Promise<boolean> => {
    if (lock.current) return false;
    lock.current = true;
    setSpinning(true); setWins([]); setTotalWin(null); setError(null);
    startScramble();

    const bet = BETS[betRef.current]!;
    let res: SpinResponse;
    try {
      res = await spinSlots(bet);
    } catch (e: any) {
      stopScramble(INIT_SAFE, 1);
      lock.current = false; setSpinning(false);
      const msg: string = e?.message ?? '';
      const isInsufficientFunds = e?.status === 402
        || msg.includes('ቀሪ ሂሳብ')
        || msg.toLowerCase().includes('insufficient')
        || msg.toLowerCase().includes('deposit');
      if (isInsufficientFunds) {
        setDepositModal(true);
      } else {
        setError(msg || "Spin failed — check your balance");
      }
      autoRef.current = false; setAuto(false);
      return false;
    }

    await new Promise(r => setTimeout(r, 650));
    stopScramble(res.reels, res.multiplierReel);
    lock.current = false; setSpinning(false);
    setSpinCount(c => c + 1);

    await new Promise(r => setTimeout(r, 100));
    setWins(res.paylineWins);
    setTotalWin(res.totalWin);
    setBalance(res.balance);

    if (res.canGamble && !fromAuto) {
      setGambleId(res.spinId); setGambleWin(res.totalWin);
      setGambleResult(null); setShowGamble(true);
      return false;
    }
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    autoRef.current = auto;
    if (!auto) return;
    let alive = true;
    async function loop() {
      while (autoRef.current && alive) {
        const ok = await doSpin(true);
        if (!ok || !autoRef.current) break;
        await new Promise(r => setTimeout(r, 350));
      }
      if (alive) setAuto(false);
    }
    void loop();
    return () => { alive = false; autoRef.current = false; };
  }, [auto, doSpin]);

  const handleGamble = async (guess: "red" | "black") => {
    if (!gambleId) return;
    setGambleLoading(true);
    try {
      const r = await gambleSlots(gambleId, guess);
      setGambleResult({ won: r.won, actual: r.actual, payout: r.payout });
      setBalance(r.balance); setTotalWin(r.won ? r.payout : 0);
      if (!r.won) setWins([]);
    } catch (e: any) { setError(e?.message ?? "Gamble failed"); setShowGamble(false); }
    finally { setGambleLoading(false); }
  };

  const bet = BETS[betIdx]!;
  const ws = winCells(spinning ? [] : wins);
  const canGamble = !spinning && totalWin !== null && totalWin > 0 && !!gambleId && !showGamble;

  return (
    <div style={{
      minHeight: "100dvh",
      background: "radial-gradient(ellipse at 50% 0%, #0d2e1a 0%, #061008 50%, #020804 100%)",
      color: "#f8fafc",
      display: "flex", flexDirection: "column",
      maxWidth: 480, margin: "0 auto",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>

      {showRules && <RulesScreen bet={bet} onClose={() => setShowRules(false)} />}

      {/* ── Deposit required modal ── */}
      {depositModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div style={{
            background: 'linear-gradient(145deg,#0f1e2e,#0a1220)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 24, padding: '32px 24px', maxWidth: 320, width: '100%',
            textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💳</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 8 }}>
              ቀሪ ሂሳብ አይበቃም!
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6, lineHeight: 1.6 }}>
              Insufficient balance to spin.
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 24, lineHeight: 1.6 }}>
              Welcome bonus only works for <span style={{ color: '#f59e0b', fontWeight: 700 }}>Bingo</span>. To play Slots, please deposit to your main balance.
            </div>
            <button
              onClick={() => { setDepositModal(false); navigate('/wallet'); }}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 14, border: 'none',
                background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                color: '#0a0e1a', fontWeight: 900, fontSize: 15, cursor: 'pointer',
                marginBottom: 10,
              }}
            >Deposit Now</button>
            <button
              onClick={() => setDepositModal(false)}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
                color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* ── Top area: home icon + menu ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px 8px",
      }}>
        <div
          onClick={() => navigate('/')}
          style={{
          width: 42, height: 42, borderRadius: 12,
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, cursor: "pointer",
        }}>🏠</div>
        <div style={{ textAlign: "center" }}>
          {/* win banner */}
          {totalWin !== null && totalWin > 0 && !spinning && (
            <div style={{ animation: "winPop 0.4s cubic-bezier(0.22,1,0.36,1)" }}>
              <div style={{ fontSize: 11, color: "#c9a84c", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em" }}>WIN</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#ffd166", letterSpacing: "-1px", filter: "drop-shadow(0 0 12px rgba(245,158,11,0.7))" }}>
                +{totalWin.toFixed(2)} <span style={{ fontSize: 14, color: "#c9a84c" }}>ETB</span>
              </div>
            </div>
          )}
          {(!totalWin || totalWin === 0) && !spinning && spinCount > 0 && (
            <div style={{ fontSize: 12, color: "#334155", fontWeight: 600 }}>No win this round</div>
          )}
        </div>
        <div
          onClick={() => setShowRules(true)}
          style={{
          width: 42, height: 42, borderRadius: 12,
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", flexDirection: "column", gap: 4,
        }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ width: 18, height: 2, background: "#fff", borderRadius: 1 }}/>
          ))}
        </div>
      </div>

      {/* ── Labels row ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "4px 16px 8px",
      }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: "#c9a84c", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          MULTIPLIER
        </div>
        <div style={{ fontSize: 11, fontWeight: 900, color: "#c9a84c", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          5 LINES FIXED
        </div>
      </div>

      {/* ── Slot machine ── */}
      <div style={{ padding: "0 12px" }}>
        <div style={{
          background: "linear-gradient(160deg, #0e2e18 0%, #071810 40%, #030e08 100%)",
          border: "2px solid #1a4d28",
          borderRadius: 16,
          padding: "10px 10px 8px",
          boxShadow: "0 0 0 1px rgba(201,168,76,0.15), 0 20px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
          position: "relative",
        }}>
          {/* Gold top bar */}
          <div style={{
            position: "absolute", top: 0, left: "15%", right: "15%", height: 2,
            background: "linear-gradient(90deg, transparent, rgba(201,168,76,0.8), transparent)",
            borderRadius: 2,
          }}/>

          <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
            <MulReel value={mul} spinning={spinning} />
            {/* vertical divider */}
            <div style={{ width: 1, background: "rgba(201,168,76,0.15)", margin: "4px 0" }}/>
            {reels.map((col, ci) => (
              <ReelCol key={ci} symbols={col} spinning={spinning} winSet={ws} colIdx={ci} />
            ))}
          </div>

          {/* Stats bar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-around",
            marginTop: 8, padding: "6px 0",
            borderTop: "1px solid rgba(201,168,76,0.15)",
          }}>
            {[
              { icon: "💼", label: balance !== null ? balance.toFixed(2) : "—" },
              { icon: "🏆", label: totalWin !== null && totalWin > 0 ? totalWin.toFixed(2) : "0.00" },
              { icon: "🎖", label: "0.00" },
            ].map(({ icon, label }, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 14 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#e2e8f0" }}>{label}</div>
                  <div style={{ fontSize: 9, color: "#475569", fontWeight: 700 }}>ETB</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* error */}
      {error && (
        <div style={{ margin: "8px 12px 0", padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, fontSize: 12, color: "#f87171", fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Controls area ── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        justifyContent: "flex-end", padding: "16px 12px 0",
        gap: 14,
      }}>
        {/* Action buttons row: auto / 2x gamble / collect */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
          <HexBtn
            onClick={() => setAuto(a => !a)}
            disabled={spinning}
            color={auto ? "linear-gradient(145deg,#065f25,#043d18)" : "linear-gradient(145deg,#1e3a2a,#0f2018)"}
            border={auto ? "#22c55e" : "#2d6a42"}
            size={68}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, lineHeight: 1, color: auto ? "#4ade80" : "#6ee7a0" }}>↺</div>
              <div style={{ fontSize: 9, fontWeight: 800, color: auto ? "#4ade80" : "#4d9965", marginTop: 2, letterSpacing: "0.05em" }}>
                {auto ? "ON" : "AUTO"}
              </div>
            </div>
          </HexBtn>

          <HexBtn
            onClick={() => {
              if (canGamble) setShowGamble(true);
            }}
            disabled={!canGamble}
            color={canGamble ? "linear-gradient(145deg,#7c3a00,#4a2000)" : "linear-gradient(145deg,#1e2a1e,#0f180f)"}
            border={canGamble ? "#f59e0b" : "#2d4a2d"}
            size={68}
          >
            <span style={{ fontSize: 15, fontWeight: 900, color: canGamble ? "#fbbf24" : "#2d4a2d" }}>2x</span>
          </HexBtn>

          <HexBtn
            onClick={() => {
              if (totalWin && totalWin > 0) {
                setTotalWin(null); setWins([]); setGambleId(null);
              }
            }}
            disabled={!totalWin || totalWin === 0}
            color={totalWin && totalWin > 0 ? "linear-gradient(145deg,#1a4a6e,#0d2a45)" : "linear-gradient(145deg,#1e2a1e,#0f180f)"}
            border={totalWin && totalWin > 0 ? "#38bdf8" : "#2d4a2d"}
            size={68}
          >
            <div style={{ fontSize: 17, lineHeight: 1, color: totalWin && totalWin > 0 ? "#7dd3fc" : "#2d4a2d" }}>⬇</div>
          </HexBtn>
        </div>

        {/* Bet selector + big spin button */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 0,
          position: "relative",
        }}>
          {/* Prev bet */}
          <button
            onClick={() => setBetIdx(i => Math.max(0, i - 1))}
            disabled={spinning || betIdx === 0}
            style={{
              background: "linear-gradient(145deg, #0e4422, #072510)",
              border: "2px solid #1a6632",
              borderRadius: "14px 0 0 14px",
              color: spinning || betIdx === 0 ? "#1a3d20" : "#4ade80",
              padding: "14px 18px",
              fontSize: 13, fontWeight: 800,
              cursor: spinning || betIdx === 0 ? "default" : "pointer",
              minWidth: 64,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 11, color: "inherit", marginBottom: 2 }}>{BETS[betIdx - 1] ?? "—"}</div>
            <div style={{ fontSize: 10, color: spinning || betIdx === 0 ? "#1a3d20" : "#1e6e33", fontWeight: 600 }}>ETB</div>
          </button>

          {/* Center spin pentagon */}
          <div style={{ position: "relative", zIndex: 2 }}>
            <button
              onClick={() => { if (!lock.current && !auto) void doSpin(false); }}
              disabled={spinning || auto}
              style={{
                width: 110, height: 110,
                clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
                background: spinning || auto
                  ? "linear-gradient(145deg, #1a2a1a, #0f1a0f)"
                  : "linear-gradient(145deg, #c9507a, #8b1a3a)",
                border: "none",
                cursor: spinning || auto ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexDirection: "column",
                outline: "none", padding: 0,
                transition: "all 0.2s",
                boxShadow: spinning || auto ? "none" : "0 0 24px rgba(201,80,122,0.5)",
              }}
            >
              {/* outer gold ring */}
              <div style={{
                position: "absolute", inset: -3,
                clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
                background: "linear-gradient(145deg, #c9a84c, #7a6010)",
                zIndex: -1,
              }}/>
              <div style={{ textAlign: "center", position: "relative" }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: spinning || auto ? "#334155" : "#ffd166", letterSpacing: "0.02em" }}>
                  {spinning ? "..." : auto ? "AUTO" : bet.toString()}
                </div>
                <div style={{ fontSize: 11, color: spinning || auto ? "#2d3d2d" : "#e8c45a", fontWeight: 700 }}>
                  {spinning ? "" : "ETB"}
                </div>
                {!spinning && !auto && (
                  <div style={{ fontSize: 9, color: "#e8c45a80", marginTop: 2 }}>▼</div>
                )}
              </div>
            </button>
          </div>

          {/* Next bet */}
          <button
            onClick={() => setBetIdx(i => Math.min(BETS.length - 1, i + 1))}
            disabled={spinning || betIdx === BETS.length - 1}
            style={{
              background: "linear-gradient(145deg, #0e4422, #072510)",
              border: "2px solid #1a6632",
              borderRadius: "0 14px 14px 0",
              color: spinning || betIdx === BETS.length - 1 ? "#1a3d20" : "#4ade80",
              padding: "14px 18px",
              fontSize: 13, fontWeight: 800,
              cursor: spinning || betIdx === BETS.length - 1 ? "default" : "pointer",
              minWidth: 64,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 11, color: "inherit", marginBottom: 2 }}>{BETS[betIdx + 1] ?? "—"}</div>
            <div style={{ fontSize: 10, color: spinning || betIdx === BETS.length - 1 ? "#1a3d20" : "#1e6e33", fontWeight: 600 }}>ETB</div>
          </button>
        </div>
      </div>

      {/* ── Bottom nav ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-around",
        padding: "14px 24px 20px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        marginTop: 14,
      }}>
        <button onClick={() => setShowRules(true)} style={{
          background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 7,
          color: "#64748b", fontSize: 13, fontWeight: 700,
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: "50%",
            border: "2px solid #475569",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, color: "#475569", fontWeight: 900,
          }}>?</div>
          Rules
        </button>
        <button style={{
          background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#475569",
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" stroke="#475569" strokeWidth="2"/>
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="#475569" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {showGamble && (
        <GambleModal
          win={gambleWin}
          onGuess={handleGamble}
          onCollect={() => { setShowGamble(false); setGambleId(null); setGambleResult(null); }}
          result={gambleResult}
          loading={gambleLoading}
        />
      )}

      <style>{`
        @keyframes winPop {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.08); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
