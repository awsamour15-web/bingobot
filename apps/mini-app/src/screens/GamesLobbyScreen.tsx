import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownToLine, ArrowLeft, ChevronDown, Eye, Gift, History, MessageCircle, MoreVertical, Trophy, WalletCards } from 'lucide-react';
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
  logoSrc?: string;
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
    logoSrc: '/keno-logo.svg',
    gradient: 'linear-gradient(135deg,#003322 0%,#001a11 55%,#000d09 100%)',
    glowColor: 'rgba(34,197,94,0.3)',
    route: '/keno',
    tag: 'LIVE',
    tagColor: '#22c55e',
    available: true,
    bonusNote: '💳 Deposit required',
    bonusNoteColor: '#f59e0b',
    category: 'live',
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
        minHeight: game.category === 'coming' ? 128 : 218,
        background: '#09201b',
        border: `1px solid ${isAvailable ? 'rgba(183,138,31,0.5)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 17,
        padding: 0,
        cursor: isAvailable ? 'pointer' : 'default',
        textAlign: 'left',
        overflow: 'hidden',
        opacity: isAvailable ? 1 : 0.6,
        boxShadow: isAvailable
          ? '0 10px 24px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.1)'
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
      <div style={{ position: 'relative', flex: 1, minHeight: game.category === 'coming' ? 94 : 181, background: game.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 20%, rgba(255,210,70,0.24), transparent 42%), linear-gradient(145deg, transparent 35%, rgba(0,0,0,0.45))' }} />
        <div style={{ position: 'absolute', top: 8, left: 9, color: '#f8d15c', fontSize: 8, fontWeight: 900, letterSpacing: '0.08em' }}>FIDEL</div>
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: 8 }}>
          <div style={{ fontSize: game.category === 'coming' ? 34 : 58, filter: 'drop-shadow(0 8px 7px rgba(0,0,0,0.5))' }}>{game.emoji}</div>
          <div style={{ marginTop: 5, color: '#fff3bd', fontSize: game.title.length > 11 ? 17 : 22, fontWeight: 1000, fontStyle: 'italic', lineHeight: 0.95, textTransform: 'uppercase', textShadow: '2px 3px 0 rgba(90,30,0,0.7)' }}>{game.title}</div>
        </div>
        <div style={{ position: 'absolute', top: 9, right: 8, fontSize: 8, fontWeight: 900, color: '#fff', background: game.category === 'coming' ? '#64748b' : '#ef5350', borderRadius: 8, padding: '4px 6px', letterSpacing: '0.06em' }}>{game.category === 'coming' ? 'SOON' : 'HOT'}</div>
      </div>
      <div style={{ minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', background: '#092a20', color: game.category === 'coming' ? '#8aa49b' : '#f2c43d', fontSize: 10, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{game.title}</div>
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

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(180deg,#061c17 0%,#020b09 30%,#010605 100%)',
      color: '#f8fafc', maxWidth: 480, margin: '0 auto', paddingBottom: 100, overflow: 'hidden',
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
        .lobby-action:active { transform: scale(0.98); }
        .lobby-card:focus-within { outline: 2px solid #f7c948; outline-offset: 3px; }
      `}</style>

      <div style={{
        height: 58, padding: '0 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#1c2835', color: '#f7f7f4',
      }}>
        <button onClick={() => navigate(-1)} aria-label="Go back" style={{ background: 'none', border: 0, color: '#fff', padding: 4, cursor: 'pointer' }}><ArrowLeft size={30} strokeWidth={2.5} /></button>
        <div style={{ fontSize: 31, fontWeight: 900, letterSpacing: '-1.2px' }}>Kana Games</div>
        <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}><ChevronDown size={28} /><MoreVertical size={28} /></div>
      </div>

      <div style={{ height: 122, padding: '20px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(217,166,44,0.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(145deg,#ffd52e,#eda900)', color: '#102018', display: 'grid', placeItems: 'center', fontSize: 35, fontWeight: 900, boxShadow: '0 0 24px rgba(246,190,28,0.2)' }}>ფ</div><div><div style={{ fontSize: 23, fontWeight: 900 }}>ፊደል</div><div style={{ fontSize: 13, color: '#eec13d', letterSpacing: '0.3em', fontWeight: 900 }}>GAMES</div></div></div>
        <button onClick={() => navigate('/wallet')} style={{ width: 178, height: 67, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 13px', background: '#03130f', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 25, color: '#fff', cursor: 'pointer' }}><div style={{ textAlign: 'left', lineHeight: 1.8, fontSize: 11, fontWeight: 900, color: '#99a5a4' }}><div>WALLET <span style={{ color: '#e8af27', letterSpacing: 4 }}>••••</span></div><div>BONUS <span style={{ color: '#20d67a', letterSpacing: 4 }}>••••</span></div></div><Eye size={23} color="#65706e" /></button>
      </div>

      <div style={{ margin: '14px 20px 0', height: 180, borderRadius: 40, border: '1px solid rgba(222,171,48,0.3)', background: 'radial-gradient(circle at 86% 54%, rgba(207,142,28,0.34), transparent 29%), linear-gradient(125deg,#09231c,#061712)', position: 'relative', overflow: 'hidden', padding: '28px 32px', boxSizing: 'border-box' }}>
        <div style={{ color: '#bfcac2', fontSize: 12, fontWeight: 900, letterSpacing: '0.12em' }}><Gift size={17} fill="#f6c529" color="#f6c529" style={{ verticalAlign: 'middle', marginRight: 7 }} /> DAILY GIFT</div><div style={{ marginTop: 12, fontSize: 29, fontWeight: 1000, fontStyle: 'italic' }}>GET <span style={{ color: '#f1bf24' }}>BONUS</span></div><button onClick={() => navigate('/bingo')} style={{ marginTop: 16, border: 0, borderRadius: 30, padding: '12px 24px', background: '#eea900', color: '#101710', fontWeight: 900, cursor: 'pointer' }}>CLAIM NOW 🎁</button><div style={{ position: 'absolute', right: 35, top: 37, fontSize: 62, filter: 'drop-shadow(0 12px 10px rgba(0,0,0,0.45))' }}>🎁</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '38px 20px 0' }}>
        {[['/wallet', <WalletCards size={31} />, 'DEPOSIT'], ['/wallet', <ArrowDownToLine size={31} />, 'WITHDRAW'], ['/history', <History size={31} />, 'HISTORY'], ['/wallet', <MessageCircle size={31} />, 'SUPPORT']].map(([route, icon, label]) => <button key={String(label)} onClick={() => navigate(String(route))} style={{ minWidth: 0, height: 105, borderRadius: 25, border: '1px solid rgba(58,119,96,0.25)', background: '#061a14', color: '#aab5b3', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer' }}><span style={{ color: '#dfa91e' }}>{icon}</span><span style={{ fontSize: 11, fontWeight: 900 }}>{label}</span></button>)}
      </div>

      <div style={{ padding: '54px 20px 0' }}><div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 23, fontWeight: 1000, fontStyle: 'italic' }}><Trophy size={25} color="#f0bc26" /> TOP SELECTION</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 22 }}>{availableGames.map((game, i) => <div key={game.id} className="lobby-card" style={{ animation: `lobbySlideUp 0.35s cubic-bezier(0.22,1,0.36,1) ${i * 0.05}s both` }}><GameCard game={game} kenoAllowed={kenoAllowed} plinkoAllowed={plinkoAllowed} /></div>)}</div></div>

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
