-- Fix get_available_slots to use Brazil timezone (America/Sao_Paulo)
-- Problem: schedule times (e.g. 09:00-18:00) were being cast to timestamptz as UTC,
-- but the barbershop operates in BRT (UTC-3). This caused all "today" slots to appear
-- in the past when queried after ~06:00 UTC (09:00 BRT).

CREATE OR REPLACE FUNCTION get_available_slots(
  p_tenant_id uuid,
  p_professional_id uuid,
  p_service_id uuid,
  p_date date
) RETURNS TABLE(slot_start timestamptz, slot_end timestamptz)
LANGUAGE plpgsql
AS $$
DECLARE
  v_duration int;
  v_step int := 10;
  v_tz text := 'America/Sao_Paulo';
BEGIN
  SELECT duration_min INTO v_duration FROM services WHERE id = p_service_id;

  RETURN QUERY
  WITH schedule AS (
    SELECT start_time, end_time, break_start, break_end
    FROM professional_schedules
    WHERE professional_id = p_professional_id
      AND weekday = EXTRACT(DOW FROM p_date)
  ),
  candidate_slots AS (
    SELECT generate_series(
      -- Interpret schedule times as BRT (not UTC)
      (p_date::text || ' ' || (SELECT start_time FROM schedule)::text)::timestamp AT TIME ZONE v_tz,
      (p_date::text || ' ' || (SELECT end_time FROM schedule)::text)::timestamp AT TIME ZONE v_tz
        - (v_duration || ' minutes')::interval,
      (v_step || ' minutes')::interval
    ) AS slot_start
  ),
  busy AS (
    SELECT start_at, end_at FROM appointments
    WHERE professional_id = p_professional_id
      AND tenant_id = p_tenant_id
      AND status IN ('pendente','confirmado')
      AND start_at::date = p_date
    UNION ALL
    SELECT start_at, end_at FROM professional_blocks
    WHERE professional_id = p_professional_id
      AND start_at::date <= p_date AND end_at::date >= p_date
    UNION ALL
    SELECT
      (p_date::text || ' ' || (SELECT break_start FROM schedule)::text)::timestamp AT TIME ZONE v_tz,
      (p_date::text || ' ' || (SELECT break_end FROM schedule)::text)::timestamp AT TIME ZONE v_tz
    FROM schedule WHERE break_start IS NOT NULL
  )
  SELECT cs.slot_start, cs.slot_start + (v_duration || ' minutes')::interval AS slot_end
  FROM candidate_slots cs
  WHERE NOT EXISTS (
    SELECT 1 FROM busy b
    WHERE tstzrange(cs.slot_start, cs.slot_start + (v_duration || ' minutes')::interval, '[)')
       && tstzrange(b.start_at, b.end_at, '[)')
  )
  AND cs.slot_start > now();
END;
$$;
