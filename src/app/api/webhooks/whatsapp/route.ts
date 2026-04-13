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
    const supabase = createServiceRoleClient();

    // Extract message data from uazapi webhook payload
    const { event, data, instance } = body;

    if (event !== "messages") {
      return NextResponse.json({ success: true, skipped: true });
    }

    const phone = data?.key?.remoteJid?.replace("@s.whatsapp.net", "");
    const message =
      data?.message?.conversation ||
      data?.message?.extendedTextMessage?.text ||
      data?.message?.buttonsResponseMessage?.selectedButtonId ||
      data?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      "";
    const isFromMe = data?.key?.fromMe;

    if (!phone || !message || isFromMe) {
      return NextResponse.json({ success: true, skipped: true });
    }

    // Find tenant by whatsapp_sessions instance
    const instanceId = instance?.id || instance?.instanceId || body?.instanceId;
    let tenantId: string | null = null;
    let instanceToken: string | null = null;

    if (instanceId) {
      const { data: session } = await supabase
        .from("whatsapp_sessions")
        .select("tenant_id, instance_token")
        .eq("instance_id", instanceId)
        .eq("status", "connected")
        .single();

      if (session) {
        tenantId = session.tenant_id;
        instanceToken = session.instance_token;
      }
    }

    if (!tenantId || !instanceToken) {
      // Fallback: try to find session by phone match from instance
      const instancePhone = instance?.phone || body?.phone;
      if (instancePhone) {
        const { data: session } = await supabase
          .from("whatsapp_sessions")
          .select("tenant_id, instance_token")
          .like("phone_number", `%${instancePhone.slice(-8)}`)
          .eq("status", "connected")
          .single();

        if (session) {
          tenantId = session.tenant_id;
          instanceToken = session.instance_token;
        }
      }
    }

    if (!tenantId || !instanceToken) {
      console.error("WhatsApp webhook: could not identify tenant for instance", instanceId);
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
      // Create new contact
      const pushName = data?.pushName || `Cliente ${phone.slice(-4)}`;
      const { data: newContact } = await supabase
        .from("contacts")
        .insert({
          tenant_id: tenantId,
          name: pushName,
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
