import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../_helpers";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const p = req.nextUrl.searchParams;

  const professionalId = p.get("professional_id");
  const serviceId = p.get("service_id");
  const dateTime = p.get("date_time");

  if (!professionalId || !serviceId || !dateTime) {
    return apiError("professional_id, service_id, and date_time are required");
  }

  // Get service duration
  const { data: service } = await db()
    .from("services")
    .select("duration_min")
    .eq("id", serviceId)
    .single();

  if (!service) return apiError("Service not found", 404);

  const startAt = new Date(dateTime);
  const endAt = new Date(startAt.getTime() + service.duration_min * 60000);

  // Check for conflicts
  const { data: conflicts } = await db()
    .from("appointments")
    .select("id")
    .eq("professional_id", professionalId)
    .eq("tenant_id", auth.tenantId)
    .in("status", ["confirmado", "pendente"])
    .lt("start_at", endAt.toISOString())
    .gt("end_at", startAt.toISOString());

  const available = !conflicts || conflicts.length === 0;
  return ok({ available, conflicts_count: conflicts?.length || 0 });
}
