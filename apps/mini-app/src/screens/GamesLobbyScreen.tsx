import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Gamepad2, Gift, TicketPercent } from 'lucide-react';
import { initAuth } from '../lib/auth';
import { getProfile, redeemCoupon, getAvailableCoupons, getSystemStats, type AvailableCoupon } from '../lib/api';

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

const GAMES: Game[] = [
  {
    id: 'bingo',
    title: 'Mada Bingo',
    subtitle: 'Live multiplayer - Win up to 40K ETB',
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
];

function GameCard({ game }: { game: Game }) {
  const navigate = useNavigate();
  const [tapped, setTapped] = React.useState(false);
  const poster = { title: game.title, emoji: game.emoji, gradient: game.gradient };
  const isAvailable = game.available;

  function handleClick() {
    if (!isAvailable || tapped) return;
    setTapped(true);
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
        minHeight: game.category === 'coming' ? 96 : 168,
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
      {tapped && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, borderRadius: 18, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#63d4ba', animation: 'lobbyCardSpin 0.7s linear infinite' }} />
        </div>
      )}
      <div style={{ position: 'relative', flex: 1, minHeight: game.category === 'coming' ? 96 : 150, background: poster.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 12 }}>
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
        <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 8, fontWeight: 900, color: '#fff', background: game.category === 'coming' ? 'rgba(94,108,103,0.9)' : 'rgba(213,65,63,0.95)', borderRadius: 6, padding: '4px 6px', letterSpacing: '0.08em', boxShadow: '0 3px 8px rgba(0,0,0,0.25)' }}>{game.category === 'coming' ? 'SOON' : 'HOT'}</div>
      </div>
      <div style={{ minHeight: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px', background: 'rgba(8,13,23,0.98)', color: game.category === 'coming' ? '#8aa49b' : '#eef4f1', fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        <span>{poster.title}</span>
        <span style={{ color: isAvailable ? '#63d4ba' : '#728079', fontSize: 6 }}>{isAvailable ? 'PLAY' : 'SOON'}</span>
      </div>
    </button>
  );
}

export default function GamesLobbyScreen() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<'all' | 'live' | 'instant' | 'coming'>('all');
  const [isSuspended, setIsSuspended] = useState(false);
  const [mainBalance, setMainBalance] = useState<number | null>(null);
  const [playBalance, setPlayBalance] = useState<number | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponStatus, setCouponStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [couponMessage, setCouponMessage] = useState('');
  const [availableCoupons, setAvailableCoupons] = useState<AvailableCoupon[]>([]);
  const [showCoupons, setShowCoupons] = useState(false);
  const [claimedCoupon, setClaimedCoupon] = useState<{ amount: number; message: string } | null>(null);
  const [couponAlert, setCouponAlert] = useState<{ type: 'exhausted' | 'already' | 'requirement'; message: string } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [systemStats, setSystemStats] = useState<{ totalPlayers: number; totalGames: number } | null>(null);

  const refreshBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const p = await getProfile();
      setMainBalance(p.mainWallet?.balance ?? 0);
      setPlayBalance(p.playWallet?.balance ?? 0);
    } catch { /* silent */ }
    finally { setBalanceLoading(false); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBalanceLoading(true);
      try { await initAuth(); } catch { /* ignore */ }

      let profile = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { profile = await getProfile(); break; }
        catch { if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); }
      }

      if (!cancelled && profile) {
        setIsSuspended(profile.is_suspended);
        setMainBalance(profile.mainWallet?.balance ?? 0);
        setPlayBalance(profile.playWallet?.balance ?? 0);
      }
      if (!cancelled) setBalanceLoading(false);

      getAvailableCoupons().then(c => { if (!cancelled) setAvailableCoupons(c); }).catch(() => {});

      getSystemStats().then(s => { if (!cancelled) setSystemStats(s); }).catch(() => {});
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Refresh balance when tab becomes visible (user returns from a game)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        getProfile()
          .then(p => {
            setMainBalance(p.mainWallet?.balance ?? 0);
            setPlayBalance(p.playWallet?.balance ?? 0);
          })
          .catch(() => {});
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (isSuspended) {
    return (
      <div style={{ minHeight: '100dvh', background: 'linear-gradient(180deg, #17102f 0%, #0d0b22 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', textAlign: 'center', gap: 16 }}>
        <div style={{ fontSize: 56 }}>🚫</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#f87171' }}>Account Suspended</div>
        <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, maxWidth: 300 }}>
          Your account has been suspended. Please contact support.
        </div>
      </div>
    );
  }

  const availableGames = GAMES.filter(g => g.available);
  const filteredGames = (activeFilter === 'coming' ? GAMES.filter(g => g.category === 'coming') : availableGames).filter(game => {
    if (activeFilter === 'all' || activeFilter === 'coming') return true;
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
      setClaimedCoupon({ amount: response.amount, message: response.message });
      getAvailableCoupons().then(setAvailableCoupons).catch(() => {});
      getProfile().then(p => {
        setMainBalance(p.mainWallet.balance);
        setPlayBalance(p.playWallet.balance);
      }).catch(() => {});
    } catch (error) {
      const responseError = error as { message?: string; code?: string };
      const errorCode = responseError.code ?? '';
      if (errorCode === 'COUPON_EXHAUSTED') {
        setCouponStatus('idle');
        setCouponAlert({ type: 'exhausted', message: responseError.message ?? '' });
      } else if (errorCode === 'ALREADY_REDEEMED') {
        setCouponStatus('idle');
        setCouponAlert({ type: 'already', message: responseError.message ?? '' });
      } else if (errorCode === 'CLAIM_REQUIREMENT_NOT_MET') {
        setCouponStatus('error');
        setCouponMessage(responseError.message ?? 'Coupon claim requirement not met.');
      } else {
        setCouponStatus('error');
        setCouponMessage(responseError.message ?? 'Invalid or expired coupon');
      }
    }
  }

  return (
    <div className="lobby-root" style={{ minHeight: '100dvh', background: 'radial-gradient(circle at 85% -5%, rgba(99,212,186,0.16), transparent 32%), radial-gradient(circle at -12% 32%, rgba(59,130,246,0.14), transparent 30%), linear-gradient(180deg, #0c1322 0%, #080d18 55%, #04060c 100%)', color: '#f8fafc', maxWidth: 480, margin: '0 auto', paddingBottom: 100, overflow: 'hidden' }}>

      {claimedCoupon && (
        <div onClick={() => setClaimedCoupon(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 340, borderRadius: 24, overflow: 'hidden', background: 'linear-gradient(145deg,#0d2a1f,#0a1c30)', border: '1px solid rgba(99,212,186,0.35)', boxShadow: '0 0 60px rgba(99,212,186,0.25), 0 24px 60px rgba(0,0,0,0.6)', textAlign: 'center' }}>
            <div style={{ background: 'linear-gradient(90deg,#c8973a,#f3cf64,#c8973a)', padding: '18px 24px' }}>
              <div style={{ fontSize: 36 }}>🎟️</div>
              <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.12em', color: '#0a1405', marginTop: 4 }}>COUPON CLAIMED!</div>
            </div>
            <div style={{ padding: '28px 24px 32px' }}>
              <div style={{ fontSize: 48, fontWeight: 900, color: '#f3cf64', letterSpacing: '-0.02em', lineHeight: 1 }}>
                +{claimedCoupon.amount}
                <span style={{ fontSize: 20, fontWeight: 700, color: '#9ae1d1', marginLeft: 6 }}>ETB</span>
              </div>
              <div style={{ marginTop: 10, fontSize: 13, color: '#9ae1d1', fontWeight: 600 }}>{claimedCoupon.message}</div>
              <div style={{ margin: '20px 0 0', fontSize: 11, color: 'rgba(148,163,184,0.7)', letterSpacing: '0.04em' }}>Your balance has been updated</div>
              <button onClick={() => setClaimedCoupon(null)} style={{ marginTop: 20, width: '100%', border: 0, borderRadius: 12, padding: '13px 0', fontSize: 13, fontWeight: 900, letterSpacing: '0.06em', background: 'linear-gradient(90deg,#22c77e,#16a05e)', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 16px rgba(34,199,126,0.35)' }}>
                PLAY NOW
              </button>
            </div>
          </div>
        </div>
      )}

      {couponAlert && (
        <div onClick={() => setCouponAlert(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 340, borderRadius: 24, overflow: 'hidden', background: couponAlert.type === 'already' ? 'linear-gradient(145deg,#1a1a2e,#16213e)' : 'linear-gradient(145deg,#1c0a0a,#2a0f0f)', border: `1px solid ${couponAlert.type === 'already' ? 'rgba(99,130,212,0.4)' : 'rgba(212,99,99,0.4)'}`, boxShadow: '0 24px 60px rgba(0,0,0,0.7)', textAlign: 'center' }}>
            <div style={{ background: couponAlert.type === 'already' ? 'linear-gradient(90deg,#3b4fa8,#5b6fd4,#3b4fa8)' : 'linear-gradient(90deg,#a83b3b,#d45b5b,#a83b3b)', padding: '18px 24px' }}>
              <div style={{ fontSize: 40 }}>{couponAlert.type === 'already' ? '✅' : '😔'}</div>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', color: '#fff', marginTop: 6 }}>
                {couponAlert.type === 'already' ? 'ALREADY CLAIMED' : 'ALL COUPONS TAKEN'}
              </div>
            </div>
            <div style={{ padding: '24px 22px 28px' }}>
              {couponAlert.type === 'exhausted' ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#f87171', lineHeight: 1.5, marginBottom: 12 }}>All coupons for today are gone!</div>
                  <div style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 12, padding: '12px 14px', marginBottom: 18 }}>
                    <div style={{ fontSize: 13, color: '#fbbf24', fontWeight: 700, marginBottom: 8 }}>Tips for next time</div>
                    <div style={{ fontSize: 12, color: '#fde68a', lineHeight: 1.9, textAlign: 'left' }}>
                      Be fast — coupons run out quickly!{'\n'}
                      Follow the bot to catch new codes first{'\n'}
                      Stay active — active players get priority{'\n'}
                      Play more games to unlock exclusive coupons
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#93c5fd', lineHeight: 1.5, marginBottom: 12 }}>You already claimed this coupon!</div>
                  <div style={{ background: 'rgba(99,130,212,0.1)', border: '1px solid rgba(99,130,212,0.25)', borderRadius: 12, padding: '12px 14px', marginBottom: 18 }}>
                    <div style={{ fontSize: 13, color: '#93c5fd', fontWeight: 700, marginBottom: 8 }}>Get more coupons</div>
                    <div style={{ fontSize: 12, color: '#bfdbfe', lineHeight: 1.9, textAlign: 'left' }}>
                      Follow the bot — new coupons drop regularly{'\n'}
                      Stay active to be first in line{'\n'}
                      Play more games for exclusive coupon access{'\n'}
                      Invite friends to unlock special rewards
                    </div>
                  </div>
                </>
              )}
              <button onClick={() => setCouponAlert(null)} style={{ width: '100%', border: 0, borderRadius: 12, padding: '13px 0', fontSize: 13, fontWeight: 900, letterSpacing: '0.05em', background: couponAlert.type === 'already' ? 'linear-gradient(90deg, #7c3aed, #a855f7)' : 'linear-gradient(90deg, #b45309, #d97706)', color: '#fff', cursor: 'pointer' }}>
                {couponAlert.type === 'already' ? "Got it, keep playing" : "OK, I'll be faster next time"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes lobbyCardSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes lobbyPulse { 0%,100% { opacity:0.6; transform:scale(1); } 50% { opacity:1; transform:scale(1.25); } }
        @keyframes lobbySlideUp { from { transform:translateY(16px); opacity:0; } to { transform:translateY(0); opacity:1; } }
        @keyframes lobbyFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes lobbyShimmer { from { transform: translateX(-120%) skewX(-18deg); } to { transform: translateX(230%) skewX(-18deg); } }
        @keyframes lobbyLivePulse { 0%,100% { box-shadow: 0 0 0 0 rgba(99,212,186,0.28); } 50% { box-shadow: 0 0 0 5px rgba(99,212,186,0); } }
        .lobby-action:active { transform: scale(0.98); }
        .lobby-card:focus-within { outline: 2px solid #f7c948; outline-offset: 3px; }
        .lobby-featured { grid-column: span 2; }
        .lobby-root { max-width: 480px; margin: 0 auto; }
        @media (min-width: 560px) { .lobby-root { max-width: 560px; } }
      `}</style>

      <div style={{ minHeight: 76, padding: '14px 20px 0', background: 'rgba(7,11,20,0.66)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(134,165,226,0.14)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg, #63d4ba, #2c8b9f)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#08201b', boxShadow: '0 6px 16px rgba(52,202,176,0.35)' }}>
              <Gamepad2 size={18} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: '#8ae5d0', fontWeight: 900, letterSpacing: '0.16em' }}>MADA PLAY</div>
              <div style={{ marginTop: 2, fontSize: 15, fontWeight: 900, color: '#f4f7fb' }}>Choose your game</div>
            </div>
          </div>
          <button onClick={() => navigate('/wallet')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', background: 'rgba(13,20,34,0.88)', border: '1px solid rgba(134,165,226,0.22)', borderRadius: 12, color: '#fff', cursor: 'pointer' }}>
            <Eye size={13} color="#8e9db4" />
            <span style={{ fontSize: 9, fontWeight: 900, color: '#95a1b4', letterSpacing: '0.06em' }}>BALANCE</span>
            <span style={{ fontSize: 11, fontWeight: 900, color: '#f3cf64' }}>{mainBalance === null ? '...' : `${mainBalance.toFixed(2)} ETB`}</span>
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 26, fontWeight: 1000, color: '#f8fbff', letterSpacing: '-0.02em', lineHeight: 1.05 }}>
            Play <span style={{ background: 'linear-gradient(90deg,#63d4ba,#2c8b9f)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>bold.</span>
          </div>
          <div style={{ marginTop: 5, color: '#8b9bb0', fontSize: 12, fontWeight: 700 }}>Pick a game and make your move</div>
        </div>
      </div>

      <div onClick={() => navigate('/wallet')} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, width: 'calc(100% - 40px)', minHeight: 84, margin: '14px 20px 0', padding: '14px 15px', overflow: 'hidden', border: '1px solid rgba(97,213,186,0.28)', borderRadius: 20, background: 'linear-gradient(110deg, rgba(18,51,47,0.95) 0%, rgba(16,35,58,0.95) 62%, rgba(39,61,105,0.9) 150%)', color: '#f5f8ff', textAlign: 'left', cursor: 'pointer', boxShadow: '0 14px 30px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 90, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.14),transparent)', animation: 'lobbyShimmer 4.5s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1, flex: 1 }}>
          <div style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 13, background: 'linear-gradient(145deg,#66dec2,#2c8b9f)', color: '#08201b', boxShadow: '0 6px 16px rgba(52,202,176,0.22)' }}>
            <Gift size={21} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: '#9ae1d1', fontWeight: 800, letterSpacing: '0.12em' }}>LIMITED PROMOTION</div>
            <div style={{ marginTop: 4, fontSize: 15, fontWeight: 950, fontStyle: 'italic', color: '#fff' }}>BONUS ON YOUR NEXT DEPOSIT</div>
          </div>
        </div>
        <div style={{ position: 'relative', zIndex: 1, flexShrink: 0 }}>
          <button onClick={() => navigate('/wallet')} style={{ border: 0, cursor: 'pointer', borderRadius: 999, padding: '9px 16px', background: 'linear-gradient(90deg,#22c77e,#16a05e)', color: '#fff', fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', boxShadow: '0 4px 14px rgba(34,199,126,0.4)' }}>CLAIM</button>
        </div>
        <div style={{ position: 'absolute', right: -18, top: -35, width: 130, height: 130, borderRadius: '50%', background: 'rgba(98,175,255,0.2)', filter: 'blur(6px)' }} />
      </div>

      <div style={{ margin: '16px 20px 0', padding: '12px', borderRadius: 16, background: 'rgba(13,20,34,0.82)', border: '1px solid rgba(134,165,226,0.18)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#f3cf64', fontSize: 10, fontWeight: 900, letterSpacing: '0.1em' }}><TicketPercent size={15} /> ACCEPT COUPON</div>
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <input value={couponCode} onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponStatus('idle'); setCouponMessage(''); }} onKeyDown={e => { if (e.key === 'Enter') void handleCouponRedeem(); }} placeholder="ENTER CODE" maxLength={24} aria-label="Coupon code" style={{ minWidth: 0, flex: 1, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, background: '#03130f', color: '#fff', padding: '8px 10px', fontSize: 11, fontWeight: 800, outline: 'none' }} />
          <button onClick={() => void handleCouponRedeem()} disabled={!couponCode.trim() || couponStatus === 'loading'} style={{ border: 0, borderRadius: 9, padding: '0 12px', background: couponCode.trim() ? '#eeb52c' : '#26352e', color: couponCode.trim() ? '#102018' : '#7d8983', fontSize: 10, fontWeight: 900, cursor: couponCode.trim() ? 'pointer' : 'default' }}>{couponStatus === 'loading' ? '...' : 'ACCEPT'}</button>
        </div>
        {couponMessage && <div role="status" style={{ marginTop: 7, color: couponStatus === 'success' ? '#55d993' : '#ff8c82', fontSize: 10, fontWeight: 700 }}>{couponMessage}</div>}
      </div>

      <div style={{ padding: '24px 20px 0' }}>
        <div style={{ fontSize: 11, color: '#8ae5d0', fontWeight: 900, letterSpacing: '0.16em' }}>AVAILABLE GAMES</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 }}>
          <div>
            <div style={{ fontSize: 25, fontWeight: 1000, color: '#f8fbff', letterSpacing: '-0.02em', lineHeight: 1.05 }}>
              Pick your <span style={{ background: 'linear-gradient(90deg,#63d4ba,#2c8b9f)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>fight.</span>
            </div>
            <div style={{ marginTop: 6, color: '#8b9bb0', fontSize: 12, fontWeight: 700, maxWidth: 220, lineHeight: 1.5 }}>Choose wisely — every round is for keeps</div>
          </div>
          <span style={{ padding: '5px 8px', borderRadius: 7, background: 'rgba(99,212,186,0.1)', color: '#63d4ba', fontSize: 9, fontWeight: 900, letterSpacing: '0.08em' }}>
            {availableGames.filter(game => game.category !== 'coming').length} LIVE PICKS
          </span>
        </div>
        <div style={{ display: 'flex', gap: 7, marginTop: 16, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {([['all', 'ALL'], ['live', 'LIVE'], ['instant', 'INSTANT'], ['coming', 'COMING']] as const).map(([filter, label]) => (
            <button key={filter} onClick={() => setActiveFilter(filter)} style={{ border: `1px solid ${activeFilter === filter ? 'rgba(99,212,186,0.6)' : 'rgba(134,165,226,0.16)'}`, borderRadius: 999, padding: '7px 12px', background: activeFilter === filter ? 'rgba(99,212,186,0.16)' : 'rgba(15,23,37,0.7)', color: activeFilter === filter ? '#8ae5d0' : '#8794a8', fontSize: 9, fontWeight: 900, letterSpacing: '0.08em', cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginTop: 14 }}>
          {filteredGames.map((game, i) => (
            <div key={game.id} className="lobby-card" style={{ animation: `lobbySlideUp 0.35s cubic-bezier(0.22,1,0.36,1) ${i * 0.05}s both` }}>
              <GameCard game={game} />
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
