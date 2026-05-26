#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/BurgerBUS-ONLINE-ORDER}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/burgerbus}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ ! "${BACKUP_RETENTION_DAYS}" =~ ^[0-9]+$ ]] || [[ "${BACKUP_RETENTION_DAYS}" -le 0 ]]; then
  echo "BACKUP_RETENTION_DAYS must be a positive integer."
  exit 1
fi

sudo mkdir -p "${BACKUP_DIR}"
sudo tar -czf "${BACKUP_DIR}/burgerbus-${STAMP}.tar.gz" \
  --exclude='.git' \
  --exclude='node_modules' \
  -C "$(dirname "${APP_DIR}")" "$(basename "${APP_DIR}")"
# Keep backups for BACKUP_RETENTION_DAYS (default 14).
sudo find "${BACKUP_DIR}" -type f -name "burgerbus-*.tar.gz" -mtime +${BACKUP_RETENTION_DAYS} -delete

echo "Backup completed: ${BACKUP_DIR}/burgerbus-${STAMP}.tar.gz"
