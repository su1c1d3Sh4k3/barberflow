import { NextRequest } from "next/server";
import { ok, apiError } from "@/app/api/_helpers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getTenantFromSession } from "@/lib/supabase/api-auth";
import { uazapi } from "@/lib/uazapi/client";

export async function POST(request: NextRequest) {
  // Support both service-role (tests) and user session (browser)
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
    // Get WhatsApp session token
    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("instance_token, status")
      .eq("tenant_id", tenantId)
      .single();

    if (!session?.instance_token) {
      return apiError("WhatsApp não conectado. Conecte primeiro na página WhatsApp.", 400);
    }

    if (session.status !== "connected") {
      return apiError("WhatsApp não está conectado. Verifique a conexão.", 400);
    }

    // Fetch contacts from uazapi
    const result = await uazapi.getContacts(session.instance_token) as Array<{
      id?: string;
      name?: string;
      pushName?: string;
      notify?: string;
      short?: string;
      phone?: string;
    }>;

    if (!Array.isArray(result) || result.length === 0) {
      return ok({ imported: 0, total: 0, message: "Nenhum contato encontrado no WhatsApp." });
    }

    // Filter valid contacts (only individual chats, not groups)
    const validContacts = result.filter((c) => {
      const id = c.id || "";
      // Skip groups (@g.us) and broadcast lists
      return id.includes("@s.whatsapp.net") || (!id.includes("@") && c.phone);
    });

    let imported = 0;
    let skipped = 0;

    for (const contact of validContacts) {
      // Extract phone number
      let phone = contact.phone || (contact.id || "").split("@")[0];
      if (!phone || phone.length < 10) { skipped++; continue; }

      // Ensure country code
      if (!phone.startsWith("55") && phone.length <= 11) {
        phone = `55${phone}`;
      }

      // Get best name available
      const name = contact.pushName || contact.name || contact.notify || contact.short || phone;

      // Upsert — don't overwrite existing contacts, just add new ones
      const { error } = await supabase
        .from("contacts")
        .upsert(
          { tenant_id: tenantId, phone, name, status: "respondido" },
          { onConflict: "tenant_id,phone", ignoreDuplicates: true }
        );

      if (!error) imported++;
      else skipped++;
    }

    return ok({
      imported,
      skipped,
      total: validContacts.length,
      message: `${imported} contatos importados, ${skipped} já existiam ou foram ignorados.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao importar contatos";
    return apiError(message, 500);
  }
}
