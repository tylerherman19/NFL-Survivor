-- Sandbox only: allow multiple test users to share one email address, so the
-- admin can register a whole roster of test accounts under their own inbox.
-- Production (public.players) keeps its unique email constraint — login is by
-- full_name, and the app skips its duplicate-email checks only in test mode.
--
-- Run after 004 (creates the schema) and 005 (unique team per player).
-- `if exists` makes this safe whether or not 004 has already been applied.
alter table sandbox.players drop constraint if exists players_email_key;
