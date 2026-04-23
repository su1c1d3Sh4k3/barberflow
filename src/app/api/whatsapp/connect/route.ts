import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "@/app/api/_helpers";
import { uazapi } from "@/lib/uazapi/client";

export async function POST(request: NextRequest) {
  const auth = validateAuth(request);
  if (isAuthError(auth)) return auth;

  const { tenantId } = auth;
  const supabase = db();

  try {
    // Check if session already exists
    const { data: existing } = await supabase
      .from("whatsapp_sessions")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    let instanceToken = "";
    let instanceId = "";

    const createFreshInstance = async () => {
      const instanceResult = await uazapi.createInstance(`tenant_${tenantId.replace(/-/g, "").slice(0, 16)}`) as {
        token: string;
        id: string;
      };
      instanceToken = instanceResult.token;
      instanceId = instanceResult.id;
      await supabase.from("whatsapp_sessions").upsert({
        tenant_id: tenantId,
        instance_id: instanceId,
        instance_token: instanceToken,
        status: "qr_pending",
        updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id" });
    };

    if (existing && existing.instance_token) {
      instanceToken = existing.instance_token;
      instanceId = existing.instance_id;
      try {
        await uazapi.getInstanceStatus(instanceToken);
      } catch {
        console.log("WhatsApp connect: existing instance invalid, creating fresh instance");
        await createFreshInstance();
      }
    } else {
      await createFreshInstance();
    }

    // Connect instance to get QR code
    const connectResult = await uazapi.connectInstance(instanceToken) as {
      qrcode?: string;
      pairingCode?: string;
    };

    // Update status to qr_pending
    await supabase
      .from("whatsapp_sessions")
      .update({ status: "qr_pending", updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId);

    return ok({
      instance_id: instanceId,
      token: instanceToken,
      qrcode: connectResult.qrcode || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao conectar WhatsApp";
    return apiError(message, 500);
  }
}
