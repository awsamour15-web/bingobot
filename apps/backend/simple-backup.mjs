#!/usr/bin/env node
/**
 * Simple database backup using Prisma
 * No pg_dump required - works on any system
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();
const BACKUP_DIR = './backups';

async function backupDatabase() {
  try {
    console.log('🔄 Starting simple backup (Prisma-based)...');
    
    // Create backups directory
    await fs.mkdir(BACKUP_DIR, { recursive: true });

    // Generate timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupFile = path.join(BACKUP_DIR, `backup_${timestamp}.json`);

    console.log(`📁 Backup file: ${backupFile}`);
    console.log('⏳ Fetching data from database...\n');

    // Fetch all data
    const data = {
      timestamp: new Date().toISOString(),
      database_url: process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'unknown',
      data: {
        players: await prisma.player.findMany({ include: { wallets: true } }),
        transactions: await prisma.transaction.findMany(),
        gameRounds: await prisma.gameRound.findMany({ include: { round_entries: true, round_winners: true, called_numbers: true } }),
        cartelaDefinitions: await prisma.cartelaDefinition.findMany(),
        admins: await prisma.admin.findMany(),
        config: await prisma.config.findMany(),
        pendingDeposits: await prisma.pendingDeposit.findMany(),
        pendingWithdrawals: await prisma.pendingWithdrawal.findMany(),
        agents: await prisma.agent.findMany({ include: { referred_players: true, withdrawals: true } }),
        cartelaReservations: await prisma.cartelaReservation.findMany(),
        depositAccounts: await prisma.depositAccount.findMany(),
        broadcastTargets: await prisma.broadcastTarget.findMany(),
        promotions: await prisma.promotion.findMany({ 
          include: { 
            schedules: true, 
            logs: true,
            bonus_distributions: true
          } 
        }),
      }
    };

    // Calculate statistics
    const stats = {
      players: data.data.players.length,
      wallets: data.data.players.reduce((sum, p) => sum + p.wallets.length, 0),
      transactions: data.data.transactions.length,
      gameRounds: data.data.gameRounds.length,
      agents: data.data.agents.length,
      pendingWithdrawals: data.data.pendingWithdrawals.length,
      promotions: data.data.promotions.length,
    };

    console.log('📊 Data Summary:');
    console.log(`   ├─ Players: ${stats.players}`);
    console.log(`   ├─ Wallets: ${stats.wallets}`);
    console.log(`   ├─ Transactions: ${stats.transactions}`);
    console.log(`   ├─ Game Rounds: ${stats.gameRounds}`);
    console.log(`   ├─ Agents: ${stats.agents}`);
    console.log(`   ├─ Pending Withdrawals: ${stats.pendingWithdrawals}`);
    console.log(`   └─ Promotions: ${stats.promotions}\n`);

    // Write to file (handle BigInt serialization)
    const replacer = (_, value) => typeof value === 'bigint' ? value.toString() : value;
    await fs.writeFile(backupFile, JSON.stringify(data, replacer, 2), 'utf-8');

    // Get file size
    const fileStats = await fs.stat(backupFile);
    const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);

    console.log(`✅ Backup completed successfully!`);
    console.log(`📦 File saved: ${backupFile}`);
    console.log(`💾 File size: ${fileSizeMB} MB\n`);

    // Clean up old backups (keep last 10)
    const files = await fs.readdir(BACKUP_DIR);
    const backupFiles = files
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (backupFiles.length > 10) {
      console.log('🧹 Cleaning up old backups...');
      for (const file of backupFiles.slice(10)) {
        await fs.unlink(path.join(BACKUP_DIR, file));
        console.log(`   ✓ Deleted: ${file}`);
      }
    }

    console.log('\n✨ Backup process completed!\n');
    console.log('💡 Note: This JSON backup can be used to restore data.');
    console.log('   To restore, you\'ll need to use Prisma Client to insert the data.\n');

  } catch (error) {
    console.error('❌ Backup failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

backupDatabase();
