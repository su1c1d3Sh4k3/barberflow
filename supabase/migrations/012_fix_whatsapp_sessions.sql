-- Fix whatsapp_sessions: add UNIQUE on tenant_id for upsert, allow 'connecting' status
ALTER TABLE whatsapp_sessions ADD CONSTRAINT whatsapp_sessions_tenant_id_unique UNIQUE (tenant_id);
ALTER TABLE whatsapp_sessions DROP CONSTRAINT IF EXISTS whatsapp_sessions_status_check;
ALTER TABLE whatsapp_sessions ADD CONSTRAINT whatsapp_sessions_status_check
  CHECK (status IN ('connected','disconnected','qr_pending','connecting'));
