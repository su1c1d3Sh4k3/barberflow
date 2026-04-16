/**
 * POST /api/cron/send-satisfaction
 *
 * Sends a satisfaction survey (rating 1–5) via WhatsApp
 * approximately 1 hour after the appointment ends (end_at).
 *
 * After sending, sets the bot conversation state to AWAITING_RATING
 * so the next client message is captured as a rating.
 *
 * Should be called every 10–15 minutes by the external cron provider.
 */
import { NextRequest } from "next/server";
import { ok, apiError, db } from "@/app/api/_helpers";
import { uazapi } from "@/lib/uazapi/client";

function validateCron(request: NextRequest): boolean {
  return request.headers.get("x-cron-secret") === process.env.CRON_SECRET;
}

export async function POST(request: NextRequest) {
  if (!validateCron(request)) return apiError("Unauthorized", 401);

  const supabase = db();
  let sentCount = 0;

  try {
    const now = Date.now();

    // Window: end_at between 50 m and 70 m ago
    const windowStart = new Date(now - 70 * 60_000).toISOString();
    const windowEnd   = new Date(now - 50 * 60_000).toISOString();

    const { data: appointments } = await supabase
      .from("appointments")
      .select(
        "id, end_at, tenant_id, contact_id, " +
        "contacts(id, name, phone), " +
        "professionals(name), " +
        "appointment_services(services(name))"
      )
      .in("status", ["concluido", "confirmado", "pendente"])
      .gte("end_at", windowStart)
      .lte("end_at", windowEnd)
      .is("satisfaction_sent_at", null);

    for (const apt of appointments || []) {
      const contact = apt.contacts as unknown as { id: string; name: string; phone: string } | null;
      if (!contact?.phone) continue;

      const { data: session } = await supabase
        .from("whatsapp_sessions")
        .select("instance_token")
        .eq("tenant_id", apt.tenant_id)
        .eq("status", "connected")
        .single();
      if (!session?.instance_token) continue;

      const profName  = (apt.professionals as unknown as { name: string } | null)?.name ?? "Profissional";
      const svcName   = (apt.appointment_services?.[0] as unknown as { services: { name: string } } | undefined)?.services?.name ?? "Serviço";
      const firstName = contact.name?.split(" ")[0] ?? "";

      const text =
        `⭐ *Como foi sua experiência?*\n\n` +
        `${firstName}, esperamos que tenha gostado do ${svcName} com ${profName}!\n\n` +
        `Avalie de *1 a 5*:\n\n` +
        `1 ⭐ — Muito ruim\n` +
        `2 ⭐⭐ — Ruim\n` +
        `3 ⭐⭐⭐ — Regular\n` +
        `4 ⭐⭐⭐⭐ — Bom\n` +
        `5 ⭐⭐⭐⭐⭐ — Excelente\n\n` +
        `Responda apenas com o número 😊`;

      try {
        await uazapi.sendText(contact.phone, text, session.instance_token);

        // Set bot state to AWAITING_RATING
        const { data: existingState } = await supabase
          .from("conversation_states")
          .select("id")
          .eq("tenant_id", apt.tenant_id)
          .eq("contact_id", contact.id)
          .maybeSingle();

        const statePayload = {
          current_state: "AWAITING_RATING",
          context: { ratingAppointmentId: apt.id },
          last_interaction_at: new Date().toISOString(),
          expires_at: new Date(now + 24 * 3600_000).toISOString(),
        };

        if (existingState) {
          await supabase.from("conversation_states").update(statePayload).eq("id", existingState.id);
        } else {
          await supabase.from("conversation_states").insert({
            tenant_id: apt.tenant_id,
            contact_id: contact.id,
            ...statePayload,
          });
        }

        await supabase
          .from("appointments")
          .update({ satisfaction_sent_at: new Date().toISOString() })
          .eq("id", apt.id);

        sentCount++;
      } catch { /* skip failed sends */ }
    }

    return ok({ sent_count: sentCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao enviar pesquisa de satisfação";
    return apiError(message, 500);
  }
}
