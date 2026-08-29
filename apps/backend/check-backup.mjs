import fs from 'fs';

const b = JSON.parse(fs.readFileSync('./backups/backup_2026-08-22T19-55-00.json', 'utf8'));
const d = b.data;

console.log('=== Latest Render Backup (2026-08-22 19:55) ===');
for (const [k, v] of Object.entries(d)) {
  if (Array.isArray(v)) console.log(`  ${k.padEnd(30)} ${v.length} records`);
}

// Check what's missing vs schema (tables added after backup)
console.log('\n=== Tables NOT in backup (added after last Render backup) ===');
const missing = ['wallets', 'roundEntries', 'roundWinners', 'calledNumbers', 'agentCommissions', 'agentCommissionWithdrawals', 'promotionSchedules', 'promotionLogs', 'promotionBonusDistributions', 'crashRounds', 'crashBets', 'slotSpins', 'kenoRounds', 'kenoBets', 'depositAttempts'];
for (const m of missing) {
  const has = d[m] !== undefined;
  console.log(`  ${m.padEnd(35)} ${has ? `✅ ${d[m].length} records` : '❌ not in backup'}`);
}

// Show player wallet data since wallets are embedded
if (d.players?.[0]?.wallets) {
  const withWallets = d.players.filter(p => p.wallets?.length > 0);
  console.log(`\n  Players with embedded wallets: ${withWallets.length}`);
  const totalBalance = withWallets.reduce((sum, p) => sum + p.wallets.reduce((s, w) => s + parseFloat(w.balance), 0), 0);
  console.log(`  Total wallet balance in backup: ${totalBalance.toFixed(2)}`);
}
