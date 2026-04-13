-- ============================================================
-- Migration 005: JWT Custom Claims (tenant_id in app_metadata)
-- ============================================================

-- Function to set tenant_id claim on auth.users
CREATE OR REPLACE FUNCTION public.set_tenant_claim(p_user_id uuid, p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data =
    COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('tenant_id', p_tenant_id::text)
  WHERE id = p_user_id;
END;
$$;

-- Trigger function: auto-sync tenant_id to JWT when user is created/updated
CREATE OR REPLACE FUNCTION public.sync_tenant_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN
    PERFORM public.set_tenant_claim(NEW.id, NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on public.users
DROP TRIGGER IF EXISTS trg_sync_tenant_claim ON public.users;
CREATE TRIGGER trg_sync_tenant_claim
  AFTER INSERT OR UPDATE OF tenant_id ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_tenant_claim();

-- Backfill existing users (set tenant_id in JWT metadata)
DO $$
BEGIN
  UPDATE auth.users au
  SET raw_app_meta_data =
    COALESCE(au.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('tenant_id', u.tenant_id::text)
  FROM public.users u
  WHERE au.id = u.id AND u.tenant_id IS NOT NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Backfill skipped (no existing users or auth.users not accessible): %', SQLERRM;
END;
$$;
