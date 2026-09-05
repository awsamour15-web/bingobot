import { useEffect, useState } from 'react';
import { getKenoLeaderboard } from '../../lib/api';
import type { LeaderboardEntry } from '../../lib/api';

const C = {
  textWhite: '#e2e8f0',
  textMid: '#8ab89a',
  textDim: '#4a6a58',
  green: '#22c55e',
  border: 'rgba(255,255,255,0.07)',
  cell: '#161d28',
};

interface Props {}

export function KenoRankTab({}: Props) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentPlayerRank, setCurrentPlayerRank] = useState<{ rank: number; wins: number; totalPrize: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getKenoLeaderboard()
      .then(data => {
        setLeaderboard(data.leaderboard);
        setCurrentPlayerRank(data.currentPlayerRank);
      })
      .catch(err => {
        console.error('Failed to load Keno leaderboard:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', color: C.textDim, fontSize: 13 }}>
        Loading rankings...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Table header */}
      <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 80px 80px', gap: 8, paddingBottom: 8, borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.textMid, paddingLeft: 4, paddingRight: 4 }}>
        <div>#</div>
        <div>Player</div>
        <div style={{ textAlign: 'right' }}>Wins</div>
        <div style={{ textAlign: 'right' }}>Prize</div>
      </div>

      {/* Leaderboard rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {leaderboard.map((entry, idx) => (
          <div
            key={entry.playerId}
            style={{
              display: 'grid',
              gridTemplateColumns: '30px 1fr 80px 80px',
              gap: 8,
              padding: '8px 4px',
              borderRadius: 6,
              background: entry.isCurrentPlayer ? 'rgba(34,197,94,0.1)' : C.cell,
              border: entry.isCurrentPlayer ? `1px solid rgba(34,197,94,0.3)` : `1px solid transparent`,
              fontSize: 11,
              color: entry.isCurrentPlayer ? C.green : C.textWhite,
              fontWeight: entry.isCurrentPlayer ? 700 : 500,
            }}
          >
            <div style={{ fontWeight: 800, color: entry.isCurrentPlayer ? C.green : C.textDim }}>{entry.rank}</div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.username}</div>
            <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>{entry.wins}</div>
            <div style={{ textAlign: 'right', fontFamily: 'monospace', color: entry.isCurrentPlayer ? C.green : C.textMid }}>
              {entry.totalPrize.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Current player rank info (if not in top) */}
      {currentPlayerRank && !leaderboard.some(e => e.isCurrentPlayer) && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'rgba(34,197,94,0.1)', border: `1px solid rgba(34,197,94,0.3)`, fontSize: 11 }}>
          <div style={{ color: C.green, fontWeight: 700, marginBottom: 4 }}>Your Rank: {currentPlayerRank.rank}</div>
          <div style={{ color: C.textMid, fontSize: 10 }}>
            Wins: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{currentPlayerRank.wins}</span> • Prize:{' '}
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{currentPlayerRank.totalPrize.toLocaleString()}</span>
          </div>
        </div>
      )}

      {leaderboard.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 12px', color: C.textDim, fontSize: 12 }}>
          No rankings available yet
        </div>
      )}
    </div>
  );
}
