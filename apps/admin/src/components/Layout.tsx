import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

const navItems = [
  { to: '/players', label: '👥 Players' },
  { to: '/games', label: '🎮 Games' },
  { to: '/finance', label: '💰 Finance' },
  { to: '/deposits', label: '📥 Deposits' },
  { to: '/settings', label: '⚙️ Settings' },
];

export function Layout() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    localStorage.clear();
    navigate('/login', { replace: true });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        .admin-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          height: 56px;
          background: #1a1a2e;
          color: #fff;
          flex-shrink: 0;
          gap: 12px;
        }
        .admin-body {
          display: flex;
          flex: 1;
          overflow: hidden;
        }
        .admin-sidebar {
          width: 200px;
          background: #f8f9fa;
          border-right: 1px solid #e5e7eb;
          padding: 16px 0;
          flex-shrink: 0;
        }
        .admin-main {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          background: #fff;
          min-width: 0;
        }
        .hamburger-btn {
          display: none;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.4);
          color: #fff;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
        }
        .nav-link-base {
          display: block;
          padding: 10px 20px;
          text-decoration: none;
          color: #374151;
          font-size: 14px;
          font-weight: 500;
          border-left: 3px solid transparent;
        }
        .nav-link-active {
          color: #4f46e5;
          background: #ede9fe;
          border-left-color: #4f46e5;
        }
        .mobile-nav-overlay {
          display: none;
        }
        @media (max-width: 640px) {
          .hamburger-btn {
            display: block;
          }
          .admin-body {
            position: relative;
          }
          .admin-sidebar {
            position: fixed;
            top: 56px;
            left: 0;
            bottom: 0;
            z-index: 100;
            width: 220px;
            box-shadow: 2px 0 8px rgba(0,0,0,0.12);
            transform: translateX(-100%);
            transition: transform 0.2s ease;
          }
          .admin-sidebar.open {
            transform: translateX(0);
          }
          .mobile-nav-overlay.open {
            display: block;
            position: fixed;
            inset: 56px 0 0 0;
            z-index: 99;
            background: rgba(0,0,0,0.3);
          }
          .admin-main {
            padding: 16px;
          }
        }
      `}</style>

      <header className="admin-header">
        <span style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Fidel Bingo Admin</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="hamburger-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle navigation"
          >
            {menuOpen ? '✕' : '☰'}
          </button>
          <button
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.4)',
              color: '#fff',
              padding: '6px 14px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
            }}
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </header>

      <div className="admin-body">
        <div
          className={`mobile-nav-overlay${menuOpen ? ' open' : ''}`}
          onClick={() => setMenuOpen(false)}
        />
        <nav className={`admin-sidebar${menuOpen ? ' open' : ''}`}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-link-base${isActive ? ' nav-link-active' : ''}`
              }
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
