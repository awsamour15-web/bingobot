import React, { useEffect, useRef } from 'react';
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import GameScreen from './screens/GameScreen';
import CartelaScreen from './screens/CartelaScreen';
import LiveGameScreen from './screens/LiveGameScreen';
import HistoryScreen from './screens/HistoryScreen';
import HistoryDetailScreen from './screens/HistoryDetailScreen';
import WalletScreen from './screens/WalletScreen';
import ProfileScreen from './screens/ProfileScreen';
import { socket } from './lib/socket';
import { getSystemState } from './lib/api';
import { initAuth } from './lib/auth';

// ─── Shared types for SYSTEM_STATE ───────────────────────────────────────────

interface SystemState {
  phase: 'cartela' | 'live' | 'idle';
  roundId: string | null;
  stake: number | null;
}

// ─── Error boundary ───────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100dvh', background: '#0a0e1a', color: '#f87171',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: 24, fontFamily: 'monospace',
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>App Error</div>
          <div style={{ fontSize: 12, color: '#94a3b8', wordBreak: 'break-all', textAlign: 'center' }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => window.location.href = '/'}
            style={{ marginTop: 20, padding: '10px 24px', background: '#f59e0b', color: '#0a0e1a', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
          >
            Go Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Bottom navigation ───────────────────────────────────────────────────────

function BottomNav() {
  const location = useLocation();
  if (location.pathname.includes('/cartela') || location.pathname.includes('/game')) return null;

  const tabs = [
    { to: '/', icon: '🎮', label: 'Play' },
    { to: '/history', icon: '📋', label: 'History' },
    { to: '/wallet', icon: '💳', label: 'Wallet' },
    { to: '/profile', icon: '👤', label: 'Profile' },
  ];

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      display: 'flex',
      background: '#0d1b2e',
      borderTop: '1px solid rgba(255,255,255,0.07)',
      zIndex: 100,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {tabs.map((tab) => {
        const isActive = tab.to === '/' ? location.pathname === '/' : location.pathname.startsWith(tab.to);
        return (
          <NavLink key={tab.to} to={tab.to} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '10px 0 8px', textDecoration: 'none', gap: 3,
            color: isActive ? '#f59e0b' : '#475569',
            fontSize: 10, fontWeight: isActive ? 700 : 400,
            borderTop: isActive ? '2px solid #f59e0b' : '2px solid transparent',
          }}>
            <span style={{ fontSize: 20 }}>{tab.icon}</span>
            {tab.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

// ─── Global system-state sync hook ───────────────────────────────────────────
// Ensures every user is always on the correct screen based on the current game
// phase broadcast by the server. All users see the same screen at the same time.

function useSystemStateSync() {
  const navigate = useNavigate();
  const location = useLocation();
  // Track the last roundId we synced to so we don't re-navigate unnecessarily
  const lastSyncedRoundId = useRef<string | null>(null);
  const syncInProgress = useRef(false);

  function applyState(state: SystemState, force = false) {
    const { phase, roundId } = state;

    // Don't redirect if already on the correct screen (avoids loop)
    if (!force && roundId && roundId === lastSyncedRoundId.current) return;

    // Only redirect players who have already selected a stake (expressed intent to join).
    // Players on the home screen without a stake selection should not be auto-redirected.
    const selectedStake = sessionStorage.getItem('stakeSelectedForRound') || sessionStorage.getItem('selectedRoundId');
    const alreadyInGame = location.pathname.includes('/cartela') || location.pathname.includes('/game');
    if (!selectedStake && !alreadyInGame) return;

    if (phase === 'live' && roundId) {
      const target = `/rounds/${roundId}/game`;
      if (!location.pathname.startsWith(target)) {
        lastSyncedRoundId.current = roundId;
        navigate(target, { replace: true });
      }
    } else if (phase === 'cartela' && roundId) {
      const target = `/rounds/${roundId}/cartela`;
      if (!location.pathname.startsWith(target)) {
        lastSyncedRoundId.current = roundId;
        navigate(target, { replace: true });
      }
    }
    // phase === 'idle' → stay where you are (or let GameScreen handle it)
  }

  // On mount: fetch state via HTTP (works even before socket connects)
  useEffect(() => {
    if (syncInProgress.current) return;
    syncInProgress.current = true;

    async function syncOnOpen() {
      try {
        await initAuth();
        const state = await getSystemState();
        applyState(state, true);
      } catch {
        // Non-critical — socket event will handle it once connected
      } finally {
        syncInProgress.current = false;
      }
    }

    void syncOnOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live: listen for server-pushed state changes
  useEffect(() => {
    const onSystemState = (state: SystemState) => {
      applyState(state);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on('SYSTEM_STATE' as any, onSystemState);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.off('SYSTEM_STATE' as any, onSystemState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Ensure socket is connected so we receive SYSTEM_STATE events
  useEffect(() => {
    if (!socket.connected) socket.connect();
  }, []);
}

// ─── App ─────────────────────────────────────────────────────────────────────

function AppInner() {
  const location = useLocation();
  const isSubPage = location.pathname.includes('/cartela') || location.pathname.includes('/game');

  useSystemStateSync();

  return (
    <div style={{ paddingBottom: isSubPage ? 0 : 70, minHeight: '100dvh', background: '#0a0e1a', color: '#fff' }}>
      <Routes>
        <Route path="/" element={<GameScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/history/:roundId" element={<HistoryDetailScreen />} />
        <Route path="/wallet" element={<WalletScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/rounds/:id/cartela" element={<CartelaScreen />} />
        <Route path="/rounds/:id/game" element={<LiveGameScreen />} />
      </Routes>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
