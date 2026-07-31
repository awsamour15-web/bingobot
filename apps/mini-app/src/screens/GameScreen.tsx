import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { initAuth } from '../lib/auth';
import { getRounds } from '../lib/api';
import type { RoundListItem } from '@beteseb/shared';

const ALLOWED_STAKES = [10, 20, 50];

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

        // Keep only one round per stake (the earliest start_time), filtered to allowed stakes
        const byStake = new Map<number, RoundListItem>();
        for (const r of data) {
          const stake = Number(r.stake);
          if (!ALLOWED_STAKES.includes(stake)) continue;
          const existing = byStake.get(stake);
          if (!existing || new Date(r.start_time) < new Date(existing.start_time)) {
            byStake.set(stake, r);
          }
        }
        // Return in fixed order: 10, 20, 50
        setRounds(ALLOWED_STAKES.map((s) => byStake.get(s)).filter(Boolean) as RoundListItem[]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load rounds';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const stakeColors: Record<number, string> = {
    10: 'linear-gradient(135deg, #00c853, #00e676)',
    20: 'linear-gradient(135deg, #2979ff, #448aff)',
    50: 'linear-gradient(135deg, #ff6d00, #ff9100)',
    100: 'linear-gradient(135deg, #d500f9, #aa00ff)',
  };

  const getGradient = (stake: number) =>
    stakeColors[stake] ?? 'linear-gradient(135deg, #4f46e5, #7c3aed)';

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #1a1035 0%, #2d1b69 60%, #1a1035 100%)', color: '#fff', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #c9a227, #f5d06b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>FB</div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Fidel Bingo</span>
        </div>
        <button
          onClick={() => navigate('/history')}
          style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 20, padding: '6px 14px', color: '#fff', fontSize: 13, cursor: 'pointer' }}
        >
          ? Rules
        </button>
      </div>

      {/* Welcome */}
      <div style={{ textAlign: 'center', padding: '10px 20px 24px' }}>
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, lineHeight: 1.2 }}>
          Welcome to{' '}
          <span style={{ color: '#c9a227' }}>Fidel<br />Bingo</span>
        </h2>
      </div>

      {/* Stake Selection Box */}
      <div style={{ margin: '0 16px', background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(201,162,39,0.4)', borderRadius: 16, padding: '20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: '#c9a227', fontWeight: 700, fontSize: 15 }}>
          <span>▷</span> Choose Your Stake
        </div>

        {loading && (
          <div style={{ textAlign: 'center', color: '#aaa', padding: 20 }}>Loading games…</div>
        )}

        {error && (
          <div style={{ textAlign: 'center', color: '#ff6b6b', padding: 20 }}>{error}</div>
        )}

        {!loading && !error && rounds.length === 0 && (
          <div style={{ textAlign: 'center', color: '#aaa', padding: 20 }}>
            No games available right now.<br />
            <span style={{ fontSize: 12 }}>Check back soon!</span>
          </div>
        )}

        {!loading && !error && rounds.map((round) => {
          const isLobbyOpen = new Date(round.start_time) > new Date();
          return (
            <button
              key={round.id}
              onClick={() => {
                const now = new Date();
                const startTime = new Date(round.start_time);
                sessionStorage.setItem('stakeSelectedForRound', round.id);
                sessionStorage.setItem('selectedStake', String(round.stake));
                if (startTime > now) {
                  navigate(`/rounds/${round.id}/cartela`);
                } else {
                  sessionStorage.setItem('selectedRoundId', round.id);
                  navigate(`/rounds/${round.id}/game`);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '16px',
                marginBottom: 12,
                borderRadius: 12,
                border: 'none',
                background: getGradient(Number(round.stake)),
                color: '#fff',
                fontWeight: 800,
                fontSize: 18,
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}>▷</span>
                Play {round.stake} Birr
                <span style={{ fontSize: 12, opacity: 0.85, fontWeight: 400 }}>
                  ({round.player_count}/{round.max_players} players)
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 20,
                  background: isLobbyOpen ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.35)',
                  color: isLobbyOpen ? '#86efac' : '#fca5a5',
                  border: `1px solid ${isLobbyOpen ? '#22c55e' : '#ef4444'}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {isLobbyOpen ? '🟢 Lobby open' : '🔴 Live'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <div style={{ margin: '20px 16px 0', background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '24px 16px', display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>45,000+</div>
          <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>Active Players</div>
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.15)' }} />
        <div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>60,000+</div>
          <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>Games Played</div>
        </div>
      </div>
    </div>
  );
}
