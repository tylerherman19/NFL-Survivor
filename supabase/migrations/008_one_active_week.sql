-- Enforce the "at most one active week" invariant at the database level.
--
-- The app maintains it in application code (set-active-week, schedule, and
-- sync-espn all deactivate the other weeks before activating one), but nothing
-- stopped a concurrent write or a stray manual UPDATE from leaving two weeks
-- active. When that happens every `.eq('is_active', true).single()` read
-- resolves to "no row" and the whole site silently renders as if the pool
-- hasn't started.
--
-- A partial unique index allows a single row with is_active = true while
-- placing no constraint on the many is_active = false rows. The app's
-- deactivate-then-activate sequences stay compatible (they pass through an
-- all-false state before setting one true).
--
-- If this fails, two weeks are already active — pick the one to keep, e.g.:
--   update weeks set is_active = false
--   where id <> (select id from weeks where is_active
--                order by created_at desc limit 1);

create unique index if not exists weeks_one_active
  on public.weeks (is_active) where is_active;

-- Mirror it in the sandbox schema, but only if that schema has been set up
-- (004_testing_sandbox.sql) so this migration runs cleanly either way.
do $$
begin
  if to_regclass('sandbox.weeks') is not null then
    create unique index if not exists sandbox_weeks_one_active
      on sandbox.weeks (is_active) where is_active;
  end if;
end
$$;
