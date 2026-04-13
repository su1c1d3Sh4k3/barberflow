import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import crypto from "crypto";

/** Max age in ms for webhook events (5 minutes) */
const MAX_EVENT_AGE_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  try {
    // ---- Token validation (mandatory) ----
    const expectedToken = process.env.ASAAS_WEBHOOK_ACCESS_TOKEN;
    if (!expectedToken) {
      console.error("ASAAS_WEBHOOK_ACCESS_TOKEN not configured");
      return NextResponse.json({ success: false, error: "Server misconfigured" }, { status: 500 });
    }

    const webhookToken = request.headers.get("asaas-access-token");
    if (
      !webhookToken ||
      webhookToken.length !== expectedToken.length ||
      !crypto.timingSafeEqual(Buffer.from(expectedToken), Buffer.from(webhookToken))
    ) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // ---- Replay protection ----
    if (body.dateCreated) {
      const eventTime = new Date(body.dateCreated).getTime();
      if (!isNaN(eventTime) && Date.now() - eventTime > MAX_EVENT_AGE_MS) {
        return NextResponse.json({ success: false, error: "Event expired" }, { status: 400 });
      }
    }
    const supabase = createServiceRoleClient();

    const { event, payment } = body;

    // Idempotency check
    if (body.id) {
      const { data: existing } = await supabase
        .from("asaas_webhook_events")
        .select("id")
        .eq("id", body.id)
        .single();

      if (existing) {
        return NextResponse.json({ success: true, duplicate: true });
      }

      await supabase.from("asaas_webhook_events").insert({
        id: body.id,
        event,
        payload: body,
      });
    }

    // Route by event
    switch (event) {
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED": {
        if (payment?.externalReference) {
          // Update subscription status
          await supabase
            .from("subscriptions")
            .update({ status: "active" })
            .eq("id", payment.externalReference);

          // Update invoice
          await supabase
            .from("invoices")
            .update({
              status: "RECEIVED",
              paid_at: new Date().toISOString(),
            })
            .eq("asaas_payment_id", payment.id);
        }
        break;
      }

      case "PAYMENT_OVERDUE": {
        if (payment?.externalReference) {
          await supabase
            .from("subscriptions")
            .update({ status: "past_due" })
            .eq("id", payment.externalReference);

          await supabase
            .from("invoices")
            .update({ status: "OVERDUE" })
            .eq("asaas_payment_id", payment.id);
        }
        break;
      }

      case "PAYMENT_REFUNDED":
      case "PAYMENT_DELETED": {
        if (payment?.externalReference) {
          await supabase
            .from("invoices")
            .update({ status: event === "PAYMENT_REFUNDED" ? "REFUNDED" : "DELETED" })
            .eq("asaas_payment_id", payment.id);
        }
        break;
      }
    }

    // Mark as processed
    if (body.id) {
      await supabase
        .from("asaas_webhook_events")
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq("id", body.id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Asaas webhook error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
