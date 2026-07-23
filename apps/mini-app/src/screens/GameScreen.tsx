import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { initAuth } from '../lib/auth';
import { getRounds } from '../lib/api';
import type { RoundListItem } from '@beteseb/shared';

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 16,
  margin: '12px 16px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const stakeStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: '#4f46e5',
};

const metaStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#666',
  marginTop: 4,
};

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function GameScreen() {
  const navigate = useNavigate();
  const [rounds, setRounds] = useState<RoundListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        await initAuth();
        const data = await getRounds();
        setRounds(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load rounds';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>
        Loading games…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#e53e3e' }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          background: '#4f46e5',
          color: '#fff',
          padding: '20px 16px 16px',
          fontSize: 20,
          fontWeight: 700,
        }}
      >
        🎱 Beteseb Bingo
      </div>

      {rounds.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>
          No rounds available right now.
          <br />
          <span style={{ fontSize: 13, marginTop: 8, display: 'block' }}>
            Check back soon for upcoming games.
          </span>
        </div>
      ) : (
        <div>
          <div style={{ padding: '12px 16px 4px', fontSize: 13, color: '#888', fontWeight: 600 }}>
            AVAILABLE GAMES
          </div>
          {rounds.map((round) => (
            <div
              key={round.id}
              style={cardStyle}
              onClick={() => navigate(`/rounds/${round.id}/cartela`)}
            >
              <div>
                <div style={stakeStyle}>{round.stake} Birr</div>
                <div style={metaStyle}>
                  👥 {round.player_count}/{round.max_players} players
                </div>
                <div style={metaStyle}>
                  🏆 Prize: {round.derash} Birr
                </div>
                <div style={metaStyle}>
                  ⏰ Starts: {formatTime(round.start_time)}
                </div>
              </div>
              <div
                style={{
                  background: '#4f46e5',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '8px 16px',
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                Play →
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
