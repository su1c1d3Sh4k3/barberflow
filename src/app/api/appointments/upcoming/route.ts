import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../_helpers";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const p = req.nextUrl.searchParams;
  const limit = parseInt(p.get("limit") || "20");

  const { data, error } = await db()
    .from("appointments")
    .select("*, contacts(name, phone), professionals(name), appointment_services(*, services(name))")
    .eq("tenant_id", auth.tenantId)
    .in("status", ["pendente", "confirmado"])
    .gt("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(limit);

  if (error) return apiError(error.message, 500);
  return ok(data);
}
