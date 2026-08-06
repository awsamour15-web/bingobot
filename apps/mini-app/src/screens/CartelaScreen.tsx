import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getRound, getCartelaAvailability, joinRound, joinRoundBatch, getProfile } from '../lib/api';
import { initAuth } from '../lib/auth';
import { socket } from '../lib/socket';
import type { RoundDetail, CartelaAvailability, PlayerJoinedPayload, RoundStartedPayload, RoundVoidPayload, RoundCancelledPayload } from '../lib/api';

interface ProfileBalances {
  mainWallet: { balance: number };
  playWallet: { balance: number };
}

const TOTAL = 800;
const MAX_SELECT = 2;

function useServerCountdown(targetIso: string | null) {
  const [msLeft, setMsLeft] = useState(0);
  useEffect(() => {
    if (!targetIso) return;
    const tick = () => setMsLeft(Math.max(0, new Date(targetIso).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [targetIso]);
  const totalSec = Math.ceil(msLeft / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return {
    msLeft,
    label: msLeft <= 0 ? '0:00' : `${m}:${String(s).padStart(2, '0')}`,
    pct: targetIso ? Math.min(1, msLeft / 60_000) : 0,
  };
}

export default function CartelaScreen() {
  const { id: roundId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    const fromGame = sessionStorage.getItem('stakeSelectedForRound');
    if (!fromGame || fromGame !== roundId) navigate('/', { replace: true });
  }, [roundId, navigate]);

  const [round, setRound] = useState<RoundDetail | null>(null);
  const [availability, setAvailability] = useState<CartelaAvailability | null>(null);
  const [balances, setBalances] = useState<ProfileBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [picks, setPicks] = useState<number[]>([]);
  const picksRef = useRef<number[]>([]);
  useEffect(() => { picksRef.current = picks; }, [picks]);
  const [registeredNums, setRegisteredNums] = useState<number[]>([]); // cartelas confirmed with server
  const registeredNumsRef = useRef<number[]>([]);
  useEffect(() => { registeredNumsRef.current = registeredNums; }, [registeredNums]);
  const registered = registeredNums.length > 0;
  const [balanceAlert, setBalanceAlert] = useState<string | null>(null);
  const [joiningNums, setJoiningNums] = useState<Set<number>>(new Set());
  const joiningNumsRef = useRef<Set<number>>(new Set());
  const joining = joiningNums.size > 0;
  const [starting, setStarting] = useState(false); // overlay only for manual game start
  const joinedRef = useRef(false);
  const countdownStartedRef = useRef(false);
  const [manualTrigger, setManualTrigger] = useState(false);

  const { msLeft, label: countdownLabel, pct } = useServerCountdown(round?.start_time ?? null);

  useEffect(() => {
    if (!roundId) return;
    async function load() {
      try {
        await initAuth();
        const [r, avail, profile] = await Promise.all([
          getRound(roundId!),
          getCartelaAvailability(roundId!),
          getProfile().catch(() => null), // non-critical — don't block on profile failure
        ]);
        setRound(r);
        setAvailability(avail);
        if (profile) setBalances(profile);
        if (r.status === 'active' || r.status === 'completed') {
          countdownStartedRef.current = true;
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [roundId]);

  // Register a single new cartela with server immediately while round is still pending
  async function registerCartelas(allPicks: number[]) {
    if (allPicks.length === 0) return;
    const newCartela = allPicks[allPicks.length - 1]!;
    // Use ref so this always has the latest registered list regardless of closure
    if (registeredNumsRef.current.includes(newCartela)) return;
    if (joiningNumsRef.current.has(newCartela)) return; // already in-flight
    setJoiningNums(prev => new Set([...prev, newCartela]));
    joiningNumsRef.current.add(newCartela);
    setError(null);
    try {
      await joinRound(roundId!, newCartela);
      setRegisteredNums(prev => {
        const next = [...prev, newCartela];
        registeredNumsRef.current = next;
        return next;
      });
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'INSUFFICIENT_BALANCE' || e.message?.includes('ቀሪ ሂሳብ')) {
        setBalanceAlert(e.message ?? 'ቀሪ ሂሳብ አይበቃም!\nPlease deposit to continue.');
        setPicks(prev => prev.filter(n => n !== newCartela));
        picksRef.current = picksRef.current.filter(n => n !== newCartela);
      } else if (e.code === 'CARTELA_TAKEN' || e.message?.includes('already taken')) {
        setError(`Cartela ${newCartela} was just taken — please pick another`);
        setPicks(prev => prev.filter(n => n !== newCartela));
        picksRef.current = picksRef.current.filter(n => n !== newCartela);
      } else if (e.message?.includes('not pending') || e.message?.includes('void') || e.message?.includes('cancelled')) {
        sessionStorage.setItem('selectedRoundId', roundId!);
        navigate(`/rounds/${roundId}/game`, { replace: true });
        return;
      } else {
        setError(e.message ?? 'Failed to register cartela');
        setPicks(prev => prev.filter(n => n !== newCartela));
        picksRef.current = picksRef.current.filter(n => n !== newCartela);
      }
    } finally {
      setJoiningNums(prev => {
        const next = new Set(prev);
        next.delete(newCartela);
        return next;
      });
      joiningNumsRef.current.delete(newCartela);
    }
  }

  useEffect(() => {
    if (!roundId) return;
    if (!socket.connected) socket.connect();
    socket.emit('JOIN_ROUND', { roundId, token: localStorage.getItem('jwt') ?? '' });

    const onJoined = (p: PlayerJoinedPayload) => {
      setRound(r => r ? { ...r, player_count: p.playerCount } : r);
    };

    // Real-time cartela taken update
    const onCartelaTaken = (p: { cartelaNumbers: number[]; playerCount: number }) => {
      setRound(r => r ? { ...r, player_count: p.playerCount } : r);
      setAvailability(prev => {
        if (!prev) return prev;
        const takenSet = new Set([...prev.taken, ...p.cartelaNumbers]);
        return {
          taken: [...takenSet],
          available: prev.available.filter(n => !takenSet.has(n)),
        };
      });
      // Deselect our picks if just taken by someone else
      setPicks(prev => prev.filter(n => !p.cartelaNumbers.includes(n)));
    };

    // Round started — just navigate, cartelas were already registered
    const onStarted = (_p: RoundStartedPayload) => {
      if (joinedRef.current) return;
      joinedRef.current = true;
      sessionStorage.setItem('selectedRoundId', roundId!);
      navigate(`/rounds/${roundId}/game`, { replace: true });
    };

    // Round voided/cancelled — go back home
    const onEnded = () => {
      sessionStorage.removeItem('stakeSelectedForRound');
      navigate('/', { replace: true });
    };

    socket.on('PLAYER_JOINED', onJoined);
    socket.on('CARTELA_TAKEN', onCartelaTaken);
    socket.on('ROUND_STARTED', onStarted);
    socket.on('ROUND_VOID', onEnded as (p: RoundVoidPayload) => void);
    socket.on('ROUND_CANCELLED', onEnded as (p: RoundCancelledPayload) => void);

    // Poll every 3s as guaranteed fallback — catches missed socket events
    const poll = setInterval(() => {
      getCartelaAvailability(roundId!).then(setAvailability).catch(() => {});
    }, 3000);

    return () => {
      socket.off('PLAYER_JOINED', onJoined);
      socket.off('CARTELA_TAKEN', onCartelaTaken);
      socket.off('ROUND_STARTED', onStarted);
      socket.off('ROUND_VOID', onEnded as (p: RoundVoidPayload) => void);
      socket.off('ROUND_CANCELLED', onEnded as (p: RoundCancelledPayload) => void);
      clearInterval(poll);
      socket.emit('LEAVE_ROUND' as any, { roundId });
    };
  }, [roundId, navigate]);

  useEffect(() => { if (msLeft > 0) countdownStartedRef.current = true; }, [msLeft]);

  // Manual "Watch Game" or "Confirm 1 cartela" trigger
  useEffect(() => {
    if (!manualTrigger || joinedRef.current || starting) return;
    joinedRef.current = true;

    async function startGame() {
      setStarting(true);
      setError(null);
      try {
        const currentRound = await getRound(roundId!);
        if (currentRound.status === 'void' || currentRound.status === 'cancelled') {
          sessionStorage.removeItem('stakeSelectedForRound');
          navigate('/', { replace: true });
          return;
        }
        // If not yet registered and picks exist, try to join now
        if (picksRef.current.length > 0 && currentRound.status === 'pending') {
          for (const num of picksRef.current) {
            if (!registeredNumsRef.current.includes(num)) {
              await registerCartelas([...registeredNumsRef.current, num]);
            }
          }
        }
        sessionStorage.setItem('selectedRoundId', roundId!);
        navigate(`/rounds/${roundId}/game`, { replace: true });
      } catch {
        setStarting(false);
        joinedRef.current = false;
      }
    }
    void startGame();
  }, [manualTrigger, joining, roundId, navigate]);

  function togglePick(num: number) {
    if (registeredNumsRef.current.length >= MAX_SELECT) return; // already have max registered
    if (joiningNumsRef.current.has(num)) return; // this specific cartela is in-flight
    if (picksRef.current.includes(num)) {
      // Only allow deselect if not yet registered
      if (!registeredNumsRef.current.includes(num)) {
        const filtered = picksRef.current.filter(n => n !== num);
        picksRef.current = filtered;
        setPicks(filtered);
      }
      return;
    }
    if (round && balances) {
      const stake = Number(round.stake);
      const playBal = Number(balances.playWallet.balance);
      const mainBal = Number(balances.mainWallet.balance);
      // Use ref length so cost calculation is never stale
      const totalCost = stake * (picksRef.current.length + 1);
      if (playBal + mainBal < totalCost) {
        setBalanceAlert(`ቀሪ ቀሪ ሂሳብ አይበቃም!\nNeed ${totalCost} Birr — you have ${(playBal + mainBal).toFixed(0)} Birr.\nPlease deposit to continue.`);
        return;
      }
    }
    // FIX: use picksRef (always current) instead of stale `picks` state closure
    if (picksRef.current.length >= MAX_SELECT) return;
    const next = [...picksRef.current, num];
    picksRef.current = next;
    setPicks(next);
    // Register with server immediately
    void registerCartelas(next);
  }

  if (loading) return (
    <div style={{ height: '100dvh', background: '#0a0e1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 16 }}>
      Loading cartelas…
    </div>
  );

  if (!round || !availability) return (
    <div style={{ height: '100dvh', background: '#0a0e1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', padding: 24, textAlign: 'center' }}>
      {error ?? 'Could not load round data'}
    </div>
  );

  const takenSet = new Set(availability.taken);
  const allNumbers = Array.from({ length: TOTAL }, (_, i) => i + 1);
  const urgent = msLeft > 0 && msLeft < 10_000;
  const canPick = picks.length < MAX_SELECT;
  const stake = Number(round.stake);
  const playBal = balances ? Number(balances.playWallet.balance) : 0;
  const mainBal = balances ? Number(balances.mainWallet.balance) : 0;

  return (
    <div style={{ height: '100dvh', background: '#0a0e1a', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ background: '#0d1b2e', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '12px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span onClick={() => navigate(-1)} style={{ cursor: 'pointer', fontSize: 22, color: '#64748b' }}>←</span>
            <span style={{ fontWeight: 900, fontSize: 16, color: '#f1f5f9' }}>Pick Your Cartela</span>
          </div>
          <span style={{ fontSize: 12, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 20, padding: '3px 10px', fontWeight: 700 }}>
            {picks.length}/{MAX_SELECT}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#64748b' }}>
          <span>Stake <strong style={{ color: '#f1f5f9' }}>{round.stake} Birr</strong></span>
          <span>Prize <strong style={{ color: '#f59e0b' }}>{round.derash} Birr</strong></span>
          <span>Players <strong style={{ color: '#f1f5f9' }}>{round.player_count}</strong></span>
          {balances && <span>Balance <strong style={{ color: '#34d399' }}>{(playBal + mainBal).toFixed(0)} Birr</strong></span>}
        </div>
      </div>

      {/* ── Countdown ── */}
      <div style={{
        background: urgent ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.08)',
        borderBottom: `2px solid ${urgent ? '#ef4444' : '#f59e0b'}`,
        padding: '10px 20px', textAlign: 'center', flexShrink: 0,
      }}>
        <div style={{ fontSize: 10, color: '#475569', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>Game starts in</div>
        <div style={{ fontSize: 38, fontWeight: 900, color: urgent ? '#ef4444' : '#f59e0b', fontVariantNumeric: 'tabular-nums', letterSpacing: 2 }}>
          {countdownLabel}
        </div>
        <div style={{ marginTop: 6, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct * 100}%`, background: urgent ? '#ef4444' : '#f59e0b', transition: 'width 0.25s linear' }} />
        </div>
        {picks.length > 0 && registered
          ? <div style={{ marginTop: 6, fontSize: 12, color: '#34d399' }}>✅ Cartela {picks.join(' & ')} confirmed — waiting for game to start</div>
          : picks.length > 0
          ? <div style={{ marginTop: 6, fontSize: 12, color: '#f59e0b' }}>Cartela {picks.join(' & ')} selected</div>
          : <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>Select up to {MAX_SELECT} cartelas, or watch for free</div>
        }
        {/* Confirm button for 1-cartela selection */}
        {picks.length === 1 && !registered && !joining && (
          <button
            onClick={() => { picksRef.current = picks; void registerCartelas(picks); }}
            style={{ marginTop: 8, padding: '8px 24px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
          >
            Confirm Cartela {picks[0]}
          </button>
        )}
        {joining && picks.length > 0 && !registered && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#f59e0b' }}>Registering…</div>
        )}
        {!countdownStartedRef.current && msLeft === 0 && !joining && (
          <button onClick={() => { joinedRef.current = false; setManualTrigger(true); }}
            style={{ marginTop: 8, padding: '8px 24px', background: '#f59e0b', color: '#0a0e1a', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            {registered ? 'Go to Game' : picks.length > 0 ? 'Join Now' : 'Watch Game'}
          </button>
        )}      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', padding: '8px 16px', fontSize: 13, flexShrink: 0, borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* ── Legend ── */}
      <div style={{ padding: '6px 12px', display: 'flex', gap: 12, fontSize: 10, color: '#475569', flexShrink: 0, flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#1e3a5f', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Available</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#f59e0b', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Selected</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#7f1d1d', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Taken</span>
        {!canPick && <span style={{ color: '#f59e0b', fontWeight: 700 }}>Max {MAX_SELECT} reached</span>}
      </div>

      {/* ── Number grid ── */}
      <div style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)',
        gap: 4, padding: '0 10px 20px', alignContent: 'start',
      }}>
        {allNumbers.map(num => {
          const taken = takenSet.has(num);
          const isPicked = picks.includes(num);
          const isRegistered = registeredNums.includes(num);
          const disabled = starting || joiningNums.has(num) || taken || isRegistered || (!isPicked && picks.length >= MAX_SELECT);
          const bg = isPicked ? '#f59e0b' : taken ? '#7f1d1d' : '#1e3a5f';
          const color = isPicked ? '#0a0e1a' : taken ? '#fca5a5' : '#e2e8f0';

          return (
            <button key={num} disabled={disabled} onClick={() => togglePick(num)}
              style={{
                padding: '8px 0', borderRadius: 7,
                border: isPicked ? '2px solid #fbbf24' : taken ? '1px solid #ef444466' : '1px solid rgba(255,255,255,0.06)',
                background: bg, color, fontWeight: isPicked ? 900 : taken ? 700 : 600,
                fontSize: 11, cursor: disabled ? 'default' : 'pointer',
                opacity: taken ? 0.75 : 1,
                transform: isPicked ? 'scale(1.06)' : 'scale(1)',
                transition: 'transform 0.1s, background 0.15s',
                WebkitAppearance: 'none', appearance: 'none', outline: 'none',
                lineHeight: 1, boxSizing: 'border-box', userSelect: 'none',
              }}>
              {num}
            </button>
          );
        })}
      </div>

      {/* ── Joining overlay ── */}
      {starting && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(10,14,26,0.95)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 14, zIndex: 50,
        }}>
          <div style={{ fontSize: 48 }}>🎮</div>
          <div style={{ color: '#f59e0b', fontWeight: 900, fontSize: 20 }}>Starting game…</div>
          <div style={{ color: '#64748b', fontSize: 14 }}>
            {picks.length > 0 ? `Joining with cartela ${picks.join(' & ')}` : 'Joining as watcher'}
          </div>
        </div>
      )}

      {/* ── Insufficient balance modal ── */}
      {balanceAlert && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(10,14,26,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 60, padding: 24,
        }}
          onClick={() => setBalanceAlert(null)}
        >
          <div style={{
            background: '#1a1035', border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 16, padding: '28px 24px', maxWidth: 320, width: '100%',
            textAlign: 'center', boxShadow: '0 0 40px rgba(239,68,68,0.2)',
          }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>💳</div>
            <div style={{ fontWeight: 900, fontSize: 18, color: '#f87171', marginBottom: 8 }}>
              Insufficient Balance
            </div>
            {balanceAlert.split('\n').map((line, i) => (
              <div key={i} style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>{line}</div>
            ))}
            <button
              onClick={() => setBalanceAlert(null)}
              style={{
                marginTop: 20, width: '100%', padding: '12px',
                background: '#ef4444', color: '#fff', border: 'none',
                borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer',
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
