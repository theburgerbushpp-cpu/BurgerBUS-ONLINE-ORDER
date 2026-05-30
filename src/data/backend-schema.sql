-- BurgerBUS backend relational schema
-- Covers: inventory, ordering, availability, credit card processing, loyalty
-- Target platform: Supabase Postgres (PostgreSQL 14+ compatible)

BEGIN;

CREATE SCHEMA IF NOT EXISTS clover;

-- Minimal Clover-facing tables for FK references.
-- If your environment already has Clover-sync tables, keep these definitions aligned.
CREATE TABLE IF NOT EXISTS clover.merchants (
  id BIGSERIAL PRIMARY KEY,
  merchant_uuid VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clover.customers (
  id BIGSERIAL PRIMARY KEY,
  clover_customer_id VARCHAR(80) UNIQUE NOT NULL,
  merchant_id BIGINT NOT NULL REFERENCES clover.merchants(id) ON DELETE CASCADE,
  full_name VARCHAR(120),
  phone VARCHAR(30),
  email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clover.items (
  id BIGSERIAL PRIMARY KEY,
  clover_item_id VARCHAR(80) UNIQUE NOT NULL,
  merchant_id BIGINT NOT NULL REFERENCES clover.merchants(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clover.item_variants (
  id BIGSERIAL PRIMARY KEY,
  clover_variant_id VARCHAR(80) UNIQUE NOT NULL,
  clover_item_pk BIGINT NOT NULL REFERENCES clover.items(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  price_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clover.modifiers (
  id BIGSERIAL PRIMARY KEY,
  clover_modifier_id VARCHAR(80) UNIQUE NOT NULL,
  clover_item_pk BIGINT REFERENCES clover.items(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  price_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clover.orders (
  id BIGSERIAL PRIMARY KEY,
  clover_order_id VARCHAR(80) UNIQUE NOT NULL,
  merchant_id BIGINT NOT NULL REFERENCES clover.merchants(id) ON DELETE CASCADE,
  clover_customer_pk BIGINT REFERENCES clover.customers(id) ON DELETE SET NULL,
  total_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clover.payment_transactions (
  id BIGSERIAL PRIMARY KEY,
  provider_transaction_id VARCHAR(120) UNIQUE NOT NULL,
  clover_order_pk BIGINT REFERENCES clover.orders(id) ON DELETE CASCADE,
  amount_cents INTEGER,
  status VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clover.loyalty_members (
  id BIGSERIAL PRIMARY KEY,
  member_code VARCHAR(64) UNIQUE NOT NULL,
  clover_customer_pk BIGINT REFERENCES clover.customers(id) ON DELETE CASCADE,
  points_balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------
-- Core catalog
-- -----------------------------
CREATE TABLE IF NOT EXISTS menu_items (
  id BIGSERIAL PRIMARY KEY,
  clover_item_pk BIGINT REFERENCES clover.items(id) ON DELETE SET NULL,
  clover_item_id VARCHAR(80) UNIQUE,
  sku VARCHAR(64) UNIQUE,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_item_variants (
  id BIGSERIAL PRIMARY KEY,
  menu_item_id BIGINT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  clover_variant_pk BIGINT REFERENCES clover.item_variants(id) ON DELETE SET NULL,
  clover_variant_id VARCHAR(80) UNIQUE,
  name VARCHAR(80) NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (menu_item_id, name)
);

CREATE TABLE IF NOT EXISTS modifiers (
  id BIGSERIAL PRIMARY KEY,
  menu_item_id BIGINT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  clover_modifier_pk BIGINT REFERENCES clover.modifiers(id) ON DELETE SET NULL,
  clover_modifier_id VARCHAR(80) UNIQUE,
  name VARCHAR(80) NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (menu_item_id, name)
);

CREATE TABLE IF NOT EXISTS combo_upgrades (
  id BIGSERIAL PRIMARY KEY,
  menu_item_id BIGINT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  clover_combo_id VARCHAR(80) UNIQUE,
  name VARCHAR(120) NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (menu_item_id, name)
);

-- -----------------------------
-- Inventory and availability
-- -----------------------------
CREATE TABLE IF NOT EXISTS inventory_lots (
  id BIGSERIAL PRIMARY KEY,
  variant_id BIGINT NOT NULL REFERENCES menu_item_variants(id) ON DELETE CASCADE,
  location_code VARCHAR(50) NOT NULL DEFAULT 'MAIN_TRUCK',
  qty_on_hand INTEGER NOT NULL CHECK (qty_on_hand >= 0),
  qty_reserved INTEGER NOT NULL DEFAULT 0 CHECK (qty_reserved >= 0),
  reorder_threshold INTEGER NOT NULL DEFAULT 0 CHECK (reorder_threshold >= 0),
  lot_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (qty_reserved <= qty_on_hand)
);

CREATE TABLE IF NOT EXISTS inventory_events (
  id BIGSERIAL PRIMARY KEY,
  variant_id BIGINT NOT NULL REFERENCES menu_item_variants(id) ON DELETE CASCADE,
  order_id BIGINT,
  event_type VARCHAR(24) NOT NULL CHECK (
    event_type IN ('RESTOCK', 'RESERVE', 'RELEASE', 'DEDUCT', 'ADJUST')
  ),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS availability_rules (
  id BIGSERIAL PRIMARY KEY,
  scope VARCHAR(16) NOT NULL CHECK (scope IN ('ITEM', 'VARIANT')),
  menu_item_id BIGINT REFERENCES menu_items(id) ON DELETE CASCADE,
  variant_id BIGINT REFERENCES menu_item_variants(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone_name VARCHAR(80) NOT NULL DEFAULT 'Pacific/Honolulu',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time),
  CHECK (
    (scope = 'ITEM' AND menu_item_id IS NOT NULL AND variant_id IS NULL) OR
    (scope = 'VARIANT' AND variant_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS availability_overrides (
  id BIGSERIAL PRIMARY KEY,
  variant_id BIGINT NOT NULL REFERENCES menu_item_variants(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  force_available BOOLEAN NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

-- -----------------------------
-- Customers and orders
-- -----------------------------
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  clover_customer_pk BIGINT REFERENCES clover.customers(id) ON DELETE SET NULL,
  clover_customer_id VARCHAR(80) UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(255),
  default_street VARCHAR(200),
  default_city VARCHAR(80),
  default_state VARCHAR(40),
  default_postal_code VARCHAR(20),
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_number VARCHAR(40) NOT NULL UNIQUE,
  clover_order_pk BIGINT REFERENCES clover.orders(id) ON DELETE SET NULL,
  clover_order_id VARCHAR(80) UNIQUE,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  fulfillment_type VARCHAR(20) NOT NULL CHECK (fulfillment_type IN ('pickup', 'delivery')),
  order_status VARCHAR(24) NOT NULL CHECK (
    order_status IN ('created', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')
  ),
  payment_status VARCHAR(24) NOT NULL CHECK (
    payment_status IN ('unpaid', 'authorized', 'captured', 'failed', 'refunded', 'voided')
  ),
  subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  rewards_points_earned INTEGER NOT NULL DEFAULT 0 CHECK (rewards_points_earned >= 0),
  rewards_points_redeemed INTEGER NOT NULL DEFAULT 0 CHECK (rewards_points_redeemed >= 0),
  requested_ready_at TIMESTAMPTZ,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id BIGINT NOT NULL REFERENCES menu_items(id),
  variant_id BIGINT NOT NULL REFERENCES menu_item_variants(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  line_subtotal_cents INTEGER NOT NULL CHECK (line_subtotal_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_item_modifiers (
  id BIGSERIAL PRIMARY KEY,
  order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  modifier_id BIGINT NOT NULL REFERENCES modifiers(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
);

CREATE TABLE IF NOT EXISTS order_item_combo_upgrades (
  id BIGSERIAL PRIMARY KEY,
  order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  combo_upgrade_id BIGINT NOT NULL REFERENCES combo_upgrades(id),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
);

-- -----------------------------
-- Credit card processing (PCI-safe tokenized model)
-- -----------------------------
CREATE TABLE IF NOT EXISTS payment_methods (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('credit_card', 'cash')),
  card_brand VARCHAR(20),
  card_last4 CHAR(4),
  card_exp_month SMALLINT CHECK (card_exp_month BETWEEN 1 AND 12),
  card_exp_year SMALLINT,
  gateway_customer_token VARCHAR(120),
  gateway_payment_token VARCHAR(120),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (type = 'cash' AND card_last4 IS NULL AND gateway_payment_token IS NULL) OR
    (type = 'credit_card' AND card_last4 IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  clover_payment_txn_pk BIGINT REFERENCES clover.payment_transactions(id) ON DELETE SET NULL,
  payment_method_id BIGINT REFERENCES payment_methods(id) ON DELETE SET NULL,
  provider VARCHAR(40) NOT NULL,
  provider_transaction_id VARCHAR(120) UNIQUE,
  transaction_type VARCHAR(20) NOT NULL CHECK (
    transaction_type IN ('authorize', 'capture', 'sale', 'refund', 'void')
  ),
  transaction_status VARCHAR(20) NOT NULL CHECK (
    transaction_status IN ('pending', 'succeeded', 'failed')
  ),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  failure_code VARCHAR(60),
  failure_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------
-- Loyalty
-- -----------------------------
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id BIGSERIAL PRIMARY KEY,
  clover_loyalty_member_pk BIGINT REFERENCES clover.loyalty_members(id) ON DELETE SET NULL,
  customer_id BIGINT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  member_code VARCHAR(64) NOT NULL UNIQUE,
  points_balance INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  tier VARCHAR(20) NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard', 'silver', 'gold', 'vip')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  loyalty_account_id BIGINT NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  entry_type VARCHAR(12) NOT NULL CHECK (entry_type IN ('earn', 'redeem', 'adjust', 'expire')),
  points_delta INTEGER NOT NULL,
  reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (points_delta <> 0)
);

-- -----------------------------
-- Integration and notification trails
-- -----------------------------
CREATE TABLE IF NOT EXISTS external_event_logs (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  provider VARCHAR(40) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messaging_events (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  channel VARCHAR(16) NOT NULL CHECK (channel IN ('sms', 'email', 'push')),
  provider VARCHAR(40) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  message_template VARCHAR(80),
  destination VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- -----------------------------
-- Useful indexes
-- -----------------------------
CREATE INDEX IF NOT EXISTS idx_inventory_lots_variant ON inventory_lots(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_events_variant_created ON inventory_events(variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_availability_rules_item ON availability_rules(menu_item_id) WHERE menu_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_availability_rules_variant ON availability_rules(variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order ON payment_transactions(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_account ON loyalty_ledger_entries(loyalty_account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_event_logs_order ON external_event_logs(order_id, received_at DESC);

COMMIT;
