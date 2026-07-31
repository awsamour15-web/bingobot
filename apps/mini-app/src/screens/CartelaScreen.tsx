import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getRound, getCartelaAvailability, joinRound, getProfile } from '../lib/api';
import type { RoundDetail, CartelaAvailability } from '@beteseb/shared';

interface ProfileBalances {
  mainWallet: { balance: number };
  playWallet: { balance: number };
}

function useCountdown(targetTime: string): string {
  const [label, setLabel] = useState('');

  useEffect(() => {
    function update() {
      const ms = new Date(targetTime).getTime() - Date.now();
      if (ms <= 0) {
        setLabel('Starting…');
        return;
      }
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      if (h > 0) setLabel(`${h}h ${m % 60}m ${s % 60}s`);
      else if (m > 0) setLabel(`${m}m ${s % 60}s`);
      else setLabel(`${s}s`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetTime]);

  return label;
}

export default function CartelaScreen() {
  const { id: roundId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Guard: must come from stake selection on GameScreen
  useEffect(() => {
    const fromGame = sessionStorage.getItem('stakeSelectedForRound');
    if (!fromGame || fromGame !== roundId) {
      navigate('/', { replace: true });
    }
  }, [roundId, navigate]);

  const [round, setRound] = useState<RoundDetail | null>(null);
  const [availability, setAvailability] = useState<CartelaAvailability | null>(null);
  const [balances, setBalances] = useState<ProfileBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const countdown = useCountdown(round?.start_time ?? new Date().toISOString());

  useEffect(() => {
    if (!roundId) return;
    async function load() {
      try {
        const [r, avail, profile] = await Promise.all([
          getRound(roundId!),
          getCartelaAvailability(roundId!),
          getProfile(),
        ]);
        setRound(r);
        setAvailability(avail);
        setBalances(profile);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load cartela');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [roundId]);

  const handleSelect = useCallback(
    async (num: number) => {
      if (!roundId || joining) return;
      setJoining(true);
      setError(null);
      try {
        await joinRound(roundId, num);
        sessionStorage.setItem('selectedRoundId', roundId);
        navigate(`/rounds/${roundId}/game`);
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        if (e.code === 'INSUFFICIENT_BALANCE') {
          setError('Insufficient balance to join this round.');
        } else if (e.code === 'CARTELA_TAKEN') {
          setError('That cartela was just taken. Please pick another.');
          // Refresh availability
          getCartelaAvailability(roundId).then(setAvailability).catch(() => null);
        } else {
          setError(e.message ?? 'Failed to join round');
        }
        setJoining(false);
      }
    },
    [roundId, navigate, joining],
  );

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>Loading cartela board…</div>;
  }

  if (!round || !availability) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#e53e3e' }}>
        {error ?? 'Could not load round data'}
      </div>
    );
  }

  const takenSet = new Set(availability.taken);

  // All cartela numbers 1..272
  const allNumbers = Array.from({ length: 272 }, (_, i) => i + 1);

  return (
    <div>
      {/* Header */}
      <div style={{ background: '#4f46e5', color: '#fff', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{ cursor: 'pointer', fontSize: 18 }}
            onClick={() => navigate(-1)}
          >
            ←
          </span>
          <span style={{ fontWeight: 700, fontSize: 18 }}>Select Cartela</span>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 13 }}>
          <div>
            <div style={{ opacity: 0.8 }}>Stake</div>
            <div style={{ fontWeight: 700 }}>{round.stake} Birr</div>
          </div>
          <div>
            <div style={{ opacity: 0.8 }}>Prize</div>
            <div style={{ fontWeight: 700 }}>{round.derash} Birr</div>
          </div>
          <div>
            <div style={{ opacity: 0.8 }}>Players</div>
            <div style={{ fontWeight: 700 }}>
              {round.player_count}/{round.max_players}
            </div>
          </div>
          <div>
            <div style={{ opacity: 0.8 }}>Starts in</div>
            <div style={{ fontWeight: 700 }}>{countdown}</div>
          </div>
        </div>
      </div>

      {/* Balances */}
      {balances && (
        <div
          style={{
            background: '#fff',
            padding: '12px 16px',
            display: 'flex',
            gap: 24,
            fontSize: 13,
            borderBottom: '1px solid #eee',
          }}
        >
          <div>
            <span style={{ color: '#888' }}>Main: </span>
            <strong>{balances.mainWallet.balance.toFixed(2)} Birr</strong>
          </div>
          <div>
            <span style={{ color: '#888' }}>Play: </span>
            <strong>{balances.playWallet.balance.toFixed(2)} Birr</strong>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            background: '#fff3f3',
            color: '#e53e3e',
            padding: '10px 16px',
            fontSize: 14,
            borderBottom: '1px solid #fcc',
          }}
        >
          {error}
        </div>
      )}

      {/* Legend */}
      <div style={{ padding: '8px 16px', display: 'flex', gap: 16, fontSize: 12, color: '#666' }}>
        <span>
          <span
            style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              background: '#4f46e5',
              borderRadius: 3,
              marginRight: 4,
            }}
          />
          Available
        </span>
        <span>
          <span
            style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              background: '#ddd',
              borderRadius: 3,
              marginRight: 4,
            }}
          />
          Taken
        </span>
      </div>

      {/* Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: 6,
          padding: '8px 16px 24px',
        }}
      >
        {allNumbers.map((num) => {
          const taken = takenSet.has(num);
          return (
            <button
              key={num}
              disabled={taken || joining}
              onClick={() => !taken && handleSelect(num)}
              style={{
                padding: '10px 0',
                borderRadius: 8,
                border: 'none',
                background: taken ? '#e0e0e0' : '#4f46e5',
                color: taken ? '#999' : '#fff',
                fontWeight: 700,
                fontSize: 13,
                cursor: taken ? 'default' : 'pointer',
                opacity: joining ? 0.7 : 1,
              }}
            >
              {num}
            </button>
          );
        })}
      </div>
    </div>
  );
}
