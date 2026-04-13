-- ============================================================
-- Migration 004: Complete RLS Policies (USING + WITH CHECK)
-- ============================================================

-- Drop existing incomplete policies
DROP POLICY IF EXISTS tenant_isolation ON users;
DROP POLICY IF EXISTS tenant_isolation ON companies;
DROP POLICY IF EXISTS tenant_isolation ON professionals;
DROP POLICY IF EXISTS tenant_isolation ON services;
DROP POLICY IF EXISTS tenant_isolation ON service_categories;
DROP POLICY IF EXISTS tenant_isolation ON contacts;
DROP POLICY IF EXISTS tenant_isolation ON appointments;
DROP POLICY IF EXISTS tenant_isolation ON messages;
DROP POLICY IF EXISTS tenant_isolation ON whatsapp_sessions;
DROP POLICY IF EXISTS tenant_isolation ON settings;
DROP POLICY IF EXISTS tenant_isolation ON followups;
DROP POLICY IF EXISTS tenant_isolation ON coupons;
DROP POLICY IF EXISTS tenant_isolation ON subscriptions;
DROP POLICY IF EXISTS tenant_isolation ON promotions;

-- ─── Tenants: user can only access own tenant ───
CREATE POLICY tenant_self ON tenants
  FOR ALL
  USING (id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ─── Standard tenant-scoped tables ───
CREATE POLICY tenant_isolation ON users
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON companies
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON professionals
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON services
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON service_categories
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON contacts
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON appointments
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON messages
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON whatsapp_sessions
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON settings
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON followups
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON coupons
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON subscriptions
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON promotions
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ─── Enable RLS on tables that were missing it ───
ALTER TABLE appointment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON appointment_history
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON conversation_states
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON waitlist
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON audit_logs
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
