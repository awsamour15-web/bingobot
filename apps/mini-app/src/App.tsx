import React from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import GameScreen from './screens/GameScreen';
import CartelaScreen from './screens/CartelaScreen';
import LiveGameScreen from './screens/LiveGameScreen';
import HistoryScreen from './screens/HistoryScreen';
import HistoryDetailScreen from './screens/HistoryDetailScreen';
import WalletScreen from './screens/WalletScreen';
import ProfileScreen from './screens/ProfileScreen';

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

export default function App() {
  const location = useLocation();
  const isSubPage = location.pathname.includes('/cartela') || location.pathname.includes('/game');
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
