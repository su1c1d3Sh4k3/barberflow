/**
 * POST /api/cron/send-reminders
 *
 * Sends appointment reminder messages via WhatsApp:
 *   • 24 h before → confirmation buttons (Confirmar / Reagendar / Cancelar)
 *   • 1 h before  → simple text reminder
 *
 * Should be called every 10–15 minutes by the external cron provider.
 */
import { NextRequest } from "next/server";
import { ok, apiError, db } from "@/app/api/_helpers";
import { uazapi } from "@/lib/uazapi/client";

function validateCron(request: NextRequest): boolean {
  return request.headers.get("x-cron-secret") === process.env.CRON_SECRET;
}

function ptBrDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function ptBrTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export async function POST(request: NextRequest) {
  if (!validateCron(request)) return apiError("Unauthorized", 401);

  const supabase = db();
  let sent24h = 0;
  let sent1h = 0;

  try {
    const now = Date.now();

    // ── 24 h window: start_at between 23h50m and 24h10m from now ──────────
    const w24Start = new Date(now + 23 * 3600_000 + 50 * 60_000).toISOString();
    const w24End   = new Date(now + 24 * 3600_000 + 10 * 60_000).toISOString();

    const { data: apts24h } = await supabase
      .from("appointments")
      .select(
        "id, start_at, tenant_id, contact_id, " +
        "contacts(id, name, phone), " +
        "professionals(name), " +
        "appointment_services(services(name))"
      )
      .in("status", ["pendente", "confirmado"])
      .gte("start_at", w24Start)
      .lte("start_at", w24End)
      .is("reminder_24h_sent_at", null);

    for (const apt of apts24h || []) {
      const contact = apt.contacts as unknown as { id: string; name: string; phone: string } | null;
      if (!contact?.phone) continue;

      const { data: session } = await supabase
        .from("whatsapp_sessions")
        .select("instance_token")
        .eq("tenant_id", apt.tenant_id)
        .eq("status", "connected")
        .single();
      if (!session?.instance_token) continue;

      const profName = (apt.professionals as unknown as { name: string } | null)?.name ?? "Profissional";
      const svcName  = (apt.appointment_services?.[0] as unknown as { services: { name: string } } | undefined)?.services?.name ?? "Serviço";
      const firstName = contact.name?.split(" ")[0] ?? "";
      const dateStr   = ptBrDate(apt.start_at);

      const text =
        `📅 *Lembrete de agendamento!*\n\n` +
        `Olá, ${firstName}! Seu agendamento é amanhã:\n\n` +
        `*${svcName}* com ${profName}\n` +
        `🕐 ${dateStr}\n\n` +
        `O que deseja fazer?`;

      try {
        await uazapi.sendButtons(
          contact.phone,
          text,
          [
            { id: "btn_confirm_apt",   text: "Confirmar ✅" },
            { id: "btn_reschedule_apt", text: "Reagendar 🔄" },
            { id: "btn_cancel_apt",    text: "Cancelar ❌" },
          ],
          session.instance_token
        );

        // Set bot state to MAIN_MENU so button responses are routed correctly
        const { data: existingState } = await supabase
          .from("conversation_states")
          .select("id")
          .eq("tenant_id", apt.tenant_id)
          .eq("contact_id", contact.id)
          .maybeSingle();

        const statePayload = {
          current_state: "MAIN_MENU",
          context: { existingAppointmentId: apt.id },
          last_interaction_at: new Date().toISOString(),
          // keep state alive 48 h so the client can still respond tomorrow
          expires_at: new Date(now + 48 * 3600_000).toISOString(),
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
          .update({ reminder_24h_sent_at: new Date().toISOString() })
          .eq("id", apt.id);

        sent24h++;
      } catch { /* skip failed sends */ }
    }

    // ── 1 h window: start_at between 50 m and 70 m from now ───────────────
    const w1hStart = new Date(now + 50 * 60_000).toISOString();
    const w1hEnd   = new Date(now + 70 * 60_000).toISOString();

    const { data: apts1h } = await supabase
      .from("appointments")
      .select(
        "id, start_at, tenant_id, contact_id, " +
        "contacts(id, name, phone), " +
        "professionals(name), " +
        "appointment_services(services(name))"
      )
      .in("status", ["pendente", "confirmado"])
      .gte("start_at", w1hStart)
      .lte("start_at", w1hEnd)
      .is("reminder_1h_sent_at", null);

    for (const apt of apts1h || []) {
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
      const timeStr   = ptBrTime(apt.start_at);

      const text =
        `⏰ *Seu agendamento é em 1 hora!*\n\n` +
        `${firstName}, não se esqueça:\n\n` +
        `*${svcName}* com ${profName}\n` +
        `🕐 ${timeStr}\n\n` +
        `Te esperamos! 💈`;

      try {
        await uazapi.sendText(contact.phone, text, session.instance_token);
        await supabase
          .from("appointments")
          .update({ reminder_1h_sent_at: new Date().toISOString() })
          .eq("id", apt.id);
        sent1h++;
      } catch { /* skip failed sends */ }
    }

    return ok({ sent_24h: sent24h, sent_1h: sent1h });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao enviar lembretes";
    return apiError(message, 500);
  }
}
