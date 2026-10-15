#!/usr/bin/env node
/**
 * Cron scheduler for automatic cleanup
 * Runs cleanup-old-rounds.mjs every day at 3:00 AM
 * 
 * To start: node cron-cleanup.mjs
 */

import cron from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('🕐 Cleanup cron job started');
console.log('📅 Schedule: Every day at 3:00 AM');
console.log('🗑️  Keeps last 24 records per game history table\n');

// Run every day at 3:00 AM
cron.schedule('0 3 * * *', async () => {
  console.log(`\n[${new Date().toISOString()}] Running cleanup...`);
  try {
    const { stdout, stderr } = await execAsync('node cleanup-old-rounds.mjs');
    console.log(stdout);
    if (stderr) console.error('Warnings:', stderr);
  } catch (error) {
    console.error('Cleanup failed:', error.message);
  }
});

// Keep the process running
process.on('SIGINT', () => {
  console.log('\n\n👋 Cleanup cron stopped');
  process.exit(0);
});
