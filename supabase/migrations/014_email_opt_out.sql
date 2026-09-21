-- Let players opt out of pool broadcasts and game notifications. Account
-- access emails (welcome and requested PIN resets) remain available.
alter table public.players
  add column if not exists email_opted_out boolean not null default false;

-- Keep the testing schema aligned when it exists.
do $$
begin
  if to_regclass('sandbox.players') is not null then
    alter table sandbox.players
      add column if not exists email_opted_out boolean not null default false;
  end if;
end
$$;
