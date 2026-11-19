#!/usr/bin/env bash
# Nightly database backup for a docker compose deployment. Run from the repository root, for example from cron:
#   15 3 * * *  cd /srv/eregion && deploy/backup.sh >> /var/log/eregion-backup.log 2>&1
# Keeps BACKUP_DAYS days of dumps in BACKUP_DIR. Copy that directory off the machine too (rclone, restic, a bucket):
# a backup on the same disk as the database is lost with it. Uploaded card art lives in the database, so it is included.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/eregion}"
BACKUP_DAYS="${BACKUP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

file="$BACKUP_DIR/eregion-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T db pg_dump -U eregion -d eregion --format=custom > "$file.partial"
mv "$file.partial" "$file"

# A dump far smaller than the last one usually means something went wrong, not that the data shrank.
size=$(wc -c < "$file")
if [ "$size" -lt 100000 ]; then
	echo "$(date -u) backup $file is only $size bytes, check it" >&2
	exit 1
fi

find "$BACKUP_DIR" -name 'eregion-*.dump' -mtime +"$BACKUP_DAYS" -delete
echo "$(date -u) backup ok: $file ($size bytes)"
