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

function BottomNav() {
  const location = useLocation();
  if (location.pathname.includes('/cartela') || location.pathname.includes('/game')) return null;

  const tabs = [
    { to: '/', icon: '🎯', label: 'Play' },
    { to: '/slots', icon: '🎰', label: 'Slots' },
    { to: '/history', icon: '🧾', label: 'History' },
    { to: '/wallet', icon: '💳', label: 'Wallet' },
    { to: '/profile', icon: '◎', label: 'Profile' },
  ];

  return (
    <>
      <style>{`
        .mini-app-bottom-nav {
          position: fixed;
          left: 50%;
          bottom: 10px;
          transform: translateX(-50%);
          width: min(92vw, 420px);
          z-index: 100;
          padding-bottom: max(12px, env(safe-area-inset-bottom));
          pointer-events: none;
        }

        .mini-app-bottom-nav-inner {
          display: flex;
          align-items: stretch;
          gap: 6px;
          padding: 7px 8px;
          border-radius: 22px;
          background: rgba(15, 23, 42, 0.82);
          border: 1px solid rgba(148, 163, 184, 0.12);
          box-shadow: 0 18px 40px rgba(2, 6, 23, 0.52), inset 0 1px 0 rgba(255,255,255,0.04);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          pointer-events: auto;
          overflow: hidden;
        }

        .mini-app-bottom-tab {
          position: relative;
          flex: 1;
          min-height: 58px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 8px 8px 7px;
          border-radius: 15px;
          text-decoration: none;
          color: #94a3b8;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.02em;
          line-height: 1;
          transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
          will-change: transform;
        }

        .mini-app-bottom-tab:hover {
          transform: translateY(-1px);
        }

        .mini-app-bottom-tab.active {
          color: #f8fafc;
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(251, 191, 36, 0.08));
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 20px rgba(245, 158, 11, 0.18);
          transform: translateY(-2px);
          animation: miniNavPulse 0.38s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .mini-app-bottom-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 9px;
          background: rgba(255,255,255,0.02);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
          font-size: 15px;
          line-height: 1;
          transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), background 0.2s ease, box-shadow 0.2s ease;
          transform-origin: center;
        }

        .mini-app-bottom-tab.active .mini-app-bottom-icon {
          background: rgba(255,255,255,0.06);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 12px rgba(245, 158, 11, 0.18);
          transform: scale(1.08) translateY(-1px);
        }

        .mini-app-bottom-label {
          opacity: 0.9;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .mini-app-bottom-tab.active .mini-app-bottom-label {
          opacity: 1;
          transform: translateY(-1px);
        }

        @keyframes miniNavPulse {
          0% {
            transform: translateY(0) scale(0.96);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 rgba(245, 158, 11, 0);
          }
          50% {
            transform: translateY(-2px) scale(1.02);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 24px rgba(245, 158, 11, 0.18);
          }
          100% {
            transform: translateY(-2px) scale(1);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 20px rgba(245, 158, 11, 0.16);
          }
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
  const isSubPage = location.pathname.includes('/cartela') || location.pathname.includes('/game');

  // Keep socket connected globally
  useEffect(() => {
    if (!socket.connected) socket.connect();
  }, []);

  return (
    <div style={{ paddingBottom: isSubPage ? 0 : 70, minHeight: '100dvh', background: '#0a0e1a', color: '#fff' }}>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<GameScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="/history/:roundId" element={<HistoryDetailScreen />} />
          <Route path="/wallet" element={<WalletScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/rank" element={<RankScreen />} />
          <Route path="/crash" element={<CrashScreen />} />
          <Route path="/slots" element={<SlotsScreen />} />
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
