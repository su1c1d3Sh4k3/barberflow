-- Service combos: a parent service can reference multiple child services
CREATE TABLE IF NOT EXISTS service_combos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_service_id uuid REFERENCES services(id) ON DELETE CASCADE,
  child_service_id uuid REFERENCES services(id) ON DELETE CASCADE,
  UNIQUE(parent_service_id, child_service_id)
);

-- RLS
ALTER TABLE service_combos ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (no tenant_id on this junction table)
DO $$ BEGIN
  CREATE POLICY service_role_all ON service_combos
    FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add is_combo flag to services for quick filtering
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_combo bool DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS combo_discount_pct numeric(5,2) DEFAULT 0;
