import { NextResponse, NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { processMessage } from "@/lib/whatsapp/bot";
import { normalizePhone, phoneSuffix } from "@/lib/phone";

// GET — health check, verifies the endpoint is reachable
export async function GET() {
  const supabase = createServiceRoleClient();

  // Return recent inbound messages as a debug signal
  const { data: recentMessages } = await supabase
    .from("messages")
    .select("id, tenant_id, direction, content, created_at")
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(5);

  // Return sessions with their last webhook_status (debug info)
  const { data: sessions } = await supabase
    .from("whatsapp_sessions")
    .select("tenant_id, instance_id, status, service_active, webhook_status, updated_at")
    .order("updated_at", { ascending: false })
    .limit(5);

  return NextResponse.json({
    ok: true,
    server: "barberflow-webhook",
    timestamp: new Date().toISOString(),
    sessions: sessions || [],
    recent_inbound_messages: recentMessages || [],
  });
}

export async function POST(request: NextRequest) {
  try {
    // Validate webhook token
    const webhookToken = new URL(request.url).searchParams.get("token") ||
                         request.headers.get("x-webhook-token");
    const expectedToken = process.env.WHATSAPP_WEBHOOK_TOKEN;
    if (expectedToken && webhookToken !== expectedToken) {
      return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const supabase = createServiceRoleClient();

    // uazapi payload can use "EventType" OR "event"
    const eventType: string = body?.EventType || body?.event || "";

    // Store FULL payload for debugging
    const debugSummary = JSON.stringify({
      at: new Date().toISOString(),
      eventType,
      body,
    }).slice(0, 4000);

    // Try to find session to store debug info (best-effort, don't fail on error)
    const payloadToken: string | null = body?.token || null;
    const instance = body?.instance;
    const instanceId = body?.instanceName ||
      (typeof instance === "string" ? instance : (instance?.id || instance?.instanceId || body?.instanceId));

    // Best-effort: store debug info on the matching session
    try {
      if (payloadToken) {
        await supabase
          .from("whatsapp_sessions")
          .update({ webhook_status: debugSummary })
          .eq("instance_token", payloadToken);
      } else if (instanceId) {
        await supabase
          .from("whatsapp_sessions")
          .update({ webhook_status: debugSummary })
          .eq("instance_id", instanceId);
      } else {
        // Store on any session as last resort
        await supabase
          .from("whatsapp_sessions")
          .update({ webhook_status: debugSummary })
          .neq("id", "00000000-0000-0000-0000-000000000000");
      }
    } catch { /* non-critical */ }

    // Only process incoming messages
    if (eventType !== "messages" && eventType !== "message") {
      return NextResponse.json({ success: true, skipped: true, eventType });
    }

    // uazapi sends data in TWO possible formats:
    // Format A (older): body.data.sender, body.data.text, etc.
    // Format B (current): body.chat, body.message (root level), NO body.data
    const data = body?.data || {};

    // Phone/JID extraction — check both formats
    const rawJid: string =
      // Format B: root-level chat field
      (typeof body?.chat === "string" ? body.chat : "") ||
      // Format A: nested data fields
      data?.sender ||
      data?.chatid ||
      data?.from ||
      data?.key?.remoteJid ||
      "";

    const phone = normalizePhone(rawJid.replace(/:.*$/, "").replace(/@.*$/, ""));

    // Message text — check both formats
    const msgObj = body?.message;
    const message: string =
      // Format B: root-level message (can be string or object)
      (typeof msgObj === "string" ? msgObj : "") ||
      (typeof msgObj === "object" && msgObj ? (msgObj.conversation || msgObj.text || msgObj.extendedTextMessage?.text || msgObj.buttonsResponseMessage?.selectedButtonId || msgObj.listResponseMessage?.singleSelectReply?.selectedRowId || "") : "") ||
      // Format A: nested data fields
      data?.text ||
      data?.buttonOrListid ||
      data?.message?.conversation ||
      data?.message?.extendedTextMessage?.text ||
      data?.message?.buttonsResponseMessage?.selectedButtonId ||
      data?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      "";

    // fromMe — check both formats
    const isFromMe: boolean = body?.fromMe ?? data?.fromMe ?? data?.key?.fromMe ?? false;

    // Sender name
    const senderName: string = body?.senderName || body?.pushName || data?.senderName || data?.pushName || "";

    if (!phone || !message || isFromMe) {
      return NextResponse.json({ success: true, skipped: true, debug: { phone: !!phone, message: !!message, isFromMe } });
    }

    // Find tenant
    let tenantId: string | null = null;
    let instanceToken: string | null = null;
    let serviceActive = false;

    // Priority 1: by instance token
    if (payloadToken) {
      const { data: session } = await supabase
        .from("whatsapp_sessions")
        .select("tenant_id, instance_token, service_active")
        .eq("instance_token", payloadToken)
        .eq("status", "connected")
        .single();

      if (session) {
        tenantId = session.tenant_id;
        instanceToken = session.instance_token;
        serviceActive = session.service_active ?? false;
      }
    }

    // Priority 2: by instance ID
    if (!tenantId && instanceId) {
      const { data: session } = await supabase
        .from("whatsapp_sessions")
        .select("tenant_id, instance_token, service_active")
        .eq("instance_id", instanceId)
        .eq("status", "connected")
        .single();

      if (session) {
        tenantId = session.tenant_id;
        instanceToken = session.instance_token;
        serviceActive = session.service_active ?? false;
      }
    }

    // Priority 3: fallback by phone
    if (!tenantId) {
      const fallbackPhone = typeof instance === "object" ? (instance?.phone || body?.phone) : body?.phone;
      if (fallbackPhone) {
        const { data: session } = await supabase
          .from("whatsapp_sessions")
          .select("tenant_id, instance_token, service_active")
          .like("phone_number", `%${fallbackPhone.slice(-8)}`)
          .eq("status", "connected")
          .single();

        if (session) {
          tenantId = session.tenant_id;
          instanceToken = session.instance_token;
          serviceActive = session.service_active ?? false;
        }
      }
    }

    if (!tenantId || !instanceToken) {
      console.error("WhatsApp webhook: tenant not found", { instanceId, hasToken: !!payloadToken, eventType });
      return NextResponse.json({ success: false, error: "tenant_not_found", debug: { instanceId, hasToken: !!payloadToken } }, { status: 404 });
    }

    // Find or create contact (match by last 11 digits, store normalized)
    const suffix = phoneSuffix(phone);
    let { data: contact } = await supabase
      .from("contacts")
      .select("id, name, phone")
      .eq("tenant_id", tenantId)
      .like("phone", `%${suffix}`)
      .limit(1)
      .maybeSingle();

    if (!contact) {
      const { data: newContact } = await supabase
        .from("contacts")
        .insert({
          tenant_id: tenantId,
          name: senderName || `Cliente ${phone.slice(-4)}`,
          phone,
          source: "whatsapp",
          status: "pendente",
        })
        .select("id, name, phone")
        .single();

      contact = newContact;
    } else if (contact.phone !== phone) {
      // Normalize phone format on existing contact
      await supabase.from("contacts").update({ phone }).eq("id", contact.id);
      contact.phone = phone;
    }

    if (!contact) {
      return NextResponse.json({ success: false, error: "contact_creation_failed" }, { status: 500 });
    }

    // Log inbound message
    await supabase.from("messages").insert({
      tenant_id: tenantId,
      contact_id: contact.id,
      direction: "in",
      content: message,
    });

    await supabase
      .from("contacts")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", contact.id);

    if (!serviceActive) {
      return NextResponse.json({ success: true, skipped: true, reason: "service_inactive" });
    }

    await processMessage(
      { tenantId, contactId: contact.id, contactName: contact.name, contactPhone: phone, instanceToken },
      message
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
