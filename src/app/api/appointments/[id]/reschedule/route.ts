import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../../_helpers";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  const body = await req.json();
  const supabase = db();

  if (!body.new_start_at) return apiError("new_start_at is required");

  // Get current appointment to recalculate end
  const { data: current } = await supabase
    .from("appointments")
    .select("*, appointment_services(service_id)")
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .single();

  if (!current) return apiError("Appointment not found", 404);

  // Calculate original duration from start/end
  const origDuration = Math.round((new Date(current.end_at).getTime() - new Date(current.start_at).getTime()) / 60000);
  const newStart = new Date(body.new_start_at);
  const newEnd = new Date(newStart.getTime() + (origDuration || 60) * 60000);

  // Check conflicts
  const { data: conflicts } = await supabase
    .from("appointments")
    .select("id")
    .eq("professional_id", body.professional_id || current.professional_id)
    .eq("tenant_id", auth.tenantId)
    .in("status", ["confirmado", "pendente"])
    .neq("id", id)
    .lt("start_at", newEnd.toISOString())
    .gt("end_at", newStart.toISOString());

  if (conflicts && conflicts.length > 0) return apiError("Time slot conflict", 409);

  const { data, error } = await supabase
    .from("appointments")
    .update({
      start_at: newStart.toISOString(),
      end_at: newEnd.toISOString(),
      professional_id: body.professional_id || current.professional_id,
      status: "reagendado",
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return apiError(error.message, 500);

  await supabase.from("appointment_history").insert({
    appointment_id: id, action: "rescheduled", performed_by: body.changed_by || "system", tenant_id: auth.tenantId,
  });

  return ok(data);
}
