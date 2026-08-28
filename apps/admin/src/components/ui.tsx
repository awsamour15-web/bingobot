// Modern professional UI primitives — Fidel Bingo Admin
import React, { useEffect, useMemo, useState } from 'react';

export const C = {
  primary: '#6366f1',
  primaryDark: '#4f46e5',
  primaryLight: 'var(--c-primary-light)',
  danger: '#ef4444',
  dangerLight: 'var(--c-danger-light)',
  success: '#22c55e',
  successLight: 'var(--c-success-light)',
  warning: '#f59e0b',
  warningLight: 'var(--c-warning-light)',
  info: '#3b82f6',
  infoLight: 'var(--c-info-light)',
  bg: 'var(--c-bg)',
  bgCard: 'var(--c-bg-card)',
  border: 'var(--c-border)',
  borderHover: 'var(--c-border-hover)',
  text: 'var(--c-text)',
  textSecondary: 'var(--c-text-secondary)',
  muted: 'var(--c-muted)',
  sidebar: 'var(--c-sidebar)',
  sidebarHover: 'var(--c-sidebar-hover)',
  sidebarActive: '#6366f1',
  header: 'var(--c-header)',
};

// ─── Button ───────────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'danger' | 'success' | 'ghost' | 'outline' | 'warning';
type BtnSize = 'sm' | 'md' | 'lg';

export function Btn({
  children, onClick, variant = 'primary', disabled = false,
  size = 'md', type = 'button', fullWidth = false, icon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  size?: BtnSize;
  type?: 'button' | 'submit' | 'reset';
  fullWidth?: boolean;
  icon?: React.ReactNode;
}) {
  const base: React.CSSProperties = {
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    width: fullWidth ? '100%' : undefined,
    letterSpacing: '0.01em',
    position: 'relative',
    overflow: 'hidden',
  };

  const variants: Record<BtnVariant, React.CSSProperties> = {
    primary: {
      background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
      color: '#fff',
      border: '1px solid rgba(99,102,241,0.6)',
      boxShadow: disabled ? 'none' : '0 4px 14px rgba(99,102,241,0.35)',
    },
    danger: {
      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
      color: '#fff',
      border: '1px solid rgba(239,68,68,0.6)',
      boxShadow: disabled ? 'none' : '0 4px 14px rgba(239,68,68,0.25)',
    },
    success: {
      background: 'linear-gradient(135deg, #22c55e, #16a34a)',
      color: '#fff',
      border: '1px solid rgba(34,197,94,0.6)',
      boxShadow: disabled ? 'none' : '0 4px 14px rgba(34,197,94,0.25)',
    },
    warning: {
      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
      color: '#fff',
      border: '1px solid rgba(245,158,11,0.6)',
      boxShadow: disabled ? 'none' : '0 4px 14px rgba(245,158,11,0.25)',
    },
    ghost: {
      background: 'rgba(99,102,241,0.08)',
      color: '#818cf8',
      border: '1px solid rgba(99,102,241,0.2)',
      boxShadow: 'none',
    },
    outline: {
      background: 'transparent',
      color: 'var(--c-text-secondary)',
      border: '1px solid var(--c-border)',
      boxShadow: 'none',
    },
  };

  const sizes: Record<BtnSize, React.CSSProperties> = {
    sm: { padding: '5px 12px', fontSize: 12, borderRadius: 8 },
    md: { padding: '9px 18px', fontSize: 13, borderRadius: 10 },
    lg: { padding: '12px 24px', fontSize: 14, borderRadius: 12 },
  };

  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...base, ...variants[variant], ...sizes[size] }}>
      {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
      {children}
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary';

export function Badge({ children, variant = 'neutral' }: { children: React.ReactNode; variant?: BadgeVariant }) {
  const map: Record<BadgeVariant, React.CSSProperties> = {
    success: { background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' },
    danger:  { background: 'rgba(239,68,68,0.12)',  color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' },
    warning: { background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' },
    info:    { background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' },
    neutral: { background: 'rgba(148,163,184,0.1)', color: 'var(--c-muted)', border: '1px solid rgba(148,163,184,0.15)' },
    primary: { background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' },
  };
  return (
    <span style={{
      ...map[variant],
      borderRadius: 6, padding: '3px 8px',
      fontSize: 11, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.06em',
      display: 'inline-block', whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function Card({ children, style, accent }: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  accent?: boolean;
}) {
  return (
    <div style={{
      position: 'relative',
      background: 'var(--c-bg-card)',
      border: '1px solid var(--c-border)',
      borderRadius: 16,
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.08)',
      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      ...style,
    }}>
      {accent !== false && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 3,
          background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #06b6d4)',
          borderRadius: '16px 16px 0 0',
          pointerEvents: 'none',
        }} />
      )}
      <div style={{ paddingTop: accent !== false ? 4 : 0 }}>{children}</div>
    </div>
  );
}

// ─── Card Header ──────────────────────────────────────────────────────────────

export function CardHeader({ title, subtitle, action }: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 20,
      gap: 12,
      flexWrap: 'wrap',
    }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.01em' }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--c-muted)', lineHeight: 1.5 }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

export function StatCard({ label, value, color, icon }: {
  label: string;
  value: string | number;
  color?: string;
  icon?: string;
}) {
  return (
    <div style={{
      background: 'var(--c-bg-card)',
      border: '1px solid var(--c-border)',
      borderRadius: 14,
      padding: '20px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      position: 'relative',
      overflow: 'hidden',
      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      <div style={{
        position: 'absolute', right: -8, top: -8,
        width: 72, height: 72, borderRadius: '50%',
        background: color ? `${color}14` : 'rgba(99,102,241,0.1)',
        pointerEvents: 'none',
      }} />
      {icon && (
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: color ? `${color}18` : 'rgba(99,102,241,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0, position: 'relative', zIndex: 1,
        }}>
          {icon}
        </div>
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          fontSize: 11, color: 'var(--c-muted)', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 26, fontWeight: 800, color: color ?? 'var(--c-text)',
          lineHeight: 1, letterSpacing: '-0.03em',
        }}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ─── Custom icons ─────────────────────────────────────────────────────────────

export type IconName =
  | 'dashboard' | 'players' | 'finance' | 'deposits' | 'withdrawals'
  | 'agents' | 'promotions' | 'cartelas' | 'settings' | 'spark' | 'trend' | 'ticket' | 'bonus';

export function CustomIcon({ name, size = 18, color = 'currentColor' }: {
  name: IconName; size?: number; color?: string;
}) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const icons: Record<IconName, React.ReactNode> = {
    dashboard: <svg {...p}><path d="M4 18V9.5M10 18V6M16 18v-7M22 18V4" /></svg>,
    players: <svg {...p}><circle cx="9" cy="7" r="3" /><path d="M4 18c.8-2.2 3-3.5 5-3.5S12.2 15.8 13 18" /><path d="M15.5 8.5a2.5 2.5 0 0 1 0 5" /><path d="M18.5 17.5c-.6-1.6-2.2-2.5-3.7-2.5" /></svg>,
    finance: <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v8M9 11h3.8a2.2 2.2 0 1 1 0 4.4H9" /></svg>,
    deposits: <svg {...p}><path d="M6 8h12l-1 9H7L6 8Z" /><path d="M9 8V6.5A3 3 0 0 1 12 3.5a3 3 0 0 1 3 3V8" /><path d="M12 12v4" /></svg>,
    withdrawals: <svg {...p}><path d="M16 4h4v4" /><path d="M8 16 20 4" /><path d="M4 8h12v12H4z" /></svg>,
    agents: <svg {...p}><path d="M6 18a6 6 0 0 1 12 0" /><circle cx="12" cy="8" r="3.5" /><path d="M18 18a6 6 0 0 0-1.5-3.8" /></svg>,
    promotions: <svg {...p}><path d="M4 12V7.5A1.5 1.5 0 0 1 5.5 6H7l2-3h6l2 3h1.5A1.5 1.5 0 0 1 20 7.5V12" /><path d="M7 12h10v6a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-6Z" /><path d="M10 15h4" /></svg>,
    bonus: <svg {...p}><path d="M12 2v20M17 6.5A3.5 3.5 0 0 0 12 4a3.5 3.5 0 0 0-5 3.5A3.5 3.5 0 0 0 12 11a3.5 3.5 0 0 1 5 3.5A3.5 3.5 0 0 1 12 18a3.5 3.5 0 0 1-5-3.5" /><path d="M7 7h.01M17 17h.01" /></svg>,
    cartelas: <svg {...p}><path d="M7 4h10l3 3v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M9 9h6M9 12h6M9 15h4" /></svg>,
    settings: <svg {...p}><circle cx="12" cy="12" r="3.1" /><path d="M19.4 15a7.8 7.8 0 0 0 .1-1l1.9-1.5-1.8-3.1-2.3.7a7 7 0 0 0-1.7-1l-.4-2.4H9.8l-.4 2.4a7 7 0 0 0-1.7 1l-2.3-.7-1.8 3.1L4.5 14a7.8 7.8 0 0 0 .1 1l-1.9 1.5 1.8 3.1 2.3-.7c.5.4 1.1.8 1.7 1l.4 2.4h4.4l.4-2.4c.6-.2 1.2-.6 1.7-1l2.3.7 1.8-3.1L19.4 15Z" /></svg>,
    spark: <svg {...p}><path d="M12 2v6M12 16v6M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M2 12h6M16 12h6M4.9 19.1l4.2-4.2M14.9 9.1l4.2-4.2" /></svg>,
    trend: <svg {...p}><path d="M4 16l5-5 4 4 7-9" /><path d="M17 6h3v3" /></svg>,
    ticket: <svg {...p}><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v2.2a2.2 2.2 0 0 0 0 4.4v2.2A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-2.2a2.2 2.2 0 0 0 0-4.4V8.5Z" /><path d="M9 9h6M9 15h6" /></svg>,
  };
  return <>{icons[name]}</>;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function formatAnimatedNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export function KpiCard({
  label, value, delta, icon, tone = 'indigo',
  trend = [42, 55, 52, 68, 70, 76, 88],
}: {
  label: string;
  value: string | number;
  delta?: string;
  icon: IconName;
  tone?: 'indigo' | 'emerald' | 'cyan' | 'amber' | 'rose';
  trend?: number[];
}) {
  const tones = {
    indigo: { glow: '#6366f1', soft: 'rgba(99,102,241,0.15)', from: '#818cf8', to: '#6366f1', text: '#a5b4fc' },
    emerald: { glow: '#22c55e', soft: 'rgba(34,197,94,0.15)', from: '#4ade80', to: '#22c55e', text: '#86efac' },
    cyan: { glow: '#06b6d4', soft: 'rgba(6,182,212,0.15)', from: '#22d3ee', to: '#06b6d4', text: '#67e8f9' },
    amber: { glow: '#f59e0b', soft: 'rgba(245,158,11,0.15)', from: '#fbbf24', to: '#f59e0b', text: '#fde68a' },
    rose: { glow: '#ef4444', soft: 'rgba(239,68,68,0.15)', from: '#fb7185', to: '#ef4444', text: '#fca5a5' },
  };

  const t = tones[tone];

  const [display, setDisplay] = useState<number | string>(typeof value === 'number' ? 0 : value);
  const isNumeric = typeof value === 'number';

  useEffect(() => {
    if (!isNumeric) return;
    const duration = 600;
    const startTime = performance.now();
    const num = value as number;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(num * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, isNumeric]);

  const chartPath = useMemo(() => {
    if (!trend.length) return '';
    const max = Math.max(...trend);
    const min = Math.min(...trend);
    const range = Math.max(max - min, 1);
    return trend.map((v, i) => {
      const x = (i / (trend.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 72 - 12;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  }, [trend]);

  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      background: 'var(--c-bg-card)',
      border: `1px solid var(--c-border)`,
      borderRadius: 16,
      padding: '20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.06)',
      minHeight: 160,
      cursor: 'default',
      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at top right, ${t.soft}, transparent 50%)`,
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: t.soft, color: t.glow,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
              <CustomIcon name={icon} size={17} color={t.glow} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {label}
            </div>
          </div>
          {delta && (
            <span style={{
              padding: '4px 8px', borderRadius: 6, fontSize: 11,
              background: t.soft, color: t.text, fontWeight: 700,
            }}>
              {delta}
            </span>
          )}
        </div>

        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--c-text)', lineHeight: 1, marginBottom: 14 }}>
          {isNumeric ? formatAnimatedNumber(Number(display)) : value}
        </div>

        <div style={{ height: 44, borderRadius: 8, overflow: 'hidden', background: 'rgba(148,163,184,0.04)' }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            <defs>
              <linearGradient id={`kg-${label}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor={t.from} />
                <stop offset="100%" stopColor={t.to} />
              </linearGradient>
            </defs>
            <path d={`${chartPath} L 100 100 L 0 100 Z`} fill={`url(#kg-${label})`} opacity={0.1} />
            <path d={chartPath} fill="none" stroke={`url(#kg-${label})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--c-border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: '10px 16px',
      background: 'var(--c-table-head)',
      color: 'var(--c-muted)',
      fontWeight: 600, fontSize: 11,
      textTransform: 'uppercase', letterSpacing: '0.07em',
      textAlign: right ? 'right' : 'left',
      borderBottom: '1px solid var(--c-border)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  );
}

export function Td({ children, muted, mono, right, style }: {
  children: React.ReactNode;
  muted?: boolean; mono?: boolean; right?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <td style={{
      padding: '12px 16px',
      borderBottom: '1px solid var(--c-border)',
      color: muted ? 'var(--c-muted)' : 'var(--c-text)',
      verticalAlign: 'middle',
      fontFamily: mono ? 'monospace' : undefined,
      fontSize: mono ? 12 : 13,
      textAlign: right ? 'right' : 'left',
      ...style,
    }}>
      {children}
    </td>
  );
}

export function TrEmpty({ cols, message = 'No data found.' }: { cols: number; message?: string }) {
  return (
    <tr>
      <td colSpan={cols} style={{ padding: '48px 16px', textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 28, opacity: 0.4 }}>○</div>
          <div style={{ fontSize: 13, color: 'var(--c-muted)', fontWeight: 500 }}>{message}</div>
        </div>
      </td>
    </tr>
  );
}

export function TrLoading({ cols }: { cols: number }) {
  return (
    <>
      {[...Array(4)].map((_, i) => (
        <tr key={i}>
          {[...Array(cols)].map((__, j) => (
            <td key={j} style={{ padding: '12px 16px', borderBottom: '1px solid var(--c-border)' }}>
              <div style={{
                height: 14, borderRadius: 4,
                background: 'var(--c-shimmer)',
                animation: 'shimmer 1.4s ease infinite',
                width: j === 0 ? '60%' : j === cols - 1 ? '40%' : '80%',
              }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Alert ───────────────────────────────────────────────────────────────────

export function Alert({ type, children }: {
  type: 'error' | 'success' | 'warning' | 'info';
  children: React.ReactNode;
}) {
  const map = {
    error:   { bg: 'rgba(239,68,68,0.08)',  color: '#f87171', border: 'rgba(239,68,68,0.2)',  icon: '✕' },
    success: { bg: 'rgba(34,197,94,0.08)',  color: '#4ade80', border: 'rgba(34,197,94,0.2)',  icon: '✓' },
    warning: { bg: 'rgba(245,158,11,0.08)', color: '#fbbf24', border: 'rgba(245,158,11,0.2)', icon: '⚠' },
    info:    { bg: 'rgba(59,130,246,0.08)', color: '#60a5fa', border: 'rgba(59,130,246,0.2)', icon: 'ℹ' },
  };
  const s = map[type];
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      display: 'flex', alignItems: 'flex-start', gap: 8,
    }}>
      <span style={{ fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
      <span style={{ lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

export function Field({ label, children, hint }: {
  label: string; children: React.ReactNode; hint?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{
        fontSize: 12, fontWeight: 600, color: 'var(--c-text-secondary)',
        letterSpacing: '0.02em',
      }}>
        {label}
      </label>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--c-muted)', lineHeight: 1.4 }}>{hint}</span>}
    </div>
  );
}

export const inputCss: React.CSSProperties = {
  padding: '9px 12px',
  border: '1px solid var(--c-border)',
  borderRadius: 10,
  fontSize: 13,
  color: 'var(--c-text)',
  background: 'var(--c-input-bg)',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
  minHeight: 40,
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

export const selectCss: React.CSSProperties = { ...inputCss, cursor: 'pointer' };

// ─── Page Header ──────────────────────────────────────────────────────────────

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 24,
      flexWrap: 'wrap',
      gap: 12,
    }}>
      <div>
        <h1 style={{
          margin: 0, fontSize: 24, fontWeight: 800,
          color: 'var(--c-text)', letterSpacing: '-0.03em', lineHeight: 1.1,
        }}>
          {title}
        </h1>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ─── Dark mode toggle ─────────────────────────────────────────────────────────

export function DarkToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--c-bg-secondary)', border: '1px solid var(--c-border)',
        borderRadius: 20, padding: '5px 10px', cursor: 'pointer',
        color: 'var(--c-muted)', fontSize: 12, fontWeight: 500,
        transition: 'all 0.15s',
      }}
    >
      <span style={{
        position: 'relative', display: 'inline-block',
        width: 28, height: 16, borderRadius: 8,
        background: dark ? '#6366f1' : 'rgba(148,163,184,0.3)',
        transition: 'background 0.2s', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 2, left: dark ? 14 : 2,
          width: 12, height: 12, borderRadius: '50%',
          background: '#fff', transition: 'left 0.2s',
        }} />
      </span>
      {dark ? '🌙' : '☀️'}
    </button>
  );
}

// ─── Global CSS ───────────────────────────────────────────────────────────────

export const GLOBAL_CSS = `
  :root {
    --c-bg: #0a0f1e;
    --c-bg-secondary: rgba(15,23,42,0.6);
    --c-bg-card: rgba(15,23,42,0.85);
    --c-border: rgba(148,163,184,0.12);
    --c-border-hover: rgba(148,163,184,0.25);
    --c-text: #e2e8f0;
    --c-text-secondary: #94a3b8;
    --c-muted: #64748b;
    --c-sidebar: rgba(9,13,24,0.96);
    --c-sidebar-hover: rgba(15,23,42,0.9);
    --c-header: rgba(10,15,29,0.8);
    --c-table-head: rgba(15,23,42,0.7);
    --c-input-bg: rgba(15,23,42,0.9);
    --c-badge-neutral-bg: rgba(148,163,184,0.1);
    --c-primary-light: rgba(99,102,241,0.15);
    --c-danger-light: rgba(239,68,68,0.12);
    --c-success-light: rgba(34,197,94,0.1);
    --c-warning-light: rgba(245,158,11,0.1);
    --c-info-light: rgba(59,130,246,0.12);
    --c-tr-hover: rgba(148,163,184,0.04);
    --c-shimmer: rgba(148,163,184,0.08);
  }
  [data-theme="light"] {
    --c-bg: #f8fafc;
    --c-bg-secondary: rgba(255,255,255,0.8);
    --c-bg-card: #ffffff;
    --c-border: #e2e8f0;
    --c-border-hover: #cbd5e1;
    --c-text: #0f172a;
    --c-text-secondary: #475569;
    --c-muted: #94a3b8;
    --c-sidebar: #0f172a;
    --c-sidebar-hover: #1e293b;
    --c-header: rgba(255,255,255,0.95);
    --c-table-head: #f8fafc;
    --c-input-bg: #ffffff;
    --c-badge-neutral-bg: #f1f5f9;
    --c-primary-light: #ede9fe;
    --c-danger-light: #fee2e2;
    --c-success-light: #dcfce7;
    --c-warning-light: #fef3c7;
    --c-info-light: #dbeafe;
    --c-tr-hover: #f8fafc;
    --c-shimmer: #e2e8f0;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
    background: var(--c-bg);
    color: var(--c-text);
    transition: background 0.2s, color 0.2s;
  }
  [data-theme="dark"] body {
    background:
      radial-gradient(ellipse at 20% 0%, rgba(99,102,241,0.18) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 100%, rgba(6,182,212,0.12) 0%, transparent 50%),
      #0a0f1e;
  }
  a, button, input, select, textarea { font: inherit; }
  input, select, textarea { color: var(--c-text); background: var(--c-input-bg); }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: rgba(99,102,241,0.7) !important;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes slideIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes shimmer { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
  @keyframes glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.7); } 50% { box-shadow: 0 0 0 10px rgba(99,102,241,0); } }
  .fade-in { animation: fadeIn 0.22s ease; }
  .slide-in { animation: slideIn 0.22s ease; }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }
  .soft-label {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 10px; border-radius: 6px;
    background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.15);
    color: #a5b4fc; font-size: 11px; font-weight: 600;
    letter-spacing: 0.06em; text-transform: uppercase;
  }
  tr:hover td { background: var(--c-tr-hover); transition: background 0.12s; }
  
  /* ── Responsive Design ── */
  @media (max-width: 1200px) {
    .summary-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 900px) {
    .summary-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
    table { font-size: 12px; }
  }
  @media (max-width: 768px) {
    table { min-width: 600px; }
    .summary-grid { grid-template-columns: 1fr; gap: 12px; }
    .table-responsive { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    button, input, select { font-size: 15px; }
  }
  @media (max-width: 640px) {
    .summary-grid { gap: 10px; }
    button { padding: 8px 16px; font-size: 13px; }
    input, select { font-size: 15px; padding: 10px; }
    table { min-width: 520px; font-size: 11px; }
    td, th { padding: 10px 12px; }
    .agent-actions { flex-direction: column; gap: 4px; }
  }
  @media (max-width: 520px) {
    body { font-size: 13px; }
    h1 { font-size: 20px; }
    h2 { font-size: 15px; }
    button, input, select { font-size: 15px; }
    .main-content { padding: 12px; }
  }
`;
