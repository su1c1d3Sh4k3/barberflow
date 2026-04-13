import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../_helpers";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const now = new Date().toISOString();

  const { data, error } = await db()
    .from("promotions")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .eq("active", true)
    .lte("start_date", now)
    .gte("end_date", now);

  if (error) return apiError(error.message, 500);
  return ok(data);
}
