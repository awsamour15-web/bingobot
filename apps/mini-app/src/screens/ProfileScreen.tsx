import React, { useEffect, useState, useCallback } from 'react';
import { getProfile, getReferralLink } from '../lib/api';
import type { PlayerProfile, ReferralStats } from '@beteseb/shared';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [referral, setReferral] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('soundOn') !== 'false');

  useEffect(() => {
    Promise.all([getProfile(), getReferralLink()])
      .then(([p, r]) => { setProfile(p); setReferral(r); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load profile'))
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
    setSoundOn((v) => {
      const next = !v;
      localStorage.setItem('soundOn', String(next));
      return next;
    });
  }, []);

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>Loading…</div>;
  }

  if (error || !profile) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#e53e3e' }}>{error ?? 'Failed to load profile'}</div>;
  }

  const avatar = (profile.username?.[0] ?? '?').toUpperCase();

  const card: React.CSSProperties = {
    background: '#fff',
    borderRadius: 12,
    padding: 16,
    margin: '10px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  };

  const row: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #f3f4f6',
  };

  return (
    <div>
      {/* Profile header */}
      <div style={{ background: '#4f46e5', color: '#fff', padding: '24px 16px 20px', textAlign: 'center' }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          fontWeight: 900,
          margin: '0 auto 10px',
        }}>
          {avatar}
        </div>
        <div style={{ fontWeight: 700, fontSize: 20 }}>@{profile.username}</div>
        {profile.phone_verified && (
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>✅ ስልክ ተረጋግጧል</div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 0, margin: '10px 16px', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <div style={{ flex: 1, padding: '14px 8px', textAlign: 'center', borderRight: '1px solid #f3f4f6' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#4f46e5' }}>{profile.mainWallet.balance.toFixed(0)}</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>ዋና ዋሌት (ብር)</div>
        </div>
        <div style={{ flex: 1, padding: '14px 8px', textAlign: 'center', borderRight: '1px solid #f3f4f6' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#4f46e5' }}>{profile.playWallet.balance.toFixed(0)}</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>ጨዋታ ዋሌት (ብር)</div>
        </div>
      </div>

      {/* Referral card */}
      {referral && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>👥 ምክረ ጓደኛ</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              readOnly
              value={referral.referralLink}
              style={{
                flex: 1,
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: 8,
                fontSize: 13,
                color: '#444',
                background: '#f9fafb',
              }}
            />
            <button
              onClick={handleCopy}
              style={{
                padding: '10px 16px',
                background: copied ? '#065f46' : '#4f46e5',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 13,
                whiteSpace: 'nowrap',
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
            <div>
              <div style={{ color: '#888' }}>ጓደኞች</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: '#4f46e5' }}>{referral.totalReferrals}</div>
            </div>
            <div>
              <div style={{ color: '#888' }}>ጠቅላላ ሽልማት</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: '#065f46' }}>{referral.totalEarnings.toFixed(2)} ብር</div>
            </div>
          </div>
        </div>
      )}

      {/* Preferences */}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 15 }}>⚙️ ምርጫ</div>
        <div style={row}>
          <div>
            <div style={{ fontWeight: 600 }}>🔊 ድምፅ</div>
            <div style={{ fontSize: 12, color: '#888' }}>ቁጥር ሲጠራ ድምፅ አሰማ</div>
          </div>
          <button
            onClick={toggleSound}
            style={{
              width: 48,
              height: 26,
              borderRadius: 13,
              border: 'none',
              background: soundOn ? '#4f46e5' : '#d1d5db',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
            }}
          >
            <div style={{
              position: 'absolute',
              top: 3,
              left: soundOn ? 25 : 3,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s',
            }} />
          </button>
        </div>
      </div>

      {/* Account info */}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 15 }}>ስለ መለያ</div>
        <div style={row}>
          <span style={{ color: '#888', fontSize: 13 }}>የተቀላቀሉበት ቀን</span>
          <span style={{ fontSize: 13 }}>{new Date(profile.created_at).toLocaleDateString('am-ET')}</span>
        </div>
        <div style={{ ...row, borderBottom: 'none' }}>
          <span style={{ color: '#888', fontSize: 13 }}>Player ID</span>
          <span style={{ fontSize: 12, color: '#aaa' }}>{profile.id.slice(-8)}</span>
        </div>
      </div>
    </div>
  );
}
