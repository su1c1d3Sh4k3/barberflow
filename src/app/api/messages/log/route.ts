import { NextRequest } from "next/server";
import { validateAuth, isAuthError, validateBody, isValidationError, ok, apiError, db } from "../../_helpers";
import { messageLogSchema } from "@/lib/validations/message";

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const validated = validateBody(messageLogSchema, body);
  if (isValidationError(validated)) return validated;

  const { data: v } = validated;

  const { data, error } = await db()
    .from("messages")
    .insert({
      tenant_id: auth.tenantId,
      contact_id: v.contact_id,
      direction: v.direction === "inbound" ? "in" : "out",
      content: v.content,
      sent_by: v.sent_by || "system",
    })
    .select()
    .single();

  if (error) return apiError(error.message, 500);
  return ok(data, 201);
}
