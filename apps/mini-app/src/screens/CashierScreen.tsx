import React, { useState, useEffect, useCallback } from 'react';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'https://bingobot-vpif.onrender.com';
function getApiBase() { return BASE_URL; }

// ── Types ─────────────────────────────────────────────────────────────────────

interface CashierSession {
  token: string;
  cashierId: string;
  displayName: string;
}

interface DepositItem {
  id: string;
  tx_number: string;
  amount: number;
  status: string;
  player_username: string | null;
  created_at: string;
}

interface WithdrawalItem {
  id: string;
  amount: number;
  phone: string;
  status: string;
  player_username: string | null;
  created_at: string;
}

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  bg:      '#0a0e1a',
  card:    '#0d1b2e',
  card2:   '#112240',
  border:  'rgba(255,255,255,0.07)',
  text:    '#f1f5f9',
  muted:   '#64748b',
  green:   '#34d399',
  red:     '#f87171',
  amber:   '#f59e0b',
  blue:    '#60a5fa',
  indigo:  '#818cf8',
};

// ── Session storage keys ──────────────────────────────────────────────────────
const SESSION_KEY = 'cashier_session';

function saveSession(s: CashierSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
function loadSession(): CashierSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as CashierSession) : null;
  } catch { return null; }
}
function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function cashierFetch<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json() as T & { message?: string };
  if (!res.ok) throw new Error((data as { message?: string }).message ?? 'Request failed');
  return data;
}

// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginForm({ onLogin }: { onLogin: (s: CashierSession) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const data = await fetch(`${getApiBase()}/api/cashier/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const json = await data.json() as { token?: string; cashierId?: string; displayName?: string; message?: string };
      if (!data.ok) { setError(json.message ?? 'Login failed'); return; }
      const session: CashierSession = {
        token: json.token!,
        cashierId: json.cashierId!,
        displayName: json.displayName ?? username,
      };
      saveSession(session);
      onLogin(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally { setLoading(false); }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: C.bg, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 20, padding: 32, width: '100%', maxWidth: 360,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, boxShadow: '0 8px 24px rgba(245,158,11,0.35)',
          }}>💰</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Cashier Login</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Fidel Bingo Cashier App</div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)',
            borderRadius: 10, padding: '10px 14px', color: C.red,
            fontSize: 13, marginBottom: 16,
          }}>{error}</div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)}>
          <input
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 12,
              background: C.card2, border: `1px solid ${C.border}`,
              color: C.text, fontSize: 15, outline: 'none',
              marginBottom: 12, boxSizing: 'border-box',
            }}
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          <input
            type="password"
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 12,
              background: C.card2, border: `1px solid ${C.border}`,
              color: C.text, fontSize: 15, outline: 'none',
              marginBottom: 20, boxSizing: 'border-box',
            }}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 14,
              background: loading ? C.card2 : C.amber,
              color: loading ? C.muted : '#0a0e1a',
              border: 'none', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Item card ─────────────────────────────────────────────────────────────────
function ItemCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 14, padding: '14px 16px', marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function ActionBtn({ label, color, onClick, loading }: {
  label: string; color: string; onClick: () => void; loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: '8px 14px', borderRadius: 10, border: 'none',
        background: loading ? C.card2 : color,
        color: loading ? C.muted : '#0a0e1a',
        fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
        marginLeft: 8,
      }}
    >
      {loading ? '…' : label}
    </button>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
type DashTab = 'deposits' | 'withdrawals';

function Dashboard({ session, onLogout }: { session: CashierSession; onLogout: () => void }) {
  const [tab, setTab] = useState<DashTab>('deposits');
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [dRes, wRes] = await Promise.all([
        cashierFetch<{ deposits: DepositItem[] }>(session.token, 'GET', '/api/cashier/deposits'),
        cashierFetch<{ withdrawals: WithdrawalItem[] }>(session.token, 'GET', '/api/cashier/withdrawals'),
      ]);
      setDeposits(dRes.deposits);
      setWithdrawals(wRes.withdrawals);
    } catch (e) {
      if ((e as { message?: string }).message?.includes('expired') || (e as { message?: string }).message?.includes('Invalid')) {
        clearSession(); onLogout();
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    } finally { setLoading(false); }
  }, [session.token, onLogout]);

  useEffect(() => { void load(); }, [load]);

  async function approveDeposit(id: string) {
    if (!confirm('Approve this deposit and credit the player?')) return;
    setProcessingId(id);
    try {
      await cashierFetch(session.token, 'POST', `/api/cashier/deposits/${id}/approve`);
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
    finally { setProcessingId(null); }
  }

  async function rejectDeposit(id: string) {
    if (!confirm('Reject this deposit?')) return;
    setProcessingId(id);
    try {
      await cashierFetch(session.token, 'POST', `/api/cashier/deposits/${id}/reject`);
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
    finally { setProcessingId(null); }
  }

  async function approveWithdrawal(id: string) {
    const txNumber = prompt('Enter Telebirr transaction number:');
    if (!txNumber?.trim()) return;
    setProcessingId(id);
    try {
      await cashierFetch(session.token, 'POST', `/api/cashier/withdrawals/${id}/approve`, { txNumber: txNumber.trim() });
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
    finally { setProcessingId(null); }
  }

  async function rejectWithdrawal(id: string) {
    if (!confirm('Reject this withdrawal? Funds will be refunded to player.')) return;
    setProcessingId(id);
    try {
      await cashierFetch(session.token, 'POST', `/api/cashier/withdrawals/${id}/reject`);
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
    finally { setProcessingId(null); }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 0', border: 'none',
    background: active ? C.amber : C.card2,
    color: active ? '#0a0e1a' : C.muted,
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    borderRadius: 10, transition: 'all 0.15s',
  });

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, padding: '0 0 80px' }}>
      {/* Header */}
      <div style={{
        background: C.card, borderBottom: `1px solid ${C.border}`,
        padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>💰 Cashier</div>
          <div style={{ fontSize: 12, color: C.muted }}>{session.displayName}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => void load()}
            style={{ background: C.card2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', color: C.muted, fontSize: 13, cursor: 'pointer' }}
          >↻ Refresh</button>
          <button
            onClick={() => { clearSession(); onLogout(); }}
            style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '6px 12px', color: C.red, fontSize: 13, cursor: 'pointer' }}
          >Sign out</button>
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button style={tabStyle(tab === 'deposits')} onClick={() => setTab('deposits')}>
            Deposits {deposits.length > 0 && `(${deposits.length})`}
          </button>
          <button style={tabStyle(tab === 'withdrawals')} onClick={() => setTab('withdrawals')}>
            Withdrawals {withdrawals.length > 0 && `(${withdrawals.length})`}
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)',
            borderRadius: 10, padding: '10px 14px', color: C.red, fontSize: 13, marginBottom: 12,
          }}>{error}</div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', color: C.muted, padding: 40 }}>Loading…</div>
        )}

        {/* Deposits tab */}
        {!loading && tab === 'deposits' && (
          <>
            {deposits.length === 0 && (
              <div style={{ textAlign: 'center', color: C.muted, padding: 40 }}>No pending deposits</div>
            )}
            {deposits.map((d) => (
              <ItemCard key={d.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.green }}>+{d.amount} ETB</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>TX: {d.tx_number}</div>
                    <div style={{ fontSize: 12, color: C.text, marginTop: 2 }}>
                      Player: {d.player_username ?? <span style={{ color: C.muted }}>Not linked yet</span>}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {new Date(d.created_at).toLocaleString()}
                    </div>
                  </div>
                  {d.player_username && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      <ActionBtn
                        label="✓ Approve"
                        color={C.green}
                        onClick={() => void approveDeposit(d.id)}
                        loading={processingId === d.id}
                      />
                      <ActionBtn
                        label="✕ Reject"
                        color={C.red}
                        onClick={() => void rejectDeposit(d.id)}
                        loading={processingId === d.id}
                      />
                    </div>
                  )}
                </div>
              </ItemCard>
            ))}
          </>
        )}

        {/* Withdrawals tab */}
        {!loading && tab === 'withdrawals' && (
          <>
            {withdrawals.length === 0 && (
              <div style={{ textAlign: 'center', color: C.muted, padding: 40 }}>No pending withdrawals</div>
            )}
            {withdrawals.map((w) => (
              <ItemCard key={w.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.red }}>-{w.amount} ETB</div>
                    <div style={{ fontSize: 12, color: C.text, marginTop: 2 }}>
                      Player: {w.player_username ?? '-'}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Phone: {w.phone}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {new Date(w.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <ActionBtn
                      label="✓ Approve"
                      color={C.green}
                      onClick={() => void approveWithdrawal(w.id)}
                      loading={processingId === w.id}
                    />
                    <ActionBtn
                      label="✕ Reject"
                      color={C.red}
                      onClick={() => void rejectWithdrawal(w.id)}
                      loading={processingId === w.id}
                    />
                  </div>
                </div>
              </ItemCard>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function CashierScreen() {
  const [session, setSession] = useState<CashierSession | null>(loadSession);

  return session
    ? <Dashboard session={session} onLogout={() => setSession(null)} />
    : <LoginForm onLogin={setSession} />;
}
