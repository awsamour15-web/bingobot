import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Btn, Alert, inputCss, GLOBAL_CSS } from '../components/ui';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'https://bingobot-vpif.onrender.com';

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok) { setError(data.error ?? 'Login failed'); return; }
      if (data.token) {
        localStorage.setItem('adminJwt', data.token);
        navigate('/', { replace: true });
      } else { setError('No token received'); }
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Network error');
    } finally { setLoading(false); }
  }

  return (
    <>
      <style>{GLOBAL_CSS}{`
        [data-theme="dark"] .login-root {
          background:
            radial-gradient(ellipse at 20% 20%, rgba(99,102,241,0.2) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 80%, rgba(6,182,212,0.12) 0%, transparent 50%),
            #0a0f1e;
        }
        [data-theme="light"] .login-root {
          background: linear-gradient(135deg, #f0f4ff 0%, #f8fafc 100%);
        }
        .login-card {
          width: 100%; max-width: 380px;
          background: var(--c-bg-card);
          border: 1px solid var(--c-border);
          border-radius: 20px;
          padding: 40px 36px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.24), 0 0 0 1px rgba(255,255,255,0.04);
        }
        .login-input {
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .login-input:focus {
          border-color: rgba(99,102,241,0.7) !important;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
        }
      `}</style>
      <div className="login-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="login-card fade-in">
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              width: 56, height: 56, margin: '0 auto 14px',
              borderRadius: 16,
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24,
              boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
            }}>
              🎲
            </div>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: 'var(--c-text)', letterSpacing: '-0.03em' }}>
              Fidel Bingo
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--c-muted)' }}>
              Admin Dashboard
            </p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && <Alert type="error">{error}</Alert>}

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 6 }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
                className="login-input"
                style={{ ...inputCss }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="login-input"
                style={{ ...inputCss }}
              />
            </div>

            <div style={{ paddingTop: 4 }}>
              <Btn type="submit" disabled={loading} fullWidth size="lg">
                {loading ? 'Signing in…' : 'Sign In →'}
              </Btn>
            </div>
          </form>

          <p style={{ margin: '20px 0 0', fontSize: 11, color: 'var(--c-muted)', textAlign: 'center' }}>
            🔒 Authorized personnel only
          </p>
        </div>
      </div>
    </>
  );
}
