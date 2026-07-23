import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../lib/api';

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
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f0f2f5',
  };

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: 8,
    padding: '40px 32px',
    boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
    width: 360,
    maxWidth: '90vw',
  };

  const titleStyle: React.CSSProperties = {
    margin: '0 0 24px',
    fontSize: 22,
    fontWeight: 700,
    color: '#1a1a2e',
    textAlign: 'center',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: 14,
    fontWeight: 500,
    color: '#333',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    boxSizing: 'border-box',
    outline: 'none',
  };

  const fieldStyle: React.CSSProperties = {
    marginBottom: 16,
  };

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 0',
    background: loading ? '#a5b4fc' : '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 15,
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
    marginTop: 8,
  };

  const errorStyle: React.CSSProperties = {
    marginTop: 14,
    padding: '10px 12px',
    background: '#fee2e2',
    color: '#b91c1c',
    borderRadius: 6,
    fontSize: 13,
    textAlign: 'center',
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Beteseb Bingo Admin</h1>
        <form onSubmit={handleSubmit}>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="username">
              Username
            </label>
            <input
              id="username"
              style={inputStyle}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              disabled={loading}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              style={inputStyle}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={loading}
            />
          </div>
          <button style={buttonStyle} type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {error && <div style={errorStyle}>{error}</div>}
      </div>
    </div>
  );
}
