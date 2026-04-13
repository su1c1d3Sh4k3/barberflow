import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../../_helpers";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const supabase = db();

  const { data, error } = await supabase
    .from("appointments")
    .update({ status: "cancelado", cancelled_at: new Date().toISOString(), cancel_reason: body.reason || null })
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .select()
    .single();

  if (error) return apiError(error.message, 500);

  await supabase.from("appointment_history").insert({
    appointment_id: id, action: "canceled", performed_by: body.changed_by || "system", tenant_id: auth.tenantId,
  });

  await logAudit(auth.tenantId, null, "cancel", "appointment", id, { reason: body.reason });

  return ok(data);
}
