import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getTenantFromSession } from "@/lib/supabase/api-auth";
import { uazapi } from "@/lib/uazapi/client";

/**
 * GET /api/whatsapp/webhook-info
 * Returns the webhook URL currently registered in uazapi for this tenant's instance.
 */
export async function GET(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const authHeader = request.headers.get("authorization") || "";
  let tenantId: string | null = null;

  if (serviceKey && authHeader.includes(serviceKey)) {
    tenantId = request.headers.get("x-tenant-id");
  } else {
    tenantId = await getTenantFromSession(request);
  }

  if (!tenantId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data: session } = await supabase
    .from("whatsapp_sessions")
    .select("instance_token, instance_id, status, webhook_status")
    .eq("tenant_id", tenantId)
    .single();

  if (!session?.instance_token) {
    return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
  }

  const { getWebhookUrl } = await import("@/app/api/_helpers");
  const expectedWebhookUrl = getWebhookUrl();

  // Fetch actual webhook config from uazapi
  let uazapiWebhook: unknown = null;
  let uazapiError: string | null = null;
  try {
    uazapiWebhook = await uazapi.getWebhook(session.instance_token);
  } catch (err) {
    uazapiError = String(err);
  }

  return NextResponse.json({
    session: {
      instance_id: session.instance_id,
      status: session.status,
      last_webhook_status: session.webhook_status,
    },
    expected_webhook_url: expectedWebhookUrl,
    uazapi_registered_webhook: uazapiWebhook,
    uazapi_error: uazapiError,
  });
}
