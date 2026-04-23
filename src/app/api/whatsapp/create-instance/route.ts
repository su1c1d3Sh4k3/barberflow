import { NextRequest } from "next/server";
import { ok, apiError, getWebhookUrl } from "@/app/api/_helpers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getTenantFromSession } from "@/lib/supabase/api-auth";
import { uazapi } from "@/lib/uazapi/client";

export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const instanceName = body.instance_name?.trim() || `bf_${Date.now()}`;
    const phone = body.phone?.trim();
    if (!phone) return apiError("Número de telefone obrigatório", 422);

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
    const result = await uazapi.createInstance(instanceName) as {
      token: string;
      instance?: { id: string };
      name?: string;
    };
    const instanceToken = result.token;
    const instanceId = result.instance?.id || result.name || instanceName;

    // === STEP 4: Save to DB ===
    await supabase.from("whatsapp_sessions").upsert({
      tenant_id: tenantId,
      instance_id: instanceId,
      instance_token: instanceToken,
      status: "connecting",
      phone_number: phone,
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id" });

    // === STEP 5: Configure webhook IMMEDIATELY (don't wait for status polling) ===
    const webhookUrl = getWebhookUrl();
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
      console.error("WhatsApp: failed to configure webhook on create", err);
    }

    // === STEP 6: Connect to get pairing code ===
    const connectResult = await uazapi.connectInstance(instanceToken, phone) as {
      instance?: { paircode?: string };
      paircode?: string;
    };
    const pairCode = connectResult.instance?.paircode || connectResult.paircode || null;

    return ok({ instance_id: instanceId, pair_code: pairCode, status: "connecting" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao criar instância";
    return apiError(message, 500);
  }
}
