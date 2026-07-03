-- The rate limiter (src/lib/rateLimit.ts) reads/writes a rate_limits table that
-- was never in a migration. checkRateLimit fails open (allowed: true) on any
-- error, so without this table rate limiting is silently a no-op.
create table if not exists rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now()
);

alter table rate_limits enable row level security;
