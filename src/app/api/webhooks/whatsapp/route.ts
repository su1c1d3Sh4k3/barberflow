import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { processMessage } from "@/lib/whatsapp/bot";

export async function POST(request: Request) {
  try {
    // Validate webhook token
    const webhookToken = new URL(request.url).searchParams.get("token") ||
                         request.headers.get("x-webhook-token");
    const expectedToken = process.env.WHATSAPP_WEBHOOK_TOKEN;
    if (expectedToken && webhookToken !== expectedToken) {
      return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // uazapi webhook payload can use "EventType" OR "event" for the event name
    const eventType: string = body?.EventType || body?.event || "";

    // Only process incoming messages
    if (eventType !== "messages" && eventType !== "message") {
      return NextResponse.json({ success: true, skipped: true, eventType });
    }

    const data = body?.data || {};

    // uazapi Message schema: data.sender / data.chatid / data.from contain the JID
    // Fallback to Baileys-style data.key.remoteJid for compatibility
    const rawJid: string =
      data?.sender ||
      data?.chatid ||
      data?.from ||
      data?.key?.remoteJid ||
      "";

    const phone = rawJid.replace(/@s\.whatsapp\.net$/, "").replace(/@.*$/, "");

    // uazapi uses data.text; Baileys uses data.message.conversation etc.
    const message: string =
      data?.text ||
      data?.buttonOrListid ||
      data?.message?.conversation ||
      data?.message?.extendedTextMessage?.text ||
      data?.message?.buttonsResponseMessage?.selectedButtonId ||
      data?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      "";

    // uazapi uses data.fromMe directly; Baileys uses data.key.fromMe
    const isFromMe: boolean = data?.fromMe ?? data?.key?.fromMe ?? false;

    // Contact name: uazapi uses senderName; Baileys uses pushName
    const senderName: string = data?.senderName || data?.pushName || "";

    if (!phone || !message || isFromMe) {
      console.log("WhatsApp webhook: skipping message", { phone: !!phone, message: !!message, isFromMe, eventType });
      return NextResponse.json({ success: true, skipped: true });
    }

    const supabase = createServiceRoleClient();

    // Find tenant by instance token (most reliable) or instance ID
    const instance = body?.instance;
    const instanceId = typeof instance === "string"
      ? instance
      : (instance?.id || instance?.instanceId || body?.instanceId);
    const payloadToken: string | null = body?.token || null;

    let tenantId: string | null = null;
    let instanceToken: string | null = null;
    let serviceActive = false;

    // Priority 1: lookup by instance token
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

    // Priority 2: lookup by instance ID
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

    // Priority 3: fallback by phone number
    if (!tenantId) {
      const instancePhone = typeof instance === "object" ? (instance?.phone || body?.phone) : body?.phone;
      if (instancePhone) {
        const { data: session } = await supabase
          .from("whatsapp_sessions")
          .select("tenant_id, instance_token, service_active")
          .like("phone_number", `%${instancePhone.slice(-8)}`)
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
      console.error("WhatsApp webhook: could not identify tenant", {
        instanceId,
        payloadToken: payloadToken ? payloadToken.slice(0, 8) + "..." : null,
        eventType,
        bodyKeys: Object.keys(body),
      });
      return NextResponse.json({ success: false, error: "tenant_not_found" }, { status: 404 });
    }

    // Find or create contact
    let { data: contact } = await supabase
      .from("contacts")
      .select("id, name, phone")
      .eq("tenant_id", tenantId)
      .like("phone", `%${phone.slice(-8)}`)
      .single();

    if (!contact) {
      const { data: newContact } = await supabase
        .from("contacts")
        .insert({
          tenant_id: tenantId,
          name: senderName || `Cliente ${phone.slice(-4)}`,
          phone: phone,
          source: "whatsapp",
          status: "pendente",
        })
        .select("id, name, phone")
        .single();

      contact = newContact;
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

    // Update contact last message
    await supabase
      .from("contacts")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", contact.id);

    // If service is not active, log but do not process through bot
    if (!serviceActive) {
      return NextResponse.json({ success: true, skipped: true, reason: "service_inactive" });
    }

    // Process through bot state machine
    await processMessage(
      {
        tenantId,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: phone,
        instanceToken,
      },
      message
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
