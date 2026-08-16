import React, { useEffect, useState, useCallback } from 'react';
import { getLeaderboard, type LeaderboardEntry, type LeaderboardResponse } from '../lib/api';

const C = {
  bg: '#0a0e1a',
  surface: '#0d1b2e',
  surface2: '#112240',
  border: 'rgba(255,255,255,0.07)',
  amber: '#f59e0b',
  amberDim: 'rgba(245,158,11,0.15)',
  text: '#f1f5f9',
  muted: '#64748b',
  dim: '#475569',
  green: '#34d399',
  gold: '#fbbf24',
  silver: '#94a3b8',
  bronze: '#cd7c4e',
};

const MEDAL = ['🥇', '🥈', '🥉'];

const RANK_COLORS: Record<number, { color: string; bg: string; glow: string }> = {
  1: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', glow: '0 0 24px rgba(251,191,36,0.25)' },
  2: { color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', glow: '0 0 16px rgba(148,163,184,0.15)' },
  3: { color: '#cd7c4e', bg: 'rgba(205,124,78,0.10)', glow: '0 0 16px rgba(205,124,78,0.15)' },
};

function Avatar({ username, rank }: { username: string; rank: number }) {
  const letter = username?.[0]?.toUpperCase() ?? '?';
  const style = RANK_COLORS[rank];
  const size = rank <= 3 ? 46 : 38;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 900, fontSize: rank <= 3 ? 18 : 15,
      background: style ? style.bg : 'rgba(255,255,255,0.05)',
      color: style ? style.color : C.muted,
      border: `1.5px solid ${style ? style.color + '55' : C.border}`,
      boxShadow: style ? style.glow : 'none',
    }}>
      {letter}
    </div>
  );
}

function TopThreeCard({ entry }: { entry: LeaderboardEntry }) {
  const style = RANK_COLORS[entry.rank]!;
  const isFirst = entry.rank === 1;
  return (
    <div style={{
      flex: isFirst ? '0 0 38%' : '0 0 28%',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 8,
      order: entry.rank === 2 ? 0 : entry.rank === 1 ? 1 : 2,
      marginTop: entry.rank === 1 ? 0 : 24,
    }}>
      {/* Crown for #1 */}
      {isFirst && (
        <div style={{ fontSize: 22, filter: 'drop-shadow(0 2px 8px rgba(251,191,36,0.5))' }}>👑</div>
      )}
      {/* Avatar */}
      <div style={{
        width: isFirst ? 72 : 56, height: isFirst ? 72 : 56,
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 900, fontSize: isFirst ? 26 : 20,
        background: style.bg,
        color: style.color,
        border: `2px solid ${style.color}88`,
        boxShadow: style.glow,
        position: 'relative',
      }}>
        {entry.username?.[0]?.toUpperCase() ?? '?'}
        {/* Medal badge */}
        <div style={{
          position: 'absolute', bottom: -6, right: -4,
          fontSize: isFirst ? 18 : 14,
          filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))',
        }}>
          {MEDAL[entry.rank - 1]}
        </div>
      </div>

      <div style={{ textAlign: 'center', maxWidth: isFirst ? 100 : 80 }}>
        <div style={{
          fontSize: isFirst ? 13 : 11, fontWeight: 800, color: style.color,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: '100%',
        }}>
          {entry.username}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
          {entry.wins} wins
        </div>
        <div style={{ fontSize: isFirst ? 13 : 11, fontWeight: 700, color: C.green, marginTop: 1 }}>
          {entry.totalPrize.toLocaleString()} ₿
        </div>
      </div>

      {entry.isCurrentPlayer && (
        <div style={{ fontSize: 10, color: C.amber, fontWeight: 700, background: C.amberDim, borderRadius: 6, padding: '2px 7px' }}>
          You
        </div>
      )}
    </div>
  );
}

function RankRow({ entry, idx }: { entry: LeaderboardEntry; idx: number }) {
  const style = RANK_COLORS[entry.rank];
  const isHighlighted = entry.isCurrentPlayer;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', borderRadius: 14,
        background: isHighlighted
          ? 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(251,191,36,0.06))'
          : idx % 2 === 0 ? C.surface : 'transparent',
        border: isHighlighted ? `1px solid rgba(245,158,11,0.3)` : `1px solid transparent`,
        marginBottom: 6,
        transition: 'background 0.2s',
      }}
    >
      {/* Rank number */}
      <div style={{
        width: 28, textAlign: 'center', flexShrink: 0,
        fontSize: 13, fontWeight: 900,
        color: style ? style.color : C.dim,
      }}>
        {entry.rank}
      </div>

      <Avatar username={entry.username} rank={entry.rank} />

      {/* Name + wins */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 14, fontWeight: 700, color: isHighlighted ? C.amber : C.text,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {entry.username}
          </span>
          {isHighlighted && (
            <span style={{ fontSize: 10, color: C.amber, background: C.amberDim, borderRadius: 5, padding: '1px 6px', fontWeight: 700, flexShrink: 0 }}>
              You
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
          {entry.wins} {entry.wins === 1 ? 'win' : 'wins'}
        </div>
      </div>

      {/* Prize */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.green }}>
          {entry.totalPrize.toLocaleString()}
        </div>
        <div style={{ fontSize: 10, color: C.dim }}>Birr</div>
      </div>
    </div>
  );
}

export default function RankScreen() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await getLeaderboard()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const top3 = data?.leaderboard.slice(0, 3) ?? [];
  const rest = data?.leaderboard.slice(3) ?? [];

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', paddingBottom: 90 }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .rank-shimmer {
          background: linear-gradient(90deg, #0d1b2e 25%, #112240 50%, #0d1b2e 75%);
          background-size: 200% auto;
          animation: shimmer 1.4s linear infinite;
          border-radius: 12px;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .rank-row-enter { animation: fadeInUp 0.35s ease forwards; }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        background: `linear-gradient(135deg, #0d2347, ${C.surface2})`,
        padding: '24px 20px 20px',
        borderBottom: `1px solid ${C.border}`,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative glow */}
        <div style={{
          position: 'absolute', top: -30, right: -30, width: 120, height: 120,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>
          Hall of Fame
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, color: C.text }}>
          🏆 Leaderboard
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
          Top 15 players by total wins
        </div>
      </div>

      {/* ── Loading skeleton ── */}
      {loading && (
        <div style={{ padding: '24px 16px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rank-shimmer" style={{ height: 62, marginBottom: 8, opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>😕</div>
          <div style={{ color: '#f87171', marginBottom: 16 }}>{error}</div>
          <button onClick={load} style={{
            padding: '10px 24px', borderRadius: 12, border: 'none',
            background: C.amber, color: '#0a0e1a', fontWeight: 800, cursor: 'pointer', fontSize: 14,
          }}>
            Retry
          </button>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !error && data?.leaderboard.length === 0 && (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: C.muted }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>No winners yet</div>
          <div style={{ fontSize: 13 }}>Be the first to win a game!</div>
        </div>
      )}

      {!loading && !error && data && data.leaderboard.length > 0 && (
        <>
          {/* ── Top 3 podium ── */}
          {top3.length >= 1 && (
            <div style={{
              padding: '28px 16px 20px',
              background: `linear-gradient(180deg, rgba(17,34,64,0.6) 0%, transparent 100%)`,
              borderBottom: `1px solid ${C.border}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 12 }}>
                {top3.map((entry) => (
                  <TopThreeCard key={entry.playerId} entry={entry} />
                ))}
              </div>

              {/* Podium base */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 12, marginTop: 16 }}>
                {[2, 1, 3].map((rank) => {
                  const heights: Record<number, number> = { 1: 44, 2: 32, 3: 24 };
                  const colors: Record<number, string> = {
                    1: 'rgba(251,191,36,0.2)', 2: 'rgba(148,163,184,0.15)', 3: 'rgba(205,124,78,0.12)',
                  };
                  return (
                    <div key={rank} style={{
                      flex: rank === 1 ? '0 0 38%' : '0 0 28%',
                      height: heights[rank], borderRadius: '6px 6px 0 0',
                      background: colors[rank],
                      border: `1px solid ${RANK_COLORS[rank]?.color ?? C.border}33`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: RANK_COLORS[rank]?.color ?? C.dim,
                    }}>
                      #{rank}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Ranks 4–15 ── */}
          {rest.length > 0 && (
            <div style={{ padding: '16px 14px 0' }}>
              <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, paddingLeft: 4 }}>
                Rankings
              </div>
              {rest.map((entry, i) => (
                <div key={entry.playerId} className="rank-row-enter" style={{ animationDelay: `${i * 40}ms` }}>
                  <RankRow entry={entry} idx={i} />
                </div>
              ))}
            </div>
          )}

          {/* ── Current player rank (if outside top 15) ── */}
          {data.currentPlayerRank && (
            <div style={{ margin: '16px 14px 0', padding: '14px 16px', borderRadius: 14, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Your Rank
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 22, fontWeight: 900, color: C.amber }}>#{data.currentPlayerRank.rank}</span>
                  <span style={{ fontSize: 13, color: C.muted, marginLeft: 8 }}>{data.currentPlayerRank.wins} wins</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.green }}>{data.currentPlayerRank.totalPrize.toLocaleString()} Birr</div>
                  <div style={{ fontSize: 11, color: C.dim }}>total prize</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
