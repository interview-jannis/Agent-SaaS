-- Passport image upload
-- Run in Supabase SQL editor

ALTER TABLE clients ADD COLUMN IF NOT EXISTS passport_image_url TEXT;

-- Storage bucket: client-passports
-- Create manually in Supabase dashboard → Storage → New bucket
--   Name: client-passports
--   Public: true
-- Then add these storage policies:

-- Allow anyone to upload (intake form is public)
-- INSERT policy on storage.objects WHERE bucket_id = 'client-passports'
-- Allow anyone to read
-- SELECT policy on storage.objects WHERE bucket_id = 'client-passports'
