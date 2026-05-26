#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/theburgerbushpp-cpu/BurgerBUS-ONLINE-ORDER.git}"
APP_DIR="${APP_DIR:-/var/www/BurgerBUS-ONLINE-ORDER}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"

if [[ "${EUID}" -eq 0 ]]; then
  echo "Run as deploy user, not root."
  exit 1
fi

if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" fetch origin
  git -C "${APP_DIR}" reset --hard origin/main
else
  mkdir -p "$(dirname "${APP_DIR}")"
  git clone "${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"
npm install --omit=dev

echo "Application synced to ${APP_DIR}."
echo "If env/service are ready: sudo systemctl restart burgerbus"
