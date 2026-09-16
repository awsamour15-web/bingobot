import { useEffect, useState } from 'react';
import { initAuth, isPhoneVerified } from '../lib/auth';

interface Props {
  children: React.ReactNode;
}

export default function RegistrationGate({ children }: Props) {
  const [status, setStatus] = useState<'loading' | 'unregistered' | 'ok'>('loading');

  useEffect(() => {
    initAuth()
      .then(() => {
        setStatus(isPhoneVerified() ? 'ok' : 'unregistered');
      })
      .catch(() => {
        // Auth failed entirely (outside Telegram etc.) — let inner screens handle it
        setStatus('ok');
      });
  }, []);

  if (status === 'loading') {
    return <div style={{ minHeight: '100dvh', background: '#07091a' }} />;
  }

  if (status === 'unregistered') {
    return (
      <div style={{
        minHeight: '100dvh',
        background: 'linear-gradient(180deg,#07111e 0%,#050b18 60%,#030710 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '0 32px', textAlign: 'center', gap: 20,
      }}>
        <div style={{ fontSize: 64 }}>📱</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#f4f7fb', lineHeight: 1.3 }}>
          Register First
        </div>
        <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.7, maxWidth: 300 }}>
          You need to register with your phone number before using the app.
        </div>
        <div style={{
          marginTop: 8,
          background: 'rgba(99,212,186,0.08)',
          border: '1px solid rgba(99,212,186,0.25)',
          borderRadius: 16,
          padding: '18px 22px',
          maxWidth: 320,
          width: '100%',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#63d4ba', marginBottom: 12 }}>
            How to register
          </div>
          <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 2, textAlign: 'left' }}>
            1. Open <strong style={{ color: '#f4f7fb' }}>@FidelBingoBot</strong> in Telegram<br />
            2. Tap <strong style={{ color: '#f4f7fb' }}>Register 📝</strong><br />
            3. Share your phone number<br />
            4. Come back here to play 🎮
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
