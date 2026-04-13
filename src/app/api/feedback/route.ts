import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "@/app/api/_helpers";

export async function POST(request: NextRequest) {
  const auth = validateAuth(request);
  if (isAuthError(auth)) return auth;

  const { tenantId } = auth;
  const supabase = db();

  try {
    const { appointment_id, rating, comment } = await request.json();

    if (!appointment_id || !rating || rating < 1 || rating > 5) {
      return apiError("appointment_id and rating (1-5) are required", 400);
    }

    const { error } = await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      action: "feedback",
      entity: "appointments",
      entity_id: appointment_id,
      metadata: { rating, comment: comment || null },
      created_at: new Date().toISOString(),
    });

    if (error) return apiError(error.message, 500);

    return ok({ message: "Feedback registrado com sucesso" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao registrar feedback";
    return apiError(message, 500);
  }
}
