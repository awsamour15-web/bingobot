import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { initAuth, getAgentJwt } from '../lib/auth';
import { getRounds } from '../lib/api';
import type { RoundListItem } from '@fidel/shared';

const ALLOWED_STAKES = [10, 20, 50];

export default function GameScreen() {
  const navigate = useNavigate();
  const [rounds, setRounds] = useState<RoundListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isAgent, setIsAgent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const [data] = await Promise.all([
          getRounds(),
          initAuth(),
        ]);
        if (!cancelled) setRounds(
          data
            .filter(r => ALLOWED_STAKES.includes(Number(r.stake)))
            .sort((a, b) => Number(a.stake) - Number(b.stake))
        );
        // Check if user is an agent
        if (!cancelled) {
          setIsAgent(!!getAgentJwt());
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [retryCount]);

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0e1a', color: '#fff' }}>

      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg, #0d1b2e 0%, #112240 100%)', padding: '18px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: 17, color: '#0a0e1a',
              boxShadow: '0 4px 16px rgba(245,158,11,0.5)',
            }}>FB</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: 0.3, color: '#f1f5f9' }}>Fidel Bingo</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>Ethiopia's #1 Bingo</div>
            </div>
          </div>
          <div style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 20, padding: '5px 12px', fontSize: 11, color: '#f87171', fontWeight: 700, letterSpacing: 0.5,
          }}>
            ● LIVE
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <div style={{ padding: '24px 20px 20px', background: 'linear-gradient(180deg, #112240 0%, #0a0e1a 100%)' }}>
        <div style={{ fontSize: 12, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
          Pick a stake, win big
        </div>
        <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.2 }}>
          Win Up To <span style={{ color: '#f59e0b' }}>40,000 Birr</span><br />
          <span style={{ fontSize: 16, fontWeight: 500, color: '#94a3b8' }}>Every game, every round</span>
        </div>
      </div>

      {/* ── Games list ── */}
      <div style={{ padding: '0 16px 24px' }}>
        <div style={{ fontSize: 11, color: '#475569', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14 }}>
          Active Rounds
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#475569', fontSize: 14 }}>
            Loading games…
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 16, padding: 20, textAlign: 'center' }}>
            <div style={{ color: '#f87171', marginBottom: 12, fontSize: 14 }}>{error}</div>
            <button onClick={() => { setError(null); setRetryCount(c => c + 1); }}
              style={{ background: '#f59e0b', border: 'none', borderRadius: 10, padding: '10px 24px', color: '#0a0e1a', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && rounds.length === 0 && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', color: '#475569' }}>
            No games right now — check back soon.
          </div>
        )}

        {!loading && !error && rounds.map((round) => {
          const isPending = round.status === 'pending';

          return (
            <button key={round.id}
              onClick={() => {
                sessionStorage.setItem('selectedStake', String(round.stake));
                if (isPending) {
                  sessionStorage.setItem('stakeSelectedForRound', round.id);
                  navigate(`/rounds/${round.id}/cartela`);
                } else {
                  sessionStorage.setItem('selectedRoundId', round.id);
                  sessionStorage.setItem('stakeSelectedForRound', round.id);
                  navigate(`/rounds/${round.id}/game`);
                }
              }}
              style={{
                display: 'block', width: '100%', marginBottom: 16,
                background: '#0d1b2e', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16, padding: '16px 18px', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: 26, fontWeight: 900, color: '#f1f5f9' }}>{round.stake}</span>
                  <span style={{ fontSize: 13, color: '#64748b', marginLeft: 5 }}>Birr / cartela</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#f59e0b' }}>{Math.round(round.derash)} Birr</div>
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>Prize Pool</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Stats strip ── */}
      <div style={{ margin: '0 16px 24px', background: '#0d1b2e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '18px 0', display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
        {[['45K+', 'Players'], ['60K+', 'Games Played'], ['24/7', 'Always Live']].map(([val, label]) => (
          <div key={label}>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#f59e0b' }}>{val}</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Agent Dashboard Button ── */}
      {isAgent && (
        <div style={{ margin: '0 16px 24px' }}>
          <button
            onClick={() => navigate('/agent/dashboard')}
            style={{
              display: 'block',
              width: '100%',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              borderRadius: 16,
              padding: '16px 20px',
              cursor: 'pointer',
              textAlign: 'left',
              boxShadow: '0 4px 16px rgba(16,185,129,0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'rgba(255,255,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                }}>
                  📊
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 2 }}>
                    Agent Dashboard
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>
                    View your referrals and earnings
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.8)' }}>→</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
