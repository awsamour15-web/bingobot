import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Play, RotateCcw, BarChart2, CheckSquare } from 'lucide-react';
import { socket } from '../lib/socket';
import {
  getKenoState,
  placeKenoBet,
  getKenoHistory,
  checkKenoAccess,
  getProfile,
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

// ─── helpers ──────────────────────────────────────────────────────────────────

function randomPick(count: number): number[] {
  const pool = Array.from({ length: 80 }, (_, i) => i + 1);
  const result: number[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]!);
  }
  return result.sort((a, b) => a - b);
}

// ─── component ────────────────────────────────────────────────────────────────

export default function KenoScreen() {
  const navigate = useNavigate();

  // access gate
  const [access, setAccess] = useState<'loading' | 'allowed' | 'denied'>('loading');

  // game state
  const [phase, setPhase] = useState<KenoState['phase']>('idle');
  const [roundId, setRoundId] = useState<string | null>(null);
  const [bettingEndsAt, setBettingEndsAt] = useState<number>(0);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [currentBall, setCurrentBall] = useState<number | null>(null);
  const [bets, setBets] = useState<BetFeedItem[]>([]);
  const [myBet, setMyBet] = useState<KenoState['myBet']>(null);
  const [balance, setBalance] = useState<number>(0);

  // betting board
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [betAmount, setBetAmount] = useState<number>(10);
  const [showDrawArena, setShowDrawArena] = useState<boolean>(false);

  // tabs & modals
  const [activeTab, setActiveTab] = useState<NavTab>('GAME');
  const [quickPickOpen, setQuickPickOpen] = useState<boolean>(false);
  const [infoOpen, setInfoOpen] = useState<boolean>(false);

  // history
  const [history, setHistory] = useState<HistoryRecord[]>([]);

  // countdown seconds derived from bettingEndsAt
  const [countdown, setCountdown] = useState<number>(0);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // refs to avoid stale closures in socket handlers
  const myBetRef = useRef(myBet);
  myBetRef.current = myBet;
  const selectedRef = useRef(selectedNumbers);
  selectedRef.current = selectedNumbers;

  // ── access check ────────────────────────────────────────────────────────────
  useEffect(() => {
    checkKenoAccess()
      .then(r => setAccess(r.allowed ? 'allowed' : 'denied'))
      .catch(() => setAccess('denied'));
  }, []);

  // ── profile / balance ───────────────────────────────────────────────────────
  useEffect(() => {
    if (access !== 'allowed') return;
    getProfile().then(p => setBalance((p as any).balance ?? 0)).catch(() => {});
  }, [access]);

  // ── poll state on mount ─────────────────────────────────────────────────────
  const syncState = useCallback(async () => {
    try {
      const s = await getKenoState();
      setPhase(s.phase);
      setRoundId(s.round?.id ?? null);
      setBettingEndsAt(s.round?.bettingEndsAt ? new Date(s.round.bettingEndsAt).getTime() : 0);
      setDrawnNumbers(s.round?.drawnNumbers ?? []);
      setBets(s.bets.map(b => ({
        username: b.username,
        pickedCount: b.pickedCount,
        betAmount: b.betAmount,
        matched: b.matched,
        payout: b.payout,
      })));
      setMyBet(s.myBet);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (access !== 'allowed') return;
    void syncState();
    const id = setInterval(syncState, 6000);
    return () => clearInterval(id);
  }, [access, syncState]);

  // ── history ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (access !== 'allowed') return;
    getKenoHistory().then(h => {
      setHistory(h.map(r => ({
        id: r.id,
        drawnNumbers: r.drawnNumbers,
        finishedAt: (r as any).finishedAt ?? '',
        myBet: r.myBet ?? null,
      })));
    }).catch(() => {});
  }, [access]);

  // ── countdown tick ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'betting') { setCountdown(0); return; }
    const tick = () => setCountdown(Math.max(0, Math.ceil((bettingEndsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [phase, bettingEndsAt]);

  // ── socket events ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (access !== 'allowed') return;

    const onBettingOpen = ({ roundId: rid, endsAt }: KenoBettingOpenPayload) => {
      setPhase('betting');
      setRoundId(rid);
      setBettingEndsAt(endsAt);
      setDrawnNumbers([]);
      setCurrentBall(null);
      setMyBet(null);
      setBets([]);
      setShowDrawArena(false);
    };

    const onNumberDrawn = ({ drawnSoFar, number }: KenoNumberDrawnPayload) => {
      setPhase('drawing');
      setShowDrawArena(true);
      setDrawnNumbers(drawnSoFar);
      setCurrentBall(number);
    };

    const onRoundFinished = ({ drawnNumbers: nums }: KenoRoundFinishedPayload) => {
      setPhase('finished');
      setDrawnNumbers(nums);
      setCurrentBall(null);
      // refresh my bet result + history
      void syncState();
      getKenoHistory().then(h => {
        setHistory(h.map(r => ({
          id: r.id,
          drawnNumbers: r.drawnNumbers,
          finishedAt: (r as any).finishedAt ?? '',
          myBet: r.myBet ?? null,
        })));
      }).catch(() => {});
      // confetti if user won
      if (myBetRef.current) {
        void getKenoState().then(s => {
          if ((s.myBet?.payout ?? 0) > 0) {
            showToast(`🎉 You won ${s.myBet!.payout} ETB!`);
          }
        });
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
  }, [access, syncState, showToast]);

  // ── place bet ────────────────────────────────────────────────────────────────
  const handlePlaceBet = async () => {
    const nums = selectedNumbers.length > 0 ? selectedNumbers : randomPick(5);
    if (balance < betAmount) {
      showToast('Insufficient balance');
      return;
    }
    try {
      await placeKenoBet(betAmount, nums);
      setSelectedNumbers([]);
      showToast(`✅ Bet placed: ${nums.length} spots for ${betAmount} ETB`);
      // refresh balance
      getProfile().then(p => setBalance((p as any).balance ?? 0)).catch(() => {});
      void syncState();
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to place bet');
    }
  };

  // ── number toggle ────────────────────────────────────────────────────────────
  const handleToggle = (n: number) => {
    if (phase !== 'betting') return;
    setSelectedNumbers(prev => {
      if (prev.includes(n)) return prev.filter(x => x !== n);
      if (prev.length >= 10) { showToast('Max 10 numbers per ticket'); return prev; }
      return [...prev, n].sort((a, b) => a - b);
    });
  };

  // ── Loading / denied ─────────────────────────────────────────────────────────
  if (access === 'loading') {
    return <div style={{ minHeight: '100dvh', background: '#0a0e1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 14 }}>Loading…</div>;
  }

  if (access === 'denied') {
    return (
      <div style={{ minHeight: '100dvh', background: '#0a0e1a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>Keno Unavailable</div>
        <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center' }}>Fast Keno is not available for your account yet.</div>
        <button onClick={() => navigate('/')} style={{ marginTop: 8, padding: '10px 24px', background: '#1ea855', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Go Home</button>
      </div>
    );
  }

  const tabs: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: 'GAME', label: 'GAME', icon: <Play className="w-3 h-3 fill-current" /> },
    { id: 'HISTORY', label: 'HISTORY', icon: <RotateCcw className="w-3 h-3" /> },
    { id: 'RESULTS', label: 'RESULTS', icon: <CheckSquare className="w-3 h-3" /> },
    { id: 'STATISTICS', label: 'STATISTICS', icon: <BarChart2 className="w-3 h-3" /> },
  ];

  return (
    <div className="min-h-dvh bg-[#070e10] text-slate-100 flex flex-col select-none">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#070e10] border-b border-[#142327]">
        <div className="px-3 py-2 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-1 text-slate-100 hover:text-emerald-400 font-bold text-sm transition-colors py-1">
            <ArrowLeft className="w-4 h-4" /><span>Back</span>
          </button>
          <div className="flex items-center gap-1.5">
            <span className="font-black italic text-lg text-slate-100 uppercase">FAST</span>
            <span className="font-black italic text-lg text-[#1ee068] uppercase drop-shadow-[0_0_8px_rgba(30,224,104,0.4)]">KENO</span>
          </div>
          <div className="bg-[#0b1618] border border-[#183925] px-2.5 py-0.5 rounded-full">
            <span className="font-mono text-xs font-bold text-emerald-400">{balance.toFixed(2)} ETB</span>
          </div>
        </div>
        {/* round ID row */}
        {roundId && (
          <div className="px-3 pb-1.5 flex items-center gap-1.5 text-xs">
            <span className="text-slate-400">Round:</span>
            <span className="font-mono font-bold text-slate-200">{roundId.slice(-8).toUpperCase()}</span>
            <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${phase === 'betting' ? 'bg-amber-500/20 text-amber-400' : phase === 'drawing' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
              {phase.toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col gap-3 p-2 pb-8">
        {/* Betting stage or Draw arena */}
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
        <nav className="w-full border-b border-[#132327] pb-1 px-1">
          <div className="flex items-center justify-between">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 py-1.5 px-2 text-xs font-extrabold transition-colors relative cursor-pointer ${isActive ? 'text-[#1ee068]' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {tab.icon}<span>{tab.label}</span>
                  {isActive && <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-[#1ee068] shadow-[0_0_8px_#1ee068] rounded-full" />}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Tab content */}
        {activeTab === 'GAME' && (
          <KenoBetFeed bets={bets} drawnNumbers={drawnNumbers} phase={phase} />
        )}
        {activeTab === 'HISTORY' && (
          <KenoHistoryTab
            history={history}
            onReplayBet={(nums, bet) => {
              setSelectedNumbers(nums);
              setBetAmount(bet);
              setActiveTab('GAME');
              showToast(`Loaded ${nums.length} numbers on board`);
            }}
          />
        )}
        {activeTab === 'RESULTS' && (
          <KenoHistoryTab history={history} />
        )}
        {activeTab === 'STATISTICS' && (
          <KenoStatsTab
            history={history}
            selectedNumbers={selectedNumbers}
            onToggleNumber={(n) => {
              handleToggle(n);
              setActiveTab('GAME');
            }}
          />
        )}
      </main>

      {/* Quick pick modal */}
      <KenoQuickPickModal
        isOpen={quickPickOpen}
        onClose={() => setQuickPickOpen(false)}
        onQuickPick={count => setSelectedNumbers(randomPick(count))}
        onSelectSpecific={nums => setSelectedNumbers(nums)}
        onClear={() => setSelectedNumbers([])}
      />

      {/* Info / Rules modal */}
      <KenoInfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="px-4 py-2.5 rounded-full font-bold text-xs shadow-2xl bg-[#111e22] text-slate-100 border border-[#1f373d]">
              {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
