import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { C, Btn, Card, Alert, PageHeader, inputCss } from '../components/ui';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'https://bingobot-vpif.onrender.com';

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${BASE_URL}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = (await res.json()) as { token?: string; error?: string };

      if (!res.ok) {
        setError(data.error ?? 'Login failed');
        return;
      }

      if (data.token) {
        localStorage.setItem('adminJwt', data.token);
        navigate('/', { replace: true });
      } else {
        setError('No token received');
      }
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--c-bg)',
      fontFamily: 'inherit',
    }}>
      <Card style={{ width: '100%', maxWidth: 380, padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎲</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--c-text)', margin: 0 }}>Fidel Bingo</h1>
          <p style={{ fontSize: 13, color: 'var(--c-muted)', margin: '4px 0 0' }}>Admin Dashboard</p>
        </div>

        <form onSubmit={handleLogin}>
          {error && <Alert type="error">{error}</Alert>}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--c-text)', marginBottom: 6 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              style={inputCss}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--c-text)', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={inputCss}
            />
          </div>

          <Btn type="submit" disabled={loading} fullWidth>
            {loading ? 'Signing in…' : 'Sign In'}
          </Btn>
        </form>

        <p style={{ fontSize: 12, color: 'var(--c-muted)', textAlign: 'center', marginTop: 16, marginBottom: 0 }}>
          🔒 Admin access only
        </p>
      </Card>
    </div>
  );
}
