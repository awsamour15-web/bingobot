import React, { useEffect, useState } from 'react';
import type { WithdrawalRequest } from '@fidel/shared';
import { getWithdrawals, approveWithdrawal, rejectWithdrawal } from '../lib/api';
import { Alert, Badge, Btn, Card, CardHeader, Table, Th, Td } from '../components/ui';

export function WithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      console.log('[Withdrawals] Fetching withdrawals...');
      const data = await getWithdrawals();
      console.log('[Withdrawals] Received data:', data);
      setWithdrawals(data);
    } catch (e) {
      console.error('[Withdrawals] Error loading withdrawals:', e);
      setError(e instanceof Error ? e.message : 'Failed to load withdrawals');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleApprove(withdrawal: WithdrawalRequest) {
    const txInput = window.prompt(
      `Enter Telebirr transaction number for ${withdrawal.username}\n\n` +
      `Amount: ${Number(withdrawal.amount).toFixed(2)} ETB\n` +
      `Phone: ${withdrawal.phone}\n\n` +
      `You can paste:\n` +
      `• Just the transaction number (e.g., TBI1234567890)\n` +
      `• Or the full SMS receipt`,
      ''
    );
    
    if (!txInput?.trim()) return;

    setProcessing(withdrawal.id);
    try {
      await approveWithdrawal(withdrawal.id, txInput.trim());
      await load();
      alert('✅ Withdrawal approved successfully!');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to approve withdrawal');
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject(withdrawal: WithdrawalRequest) {
    if (!confirm(
      `Are you sure you want to reject this withdrawal?\n\n` +
      `User: ${withdrawal.username}\n` +
      `Amount: ${Number(withdrawal.amount).toFixed(2)} ETB\n\n` +
      `The funds will be refunded to the user's wallet.`
    )) return;

    setProcessing(withdrawal.id);
    try {
      await rejectWithdrawal(withdrawal.id);
      await load();
      alert('✅ Withdrawal rejected and refunded successfully!');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to reject withdrawal');
    } finally {
      setProcessing(null);
    }
  }

  const pending = withdrawals.filter(w => w.status === 'pending');
  const completed = withdrawals.filter(w => w.status !== 'pending');

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--c-muted)' }}>
        Loading withdrawals...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8, color: 'var(--c-text)' }}>
          💸 Player Withdrawals
        </h1>
        <p style={{ color: 'var(--c-muted)', fontSize: 14 }}>
          Manage player withdrawal requests from their main wallet (winning balance)
        </p>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Debug info */}
      <div style={{ marginBottom: 16, padding: 12, background: 'var(--c-bg-card)', borderRadius: 8, border: '1px solid var(--c-border)', fontSize: 12, fontFamily: 'monospace' }}>
        <div><strong>API URL:</strong> {import.meta.env.VITE_API_URL ?? 'https://bingobot-vpif.onrender.com'}/api/admin/withdrawals</div>
        <div><strong>JWT Token:</strong> {localStorage.getItem('adminJwt') ? '✓ Present' : '✗ Missing'}</div>
        <div><strong>Loading:</strong> {loading ? 'Yes' : 'No'}</div>
        <div><strong>Withdrawals count:</strong> {withdrawals.length}</div>
        <div><strong>Pending count:</strong> {pending.length}</div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ padding: 16, background: 'var(--c-bg-card)', borderRadius: 8, border: '1px solid var(--c-border)' }}>
          <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 4, fontWeight: 600 }}>PENDING</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#f59e0b' }}>{pending.length}</div>
        </div>
        <div style={{ padding: 16, background: 'var(--c-bg-card)', borderRadius: 8, border: '1px solid var(--c-border)' }}>
          <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 4, fontWeight: 600 }}>TOTAL AMOUNT</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--c-text)' }}>
            {pending.reduce((sum, w) => sum + Number(w.amount), 0).toFixed(0)} ETB
          </div>
        </div>
        <div style={{ padding: 16, background: 'var(--c-bg-card)', borderRadius: 8, border: '1px solid var(--c-border)' }}>
          <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 4, fontWeight: 600 }}>COMPLETED</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#22c55e' }}>{completed.length}</div>
        </div>
      </div>

      {/* Pending Withdrawals */}
      <Card style={{ marginBottom: 24 }}>
        <CardHeader 
          title="Pending Withdrawals" 
          subtitle={pending.length > 0 ? "Awaiting admin approval" : "No pending withdrawals"} 
        />
        
        {pending.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--c-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>All caught up!</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>No pending withdrawal requests</div>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Player</Th>
                <Th>Phone</Th>
                <Th>Amount</Th>
                <Th>Requested</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {pending.map(w => (
                <tr key={w.id}>
                  <Td>
                    <div>
                      <div style={{ fontWeight: 700 }}>{w.username}</div>
                      <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>ID: {w.player_id.slice(0, 8)}</div>
                    </div>
                  </Td>
                  <Td>
                    <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{w.phone}</span>
                  </Td>
                  <Td>
                    <span style={{ fontWeight: 700, fontSize: 16, color: '#ef4444' }}>
                      {Number(w.amount).toFixed(2)} ETB
                    </span>
                  </Td>
                  <Td>
                    <div style={{ fontSize: 12 }}>
                      {new Date(w.created_at).toLocaleString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </div>
                  </Td>
                  <Td>
                    <Badge variant="warning">PENDING</Badge>
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn 
                        size="sm" 
                        variant="success" 
                        onClick={() => handleApprove(w)}
                        disabled={processing === w.id}
                      >
                        {processing === w.id ? '⏳' : '✓'} Approve
                      </Btn>
                      <Btn 
                        size="sm" 
                        variant="danger" 
                        onClick={() => handleReject(w)}
                        disabled={processing === w.id}
                      >
                        {processing === w.id ? '⏳' : '✗'} Reject
                      </Btn>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Completed Withdrawals */}
      {completed.length > 0 && (
        <Card>
          <CardHeader 
            title="Recent History" 
            subtitle={`Last ${completed.length} completed/rejected withdrawals`} 
          />
          <Table>
            <thead>
              <tr>
                <Th>Player</Th>
                <Th>Phone</Th>
                <Th>Amount</Th>
                <Th>Date</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {completed.slice(0, 20).map(w => (
                <tr key={w.id} style={{ opacity: 0.7 }}>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{w.username}</div>
                  </Td>
                  <Td>
                    <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{w.phone}</span>
                  </Td>
                  <Td>
                    <span style={{ fontWeight: 600 }}>{Number(w.amount).toFixed(2)} ETB</span>
                  </Td>
                  <Td>
                    <div style={{ fontSize: 12 }}>
                      {new Date(w.created_at).toLocaleString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </div>
                  </Td>
                  <Td>
                    <Badge variant={w.status === 'approved' ? 'success' : 'danger'}>
                      {w.status.toUpperCase()}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Help Text */}
      <div style={{ marginTop: 24, padding: 16, background: 'rgba(59, 130, 246, 0.05)', borderRadius: 8, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#3b82f6' }}>💡 How to Process Withdrawals</div>
        <div style={{ fontSize: 12, color: 'var(--c-muted)', lineHeight: 1.6 }}>
          <strong>To Approve:</strong> Click "Approve" and enter the Telebirr transaction number after you've sent the money. You can paste the full SMS or just the transaction ID.<br/>
          <strong>To Reject:</strong> Click "Reject" to cancel the request. The funds will be automatically refunded to the player's main wallet.<br/>
          <strong>Note:</strong> Only main wallet (winning balance) can be withdrawn. Play wallet funds are NOT withdrawable.
        </div>
      </div>
    </div>
  );
}
