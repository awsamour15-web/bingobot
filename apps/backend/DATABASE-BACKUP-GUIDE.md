# Database Backup Guide

This guide explains how to backup and restore your PostgreSQL database.

## Prerequisites

You need PostgreSQL client tools installed:

**Windows:**
```bash
# Using Chocolatey
choco install postgresql

# Or download from: https://www.postgresql.org/download/windows/
```

**Mac:**
```bash
brew install postgresql
```

**Linux:**
```bash
sudo apt-get install postgresql-client
```

## Backup Methods

### Method 1: Using npm Script (Node.js)

```bash
cd apps/backend
npm run db:backup
```

This will:
- Create a backup in `./backups/` directory
- Compress it with gzip
- Keep only the last 7 backups

### Method 2: Using Shell Script

```bash
cd apps/backend
bash backup-database.sh
```

### Method 3: Manual pg_dump

```bash
cd apps/backend
source .env
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M%S).sql
```

## Restore Database

### From Compressed Backup:

```bash
cd apps/backend
npm run db:restore ./backups/fidelbingo_backup_20260819_120000.sql.gz
```

### From Uncompressed Backup:

```bash
cd apps/backend
source .env
psql "$DATABASE_URL" < backup_file.sql
```

## Automated Backups

### Option 1: Cron Job (Linux/Mac)

Edit crontab:
```bash
crontab -e
```

Add daily backup at 2 AM:
```bash
0 2 * * * cd /path/to/apps/backend && npm run db:backup
```

### Option 2: Windows Task Scheduler

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger (e.g., daily at 2 AM)
4. Action: Start a program
   - Program: `node`
   - Arguments: `backup-database.mjs`
   - Start in: `C:\path\to\apps\backend`

### Option 3: GitHub Actions (Cloud Backup)

Create `.github/workflows/backup-database.yml`:

```yaml
name: Database Backup

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:  # Allow manual trigger

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install PostgreSQL client
        run: sudo apt-get install postgresql-client
      
      - name: Create backup
        working-directory: apps/backend
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: |
          mkdir -p backups
          pg_dump "$DATABASE_URL" | gzip > backups/backup_$(date +%Y%m%d_%H%M%S).sql.gz
      
      - name: Upload backup artifact
        uses: actions/upload-artifact@v3
        with:
          name: database-backup
          path: apps/backend/backups/*.sql.gz
          retention-days: 30
```

## Render Cloud Backups

If you're on a paid Render plan, you can restore from automatic backups:

1. Go to https://dashboard.render.com/
2. Select your PostgreSQL instance
3. Go to "Backups" tab
4. Click "Restore" on the backup you want

## Best Practices

1. **Test Your Backups**: Regularly restore backups to a test database to ensure they work
2. **Store Offsite**: Upload backups to cloud storage (S3, Google Drive, Dropbox)
3. **Encrypt Sensitive Data**: If storing backups externally, encrypt them first
4. **Multiple Backup Locations**: Keep backups in multiple places (local + cloud)
5. **Monitor Backup Size**: Large databases may need different strategies
6. **Document Recovery Steps**: Keep this guide updated and accessible

## Backup to Cloud Storage

### AWS S3 Example:

```bash
# After creating backup
aws s3 cp ./backups/fidelbingo_backup_*.sql.gz s3://your-bucket/database-backups/
```

### Google Drive (using rclone):

```bash
# After creating backup
rclone copy ./backups/ gdrive:FidelBingo-Backups/
```

## Emergency Recovery

If you need to recover from a complete data loss:

1. Stop the application
2. Ensure the database connection is working
3. Run restore script with your latest backup
4. Verify data integrity
5. Restart the application

```bash
cd apps/backend
npm run db:restore ./backups/latest_backup.sql.gz
npm start
```

## Troubleshooting

**Error: pg_dump: command not found**
- Install PostgreSQL client tools (see Prerequisites)

**Error: Permission denied**
- Make shell scripts executable: `chmod +x *.sh`

**Backup file is too large**
- The gzip compression reduces file size significantly
- Consider using `pg_dump` with custom format: `pg_dump -Fc`

**Can't connect to database**
- Verify DATABASE_URL in .env file
- Check network connectivity
- Ensure your IP is whitelisted in Render dashboard

## Support

For issues with Render's built-in backups, contact Render support.
For issues with these scripts, check the error messages and logs.
