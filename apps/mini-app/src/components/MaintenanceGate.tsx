import { useEffect, useState } from 'react';
import { getPlayerId } from '../lib/auth';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface MaintenanceStatus {
  enabled: boolean;
  bypassPlayerId: string | null;
}

async function fetchMaintenanceStatus(): Promise<MaintenanceStatus> {
  const res = await fetch(`${API_BASE}/api/system/maintenance`);
  if (!res.ok) return { enabled: false, bypassPlayerId: null };
  return res.json() as Promise<MaintenanceStatus>;
}

interface Props {
  children: React.ReactNode;
}

export default function MaintenanceGate({ children }: Props) {
  const [status, setStatus] = useState<'loading' | 'maintenance' | 'ok'>('loading');

  useEffect(() => {
    fetchMaintenanceStatus().then((data) => {
      if (!data.enabled) {
        setStatus('ok');
        return;
      }
      const playerId = getPlayerId();
      if (playerId && data.bypassPlayerId && playerId === data.bypassPlayerId) {
        setStatus('ok');
      } else {
        setStatus('maintenance');
      }
    }).catch(() => {
      // On error, allow through (fail open)
      setStatus('ok');
    });
  }, []);

  if (status === 'loading') {
    return <div style={{ minHeight: '100dvh', background: '#0d0b22' }} />;
  }

  if (status === 'maintenance') {
    return (
      <div style={{
        minHeight: '100dvh',
        background: 'linear-gradient(180deg, #17102f 0%, #0d0b22 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        textAlign: 'center',
        gap: 20,
      }}>
        <div style={{ fontSize: 56 }}>🔧</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.3 }}>
          Under Maintenance
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', maxWidth: 280, lineHeight: 1.6 }}>
          We're making some improvements. Please check back soon.
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
