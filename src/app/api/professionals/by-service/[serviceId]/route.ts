import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../../_helpers";

type Ctx = { params: Promise<{ serviceId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { serviceId } = await params;
  const supabase = db();

  // Get professional IDs linked to this service
  const { data: ps, error: psErr } = await supabase
    .from("professional_services")
    .select("professional_id")
    .eq("service_id", serviceId);

  if (psErr) return apiError(psErr.message, 500);

  const professionalIds = (ps || []).map((r: { professional_id: string }) => r.professional_id);
  if (professionalIds.length === 0) return ok([]);

  const { data, error } = await supabase
    .from("professionals")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .eq("active", true)
    .in("id", professionalIds)
    .order("name");

  if (error) return apiError(error.message, 500);
  return ok(data);
}
