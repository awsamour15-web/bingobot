#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { config } from 'dotenv';

const execAsync = promisify(exec);

// Load environment variables
config();

const BACKUP_DIR = './backups';
const DATABASE_URL = process.env.DATABASE_URL;

async function backupDatabase() {
  try {
    // Create backups directory
    await fs.mkdir(BACKUP_DIR, { recursive: true });

    // Generate timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupFile = path.join(BACKUP_DIR, `fidelbingo_backup_${timestamp}.sql`);

    console.log('Starting database backup...');
    console.log(`Backup file: ${backupFile}`);

    // Run pg_dump
    const { stdout, stderr } = await execAsync(`pg_dump "${DATABASE_URL}" > "${backupFile}"`);
    
    if (stderr && !stderr.includes('NOTICE')) {
      console.error('Backup warnings:', stderr);
    }

    console.log('✓ Backup completed successfully!');
    console.log(`✓ File saved: ${backupFile}`);

    // Compress the backup
    await execAsync(`gzip "${backupFile}"`);
    console.log(`✓ Backup compressed: ${backupFile}.gz`);

    // Clean up old backups (keep last 7)
    const files = await fs.readdir(BACKUP_DIR);
    const backupFiles = files
      .filter(f => f.startsWith('fidelbingo_backup_') && f.endsWith('.sql.gz'))
      .sort()
      .reverse();

    if (backupFiles.length > 7) {
      for (const file of backupFiles.slice(7)) {
        await fs.unlink(path.join(BACKUP_DIR, file));
        console.log(`✓ Deleted old backup: ${file}`);
      }
    }

    console.log('✓ Backup process completed!');
  } catch (error) {
    console.error('✗ Backup failed:', error.message);
    process.exit(1);
  }
}

backupDatabase();
