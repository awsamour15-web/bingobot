import React, { useEffect, useState, useCallback } from 'react';
import { getProfile, getReferralLink } from '../lib/api';
import { initAuth } from '../lib/auth';
import { formatMoney } from '../lib/format';
import type { PlayerProfile, ReferralStats } from '@fidel/shared';

const C = {
  bg: '#0a0e1a',
  surface: '#0d1b2e',
  surface2: '#112240',
  border: 'rgba(255,255,255,0.07)',
  amber: '#f59e0b',
  amberDim: 'rgba(245,158,11,0.15)',
  teal: '#0f9b8e',
  text: '#f1f5f9',
  muted: '#64748b',
  dim: '#475569',
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [referral, setReferral] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('soundOn') !== 'false');

  useEffect(() => {
    initAuth()
      .then(() => Promise.all([getProfile(), getReferralLink()]))
      .then(([p, r]) => { setProfile(p); setReferral(r); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = useCallback(() => {
    if (!referral) return;
    navigator.clipboard.writeText(referral.referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [referral]);

  const toggleSound = useCallback(() => {
    setSoundOn(v => { const n = !v; localStorage.setItem('soundOn', String(n)); return n; });
  }, []);

  if (loading) return <div style={{ height: '60vh', background: C.bg }} />;
  if (error || !profile) return (
    <div style={{ padding: 24, textAlign: 'center', color: '#f87171' }}>{error ?? 'Failed to load'}</div>
  );

  const avatar = (profile.username?.[0] ?? '?').toUpperCase();
  const mainBal = Number(profile.mainWallet?.balance ?? 0);
  const playBal = Number(profile.playWallet?.balance ?? 0);

  const card = (children: React.ReactNode, extraStyle?: React.CSSProperties) => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px', margin: '0 16px 14px', ...extraStyle }}>
      {children}
    </div>
  );

  const labelStyle: React.CSSProperties = { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 };
  const valueStyle: React.CSSProperties = { fontSize: 22, fontWeight: 900, color: C.text };

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', paddingBottom: 80 }}>

      {/* ── Header ── */}
      <div style={{ background: `linear-gradient(135deg, ${C.surface2} 0%, ${C.surface} 100%)`, padding: '28px 20px 24px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 900, color: '#0a0e1a',
            boxShadow: '0 4px 20px rgba(245,158,11,0.4)',
            flexShrink: 0,
          }}>{avatar}</div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 20, color: C.text }}>@{profile.username}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
              {profile.phone_verified ? '✅ Phone Verified' : '⚠️ Phone Not Verified'}
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>ID: {profile.id.slice(-8).toUpperCase()}</div>
          </div>
        </div>
      </div>

      {/* ── Wallet balances ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '16px 16px 0' }}>
        {[
          { label: 'Main Wallet', value: mainBal, color: '#34d399', icon: '💰' },
          { label: 'Play Wallet', value: playBal, color: '#60a5fa', icon: '🎮' },
        ].map(({ label, value, color, icon }) => (
          <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 14px' }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color }}>{formatMoney(value)}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Birr · {label}</div>
          </div>
        ))}
      </div>

      {/* ── Referral ── */}
      {referral && card(
        <>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 14 }}>👥 Referral Program</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input readOnly value={referral.referralLink} style={{
              flex: 1, padding: '10px 12px',
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
              borderRadius: 10, fontSize: 12, color: C.muted,
              outline: 'none',
            }} />
            <button onClick={handleCopy} style={{
              padding: '10px 16px', background: copied ? '#059669' : C.amber,
              color: '#0a0e1a', border: 'none', borderRadius: 10,
              cursor: 'pointer', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: C.amber }}>{referral.totalReferrals}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Friends Invited</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#34d399' }}>{formatMoney(referral.totalEarnings ?? 0)}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Birr Earned</div>
            </div>
          </div>
        </>
      )}

      {/* ── Preferences ── */}
      {card(
        <>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 14 }}>⚙️ Preferences</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>🔊 Number Sound</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Play audio when numbers are called</div>
            </div>
            <button onClick={toggleSound} style={{
              width: 50, height: 28, borderRadius: 14, border: 'none',
              background: soundOn ? C.amber : 'rgba(255,255,255,0.1)',
              cursor: 'pointer', position: 'relative', flexShrink: 0,
              transition: 'background 0.2s',
            }}>
              <div style={{
                position: 'absolute', top: 4,
                left: soundOn ? 26 : 4, width: 20, height: 20,
                borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }} />
            </button>
          </div>
        </>
      )}

      {/* ── Account info ── */}
      {card(
        <>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 14 }}>ℹ️ Account Info</div>
          {[
            { label: 'Joined', value: new Date(profile.created_at).toLocaleDateString() },
            { label: 'Player ID', value: profile.id.slice(-8).toUpperCase() },
            { label: 'Phone', value: profile.phone_verified ? 'Verified ✅' : 'Not verified' },
          ].map(({ label, value }, i, arr) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '11px 0',
              borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <span style={labelStyle}>{label}</span>
              <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
