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
import { KenoRankTab } from '../components/keno/KenoRankTab';
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
  bg: '#0a0f14',
  topbar: 'rgba(8,12,18,0.98)',
  border: 'rgba(255,255,255,0.08)',
  green: '#1ee068',
  textWhite: '#f0f4f8',
  textDim: '#5a7a68',
  yellow: '#ffa500',
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
    { id: 'GAME', label: 'GAME' },
    { id: 'HISTORY', label: 'HISTORY' },
    { id: 'RESULTS', label: 'RESULTS' },
    { id: 'STATISTICS', label: 'STATISTICS' },
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
      <div style={{ flexShrink: 0, background: '#05070b', borderBottom: `1px solid ${C.border}`, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 8px', gap: 10 }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: '#f6f7fa', fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>←</span>
            <span style={{ fontSize: 18, lineHeight: 1 }}>Back</span>
          </button>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#dfe7ee', color: '#171b22', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>K</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: 180, padding: '8px 10px', borderRadius: 8, background: '#0d1217', border: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ color: '#f2f7fb', fontSize: 12, fontWeight: 700 }}>Br</span>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                {[0,1,2,3].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === 0 ? '#fff' : 'rgba(255,255,255,0.35)' }} />)}
              </div>
              <span style={{ color: '#f2f7fb', fontSize: 14 }}>⌄</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button style={{ background: 'none', border: 'none', color: '#f6f7fa', fontSize: 20, cursor: 'pointer', padding: 0 }}>⌄</button>
            <button style={{ background: 'none', border: 'none', color: '#f6f7fa', fontSize: 20, cursor: 'pointer', padding: 0 }}>⋮</button>
          </div>

          <button style={{ background: '#f0c84b', color: '#11151a', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 18, fontWeight: 900, cursor: 'pointer', boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.12)' }}>Deposit</button>
        </div>
      </div>

      <div style={{ flexShrink: 0, background: 'linear-gradient(180deg, #071013 0%, rgba(6, 18, 20, 0.96) 100%)', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 6px', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 0.7, marginTop: 2, transform: 'scaleY(0.96)' }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#dcf7e8', letterSpacing: '-0.09em', textTransform: 'uppercase' }}>FAST</span>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#67e9a6', letterSpacing: '-0.09em', textTransform: 'uppercase', textShadow: '0 2px 0 rgba(0,0,0,0.28)' }}>KENO</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ color: '#d9f8e4', fontWeight: 800, fontSize: 16, fontFamily: 'monospace', letterSpacing: '-0.02em' }}>{balance.toFixed(2)} ETB</span>
            {roundId && (
              <span style={{ color: '#d9f8e4', fontWeight: 700, fontSize: 11, opacity: 0.8 }}>ID: {roundId.slice(-5).toUpperCase()}</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px 10px', gap: 12 }}>
          <div style={{ flex: 1, height: 24, borderRadius: 999, border: '1px solid rgba(94,240,170,0.45)', background: 'linear-gradient(90deg, rgba(63, 221, 140, 0.18), rgba(63, 221, 140, 0.04))', overflow: 'hidden' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#dfeef0', fontSize: 13 }}>☰</button>
            <button style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#dfeef0', fontSize: 13 }}>◌</button>
          </div>
        </div>
      </div>

      {/* ── Scrollable content area ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* ── Main content: Betting stage or Draw arena ── */}
        <div style={{ flexShrink: 0, padding: '8px 10px' }}>
          <AnimatePresence mode="wait">
            {showArena ? (
              <motion.div key="arena" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <KenoDrawArena
                  drawnNumbers={drawnNumbers}
                  initialDrawnNumbers={initialDrawnNumbers}
                  currentBall={currentBall}
                  userPickedNumbers={myBet?.pickedNumbers ?? selectedNumbers}
                  onGoToBetting={phase === 'betting' ? () => setShowDrawArena(false) : undefined}
                />
              </motion.div>
            ) : (
              <motion.div key="betting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Bottom section: tabs + content ── */}
        <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, padding: '0' }}>
          {/* Tab bar - scrollable */}
          <div style={{ background: 'rgba(12,16,20,0.96)', borderBottom: `1px solid ${C.border}`, display: 'flex', overflowX: 'auto', overflowY: 'hidden', scrollBehavior: 'smooth', paddingLeft: 12 }}>
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flex: '0 0 auto', padding: '10px 12px 8px', background: 'none', border: 'none',
                    borderBottom: isActive ? `3px solid ${C.green}` : '3px solid transparent',
                    color: isActive ? '#8bf6b5' : '#7daea1',
                    fontSize: 17, fontWeight: 800, cursor: 'pointer', letterSpacing: '-0.05em',
                    transition: 'color 0.12s', whiteSpace: 'nowrap',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div style={{ padding: '8px 10px env(safe-area-inset-bottom, 12px)' }}>
            <AnimatePresence mode="wait">
              {activeTab === 'GAME' && (
                <motion.div key="game" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                  <KenoBetFeed bets={bets} drawnNumbers={drawnNumbers} phase={phase} />
                </motion.div>
              )}
              {activeTab === 'HISTORY' && (
                <motion.div key="history" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                  <KenoHistoryTab
                    history={history}
                    onReplayBet={(nums, bet) => {
                      setSelectedNumbers(nums); setBetAmount(bet); setActiveTab('GAME');
                      showToast(`Loaded ${nums.length} numbers on board`);
                    }}
                  />
                </motion.div>
              )}
              {activeTab === 'RESULTS' && (
                <motion.div key="results" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                  <KenoHistoryTab history={history} />
                </motion.div>
              )}
              {activeTab === 'STATISTICS' && (
                <motion.div key="stats" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                  <KenoStatsTab
                    history={history}
                    selectedNumbers={selectedNumbers}
                    onToggleNumber={n => { handleToggle(n); setActiveTab('GAME'); }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
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
