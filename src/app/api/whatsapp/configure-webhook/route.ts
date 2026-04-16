import { NextRequest } from "next/server";
import { ok, apiError } from "@/app/api/_helpers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getTenantFromSession } from "@/lib/supabase/api-auth";
import { uazapi } from "@/lib/uazapi/client";

/**
 * POST /api/whatsapp/configure-webhook
 * Configures the uazapi webhook for a connected WhatsApp instance.
 */
export async function POST(request: NextRequest) {
  // Accept service-role internal calls OR browser session auth
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const authHeader = request.headers.get("authorization") || "";
  let tenantId: string | null = null;

  if (serviceKey && authHeader.includes(serviceKey)) {
    tenantId = request.headers.get("x-tenant-id");
  } else {
    tenantId = await getTenantFromSession(request);
  }

  if (!tenantId) return apiError("Não autenticado", 401);

  const supabase = createServiceRoleClient();

  let body: { instance_id?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.instance_id || typeof body.instance_id !== "string") {
    return apiError("instance_id is required", 400);
  }

  try {
    // Fetch session to get the instance token
    const { data: session, error: sessionError } = await supabase
      .from("whatsapp_sessions")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (sessionError || !session) {
      return apiError("WhatsApp session not found", 404);
    }

    if (!session.instance_token) {
      return apiError("Instance token not available", 400);
    }

    // Derive the base URL: prefer explicit env var, fall back to request host
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
      `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("host")}`;
    const webhookUrl = `${appUrl}/api/webhooks/whatsapp`;

    // Call uazapi to configure the webhook
    await uazapi.setWebhook(session.instance_token, {
      url: webhookUrl,
      events: ["messages", "messages_update", "connection"],
      enabled: true,
      addUrlEvents: false,
      addUrlTypesMessages: false,
      excludeMessages: ["fromMe"],
    });

    // Update whatsapp_sessions with webhook_configured_at timestamp
    const { error: updateError } = await supabase
      .from("whatsapp_sessions")
      .update({
        webhook_configured_at: new Date().toISOString(),
        webhook_status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId);

    if (updateError) {
      return apiError("Failed to update session: " + updateError.message, 500);
    }

    return ok({ configured: true, webhook_url: webhookUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to configure webhook";
    return apiError(message, 500);
  }
}
