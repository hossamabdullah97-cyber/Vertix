#!/bin/sh
# Database backups (the "backup" service in docker-compose.prod.yml).
#
#   backup.sh once   one backup now
#   backup.sh loop   one at start-up, then every BACKUP_INTERVAL_HOURS
#
# Each is a pg_dump in custom format (compressed, restorable with
# scripts/restore.sh), checked to be readable before it counts. Kept in
# BACKUP_DIR for BACKUP_KEEP_DAYS; with BACKUP_S3_BUCKET set, also copied to
# that bucket (S3_ENDPOINT etc., e.g. Cloudflare R2), so a lost server does
# not take its backups with it: give the bucket a lifecycle rule that deletes
# old copies. With BACKUP_HEARTBEAT_URL set (healthchecks.io, Better Stack…),
# it is called after each good backup, so a backup that stops happening is
# noticed rather than discovered on the day it is needed.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"

log() { echo "[backup] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

upload() {
  file="$1"
  if ! command -v aws >/dev/null 2>&1; then
    apk add --no-cache aws-cli >/dev/null
  fi
  AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" AWS_DEFAULT_REGION="${S3_REGION:-auto}" \
    aws s3 cp "$file" "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-db}/$(basename "$file")" \
    ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"} --only-show-errors
}

once() {
  mkdir -p "$BACKUP_DIR"
  name="vertex-$(date -u +%Y%m%d-%H%M%S).dump"
  tmp="$BACKUP_DIR/.$name.partial"
  pg_dump --format=custom --no-owner --file="$tmp"
  # A dump that cannot be listed cannot be restored either.
  pg_restore --list "$tmp" >/dev/null
  mv "$tmp" "$BACKUP_DIR/$name"
  log "saved $name ($(du -h "$BACKUP_DIR/$name" | cut -f1))"

  if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    upload "$BACKUP_DIR/$name"
    log "copied to s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-db}/$name"
  else
    log "BACKUP_S3_BUCKET is not set: this backup lives only on this server"
  fi

  find "$BACKUP_DIR" -name 'vertex-*.dump' -mtime +"$KEEP_DAYS" -exec rm -f {} \;

  if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
    wget -q -O /dev/null "$BACKUP_HEARTBEAT_URL" || log "heartbeat failed"
  fi
}

case "${1:-once}" in
  once) once ;;
  loop)
    while true; do
      once || log "FAILED: see the error above"
      sleep $((INTERVAL_HOURS * 3600))
    done
    ;;
  *) echo "usage: backup.sh once|loop" >&2; exit 2 ;;
esac
