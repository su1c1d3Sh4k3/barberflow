import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../_helpers";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  // Use BRT date to avoid wrong weekday near midnight UTC (BRT = UTC-3)
  const todayBRT = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const dayOfWeek = new Date(todayBRT + "T12:00:00").getDay(); // 0=Sun, 6=Sat

  const { data, error } = await db()
    .from("business_hours")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .eq("weekday", dayOfWeek)
    .limit(1)
    .maybeSingle();

  if (error) return apiError("No business hours configured for today", 404);
  return ok(data);
}
