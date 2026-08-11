import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { GLOBAL_CSS, C } from './ui';

const navItems = [
  { to: '/players', label: 'Players', icon: '👥' },
  { to: '/games', label: 'Games', icon: '🎮' },
  { to: '/finance', label: 'Finance', icon: '💰' },
  { to: '/deposits', label: 'Deposits', icon: '📥' },
  { to: '/agents', label: 'Agents', icon: '🤝' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Layout() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    localStorage.clear();
    navigate('/login', { replace: true });
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'inherit' }}>
      <style>{GLOBAL_CSS}{`
        .sidebar { width: 240px; background: ${C.sidebar}; display: flex; flex-direction: column; flex-shrink: 0; position: fixed; top: 0; left: 0; bottom: 0; z-index: 200; transition: transform 0.25s ease; }
        .sidebar-logo { padding: 20px 20px 16px; border-bottom: 1px solid #1e293b; }
        .sidebar-logo-title { font-size: 17px; font-weight: 700; color: #f1f5f9; letter-spacing: -0.01em; }
        .sidebar-logo-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
        .sidebar-nav { padding: 12px 10px; flex: 1; overflow-y: auto; }
        .sidebar-nav-label { font-size: 10px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; padding: 8px 10px 4px; }
        .nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; text-decoration: none; color: #94a3b8; font-size: 14px; font-weight: 500; transition: all 0.15s; margin-bottom: 2px; }
        .nav-item:hover { background: #1e293b; color: #e2e8f0; }
        .nav-item.active { background: #312e81; color: #c7d2fe; }
        .nav-item .nav-icon { font-size: 16px; width: 20px; text-align: center; flex-shrink: 0; }
        .sidebar-footer { padding: 12px 10px; border-top: 1px solid #1e293b; }
        .logout-btn { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 12px; border-radius: 8px; background: transparent; border: none; color: #94a3b8; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
        .logout-btn:hover { background: #1e293b; color: #fca5a5; }
        .topbar { height: 56px; background: ${C.header}; border-bottom: 1px solid ${C.border}; display: flex; align-items: center; padding: 0 24px; gap: 12px; position: fixed; top: 0; right: 0; left: 240px; z-index: 100; }
        .topbar-title { font-size: 15px; font-weight: 600; color: ${C.text}; flex: 1; }
        .main-content { margin-left: 240px; margin-top: 56px; padding: 28px; min-height: calc(100vh - 56px); background: ${C.bg}; }
        .hamburger { display: none; background: transparent; border: 1px solid ${C.border}; color: ${C.text}; width: 36px; height: 36px; border-radius: 8px; cursor: pointer; font-size: 16px; align-items: center; justify-content: center; }
        .overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 150; }
        @media (max-width: 768px) {
          .sidebar { transform: translateX(-100%); }
          .sidebar.open { transform: translateX(0); }
          .topbar { left: 0; }
          .main-content { margin-left: 0; padding: 16px; }
          .hamburger { display: flex; }
          .overlay.open { display: block; }
        }
      `}</style>

      {/* Sidebar */}
      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-title">🎲 Fidel Bingo</div>
          <div className="sidebar-logo-sub">Admin Dashboard</div>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-nav-label">Navigation</div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <span className="nav-icon">🚪</span>
            Logout
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      <div className={`overlay${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)} />

      {/* Top bar */}
      <header className="topbar">
        <button className="hamburger" onClick={() => setMenuOpen((o) => !o)} aria-label="Toggle menu">
          {menuOpen ? '✕' : '☰'}
        </button>
        <span className="topbar-title">Admin Panel</span>
        <span style={{ fontSize: 12, color: C.muted }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
      </header>

      {/* Main */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
