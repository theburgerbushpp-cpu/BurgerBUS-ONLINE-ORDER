# BurgerBUS-ONLINE-ORDER

A minimal Burger Bus online ordering MVP that demonstrates the core requirements from the project brief:

- Burger Bus branding, address, and phone number
- Clover production mode configuration
- Single menu tiles with variant-driven pricing
- Modifier and combo upgrade pop-up flows
- Pickup vs delivery payment rules
- Cash pickup vs credit card validation
- Clover-style IDs for menu and order records
- Rewards point accrual for app orders
- Simulated Clover KDS and Twilio status messaging

## Run locally

```bash
npm start
```

Then open `http://localhost:3000`.

## Test

```bash
npm test
```

## Deploy on Ubuntu VPS

The repository now includes deployment assets in `deploy/vps`.

### 1) Server baseline and hardening

On a fresh Ubuntu LTS VPS:

```bash
sudo apt update && sudo apt upgrade -y
sudo adduser deploy
sudo usermod -aG sudo deploy
sudo mkdir -p /home/deploy/.ssh
sudo cp ~/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

Set SSH to key-only auth and disable password logins in `/etc/ssh/sshd_config` (or copy `deploy/vps/sshd-hardening.conf` to `/etc/ssh/sshd_config.d/99-burgerbus-hardening.conf`):

- `PasswordAuthentication no`
- `PubkeyAuthentication yes`
- `PermitRootLogin no`

Then:

```bash
sudo systemctl restart ssh
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

### 2) Install runtime dependencies

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx git
```

### 3) Pull app and install dependencies

```bash
sudo mkdir -p /var/www
sudo chown deploy:deploy /var/www
cd /var/www
git clone https://github.com/theburgerbushpp-cpu/BurgerBUS-ONLINE-ORDER.git
cd /var/www/BurgerBUS-ONLINE-ORDER
npm install --omit=dev
npm start
```

### 4) Define production environment

Create `/etc/burgerbus/burgerbus.env` from `deploy/vps/burgerbus.env.example` and set values:

- `PORT`
- `CLOVER_MERCHANT_ID` (optional)
- `CLOVER_API_TOKEN` (optional)

Lock down permissions:

```bash
sudo mkdir -p /etc/burgerbus
sudo cp deploy/vps/burgerbus.env.example /etc/burgerbus/burgerbus.env
sudo chown root:root /etc/burgerbus/burgerbus.env
sudo chmod 600 /etc/burgerbus/burgerbus.env
```

### 5) Run as a persistent service (systemd)

```bash
sudo cp deploy/vps/burgerbus.service /etc/systemd/system/burgerbus.service
sudo systemctl daemon-reload
sudo systemctl enable --now burgerbus
sudo systemctl status burgerbus
```

### 6) Configure Nginx reverse proxy

Copy and update server name in `deploy/vps/nginx-burgerbus.conf`, then:

```bash
sudo cp deploy/vps/nginx-burgerbus.conf /etc/nginx/sites-available/burgerbus
sudo ln -sf /etc/nginx/sites-available/burgerbus /etc/nginx/sites-enabled/burgerbus
sudo nginx -t
sudo systemctl reload nginx
```

### 7) Enable HTTPS with Let's Encrypt

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
sudo systemctl status certbot.timer
```

### 8) Validate deployment

Use the included validator:

```bash
chmod +x deploy/vps/validate-deployment.sh
./deploy/vps/validate-deployment.sh https://your-domain.com
```

### 9) Operations baseline

- Log rotation: `deploy/vps/logrotate-burgerbus`
- Backup helper: `deploy/vps/backup-burgerbus.sh`
- Health checks: `deploy/vps/validate-deployment.sh`
- Service logs: `journalctl -u burgerbus -f`

Install logrotate policy:

```bash
sudo cp deploy/vps/logrotate-burgerbus /etc/logrotate.d/burgerbus
```

### 10) Optional CI/CD to VPS

An optional workflow template is provided at:

- `deploy/vps/deploy-vps-workflow.yml.example`

Copy it into `.github/workflows/deploy-vps.yml` and configure the required GitHub secrets described in the file.

## Backend schema

The backend relational schema is available at `src/data/backend-schema.sql`.

It includes normalized tables and constraints for:

- Inventory (stock, reservations, adjustments)
- Ordering (orders, order items, modifiers, combo upgrades)
- Availability (weekly rules and temporary overrides)
- Credit card processing (tokenized payment methods and transaction ledger)
- Loyalty (accounts, points balance, earn/redeem ledger)

Target dialect: PostgreSQL 14+

The schema also creates a `clover` schema and adds foreign-key references from app tables to Clover-facing tables (`clover.items`, `clover.item_variants`, `clover.orders`, `clover.payment_transactions`, etc.) so data can stay linked to Clover IDs and synced records.
