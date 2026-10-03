#!/bin/sh
# Restores a backup made by scripts/backup.sh into the database, replacing
# what is there. Stop the API first so nothing writes during the restore:
#
#   docker compose -f docker-compose.prod.yml stop api
#   docker compose -f docker-compose.prod.yml exec backup ls /backups
#   docker compose -f docker-compose.prod.yml exec backup sh /scripts/restore.sh /backups/vertex-….dump
#   docker compose -f docker-compose.prod.yml start api
#
# Uses PGHOST/PGUSER/PGPASSWORD/PGDATABASE, as the backup service has them.
set -eu

file="${1:?usage: restore.sh /backups/vertex-YYYYmmdd-HHMMSS.dump}"
[ -f "$file" ] || { echo "no such file: $file" >&2; exit 1; }

echo "This replaces everything in database \"${PGDATABASE}\" on ${PGHOST:-localhost} with $file."
if [ "${RESTORE_YES:-}" != "1" ]; then
  printf 'Type the database name to go on: '
  read -r answer
  [ "$answer" = "$PGDATABASE" ] || { echo "Stopped."; exit 1; }
fi

pg_restore --clean --if-exists --no-owner --single-transaction --dbname="$PGDATABASE" "$file"
echo "Restored."
