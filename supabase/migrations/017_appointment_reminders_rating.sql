-- ============================================================
-- Migration 017: Appointment reminders tracking + satisfaction rating
-- ============================================================

-- ─── appointments: reminder sent flags + client rating ───
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_1h_sent_at  timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS satisfaction_sent_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS rating               smallint CHECK (rating BETWEEN 1 AND 5);

-- ─── contacts: last rating received ───
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_rating    smallint;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_rating_at timestamptz;
