import { NextRequest } from "next/server";
import { ok, apiError } from "@/app/api/_helpers";
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
    const statusResult = await uazapi.getInstanceStatus(session.instance_token) as {
      instance?: { status?: string };
      status?: { connected?: boolean; loggedIn?: boolean; jid?: { user?: string } };
    };

    const isConnected = statusResult.status?.connected && statusResult.status?.loggedIn;
    const liveStatus = isConnected ? "connected" : (statusResult.instance?.status?.toLowerCase() || "disconnected");
    const phone = statusResult.status?.jid?.user || session.phone_number || null;

    // If just became connected, auto-configure webhook
    if (liveStatus === "connected" && session.status !== "connected") {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (!appUrl) {
        console.error("WhatsApp webhook config FAILED: NEXT_PUBLIC_APP_URL is not set. Messages will NOT be received.");
      } else {
        const webhookUrl = `${appUrl}/api/webhooks/whatsapp`;
        console.log(`WhatsApp: configuring webhook to ${webhookUrl}`);
        try {
          await uazapi.setWebhook(session.instance_token, {
            url: webhookUrl,
            events: ["messages", "messages_update", "connection"],
            enabled: true,
            addUrlEvents: false,
            addUrlTypesMessages: false,
            excludeMessages: ["fromMe"],
          });
          console.log("WhatsApp: webhook configured successfully");
        } catch (err) {
          console.error("WhatsApp: failed to configure webhook", err);
        }
      }

      await supabase
        .from("whatsapp_sessions")
        .update({ status: "connected", phone_number: phone, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId);
    }

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
