import { NextRequest } from "next/server";
import { ok, apiError } from "@/app/api/_helpers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getTenantFromSession } from "@/lib/supabase/api-auth";
import { uazapi } from "@/lib/uazapi/client";

export async function POST(request: NextRequest) {
  // Service-role (tests) or user session (browser)
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
    const instanceName = body.instance_name?.trim();
    if (!instanceName) return apiError("Nome da instância obrigatório", 422);

    const phone = body.phone?.trim();
    if (!phone) return apiError("Número de telefone obrigatório", 422);

    // Check if session already exists
    const { data: existing } = await supabase
      .from("whatsapp_sessions")
      .select("instance_token, instance_id, status")
      .eq("tenant_id", tenantId)
      .single();

    let instanceToken: string;
    let instanceId: string;

    if (existing?.instance_token) {
      instanceToken = existing.instance_token;
      instanceId = existing.instance_id;
    } else {
      // Create new instance in uazapi
      const result = await uazapi.createInstance(instanceName) as {
        token: string;
        instance?: { id: string };
        name?: string;
      };
      instanceToken = result.token;
      instanceId = result.instance?.id || result.name || instanceName;

      const { error: upsertError } = await supabase.from("whatsapp_sessions").upsert({
        tenant_id: tenantId,
        instance_id: instanceId,
        instance_token: instanceToken,
        status: "connecting",
        phone_number: phone,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id" });
      if (upsertError) {
        console.error("Failed to save whatsapp session:", upsertError);
        return apiError(`Erro ao salvar sessão: ${upsertError.message}`, 500);
      }
    }

    // Connect with phone to get pairing code (NOT QR)
    const connectResult = await uazapi.connectInstance(instanceToken, phone) as {
      instance?: { paircode?: string };
      paircode?: string;
    };

    const pairCode = connectResult.instance?.paircode || connectResult.paircode || null;

    await supabase
      .from("whatsapp_sessions")
      .update({ status: "connecting", phone_number: phone, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId);

    return ok({ instance_id: instanceId, pair_code: pairCode, status: "connecting" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao criar instância";
    return apiError(message, 500);
  }
}
