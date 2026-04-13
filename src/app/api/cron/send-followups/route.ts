import { NextRequest } from "next/server";
import { ok, apiError, db } from "@/app/api/_helpers";
import { uazapi } from "@/lib/uazapi/client";

function validateCron(request: NextRequest): boolean {
  const secret = request.headers.get("x-cron-secret");
  return secret === process.env.CRON_SECRET;
}

export async function POST(request: NextRequest) {
  if (!validateCron(request)) return apiError("Unauthorized", 401);

  const supabase = db();
  let sentCount = 0;

  try {
    const { data: followups } = await supabase
      .from("followups")
      .select("*, settings!inner(tenant_id)")
      .eq("enabled", true);

    if (!followups?.length) return ok({ sent_count: 0 });

    for (const followup of followups) {
      const tenantId = followup.tenant_id || followup.settings?.tenant_id;
      const delayMs = (followup.delay_hours || 24) * 3600 * 1000;
      const windowStart = new Date(Date.now() - delayMs - 300000).toISOString();
      const windowEnd = new Date(Date.now() - delayMs + 300000).toISOString();

      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, name, phone")
        .eq("tenant_id", tenantId)
        .gte("last_appointment_at", windowStart)
        .lte("last_appointment_at", windowEnd);

      if (!contacts?.length) continue;

      const { data: session } = await supabase
        .from("whatsapp_sessions")
        .select("instance_token")
        .eq("tenant_id", tenantId)
        .eq("status", "connected")
        .single();

      if (!session?.instance_token) continue;

      for (const contact of contacts) {
        const firstName = contact.name?.split(" ")[0] || "";
        const message = (followup.message || "")
          .replace(/\$nome/g, contact.name || "")
          .replace(/\$primeiro_nome/g, firstName);

        try {
          await uazapi.sendText(contact.phone, message, session.instance_token);
          await supabase.from("messages").insert({
            tenant_id: tenantId,
            contact_id: contact.id,
            direction: "out",
            message_type: "followup",
            content: message,
            created_at: new Date().toISOString(),
          });
          sentCount++;
        } catch { /* skip failed sends */ }
      }
    }

    return ok({ sent_count: sentCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao enviar follow-ups";
    return apiError(message, 500);
  }
}
