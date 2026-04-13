import { NextRequest } from "next/server";
import { ok, apiError, db } from "@/app/api/_helpers";

function validateCron(request: NextRequest): boolean {
  const secret = request.headers.get("x-cron-secret");
  return secret === process.env.CRON_SECRET;
}

/**
 * POST /api/cron/notify-waitlist
 *
 * Checks waitlist entries where desired_date is today or in the future,
 * and for which there are available slots. Marks them as notified.
 *
 * In a full implementation, this would send a WhatsApp message via uazapi
 * to each contact on the waitlist.
 */
export async function POST(request: NextRequest) {
  if (!validateCron(request)) return apiError("Unauthorized", 401);

  const supabase = db();
  const today = new Date().toISOString().slice(0, 10);

  try {
    // 1. Get un-notified waitlist entries for today or future
    const { data: entries, error: fetchErr } = await supabase
      .from("waitlist")
      .select("*, contacts(name, phone), services(name, duration_min), professionals(name)")
      .eq("notified", false)
      .gte("desired_date", today)
      .limit(50);

    if (fetchErr) return apiError(fetchErr.message, 500);
    if (!entries || entries.length === 0) {
      return ok({ notified_count: 0, message: "No waitlist entries to process" });
    }

    let notifiedCount = 0;
    const notifiedIds: string[] = [];

    for (const entry of entries) {
      // 2. Check if there are available slots via the DB function
      if (entry.professional_id && entry.service_id && entry.desired_date) {
        const { data: slots } = await supabase.rpc("get_available_slots", {
          p_tenant_id: entry.tenant_id,
          p_professional_id: entry.professional_id,
          p_service_id: entry.service_id,
          p_date: entry.desired_date,
        });

        if (slots && slots.length > 0) {
          // 3. In production, send WhatsApp notification here:
          // const session = await supabase.from("whatsapp_sessions")
          //   .select("instance_token").eq("tenant_id", entry.tenant_id).single();
          // if (session?.data?.instance_token && entry.contacts?.phone) {
          //   await uazapi.sendText(entry.contacts.phone,
          //     `Olá ${entry.contacts.name}! Temos horários disponíveis para ${entry.services?.name} no dia ${entry.desired_date}. Agende agora!`,
          //     session.data.instance_token);
          // }

          notifiedIds.push(entry.id);
          notifiedCount++;
        }
      }
    }

    // 4. Mark as notified
    if (notifiedIds.length > 0) {
      await supabase
        .from("waitlist")
        .update({ notified: true })
        .in("id", notifiedIds);
    }

    return ok({ notified_count: notifiedCount, total_checked: entries.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao notificar lista de espera";
    return apiError(message, 500);
  }
}
