-- Expose the sandbox schema to the API without the dashboard.
--
-- Testing Mode used to need a manual click in the Supabase Dashboard
-- (Settings → API → Exposed schemas → add `sandbox`). PostgREST reads that
-- list from a role setting, which we can set here so `004_testing_sandbox.sql`
-- + this file are the *entire* sandbox setup — no dashboard step.
--
-- Safe to re-run. Only appends `sandbox`; it never drops schemas you already
-- expose. If your project has customized exposed schemas beyond the Supabase
-- default, the block below preserves whatever is already there.

do $$
declare
  current_schemas text;
begin
  -- Pull the authenticator role's current pgrst.db_schemas setting (cluster
  -- level, setdatabase = 0). Default to Supabase's out-of-the-box value.
  select opt.value
    into current_schemas
  from pg_db_role_setting s
  cross join lateral unnest(s.setconfig) as cfg(entry)
  cross join lateral (
    select split_part(cfg.entry, '=', 1) as name,
           split_part(cfg.entry, '=', 2) as value
  ) as opt
  where s.setrole = 'authenticator'::regrole
    and s.setdatabase = 0
    and opt.name = 'pgrst.db_schemas';

  current_schemas := coalesce(current_schemas, 'public, graphql_public');

  -- Append sandbox only if it isn't already listed.
  if not (string_to_array(replace(current_schemas, ' ', ''), ',') @> array['sandbox']) then
    execute format(
      'alter role authenticator set pgrst.db_schemas = %L',
      current_schemas || ', sandbox'
    );
  end if;
end
$$;

-- Ask PostgREST to reload its config so the change takes effect immediately.
notify pgrst, 'reload config';
