import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../../_helpers";

export async function GET(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { phone } = await params;

  const { data, error } = await db()
    .from("contacts")
    .select("*")
    .eq("phone", decodeURIComponent(phone))
    .eq("tenant_id", auth.tenantId)
    .single();

  if (error) return apiError("Contact not found", 404);
  return ok(data);
}
