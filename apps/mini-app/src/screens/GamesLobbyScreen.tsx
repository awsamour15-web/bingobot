import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Gift, TicketPercent, Trophy } from 'lucide-react';
import { initAuth, getAgentJwt } from '../lib/auth';
import { getProfile, checkKenoAccess, checkPlinkoAccess, checkRoyalDropAccess, redeemCoupon, getAvailableCoupons, type AvailableCoupon } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Game {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  logoSrc?: string;
  posterSrc?: string;
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

// ─── Data ─────────────────────────────────────────────────────────────────────

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
    logoSrc: '/posters/aviator-seeklogo.png',
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
    posterSrc: '/posters/Multi-Hot-5-6924003_s.jpg',
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
    posterSrc: '/posters/Keno-Atlas-V-7028539_s.jpg',
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
    posterSrc: '/posters/plinko.jpg',
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
    id: 'royal-drop',
    title: 'Royal Drop',
    subtitle: 'Rockets destroy crates • Open chests to win',
    emoji: '👑',
    gradient: 'linear-gradient(135deg,#2a1a00 0%,#1a0e00 55%,#0d0800 100%)',
    glowColor: 'rgba(245,197,24,0.35)',
    route: '/royal-drop',
    tag: 'NEW',
    tagColor: '#f5c518',
    available: true,
    bonusNote: '💳 Deposit required',
    bonusNoteColor: '#f59e0b',
    category: 'slots',
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
  {
    id: 'roulette',
    title: 'Royal Roulette',
    subtitle: 'Classic roulette • Big table energy',
    emoji: '🎰',
    gradient: 'linear-gradient(145deg,#174d45 0%,#102c2b 52%,#100f1c 100%)',
    glowColor: 'rgba(243,207,100,0.24)',
    route: '/roulette',
    tag: 'SOON',
    tagColor: '#64748b',
    available: false,
    category: 'coming',
  },
  {
    id: 'blackjack',
    title: 'Blackjack 21',
    subtitle: 'Beat the dealer • Classic table game',
    emoji: '🂡',
    gradient: 'linear-gradient(145deg,#244d3d 0%,#122d28 52%,#0b111d 100%)',
    glowColor: 'rgba(99,212,186,0.22)',
    route: '/blackjack',
    tag: 'SOON',
    tagColor: '#64748b',
    available: false,
    category: 'coming',
  },
  {
    id: 'baccarat',
    title: 'Baccarat',
    subtitle: 'Player or banker • Table classic',
    emoji: '🃏',
    gradient: 'linear-gradient(145deg,#51332d 0%,#2d1b27 52%,#100f1c 100%)',
    glowColor: 'rgba(243,207,100,0.22)',
    route: '/baccarat',
    tag: 'SOON',
    tagColor: '#64748b',
    available: false,
    category: 'coming',
  },
  {
    id: 'sicbo',
    title: 'Sic Bo',
    subtitle: 'Three dice • Fast table action',
    emoji: '🎲',
    gradient: 'linear-gradient(145deg,#4a345f 0%,#252143 52%,#0c101d 100%)',
    glowColor: 'rgba(168,139,250,0.22)',
    route: '/sicbo',
    tag: 'SOON',
    tagColor: '#64748b',
    available: false,
    category: 'coming',
  },
  {
    id: 'casino-war',
    title: 'Casino War',
    subtitle: 'Cards down • Instant showdown',
    emoji: '⚔️',
    gradient: 'linear-gradient(145deg,#57352e 0%,#322027 52%,#100d18 100%)',
    glowColor: 'rgba(248,113,113,0.22)',
    route: '/casino-war',
    tag: 'SOON',
    tagColor: '#64748b',
    available: false,
    category: 'coming',
  },
  {
    id: 'hi-lo',
    title: 'Hi-Lo',
    subtitle: 'Predict the next card • Quick wins',
    emoji: '⬆️',
    gradient: 'linear-gradient(145deg,#244569 0%,#182c4a 52%,#0b101d 100%)',
    glowColor: 'rgba(125,211,252,0.22)',
    route: '/hi-lo',
    tag: 'SOON',
    tagColor: '#64748b',
    available: false,
    category: 'coming',
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function GameCard({ game, kenoAllowed, plinkoAllowed, royalDropAllowed }: { game: Game; kenoAllowed: boolean; plinkoAllowed: boolean; royalDropAllowed: boolean }) {
  const navigate = useNavigate();
  const poster = { title: game.title, emoji: game.emoji, gradient: game.gradient };
  const isRestricted = (game.id === 'keno' && !kenoAllowed) || (game.id === 'plinko' && !plinkoAllowed) || (game.id === 'royal-drop' && !royalDropAllowed);
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
        minHeight: game.category === 'coming' ? 72 : 112,
        background: 'linear-gradient(180deg,rgba(22,29,43,0.98),rgba(11,15,25,0.98))',
        border: `1px solid ${isAvailable ? 'rgba(98,211,186,0.34)' : 'rgba(170,187,178,0.12)'}`,
        borderRadius: 18,
        padding: 0,
        cursor: isAvailable ? 'pointer' : 'default',
        textAlign: 'left',
        overflow: 'hidden',
        opacity: isAvailable ? 1 : 0.6,
        boxShadow: isAvailable
          ? '0 18px 34px rgba(0,0,0,0.34), 0 0 0 1px rgba(255,255,255,0.02), inset 0 1px 0 rgba(255,255,255,0.08)'
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
          ? '0 18px 34px rgba(0,0,0,0.34), 0 0 0 1px rgba(255,255,255,0.02), inset 0 1px 0 rgba(255,255,255,0.08)'
          : '0 6px 16px rgba(0,0,0,0.25)';
      }}
    >
      <div style={{ position: 'relative', flex: 1, minHeight: game.category === 'coming' ? 52 : 88, background: poster.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {game.posterSrc && <img src={game.posterSrc} alt={`${game.title} poster`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(145deg,rgba(255,255,255,0.1),transparent 34%), linear-gradient(145deg,transparent 35%,rgba(0,0,0,0.58))' }} />
        <div style={{ position: 'absolute', left: '50%', top: '13%', width: 100, height: 100, transform: 'translateX(-50%)', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.22)', boxShadow: '0 0 28px rgba(75,221,187,0.2)', opacity: 0.75 }} />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', textAlign: 'center', padding: 5 }}>
          {game.posterSrc ? null : game.logoSrc ? (
            <img src={game.logoSrc} alt={`${game.title} logo`} style={{ display: 'block', width: '92%', height: 46, margin: '0 auto', objectFit: 'contain', filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.5))' }} />
          ) : (
            <>
              <div style={{ fontSize: game.category === 'coming' ? 17 : 26, filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.5))' }}>{poster.emoji}</div>
              <div style={{ marginTop: 2, color: '#f7fbff', fontSize: poster.title.length > 11 ? 8 : 11, fontWeight: 1000, fontStyle: 'italic', lineHeight: 0.95, textTransform: 'uppercase', textShadow: '1px 1px 0 rgba(0,0,0,0.65)' }}>{poster.title}</div>
            </>
          )}
        </div>
        <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 8, fontWeight: 900, color: '#fff', background: game.category === 'coming' ? 'rgba(94,108,103,0.9)' : isRestricted ? 'rgba(124,90,36,0.95)' : 'rgba(213,65,63,0.95)', borderRadius: 6, padding: '4px 6px', letterSpacing: '0.08em', boxShadow: '0 3px 8px rgba(0,0,0,0.25)' }}>{game.category === 'coming' ? 'SOON' : isRestricted ? 'LOCKED' : 'HOT'}</div>
      </div>
      <div style={{ minHeight: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px', background: 'rgba(8,13,23,0.98)', color: game.category === 'coming' ? '#8aa49b' : '#eef4f1', fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.02em' }}><span>{poster.title}</span><span style={{ color: isAvailable ? '#63d4ba' : '#728079', fontSize: 6 }}>{isAvailable ? 'PLAY' : 'SOON'}</span></div>
    </button>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GamesLobbyScreen() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<'all' | 'live' | 'instant' | 'coming'>('all');
  const [isAgent, setIsAgent] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);
  const [mainBalance, setMainBalance] = useState<number | null>(null);
  const [playBalance, setPlayBalance] = useState<number | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponStatus, setCouponStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [couponMessage, setCouponMessage] = useState('');
  const [availableCoupons, setAvailableCoupons] = useState<AvailableCoupon[]>([]);
  const [showCoupons, setShowCoupons] = useState(false);
  const [kenoAllowed, setKenoAllowed] = useState(false);
  const [plinkoAllowed, setPlinkoAllowed] = useState(false);
  const [royalDropAllowed, setRoyalDropAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        await initAuth();
        const [profile, kenoAccess, plinkoAccess, royalDropAccess, coupons] = await Promise.all([
          getProfile(),
          checkKenoAccess().catch(() => ({ allowed: false })),
          checkPlinkoAccess().catch(() => ({ allowed: false })),
          checkRoyalDropAccess().catch(() => ({ allowed: false })),
          getAvailableCoupons().catch(() => [] as AvailableCoupon[]),
        ]);
        if (!cancelled) {
          setIsAgent(!!getAgentJwt());
          setIsSuspended(profile.is_suspended);
          setMainBalance(profile.mainWallet.balance);
          setPlayBalance(profile.playWallet.balance);
          setKenoAllowed(kenoAccess.allowed);
          setPlinkoAllowed(plinkoAccess.allowed);
          setRoyalDropAllowed(royalDropAccess.allowed);
          setAvailableCoupons(coupons);
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
    if (g.id === 'poker') return false;
    if (g.id === 'keno') return true;
    if (g.id === 'plinko') return true;
    return true;
  });
  const filteredGames = availableGames.filter(game => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'coming') return game.category === 'coming';
    if (activeFilter === 'live') return game.category === 'live' || game.category === 'crash';
    return game.category === 'slots' || game.category === 'numbers';
  });

  async function handleCouponRedeem() {
    const code = couponCode.trim();
    if (!code || couponStatus === 'loading') return;
    setCouponStatus('loading');
    setCouponMessage('');
    try {
      const response = await redeemCoupon(code);
      setCouponStatus('success');
      setCouponMessage(response.message);
      setCouponCode('');
      // Refresh available coupons (remaining count may have changed)
      getAvailableCoupons().then(setAvailableCoupons).catch(() => {});
    } catch (error) {
      const responseError = error as { responseData?: { message?: string } };
      setCouponStatus('error');
      setCouponMessage(responseError.responseData?.message ?? 'Invalid or expired coupon');
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'radial-gradient(circle at 92% 3%,rgba(74,105,186,0.2),transparent 24%), radial-gradient(circle at -10% 30%,rgba(35,177,145,0.13),transparent 32%), linear-gradient(180deg,#0b111d 0%,#070b13 44%,#04060b 100%)',
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
        @keyframes lobbyShimmer {
          from { transform: translateX(-120%) skewX(-18deg); }
          to { transform: translateX(230%) skewX(-18deg); }
        }
        @keyframes lobbyLivePulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(99,212,186,0.28); }
          50% { box-shadow: 0 0 0 5px rgba(99,212,186,0); }
        }
        .lobby-action:active { transform: scale(0.98); }
        .lobby-card:focus-within { outline: 2px solid #f7c948; outline-offset: 3px; }
        .lobby-featured { grid-column: span 2; }
      `}</style>

      <div style={{ height: 76, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(134,165,226,0.16)', boxSizing: 'border-box', background: 'rgba(7,11,20,0.68)' }}>
        <div><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#6ed4bd', fontWeight: 900, letterSpacing: '0.16em' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#63d4ba', animation: 'lobbyLivePulse 1.8s ease-out infinite' }} /> FIDEL PLAY</div><div style={{ marginTop: 3, fontSize: 17, fontWeight: 900, color: '#f4f7fb' }}>Choose your game</div></div>
        <button onClick={() => navigate('/wallet')} style={{ width: 158, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', background: 'rgba(16,24,39,0.88)', border: '1px solid rgba(134,165,226,0.2)', borderRadius: 13, color: '#fff', cursor: 'pointer', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}><div style={{ textAlign: 'left', lineHeight: 1.3, fontSize: 8, fontWeight: 900, color: '#95a1b4' }}><div>MAIN <span style={{ color: '#f3cf64', marginLeft: 4 }}>{mainBalance === null ? '—' : `${mainBalance.toFixed(2)} ETB`}</span></div><div>PLAY <span style={{ color: '#61d9ba', marginLeft: 5 }}>{playBalance === null ? '—' : `${playBalance.toFixed(2)} ETB`}</span></div></div><Eye size={16} color="#8e9db4" /></button>
      </div>

      <button onClick={() => navigate('/wallet')} style={{ position: 'relative', display: 'flex', alignItems: 'center', width: 'calc(100% - 40px)', minHeight: 82, margin: '18px 20px 0', padding: '14px 15px', overflow: 'hidden', border: '1px solid rgba(97,213,186,0.28)', borderRadius: 18, background: 'linear-gradient(110deg,#12332f 0%,#10223a 62%,#273d69 150%)', color: '#f5f8ff', textAlign: 'left', cursor: 'pointer', boxShadow: '0 14px 30px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 80, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.14),transparent)', animation: 'lobbyShimmer 4.5s ease-in-out infinite', pointerEvents: 'none' }} /><div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}><div style={{ display: 'grid', placeItems: 'center', width: 42, height: 42, borderRadius: 13, background: 'linear-gradient(145deg,#66dec2,#2c8b9f)', color: '#08201b', boxShadow: '0 6px 16px rgba(52,202,176,0.22)' }}><Gift size={21} /></div><div><div style={{ fontSize: 10, color: '#9ae1d1', fontWeight: 800, letterSpacing: '0.12em' }}>LIMITED PROMOTION</div><div style={{ marginTop: 4, fontSize: 15, fontWeight: 950, fontStyle: 'italic', color: '#fff' }}>BONUS ON YOUR NEXT DEPOSIT</div></div></div><span style={{ position: 'relative', zIndex: 1, marginLeft: 'auto', color: '#7ee2cc', fontSize: 24, fontWeight: 900 }}>›</span><div style={{ position: 'absolute', right: -18, top: -35, width: 130, height: 130, borderRadius: '50%', background: 'rgba(98,175,255,0.2)', filter: 'blur(6px)' }} />
      </button>

      <div style={{ margin: '16px 20px 0', padding: '12px', borderRadius: 15, background: 'rgba(15,23,37,0.82)', border: '1px solid rgba(134,165,226,0.18)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#f3cf64', fontSize: 10, fontWeight: 900, letterSpacing: '0.1em' }}><TicketPercent size={15} /> ACCEPT COUPON</div>
          {availableCoupons.length > 0 && (
            <button onClick={() => setShowCoupons(v => !v)} style={{ border: 0, background: 'rgba(243,207,100,0.12)', color: '#f3cf64', borderRadius: 6, padding: '3px 8px', fontSize: 9, fontWeight: 900, cursor: 'pointer', letterSpacing: '0.06em' }}>
              {showCoupons ? 'HIDE' : `${availableCoupons.length} AVAILABLE ▾`}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <input value={couponCode} onChange={event => { setCouponCode(event.target.value.toUpperCase()); setCouponStatus('idle'); setCouponMessage(''); }} onKeyDown={event => { if (event.key === 'Enter') void handleCouponRedeem(); }} placeholder="ENTER CODE" maxLength={24} aria-label="Coupon code" style={{ minWidth: 0, flex: 1, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, background: '#03130f', color: '#fff', padding: '8px 10px', fontSize: 11, fontWeight: 800, outline: 'none' }} />
          <button onClick={() => void handleCouponRedeem()} disabled={!couponCode.trim() || couponStatus === 'loading'} style={{ border: 0, borderRadius: 9, padding: '0 12px', background: couponCode.trim() ? '#eeb52c' : '#26352e', color: couponCode.trim() ? '#102018' : '#7d8983', fontSize: 10, fontWeight: 900, cursor: couponCode.trim() ? 'pointer' : 'default' }}>{couponStatus === 'loading' ? '...' : 'ACCEPT'}</button>
        </div>
        {couponMessage && <div role="status" style={{ marginTop: 7, color: couponStatus === 'success' ? '#55d993' : '#ff8c82', fontSize: 10, fontWeight: 700 }}>{couponMessage}</div>}
        {showCoupons && availableCoupons.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {availableCoupons.map(c => (
              <button
                key={c.code}
                onClick={() => { setCouponCode(c.code); setShowCoupons(false); setCouponStatus('idle'); setCouponMessage(''); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(243,207,100,0.07)', border: '1px solid rgba(243,207,100,0.2)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              >
                <div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 12, color: '#f3cf64', letterSpacing: '0.08em' }}>{c.code}</div>
                  {c.description && <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{c.description}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: c.wallet === 'play' ? '#61d9ba' : '#f3cf64' }}>{c.amount} ETB</div>
                  <div style={{ fontSize: 9, color: '#94a3b8' }}>{c.wallet} wallet{c.remaining !== null ? ` · ${c.remaining} left` : ''}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '30px 20px 0' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 21, fontWeight: 1000, color: '#f5f7fb', letterSpacing: '-0.02em' }}><Trophy size={22} color="#f3cf64" /> PLAY NOW</div><span style={{ padding: '5px 8px', borderRadius: 7, background: 'rgba(99,212,186,0.1)', color: '#63d4ba', fontSize: 9, fontWeight: 900, letterSpacing: '0.08em' }}>{availableGames.filter(game => game.category !== 'coming').length} LIVE PICKS</span></div><div style={{ marginTop: 4, color: '#78869c', fontSize: 11, fontWeight: 600 }}>Pick a game and make your move</div><div style={{ display: 'flex', gap: 7, marginTop: 16, overflowX: 'auto', scrollbarWidth: 'none' }}>{([['all', 'ALL'], ['live', 'LIVE'], ['instant', 'INSTANT'], ['coming', 'COMING']] as const).map(([filter, label]) => <button key={filter} onClick={() => setActiveFilter(filter)} style={{ border: `1px solid ${activeFilter === filter ? 'rgba(99,212,186,0.6)' : 'rgba(134,165,226,0.16)'}`, borderRadius: 999, padding: '7px 12px', background: activeFilter === filter ? 'rgba(99,212,186,0.16)' : 'rgba(15,23,37,0.7)', color: activeFilter === filter ? '#8ae5d0' : '#8794a8', fontSize: 9, fontWeight: 900, letterSpacing: '0.08em', cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>)}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>{filteredGames.map((game, i) => <div key={game.id} className="lobby-card" style={{ animation: `lobbySlideUp 0.35s cubic-bezier(0.22,1,0.36,1) ${i * 0.05}s both` }}><GameCard game={game} kenoAllowed={kenoAllowed} plinkoAllowed={plinkoAllowed} royalDropAllowed={royalDropAllowed} /></div>)}</div></div>

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
