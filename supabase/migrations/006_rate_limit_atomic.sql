-- Atomic rate limiting.
--
-- The original checkRateLimit did read-then-write in two round trips, so two
-- requests arriving together could both read the same count and both be
-- allowed — the limit leaked under exactly the burst it exists to stop. This
-- function does the check-and-increment in a single statement under the row
-- lock, so concurrent callers serialize correctly.
--
-- Returns true when the request is allowed, false when the limit is hit.
-- src/lib/rateLimit.ts calls this via supabase.rpc('bump_rate_limit', …) and
-- falls back to the old two-step path if this function isn't installed yet.

create or replace function public.bump_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
) returns boolean
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz := v_now - make_interval(secs => p_window_seconds);
  v_count integer;
begin
  insert into public.rate_limits (key, count, window_start)
  values (p_key, 1, v_now)
  on conflict (key) do update
    set
      -- Reset the window if the stored one has expired, otherwise increment.
      count = case
        when public.rate_limits.window_start < v_window_start then 1
        else public.rate_limits.count + 1
      end,
      window_start = case
        when public.rate_limits.window_start < v_window_start then v_now
        else public.rate_limits.window_start
      end
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

grant execute on function public.bump_rate_limit(text, integer, integer) to service_role;
