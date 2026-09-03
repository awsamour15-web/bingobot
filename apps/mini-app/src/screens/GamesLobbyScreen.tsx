import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { initAuth, getAgentJwt } from '../lib/auth';
import { getProfile, checkKenoAccess, checkPlinkoAccess, redeemCoupon } from '../lib/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Game {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  gradient: string;
  glowColor: string;
  badge?: string;
  badgeColor?: string;
  route: string;
  rtp?: string;
  tag: string;
  tagColor: string;
  available: boolean;
  bonusNote?: string;
  bonusNoteColor?: string;
  category: 'live' | 'slots' | 'crash' | 'numbers' | 'coming';
}

interface Announcement {
  id: string;
  emoji: string;
  title: string;
  body: string;
  cta?: string;
  ctaRoute?: string;
  gradient: string;
  accentColor: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'welcome-bonus',
    emoji: '🎁',
    title: 'Welcome Bonus Active',
    body: 'New players get free play credits. Join Fidel Bingo and use your bonus right now!',
    cta: 'Claim Now',
    ctaRoute: '/bingo',
    gradient: 'linear-gradient(135deg,#1a3a5c 0%,#0d2240 60%,#071020 100%)',
    accentColor: '#f59e0b',
  },
  {
    id: 'jackpot',
    emoji: '🏆',
    title: 'Big Jackpot This Week',
    body: 'Top bingo winner takes home up to 40,000 ETB. Live games running 24/7.',
    cta: 'Play Bingo',
    ctaRoute: '/bingo',
    gradient: 'linear-gradient(135deg,#2d1b00 0%,#1a1000 60%,#0a0800 100%)',
    accentColor: '#f59e0b',
  },
  {
    id: 'aviator-launch',
    emoji: '🚀',
    title: 'Aviator is Live',
    body: 'Cash out at the perfect moment. The earlier you cash out, the safer your win.',
    cta: 'Fly Now',
    ctaRoute: '/crash',
    gradient: 'linear-gradient(135deg,#2a0a1a 0%,#180614 60%,#07050d 100%)',
    accentColor: '#ef4444',
  },
  {
    id: 'referral',
    emoji: '👥',
    title: 'Invite Friends, Earn Birr',
    body: 'Refer a friend who deposits and you both get bonus credits. No limit on referrals.',
    cta: 'Invite',
    ctaRoute: '/wallet',
    gradient: 'linear-gradient(135deg,#002d1a 0%,#001a0f 60%,#000a07 100%)',
    accentColor: '#22c55e',
  },
];

const GAMES: Game[] = [
  {
    id: 'bingo',
    title: 'Fidel Bingo',
    subtitle: 'Live multiplayer • Win up to 40K ETB',
    emoji: '🎯',
    gradient: 'linear-gradient(135deg,#1e3a5f 0%,#0f2140 55%,#0a1628 100%)',
    glowColor: 'rgba(245,158,11,0.35)',
    badge: 'LIVE',
    badgeColor: '#ef4444',
    route: '/bingo',
    tag: '🔥 HOT',
    tagColor: '#f59e0b',
    available: true,
    bonusNote: '🎁 Bonus accepted',
    bonusNoteColor: '#22c55e',
    category: 'live',
  },
  {
    id: 'crash',
    title: 'Aviator',
    subtitle: 'Cash out before the crash',
    emoji: '🚀',
    gradient: 'linear-gradient(135deg,#351525 0%,#180b17 55%,#07070d 100%)',
    glowColor: 'rgba(239,68,68,0.35)',
    route: '/crash',
    tag: 'LIVE',
    tagColor: '#ef4444',
    available: true,
    bonusNote: '⚡ Instant payouts',
    bonusNoteColor: '#22c55e',
    category: 'crash',
  },
  {
    id: 'slots',
    title: 'Multi Hot 5',
    subtitle: 'Slots • 5 paylines • Multiplier reel',
    emoji: '🎰',
    gradient: 'linear-gradient(135deg,#3b1f00 0%,#1e1100 55%,#0d0800 100%)',
    glowColor: 'rgba(245,158,11,0.3)',
    route: '/slots',
    rtp: '96% RTP',
    tag: 'NEW',
    tagColor: '#10b981',
    available: true,
    bonusNote: '💳 Deposit required',
    bonusNoteColor: '#f59e0b',
    category: 'slots',
  },
  {
    id: 'keno',
    title: 'Fast Keno',
    subtitle: 'Pick 1–10 numbers • Draw every 45s',
    emoji: '🔢',
    gradient: 'linear-gradient(135deg,#003322 0%,#001a11 55%,#000d09 100%)',
    glowColor: 'rgba(34,197,94,0.3)',
    route: '/keno',
    tag: 'NEW',
    tagColor: '#22c55e',
    available: true,
    bonusNote: '💳 Deposit required',
    bonusNoteColor: '#f59e0b',
    category: 'numbers',
  },
  {
    id: 'plinko',
    title: 'Plinko',
    subtitle: 'Drop the ball • Bounce to big wins',
    emoji: '🎱',
    gradient: 'linear-gradient(135deg,#0a1f3c 0%,#051020 55%,#020810 100%)',
    glowColor: 'rgba(99,102,241,0.3)',
    route: '/plinko',
    tag: 'NEW',
    tagColor: '#818cf8',
    available: true,
    bonusNote: '💳 Deposit required',
    bonusNoteColor: '#f59e0b',
    category: 'numbers',
  },
  {
    id: 'minesweeper',
    title: 'Minesweeper',
    subtitle: 'Reveal tiles • Avoid the mines',
    emoji: '💣',
    gradient: 'linear-gradient(135deg,#1a1f0a 0%,#0f1305 55%,#060802 100%)',
    glowColor: 'rgba(234,179,8,0.3)',
    route: '/minesweeper',
    tag: 'NEW',
    tagColor: '#eab308',
    available: true,
    bonusNote: '⚡ Instant results',
    bonusNoteColor: '#22c55e',
    category: 'numbers',
  },
  {
    id: 'dice',
    title: 'Lucky Dice',
    subtitle: 'Roll & win • Instant results',
    emoji: '🎲',
    gradient: 'linear-gradient(135deg,#1f0a2e 0%,#100518 55%,#07030e 100%)',
    glowColor: 'rgba(236,72,153,0.25)',
    route: '/dice',
    tag: 'SOON',
    tagColor: '#64748b',
    available: false,
    category: 'coming',
  },
  {
    id: 'spin',
    title: 'Spin & Win',
    subtitle: 'Fortune wheel • Spin for prizes',
    emoji: '🎡',
    gradient: 'linear-gradient(135deg,#001f3f 0%,#001020 55%,#00080f 100%)',
    glowColor: 'rgba(59,130,246,0.25)',
    route: '/spin',
    tag: 'SOON',
    tagColor: '#64748b',
    available: false,
    category: 'coming',
  },
  {
    id: 'poker',
    title: 'Video Poker',
    subtitle: 'Classic 5-card poker hand',
    emoji: '♠️',
    gradient: 'linear-gradient(135deg,#1a0505 0%,#0d0303 55%,#070202 100%)',
    glowColor: 'rgba(239,68,68,0.2)',
    route: '/poker',
    tag: 'SOON',
    tagColor: '#64748b',
    available: false,
    category: 'coming',
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function AnnouncementBanner({ ann, onClick }: { ann: Announcement; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: ann.gradient,
        border: `1px solid ${ann.accentColor}28`,
        borderRadius: 20,
        padding: '18px 16px',
        minWidth: 280,
        cursor: 'pointer',
        flexShrink: 0,
        boxShadow: `0 12px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      {/* glow blob */}
      <div style={{
        position: 'absolute', top: -20, right: -20, width: 100, height: 100,
        borderRadius: '50%', background: ann.accentColor + '20', filter: 'blur(30px)', pointerEvents: 'none',
      }} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', position: 'relative' }}>
        <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>{ann.emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#f1f5f9', marginBottom: 4, letterSpacing: '-0.2px' }}>
            {ann.title}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(203,213,225,0.7)', lineHeight: 1.5, marginBottom: ann.cta ? 10 : 0 }}>
            {ann.body}
          </div>
          {ann.cta && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 10, fontWeight: 900, letterSpacing: '0.06em',
              color: ann.accentColor,
              background: ann.accentColor + '18',
              border: `1px solid ${ann.accentColor}40`,
              borderRadius: 8, padding: '4px 10px',
            }}>
              {ann.cta} <span style={{ fontSize: 11 }}>→</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GameCard({ game, kenoAllowed, plinkoAllowed }: { game: Game; kenoAllowed: boolean; plinkoAllowed: boolean }) {
  const navigate = useNavigate();
  const isRestricted = (game.id === 'keno' && !kenoAllowed) || (game.id === 'plinko' && !plinkoAllowed);
  const isAvailable = game.available && !isRestricted;

  function handleClick() {
    if (!isAvailable) return;
    navigate(game.route);
  }

  return (
    <button
      onClick={handleClick}
      disabled={!isAvailable}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        minHeight: game.category === 'coming' ? 110 : 152,
        background: game.gradient,
        border: `1px solid ${isAvailable ? game.glowColor.replace(/[\d.]+\)$/, '0.4)') : 'rgba(255,255,255,0.04)'}`,
        borderRadius: 20,
        padding: '16px 14px 14px',
        cursor: isAvailable ? 'pointer' : 'default',
        textAlign: 'left',
        overflow: 'hidden',
        opacity: isAvailable ? 1 : 0.6,
        boxShadow: isAvailable
          ? `0 14px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)`
          : '0 6px 16px rgba(0,0,0,0.25)',
        transition: 'transform 0.16s ease, box-shadow 0.16s ease',
      }}
      onMouseEnter={e => {
        if (!isAvailable) return;
        const el = e.currentTarget as HTMLButtonElement;
        el.style.transform = 'translateY(-3px)';
        el.style.boxShadow = `0 22px 50px rgba(0,0,0,0.5), 0 0 24px ${game.glowColor}, inset 0 1px 0 rgba(255,255,255,0.1)`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = isAvailable
          ? '0 14px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)'
          : '0 6px 16px rgba(0,0,0,0.25)';
      }}
    >
      {/* glow orb */}
      <div style={{
        position: 'absolute', top: -20, right: -20, width: 100, height: 100,
        borderRadius: '50%', background: game.glowColor, filter: 'blur(32px)', pointerEvents: 'none',
      }} />

      {/* top: emoji + tags */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 14,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, flexShrink: 0,
          boxShadow: '0 6px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}>{game.emoji}</div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {game.badge && (
            <div style={{
              fontSize: 8, fontWeight: 900, letterSpacing: '0.12em', color: '#fff',
              background: 'rgba(239,68,68,0.85)', border: '1px solid rgba(239,68,68,0.5)',
              borderRadius: 7, padding: '2px 6px',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff', display: 'inline-block', animation: 'lobbyPulse 1.2s ease-in-out infinite' }} />
              {game.badge}
            </div>
          )}
          <div style={{
            fontSize: 8, fontWeight: 900, letterSpacing: '0.1em',
            color: game.tagColor, background: game.tagColor + '22',
            border: `1px solid ${game.tagColor}44`, borderRadius: 7, padding: '2px 6px',
          }}>{game.tag}</div>
        </div>
      </div>

      {/* title + subtitle */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.3px', marginBottom: 3 }}>
          {game.title}
        </div>
        {game.category !== 'coming' && (
          <div style={{ fontSize: 10, color: 'rgba(203,213,225,0.65)', fontWeight: 500, lineHeight: 1.4 }}>
            {game.subtitle}
          </div>
        )}
        {game.bonusNote && game.category !== 'coming' && (
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            marginTop: 6, fontSize: 8, fontWeight: 800, letterSpacing: '0.05em',
            color: game.bonusNoteColor,
            background: game.bonusNoteColor + '18',
            border: `1px solid ${game.bonusNoteColor}40`,
            borderRadius: 6, padding: '2px 6px',
          }}>{game.bonusNote}</div>
        )}
      </div>

      {/* bottom */}
      {game.category !== 'coming' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          {game.rtp && (
            <div style={{ fontSize: 9, color: 'rgba(148,163,184,0.8)', fontWeight: 700 }}>{game.rtp}</div>
          )}
          <div style={{
            marginLeft: 'auto',
            fontSize: 10, fontWeight: 800, color: '#f8fafc',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 9, padding: '4px 10px',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>Play <span style={{ fontSize: 12 }}>→</span></div>
        </div>
      )}
    </button>
  );
}

function CouponBox() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);

  async function handleRedeem() {
    if (!code.trim()) return;
    setStatus('loading');
    setMsg('');
    try {
      const res = await redeemCoupon(code.trim());
      setStatus('success');
      setMsg(res.message);
      setCode('');
    } catch (err: any) {
      setStatus('error');
      const errBody = err?.responseData ?? err;
      setMsg(errBody?.message ?? 'Invalid or expired coupon code');
    }
  }

  return (
    <div style={{
      margin: '0 16px',
      background: 'linear-gradient(135deg,#0d2240 0%,#07111e 100%)',
      border: '1px solid rgba(245,158,11,0.2)',
      borderRadius: 20,
      overflow: 'hidden',
    }}>
      {/* header toggle */}
      <button
        onClick={() => { setOpen(o => !o); setStatus('idle'); setMsg(''); }}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>🎟️</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#f1f5f9', letterSpacing: '-0.2px' }}>
              Have a Coupon Code?
            </div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginTop: 1 }}>
              Tap to enter promo code
            </div>
          </div>
        </div>
        <span style={{ fontSize: 16, color: '#64748b', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          ▾
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={code}
              onChange={e => { setCode(e.target.value.toUpperCase()); setStatus('idle'); setMsg(''); }}
              onKeyDown={e => e.key === 'Enter' && handleRedeem()}
              placeholder="e.g. FIDEL50"
              maxLength={24}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${status === 'error' ? 'rgba(239,68,68,0.5)' : status === 'success' ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 12, padding: '11px 14px',
                fontSize: 14, fontWeight: 800, color: '#f1f5f9',
                letterSpacing: '0.08em', outline: 'none',
              }}
            />
            <button
              onClick={handleRedeem}
              disabled={!code.trim() || status === 'loading'}
              style={{
                background: code.trim() ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'rgba(255,255,255,0.06)',
                border: 'none', borderRadius: 12, padding: '11px 18px',
                fontSize: 13, fontWeight: 900, color: code.trim() ? '#0a0e1a' : '#475569',
                cursor: code.trim() ? 'pointer' : 'default',
                transition: 'background 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {status === 'loading' ? '...' : 'Redeem'}
            </button>
          </div>
          {msg && (
            <div style={{
              marginTop: 10, padding: '10px 14px',
              background: status === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${status === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              borderRadius: 10,
              fontSize: 12, fontWeight: 700,
              color: status === 'success' ? '#4ade80' : '#f87171',
            }}>{msg}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GamesLobbyScreen() {
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isAgent, setIsAgent] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);
  const [kenoAllowed, setKenoAllowed] = useState(false);
  const [plinkoAllowed, setPlinkoAllowed] = useState(false);
  const [annIdx, setAnnIdx] = useState(0);
  const annScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        await initAuth();
        const [profile, kenoAccess, plinkoAccess] = await Promise.all([
          getProfile(),
          checkKenoAccess().catch(() => ({ allowed: false })),
          checkPlinkoAccess().catch(() => ({ allowed: false })),
        ]);
        if (!cancelled) {
          setBalance(profile.mainWallet.balance + profile.playWallet.balance);
          setUsername(profile.username ?? null);
          setIsAgent(!!getAgentJwt());
          setIsSuspended(profile.is_suspended);
          setKenoAllowed(kenoAccess.allowed);
          setPlinkoAllowed(plinkoAccess.allowed);
        }
      } catch { /* ignore */ }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Auto-scroll announcements
  useEffect(() => {
    const timer = setInterval(() => {
      setAnnIdx(i => {
        const next = (i + 1) % ANNOUNCEMENTS.length;
        annScrollRef.current?.scrollTo({ left: next * 296, behavior: 'smooth' });
        return next;
      });
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  if (isSuspended) {
    return (
      <div style={{
        minHeight: '100dvh',
        background: 'linear-gradient(180deg,#07111e 0%,#050b18 50%,#030710 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '0 24px', textAlign: 'center', gap: 16,
      }}>
        <div style={{ fontSize: 56 }}>🚫</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#f87171' }}>Account Suspended</div>
        <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, maxWidth: 300 }}>
          መለያዎ ታግዷል። እባክዎ ድጋፍ ያግኙ።{'\n'}
          Your account has been suspended. Please contact support.
        </div>
      </div>
    );
  }

  const availableGames = GAMES.filter(g => {
    if (g.id === 'keno') return kenoAllowed;
    if (g.id === 'plinko') return plinkoAllowed;
    return true;
  });

  const liveGames   = availableGames.filter(g => g.category === 'live' || g.category === 'crash');
  const otherGames  = availableGames.filter(g => g.category !== 'live' && g.category !== 'crash' && g.category !== 'coming');
  const comingGames = availableGames.filter(g => g.category === 'coming');

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'radial-gradient(ellipse at 50% -20%,rgba(245,158,11,0.06) 0%,transparent 55%), linear-gradient(180deg,#07111e 0%,#050b18 50%,#030710 100%)',
      color: '#f8fafc', maxWidth: 480, margin: '0 auto', paddingBottom: 100,
    }}>
      <style>{`
        @keyframes lobbyPulse {
          0%,100% { opacity:0.6; transform:scale(1); }
          50%      { opacity:1;   transform:scale(1.25); }
        }
        @keyframes lobbySlideUp {
          from { transform:translateY(16px); opacity:0; }
          to   { transform:translateY(0);    opacity:1; }
        }
        @keyframes lobbyFadeIn {
          from { opacity:0; }
          to   { opacity:1; }
        }
        .ann-scroll::-webkit-scrollbar { display:none; }
      `}</style>

      {/* ── Sticky header ─────────────────────────────────────────── */}
      <div style={{
        padding: '18px 18px 14px',
        background: 'rgba(3,7,14,0.75)',
        backdropFilter: 'blur(18px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 13,
              background: 'linear-gradient(135deg,#f59e0b,#d97706)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: 16, color: '#0a0e1a',
              boxShadow: '0 4px 16px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
            }}>FB</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.4px', color: '#f1f5f9' }}>
                {username ? `Hey, ${username} 👋` : 'Fidel Games'}
              </div>
              <div style={{ fontSize: 9, color: '#475569', fontWeight: 700, letterSpacing: '0.1em', marginTop: 1 }}>
                CHOOSE YOUR GAME
              </div>
            </div>
          </div>

          {/* balance */}
          <button
            onClick={() => navigate('/wallet')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 13, padding: '7px 13px',
              cursor: 'pointer', textAlign: 'right',
            }}
          >
            <div style={{ fontSize: 8, color: '#475569', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Balance</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fff7e6', letterSpacing: '-0.4px' }}>
              {balance !== null ? balance.toFixed(2) : '—'}
              <span style={{ fontSize: 8, color: '#d89b2b', fontWeight: 800, marginLeft: 3 }}>ETB</span>
            </div>
          </button>
        </div>
      </div>

      {/* ── Announcements carousel ────────────────────────────────── */}
      <div style={{ padding: '18px 0 0', animation: 'lobbySlideUp 0.35s cubic-bezier(0.22,1,0.36,1)' }}>
        <div style={{ padding: '0 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 10, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            📢 Announcements
          </div>
          {/* dot indicators */}
          <div style={{ display: 'flex', gap: 4 }}>
            {ANNOUNCEMENTS.map((a, i) => (
              <div key={a.id} style={{
                width: i === annIdx ? 16 : 5, height: 5, borderRadius: 4,
                background: i === annIdx ? '#f59e0b' : 'rgba(255,255,255,0.15)',
                transition: 'width 0.3s ease, background 0.3s ease',
              }} />
            ))}
          </div>
        </div>

        <div
          ref={annScrollRef}
          className="ann-scroll"
          style={{
            display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x mandatory',
            paddingLeft: 16, paddingRight: 16, scrollbarWidth: 'none',
          }}
          onScroll={e => {
            const el = e.currentTarget;
            const idx = Math.round(el.scrollLeft / 296);
            setAnnIdx(idx);
          }}
        >
          {ANNOUNCEMENTS.map(ann => (
            <div key={ann.id} style={{ scrollSnapAlign: 'start', flexShrink: 0, width: 280 }}>
              <AnnouncementBanner ann={ann} onClick={() => ann.ctaRoute && navigate(ann.ctaRoute)} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Coupon box ────────────────────────────────────────────── */}
      <div style={{ marginTop: 16, animation: 'lobbySlideUp 0.4s cubic-bezier(0.22,1,0.36,1) 0.05s both' }}>
        <CouponBox />
      </div>

      {/* ── Live & Featured games ─────────────────────────────────── */}
      <div style={{ padding: '22px 16px 0', animation: 'lobbySlideUp 0.4s cubic-bezier(0.22,1,0.36,1) 0.1s both' }}>
        <SectionLabel title="🔴 Live Games" count={liveGames.length} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
          {liveGames.map((game, i) => (
            <div key={game.id} style={{ animation: `lobbySlideUp 0.35s cubic-bezier(0.22,1,0.36,1) ${i * 0.06 + 0.15}s both` }}>
              <GameCard game={game} kenoAllowed={kenoAllowed} plinkoAllowed={plinkoAllowed} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Other available games ──────────────────────────────────── */}
      {otherGames.length > 0 && (
        <div style={{ padding: '22px 16px 0' }}>
          <SectionLabel title="🎮 More Games" count={otherGames.length} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
            {otherGames.map((game, i) => (
              <div key={game.id} style={{ animation: `lobbySlideUp 0.35s cubic-bezier(0.22,1,0.36,1) ${i * 0.06 + 0.2}s both` }}>
                <GameCard game={game} kenoAllowed={kenoAllowed} plinkoAllowed={plinkoAllowed} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Coming soon row ───────────────────────────────────────── */}
      {comingGames.length > 0 && (
        <div style={{ padding: '22px 16px 0' }}>
          <SectionLabel title="⏳ Coming Soon" count={comingGames.length} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
            {comingGames.map((game, i) => (
              <div key={game.id} style={{ animation: `lobbySlideUp 0.35s cubic-bezier(0.22,1,0.36,1) ${i * 0.05 + 0.25}s both` }}>
                <GameCard game={game} kenoAllowed={kenoAllowed} plinkoAllowed={plinkoAllowed} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Agent button ──────────────────────────────────────────── */}
      {isAgent && (
        <div style={{ padding: '20px 16px 0' }}>
          <button
            onClick={() => navigate('/agent/dashboard')}
            style={{
              display: 'block', width: '100%',
              background: 'linear-gradient(135deg,#10b981,#059669)',
              border: 'none', borderRadius: 18, padding: '16px 18px',
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
        </div>
      )}
    </div>
  );
}

function SectionLabel({ title, count }: { title: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {title}
      </div>
      <div style={{ fontSize: 10, color: '#334155', fontWeight: 700 }}>{count} games</div>
    </div>
  );
}
