-- ============================================================
-- Migration 011: Fix RLS policies - JWT tenant_id is inside app_metadata
-- The claim lives at auth.jwt() -> 'app_metadata' ->> 'tenant_id'
-- NOT at auth.jwt() ->> 'tenant_id' (which is top-level and NULL)
-- ============================================================

-- Helper: reusable expression
-- OLD: (auth.jwt() ->> 'tenant_id')::uuid
-- NEW: (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid

-- ─── tenants (special: uses id, not tenant_id) ───
DROP POLICY IF EXISTS tenant_self ON tenants;
CREATE POLICY tenant_self ON tenants
  FOR ALL
  USING (id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- ─── Standard tenant_id tables ───
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'users', 'companies', 'professionals', 'services',
      'service_categories', 'contacts', 'appointments',
      'appointment_history', 'messages', 'coupons', 'followups',
      'settings', 'whatsapp_sessions', 'conversation_states',
      'subscriptions', 'waitlist', 'audit_logs', 'promotions'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL
       USING (tenant_id = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id'')::uuid)
       WITH CHECK (tenant_id = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id'')::uuid)',
      tbl
    );
  END LOOP;
END $$;

-- ─── business_hours (uses company_id relationship) ───
DROP POLICY IF EXISTS tenant_isolation ON business_hours;
CREATE POLICY tenant_isolation ON business_hours
  FOR ALL
  USING (
    company_id IN (
      SELECT id FROM companies
      WHERE tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies
      WHERE tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    )
  );

-- ─── Storage bucket policies ───
DO $$
BEGIN
  -- Drop and recreate storage policies
  DROP POLICY IF EXISTS "tenant_upload" ON storage.objects;
  DROP POLICY IF EXISTS "tenant_read" ON storage.objects;
  DROP POLICY IF EXISTS "tenant_delete" ON storage.objects;

  CREATE POLICY "tenant_upload" ON storage.objects
    FOR INSERT WITH CHECK (
      bucket_id = 'uploads'
      AND (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    );

  CREATE POLICY "tenant_read" ON storage.objects
    FOR SELECT USING (
      bucket_id = 'uploads'
      AND (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    );

  CREATE POLICY "tenant_delete" ON storage.objects
    FOR DELETE USING (
      bucket_id = 'uploads'
      AND (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    );
EXCEPTION WHEN undefined_table THEN
  -- storage.objects may not exist if storage is not configured
  NULL;
END $$;
