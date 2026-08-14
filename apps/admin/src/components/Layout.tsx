import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { GLOBAL_CSS, DarkToggle } from './ui';
import { useTheme } from './ThemeContext';

const navItems = [
  { to: '/dashboard', label: 'Overview', icon: '📊' },
  { to: '/players', label: 'Players', icon: '👥' },
  { to: '/games', label: 'Games', icon: '🎮' },
  { to: '/finance', label: 'Finance', icon: '💰' },
  { to: '/deposits', label: 'Deposits', icon: '📥' },
  { to: '/agents', label: 'Agents', icon: '🤝' },
  { to: '/promotions', label: 'Promotions', icon: '📢' },
  { to: '/cartelas', label: 'Cartelas', icon: '🎴' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Layout() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggle } = useTheme();

  function handleLogout() {
    localStorage.clear();
    navigate('/login', { replace: true });
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'inherit' }}>
      <style>{GLOBAL_CSS}{`
        :root {
          --sidebar-width: 262px;
          --topbar-height: 72px;
        }
        .sidebar {
          width: var(--sidebar-width);
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.92));
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          position: fixed;
          top: 0; left: 0; bottom: 0;
          z-index: 200;
          transition: transform 0.25s ease;
          border-right: 1px solid var(--c-border);
          box-shadow: 22px 0 45px rgba(15, 23, 42, 0.18);
        }
        .sidebar-logo {
          padding: 22px 20px 18px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
          background: rgba(148, 163, 184, 0.03);
        }
        .sidebar-logo-inner {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sidebar-logo-mark {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(59, 130, 246, 0.9));
          box-shadow: 0 10px 25px rgba(99, 102, 241, 0.35);
          font-size: 18px;
        }
        .sidebar-logo-title {
          font-size: 18px;
          font-weight: 700;
          color: #f8fafc;
          letter-spacing: -0.02em;
        }
        .sidebar-logo-sub {
          font-size: 11px;
          color: #94a3b8;
          margin-top: 3px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .sidebar-nav {
          padding: 18px 12px;
          flex: 1;
          overflow-y: auto;
        }
        .sidebar-metrics {
          margin: 6px 12px 0;
          padding: 12px;
          border-radius: 14px;
          background: rgba(148, 163, 184, 0.06);
          border: 1px solid rgba(148, 163, 184, 0.12);
        }
        .sidebar-metrics-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
          color: #cbd5e1;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }
        .sidebar-metric-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .sidebar-metric {
          padding: 10px 8px;
          border-radius: 10px;
          background: rgba(15, 23, 42, 0.32);
          border: 1px solid rgba(148, 163, 184, 0.12);
        }
        .sidebar-metric-value {
          font-size: 16px;
          font-weight: 800;
          color: #f8fafc;
          line-height: 1.1;
          margin-bottom: 2px;
        }
        .sidebar-metric-label {
          font-size: 10px;
          color: #94a3b8;
        }
        .sidebar-nav::-webkit-scrollbar { width: 4px; }
        .sidebar-nav::-webkit-scrollbar-track { background: transparent; }
        .sidebar-nav::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.35); border-radius: 8px; }
        .sidebar-nav-label {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          padding: 8px 12px 10px;
        }
        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 12px;
          border-radius: 12px;
          text-decoration: none;
          color: #cbd5e1;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.18s ease;
          margin-bottom: 4px;
        }
        .nav-item:hover {
          background: rgba(148, 163, 184, 0.08);
          color: #f8fafc;
          transform: translateX(1px);
        }
        .nav-item.active {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.22), rgba(59, 130, 246, 0.14));
          color: #e0e7ff;
          border: 1px solid rgba(129, 140, 248, 0.28);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
        }
        .nav-item .nav-icon {
          font-size: 16px;
          width: 20px;
          text-align: center;
          flex-shrink: 0;
        }
        .sidebar-footer {
          padding: 12px 12px 18px;
          border-top: 1px solid rgba(148, 163, 184, 0.12);
          background: rgba(15, 23, 42, 0.18);
        }
        .logout-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 11px 12px;
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.28);
          border: 1px solid rgba(148, 163, 184, 0.12);
          color: #cbd5e1;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.18s ease;
        }
        .logout-btn:hover {
          background: rgba(239, 68, 68, 0.08);
          color: #fecaca;
          border-color: rgba(239, 68, 68, 0.2);
        }
        .topbar {
          height: var(--topbar-height);
          background: rgba(255, 255, 255, 0.72);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--c-border);
          display: flex;
          align-items: center;
          padding: 0 22px 0 24px;
          gap: 12px;
          position: fixed;
          top: 0; right: 0; left: var(--sidebar-width);
          z-index: 100;
          transition: background 0.2s, border-color 0.2s, left 0.2s;
        }
        [data-theme="dark"] .topbar {
          background: rgba(15, 23, 42, 0.72);
        }
        .topbar-title {
          font-size: 15px;
          font-weight: 700;
          color: var(--c-text);
          flex: 1;
          letter-spacing: -0.01em;
        }
        .topbar-date {
          font-size: 12px;
          color: var(--c-muted);
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.08);
          border: 1px solid var(--c-border);
        }
        .main-content {
          margin-left: var(--sidebar-width);
          margin-top: var(--topbar-height);
          padding: 26px;
          min-height: calc(100vh - var(--topbar-height));
          background: var(--c-bg);
          transition: background 0.2s, margin-left 0.2s, padding 0.2s;
        }
        .main-content > * {
          max-width: 1500px;
          margin: 0 auto;
        }
        .hamburger {
          display: none;
          background: transparent;
          border: 1px solid var(--c-border);
          color: var(--c-text);
          width: 38px;
          height: 38px;
          border-radius: 10px;
          cursor: pointer;
          font-size: 18px;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
        }
        .overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.48);
          z-index: 150;
          backdrop-filter: blur(3px);
        }
        @media (max-width: 900px) {
          .main-content {
            padding: 18px;
          }
        }
        @media (max-width: 768px) {
          .sidebar {
            transform: translateX(-100%);
            box-shadow: 18px 0 36px rgba(15, 23, 42, 0.22);
          }
          .sidebar.open { transform: translateX(0); }
          .topbar { left: 0; padding: 0 16px; }
          .main-content { margin-left: 0; padding: 16px; }
          .hamburger { display: flex; }
          .overlay.open { display: block; }
          .topbar-date { display: none; }
        }
      `}</style>

      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-inner">
            <div className="sidebar-logo-mark">🎲</div>
            <div>
              <div className="sidebar-logo-title">Fidel Bingo</div>
              <div className="sidebar-logo-sub">Admin Dashboard</div>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-metrics">
            <div className="sidebar-metrics-header">
              <span>Live</span>
              <span>Today</span>
            </div>
            <div className="sidebar-metric-grid">
              <div className="sidebar-metric">
                <div className="sidebar-metric-value">64</div>
                <div className="sidebar-metric-label">Players</div>
              </div>
              <div className="sidebar-metric">
                <div className="sidebar-metric-value">12</div>
                <div className="sidebar-metric-label">Rounds</div>
              </div>
              <div className="sidebar-metric">
                <div className="sidebar-metric-value">94%</div>
                <div className="sidebar-metric-label">Uptime</div>
              </div>
              <div className="sidebar-metric">
                <div className="sidebar-metric-value">7</div>
                <div className="sidebar-metric-label">Agents</div>
              </div>
            </div>
          </div>

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

      <div className={`overlay${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)} />

      <header className="topbar">
        <button className="hamburger" onClick={() => setMenuOpen((o) => !o)} aria-label="Toggle menu">
          {menuOpen ? '✕' : '☰'}
        </button>
        <span className="topbar-title">Admin Panel</span>
        <span className="topbar-date">
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
        <DarkToggle dark={theme === 'dark'} onToggle={toggle} />
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
