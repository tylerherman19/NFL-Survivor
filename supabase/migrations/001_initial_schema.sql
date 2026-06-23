-- NFL Survivor Pool Database Schema

-- Players
create table players (
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

-- Weeks
create table weeks (
  id uuid primary key default gen_random_uuid(),
  week_number integer not null,
  season_year integer not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (week_number, season_year)
);

-- Games
create table games (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id) on delete cascade,
  home_team text not null,
  away_team text not null,
  game_day text not null check (game_day in ('thursday','friday','saturday','sunday','monday','tuesday')),
  kickoff_central timestamptz not null,
  is_snf boolean not null default false,
  is_mnf boolean not null default false,
  result text not null default 'pending' check (result in ('home_win','away_win','tie','pending')),
  created_at timestamptz not null default now()
);

-- Picks
create table picks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  week_id uuid not null references weeks(id) on delete cascade,
  team text not null,
  auto_assigned boolean not null default false,
  submitted_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  unique (player_id, week_id)
);

-- Indexes for performance
create index picks_player_id_idx on picks(player_id);
create index picks_week_id_idx on picks(week_id);
create index games_week_id_idx on games(week_id);
create index players_status_idx on players(status);
create index players_email_idx on players(email);
create index players_reset_token_idx on players(pin_reset_token);

-- Row Level Security: disable for server-side access via service role key
alter table players disable row level security;
alter table weeks disable row level security;
alter table games disable row level security;
alter table picks disable row level security;
