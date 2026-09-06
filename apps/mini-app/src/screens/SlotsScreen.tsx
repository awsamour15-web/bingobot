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
  const preset = [3, 5, 1];
  const selected = Math.max(1, Math.min(5, value));

  return (
    <div style={{ display: "flex", flexDirection: "column", width: 78, gap: 10, marginRight: 8 }}>
      {preset.map((n) => {
        const active = n === 5 || (selected === 5 && n === 5) || (selected !== 5 && n === selected);
        return (
          <div key={n} style={{
            height: 86,
            borderRadius: 12,
            background: active
              ? "linear-gradient(180deg, rgba(48,162,95,0.95), rgba(18,92,52,0.92))"
              : "linear-gradient(180deg, rgba(0,0,0,0.12), rgba(6,26,18,0.36))",
            border: active ? "3px solid #ff5da8" : "2px solid rgba(255,255,255,0.12)",
            boxShadow: active
              ? "0 0 0 2px rgba(255,93,168,0.45), inset 0 0 24px rgba(255,255,255,0.08)"
              : "inset 0 1px 0 rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: active ? "#ff7cc6" : "#f4d89a",
            fontFamily: "Arial Black, Impact, sans-serif",
            fontSize: active ? 38 : 30,
            fontWeight: 900,
            letterSpacing: "-0.06em",
            transform: active ? "scale(1.02)" : "scale(1)",
            transition: spinning ? "none" : "all 0.25s ease",
            textShadow: active ? "0 0 18px rgba(255, 130, 196, 0.7)" : "0 0 12px rgba(255,210,102,0.3)",
          }}> 
            {n}x
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
  const [mainBalance, setMainBalance] = useState<number | null>(null);
  const [playBalance, setPlayBalance] = useState<number | null>(null);
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
  
  useEffect(() => { 
    getProfile().then(p => {
      setMainBalance(p.mainWallet.balance);
      setPlayBalance(p.playWallet.balance);
    }).catch(() => {});
  }, []);
  
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
    // Update balance from response if available, otherwise refetch
    if (res.balance !== undefined) {
      // Slots API returns combined balance, we need to refetch to get separate wallets
      getProfile().then(p => {
        setMainBalance(p.mainWallet.balance);
        setPlayBalance(p.playWallet.balance);
      }).catch(() => {});
    }

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
      // Refetch to get both wallet balances
      getProfile().then(p => {
        setMainBalance(p.mainWallet.balance);
        setPlayBalance(p.playWallet.balance);
      }).catch(() => {});
      setTotalWin(r.won ? r.payout : 0);
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
      background:
        "radial-gradient(circle at 50% 0%, rgba(27,100,72,0.60) 0%, rgba(6,31,26,0.95) 18%, rgba(2,7,8,1) 52%, rgba(0,0,0,1) 100%)",
      color: "#f8fafc",
      display: "flex", flexDirection: "column",
      maxWidth: 480, margin: "0 auto",
      fontFamily: "system-ui, -apple-system, sans-serif",
      overflow: "hidden",
      position: "relative",
    }}>
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: "radial-gradient(circle at 50% 12%, rgba(77,108,97,0.28) 0%, rgba(77,108,97,0.00) 38%), radial-gradient(circle at 10% 20%, rgba(32,128,92,0.22) 0%, rgba(32,128,92,0.00) 22%), radial-gradient(circle at 80% 18%, rgba(32,128,92,0.20) 0%, rgba(32,128,92,0.00) 18%)",
        pointerEvents: "none",
      }} />

      {showRules && <RulesScreen bet={bet} onClose={() => setShowRules(false)} />}

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

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100dvh" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px 8px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: "#ff5f7a", boxShadow: "0 0 0 2px rgba(255,255,255,0.1)" }} />
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", color: "#f2f4f5" }}>SMARTSOFT</div>
            <div style={{ fontSize: 10, color: "#8ea7a2", letterSpacing: "0.06em", textTransform: "uppercase" }}>GAMING</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#edf2f5", fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>
            <span>23 : 52 : 20</span>
          </div>
          <button onClick={() => setShowRules(true)} style={{
            width: 34, height: 34, borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
            <div style={{ width: 18, height: 14, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              {[0,1,2].map(i => <div key={i} style={{ height: 2, borderRadius: 999, background: "#f6f9f8" }} />)}
            </div>
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", paddingTop: 8 }}>
          <div style={{
            fontSize: 56, fontWeight: 900, letterSpacing: "-0.08em",
            lineHeight: 0.9,
            color: "#f7c747",
            textTransform: "uppercase",
            background: "linear-gradient(180deg, #f9e18d 0%, #e4b234 25%, #f8d367 50%, #b46600 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 3px 0 rgba(90,63,8,0.75)) drop-shadow(0 12px 18px rgba(255,199,70,0.28))",
          }}>
            MULTI HOT 5
          </div>
        </div>

        <div style={{ padding: "0 14px", marginTop: 8 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", color: "#ffc857",
            padding: "0 8px 6px",
          }}>
            <span style={{ color: "#f5d48a", textTransform: "uppercase" }}>Multiplier</span>
            <span style={{ color: "#ff6ab4", textTransform: "uppercase" }}>5 Lines fixed</span>
          </div>

          <div style={{
            background: "linear-gradient(180deg, rgba(8,35,20,0.88), rgba(3,16,10,0.86))",
            border: "2px solid rgba(182,142,62,0.42)",
            borderRadius: 16,
            padding: "8px 8px 12px",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 28px rgba(0,0,0,0.28)",
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <MulReel value={mul} spinning={spinning} />
              {reels.map((col, ci) => (
                <ReelCol key={ci} symbols={col} spinning={spinning} winSet={ws} colIdx={ci} />
              ))}
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-around",
              marginTop: 10,
              borderTop: "1px solid rgba(255,255,255,0.10)",
              paddingTop: 8,
            }}>
              {[
                { icon: "👜", label: "0.00", color: "#f7f1d8" },
                { icon: "🏆", label: "0.00", color: "#f7f1d8" },
                { icon: "◉", label: "0.00", color: "#f7f1d8" },
              ].map(({ icon, label, color }, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 86, justifyContent: "center" }}>
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 12, color, fontWeight: 900 }}>{label}</div>
                    <div style={{ fontSize: 9, color: "#d0d5d9", letterSpacing: "0.08em", textTransform: "uppercase" }}>ETB</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ margin: "8px 12px 0", padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, fontSize: 12, color: "#f87171", fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "18px 14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginBottom: 14 }}>
            <HexBtn onClick={() => setAuto(a => !a)} disabled={spinning} color={auto ? "linear-gradient(145deg,#0c4d2b,#0d2017)" : "linear-gradient(145deg,#1f1f1f,#0e0e0e)"} border={auto ? "#f0d57d" : "#d7b45c"} size={72}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, lineHeight: 1, color: "#f0d57d" }}>↺</div>
                <div style={{ fontSize: 9, fontWeight: 800, color: "#f4d781", marginTop: 2, letterSpacing: "0.05em" }}>{auto ? "ON" : "AUTO"}</div>
              </div>
            </HexBtn>

            <HexBtn
              onClick={() => { if (canGamble) setShowGamble(true); }}
              disabled={!canGamble}
              color={canGamble ? "linear-gradient(145deg,#0f683d,#0b4329)" : "linear-gradient(145deg,#1b2a1d,#0d180f)"}
              border={canGamble ? "#f0d57d" : "#2b3a2d"}
              size={72}
            >
              <span style={{ fontSize: 18, fontWeight: 900, color: "#f0d57d" }}>2x</span>
            </HexBtn>

            <HexBtn
              onClick={() => { if (totalWin && totalWin > 0) { setTotalWin(null); setWins([]); setGambleId(null); } }}
              disabled={!totalWin || totalWin === 0}
              color={totalWin && totalWin > 0 ? "linear-gradient(145deg,#0d2e47,#0b1f2f)" : "linear-gradient(145deg,#1b2a1d,#0d180f)"}
              border={totalWin && totalWin > 0 ? "#f0d57d" : "#2b3a2d"}
              size={72}
            >
              <div style={{ fontSize: 18, lineHeight: 1, color: "#f0d57d" }}>↓</div>
            </HexBtn>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
            <button
              onClick={() => setBetIdx(i => Math.max(0, i - 1))}
              disabled={spinning || betIdx === 0}
              style={{
                background: "linear-gradient(145deg, rgba(9,75,52,0.9), rgba(7,31,20,0.9))",
                border: "2px solid #2b8a5d",
                borderRadius: "18px 0 0 18px",
                color: spinning || betIdx === 0 ? "#1c5036" : "#7ef2b0",
                padding: "12px 18px",
                fontSize: 14, fontWeight: 800,
                cursor: spinning || betIdx === 0 ? "default" : "pointer",
                minWidth: 62,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 12, color: "inherit", marginBottom: 2 }}>{BETS[betIdx - 1] ?? "—"}</div>
              <div style={{ fontSize: 9, color: spinning || betIdx === 0 ? "#1c5036" : "#75cfa0", fontWeight: 700 }}>ETB</div>
            </button>

            <button
              onClick={() => { if (!lock.current && !auto) void doSpin(false); }}
              disabled={spinning || auto}
              style={{
                width: 130, height: 110,
                clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
                background: spinning || auto ? "linear-gradient(145deg, #223822, #0d1f15)" : "linear-gradient(145deg, #ff5e7f, #d52f69)",
                border: "3px solid #f6d77c",
                cursor: spinning || auto ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                outline: "none", padding: 0,
                position: "relative",
                zIndex: 1,
                boxShadow: spinning || auto ? "none" : "0 0 30px rgba(255,94,127,0.35)",
              }}
            >
              <div style={{ textAlign: "center", position: "relative" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: spinning || auto ? "#d5cfb5" : "#ffd770", letterSpacing: "0.02em" }}>
                  {spinning ? "..." : auto ? "AUTO" : bet.toString()}
                </div>
                <div style={{ fontSize: 11, color: spinning || auto ? "#d5cfb5" : "#f4cf6c", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {spinning ? "" : "ETB"}
                </div>
                {!spinning && !auto && <div style={{ fontSize: 10, color: "#fee097", marginTop: 2 }}>▼</div>}
              </div>
            </button>

            <button
              onClick={() => setBetIdx(i => Math.min(BETS.length - 1, i + 1))}
              disabled={spinning || betIdx === BETS.length - 1}
              style={{
                background: "linear-gradient(145deg, rgba(9,75,52,0.9), rgba(7,31,20,0.9))",
                border: "2px solid #2b8a5d",
                borderRadius: "0 18px 18px 0",
                color: spinning || betIdx === BETS.length - 1 ? "#1c5036" : "#7ef2b0",
                padding: "12px 18px",
                fontSize: 14, fontWeight: 800,
                cursor: spinning || betIdx === BETS.length - 1 ? "default" : "pointer",
                minWidth: 62,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 12, color: "inherit", marginBottom: 2 }}>{BETS[betIdx + 1] ?? "—"}</div>
              <div style={{ fontSize: 9, color: spinning || betIdx === BETS.length - 1 ? "#1c5036" : "#75cfa0", fontWeight: 700 }}>ETB</div>
            </button>
          </div>
        </div>
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
