-- ============================================================
-- Migration 002: Align schema with API routes and frontend code
-- ============================================================

-- ─── service_categories: add active flag + sort_order ───
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS active bool DEFAULT true;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 0;

-- ─── business_hours: add tenant_id for multi-tenant queries ───
ALTER TABLE business_hours ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;

-- ─── appointments: add source, coupon tracking, discount ───
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) DEFAULT 0;

-- ─── appointment_services: add tenant_id ───
ALTER TABLE appointment_services ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- ─── appointment_history: add convenience columns used by API ───
ALTER TABLE appointment_history ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;

-- ─── coupons: redesign to support individual coupon codes ───
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS code text UNIQUE;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'percentage';
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS discount_value numeric(10,2);
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_uses int;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS current_uses int DEFAULT 0;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS active bool DEFAULT true;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS expires_at timestamptz;
-- Make base_name optional (old schema required it)
ALTER TABLE coupons ALTER COLUMN base_name DROP NOT NULL;
ALTER TABLE coupons ALTER COLUMN discount_pct DROP NOT NULL;

-- ─── messages: add extra metadata fields ───
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text';

-- ─── waitlist: add denormalized fields for quick API inserts ───
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS client_phone text;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS notes text;
-- Make contact_id optional (API may create waitlist entry before contact exists)
ALTER TABLE waitlist ALTER COLUMN contact_id DROP NOT NULL;

-- ─── professional_services: add tenant_id ───
ALTER TABLE professional_services ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- ─── promotions table (referenced by API but doesn't exist) ───
CREATE TABLE IF NOT EXISTS promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  discount_type text DEFAULT 'percentage',
  discount_value numeric(10,2),
  active bool DEFAULT true,
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on promotions
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON promotions
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
