import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../lib/api';
import { C, Alert, GLOBAL_CSS } from '../components/ui';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, role } = await adminLogin(username, password);
      localStorage.setItem('adminJwt', token);
      localStorage.setItem('adminRole', role);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: C.sidebar }}>
      <style>{GLOBAL_CSS}</style>

      {/* Left branding panel */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 48, color: '#fff',
      }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎲</div>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: '#f1f5f9' }}>Fidel Bingo</h1>
        <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 16 }}>Admin Dashboard</p>
      </div>

      {/* Right login form */}
      <div style={{
        width: 420, background: '#fff', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '48px 40px',
      }}>
        <div style={{ width: '100%', maxWidth: 340 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, color: C.text }}>Welcome back</h2>
          <p style={{ margin: '0 0 28px', color: C.muted, fontSize: 14 }}>Sign in to your admin account</p>

          {error && <Alert type="error">{error}</Alert>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: C.textSecondary }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                disabled={loading}
                placeholder="admin"
                style={{
                  width: '100%', padding: '10px 14px', border: `1px solid ${C.border}`,
                  borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: C.textSecondary }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={loading}
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '10px 14px', border: `1px solid ${C.border}`,
                  borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '11px 0', background: loading ? '#a5b4fc' : C.primary,
                color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4,
                transition: 'background 0.15s',
              }}
            >
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
