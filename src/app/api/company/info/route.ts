import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../_helpers";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const { data, error } = await db()
    .from("tenants")
    .select("*")
    .eq("id", auth.tenantId)
    .single();

  if (error) return apiError("Company not found", 404);
  return ok(data);
}
