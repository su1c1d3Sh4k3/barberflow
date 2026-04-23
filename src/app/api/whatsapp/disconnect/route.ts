import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "@/app/api/_helpers";
import { uazapi } from "@/lib/uazapi/client";

export async function POST(request: NextRequest) {
  const auth = validateAuth(request);
  if (isAuthError(auth)) return auth;

  const { tenantId } = auth;
  const supabase = db();

  try {
    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (!session || !session.instance_token) {
      return ok({ status: "disconnected" });
    }

    const token = session.instance_token;

    // 1. Graceful logout (ignore errors — may already be disconnected)
    try {
      await uazapi.disconnectInstance(token);
    } catch { /* already disconnected */ }

    // 2. Delete instance from uazapi server completely
    try {
      await uazapi.deleteInstance(token);
    } catch { /* instance may not exist anymore */ }

    // 3. Clear instance data from DB so next connect creates a fresh instance
    await supabase
      .from("whatsapp_sessions")
      .update({
        status: "disconnected",
        instance_token: null,
        instance_id: null,
        phone_number: null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId);

    return ok({ status: "disconnected" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao desconectar";
    return apiError(message, 500);
  }
}
