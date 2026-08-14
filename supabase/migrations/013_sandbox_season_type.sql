-- Bring sandbox.weeks in line with public.weeks (migration 011), which added
-- season_type but only to the public schema. Without it the sandbox can't
-- represent a preseason week at all, so testing the preseason trial — the exact
-- flow the signup cutoff now keys off — can't be rehearsed in the sandbox.
--
-- Guarded on the sandbox schema existing (004_testing_sandbox.sql) so this
-- migration runs cleanly on a deployment that never set the sandbox up, and
-- guarded on the column so it's safe to re-run.
do $$
begin
  if to_regclass('sandbox.weeks') is not null
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'sandbox' and table_name = 'weeks' and column_name = 'season_type'
     )
  then
    alter table sandbox.weeks add column season_type text not null default 'regular'
      check (season_type in ('preseason', 'regular'));

    alter table sandbox.weeks drop constraint if exists weeks_week_number_season_year_key;
    alter table sandbox.weeks add constraint sandbox_weeks_season_type_week_number_season_year_key
      unique (season_type, week_number, season_year);
  end if;
end
$$;
