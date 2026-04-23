import { NextRequest } from "next/server";
import { ok, apiError, getWebhookUrl } from "@/app/api/_helpers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getTenantFromSession } from "@/lib/supabase/api-auth";
import { uazapi } from "@/lib/uazapi/client";

export async function GET(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const authHeader = request.headers.get("authorization") || "";
  const isServiceRole = authHeader.includes(serviceKey);

  let tenantId: string | null = null;
  if (isServiceRole) {
    tenantId = request.headers.get("x-tenant-id");
  } else {
    tenantId = await getTenantFromSession(request);
  }

  if (!tenantId) return apiError("Não autenticado", 401);

  const supabase = createServiceRoleClient();

  try {
    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (!session || !session.instance_token) {
      return ok({ status: "disconnected", phone_number: null });
    }

    // Get live status from uazapi
    // Real uazapi response: { instance: { status: "connected"|"disconnected", owner, ... },
    //                         status: { connected: bool, loggedIn: bool, jid: "phone@s.whatsapp.net" } }
    const statusResult = await uazapi.getInstanceStatus(session.instance_token) as {
      instance?: { status?: string; owner?: string };
      status?: { connected?: boolean; loggedIn?: boolean; jid?: string };
    };

    // Primary check: status.connected + status.loggedIn (most reliable)
    // Fallback: instance.status string
    const isConnected = !!(statusResult.status?.connected && statusResult.status?.loggedIn);
    const instanceStatus = statusResult.instance?.status?.toLowerCase() || "";
    const liveStatus = isConnected
      ? "connected"
      : (instanceStatus === "connecting" ? "qr_pending" : "disconnected");

    // Phone: jid is "5511999990000:xx@s.whatsapp.net" or "5511999990000@s.whatsapp.net"
    const rawJid = statusResult.status?.jid || "";
    const phone = rawJid.replace(/:.*$/, "").replace(/@.*$/, "") || session.phone_number || null;

    // Auto-configure webhook when transitioning to connected.
    // Allowed from: qr_pending (QR flow), connecting (pairing code flow).
    // Never from "disconnected" — that would undo an explicit disconnect.
    const pendingStates = ["qr_pending", "connecting"];
    if (liveStatus === "connected" && pendingStates.includes(session.status)) {
      const webhookUrl = getWebhookUrl();
      console.log(`WhatsApp: connected — configuring webhook to ${webhookUrl}`);
      try {
        await uazapi.setWebhook(session.instance_token, {
          url: webhookUrl,
          events: ["messages", "messages_update", "connection"],
          enabled: true,
          addUrlEvents: false,
          addUrlTypesMessages: false,
          excludeMessages: ["fromMe"],
        });
      } catch (err) {
        console.error("WhatsApp: failed to configure webhook", err);
      }

      await supabase
        .from("whatsapp_sessions")
        .update({ status: "connected", phone_number: phone, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId);
    }

    // Update DB when connection drops (uazapi says disconnected but DB still says connected)
    if (liveStatus === "disconnected" && session.status === "connected") {
      await supabase
        .from("whatsapp_sessions")
        .update({ status: "disconnected", updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId);
    }

    return ok({ status: liveStatus, phone_number: phone });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao verificar status";
    return apiError(message, 500);
  }
}
