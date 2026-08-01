import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

const navItems = [
  { to: '/players', label: '👥 Players' },
  { to: '/games', label: '🎮 Games' },
  { to: '/finance', label: '💰 Finance' },
  { to: '/settings', label: '⚙️ Settings' },
];

export function Layout() {
  const navigate = useNavigate();

  function handleLogout() {
    localStorage.clear();
    navigate('/login', { replace: true });
  }

  const rootStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    fontFamily: 'system-ui, sans-serif',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    height: 56,
    background: '#1a1a2e',
    color: '#fff',
    flexShrink: 0,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 700,
    margin: 0,
  };

  const logoutButtonStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.4)',
    color: '#fff',
    padding: '6px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  };

  const bodyStyle: React.CSSProperties = {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  };

  const sidebarStyle: React.CSSProperties = {
    width: 200,
    background: '#f8f9fa',
    borderRight: '1px solid #e5e7eb',
    padding: '16px 0',
    flexShrink: 0,
  };

  const linkBaseStyle: React.CSSProperties = {
    display: 'block',
    padding: '10px 20px',
    textDecoration: 'none',
    color: '#374151',
    fontSize: 14,
    fontWeight: 500,
    borderLeft: '3px solid transparent',
  };

  const linkActiveStyle: React.CSSProperties = {
    ...linkBaseStyle,
    color: '#4f46e5',
    background: '#ede9fe',
    borderLeftColor: '#4f46e5',
  };

  const mainStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: 24,
    background: '#fff',
  };

  return (
    <div style={rootStyle}>
      <header style={headerStyle}>
        <span style={titleStyle}>Fidel Bingo Admin</span>
        <button style={logoutButtonStyle} onClick={handleLogout}>
          Logout
        </button>
      </header>
      <div style={bodyStyle}>
        <nav style={sidebarStyle}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => (isActive ? linkActiveStyle : linkBaseStyle)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main style={mainStyle}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
