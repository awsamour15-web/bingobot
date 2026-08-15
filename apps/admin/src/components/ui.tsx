// Shared UI primitives for the admin panel
import React, { useEffect, useMemo, useState } from 'react';

// C uses CSS variables at runtime; fallback values are light-mode defaults
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
  const styles: Record<BtnVariant, React.CSSProperties> = {
    primary: { background: '#6366f1', color: '#fff', border: '1px solid #4f46e5' },
    danger: { background: '#ef4444', color: '#fff', border: '1px solid #dc2626' },
    success: { background: '#22c55e', color: '#fff', border: '1px solid #16a34a' },
    warning: { background: '#f59e0b', color: '#fff', border: '1px solid #d97706' },
    ghost: { background: 'transparent', color: '#6366f1', border: '1px solid var(--c-border)' },
    outline: { background: 'transparent', color: 'var(--c-text-secondary)', border: '1px solid var(--c-border)' },
  };
  const sizes: Record<BtnSize, React.CSSProperties> = {
    sm: { padding: '5px 12px', fontSize: 12, borderRadius: 6 },
    md: { padding: '8px 16px', fontSize: 14, borderRadius: 8 },
    lg: { padding: '11px 24px', fontSize: 15, borderRadius: 8 },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles[variant],
        ...sizes[size],
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: fullWidth ? 'center' : undefined,
        gap: 6,
        whiteSpace: 'nowrap',
        transition: 'all 0.18s ease',
        width: fullWidth ? '100%' : undefined,
        boxShadow: disabled ? 'none' : '0 8px 18px rgba(99, 102, 241, 0.15)',
        transform: 'translateY(0)',
      }}
    >
      {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
      {children}
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary';

export function Badge({ children, variant = 'neutral' }: { children: React.ReactNode; variant?: BadgeVariant }) {
  const map: Record<BadgeVariant, { bg: string; color: string }> = {
    success: { bg: 'var(--c-success-light)', color: '#15803d' },
    danger: { bg: 'var(--c-danger-light)', color: '#b91c1c' },
    warning: { bg: 'var(--c-warning-light)', color: '#92400e' },
    info: { bg: 'var(--c-info-light)', color: '#1d4ed8' },
    neutral: { bg: 'var(--c-badge-neutral-bg)', color: 'var(--c-text-secondary)' },
    primary: { bg: 'var(--c-primary-light)', color: '#4f46e5' },
  };
  const { bg, color } = map[variant];
  return (
    <span style={{
      background: bg, color, borderRadius: 20, padding: '2px 10px',
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
      display: 'inline-block', whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72))',
      border: '1px solid var(--c-border)',
      borderRadius: 22,
      padding: 24,
      boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)',
      backdropFilter: 'blur(18px)',
      ...style,
    }}>
      <div style={{
        position: 'absolute',
        inset: '0 auto auto 0',
        width: '100%',
        height: 4,
        background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #06b6d4)',
        opacity: 0.9,
      }} />
      {children}
    </div>
  );
}

// ─── Card Header ──────────────────────────────────────────────────────────────

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
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
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--c-text)', letterSpacing: '-0.02em' }}>{title}</h2>
        {subtitle && <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--c-muted)' }}>{subtitle}</p>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

export function StatCard({ label, value, color, icon }: { label: string; value: string | number; color?: string; icon?: string }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.65))',
      border: '1px solid var(--c-border)',
      borderRadius: 20,
      padding: '20px 22px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      boxShadow: '0 14px 28px rgba(15, 23, 42, 0.05)',
      minHeight: 116,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        right: -18,
        top: -18,
        width: 96,
        height: 96,
        borderRadius: '50%',
        background: color ? `${color}18` : 'rgba(99, 102, 241, 0.12)',
      }} />
      {icon && (
        <div style={{
          width: 50, height: 50, borderRadius: 16,
          background: color ? `${color}22` : 'rgba(99, 102, 241, 0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
          position: 'relative',
          zIndex: 1,
        }}>
          {icon}
        </div>
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          {label}
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: color ?? 'var(--c-text)', lineHeight: 1.1, letterSpacing: '-0.04em' }}>
          {value}
        </div>
      </div>
    </div>
  );
}

export type IconName =
  | 'dashboard'
  | 'players'
  | 'finance'
  | 'deposits'
  | 'withdrawals'
  | 'agents'
  | 'promotions'
  | 'cartelas'
  | 'settings'
  | 'spark'
  | 'trend'
  | 'ticket';

export function CustomIcon({ name, size = 18, color = 'currentColor' }: { name: IconName; size?: number; color?: string }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const icons: Record<IconName, React.ReactNode> = {
    dashboard: (
      <svg {...common}>
        <path d="M4 18V9.5M10 18V6M16 18v-7M22 18V4" />
      </svg>
    ),
    players: (
      <svg {...common}>
        <circle cx="9" cy="7" r="3" />
        <path d="M4 18c.8-2.2 3-3.5 5-3.5S12.2 15.8 13 18" />
        <path d="M15.5 8.5a2.5 2.5 0 0 1 0 5" />
        <path d="M18.5 17.5c-.6-1.6-2.2-2.5-3.7-2.5" />
      </svg>
    ),
    finance: (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v8M9 11h3.8a2.2 2.2 0 1 1 0 4.4H9" />
      </svg>
    ),
    deposits: (
      <svg {...common}>
        <path d="M6 8h12l-1 9H7L6 8Z" />
        <path d="M9 8V6.5A3 3 0 0 1 12 3.5a3 3 0 0 1 3 3V8" />
        <path d="M12 12v4" />
      </svg>
    ),
    withdrawals: (
      <svg {...common}>
        <path d="M16 4h4v4" />
        <path d="M8 16 20 4" />
        <path d="M4 8h12v12H4z" />
      </svg>
    ),
    agents: (
      <svg {...common}>
        <path d="M6 18a6 6 0 0 1 12 0" />
        <circle cx="12" cy="8" r="3.5" />
        <path d="M18 18a6 6 0 0 0-1.5-3.8" />
      </svg>
    ),
    promotions: (
      <svg {...common}>
        <path d="M4 12V7.5A1.5 1.5 0 0 1 5.5 6H7l2-3h6l2 3h1.5A1.5 1.5 0 0 1 20 7.5V12" />
        <path d="M7 12h10v6a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-6Z" />
        <path d="M10 15h4" />
      </svg>
    ),
    cartelas: (
      <svg {...common}>
        <path d="M7 4h10l3 3v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
        <path d="M9 9h6M9 12h6M9 15h4" />
      </svg>
    ),
    settings: (
      <svg {...common}>
        <circle cx="12" cy="12" r="3.1" />
        <path d="M19.4 15a7.8 7.8 0 0 0 .1-1l1.9-1.5-1.8-3.1-2.3.7a7 7 0 0 0-1.7-1l-.4-2.4H9.8l-.4 2.4a7 7 0 0 0-1.7 1l-2.3-.7-1.8 3.1L4.5 14a7.8 7.8 0 0 0 .1 1l-1.9 1.5 1.8 3.1 2.3-.7c.5.4 1.1.8 1.7 1l.4 2.4h4.4l.4-2.4c.6-.2 1.2-.6 1.7-1l2.3.7 1.8-3.1L19.4 15Z" />
      </svg>
    ),
    spark: (
      <svg {...common}>
        <path d="M12 2v6M12 16v6M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M2 12h6M16 12h6M4.9 19.1l4.2-4.2M14.9 9.1l4.2-4.2" />
      </svg>
    ),
    trend: (
      <svg {...common}>
        <path d="M4 16l5-5 4 4 7-9" />
        <path d="M17 6h3v3" />
      </svg>
    ),
    ticket: (
      <svg {...common}>
        <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v2.2a2.2 2.2 0 0 0 0 4.4v2.2A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-2.2a2.2 2.2 0 0 0 0-4.4V8.5Z" />
        <path d="M9 9h6M9 15h6" />
      </svg>
    ),
  };
  return <>{icons[name]}</>;
}

function formatAnimatedNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

export function KpiCard({
  label,
  value,
  delta,
  icon,
  tone = 'indigo',
  trend = [42, 55, 52, 68, 70, 76, 88],
}: {
  label: string;
  value: string | number;
  delta?: string;
  icon: IconName;
  tone?: 'indigo' | 'emerald' | 'cyan' | 'amber' | 'rose';
  trend?: number[];
}) {
  const toneMap = {
    indigo: { glow: '#6366f1', soft: 'rgba(99, 102, 241, 0.18)', from: '#8b5cf6', to: '#6366f1' },
    emerald: { glow: '#22c55e', soft: 'rgba(34, 197, 94, 0.18)', from: '#34d399', to: '#22c55e' },
    cyan: { glow: '#06b6d4', soft: 'rgba(6, 182, 212, 0.18)', from: '#22d3ee', to: '#06b6d4' },
    amber: { glow: '#f59e0b', soft: 'rgba(245, 158, 11, 0.18)', from: '#fbbf24', to: '#f59e0b' },
    rose: { glow: '#ef4444', soft: 'rgba(239, 68, 68, 0.18)', from: '#fb7185', to: '#ef4444' },
  };

  const [display, setDisplay] = useState<number | string>(typeof value === 'number' ? 0 : value);
  const numericValue = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
  const isNumeric = typeof value === 'number' || Number.isFinite(numericValue);

  useEffect(() => {
    if (!isNumeric || typeof value !== 'number') return;
    let frame = 0;
    const start = 0;
    const duration = 700;
    const startTime = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (value - start) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, isNumeric]);

  const currentValue = isNumeric && typeof value === 'number' ? display : value;
  const chartPath = useMemo(() => {
    if (!trend.length) return '';
    const max = Math.max(...trend);
    const min = Math.min(...trend);
    const range = Math.max(max - min, 1);
    return trend.map((point, index) => {
      const x = (index / (trend.length - 1)) * 100;
      const y = 100 - ((point - min) / range) * 72 - 12;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  }, [trend]);

  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(15, 23, 42, 0.68))',
      border: '1px solid var(--c-border)',
      borderRadius: 22,
      padding: '18px 18px 14px',
      boxShadow: '0 16px 32px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(99,102,241,0.08)',
      minHeight: 172,
    }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at top right, ${toneMap[tone].soft}, transparent 40%)` }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 42, height: 42, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: toneMap[tone].soft, color: toneMap[tone].glow, boxShadow: `0 0 18px ${toneMap[tone].soft}` }}>
              <CustomIcon name={icon} size={18} color={toneMap[tone].glow} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--c-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
          </div>
          {delta && (
            <span style={{ padding: '6px 8px', borderRadius: 999, fontSize: 11, background: toneMap[tone].soft, color: toneMap[tone].glow, fontWeight: 700 }}>{delta}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.05em', color: 'var(--c-text)' }}>
            {isNumeric && typeof value === 'number' ? formatAnimatedNumber(Number(currentValue), 0) : currentValue}
          </div>
          <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 700 }}>Live</div>
        </div>

        <div style={{ marginTop: 14, height: 48, borderRadius: 12, background: 'rgba(148,163,184,0.04)', border: '1px solid rgba(148,163,184,0.12)', overflow: 'hidden' }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
            <defs>
              <linearGradient id={`kpi-gradient-${label}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor={toneMap[tone].from} />
                <stop offset="100%" stopColor={toneMap[tone].to} />
              </linearGradient>
            </defs>
            <path d={`${chartPath} L 100 100 L 0 100 Z`} fill={`url(#kpi-gradient-${label})`} opacity={0.12} />
            <path d={chartPath} fill="none" stroke={`url(#kpi-gradient-${label})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─── Table primitives ────────────────────────────────────────────────────────

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      overflowX: 'auto',
      borderRadius: 16,
      border: '1px solid var(--c-border)',
      background: 'rgba(15, 23, 42, 0.01)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: '11px 16px',
      background: 'var(--c-table-head)',
      color: 'var(--c-muted)',
      fontWeight: 600,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      textAlign: right ? 'right' : 'left',
      borderBottom: '1px solid var(--c-border)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  );
}

export function Td({ children, muted, mono, right, style }: {
  children: React.ReactNode; muted?: boolean; mono?: boolean; right?: boolean; style?: React.CSSProperties;
}) {
  return (
    <td style={{
      padding: '11px 16px',
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
      <td colSpan={cols} style={{ padding: 40, textAlign: 'center', color: 'var(--c-muted)', fontSize: 14 }}>
        {message}
      </td>
    </tr>
  );
}

export function TrLoading({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} style={{ padding: 40, textAlign: 'center', color: 'var(--c-muted)', fontSize: 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 16 }}>⟳</span>
          Loading…
        </span>
      </td>
    </tr>
  );
}

// ─── Alert ───────────────────────────────────────────────────────────────────

export function Alert({ type, children }: { type: 'error' | 'success' | 'warning' | 'info'; children: React.ReactNode }) {
  const map = {
    error: { bg: 'var(--c-danger-light)', color: '#b91c1c', border: '#fca5a5', icon: '✕' },
    success: { bg: 'var(--c-success-light)', color: '#15803d', border: '#86efac', icon: '✓' },
    warning: { bg: 'var(--c-warning-light)', color: '#92400e', border: '#fcd34d', icon: '⚠' },
    info: { bg: 'var(--c-info-light)', color: '#1d4ed8', border: '#93c5fd', icon: 'ℹ' },
  };
  const s = map[type];
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      display: 'flex', alignItems: 'flex-start', gap: 8,
    }}>
      <span style={{ fontWeight: 700, flexShrink: 0 }}>{s.icon}</span>
      <span>{children}</span>
    </div>
  );
}

// ─── Form field ───────────────────────────────────────────────────────────────

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </label>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>{hint}</span>}
    </div>
  );
}

export const inputCss: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--c-border)',
  borderRadius: 10,
  fontSize: 14,
  color: 'var(--c-text)',
  background: 'var(--c-input-bg)',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
  minHeight: 42,
  boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.03)',
};

export const selectCss: React.CSSProperties = { ...inputCss, cursor: 'pointer' };

// ─── Page header ─────────────────────────────────────────────────────────────

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 24,
      flexWrap: 'wrap',
      gap: 12,
      padding: '18px 20px',
      borderRadius: 20,
      border: '1px solid var(--c-border)',
      background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(59,130,246,0.03), rgba(15,23,42,0.01))',
      boxShadow: '0 14px 24px rgba(99, 102, 241, 0.08)',
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--c-muted)', marginBottom: 8 }}>Operations</div>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: 'var(--c-text)', letterSpacing: '-0.04em' }}>{title}</h1>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ─── Dark mode toggle switch ──────────────────────────────────────────────────

export function DarkToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'transparent',
        border: '1px solid var(--c-border)',
        borderRadius: 20,
        padding: '5px 10px 5px 6px',
        cursor: 'pointer',
        color: 'var(--c-text-secondary)',
        fontSize: 12,
        fontWeight: 500,
        transition: 'border-color 0.15s',
        flexShrink: 0,
      }}
    >
      {/* track */}
      <span style={{
        position: 'relative',
        display: 'inline-block',
        width: 32,
        height: 18,
        borderRadius: 9,
        background: dark ? '#6366f1' : 'var(--c-border)',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}>
        {/* thumb */}
        <span style={{
          position: 'absolute',
          top: 2,
          left: dark ? 16 : 2,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 8,
        }} />
      </span>
      {dark ? '🌙' : '☀️'}
    </button>
  );
}

// ─── Global CSS injected once ────────────────────────────────────────────────

export const GLOBAL_CSS = `
  :root {
    --c-bg: #070b17;
    --c-bg-card: rgba(15, 23, 42, 0.78);
    --c-border: rgba(148, 163, 184, 0.18);
    --c-border-hover: rgba(148, 163, 184, 0.3);
    --c-text: #e2e8f0;
    --c-text-secondary: #cbd5e1;
    --c-muted: #94a3b8;
    --c-sidebar: rgba(9, 13, 24, 0.92);
    --c-sidebar-hover: rgba(15, 23, 42, 0.96);
    --c-header: rgba(10, 15, 29, 0.72);
    --c-table-head: rgba(15, 23, 42, 0.8);
    --c-input-bg: rgba(15, 23, 42, 0.9);
    --c-badge-neutral-bg: rgba(148, 163, 184, 0.12);
    --c-primary-light: rgba(99, 102, 241, 0.18);
    --c-danger-light: rgba(239, 68, 68, 0.14);
    --c-success-light: rgba(34, 197, 94, 0.12);
    --c-warning-light: rgba(245, 158, 11, 0.12);
    --c-info-light: rgba(59, 130, 246, 0.14);
    --c-tr-hover: rgba(148, 163, 184, 0.08);
  }
  [data-theme="light"] {
    --c-bg: #f5f7fb;
    --c-bg-card: rgba(255, 255, 255, 0.85);
    --c-border: #e2e8f0;
    --c-border-hover: #cbd5e1;
    --c-text: #0f172a;
    --c-text-secondary: #475569;
    --c-muted: #64748b;
    --c-sidebar: #0f172a;
    --c-sidebar-hover: #1e293b;
    --c-header: #ffffff;
    --c-table-head: #f8fafc;
    --c-input-bg: #ffffff;
    --c-badge-neutral-bg: #f1f5f9;
    --c-primary-light: #e0e7ff;
    --c-danger-light: #fee2e2;
    --c-success-light: #dcfce7;
    --c-warning-light: #fef3c7;
    --c-info-light: #dbeafe;
    --c-tr-hover: #f8fafc;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    background:
      radial-gradient(circle at top left, rgba(99, 102, 241, 0.26), transparent 24%),
      radial-gradient(circle at bottom right, rgba(6, 182, 212, 0.18), transparent 28%),
      linear-gradient(180deg, #040916 0%, #0b1020 100%);
    color: var(--c-text);
    transition: background 0.25s ease, color 0.25s ease;
  }
  [data-theme="light"] body {
    background:
      radial-gradient(circle at top left, rgba(99, 102, 241, 0.08), transparent 28%),
      linear-gradient(180deg, var(--c-bg), var(--c-bg));
  }
  a, button, input, select, textarea {
    font: inherit;
  }
  input, select, textarea {
    color: var(--c-text);
    background: var(--c-input-bg);
    transition: background 0.2s, border-color 0.15s, box-shadow 0.15s;
  }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: rgba(99, 102, 241, 0.9);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.16);
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .fade-in { animation: fadeIn 0.2s ease; }
  .page-shell { display: block; }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }
  .soft-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(99, 102, 241, 0.12);
    border: 1px solid rgba(99, 102, 241, 0.18);
    color: #a5b4fc;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .chart-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 999px;
    border: 1px solid var(--c-border);
    background: rgba(15, 23, 42, 0.35);
    color: var(--c-text-secondary);
    padding: 7px 12px;
    font-size: 12px;
    font-weight: 700;
  }
  tr:hover td { background: var(--c-tr-hover); }
  @media (max-width: 768px) {
    table { min-width: 700px; }
  }
  @media (max-width: 520px) {
    body {
      background-attachment: fixed;
    }
    button, input, select {
      font-size: 15px;
    }
  }
`;
