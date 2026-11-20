import React, { useState, useCallback } from 'react';
import { webLogin } from '../lib/api';
import { storeWebSession } from '../lib/auth';

interface Props {
  onSuccess: () => void;
}

const C = {
  bg: '#0c0a1e',
  surface: '#13102b',
  surface2: '#1a1535',
  border: 'rgba(124,58,237,0.2)',
  violet: '#7c3aed',
  magenta: '#e040fb',
  gold: '#ffd54f',
  text: '#f1f5f9',
  muted: 'rgba(255,255,255,0.45)',
  dim: 'rgba(255,255,255,0.2)',
  red: '#f87171',
  green: '#34d399',
};

export default function WebLoginScreen({ onSuccess }: Props) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = useCallback(async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      setError('Please enter your phone number');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await webLogin(trimmed);
      storeWebSession({
        token: res.token,
        playerId: res.playerId,
        phoneVerified: res.phoneVerified,
        ...(res.agentToken ? { agentToken: res.agentToken } : {}),
        ...(res.agentId ? { agentId: res.agentId } : {}),
      });
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      if (msg.includes('PHONE_NOT_FOUND') || msg.includes('No verified account')) {
        setError('No account found for this number. Register first via @MadaBingoBot on Telegram.');
      } else if (msg.includes('RATE_LIMIT')) {
        setError('Too many attempts. Please wait a minute and try again.');
      } else if (msg.includes('INVALID_PHONE')) {
        setError('Enter a valid Ethiopian number: 09xxxxxxxx or 07xxxxxxxx');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [phone, onSuccess]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin();
  }, [handleLogin]);

  return (
    <div style={{
      minHeight: '100dvh',
      background: `radial-gradient(ellipse at 60% 0%, rgba(124,58,237,0.18) 0%, transparent 60%),
                   radial-gradient(ellipse at 10% 80%, rgba(224,64,251,0.12) 0%, transparent 50%),
                   ${C.bg}`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 20px',
      fontFamily: "'Nunito', sans-serif",
    }}>

      {/* Logo */}
      <div style={{
        width: 72, height: 72, borderRadius: 22,
        background: 'linear-gradient(135deg, #7c3aed, #e040fb)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, fontWeight: 900, color: '#fff',
        boxShadow: '0 8px 32px rgba(124,58,237,0.45)',
        marginBottom: 20,
        letterSpacing: -1,
      }}>FB</div>

      <div style={{ fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 6, letterSpacing: -0.5 }}>
        Mada Bingo
      </div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 36, textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
        Enter your registered phone number to continue playing
      </div>

      {/* Login card */}
      <div style={{
        width: '100%', maxWidth: 360,
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 24,
        padding: '28px 24px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 16 }}>
          📱 Sign in with Phone
        </div>

        {/* Phone input */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>
            PHONE NUMBER
          </div>
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={e => { setPhone(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            placeholder="09xxxxxxxx"
            autoFocus
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: 14,
              border: `1.5px solid ${error ? C.red : C.border}`,
              background: C.surface2,
              color: C.text,
              fontSize: 16,
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.2s',
              letterSpacing: 1,
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '11px 14px', borderRadius: 12,
            background: 'rgba(248,113,113,0.1)',
            border: '1px solid rgba(248,113,113,0.3)',
            color: C.red, fontSize: 13, lineHeight: 1.5,
            marginBottom: 14,
          }}>
            {error}
          </div>
        )}

        {/* Submit button */}
        <button
          onClick={handleLogin}
          disabled={loading || !phone.trim()}
          style={{
            width: '100%',
            padding: '15px 0',
            borderRadius: 14,
            border: 'none',
            background: loading || !phone.trim()
              ? C.surface2
              : 'linear-gradient(135deg, #7c3aed, #e040fb)',
            color: loading || !phone.trim() ? C.dim : '#fff',
            fontWeight: 900,
            fontSize: 15,
            cursor: loading || !phone.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            boxShadow: loading || !phone.trim() ? 'none' : '0 4px 20px rgba(124,58,237,0.4)',
            letterSpacing: 0.3,
          }}
        >
          {loading ? '⏳ Signing in…' : '→ Continue'}
        </button>
      </div>

      {/* How-to register note */}
      <div style={{
        marginTop: 28, width: '100%', maxWidth: 360,
        background: 'rgba(124,58,237,0.08)',
        border: '1px solid rgba(124,58,237,0.2)',
        borderRadius: 18,
        padding: '18px 20px',
      }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#a78bfa', marginBottom: 10, letterSpacing: 0.4 }}>
          DON'T HAVE AN ACCOUNT?
        </div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.9 }}>
          1. Open <span style={{ color: C.text, fontWeight: 700 }}>@MadaBingoBot</span> in Telegram<br />
          2. Tap <span style={{ color: C.text, fontWeight: 700 }}>Register 📝</span> and share your phone<br />
          3. Come back here and sign in 🎮
        </div>
      </div>

      <div style={{ marginTop: 20, fontSize: 11, color: C.dim, textAlign: 'center' }}>
        Your phone number is used only to identify your account
      </div>
    </div>
  );
}
