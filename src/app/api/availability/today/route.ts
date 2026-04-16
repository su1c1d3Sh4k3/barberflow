import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../_helpers";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const p = req.nextUrl.searchParams;

  const serviceId = p.get("service_id");
  const professionalId = p.get("professional_id");

  if (!serviceId) {
    return apiError("service_id is required");
  }

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD em BRT

  if (professionalId) {
    // Return slots for a specific professional
    const { data, error } = await db().rpc("get_available_slots", {
      p_tenant_id: auth.tenantId,
      p_professional_id: professionalId,
      p_service_id: serviceId,
      p_date: today,
    });

    if (error) return apiError(error.message, 500);
    return ok(data);
  }

  // If no professional specified, get all active professionals and their slots
  const supabase = db();
  const { data: professionals } = await supabase
    .from("professionals")
    .select("id, name")
    .eq("tenant_id", auth.tenantId)
    .eq("active", true);

  if (!professionals || professionals.length === 0) return ok([]);

  const results = [];
  for (const prof of professionals) {
    const { data: slots } = await supabase.rpc("get_available_slots", {
      p_tenant_id: auth.tenantId,
      p_professional_id: prof.id,
      p_service_id: serviceId,
      p_date: today,
    });
    if (slots && slots.length > 0) {
      results.push({
        professional_id: prof.id,
        professional_name: prof.name,
        slots,
      });
    }
  }

  return ok(results);
}
