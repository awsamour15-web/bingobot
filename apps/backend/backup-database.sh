#!/bin/bash

# Database Backup Script for PostgreSQL
# Usage: bash backup-database.sh

# Load environment variables
source .env

# Create backups directory if it doesn't exist
BACKUP_DIR="./backups"
mkdir -p $BACKUP_DIR

# Generate timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/fidelbingo_backup_$TIMESTAMP.sql"

echo "Starting database backup..."
echo "Backup file: $BACKUP_FILE"

# Run pg_dump (you need PostgreSQL client tools installed)
pg_dump "$DATABASE_URL" > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✓ Backup completed successfully!"
    echo "✓ File saved: $BACKUP_FILE"
    
    # Compress the backup to save space
    gzip "$BACKUP_FILE"
    echo "✓ Backup compressed: ${BACKUP_FILE}.gz"
    
    # Optional: Keep only last 7 backups
    cd $BACKUP_DIR
    ls -t fidelbingo_backup_*.sql.gz | tail -n +8 | xargs -r rm
    echo "✓ Old backups cleaned up (keeping last 7)"
else
    echo "✗ Backup failed!"
    exit 1
fi
