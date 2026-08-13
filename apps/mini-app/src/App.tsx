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

import { socket } from './lib/socket';

// Loading fallback screen
function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100dvh', background: '#0a0e1a', color: '#64748b',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 24, fontFamily: 'inherit',
    }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
      <div>Loading...</div>
    </div>
  );
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
    { to: '/', icon: '�', label: 'Play' },
    { to: '/history', icon: '🧾', label: 'History' },
    { to: '/wallet', icon: '💼', label: 'Wallet' },
    { to: '/profile', icon: '◎', label: 'Profile' },
  ];

  return (
    <nav style={{
      position: 'fixed',
      left: 12,
      right: 12,
      bottom: 10,
      zIndex: 100,
      paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      pointerEvents: 'none',
    }}>
      <div style={{
        display: 'flex',
        gap: 8,
        padding: 8,
        borderRadius: 24,
        background: 'linear-gradient(180deg, rgba(15,23,42,0.94) 0%, rgba(15,23,42,0.78) 100%)',
        border: '1px solid rgba(148,163,184,0.12)',
        boxShadow: '0 18px 38px rgba(2,6,23,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        pointerEvents: 'auto',
      }}>
        {tabs.map((tab) => {
          const isActive = tab.to === '/' ? location.pathname === '/' : location.pathname.startsWith(tab.to);
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                padding: '8px 10px 7px',
                borderRadius: 16,
                textDecoration: 'none',
                color: isActive ? '#f8fafc' : '#94a3b8',
                background: isActive ? 'linear-gradient(135deg, rgba(245,158,11,0.22) 0%, rgba(251,191,36,0.09) 100%)' : 'transparent',
                border: isActive ? '1px solid rgba(245,158,11,0.34)' : '1px solid transparent',
                boxShadow: isActive ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 18px rgba(245,158,11,0.12)' : 'none',
                fontSize: 10,
                fontWeight: isActive ? 800 : 600,
                letterSpacing: '0.01em',
                transition: 'all 0.2s ease',
                minHeight: 64,
              }}
            >
              <span style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 10,
                background: isActive ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                boxShadow: isActive ? 'inset 0 1px 0 rgba(255,255,255,0.08)' : 'inset 0 1px 0 rgba(255,255,255,0.02)',
                fontSize: 18,
                lineHeight: 1,
                filter: isActive ? 'drop-shadow(0 6px 8px rgba(245,158,11,0.2))' : 'none',
              }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
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
