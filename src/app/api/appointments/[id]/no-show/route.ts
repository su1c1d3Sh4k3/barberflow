import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../../_helpers";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const supabase = db();

  const { data, error } = await supabase
    .from("appointments")
    .update({ status: "no_show" })
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .select()
    .single();

  if (error) return apiError(error.message, 500);

  await supabase.from("appointment_history").insert({
    appointment_id: id, action: "no_show", performed_by: body.changed_by || "system", tenant_id: auth.tenantId,
  });

  return ok(data);
}
