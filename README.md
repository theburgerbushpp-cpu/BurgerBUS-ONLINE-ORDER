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

## Supabase database setup

To persist orders and rewards in a real database, configure Supabase:

1. Create a Supabase project.
2. Open the SQL Editor and run the SQL in `/supabase/schema.sql`.

3. Copy `.env.example` to `.env` and set:

   ```bash
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

If these variables are not set, the app still runs in local in-memory mode.

## Test

```bash
npm test
```
