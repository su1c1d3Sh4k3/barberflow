-- ============================================================
-- Migration 007: Create storage bucket for uploads
-- ============================================================

-- Create the public uploads bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads',
  'uploads',
  true,
  2097152,  -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their tenant folder
CREATE POLICY "Tenant upload" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );

-- Allow authenticated users to update/delete their tenant files
CREATE POLICY "Tenant manage own files" ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  )
  WITH CHECK (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
  );

-- Allow public read access (bucket is public)
CREATE POLICY "Public read uploads" ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'uploads');

-- Allow service role full access
CREATE POLICY "Service role full access uploads" ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'uploads')
  WITH CHECK (bucket_id = 'uploads');
