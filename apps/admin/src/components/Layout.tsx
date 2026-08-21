import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { GLOBAL_CSS, DarkToggle, CustomIcon } from './ui';
import { useTheme } from './ThemeContext';
import type { IconName } from './ui';

interface NavItem { to: string; label: string; icon: IconName }

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Overview',    icon: 'dashboard'   },
  { to: '/players',   label: 'Players',     icon: 'players'     },
  { to: '/bonus',     label: 'Bonus',       icon: 'bonus'       },
  { to: '/games',     label: 'Games',       icon: 'ticket'      },
  { to: '/finance',   label: 'Finance',     icon: 'finance'     },
  { to: '/deposits',  label: 'Deposits',    icon: 'deposits'    },
  { to: '/withdrawals', label: 'Withdrawals', icon: 'withdrawals' },
  { to: '/agents',    label: 'Agents',      icon: 'agents'      },
  { to: '/promotions',label: 'Promotions',  icon: 'promotions'  },
  { to: '/cartelas',    label: 'Cartelas',     icon: 'cartelas'    },
  { to: '/mock-players', label: 'Mock Players', icon: 'players'     },
  { to: '/settings',  label: 'Settings',    icon: 'settings'    },
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
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <style>{GLOBAL_CSS}{`
        :root {
          --sidebar-w: 240px;
          --topbar-h: 60px;
        }

        /* ── Sidebar ── */
        .sidebar {
          width: var(--sidebar-w);
          background: var(--c-sidebar);
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          position: fixed;
          top: 0; left: 0; bottom: 0;
          z-index: 200;
          transition: transform 0.22s cubic-bezier(.4,0,.2,1);
          border-right: 1px solid var(--c-border);
        }

        .sidebar-brand {
          height: var(--topbar-h);
          display: flex;
          align-items: center;
          padding: 0 16px;
          border-bottom: 1px solid var(--c-border);
          gap: 10px;
          flex-shrink: 0;
        }
        .sidebar-brand-icon {
          width: 34px; height: 34px;
          border-radius: 10px;
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(99,102,241,0.35);
        }
        .sidebar-brand-name {
          font-size: 15px; font-weight: 800;
          color: var(--c-text); letter-spacing: -0.02em;
          white-space: nowrap;
        }
        .sidebar-brand-tag {
          font-size: 10px; color: var(--c-muted); font-weight: 500;
          text-transform: uppercase; letter-spacing: 0.1em;
        }

        .sidebar-nav {
          flex: 1;
          padding: 12px 10px;
          overflow-y: auto;
        }
        .sidebar-nav::-webkit-scrollbar { width: 3px; }
        .sidebar-nav::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.2); border-radius: 4px; }

        .nav-section {
          font-size: 10px; font-weight: 700; color: var(--c-muted);
          text-transform: uppercase; letter-spacing: 0.12em;
          padding: 6px 8px 8px;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 10px;
          border-radius: 10px;
          text-decoration: none;
          color: var(--c-text-secondary);
          font-size: 13px;
          font-weight: 500;
          transition: all 0.15s ease;
          margin-bottom: 2px;
        }
        .nav-item:hover {
          background: var(--c-sidebar-hover);
          color: var(--c-text);
        }
        .nav-item.active {
          background: rgba(99,102,241,0.14);
          color: #a5b4fc;
          font-weight: 600;
        }
        .nav-item .nav-icon {
          width: 32px; height: 32px;
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          background: transparent;
          transition: background 0.15s;
          color: inherit;
        }
        .nav-item.active .nav-icon {
          background: rgba(99,102,241,0.18);
        }
        .nav-item:hover .nav-icon {
          background: rgba(148,163,184,0.08);
        }

        .sidebar-footer {
          padding: 12px 10px;
          border-top: 1px solid var(--c-border);
          flex-shrink: 0;
        }
        .logout-btn {
          display: flex; align-items: center; gap: 10px;
          width: 100%;
          padding: 9px 10px; border-radius: 10px;
          background: transparent; border: none;
          color: var(--c-muted); font-size: 13px; font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
        }
        .logout-btn:hover {
          background: rgba(239,68,68,0.08);
          color: #f87171;
        }

        /* ── Topbar ── */
        .topbar {
          height: var(--topbar-h);
          background: var(--c-header);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--c-border);
          display: flex;
          align-items: center;
          padding: 0 20px;
          gap: 10px;
          position: fixed;
          top: 0; right: 0;
          left: var(--sidebar-w);
          z-index: 100;
          transition: left 0.22s cubic-bezier(.4,0,.2,1);
        }

        .topbar-status {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 10px; border-radius: 6px;
          background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.2);
          color: #4ade80; font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.07em;
        }
        .topbar-status-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #22c55e;
          animation: pulse 2s ease infinite;
        }
        .topbar-spacer { flex: 1; }
        .topbar-date {
          font-size: 12px; color: var(--c-muted); font-weight: 500;
        }

        .hamburger {
          display: none;
          background: transparent; border: 1px solid var(--c-border);
          color: var(--c-text); width: 36px; height: 36px;
          border-radius: 9px; cursor: pointer; font-size: 16px;
          align-items: center; justify-content: center; flex-shrink: 0;
        }

        /* ── Main ── */
        .main-content {
          margin-left: var(--sidebar-w);
          margin-top: var(--topbar-h);
          padding: 28px;
          min-height: calc(100vh - var(--topbar-h));
          background: transparent;
          transition: margin-left 0.22s cubic-bezier(.4,0,.2,1);
        }
        .main-content > * { max-width: 1400px; margin: 0 auto; }

        .overlay {
          display: none; position: fixed; inset: 0;
          background: rgba(0,0,0,0.5); z-index: 150;
          backdrop-filter: blur(2px);
        }

        @media (max-width: 900px) {
          .main-content { padding: 20px; }
        }
        @media (max-width: 768px) {
          .sidebar { transform: translateX(-100%); }
          .sidebar.open { transform: translateX(0); }
          .topbar { left: 0; padding: 0 14px; }
          .main-content { margin-left: 0; padding: 16px; }
          .hamburger { display: flex; }
          .overlay.open { display: block; }
        }
      `}</style>

      {/* Sidebar */}
      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">🎲</div>
          <div>
            <div className="sidebar-brand-name">Fidel Bingo</div>
            <div className="sidebar-brand-tag">Admin</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">Menu</div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <span className="nav-icon">
                <CustomIcon name={item.icon} size={16} />
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <span style={{
              width: 32, height: 32, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(148,163,184,0.08)', fontSize: 14, flexShrink: 0,
            }}>
              ⎋
            </span>
            Sign out
          </button>
        </div>
      </aside>

      <div className={`overlay${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)} />

      {/* Topbar */}
      <header className="topbar">
        <button className="hamburger" onClick={() => setMenuOpen((o) => !o)} aria-label="Toggle menu">
          {menuOpen ? '✕' : '☰'}
        </button>
        <span className="topbar-status">
          <span className="topbar-status-dot" />
          Live
        </span>
        <span className="topbar-spacer" />
        <span className="topbar-date">
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <DarkToggle dark={theme === 'dark'} onToggle={toggle} />
      </header>

      {/* Main content */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
