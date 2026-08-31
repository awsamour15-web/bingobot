import React, { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';

// Lazy-load screens for faster initial load
const GameScreen = lazy(() => import('./screens/GameScreen'));
const CartelaScreen = lazy(() => import('./screens/CartelaScreen'));
const LiveGameScreen = lazy(() => import('./screens/LiveGameScreen'));
const HistoryScreen = lazy(() => import('./screens/HistoryScreen'));
const HistoryDetailScreen = lazy(() => import('./screens/HistoryDetailScreen'));
const WalletScreen = lazy(() => import('./screens/WalletScreen'));
const ProfileScreen = lazy(() => import('./screens/ProfileScreen'));
const AgentDashboardScreen = lazy(() => import('./screens/AgentDashboardScreen'));
const RankScreen = lazy(() => import('./screens/RankScreen'));
const CrashScreen = lazy(() => import('./screens/CrashScreen'));
const SlotsScreen = lazy(() => import('./screens/SlotsScreen'));
const KenoScreen = lazy(() => import('./screens/KenoScreen'));
const PlinkoScreen = lazy(() => import('./screens/PlinkoScreen'));
const MinesweeperScreen = lazy(() => import('./screens/MinesweeperScreen'));
const GamesLobbyScreen = lazy(() => import('./screens/GamesLobbyScreen'));

import { socket } from './lib/socket';

// Minimal blank fallback — no spinner, no emoji, just background
function LoadingScreen() {
  return <div style={{ minHeight: '100dvh', background: '#0a0e1a' }} />;
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
  override componentDidCatch(error: Error) {
    // Chunk load failures happen when a new deploy invalidates old hashed assets.
    // Force a hard reload so the browser fetches the fresh index.html and new chunks.
    const isChunkError =
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('Importing a module script failed') ||
      error.message.includes('Unable to preload CSS') ||
      error.name === 'ChunkLoadError';

    if (isChunkError) {
      window.location.reload();
    }
  }
  override render() {
    if (this.state.error) {
      const isChunkError =
        this.state.error.message.includes('Failed to fetch dynamically imported module') ||
        this.state.error.message.includes('Importing a module script failed') ||
        this.state.error.name === 'ChunkLoadError';

      if (isChunkError) {
        return <LoadingScreen />;
      }

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

const FULLSCREEN_ROUTES = ['/cartela', '/game', '/crash', '/slots', '/keno', '/plinko', '/minesweeper', '/bingo'];

function isFullscreenRoute(pathname: string) {
  return FULLSCREEN_ROUTES.some(r => pathname.includes(r));
}

function BottomNav() {
  const location = useLocation();
  if (isFullscreenRoute(location.pathname)) return null;

  const tabs = [
    { to: '/', icon: '🎮', label: 'Games' },
    { to: '/rank', icon: '🏆', label: 'Rank' },
    { to: '/history', icon: '🧾', label: 'History' },
    { to: '/wallet', icon: '💳', label: 'Wallet' },
    { to: '/profile', icon: '◎', label: 'Profile' },
  ];

  return (
    <>
      <style>{`
        .mini-app-bottom-nav {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 100;
          background: rgba(10, 14, 26, 0.96);
          border-top: 1px solid rgba(148, 163, 184, 0.1);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          padding-bottom: env(safe-area-inset-bottom);
        }

        .mini-app-bottom-nav-inner {
          display: flex;
          align-items: stretch;
          height: 52px;
        }

        .mini-app-bottom-tab {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          text-decoration: none;
          color: #64748b;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.02em;
          line-height: 1;
          transition: color 0.18s ease, background 0.18s ease;
        }

        .mini-app-bottom-tab.active {
          color: #f59e0b;
        }

        .mini-app-bottom-icon {
          font-size: 18px;
          line-height: 1;
          transition: transform 0.18s ease;
        }

        .mini-app-bottom-tab.active .mini-app-bottom-icon {
          transform: scale(1.12);
        }

        .mini-app-bottom-label {
          opacity: 0.85;
        }

        .mini-app-bottom-tab.active .mini-app-bottom-label {
          opacity: 1;
        }
      `}</style>

      <nav className="mini-app-bottom-nav" aria-label="Main navigation">
        <div className="mini-app-bottom-nav-inner">
          {tabs.map((tab) => {
            const isActive = tab.to === '/' ? location.pathname === '/' : location.pathname.startsWith(tab.to);

            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={`mini-app-bottom-tab${isActive ? ' active' : ''}`}
              >
                <span className="mini-app-bottom-icon" aria-hidden="true">{tab.icon}</span>
                <span className="mini-app-bottom-label">{tab.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

function AppInner() {
  const location = useLocation();
  const isSubPage = isFullscreenRoute(location.pathname);

  // Keep socket connected globally
  useEffect(() => {
    if (!socket.connected) socket.connect();
  }, []);

  return (
    <div style={{ paddingBottom: isSubPage ? 0 : 'calc(52px + env(safe-area-inset-bottom))', height: isSubPage ? '100dvh' : undefined, minHeight: isSubPage ? undefined : '100dvh', background: '#0a0e1a', color: '#fff', overflow: isSubPage ? 'hidden' : undefined }}>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<GamesLobbyScreen />} />
          <Route path="/bingo" element={<GameScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="/history/:roundId" element={<HistoryDetailScreen />} />
          <Route path="/wallet" element={<WalletScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/rank" element={<RankScreen />} />
          <Route path="/crash" element={<CrashScreen />} />
          <Route path="/slots" element={<SlotsScreen />} />
          <Route path="/keno" element={<KenoScreen />} />
          <Route path="/plinko" element={<PlinkoScreen />} />
          <Route path="/minesweeper" element={<MinesweeperScreen />} />
          <Route path="/agent/dashboard" element={<AgentDashboardScreen />} />
          <Route path="/rounds/:id/cartela" element={<CartelaScreen />} />
          <Route path="/rounds/:id/game" element={<LiveGameScreen />} />
        </Routes>
      </Suspense>
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