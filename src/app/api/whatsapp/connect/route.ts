import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "@/app/api/_helpers";
import { uazapi } from "@/lib/uazapi/client";

export async function POST(request: NextRequest) {
  const auth = validateAuth(request);
  if (isAuthError(auth)) return auth;

  const { tenantId } = auth;
  const supabase = db();

  try {
    // === STEP 1: Destroy any existing instance ===
    const { data: existing } = await supabase
      .from("whatsapp_sessions")
      .select("instance_token")
      .eq("tenant_id", tenantId)
      .single();

    if (existing?.instance_token) {
      try { await uazapi.disconnectInstance(existing.instance_token); } catch { /* ok */ }
      try { await uazapi.deleteInstance(existing.instance_token); } catch { /* ok */ }
    }

    // === STEP 2: Clear DB ===
    await supabase
      .from("whatsapp_sessions")
      .update({
        instance_token: null,
        instance_id: null,
        phone_number: null,
        status: "disconnected",
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId);

    // === STEP 3: Create fresh instance ===
    const instanceName = `bf_${tenantId.replace(/-/g, "").slice(0, 8)}_${Date.now()}`;
    const instanceResult = await uazapi.createInstance(instanceName) as {
      token: string;
      instance?: { id: string };
      name?: string;
    };
    const instanceToken = instanceResult.token;
    const instanceId = instanceResult.instance?.id || instanceResult.name || instanceName;

    // === STEP 4: Save to DB ===
    await supabase.from("whatsapp_sessions").upsert({
      tenant_id: tenantId,
      instance_id: instanceId,
      instance_token: instanceToken,
      status: "qr_pending",
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id" });

    // === STEP 5: Configure webhook IMMEDIATELY ===
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "https://clinvia-barber.d69qzb.easypanel.host";
    const webhookToken = process.env.WHATSAPP_WEBHOOK_TOKEN;
    const webhookUrl = webhookToken
      ? `${appUrl}/api/webhooks/whatsapp?token=${webhookToken}`
      : `${appUrl}/api/webhooks/whatsapp`;

    try {
      await uazapi.setWebhook(instanceToken, {
        url: webhookUrl,
        events: ["messages", "messages_update", "connection"],
        enabled: true,
        addUrlEvents: false,
        addUrlTypesMessages: false,
        excludeMessages: ["fromMe"],
      });
    } catch (err) {
      console.error("WhatsApp: failed to configure webhook on connect", err);
    }

    // === STEP 6: Connect to get QR code ===
    const connectResult = await uazapi.connectInstance(instanceToken) as {
      qrcode?: string;
      pairingCode?: string;
    };

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
