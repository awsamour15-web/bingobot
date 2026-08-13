// Shared UI primitives for the admin panel
import React from 'react';

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
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        transition: 'opacity 0.15s, background 0.15s',
        width: fullWidth ? '100%' : undefined,
        justifyContent: fullWidth ? 'center' : undefined,
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
      background: 'var(--c-bg-card)',
      border: '1px solid var(--c-border)',
      borderRadius: 12,
      padding: 24,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Card Header ──────────────────────────────────────────────────────────────

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>{title}</h2>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--c-muted)' }}>{subtitle}</p>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

export function StatCard({ label, value, color, icon }: { label: string; value: string | number; color?: string; icon?: string }) {
  return (
    <div style={{
      background: 'var(--c-bg-card)',
      border: '1px solid var(--c-border)',
      borderRadius: 12,
      padding: '20px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}>
      {icon && (
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: color ? `${color}22` : 'var(--c-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
        }}>
          {icon}
        </div>
      )}
      <div>
        <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, color: color ?? 'var(--c-text)', lineHeight: 1 }}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ─── Table primitives ────────────────────────────────────────────────────────

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--c-border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 500 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>{hint}</span>}
    </div>
  );
}

export const inputCss: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--c-border)',
  borderRadius: 8,
  fontSize: 14,
  color: 'var(--c-text)',
  background: 'var(--c-input-bg)',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
};

export const selectCss: React.CSSProperties = { ...inputCss, cursor: 'pointer' };

// ─── Page header ─────────────────────────────────────────────────────────────

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--c-text)' }}>{title}</h1>
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
    --c-bg: #f8fafc;
    --c-bg-card: #ffffff;
    --c-border: #e2e8f0;
    --c-border-hover: #cbd5e1;
    --c-text: #0f172a;
    --c-text-secondary: #475569;
    --c-muted: #94a3b8;
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
  [data-theme="dark"] {
    --c-bg: #0f172a;
    --c-bg-card: #1e293b;
    --c-border: #334155;
    --c-border-hover: #475569;
    --c-text: #f1f5f9;
    --c-text-secondary: #94a3b8;
    --c-muted: #64748b;
    --c-sidebar: #020617;
    --c-sidebar-hover: #1e293b;
    --c-header: #1e293b;
    --c-table-head: #0f172a;
    --c-input-bg: #0f172a;
    --c-badge-neutral-bg: #334155;
    --c-primary-light: #312e81;
    --c-danger-light: #450a0a;
    --c-success-light: #052e16;
    --c-warning-light: #451a03;
    --c-info-light: #172554;
    --c-tr-hover: #1e293b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    background: var(--c-bg);
    color: var(--c-text);
    transition: background 0.2s, color 0.2s;
  }
  input, select, textarea {
    color: var(--c-text);
    background: var(--c-input-bg);
    transition: background 0.2s, border-color 0.15s;
  }
  input:focus, select:focus, textarea:focus {
    outline: 2px solid #6366f1;
    outline-offset: 1px;
    border-color: #6366f1;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .fade-in { animation: fadeIn 0.2s ease; }
  tr:hover td { background: var(--c-tr-hover); }
`;
