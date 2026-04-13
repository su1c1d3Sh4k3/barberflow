import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../../_helpers";

export async function GET(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { phone } = await params;
  const supabase = db();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("phone", decodeURIComponent(phone))
    .eq("tenant_id", auth.tenantId)
    .single();

  if (!contact) return apiError("Contact not found", 404);

  const { data, error } = await supabase
    .from("appointments")
    .select("*, professionals(name), appointment_services(*, services(name))")
    .eq("contact_id", contact.id)
    .eq("tenant_id", auth.tenantId)
    .order("start_at", { ascending: false });

  if (error) return apiError(error.message, 500);
  return ok(data);
}
