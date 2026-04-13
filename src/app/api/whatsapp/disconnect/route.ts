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

    // Disconnect via uazapi
    try {
      await uazapi.disconnectInstance(session.instance_token);
    } catch {
      // Instance may already be disconnected — continue
    }

    // Update DB status
    await supabase
      .from("whatsapp_sessions")
      .update({
        status: "disconnected",
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId);

    return ok({ status: "disconnected" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao desconectar";
    return apiError(message, 500);
  }
}
