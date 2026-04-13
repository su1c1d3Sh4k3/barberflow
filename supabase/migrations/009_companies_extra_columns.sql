-- ============================================================
-- Migration 009: Add razao_social and cnpj to companies table
-- Fix: empresa page saves these fields but columns were missing
-- ============================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS razao_social text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS cnpj text;

-- Enable RLS on business_hours (was missing)
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON business_hours
  FOR ALL
  USING (
    company_id IN (
      SELECT id FROM companies WHERE tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    )
  );
