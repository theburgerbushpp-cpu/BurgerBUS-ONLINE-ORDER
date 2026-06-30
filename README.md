# BurgerBUS-ONLINE-ORDER

A minimal Burger Bus online ordering MVP that demonstrates the core requirements from the project brief:

- Burger Bus branding, address, and phone number
- Clover production mode configuration
- Single menu tiles with variant-driven pricing
- Modifier and combo upgrade pop-up flows
- Pickup vs delivery payment rules
- Cash pickup vs credit card validation
- Clover-style IDs for menu and order records
- Cart reservations that immediately hold inventory while the cart is active
- Checkout flow that converts reserved inventory into a paid Clover-backed order
- Rewards point accrual for app orders
- Simulated Clover KDS and Twilio status messaging

## Run locally

Set Clover Merchant ID and Auth token:

1. Copy `.env.example` to `.env`.
2. Update `CLOVER_MERCHANT_ID` and `CLOVER_API_TOKEN` in `.env`.
3. Set `CLOVER_MODE=production` for live Clover, or `CLOVER_MODE=sandbox` for test mode.

```bash
npm start
```

Then open `http://localhost:3000`.

## Test

```bash
npm test
```

## Supabase backend schema

The backend relational schema is intended to be managed in Supabase and is available at `src/data/backend-schema.sql`.

It includes normalized tables and constraints for:

- Inventory (stock, reservations, adjustments)
- Ordering (orders, order items, modifiers, combo upgrades)
- Availability (weekly rules and temporary overrides)
- Credit card processing (tokenized payment methods and transaction ledger)
- Loyalty (accounts, points balance, earn/redeem ledger)

Target platform: Supabase Postgres (PostgreSQL 14+ compatible)

Use this SQL as the basis for Supabase migrations or direct schema setup. The schema also creates a `clover` schema and adds foreign-key references from app tables to Clover-facing tables (`clover.items`, `clover.item_variants`, `clover.orders`, `clover.payment_transactions`, etc.) so data can stay linked to Clover IDs and synced records.
