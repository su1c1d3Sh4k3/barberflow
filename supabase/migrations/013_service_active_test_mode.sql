-- ============================================================
-- 013_service_active_test_mode.sql
-- Adds service_active to whatsapp_sessions (controls whether
-- the bot/IA processes incoming webhooks) and test_mode /
-- test_numbers to settings (restricts bot/IA to a whitelist
-- of phone numbers when enabled).
-- ============================================================

-- 1. whatsapp_sessions.service_active
--    Default false: service must be explicitly activated after
--    a valid WhatsApp connection is established.
ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS service_active BOOL NOT NULL DEFAULT false;

-- 2. settings.test_mode
--    When true, bot and IA only respond to numbers in test_numbers.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS test_mode BOOL NOT NULL DEFAULT false;

-- 3. settings.test_numbers
--    Whitelist of phone numbers (any format) allowed when test_mode=true.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS test_numbers TEXT[] NOT NULL DEFAULT '{}';

-- Ensure that when a whatsapp_session becomes disconnected or
-- qr_pending, service_active is reset to false automatically.
CREATE OR REPLACE FUNCTION reset_service_active_on_disconnect()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('disconnected', 'qr_pending', 'connecting') THEN
    NEW.service_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_service_active ON whatsapp_sessions;
CREATE TRIGGER trg_reset_service_active
  BEFORE UPDATE OF status ON whatsapp_sessions
  FOR EACH ROW
  EXECUTE FUNCTION reset_service_active_on_disconnect();
