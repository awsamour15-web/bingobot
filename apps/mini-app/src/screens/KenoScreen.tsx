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
  bg: '#080d10',
  topbar: 'rgba(6,10,14,0.98)',
  border: 'rgba(255,255,255,0.07)',
  green: '#22c55e',
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

  // Snapshot from first REST call — pre-populates tray without animation
  const [initialDrawnNumbers, setInitialDrawnNumbers] = useState<number[] | undefined>(undefined);
  const initializedRef = useRef(false);

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

  // ── balance ────────────────────────────────────────────────────────────────
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
      const nums = s.round?.drawnNumbers ?? [];
      setDrawnNumbers(nums);
      if (!initializedRef.current) {
        initializedRef.current = true;
        setInitialDrawnNumbers(nums);
        if (nums.length > 0) setShowDrawArena(true);
      }
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
      setPhase('betting'); setRoundId(rid); setBettingEndsAt(Date.now() + 59000);
      setDrawnNumbers([]); setCurrentBall(null); setMyBet(null); setBets([]);
      setInitialDrawnNumbers([]);
      initializedRef.current = false;
      setShowDrawArena(false);
    };
    const onNumberDrawn = ({ drawnSoFar, number }: KenoNumberDrawnPayload) => {
      setPhase('drawing'); setShowDrawArena(true);
      setDrawnNumbers(drawnSoFar); setCurrentBall(number);
    };
    const onRoundFinished = ({ drawnNumbers: nums }: KenoRoundFinishedPayload) => {
      setPhase('finished'); setDrawnNumbers(nums); setCurrentBall(null);
      void syncState(); loadHistory();
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

  // ── place bet ──────────────────────────────────────────────────────────────
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
      if (prev.length >= 10) { showToast('Max 10 numbers'); return prev; }
      return [...prev, n].sort((a, b) => a - b);
    });
  };

  // ── access states ──────────────────────────────────────────────────────────
  if (access === 'loading') {
    return (
      <div style={{ height: '100dvh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDim, fontSize: 14 }}>
        Loading…
      </div>
    );
  }
  if (access === 'denied') {
    return (
      <div style={{ height: '100dvh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.textWhite }}>Keno Unavailable</div>
        <div style={{ fontSize: 13, color: C.textDim, textAlign: 'center' }}>Fast Keno is not available for your account yet.</div>
        <button onClick={() => navigate('/')} style={{ marginTop: 8, padding: '10px 24px', background: '#1ea855', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Go Home</button>
      </div>
    );
  }

  const tabs: { id: NavTab; label: string }[] = [
    { id: 'GAME',       label: '▶ GAME'   },
    { id: 'HISTORY',    label: '↺ HIST'   },
    { id: 'RESULTS',    label: '✓ RES'    },
    { id: 'STATISTICS', label: '▦ STATS'  },
  ];

  const phaseBadgeColor = phase === 'betting' ? C.yellow : phase === 'drawing' ? C.green : C.textDim;
  const showArena = showDrawArena || phase === 'drawing' || phase === 'finished';

  return (
    // Full-screen fixed container with scrollable content
    <div style={{
      position: 'fixed', inset: 0,
      background: C.bg, color: C.textWhite,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', -apple-system, sans-serif",
      overflow: 'hidden',
    }}>

      {/* ── Header (fixed height) ── */}
      <div style={{ flexShrink: 0, background: C.topbar, borderBottom: `1px solid ${C.border}`, zIndex: 40 }}>
        {/* Top row: Logo, Balance/ID, Menu */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', gap: 10 }}>
          {/* Logo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, lineHeight: 0.9 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: '#e0e0e0', letterSpacing: '0.02em' }}>FAST</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: '#22c55e', letterSpacing: '0.02em' }}>KENO</span>
          </div>
          
          {/* Center: Balance, ID, Status */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '4px 10px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: C.green }}>{balance.toFixed(2)} ETB</span>
            {roundId && (
              <>
                <span style={{ color: C.textDim, fontSize: 9 }}>ID: {roundId.slice(-5).toUpperCase()}</span>
                <span style={{ padding: '1px 6px', borderRadius: 5, fontSize: 8, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span>✓</span>
                  {phase.toUpperCase()}
                </span>
              </>
            )}
          </div>

          {/* Right: Menu icons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: C.textWhite, fontSize: 14, cursor: 'pointer', padding: '2px' }}>☰</button>
            <button style={{ background: 'none', border: 'none', color: C.textWhite, fontSize: 14, cursor: 'pointer', padding: '2px' }}>💬</button>
          </div>
        </div>

        {/* Timer row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 12px', borderTop: `1px solid ${C.border}` }}>
          {phase === 'betting' ? (
            <span style={{
              fontFamily: 'monospace', fontSize: 18, fontWeight: 900, letterSpacing: '0.12em',
              color: countdown <= 10 ? '#ef4444' : '#22d3ee',
              textShadow: countdown <= 10 ? '0 0 10px rgba(239,68,68,0.6)' : '0 0 8px rgba(34,211,238,0.5)',
            }}>
              {String(Math.floor(countdown / 60)).padStart(2, '0')} : {String(countdown % 60).padStart(2, '0')}
            </span>
          ) : (
            <span style={{ color: C.textDim, fontSize: 10 }}>Waiting...</span>
          )}
        </div>
      </div>

      {/* ── Scrollable content area ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* ── Main content: Betting stage or Draw arena ── */}
        <div style={{ flexShrink: 0, padding: '8px 10px' }}>
          {showArena ? (
            <KenoDrawArena
              drawnNumbers={drawnNumbers}
              initialDrawnNumbers={initialDrawnNumbers}
              currentBall={currentBall}
              userPickedNumbers={myBet?.pickedNumbers ?? selectedNumbers}
              onGoToBetting={phase === 'betting' ? () => setShowDrawArena(false) : undefined}
            />
          ) : (
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
          )}
        </div>

        {/* ── Bottom section: tabs + content ── */}
        <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, padding: '0 10px' }}>
          {/* Tab bar */}
          <div style={{ background: C.topbar, borderBottom: `1px solid ${C.border}`, display: 'flex' }}>
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flex: 1, padding: '7px 2px', background: 'none', border: 'none',
                    borderBottom: isActive ? `2px solid ${C.green}` : '2px solid transparent',
                    color: isActive ? C.green : C.textDim,
                    fontSize: 10, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em',
                    transition: 'color 0.12s',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div style={{ padding: '8px 0 env(safe-area-inset-bottom, 12px)' }}>
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
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      <KenoQuickPickModal
        isOpen={quickPickOpen}
        onClose={() => setQuickPickOpen(false)}
        onQuickPick={count => setSelectedNumbers(randomPick(count))}
        onSelectSpecific={nums => setSelectedNumbers(nums)}
        onClear={() => setSelectedNumbers([])}
      />
      <KenoInfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} />

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 600, pointerEvents: 'none' }}
          >
            <div style={{ padding: '8px 18px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: '#0e1c22', border: `1px solid ${C.border}`, color: C.textWhite, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.7)' }}>
              {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
