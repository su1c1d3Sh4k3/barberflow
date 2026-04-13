-- ============================================================
-- Migration 003: Add extra columns for appointment lifecycle
-- ============================================================

-- ─── appointments: lifecycle timestamps ───
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancel_reason text;

-- ─── waitlist: add extra fields for API ───
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS preferred_date date;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS preferred_time_from time;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS preferred_time_to time;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS status text DEFAULT 'waiting';
