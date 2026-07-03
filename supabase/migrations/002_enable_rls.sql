-- Enable RLS on all tables.
-- The app uses the service role key exclusively, which bypasses RLS,
-- so no policies are needed — but enabling RLS blocks direct anon/public access.
alter table players enable row level security;
alter table weeks enable row level security;
alter table games enable row level security;
alter table picks enable row level security;
