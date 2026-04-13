import { NextRequest } from "next/server";
import { validateAuth, isAuthError, validateBody, isValidationError, ok, apiError, db } from "../../_helpers";
import { contactSchema } from "@/lib/validations/service";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const { data, error } = await db()
    .from("contacts")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .single();

  if (error) return apiError("Contact not found", 404);
  return ok(data);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  const raw = await req.json();
  const validation = validateBody(contactSchema.partial(), raw);
  if (isValidationError(validation)) return validation;
  const body = validation.data;

  const { data, error } = await db()
    .from("contacts")
    .update(body)
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .select()
    .single();

  if (error) return apiError(error.message, 500);
  return ok(data);
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const { error } = await db()
    .from("contacts")
    .delete()
    .eq("id", id)
    .eq("tenant_id", auth.tenantId);

  if (error) return apiError(error.message, 500);

  await logAudit(auth.tenantId, null, "delete", "contact", id);

  return ok({ deleted: true });
}
