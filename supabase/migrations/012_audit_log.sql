-- Admin-facing audit trail: admin actions, system (cron) events, and player
-- pick activity. Read via the service key only (RLS on, no policies — same
-- posture as every other table, see 002).
--
-- player_id is deliberately NOT a foreign key: the log must survive the
-- player being deleted (a deletion is exactly the kind of event it records).
-- player_name is snapshotted for the same reason. Reset-pool does not touch
-- this table — the trail outlives pool resets by design.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null,
  actor text not null check (actor in ('admin', 'system', 'player')),
  player_id uuid,
  player_name text,
  message text not null,
  details jsonb
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_event_type_idx on public.audit_log (event_type);
create index audit_log_player_id_idx on public.audit_log (player_id);

alter table public.audit_log enable row level security;

-- Mirror into the sandbox schema so test mode gets its own isolated trail
-- (grants are covered by 004's default privileges). Conditional so this
-- migration runs cleanly even if the sandbox hasn't been set up.
do $$
begin
  if to_regclass('sandbox.weeks') is not null then
    create table sandbox.audit_log (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      event_type text not null,
      actor text not null check (actor in ('admin', 'system', 'player')),
      player_id uuid,
      player_name text,
      message text not null,
      details jsonb
    );
    create index sandbox_audit_log_created_at_idx on sandbox.audit_log (created_at desc);
    create index sandbox_audit_log_event_type_idx on sandbox.audit_log (event_type);
    create index sandbox_audit_log_player_id_idx on sandbox.audit_log (player_id);
    alter table sandbox.audit_log enable row level security;
  end if;
end
$$;
