-- 2026-05-08: Agent business registration
-- (1) Add business_info JSONB column to agents
-- (2) Create agent-docs storage bucket for registration documents

-- 1. Column
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS business_info jsonb DEFAULT null;

-- 2. Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('agent-docs', 'agent-docs', true)
ON CONFLICT DO NOTHING;

-- 3. Storage policies (bucket is public read, authenticated write)
DO $$
BEGIN
  -- SELECT (public read)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'agent-docs public read'
  ) THEN
    CREATE POLICY "agent-docs public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'agent-docs');
  END IF;

  -- INSERT (authenticated only)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'agent-docs authenticated insert'
  ) THEN
    CREATE POLICY "agent-docs authenticated insert"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'agent-docs' AND auth.role() = 'authenticated');
  END IF;

  -- UPDATE (authenticated only)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'agent-docs authenticated update'
  ) THEN
    CREATE POLICY "agent-docs authenticated update"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'agent-docs' AND auth.role() = 'authenticated');
  END IF;
END $$;
