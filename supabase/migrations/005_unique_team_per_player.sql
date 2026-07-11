-- Survivor rule enforced at the database level: a player can use each NFL
-- team at most once per season. The API already validates this, but a unique
-- constraint closes the race window (e.g. two simultaneous submissions, or a
-- pick change landing at the same moment as the auto-assign cron).
--
-- If this ALTER fails, existing data already violates the rule — find it with:
--   select player_id, team, count(*) from picks group by 1, 2 having count(*) > 1;

alter table public.picks
  add constraint picks_player_team_unique unique (player_id, team);

alter table sandbox.picks
  add constraint sandbox_picks_player_team_unique unique (player_id, team);
