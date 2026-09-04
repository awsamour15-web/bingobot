import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { socket } from '../lib/socket';
import {
  getKenoState, placeKenoBet, getKenoHistory,
  checkKenoAccess, getProfile,
} from '../lib/api';
import type { KenoState } from '../lib/api';
import type { KenoBettingOpenPayload, KenoNumberDrawnPayload, KenoRoundFinishedPayload } from '@fidel/shared';

import { KenoBettingStage } from '../components/keno/KenoBettingStage';
import { KenoDrawArena } from '../components/keno/KenoDrawArena';
import { KenoBetFeed } from '../components/keno/KenoBetFeed';
import { KenoHistoryTab } from '../components/keno/KenoHistoryTab';
import { KenoStatsTab } from '../components/keno/KenoStatsTab';
import { KenoQuickPickModal } from '../components/keno/KenoQuickPickModal';
import { KenoInfoModal } from '../components/keno/KenoInfoModal';
import type { BetFeedItem, HistoryRecord } from '../components/keno/types';

type NavTab = 'GAME' | 'HISTORY' | 'RESULTS' | 'STATISTICS';

function randomPick(count: number): number[] {
  const pool = Array.from({ length: 80 }, (_, i) => i + 1);
  const result: number[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]!);
  }
  return result.sort((a, b) => a - b);
}

const C = {
  bg: '#0d1117',
  topbar: 'rgba(10,15,20,0.98)',
  border: 'rgba(255,255,255,0.07)',
  green: '#22c55e',
  greenLight: '#4ade80',
  textWhite: '#e2e8f0',
  textDim: '#4a6a58',
  yellow: '#f5a623',
};

export default function KenoScreen() {
  const navigate = useNavigate();

  const [access, setAccess] = useState<'loading' | 'allowed' | 'denied'>('loading');
  const [phase, setPhase] = useState<KenoState['phase']>('idle');
  const [roundId, setRoundId] = useState<string | null>(null);
  const [bettingEndsAt, setBettingEndsAt] = useState<number>(0);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [currentBall, setCurrentBall] = useState<number | null>(null);
  const [bets, setBets] = useState<BetFeedItem[]>([]);
  const [myBet, setMyBet] = useState<KenoState['myBet']>(null);
  const [balance, setBalance] = useState<number>(0);

  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [betAmount, setBetAmount] = useState<number>(10);
  const [showDrawArena, setShowDrawArena] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<NavTab>('GAME');
  const [quickPickOpen, setQuickPickOpen] = useState<boolean>(false);
  const [infoOpen, setInfoOpen] = useState<boolean>(false);

  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [countdown, setCountdown] = useState<number>(0);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const myBetRef = useRef(myBet);
  myBetRef.current = myBet;

  // ── access ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    checkKenoAccess()
      .then(r => setAccess(r.allowed ? 'allowed' : 'denied'))
      .catch(() => setAccess('denied'));
  }, []);

  // ── profile / balance ──────────────────────────────────────────────────────
  useEffect(() => {
    if (access !== 'allowed') return;
    getProfile().then(p => setBalance((p.playWallet?.balance ?? p.mainWallet?.balance) ?? 0)).catch(() => {});
  }, [access]);

  // ── sync state ─────────────────────────────────────────────────────────────
  const syncState = useCallback(async () => {
    try {
      const s = await getKenoState();
      setPhase(s.phase);
      setRoundId(s.round?.id ?? null);
      setBettingEndsAt(s.round?.bettingEndsAt ? new Date(s.round.bettingEndsAt).getTime() : 0);
      setDrawnNumbers(s.round?.drawnNumbers ?? []);
      setBets(s.bets.map(b => ({ username: b.username, pickedCount: b.pickedCount, betAmount: b.betAmount, matched: b.matched, payout: b.payout })));
      setMyBet(s.myBet);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (access !== 'allowed') return;
    void syncState();
    const id = setInterval(syncState, 6000);
    return () => clearInterval(id);
  }, [access, syncState]);

  // ── history ────────────────────────────────────────────────────────────────
  const loadHistory = useCallback(() => {
    getKenoHistory().then(h => {
      setHistory(h.map(r => ({ id: r.id, drawnNumbers: r.drawnNumbers, finishedAt: (r as any).finishedAt ?? '', myBet: r.myBet ?? null })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (access === 'allowed') loadHistory();
  }, [access, loadHistory]);

  // ── countdown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'betting') { setCountdown(0); return; }
    const tick = () => setCountdown(Math.max(0, Math.ceil((bettingEndsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [phase, bettingEndsAt]);

  // ── socket ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (access !== 'allowed') return;

    const onBettingOpen = ({ roundId: rid, endsAt }: KenoBettingOpenPayload) => {
      setPhase('betting'); setRoundId(rid); setBettingEndsAt(endsAt);
      setDrawnNumbers([]); setCurrentBall(null); setMyBet(null); setBets([]);
      setShowDrawArena(false);
    };

    const onNumberDrawn = ({ drawnSoFar, number }: KenoNumberDrawnPayload) => {
      setPhase('drawing'); setShowDrawArena(true);
      setDrawnNumbers(drawnSoFar); setCurrentBall(number);
    };

    const onRoundFinished = ({ drawnNumbers: nums }: KenoRoundFinishedPayload) => {
      setPhase('finished'); setDrawnNumbers(nums); setCurrentBall(null);
      void syncState();
      loadHistory();
      if (myBetRef.current) {
        getKenoState().then(s => {
          if ((s.myBet?.payout ?? 0) > 0) showToast(`🎉 You won ${s.myBet!.payout} ETB!`);
        }).catch(() => {});
      }
    };

    socket.on('KENO_BETTING_OPEN', onBettingOpen);
    socket.on('KENO_NUMBER_DRAWN', onNumberDrawn);
    socket.on('KENO_ROUND_FINISHED', onRoundFinished);
    return () => {
      socket.off('KENO_BETTING_OPEN', onBettingOpen);
      socket.off('KENO_NUMBER_DRAWN', onNumberDrawn);
      socket.off('KENO_ROUND_FINISHED', onRoundFinished);
    };
  }, [access, syncState, loadHistory, showToast]);

  // ── bet ────────────────────────────────────────────────────────────────────
  const handlePlaceBet = async () => {
    const nums = selectedNumbers.length > 0 ? selectedNumbers : randomPick(5);
    if (balance < betAmount) { showToast('Insufficient balance'); return; }
    try {
      await placeKenoBet(betAmount, nums);
      setSelectedNumbers([]);
      showToast(`✅ Bet placed: ${nums.length} spots · ${betAmount} ETB`);
      getProfile().then(p => setBalance((p.playWallet?.balance ?? p.mainWallet?.balance) ?? 0)).catch(() => {});
      void syncState();
    } catch (err: any) { showToast(err?.message ?? 'Failed to place bet'); }
  };

  const handleToggle = (n: number) => {
    if (phase !== 'betting') return;
    setSelectedNumbers(prev => {
      if (prev.includes(n)) return prev.filter(x => x !== n);
      if (prev.length >= 10) { showToast('Max 10 numbers per ticket'); return prev; }
      return [...prev, n].sort((a, b) => a - b);
    });
  };

  // ── access loading/denied ──────────────────────────────────────────────────
  if (access === 'loading') {
    return <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDim, fontSize: 14 }}>Loading…</div>;
  }
  if (access === 'denied') {
    return (
      <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.textWhite }}>Keno Unavailable</div>
        <div style={{ fontSize: 13, color: C.textDim, textAlign: 'center' }}>Fast Keno is not available for your account yet.</div>
        <button onClick={() => navigate('/')} style={{ marginTop: 8, padding: '10px 24px', background: '#1ea855', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Go Home</button>
      </div>
    );
  }

  const tabs: { id: NavTab; label: string }[] = [
    { id: 'GAME', label: '▶ GAME' },
    { id: 'HISTORY', label: '↺ HISTORY' },
    { id: 'RESULTS', label: '✓ RESULTS' },
    { id: 'STATISTICS', label: '▦ STATS' },
  ];

  const phaseBadgeColor = phase === 'betting' ? C.yellow : phase === 'drawing' ? C.green : C.textDim;

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, color: C.textWhite, display: 'flex', flexDirection: 'column', fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 40, background: C.topbar, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
          <button onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C.textWhite, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            ← Back
          </button>
          <img src="/keno-logo.svg" alt="Fast Keno" style={{ height: 28, width: 'auto' }} />
          <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 999, padding: '3px 10px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: C.green }}>{balance.toFixed(2)} ETB</span>
          </div>
        </div>
        {roundId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px 8px', fontSize: 11 }}>
            <span style={{ color: C.textDim }}>Round:</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#94a3b8' }}>{roundId.slice(-8).toUpperCase()}</span>
            <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, color: phaseBadgeColor, border: `1px solid ${phaseBadgeColor}33`, background: `${phaseBadgeColor}15` }}>
              {phase.toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 10px 32px' }}>

        {/* Betting board or draw arena */}
        {(phase === 'betting' || phase === 'idle') && !showDrawArena ? (
          <KenoBettingStage
            countdown={countdown}
            selectedNumbers={selectedNumbers}
            onToggleNumber={handleToggle}
            betAmount={betAmount}
            onChangeBet={setBetAmount}
            onPlaceBet={handlePlaceBet}
            onOpenSettings={() => setQuickPickOpen(true)}
            onOpenInfo={() => setInfoOpen(true)}
            userBalance={balance}
          />
        ) : (
          <KenoDrawArena
            drawnNumbers={drawnNumbers}
            currentBall={currentBall}
            userPickedNumbers={myBet?.pickedNumbers ?? selectedNumbers}
            onGoToBetting={phase === 'betting' ? () => setShowDrawArena(false) : undefined}
          />
        )}

        {/* Nav tabs */}
        <div style={{ borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center' }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, padding: '8px 4px', background: 'none', border: 'none',
                  borderBottom: isActive ? `2px solid ${C.green}` : '2px solid transparent',
                  color: isActive ? C.green : C.textDim,
                  fontSize: 10, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em',
                  transition: 'color 0.15s',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === 'GAME' && <KenoBetFeed bets={bets} drawnNumbers={drawnNumbers} phase={phase} />}
        {activeTab === 'HISTORY' && (
          <KenoHistoryTab
            history={history}
            onReplayBet={(nums, bet) => {
              setSelectedNumbers(nums); setBetAmount(bet); setActiveTab('GAME');
              showToast(`Loaded ${nums.length} numbers on board`);
            }}
          />
        )}
        {activeTab === 'RESULTS' && <KenoHistoryTab history={history} />}
        {activeTab === 'STATISTICS' && (
          <KenoStatsTab
            history={history}
            selectedNumbers={selectedNumbers}
            onToggleNumber={n => { handleToggle(n); setActiveTab('GAME'); }}
          />
        )}
      </main>

      {/* Modals */}
      <KenoQuickPickModal
        isOpen={quickPickOpen}
        onClose={() => setQuickPickOpen(false)}
        onQuickPick={count => setSelectedNumbers(randomPick(count))}
        onSelectSpecific={nums => setSelectedNumbers(nums)}
        onClear={() => setSelectedNumbers([])}
      />
      <KenoInfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 600 }}
          >
            <div style={{ padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 700, background: '#111e22', border: '1px solid rgba(255,255,255,0.12)', color: C.textWhite, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>
              {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
