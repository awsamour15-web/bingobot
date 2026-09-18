import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Gift, TicketPercent, Gamepad2, Wallet } from 'lucide-react';
import { initAuth } from '../lib/auth';
import { getProfile, checkSlotsAccess, redeemCoupon, getAvailableCoupons } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Game {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  posterSrc?: string;
  gradient: string;
  accentColor: string;
  route: string;
  tag: string;
  tagColor: string;
  tagBg: string;
  available: boolean;
  bonusNote?: string;
  bonusNoteColor?: string;
  category: 'live' | 'slots' | 'crash' | 'numbers' | 'coming';
  isLive?: boolean;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const GAMES: Game[] = [
  {
    id: 'bingo',
    title: 'Fidel Bingo',
    subtitle: 'Live multiplayer · Win up to 40K ETB',
    emoji: '🎯',
    gradient: 'linear-gradient(145deg, #0f2744 0%, #091a35 100%)',
    accentColor: '#f59e0b',
    route: '/bingo',
    tag: 'LIVE',
    tagColor: '#fff',
    tagBg: '#ef4444',
    available: true,
    bonusNote: '🎁 Bonus accepted',
    bonusNoteColor: '#34d399',
    category: 'live',
    isLive: true,
  },
  {
    id: 'slots',
    title: 'Multi Hot 5',
    subtitle: 'Slots · 5 paylines · Multiplier reel',
    emoji: '🎰',
    posterSrc: '/posters/Multi-Hot-5-6924003_s.jpg',
    gradient: 'linear-gradient(145deg, #2a1400 0%, #1a0d00 100%)',
    accentColor: '#f59e0b',
    route: '/slots',
    tag: 'NEW',
    tagColor: '#fff',
    tagBg: '#10b981',
    available: true,
    bonusNote: '💳 Deposit required',
    bonusNoteColor: '#fbbf24',
    category: 'slots',
  },
];

// ─── GameCard ─────────────────────────────────────────────────────────────────

function GameCard({ game, slotsAllowed, accessChecked }: {
  game: Game;
  slotsAllowed: boolean;
  accessChecked: boolean;
}) {
  const navigate = useNavigate();
  const [tapped, setTapped] = React.useState(false);

  const isRestricted = accessChecked && game.id === 'slots' && !slotsAllowed;
  const isAvailable = game.available && !isRestricted;

  function handleClick() {
    if (!isAvailable || tapped) return;
    setTapped(true);
    navigate(game.route);
  }

  return (
    <button
      onClick={handleClick}
      disabled={!isAvailable}
      className="game-card"
      style={{
        position: 'relative',
        width: '100%',
        border: 'none',
        borderRadius: 20,
        padding: 0,
        cursor: isAvailable ? 'pointer' : 'default',
        textAlign: 'left',
        overflow: 'hidden',
        background: 'transparent',
        opacity: isAvailable ? 1 : 0.55,
      }}
    >
      {/* Poster / gradient area */}
      <div style={{
        position: 'relative',
        height: 180,
        background: game.gradient,
        borderRadius: 20,
        overflow: 'hidden',
        border: `1px solid rgba(255,255,255,0.07)`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)`,
      }}>
        {/* poster image */}
        {game.posterSrc && (
          <img
            src={game.posterSrc}
            alt={game.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
          />
        )}

        {/* ambient glow overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse at 50% 110%, ${game.accentColor}22 0%, transparent 70%)`,
        }} />

        {/* dark gradient at bottom for text legibility */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)',
        }} />

        {/* emoji (only when no poster) */}
        {!game.posterSrc && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -62%)',
            fontSize: 52, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))',
            userSelect: 'none',
          }}>
            {game.emoji}
          </div>
        )}

        {/* tag badge top-left */}
        <div style={{
          position: 'absolute', top: 12, left: 12,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {game.isLive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#ef4444',
                boxShadow: '0 0 0 0 rgba(239,68,68,0.6)',
                animation: 'livePing 1.8s ease-out infinite',
                flexShrink: 0,
              }} />
            </div>
          )}
          <span style={{
            background: game.tagBg,
            color: game.tagColor,
            fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
            padding: '4px 8px', borderRadius: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>
            {game.tag}
          </span>
        </div>

        {/* title + subtitle at bottom */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 14px 14px' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
            {game.title}
          </div>
          <div style={{ marginTop: 3, fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
            {game.subtitle}
          </div>
        </div>

        {/* loading overlay */}
        {tapped && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 20,
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.15)',
              borderTopColor: game.accentColor,
              animation: 'cardSpin 0.7s linear infinite',
            }} />
          </div>
        )}
      </div>

      {/* footer strip */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 4px 2px',
      }}>
        {game.bonusNote && (
          <span style={{ fontSize: 10, fontWeight: 700, color: game.bonusNoteColor ?? '#94a3b8' }}>
            {game.bonusNote}
          </span>
        )}
        <span style={{
          marginLeft: 'auto',
          fontSize: 10, fontWeight: 800, color: isAvailable ? game.accentColor : '#4b5563',
          letterSpacing: '0.06em',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          {isAvailable ? 'PLAY NOW →' : 'LOCKED'}
        </span>
      </div>
    </button>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GamesLobbyScreen() {
  const navigate = useNavigate();
  const [isSuspended, setIsSuspended] = useState(false);
  const [mainBalance, setMainBalance] = useState<number | null>(null);
  const [playBalance, setPlayBalance] = useState<number | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponStatus, setCouponStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [couponMessage, setCouponMessage] = useState('');
  const [claimedCoupon, setClaimedCoupon] = useState<{ amount: number; message: string } | null>(null);
  const [couponAlert, setCouponAlert] = useState<{ type: 'exhausted' | 'already' | 'requirement'; message: string } | null>(null);
  const [slotsAllowed, setSlotsAllowed] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
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

      getAvailableCoupons().then(() => {}).catch(() => {});

      const slotsAccess = await checkSlotsAccess().catch(() => ({ allowed: false }));
      if (!cancelled) {
        setSlotsAllowed(slotsAccess.allowed);
        setAccessChecked(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

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
      getAvailableCoupons().catch(() => {});
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

  if (isSuspended) {
    return (
      <div style={{
        minHeight: '100dvh', background: '#070b13',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '0 24px', textAlign: 'center', gap: 16,
      }}>
        <div style={{ fontSize: 48 }}>🚫</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#f87171' }}>Account Suspended</div>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, maxWidth: 280 }}>
          Your account has been suspended. Please contact support.
        </div>
      </div>
    );
  }

  const fmt = (v: number | null) => v === null ? '—' : v.toFixed(2);

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(180deg, #0a0f1e 0%, #070b14 100%)',
      color: '#f1f5f9',
      maxWidth: 480,
      margin: '0 auto',
      paddingBottom: 100,
    }}>

      {/* ── Global styles ── */}
      <style>{`
        @keyframes cardSpin { to { transform: rotate(360deg); } }
        @keyframes livePing {
          0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.7); }
          70%  { box-shadow: 0 0 0 7px rgba(239,68,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes shimmer {
          from { transform: translateX(-100%) skewX(-15deg); }
          to   { transform: translateX(250%)  skewX(-15deg); }
        }
        .game-card { transition: transform 0.18s ease, opacity 0.18s ease; }
        .game-card:active { transform: scale(0.97); }
        .game-card:hover > div:first-child { box-shadow: 0 16px 48px rgba(0,0,0,0.6) !important; }
        .btn-press:active { transform: scale(0.97); }
      `}</style>

      {/* ════════════════════════════════════════
          CLAIMED COUPON POPUP
      ════════════════════════════════════════ */}
      {claimedCoupon && (
        <div onClick={() => setClaimedCoupon(null)} style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 320, borderRadius: 24,
            background: 'linear-gradient(145deg, #0d1f18, #091830)',
            border: '1px solid rgba(52,211,153,0.3)',
            boxShadow: '0 0 60px rgba(52,211,153,0.15), 0 24px 60px rgba(0,0,0,0.7)',
            overflow: 'hidden', textAlign: 'center',
          }}>
            <div style={{ background: 'linear-gradient(90deg,#b45309,#f59e0b,#b45309)', padding: '20px 24px' }}>
              <div style={{ fontSize: 32 }}>🎟️</div>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', color: '#1a0e00', marginTop: 6 }}>COUPON CLAIMED</div>
            </div>
            <div style={{ padding: '28px 24px 32px' }}>
              <div style={{ fontSize: 44, fontWeight: 900, color: '#f59e0b', letterSpacing: '-0.02em', lineHeight: 1 }}>
                +{claimedCoupon.amount}
                <span style={{ fontSize: 18, fontWeight: 700, color: '#34d399', marginLeft: 6 }}>ETB</span>
              </div>
              <div style={{ marginTop: 10, fontSize: 13, color: '#6ee7b7', fontWeight: 600 }}>{claimedCoupon.message}</div>
              <div style={{ margin: '16px 0 0', fontSize: 10, color: '#475569', letterSpacing: '0.04em' }}>Balance updated ✓</div>
              <button onClick={() => setClaimedCoupon(null)} className="btn-press" style={{
                marginTop: 20, width: '100%', border: 0, borderRadius: 12, padding: '13px 0',
                fontSize: 13, fontWeight: 800, letterSpacing: '0.06em',
                background: 'linear-gradient(90deg,#059669,#10b981)', color: '#fff',
                cursor: 'pointer', boxShadow: '0 4px 20px rgba(16,185,129,0.35)',
              }}>PLAY NOW →</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          COUPON ALERT POPUP
      ════════════════════════════════════════ */}
      {couponAlert && (
        <div onClick={() => setCouponAlert(null)} style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 320, borderRadius: 24, overflow: 'hidden',
            background: couponAlert.type === 'already' ? 'linear-gradient(145deg,#1a1a2e,#16213e)' : 'linear-gradient(145deg,#1c0a0a,#2a0f0f)',
            border: `1px solid ${couponAlert.type === 'already' ? 'rgba(99,130,212,0.35)' : 'rgba(239,68,68,0.3)'}`,
            boxShadow: '0 24px 60px rgba(0,0,0,0.7)', textAlign: 'center',
          }}>
            <div style={{
              background: couponAlert.type === 'already' ? 'linear-gradient(90deg,#3730a3,#4f46e5,#3730a3)' : 'linear-gradient(90deg,#991b1b,#dc2626,#991b1b)',
              padding: '20px 24px',
            }}>
              <div style={{ fontSize: 36 }}>{couponAlert.type === 'already' ? '✅' : '😔'}</div>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', color: '#fff', marginTop: 6 }}>
                {couponAlert.type === 'already' ? 'ALREADY CLAIMED' : 'ALL COUPONS TAKEN'}
              </div>
            </div>
            <div style={{ padding: '22px 20px 26px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: couponAlert.type === 'already' ? '#93c5fd' : '#fca5a5', lineHeight: 1.6, marginBottom: 16 }}>
                {couponAlert.type === 'already' ? 'You already claimed this coupon.' : 'All coupons for today are gone!'}
              </div>
              <button onClick={() => setCouponAlert(null)} className="btn-press" style={{
                width: '100%', border: 0, borderRadius: 12, padding: '13px 0',
                fontSize: 12, fontWeight: 800, letterSpacing: '0.05em',
                background: couponAlert.type === 'already' ? 'linear-gradient(90deg,#3730a3,#4f46e5)' : 'linear-gradient(90deg,#b45309,#d97706)',
                color: '#fff', cursor: 'pointer',
              }}>
                {couponAlert.type === 'already' ? 'Got it' : "OK, I'll be faster next time"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          HEADER
      ════════════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(10,15,30,0.95)',
        backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        {/* brand */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Gamepad2 size={14} color="#34d399" />
            <span style={{ fontSize: 10, fontWeight: 800, color: '#34d399', letterSpacing: '0.15em' }}>FIDEL PLAY</span>
          </div>
          <div style={{ marginTop: 2, fontSize: 18, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.01em' }}>
            Choose your game
          </div>
        </div>

        {/* wallet */}
        <button onClick={() => navigate('/wallet')} className="btn-press" style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 12,
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
          cursor: 'pointer', color: '#f1f5f9',
        }}>
          <Wallet size={14} color="#64748b" />
          <div style={{ textAlign: 'right', lineHeight: 1.4 }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: '#64748b', letterSpacing: '0.06em' }}>MAIN</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#f59e0b' }}>
              {balanceLoading ? '···' : `${fmt(mainBalance)} ETB`}
            </div>
          </div>
          <Eye size={13} color="#475569" />
        </button>
      </div>

      <div style={{ padding: '20px 20px 0' }}>

        {/* ════════════════════════════════════════
            BALANCE CARD
        ════════════════════════════════════════ */}
        <div style={{
          borderRadius: 18,
          background: 'linear-gradient(135deg, #111827 0%, #0d1424 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
          padding: '16px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <div>
            <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>PLAY BALANCE</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#34d399', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {balanceLoading ? '···' : fmt(playBalance)}
              <span style={{ fontSize: 13, fontWeight: 600, color: '#6ee7b7', marginLeft: 6 }}>ETB</span>
            </div>
          </div>
          <button onClick={() => navigate('/wallet')} className="btn-press" style={{
            border: 0, borderRadius: 12, padding: '10px 18px',
            background: 'linear-gradient(135deg, #059669, #10b981)',
            color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(16,185,129,0.3)',
            letterSpacing: '0.04em',
          }}>
            DEPOSIT
          </button>
        </div>

        {/* ════════════════════════════════════════
            PROMO BANNER
        ════════════════════════════════════════ */}
        <button onClick={() => navigate('/wallet')} className="btn-press" style={{
          position: 'relative', width: '100%', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', borderRadius: 16,
          background: 'linear-gradient(135deg, #0d2e28 0%, #0a1e3d 100%)',
          border: '1px solid rgba(52,211,153,0.2)',
          cursor: 'pointer', overflow: 'hidden', textAlign: 'left',
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        }}>
          {/* shimmer sweep */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, width: 60,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
            animation: 'shimmer 3.5s ease-in-out infinite',
            pointerEvents: 'none',
          }} />
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, #34d399, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(52,211,153,0.3)',
          }}>
            <Gift size={18} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#34d399', letterSpacing: '0.12em', marginBottom: 3 }}>LIMITED PROMOTION</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#f1f5f9' }}>Bonus on your next deposit</div>
          </div>
          <span style={{ color: '#34d399', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>›</span>
        </button>

        {/* ════════════════════════════════════════
            COUPON BOX
        ════════════════════════════════════════ */}
        <div style={{
          borderRadius: 16, padding: '14px 16px', marginBottom: 24,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <TicketPercent size={14} color="#f59e0b" />
            <span style={{ fontSize: 10, fontWeight: 800, color: '#f59e0b', letterSpacing: '0.1em' }}>REDEEM COUPON</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={couponCode}
              onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponStatus('idle'); setCouponMessage(''); }}
              onKeyDown={e => { if (e.key === 'Enter') void handleCouponRedeem(); }}
              placeholder="ENTER CODE"
              maxLength={24}
              aria-label="Coupon code"
              style={{
                flex: 1, minWidth: 0,
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10, color: '#f1f5f9', padding: '9px 12px',
                fontSize: 12, fontWeight: 700, outline: 'none', letterSpacing: '0.06em',
              }}
            />
            <button
              onClick={() => void handleCouponRedeem()}
              disabled={!couponCode.trim() || couponStatus === 'loading'}
              className="btn-press"
              style={{
                border: 0, borderRadius: 10, padding: '0 16px',
                background: couponCode.trim() ? 'linear-gradient(135deg,#b45309,#f59e0b)' : 'rgba(255,255,255,0.05)',
                color: couponCode.trim() ? '#fff' : '#374151',
                fontSize: 11, fontWeight: 800, cursor: couponCode.trim() ? 'pointer' : 'default',
                letterSpacing: '0.06em', whiteSpace: 'nowrap',
              }}
            >
              {couponStatus === 'loading' ? '···' : 'APPLY'}
            </button>
          </div>
          {couponMessage && (
            <div role="status" style={{
              marginTop: 8, fontSize: 11, fontWeight: 600,
              color: couponStatus === 'success' ? '#34d399' : '#f87171',
            }}>
              {couponMessage}
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════
            GAMES SECTION HEADER
        ════════════════════════════════════════ */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.01em' }}>Games</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>Pick a game and make your move</div>
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: 8,
            background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.15)',
            fontSize: 9, fontWeight: 800, color: '#34d399', letterSpacing: '0.08em',
          }}>
            {GAMES.filter(g => g.available).length} LIVE
          </div>
        </div>

        {/* ════════════════════════════════════════
            GAME CARDS — stacked full width
        ════════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {GAMES.map((game, i) => (
            <div
              key={game.id}
              style={{ animation: `slideUp 0.4s cubic-bezier(0.22,1,0.36,1) ${i * 0.08}s both` }}
            >
              <GameCard
                game={game}
                slotsAllowed={slotsAllowed}
                accessChecked={accessChecked}
              />
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
