create table if not exists public.orders (
  order_id text primary key,
  clover_order_id text not null unique,
  subtotal numeric(10, 2) not null check (subtotal >= 0),
  rewards_points_earned integer not null default 0 check (rewards_points_earned >= 0),
  order_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.rewards_ledger (
  member_id text primary key,
  points integer not null default 0 check (points >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists orders_created_at_idx on public.orders (created_at);
