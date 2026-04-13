import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../../_helpers";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const { data, error } = await db()
    .from("appointments")
    .select("*, professionals(name), appointment_services(*, services(name))")
    .eq("contact_id", id)
    .eq("tenant_id", auth.tenantId)
    .order("start_at", { ascending: false });

  if (error) return apiError(error.message, 500);
  return ok(data);
}
