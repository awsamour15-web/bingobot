import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import RegistrationGate from './components/RegistrationGate';
import MaintenanceGate from './components/MaintenanceGate';
import DailySpinModal from './components/DailySpinModal';
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
const CashierScreen = lazy(() => import('./screens/CashierScreen'));
import { socket } from './lib/socket';
// Minimal blank fallback — no spinner, no emoji, just background
function LoadingScreen() {
    return _jsx("div", { style: { minHeight: '100dvh', background: '#0c0a1e' } });
}
// ─── Error boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error) {
        // Chunk load failures happen when a new deploy invalidates old hashed assets.
        // Force a hard reload so the browser fetches the fresh index.html and new chunks.
        const isChunkError = error.message.includes('Failed to fetch dynamically imported module') ||
            error.message.includes('Importing a module script failed') ||
            error.message.includes('Unable to preload CSS') ||
            error.name === 'ChunkLoadError';
        if (isChunkError) {
            window.location.reload();
        }
    }
    render() {
        if (this.state.error) {
            const isChunkError = this.state.error.message.includes('Failed to fetch dynamically imported module') ||
                this.state.error.message.includes('Importing a module script failed') ||
                this.state.error.name === 'ChunkLoadError';
            if (isChunkError) {
                return _jsx(LoadingScreen, {});
            }
            return (_jsxs("div", { style: {
                    minHeight: '100dvh', background: '#0c0a1e', color: '#f87171',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', padding: 24, fontFamily: 'monospace',
                }, children: [_jsx("div", { style: { fontSize: 18, fontWeight: 700, marginBottom: 12 }, children: "App Error" }), _jsx("div", { style: { fontSize: 12, color: '#94a3b8', wordBreak: 'break-all', textAlign: 'center' }, children: this.state.error.message }), _jsx("button", { onClick: () => window.location.href = '/', style: { marginTop: 20, padding: '10px 24px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }, children: "Go Home" })] }));
        }
        return this.props.children;
    }
}
// ─── Bottom navigation ───────────────────────────────────────────────────────
const FULLSCREEN_ROUTES = ['/cartela', '/game', '/bingo', '/cashier'];
function isFullscreenRoute(pathname) {
    return FULLSCREEN_ROUTES.some(r => pathname.includes(r));
}
function BottomNav() {
    const location = useLocation();
    if (isFullscreenRoute(location.pathname))
        return null;
    const tabs = [
        { to: '/', icon: '🎮', label: 'Play' },
        { to: '/wallet', icon: '💎', label: 'Wallet' },
        { to: '/history', icon: '📜', label: 'History' },
        { to: '/rank', icon: '🏆', label: 'Rank' },
        { to: '/profile', icon: '👤', label: 'Profile' },
    ];
    return (_jsxs(_Fragment, { children: [_jsx("style", { children: `
        .fb-bottom-nav {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 100;
          background: rgba(13, 10, 30, 0.96);
          border-top: 1px solid rgba(124, 58, 237, 0.25);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          padding-bottom: env(safe-area-inset-bottom);
        }

        .fb-bottom-nav-inner {
          display: flex;
          align-items: stretch;
          height: 60px;
        }

        .fb-bottom-tab {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          text-decoration: none;
          color: rgba(255, 255, 255, 0.35);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.03em;
          line-height: 1;
          transition: color 0.18s ease;
          position: relative;
        }

        .fb-bottom-tab.active {
          color: #e040fb;
        }

        .fb-bottom-icon {
          font-size: 20px;
          line-height: 1;
          transition: transform 0.18s ease;
          position: relative;
        }

        .fb-bottom-tab.active .fb-bottom-icon {
          transform: scale(1.1);
        }

        .fb-active-dot {
          position: absolute;
          top: -6px;
          left: 50%;
          transform: translateX(-50%);
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #e040fb;
          box-shadow: 0 0 8px #e040fb;
          display: none;
        }

        .fb-bottom-tab.active .fb-active-dot {
          display: block;
        }

        .fb-bottom-label {
          opacity: 0.9;
          font-family: 'Nunito', sans-serif;
        }

        .fb-bottom-tab.active .fb-bottom-label {
          opacity: 1;
        }
      ` }), _jsx("nav", { className: "fb-bottom-nav", "aria-label": "Main navigation", children: _jsx("div", { className: "fb-bottom-nav-inner", children: tabs.map((tab) => {
                        const isActive = tab.to === '/' ? location.pathname === '/' : location.pathname.startsWith(tab.to);
                        return (_jsxs(NavLink, { to: tab.to, className: `fb-bottom-tab${isActive ? ' active' : ''}`, children: [_jsxs("span", { className: "fb-bottom-icon", "aria-hidden": "true", children: [_jsx("span", { className: "fb-active-dot" }), tab.icon] }), _jsx("span", { className: "fb-bottom-label", children: tab.label })] }, tab.to));
                    }) }) })] }));
}
// ─── Daily spin helpers ───────────────────────────────────────────────────────
const SPIN_STORAGE_KEY = 'daily_spin_shown';
function getTodayUtc3() {
    return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function shouldShowSpin() {
    try {
        return localStorage.getItem(SPIN_STORAGE_KEY) !== getTodayUtc3();
    }
    catch {
        return false;
    }
}
function markSpinShown() {
    try {
        localStorage.setItem(SPIN_STORAGE_KEY, getTodayUtc3());
    }
    catch { /* ignore */ }
}
// ─── App ─────────────────────────────────────────────────────────────────────
function AppInner() {
    const location = useLocation();
    const isSubPage = isFullscreenRoute(location.pathname);
    const [showSpin, setShowSpin] = useState(false);
    // Keep socket connected globally
    useEffect(() => {
        if (!socket.connected)
            socket.connect();
    }, []);
    // Show daily spin once per day after a short delay
    useEffect(() => {
        if (shouldShowSpin()) {
            const t = setTimeout(() => setShowSpin(true), 1500);
            return () => clearTimeout(t);
        }
        return undefined;
    }, []);
    function handleSpinClose() {
        markSpinShown();
        setShowSpin(false);
    }
    return (_jsxs("div", { className: "app-surface", style: { paddingBottom: isSubPage ? 0 : 'calc(60px + env(safe-area-inset-bottom))', minHeight: '100dvh' }, children: [_jsx(Suspense, { fallback: _jsx(LoadingScreen, {}), children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(GameScreen, {}) }), _jsx(Route, { path: "/bingo", element: _jsx(GameScreen, {}) }), _jsx(Route, { path: "/history", element: _jsx(HistoryScreen, {}) }), _jsx(Route, { path: "/history/:roundId", element: _jsx(HistoryDetailScreen, {}) }), _jsx(Route, { path: "/wallet", element: _jsx(WalletScreen, {}) }), _jsx(Route, { path: "/profile", element: _jsx(ProfileScreen, {}) }), _jsx(Route, { path: "/rank", element: _jsx(RankScreen, {}) }), _jsx(Route, { path: "/agent/dashboard", element: _jsx(AgentDashboardScreen, {}) }), _jsx(Route, { path: "/cashier", element: _jsx(CashierScreen, {}) }), _jsx(Route, { path: "/rounds/:id/cartela", element: _jsx(CartelaScreen, {}) }), _jsx(Route, { path: "/rounds/:id/game", element: _jsx(LiveGameScreen, {}) })] }) }), _jsx(BottomNav, {}), showSpin && _jsx(DailySpinModal, { onClose: handleSpinClose })] }));
}
export default function App() {
    return (_jsx(ErrorBoundary, { children: _jsx(MaintenanceGate, { children: _jsx(RegistrationGate, { children: _jsx(AppInner, {}) }) }) }));
}
//# sourceMappingURL=App.js.map