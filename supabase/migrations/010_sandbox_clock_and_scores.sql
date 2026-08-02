-- Sandbox-only simulated clock + live scores, so Testing Mode can progress
-- through a week at its own pace instead of waiting on real wall-clock time,
-- and the sweat board can reflect fabricated sandbox matchups instead of
-- always querying the real ESPN scoreboard.
--
-- Sandbox-only, deliberately not mirrored onto public.games — production
-- games get real scores from ESPN and never need a fake clock.

-- Singleton row: id must be true, so the primary key guarantees exactly one
-- row can ever exist. simulated_now = null means "use real wall-clock time."
create table sandbox.clock (
  id boolean primary key default true check (id),
  simulated_now timestamptz
);
insert into sandbox.clock (id, simulated_now) values (true, null);

alter table sandbox.games
  add column home_score integer,
  add column away_score integer;

alter table sandbox.clock enable row level security;

grant all on sandbox.clock to service_role;
