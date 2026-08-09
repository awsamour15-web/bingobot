// Shared UI primitives for the admin panel
import React from 'react';

export const C = {
  primary: '#6366f1',
  primaryDark: '#4f46e5',
  primaryLight: '#e0e7ff',
  danger: '#ef4444',
  dangerLight: '#fee2e2',
  success: '#22c55e',
  successLight: '#dcfce7',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  info: '#3b82f6',
  infoLight: '#dbeafe',
  bg: '#f8fafc',
  bgCard: '#ffffff',
  border: '#e2e8f0',
  borderHover: '#cbd5e1',
  text: '#0f172a',
  textSecondary: '#475569',
  muted: '#94a3b8',
  sidebar: '#0f172a',
  sidebarHover: '#1e293b',
  sidebarActive: '#6366f1',
  header: '#ffffff',
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
    primary: { background: C.primary, color: '#fff', border: `1px solid ${C.primaryDark}` },
    danger: { background: C.danger, color: '#fff', border: `1px solid #dc2626` },
    success: { background: C.success, color: '#fff', border: `1px solid #16a34a` },
    warning: { background: C.warning, color: '#fff', border: `1px solid #d97706` },
    ghost: { background: 'transparent', color: C.primary, border: `1px solid ${C.border}` },
    outline: { background: 'transparent', color: C.textSecondary, border: `1px solid ${C.border}` },
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
        transition: 'opacity 0.15s',
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
    success: { bg: C.successLight, color: '#15803d' },
    danger: { bg: C.dangerLight, color: '#b91c1c' },
    warning: { bg: C.warningLight, color: '#92400e' },
    info: { bg: C.infoLight, color: '#1d4ed8' },
    neutral: { bg: '#f1f5f9', color: C.textSecondary },
    primary: { bg: C.primaryLight, color: C.primaryDark },
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
      background: C.bgCard, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: 24, ...style,
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
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>{title}</h2>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: C.muted }}>{subtitle}</p>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

export function StatCard({ label, value, color, icon }: { label: string; value: string | number; color?: string; icon?: string }) {
  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16,
    }}>
      {icon && (
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: color ? `${color}18` : C.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
        }}>
          {icon}
        </div>
      )}
      <div>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, color: color ?? C.text, lineHeight: 1 }}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ─── Table primitives ────────────────────────────────────────────────────────

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${C.border}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 500 }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: '11px 16px', background: C.bg, color: C.muted, fontWeight: 600,
      fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
      textAlign: right ? 'right' : 'left', borderBottom: `1px solid ${C.border}`,
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
      padding: '11px 16px', borderBottom: `1px solid ${C.border}`,
      color: muted ? C.muted : C.text, verticalAlign: 'middle',
      fontFamily: mono ? 'monospace' : undefined, fontSize: mono ? 12 : 13,
      textAlign: right ? 'right' : 'left', ...style,
    }}>
      {children}
    </td>
  );
}

export function TrEmpty({ cols, message = 'No data found.' }: { cols: number; message?: string }) {
  return (
    <tr>
      <td colSpan={cols} style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 14 }}>
        {message}
      </td>
    </tr>
  );
}

export function TrLoading({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 14 }}>
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
    error: { bg: C.dangerLight, color: '#b91c1c', border: '#fca5a5', icon: '✕' },
    success: { bg: C.successLight, color: '#15803d', border: '#86efac', icon: '✓' },
    warning: { bg: C.warningLight, color: '#92400e', border: '#fcd34d', icon: '⚠' },
    info: { bg: C.infoLight, color: '#1d4ed8', border: '#93c5fd', icon: 'ℹ' },
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
      <label style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
      {hint && <span style={{ fontSize: 11, color: C.muted }}>{hint}</span>}
    </div>
  );
}

export const inputCss: React.CSSProperties = {
  padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8,
  fontSize: 14, color: C.text, width: '100%', boxSizing: 'border-box',
  outline: 'none', background: '#fff',
};

export const selectCss: React.CSSProperties = { ...inputCss, background: '#fff', cursor: 'pointer' };

// ─── Page header ─────────────────────────────────────────────────────────────

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>{title}</h1>
      {action && <div>{action}</div>}
    </div>
  );
}

// ─── Global CSS injected once ────────────────────────────────────────────────

export const GLOBAL_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; background: #f8fafc; }
  input:focus, select:focus, textarea:focus { outline: 2px solid #6366f1; outline-offset: 1px; border-color: #6366f1; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .fade-in { animation: fadeIn 0.2s ease; }
  tr:hover td { background: #f8fafc; }
`;
