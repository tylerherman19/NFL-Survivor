-- Prevent duplicate games within a week. Without this, resubmitting the manual
-- schedule form (POST /api/schedule) duplicates games instead of updating them,
-- skewing the grid, pick availability, and deadline math.

alter table public.games
  add constraint games_week_matchup_unique unique (week_id, home_team, away_team);

alter table sandbox.games
  add constraint sandbox_games_week_matchup_unique unique (week_id, home_team, away_team);
