import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../_helpers";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const p = req.nextUrl.searchParams;

  const professionalId = p.get("professional_id");
  const serviceId = p.get("service_id");
  const date = p.get("date");
  const dateFrom = p.get("date_from");
  // dateTo reserved for future date-range queries
  void p.get("date_to");

  if (!professionalId || !serviceId) {
    return apiError("professional_id and service_id are required");
  }
  if (!date && !dateFrom) {
    return apiError("date or date_from is required");
  }

  const { data, error } = await db().rpc("get_available_slots", {
    p_tenant_id: auth.tenantId,
    p_professional_id: professionalId,
    p_service_id: serviceId,
    p_date: date || dateFrom,
  });

  if (error) return apiError(error.message, 500);
  return ok(data);
}
