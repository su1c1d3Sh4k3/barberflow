import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "@/app/api/_helpers";
import { uazapi } from "@/lib/uazapi/client";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = validateAuth(request);
  if (isAuthError(auth)) return auth;

  const { tenantId } = auth;
  const supabase = db();

  try {
    const { data: contact } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", params.id)
      .eq("tenant_id", tenantId)
      .single();

    if (!contact) return apiError("Contato nao encontrado", 404);

    const { data: settings } = await supabase
      .from("settings")
      .select("birthday_message")
      .eq("tenant_id", tenantId)
      .single();

    if (!settings?.birthday_message) return apiError("Mensagem de aniversario nao configurada", 400);

    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("instance_token")
      .eq("tenant_id", tenantId)
      .single();

    if (!session?.instance_token) return apiError("WhatsApp nao conectado", 400);

    const firstName = contact.name?.split(" ")[0] || "";
    const message = settings.birthday_message
      .replace(/\$nome/g, contact.name || "")
      .replace(/\$primeiro_nome/g, firstName);

    await uazapi.sendText(contact.phone, message, session.instance_token);

    await supabase.from("messages").insert({
      tenant_id: tenantId,
      contact_id: contact.id,
      direction: "out",
      message_type: "birthday",
      content: message,
      created_at: new Date().toISOString(),
    });

    return ok({ message: "Mensagem de aniversario enviada" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao enviar mensagem";
    return apiError(message, 500);
  }
}
