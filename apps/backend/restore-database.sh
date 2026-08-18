#!/bin/bash

# Database Restore Script for PostgreSQL
# Usage: bash restore-database.sh <backup-file>

if [ -z "$1" ]; then
    echo "Usage: bash restore-database.sh <backup-file>"
    echo "Example: bash restore-database.sh ./backups/fidelbingo_backup_20260819_120000.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Load environment variables
source .env

echo "⚠️  WARNING: This will restore the database from backup."
echo "⚠️  Current data may be overwritten!"
echo "Backup file: $BACKUP_FILE"
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

echo "Starting database restore..."

# Check if file is compressed
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo "Decompressing and restoring..."
    gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"
else
    echo "Restoring..."
    psql "$DATABASE_URL" < "$BACKUP_FILE"
fi

if [ $? -eq 0 ]; then
    echo "✓ Database restored successfully!"
else
    echo "✗ Restore failed!"
    exit 1
fi
