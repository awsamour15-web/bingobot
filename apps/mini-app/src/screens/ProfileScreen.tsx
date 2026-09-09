import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile, getReferralLink } from '../lib/api';
import { initAuth, getAgentJwt } from '../lib/auth';
import { formatMoney } from '../lib/format';
import type { PlayerProfile, ReferralStats } from '@fidel/shared';

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#07091a',
  surface: '#0d1425',
  surface2: '#111c35',
  surface3: '#162040',
  border: 'rgba(255,255,255,0.06)',
  borderGlow: 'rgba(245,158,11,0.25)',
  amber: '#f59e0b',
  amberLight: '#fcd34d',
  amberDim: 'rgba(245,158,11,0.12)',
  teal: '#14b8a6',
  tealDim: 'rgba(20,184,166,0.12)',
  blue: '#60a5fa',
  blueDim: 'rgba(96,165,250,0.12)',
  green: '#34d399',
  greenDim: 'rgba(52,211,153,0.12)',
  purple: '#a78bfa',
  purpleDim: 'rgba(167,139,250,0.12)',
  pink: '#f472b6',
  text: '#f1f5f9',
  muted: '#64748b',
  dim: '#334155',
};

// ── Streak config ─────────────────────────────────────────────────────────────
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

function getStreakTier(streak: number): { label: string; color: string; emoji: string; glow: string } {
  if (streak >= 100) return { label: 'Legendary', color: '#fcd34d', emoji: '👑', glow: 'rgba(252,211,77,0.4)' };
  if (streak >= 60)  return { label: 'Master',    color: '#a78bfa', emoji: '💎', glow: 'rgba(167,139,250,0.4)' };
  if (streak >= 30)  return { label: 'Expert',    color: '#f472b6', emoji: '🔥', glow: 'rgba(244,114,182,0.35)' };
  if (streak >= 14)  return { label: 'Pro',        color: '#34d399', emoji: '⚡', glow: 'rgba(52,211,153,0.3)' };
  if (streak >= 7)   return { label: 'Hot',        color: '#f59e0b', emoji: '🌟', glow: 'rgba(245,158,11,0.3)' };
  if (streak >= 3)   return { label: 'Rising',     color: '#60a5fa', emoji: '🚀', glow: 'rgba(96,165,250,0.25)' };
  return               { label: 'New',         color: C.muted,  emoji: '🌱', glow: 'transparent' };
}

function getNextMilestone(streak: number): number | null {
  return STREAK_MILESTONES.find(m => m > streak) ?? null;
}

// ── Tiny sub-components ───────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 20,
      padding: '18px 16px',
      margin: '0 14px 12px',
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontWeight: 800, fontSize: 14, color: C.text, letterSpacing: 0.3 }}>{title}</span>
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{
      width: 52, height: 30, borderRadius: 15, border: 'none',
      background: on ? C.amber : C.dim,
      cursor: 'pointer', position: 'relative', flexShrink: 0,
      transition: 'background 0.25s',
    }}>
      <div style={{
        position: 'absolute', top: 5,
        left: on ? 27 : 5, width: 20, height: 20,
        borderRadius: '50%', background: '#fff',
        transition: 'left 0.25s', boxShadow: '0 1px 6px rgba(0,0,0,0.4)',
      }} />
    </button>
  );
}

// ── Daily Streak Card ─────────────────────────────────────────────────────────

function StreakCard({ streak, longest }: { streak: number; longest: number }) {
  const tier = getStreakTier(streak);
  const next = getNextMilestone(streak);
  const prevMilestone = [...STREAK_MILESTONES].reverse().find(m => m <= streak) ?? 0;
  const progress = next ? Math.min(((streak - prevMilestone) / (next - prevMilestone)) * 100, 100) : 100;

  // 7-day calendar dots
  const days = Array.from({ length: 7 }, (_, i) => i < streak % 7 || streak >= 7);

  return (
    <Card style={{
      background: `linear-gradient(135deg, ${C.surface2} 0%, ${C.surface3} 100%)`,
      border: `1px solid ${tier.glow !== 'transparent' ? tier.glow : C.border}`,
      boxShadow: tier.glow !== 'transparent' ? `0 0 30px ${tier.glow}` : 'none',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Background pattern */}
      <div style={{
        position: 'absolute', top: -20, right: -20,
        fontSize: 100, opacity: 0.04, userSelect: 'none', lineHeight: 1,
        filter: 'blur(2px)',
      }}>{tier.emoji}</div>

      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Daily Login Streak
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 52, fontWeight: 900, color: tier.color, lineHeight: 1 }}>{streak}</span>
            <span style={{ fontSize: 16, color: C.muted, fontWeight: 600 }}>days</span>
          </div>
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          background: `${tier.color}18`, borderRadius: 14, padding: '10px 14px',
          border: `1px solid ${tier.color}30`,
        }}>
          <span style={{ fontSize: 26 }}>{tier.emoji}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: tier.color, letterSpacing: 0.5 }}>{tier.label}</span>
        </div>
      </div>

      {/* 7-day dot tracker */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 0.5 }}>
          Week progress
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['M','T','W','T','F','S','S'].map((d, i) => {
            const filled = streak >= 7 ? true : i < (streak % 7 === 0 && streak > 0 ? 7 : streak % 7);
            return (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  height: 32, borderRadius: 8,
                  background: filled ? tier.color : C.dim,
                  boxShadow: filled && tier.glow !== 'transparent' ? `0 0 8px ${tier.color}60` : 'none',
                  transition: 'all 0.3s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800,
                  color: filled ? '#0a0e1a' : C.muted,
                }}>
                  {filled ? '✓' : ''}
                </div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 3, fontWeight: 600 }}>{d}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Progress to next milestone */}
      {next && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: C.muted }}>Next milestone</span>
            <span style={{ fontSize: 11, color: tier.color, fontWeight: 700 }}>{streak}/{next} days</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: C.dim, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${tier.color}80, ${tier.color})`,
              transition: 'width 0.6s ease',
            }} />
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
            {next - streak} more days to unlock {getStreakTier(next).emoji} {getStreakTier(next).label}
          </div>
        </div>
      )}

      {/* Longest streak */}
      <div style={{
        marginTop: 16, paddingTop: 14,
        borderTop: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, color: C.muted }}>🏆 Personal best</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: C.amberLight }}>{longest} day{longest !== 1 ? 's' : ''}</span>
      </div>
    </Card>
  );
}

// ── Stats Grid ────────────────────────────────────────────────────────────────

function StatsGrid({ gamesPlayed, wins }: { gamesPlayed: number; wins: number }) {
  const winRate = gamesPlayed > 0 ? ((wins / gamesPlayed) * 100).toFixed(1) : '0.0';
  const losses = Math.max(0, gamesPlayed - wins);

  const stats = [
    { label: 'Games',    value: gamesPlayed,       color: C.blue,   icon: '🎮' },
    { label: 'Wins',     value: wins,              color: C.green,  icon: '🏆' },
    { label: 'Losses',   value: losses,            color: C.pink,   icon: '💔' },
    { label: 'Win Rate', value: `${winRate}%`,     color: C.amber,  icon: '📈' },
  ];

  return (
    <Card>
      <SectionTitle icon="📊" title="Game Statistics" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {stats.map(({ label, value, color, icon }) => (
          <div key={label} style={{
            background: C.surface2, borderRadius: 14, padding: '14px 12px',
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2, fontWeight: 600 }}>{label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Achievements ──────────────────────────────────────────────────────────────

function Achievements({ streak, wins, gamesPlayed }: { streak: number; wins: number; gamesPlayed: number }) {
  const badges = [
    { icon: '🌱', label: 'First Login',   unlocked: true,              desc: 'Welcome aboard' },
    { icon: '🎮', label: 'First Game',    unlocked: gamesPlayed >= 1,  desc: 'Play a round' },
    { icon: '🏆', label: 'First Win',     unlocked: wins >= 1,         desc: 'Win a round' },
    { icon: '🚀', label: '3-Day Streak',  unlocked: streak >= 3,       desc: '3 days in a row' },
    { icon: '🌟', label: 'Week Warrior',  unlocked: streak >= 7,       desc: '7-day streak' },
    { icon: '⚡', label: 'Pro Player',    unlocked: streak >= 14,      desc: '14-day streak' },
    { icon: '🔥', label: 'On Fire',       unlocked: streak >= 30,      desc: '30-day streak' },
    { icon: '💎', label: '10 Wins',       unlocked: wins >= 10,        desc: '10 total wins' },
  ];

  return (
    <Card>
      <SectionTitle icon="🎖️" title="Achievements" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {badges.map(({ icon, label, unlocked, desc }) => (
          <div key={label} title={desc} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            padding: '12px 4px', borderRadius: 14,
            background: unlocked ? C.amberDim : C.surface2,
            border: `1px solid ${unlocked ? C.borderGlow : C.border}`,
            opacity: unlocked ? 1 : 0.45,
            transition: 'all 0.2s',
          }}>
            <span style={{ fontSize: 22, filter: unlocked ? 'none' : 'grayscale(1)' }}>{icon}</span>
            <span style={{
              fontSize: 9, color: unlocked ? C.amberLight : C.muted,
              textAlign: 'center', fontWeight: 700, lineHeight: 1.2,
            }}>{label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [referral, setReferral] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('soundOn') !== 'false');
  const [isAgent, setIsAgent] = useState(false);

  useEffect(() => {
    initAuth()
      .then(() => Promise.all([getProfile(), getReferralLink()]))
      .then(([p, r]) => { setProfile(p); setReferral(r); setIsAgent(!!getAgentJwt()); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = useCallback(() => {
    if (!referral) return;
    navigator.clipboard.writeText(referral.referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }, [referral]);

  const toggleSound = useCallback(() => {
    setSoundOn(v => { const n = !v; localStorage.setItem('soundOn', String(n)); return n; });
  }, []);

  if (loading) return <div style={{ minHeight: '100dvh', background: C.bg }} />;
  if (error || !profile) return (
    <div style={{ padding: 32, textAlign: 'center', color: '#f87171', background: C.bg, minHeight: '100dvh' }}>
      {error ?? 'Failed to load'}
    </div>
  );

  const avatar = (profile.username?.[0] ?? '?').toUpperCase();
  const mainBal = Number(profile.mainWallet?.balance ?? 0);
  const playBal = Number(profile.playWallet?.balance ?? 0);
  const streak = profile.loginStreak ?? 1;
  const longest = profile.longestStreak ?? 1;
  const tier = getStreakTier(streak);

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', paddingBottom: 90 }}>

      {/* ── Hero Header ─────────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(160deg, ${C.surface3} 0%, ${C.surface2} 60%, ${C.surface} 100%)`,
        padding: '32px 20px 24px',
        borderBottom: `1px solid ${C.border}`,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative glow */}
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 200, height: 200, borderRadius: '50%',
          background: `radial-gradient(circle, ${tier.glow} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
          {/* Avatar */}
          <div style={{
            width: 72, height: 72, borderRadius: 22,
            background: `linear-gradient(135deg, ${tier.color}, ${C.amber}90)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, fontWeight: 900, color: '#07091a',
            boxShadow: `0 6px 24px ${tier.glow}`,
            flexShrink: 0, letterSpacing: -1,
          }}>{avatar}</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 22, color: C.text, letterSpacing: -0.5 }}>
              @{profile.username}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: tier.color,
                background: `${tier.color}18`, borderRadius: 6,
                padding: '2px 8px', border: `1px solid ${tier.color}30`,
                letterSpacing: 0.5,
              }}>
                {tier.emoji} {tier.label}
              </span>
              {profile.phone_verified
                ? <span style={{ fontSize: 11, color: '#34d399', fontWeight: 600 }}>✅ Verified</span>
                : <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 600 }}>⚠️ Unverified</span>
              }
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 4, fontFamily: 'monospace' }}>
              #{profile.id.slice(-8).toUpperCase()}
            </div>
          </div>

          {/* Streak badge */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            background: `${tier.color}15`, borderRadius: 16,
            padding: '10px 14px', border: `1px solid ${tier.color}35`,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 20 }}>{tier.emoji}</span>
            <span style={{ fontSize: 20, fontWeight: 900, color: tier.color, lineHeight: 1.1 }}>{streak}</span>
            <span style={{ fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: 0.5 }}>DAY{streak !== 1 ? 'S' : ''}</span>
          </div>
        </div>
      </div>

      {/* ── Wallet balances ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '14px 14px 0' }}>
        {[
          { label: 'Main Wallet', value: mainBal, color: C.green, icon: '💰', dim: C.greenDim },
          { label: 'Play Wallet', value: playBal, color: C.blue,  icon: '🎮', dim: C.blueDim  },
        ].map(({ label, value, color, icon, dim }) => (
          <div key={label} style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 18, padding: '16px 14px',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: dim, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 18, marginBottom: 10,
            }}>{icon}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color }}>{formatMoney(value)}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3, fontWeight: 600 }}>Birr · {label}</div>
          </div>
        ))}
      </div>

      {/* ── Daily Streak ─────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 14 }}>
        <StreakCard streak={streak} longest={longest} />
      </div>

      {/* ── Game Stats ───────────────────────────────────────────────────────── */}
      <StatsGrid gamesPlayed={profile.totalGamesPlayed ?? 0} wins={profile.totalWins ?? 0} />

      {/* ── Achievements ─────────────────────────────────────────────────────── */}
      <Achievements streak={streak} wins={profile.totalWins ?? 0} gamesPlayed={profile.totalGamesPlayed ?? 0} />

      {/* ── Referral ─────────────────────────────────────────────────────────── */}
      {referral && (
        <Card>
          <SectionTitle icon="👥" title="Referral Program" />
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input readOnly value={referral.referralLink} style={{
              flex: 1, padding: '11px 12px',
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
              borderRadius: 12, fontSize: 12, color: C.muted, outline: 'none',
            }} />
            <button onClick={handleCopy} style={{
              padding: '11px 18px',
              background: copied ? '#059669' : C.amber,
              color: '#07091a', border: 'none', borderRadius: 12,
              cursor: 'pointer', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap',
              flexShrink: 0, transition: 'background 0.2s',
            }}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: C.surface2, borderRadius: 12, padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: C.amber }}>{referral.totalReferrals}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3, fontWeight: 600 }}>Friends Invited</div>
            </div>
            <div style={{ background: C.surface2, borderRadius: 12, padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: C.green }}>{formatMoney(referral.totalEarnings ?? 0)}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3, fontWeight: 600 }}>Birr Earned</div>
            </div>
          </div>
        </Card>
      )}

      {/* ── Preferences ──────────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle icon="⚙️" title="Preferences" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>🔊 Number Sound</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Play audio when numbers are called</div>
          </div>
          <Toggle on={soundOn} onToggle={toggleSound} />
        </div>
      </Card>

      {/* ── Agent Dashboard ───────────────────────────────────────────────── */}
      {isAgent && (
        <Card>
          <button
            onClick={() => navigate('/agent/dashboard')}
            style={{
              display: 'block', width: '100%',
              background: 'linear-gradient(135deg,#10b981,#059669)',
              border: 'none', borderRadius: 14, padding: '16px 18px',
              cursor: 'pointer', textAlign: 'left',
              boxShadow: '0 6px 20px rgba(16,185,129,0.28)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📊</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', marginBottom: 2 }}>Agent Dashboard</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)' }}>Referrals & earnings</div>
                </div>
              </div>
              <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)' }}>→</span>
            </div>
          </button>
        </Card>
      )}

      {/* ── Account Info ─────────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle icon="ℹ️" title="Account" />
        {[
          { label: 'Member Since', value: new Date(profile.created_at).toLocaleDateString('en-ET', { year: 'numeric', month: 'short', day: 'numeric' }) },
          { label: 'Player ID',    value: `#${profile.id.slice(-8).toUpperCase()}` },
          { label: 'Phone',        value: profile.phone_verified ? `${profile.phone ?? ''} ✅` : 'Not verified ⚠️' },
        ].map(({ label, value }, i, arr) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '13px 0',
            borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
          }}>
            <span style={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 600 }}>{label}</span>
            <span style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>{value}</span>
          </div>
        ))}
      </Card>

    </div>
  );
}
