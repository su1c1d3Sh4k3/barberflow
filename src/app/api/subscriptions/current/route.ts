import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "@/app/api/_helpers";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const { data, error } = await db()
    .from("subscriptions")
    .select("*, plans(*)")
    .eq("tenant_id", auth.tenantId)
    .single();

  if (error || !data) return apiError("No subscription found", 404);
  return ok(data);
}
