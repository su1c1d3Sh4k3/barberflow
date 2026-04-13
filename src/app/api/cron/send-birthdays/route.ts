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
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  let sentCount = 0;

  try {
    const { data: tenants } = await supabase
      .from("settings")
      .select("tenant_id, birthday_message, birthday_enabled")
      .eq("birthday_enabled", true);

    if (!tenants?.length) return ok({ sent_count: 0 });

    for (const tenant of tenants) {
      const { data: session } = await supabase
        .from("whatsapp_sessions")
        .select("instance_token")
        .eq("tenant_id", tenant.tenant_id)
        .eq("status", "connected")
        .single();

      if (!session?.instance_token) continue;

      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, name, phone, birthday")
        .eq("tenant_id", tenant.tenant_id)
        .not("birthday", "is", null);

      if (!contacts?.length) continue;

      for (const contact of contacts) {
        const bday = new Date(contact.birthday);
        if (bday.getMonth() + 1 !== month || bday.getDate() !== day) continue;

        const firstName = contact.name?.split(" ")[0] || "";
        let message = (tenant.birthday_message || "")
          .replace(/\$nome/g, contact.name || "")
          .replace(/\$primeiro_nome/g, firstName);

        // Remove $cupom placeholder if present (coupon feature not yet configured)
        message = message.replace(/\$cupom/g, "");

        try {
          await uazapi.sendText(contact.phone, message, session.instance_token);
          await supabase.from("messages").insert({
            tenant_id: tenant.tenant_id,
            contact_id: contact.id,
            direction: "out",
            message_type: "birthday",
            content: message,
            created_at: new Date().toISOString(),
          });
          sentCount++;
        } catch { /* skip failed sends */ }
      }
    }

    return ok({ sent_count: sentCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao enviar aniversarios";
    return apiError(message, 500);
  }
}
