import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../_helpers";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const p = req.nextUrl.searchParams;

  const professionalId = p.get("professional_id");
  const serviceId = p.get("service_id");

  if (!professionalId || !serviceId) {
    return apiError("professional_id and service_id are required");
  }

  // Try today first, then each day up to a week out
  let firstSlot = null;
  for (let i = 0; i < 7 && !firstSlot; i++) {
    const d = new Date(Date.now() + i * 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const { data, error: slotErr } = await db().rpc("get_available_slots", {
      p_tenant_id: auth.tenantId,
      p_professional_id: professionalId,
      p_service_id: serviceId,
      p_date: d,
    });
    if (!slotErr && Array.isArray(data) && data.length > 0) {
      firstSlot = data[0];
    }
  }

  return ok({ next_available: firstSlot });
}
