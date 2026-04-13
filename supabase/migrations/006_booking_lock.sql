-- ============================================================
-- Migration 006: Atomic Booking with Advisory Lock
-- ============================================================

CREATE OR REPLACE FUNCTION create_appointment_locked(
  p_tenant_id uuid,
  p_company_id uuid,
  p_contact_id uuid,
  p_professional_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_total_price numeric DEFAULT 0,
  p_discount_amount numeric DEFAULT 0,
  p_coupon_code text DEFAULT NULL,
  p_source text DEFAULT 'api',
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_conflict_count int;
  v_appointment_id uuid;
  v_lock_key bigint;
  v_result jsonb;
BEGIN
  -- Deterministic lock key: professional + date (avoids global contention)
  v_lock_key := hashtext(p_professional_id::text || p_start_at::date::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Check conflicts under the lock
  SELECT count(*) INTO v_conflict_count
  FROM appointments
  WHERE professional_id = p_professional_id
    AND tenant_id = p_tenant_id
    AND status IN ('pendente', 'confirmado')
    AND start_at < p_end_at
    AND end_at > p_start_at;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'SLOT_CONFLICT'
      USING ERRCODE = 'P0001',
            HINT = 'The requested time slot conflicts with an existing appointment';
  END IF;

  -- Insert appointment atomically
  INSERT INTO appointments (
    tenant_id, company_id, contact_id, professional_id,
    start_at, end_at, total_price, discount_amount,
    coupon_code, status, source, notes
  ) VALUES (
    p_tenant_id, p_company_id, p_contact_id, p_professional_id,
    p_start_at, p_end_at, p_total_price, p_discount_amount,
    p_coupon_code, 'pendente', p_source, p_notes
  )
  RETURNING id INTO v_appointment_id;

  -- Return as JSON so Supabase client can parse
  SELECT jsonb_build_object(
    'id', a.id,
    'tenant_id', a.tenant_id,
    'company_id', a.company_id,
    'contact_id', a.contact_id,
    'professional_id', a.professional_id,
    'start_at', a.start_at,
    'end_at', a.end_at,
    'total_price', a.total_price,
    'status', a.status,
    'source', a.source,
    'created_at', a.created_at
  ) INTO v_result
  FROM appointments a WHERE a.id = v_appointment_id;

  RETURN v_result;
END;
$$;
