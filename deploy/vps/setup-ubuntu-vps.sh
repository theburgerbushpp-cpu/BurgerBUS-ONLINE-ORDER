#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/vps/setup-ubuntu-vps.sh"
  exit 1
fi

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="${APP_DIR:-/var/www/BurgerBUS-ONLINE-ORDER}"
DOMAIN="${DOMAIN:-}"

apt update
apt upgrade -y

if ! id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
fi

curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt install -y nodejs nginx certbot python3-certbot-nginx git ufw

mkdir -p /etc/burgerbus /var/log/burgerbus /var/www
chown "${DEPLOY_USER}:${DEPLOY_USER}" /var/log/burgerbus /var/www
chmod 755 /var/log/burgerbus

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

if [[ -n "${DOMAIN}" ]]; then
  echo "Remember to update nginx-burgerbus.conf with domain ${DOMAIN}."
fi

echo "Baseline setup complete."
echo "Next: deploy/vps/deploy-app.sh"
