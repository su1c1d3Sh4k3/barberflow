import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../_helpers";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const { data, error } = await db()
    .from("appointments")
    .select("*, contacts(name, phone), professionals(name), appointment_services(*, services(name))")
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .single();

  if (error) return apiError("Appointment not found", 404);
  return ok(data);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  const body = await req.json();
  const supabase = db();

  // Only allow updating specific fields
  const allowedFields = ["start_at", "end_at", "professional_id", "notes", "status"];
  const updateData: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updateData[key] = body[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return apiError("No valid fields to update");
  }

  // Verify appointment exists
  const { data: existing } = await supabase
    .from("appointments")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .single();

  if (!existing) return apiError("Appointment not found", 404);

  const { data, error } = await supabase
    .from("appointments")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .select()
    .single();

  if (error) return apiError(error.message, 500);

  // Log to appointment_history
  await supabase.from("appointment_history").insert({
    appointment_id: id,
    action: "updated",
    performed_by: body.changed_by || "system",
    tenant_id: auth.tenantId,
    reason: JSON.stringify(updateData),
  });

  return ok(data);
}
