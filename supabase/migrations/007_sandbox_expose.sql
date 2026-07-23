-- Expose the sandbox schema to the API without the dashboard.
--
-- Testing Mode used to need a manual click in the Supabase Dashboard
-- (Settings → API → Exposed schemas → add `sandbox`). PostgREST reads that
-- list from the `authenticator` role's `pgrst.db_schemas` setting, which we
-- can set here so `004_testing_sandbox.sql` + this file are the *entire*
-- sandbox setup — no dashboard step.
--
-- Safe to re-run. Only appends `sandbox`; it never drops schemas you already
-- expose. The setting can live at two levels — per-database
-- (`ALTER ROLE authenticator IN DATABASE … SET`) or role/cluster-wide
-- (`ALTER ROLE authenticator SET`). The per-database value wins in PostgREST,
-- so we read whichever is actually in effect and write the appended value back
-- at that same level. That way we never plant a role-level default that could
-- later shadow-drop `storage` or a custom API schema.

do $$
declare
  v_db_oid oid := (select oid from pg_database where datname = current_database());
  v_perdb text;
  v_role text;
  v_current text;
  v_perdb_scope boolean;
begin
  -- Per-database setting for the authenticator role (higher precedence).
  select opt.value into v_perdb
  from pg_db_role_setting s
  cross join lateral unnest(s.setconfig) as cfg(entry)
  cross join lateral (
    select split_part(cfg.entry, '=', 1) as name,
           substr(cfg.entry, strpos(cfg.entry, '=') + 1) as value
  ) as opt
  where s.setrole = 'authenticator'::regrole
    and s.setdatabase = v_db_oid
    and opt.name = 'pgrst.db_schemas';

  -- Role/cluster-level setting (lower precedence).
  select opt.value into v_role
  from pg_db_role_setting s
  cross join lateral unnest(s.setconfig) as cfg(entry)
  cross join lateral (
    select split_part(cfg.entry, '=', 1) as name,
           substr(cfg.entry, strpos(cfg.entry, '=') + 1) as value
  ) as opt
  where s.setrole = 'authenticator'::regrole
    and s.setdatabase = 0
    and opt.name = 'pgrst.db_schemas';

  -- Use the value at the level PostgREST will actually read, and remember
  -- which level that is so we write the change back to the same place.
  if v_perdb is not null then
    v_current := v_perdb;
    v_perdb_scope := true;
  elsif v_role is not null then
    v_current := v_role;
    v_perdb_scope := false;
  else
    -- Nothing set anywhere: fall back to Supabase's documented default.
    v_current := 'public, graphql_public';
    v_perdb_scope := false;
  end if;

  -- Append sandbox only if it isn't already listed.
  if not (string_to_array(replace(v_current, ' ', ''), ',') @> array['sandbox']) then
    if v_perdb_scope then
      execute format(
        'alter role authenticator in database %I set pgrst.db_schemas = %L',
        current_database(), v_current || ', sandbox'
      );
    else
      execute format(
        'alter role authenticator set pgrst.db_schemas = %L',
        v_current || ', sandbox'
      );
    end if;
  end if;
end
$$;

-- Ask PostgREST to reload its config so the change takes effect immediately.
notify pgrst, 'reload config';
