import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { initAuth, getAgentJwt } from '../lib/auth';
import { getProfile, checkKenoAccess } from '../lib/api';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

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
  tag?: string;
  tagColor?: string;
  available: boolean;
  bonusNote?: string;
  bonusNoteColor?: string;
}

const GAMES: Game[] = [
  {
    id: 'bingo',
    title: 'Fidel Bingo',
    subtitle: 'Live multiplayer • Win up to 40K Birr',
    emoji: '🎯',
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #0f2140 55%, #0a1628 100%)',
    glowColor: 'rgba(245,158,11,0.35)',
    badge: 'LIVE',
    badgeColor: '#ef4444',
    route: '/bingo',
    tag: '🔥 HOT',
    tagColor: '#f59e0b',
    available: true,
    bonusNote: '🎁 Bonus accepted',
    bonusNoteColor: '#22c55e',
  },
  {
    id: 'slots',
    title: 'Multi Hot 5',
    subtitle: 'Slots • 5 paylines • Multiplier reel',
    emoji: '🎰',
    gradient: 'linear-gradient(135deg, #3b1f00 0%, #1e1100 55%, #0d0800 100%)',
    glowColor: 'rgba(245,158,11,0.3)',
    route: '/slots',
    rtp: '96% RTP',
    tag: 'NEW',
    tagColor: '#10b981',
    available: true,
    bonusNote: '💳 Deposit required',
    bonusNoteColor: '#f59e0b',
  },
  {
    id: 'rank',
    title: 'Leaderboard',
    subtitle: 'Top players • Weekly rankings',
    emoji: '🏆',
    gradient: 'linear-gradient(135deg, #1a1200 0%, #0d0a00 55%, #060500 100%)',
    glowColor: 'rgba(251,191,36,0.3)',
    route: '/rank',
    tag: 'LIVE',
    tagColor: '#f59e0b',
    available: true,
  },
  {
    id: 'keno',
    title: 'Fast Keno',
    subtitle: 'Pick 1–10 numbers • Draw every 45s',
    emoji: '🔢',
    gradient: 'linear-gradient(135deg, #003322 0%, #001a11 55%, #000d09 100%)',
    glowColor: 'rgba(34,197,94,0.3)',
    route: '/keno',
    tag: 'NEW',
    tagColor: '#22c55e',
    available: true,
    bonusNote: '💳 Deposit required',
    bonusNoteColor: '#f59e0b',
  },
  {
    id: 'dice',
    title: 'Lucky Dice',
    subtitle: 'Roll & win • Instant results',
    emoji: '🎲',
    gradient: 'linear-gradient(135deg, #1f0a2e 0%, #100518 55%, #07030e 100%)',
    glowColor: 'rgba(236,72,153,0.25)',
    route: '/dice',
    tag: 'SOON',
    tagColor: '#64748b',
    available: false,
  },
  {
    id: 'spin',
    title: 'Spin & Win',
    subtitle: 'Fortune wheel • Spin for prizes',
    emoji: '🎡',
    gradient: 'linear-gradient(135deg, #001f3f 0%, #001020 55%, #00080f 100%)',
    glowColor: 'rgba(59,130,246,0.25)',
    route: '/spin',
    tag: 'SOON',
    tagColor: '#64748b',
    available: false,
  },
];

function GameCard({ game, balance }: { game: Game; balance: number | null }) {
  const navigate = useNavigate();

  function handleClick() {
    if (!game.available) return;
    navigate(game.route);
  }

  return (
    <button
      onClick={handleClick}
      disabled={!game.available}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        minHeight: 148,
        background: game.gradient,
        border: `1px solid ${game.available ? `${game.glowColor.replace('0.', '0.4').replace('rgba', 'rgba')}` : 'rgba(255,255,255,0.04)'}`,
        borderRadius: 22,
        padding: '18px 16px 16px',
        cursor: game.available ? 'pointer' : 'default',
        textAlign: 'left',
        overflow: 'hidden',
        opacity: game.available ? 1 : 0.7,
        boxShadow: game.available
          ? `0 16px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.08)`
          : '0 8px 20px rgba(0,0,0,0.3)',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
      }}
      onMouseEnter={e => {
        if (!game.available) return;
        (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 24px 52px rgba(0,0,0,0.5), 0 0 28px ${game.glowColor}, inset 0 1px 0 rgba(255,255,255,0.1)`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = game.available
          ? '0 16px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.08)'
          : '0 8px 20px rgba(0,0,0,0.3)';
      }}
    >
      {/* Glow orb */}
      <div style={{
        position: 'absolute', top: -24, right: -24,
        width: 120, height: 120, borderRadius: '50%',
        background: game.glowColor,
        filter: 'blur(36px)',
        pointerEvents: 'none',
      }} />

      {/* Top row: emoji + tag + badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 16,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26,
          boxShadow: `0 8px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)`,
          flexShrink: 0,
        }}>{game.emoji}</div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
          {game.badge && (
            <div style={{
              fontSize: 9, fontWeight: 900, letterSpacing: '0.12em',
              color: '#fff',
              background: 'rgba(239,68,68,0.85)',
              border: '1px solid rgba(239,68,68,0.5)',
              borderRadius: 8, padding: '3px 7px',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', display: 'inline-block', animation: 'lobbyPulse 1.2s ease-in-out infinite' }} />
              {game.badge}
            </div>
          )}
          {game.tag && (
            <div style={{
              fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
              color: game.tagColor,
              background: `${game.tagColor}22`,
              border: `1px solid ${game.tagColor}44`,
              borderRadius: 8, padding: '3px 7px',
            }}>{game.tag}</div>
          )}
        </div>
      </div>

      {/* Title + subtitle */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.3px', marginBottom: 4 }}>
          {game.title}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(203,213,225,0.7)', fontWeight: 500, lineHeight: 1.45 }}>
          {game.subtitle}
        </div>
        {game.bonusNote && (
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            marginTop: 7, fontSize: 9, fontWeight: 800, letterSpacing: '0.05em',
            color: game.bonusNoteColor,
            background: `${game.bonusNoteColor}18`,
            border: `1px solid ${game.bonusNoteColor}40`,
            borderRadius: 7, padding: '3px 7px',
          }}>{game.bonusNote}</div>
        )}
      </div>

      {/* Bottom row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        {game.rtp && (
          <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.8)', fontWeight: 700, letterSpacing: '0.06em' }}>
            {game.rtp}
          </div>
        )}
        {game.available ? (
          <div style={{
            marginLeft: 'auto',
            fontSize: 11, fontWeight: 800, color: '#f8fafc',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: '5px 12px',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <>Play <span style={{ fontSize: 13 }}>→</span></>
          </div>
        ) : (
          <div style={{
            marginLeft: 'auto',
            fontSize: 10, fontWeight: 800, color: '#475569',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 10, padding: '5px 12px',
          }}>Coming Soon</div>
        )}
      </div>
    </button>
  );
}

export default function GamesLobbyScreen() {
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isAgent, setIsAgent] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);
  const [kenoAllowed, setKenoAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        await initAuth();
        const [profile, kenoAccess] = await Promise.all([getProfile(), checkKenoAccess().catch(() => ({ allowed: false }))]);
        if (!cancelled) {
          setBalance(profile.mainWallet.balance);
          setUsername(profile.username ?? null);
          setIsAgent(!!getAgentJwt());
          setIsSuspended(profile.is_suspended);
          setKenoAllowed(kenoAccess.allowed);
        }
      } catch {
        // ignore — auth may not be ready yet
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (isSuspended) {
    return (
      <div style={{
        minHeight: '100dvh',
        background: 'linear-gradient(180deg,#07111e 0%,#050b18 50%,#030710 100%)',
        color: '#f8fafc',
        maxWidth: 480,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
        textAlign: 'center',
        gap: 16,
      }}>
        <div style={{ fontSize: 56 }}>🚫</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#f87171', letterSpacing: '-0.4px' }}>
          Account Suspended
        </div>
        <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, maxWidth: 300 }}>
          መለያዎ ታግዷል። እባክዎ ድጋፍ ያግኙ።{'\n'}
          Your account has been suspended. Please contact support.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'radial-gradient(ellipse at 50% -20%, rgba(245,158,11,0.07) 0%, transparent 55%), linear-gradient(180deg,#07111e 0%,#050b18 50%,#030710 100%)',
      color: '#f8fafc',
      maxWidth: 480,
      margin: '0 auto',
      paddingBottom: 92,
    }}>

      <style>{`
        @keyframes lobbyPulse {
          0%,100% { opacity:0.6; transform:scale(1); }
          50%      { opacity:1;   transform:scale(1.25); }
        }
        @keyframes lobbySlideUp {
          from { transform:translateY(18px); opacity:0; }
          to   { transform:translateY(0);    opacity:1; }
        }
      `}</style>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={{
        padding: '20px 20px 16px',
        background: 'rgba(3,7,14,0.6)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo + greeting */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: 'linear-gradient(135deg,#f59e0b,#d97706)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: 17, color: '#0a0e1a',
              boxShadow: '0 4px 16px rgba(245,158,11,0.45), inset 0 1px 0 rgba(255,255,255,0.3)',
            }}>FB</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.4px', color: '#f1f5f9' }}>
                {username ? `Hey, ${username}` : 'Fidel Games'}
              </div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontWeight: 700, letterSpacing: '0.08em' }}>
                CHOOSE YOUR GAME
              </div>
            </div>
          </div>

          {/* Balance pill */}
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 14, padding: '8px 14px',
            textAlign: 'right',
          }}>
            <div style={{ fontSize: 9, color: '#475569', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Balance</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#fff7e6', letterSpacing: '-0.5px' }}>
              {balance !== null ? balance.toFixed(2) : '—'}
              <span style={{ fontSize: 9, color: '#d89b2b', fontWeight: 800, marginLeft: 4 }}>ETB</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Featured banner ───────────────────────────────────────── */}
      <div style={{ padding: '20px 16px 0', animation: 'lobbySlideUp 0.4s cubic-bezier(0.22,1,0.36,1)' }}>
        <div style={{
          position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg,#1a3a5c 0%,#0d2240 50%,#071426 100%)',
          border: '1px solid rgba(245,158,11,0.22)',
          borderRadius: 24, padding: '22px 20px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.07)',
          cursor: 'pointer',
        }}
          onClick={() => navigate('/bingo')}
        >
          {/* Glow blobs */}
          <div style={{ position:'absolute', top:-30, right:-20, width:160, height:160, borderRadius:'50%', background:'rgba(245,158,11,0.12)', filter:'blur(50px)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', bottom:-40, left:-20, width:140, height:140, borderRadius:'50%', background:'rgba(14,165,233,0.08)', filter:'blur(45px)', pointerEvents:'none' }} />

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <div style={{
                  fontSize: 9, fontWeight:900, letterSpacing:'0.12em', color:'#fff',
                  background:'rgba(239,68,68,0.8)', border:'1px solid rgba(239,68,68,0.45)',
                  borderRadius:8, padding:'3px 8px',
                  display:'flex', alignItems:'center', gap:5,
                }}>
                  <span style={{ width:5,height:5,borderRadius:'50%',background:'#fff',display:'inline-block',animation:'lobbyPulse 1.2s ease-in-out infinite' }} />
                  LIVE NOW
                </div>
                <div style={{ fontSize:9, fontWeight:700, color:'#f59e0b', letterSpacing:'0.08em' }}>🔥 FEATURED</div>
              </div>
              <div style={{ fontSize:24, fontWeight:900, color:'#f8fafc', letterSpacing:'-0.6px', marginBottom:5 }}>
                Fidel Bingo
              </div>
              <div style={{ fontSize:12, color:'rgba(203,213,225,0.75)', marginBottom:10 }}>
                Multiplayer live bingo • Win up to <span style={{ color:'#f59e0b', fontWeight:800 }}>40,000 ETB</span>
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center',
                marginBottom: 14, fontSize: 10, fontWeight: 800, letterSpacing: '0.05em',
                color: '#22c55e',
                background: 'rgba(34,197,94,0.12)',
                border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: 8, padding: '4px 10px',
              }}>🎁 Welcome bonus accepted here</div>
              <div style={{
                display:'inline-flex', alignItems:'center', gap:6,
                background:'linear-gradient(135deg,#f59e0b,#d97706)',
                borderRadius:12, padding:'10px 20px',
                fontSize:13, fontWeight:900, color:'#0a0e1a',
                boxShadow:'0 6px 20px rgba(245,158,11,0.35)',
              }}>
                Play Now <span style={{ fontSize:15 }}>→</span>
              </div>
            </div>
            <div style={{ fontSize:64, filter:'drop-shadow(0 8px 24px rgba(245,158,11,0.3))', flexShrink:0, marginLeft:12 }}>🎯</div>
          </div>
        </div>
      </div>

      {/* ── Section label ────────────────────────────────────────── */}
      <div style={{ padding:'22px 20px 12px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize:11, color:'#475569', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.12em' }}>
          All Games
        </div>
        <div style={{ fontSize:10, color:'#334155', fontWeight:700 }}>{GAMES.length} games</div>
      </div>

      {/* ── Game grid ────────────────────────────────────────────── */}
      <div style={{ padding:'0 16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {GAMES.filter((g) => g.id !== 'keno' || kenoAllowed).map((game, i) => (
          <div
            key={game.id}
            style={{ animation: `lobbySlideUp 0.38s cubic-bezier(0.22,1,0.36,1) ${i * 0.06}s both` }}
          >
            <GameCard game={game} balance={balance} />
          </div>
        ))}
      </div>

      {/* ── Agent button ─────────────────────────────────────────── */}
      {isAgent && (
        <div style={{ padding:'20px 16px 0' }}>
          <button
            onClick={() => navigate('/agent/dashboard')}
            style={{
              display:'block', width:'100%',
              background:'linear-gradient(135deg,#10b981,#059669)',
              border:'none', borderRadius:18, padding:'16px 20px',
              cursor:'pointer', textAlign:'left',
              boxShadow:'0 6px 20px rgba(16,185,129,0.3)',
            }}
          >
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:40,height:40,borderRadius:12,background:'rgba(255,255,255,0.18)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18 }}>📊</div>
                <div>
                  <div style={{ fontSize:15,fontWeight:900,color:'#fff',marginBottom:2 }}>Agent Dashboard</div>
                  <div style={{ fontSize:11,color:'rgba(255,255,255,0.75)' }}>Referrals & earnings</div>
                </div>
              </div>
              <span style={{ fontSize:18,color:'rgba(255,255,255,0.75)' }}>→</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
