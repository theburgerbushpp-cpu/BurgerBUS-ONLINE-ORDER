#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/BurgerBUS-ONLINE-ORDER}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/burgerbus}"
STAMP="$(date +%Y%m%d-%H%M%S)"

sudo mkdir -p "${BACKUP_DIR}"
sudo tar -czf "${BACKUP_DIR}/burgerbus-${STAMP}.tar.gz" -C "$(dirname "${APP_DIR}")" "$(basename "${APP_DIR}")"
sudo find "${BACKUP_DIR}" -type f -name "burgerbus-*.tar.gz" -mtime +14 -delete

echo "Backup completed: ${BACKUP_DIR}/burgerbus-${STAMP}.tar.gz"
