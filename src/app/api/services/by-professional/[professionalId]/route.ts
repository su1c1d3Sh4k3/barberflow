import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../../_helpers";

type Ctx = { params: Promise<{ professionalId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { professionalId } = await params;
  const supabase = db();

  // Get service IDs linked to this professional
  const { data: ps, error: psErr } = await supabase
    .from("professional_services")
    .select("service_id")
    .eq("professional_id", professionalId);

  if (psErr) return apiError(psErr.message, 500);

  const serviceIds = (ps || []).map((r: { service_id: string }) => r.service_id);
  if (serviceIds.length === 0) return ok([]);

  const { data, error } = await supabase
    .from("services")
    .select("*, service_categories(name)")
    .eq("tenant_id", auth.tenantId)
    .eq("active", true)
    .in("id", serviceIds)
    .order("name");

  if (error) return apiError(error.message, 500);
  return ok(data);
}
