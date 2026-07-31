import React from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import GameScreen from './screens/GameScreen';
import CartelaScreen from './screens/CartelaScreen';
import LiveGameScreen from './screens/LiveGameScreen';
import HistoryScreen from './screens/HistoryScreen';
import HistoryDetailScreen from './screens/HistoryDetailScreen';
import WalletScreen from './screens/WalletScreen';
import ProfileScreen from './screens/ProfileScreen';

const navStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  display: 'flex',
  borderTop: '1px solid #e0e0e0',
  background: '#fff',
  zIndex: 100,
};

const tabStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '8px 0',
  textDecoration: 'none',
  color: '#888',
  fontSize: 12,
};

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  color: '#4f46e5',
  fontWeight: 700,
};

function BottomNav() {
  const location = useLocation();

  // Hide bottom nav on cartela/game subpages
  const hideNav =
    location.pathname.includes('/cartela') ||
    location.pathname.includes('/game');

  if (hideNav) return null;

  const tabs = [
    { to: '/', label: '🎮 Game' },
    { to: '/history', label: '📋 History' },
    { to: '/wallet', label: '💰 Wallet' },
    { to: '/profile', label: '👤 Profile' },
  ];

  return (
    <nav style={navStyle}>
      {tabs.map((tab) => {
        const isActive =
          tab.to === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(tab.to);
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            style={isActive ? activeTabStyle : tabStyle}
          >
            {tab.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

export default function App() {
  const location = useLocation();
  const isSubPage =
    location.pathname.includes('/cartela') ||
    location.pathname.includes('/game');

  return (
    <div style={{ paddingBottom: isSubPage ? 0 : 60, minHeight: '100vh', background: '#f5f5f5' }}>
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
