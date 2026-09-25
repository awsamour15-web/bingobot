// Backup Service
// Runs the backup as a detached child process so an OOM crash in the backup
// cannot take down the main server process.

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_SCRIPT = path.resolve(__dirname, '../../backup-now.mjs');
const BACKUP_DIR = path.resolve(__dirname, '../../backups');
const BACKUP_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 hours
const MAX_BACKUPS = 14;

export const BackupService = {
  _timer: undefined as ReturnType<typeof setInterval> | undefined,

  start(): void {
    if (BackupService._timer) return;
    console.log('[Backup] Scheduler started — running every 5 hours');

    // Run once at startup after a short delay, then on interval
    setTimeout(() => void BackupService.run(), 30_000);
    BackupService._timer = setInterval(() => void BackupService.run(), BACKUP_INTERVAL_MS);
  },

  stop(): void {
    if (BackupService._timer) {
      clearInterval(BackupService._timer);
      BackupService._timer = undefined;
    }
  },

  async run(): Promise<void> {
    console.log('[Backup] Starting backup...');
    await new Promise<void>((resolve) => {
      // Spawn backup as a child process with a 256 MB heap limit so an OOM
      // there cannot crash the main server.
      const child = spawn(
        process.execPath,
        ['--max-old-space-size=256', BACKUP_SCRIPT],
        {
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: process.env,
        },
      );

      child.stdout?.on('data', (d: Buffer) => process.stdout.write(`[Backup] ${d}`));
      child.stderr?.on('data', (d: Buffer) => process.stderr.write(`[Backup] ${d}`));

      child.on('close', (code) => {
        if (code === 0) {
          console.log('[Backup] ✓ Backup child process completed successfully');
          void BackupService.rotate();
        } else {
          console.error(`[Backup] ✗ Backup child process exited with code ${code}`);
        }
        resolve();
      });

      child.on('error', (err) => {
        console.error('[Backup] ✗ Failed to spawn backup process:', err.message);
        resolve();
      });
    });
  },

  async rotate(): Promise<void> {
    try {
      const files = await fs.readdir(BACKUP_DIR);
      const backupFiles = files
        .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
        .sort()
        .reverse();

      for (const old of backupFiles.slice(MAX_BACKUPS)) {
        await fs.unlink(path.join(BACKUP_DIR, old));
        console.log(`[Backup] Deleted old backup: ${old}`);
      }
    } catch {
      // non-fatal
    }
  },
};
