# BurgerBUS-ONLINE-ORDER

A minimal Burger Bus online ordering MVP that demonstrates the core requirements from the project brief:

- Burger Bus branding, address, and phone number
- Clover sandbox mode configuration
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
