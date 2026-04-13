ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
