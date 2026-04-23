import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../../_helpers";
import { phoneSuffix } from "@/lib/phone";

export async function GET(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { phone } = await params;
  const supabase = db();
  const suffix = phoneSuffix(decodeURIComponent(phone));

  // Find ALL contacts matching last 11 digits (handles duplicates from before normalization)
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id")
    .like("phone", `%${suffix}`)
    .eq("tenant_id", auth.tenantId);

  if (!contacts || contacts.length === 0) return apiError("Contact not found", 404);

  const contactIds = contacts.map((c) => c.id);

  const { data, error } = await supabase
    .from("appointments")
    .select("*, professionals(name), appointment_services(*, services(name))")
    .in("contact_id", contactIds)
    .eq("tenant_id", auth.tenantId)
    .order("start_at", { ascending: false });

  if (error) return apiError(error.message, 500);
  return ok(data);
}
