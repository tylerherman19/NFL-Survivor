-- Testing sandbox: a fully separate copy of the pool's tables in a dedicated
-- Postgres schema. The app talks to it through a second supabase-js client
-- (db.schema = 'sandbox') when the admin enables Testing Mode, so test users,
-- test schedules, picks, and grading never touch production rows.
--
-- IMPORTANT — one manual step after running this migration:
-- PostgREST only serves schemas listed in "Exposed schemas". In the Supabase
-- Dashboard go to Settings → API → "Exposed schemas" and add `sandbox`
-- alongside `public`. Without it every sandbox query fails with PGRST106.

create schema if not exists sandbox;

-- Mirrors public.players (001_initial_schema.sql)
create table sandbox.players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text not null unique,
  venmo_handle text,
  paid boolean not null default false,
  status text not null default 'alive' check (status in ('alive', 'eliminated')),
  elimination_week integer,
  elimination_reason text,
  pin_hash text not null,
  pin_reset_token text,
  pin_reset_expires timestamptz,
  created_at timestamptz not null default now()
);

-- Mirrors public.weeks
create table sandbox.weeks (
  id uuid primary key default gen_random_uuid(),
  week_number integer not null,
  season_year integer not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (week_number, season_year)
);

-- Mirrors public.games
create table sandbox.games (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references sandbox.weeks(id) on delete cascade,
  home_team text not null,
  away_team text not null,
  game_day text not null check (game_day in ('thursday','friday','saturday','sunday','monday','tuesday')),
  kickoff_central timestamptz not null,
  is_snf boolean not null default false,
  is_mnf boolean not null default false,
  result text not null default 'pending' check (result in ('home_win','away_win','tie','pending')),
  created_at timestamptz not null default now()
);

-- Mirrors public.picks
create table sandbox.picks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references sandbox.players(id) on delete cascade,
  week_id uuid not null references sandbox.weeks(id) on delete cascade,
  team text not null,
  auto_assigned boolean not null default false,
  submitted_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  unique (player_id, week_id)
);

create index sandbox_picks_player_id_idx on sandbox.picks(player_id);
create index sandbox_picks_week_id_idx on sandbox.picks(week_id);
create index sandbox_games_week_id_idx on sandbox.games(week_id);
create index sandbox_players_status_idx on sandbox.players(status);
create index sandbox_players_email_idx on sandbox.players(email);
create index sandbox_players_reset_token_idx on sandbox.players(pin_reset_token);

-- Same posture as 002_enable_rls.sql: the app uses the service role key
-- (bypasses RLS); enabling RLS blocks direct anon/public access.
alter table sandbox.players enable row level security;
alter table sandbox.weeks enable row level security;
alter table sandbox.games enable row level security;
alter table sandbox.picks enable row level security;

-- PostgREST switches to service_role for requests signed with the service
-- role key — it needs explicit privileges on non-public schemas.
grant usage on schema sandbox to service_role;
grant all on all tables in schema sandbox to service_role;
grant all on all sequences in schema sandbox to service_role;
alter default privileges in schema sandbox grant all on tables to service_role;
alter default privileges in schema sandbox grant all on sequences to service_role;
