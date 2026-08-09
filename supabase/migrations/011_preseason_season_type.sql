-- Distinguish preseason weeks from regular-season weeks so week_number 1/2
-- can exist in both without colliding (e.g. running a preseason trial ahead
-- of the real regular season under the same season_year).
alter table public.weeks add column season_type text not null default 'regular'
  check (season_type in ('preseason', 'regular'));

alter table public.weeks drop constraint weeks_week_number_season_year_key;
alter table public.weeks add constraint weeks_season_type_week_number_season_year_key
  unique (season_type, week_number, season_year);
