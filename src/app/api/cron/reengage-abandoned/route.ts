import { NextRequest } from "next/server";
import { ok, apiError, db } from "@/app/api/_helpers";

function validateCron(request: NextRequest): boolean {
  const secret = request.headers.get("x-cron-secret");
  return secret === process.env.CRON_SECRET;
}

/**
 * POST /api/cron/reengage-abandoned
 *
 * Finds conversation_states that are NOT in IDLE state and whose
 * last_interaction_at is more than 1 hour ago. These represent
 * abandoned booking flows. Marks them for re-engagement and
 * would send a WhatsApp message via uazapi.
 */
export async function POST(request: NextRequest) {
  if (!validateCron(request)) return apiError("Unauthorized", 401);

  const supabase = db();

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Find abandoned sessions:
    // - State is NOT 'IDLE' (they started a booking flow)
    // - last_interaction_at is older than 1 hour
    // - Not already re-engaged (context->>'reengaged' is null or false)
    const { data: abandoned, error: queryError } = await supabase
      .from("conversation_states")
      .select(`
        id,
        tenant_id,
        contact_id,
        current_state,
        context,
        last_interaction_at,
        contacts!inner(phone, name)
      `)
      .neq("current_state", "IDLE")
      .lt("last_interaction_at", oneHourAgo)
      .order("last_interaction_at", { ascending: true });

    if (queryError) return apiError(queryError.message, 500);

    // Filter out already re-engaged sessions
    const toReengage = (abandoned || []).filter((session) => {
      const ctx = session.context as Record<string, unknown> | null;
      return !ctx?.reengaged;
    });

    let reengagedCount = 0;

    for (const session of toReengage) {
      const contact = session.contacts as unknown as { phone: string; name: string } | null;
      if (!contact?.phone) continue;

      // TODO: Send WhatsApp re-engagement message via uazapi
      // const message = `Olá ${contact.name || ''}! Notamos que você não concluiu seu agendamento. Gostaria de continuar? Estamos à disposição!`;
      // await sendWhatsAppMessage(session.tenant_id, contact.phone, message);

      // Mark as re-engaged in context
      const currentContext = (session.context as Record<string, unknown>) || {};
      const { error: updateError } = await supabase
        .from("conversation_states")
        .update({
          context: { ...currentContext, reengaged: true, reengaged_at: new Date().toISOString() },
        })
        .eq("id", session.id);

      if (!updateError) {
        reengagedCount++;
      }
    }

    return ok({
      found: toReengage.length,
      reengaged: reengagedCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao processar re-engagement";
    return apiError(message, 500);
  }
}
