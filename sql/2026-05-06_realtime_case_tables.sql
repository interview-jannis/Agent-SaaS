-- 2026-05-06: enable Supabase Realtime for tables that drive case-detail UI.
--
-- Today only `notifications` is in the `supabase_realtime` publication, so a
-- 3-party signature on a different device requires a manual page refresh. Add
-- the tables an open case-detail page cares about so subscribers can re-fetch
-- on UPDATE / INSERT.
--
-- Idempotent: ALTER PUBLICATION ADD TABLE errors if the table is already in
-- the publication, so we wrap each in a DO block that swallows the duplicate.

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE cases;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE case_contracts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE documents;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE schedules;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
