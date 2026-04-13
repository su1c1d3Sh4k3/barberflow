import { NextRequest } from "next/server";
import { validateAuth, isAuthError, validateBody, isValidationError, ok, apiError, db } from "../_helpers";
import { iaSettingsSchema } from "@/lib/validations/ia-settings";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const { data, error } = await db()
    .from("ia_settings")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .single();

  if (error || !data) return ok(null);
  return ok(data);
}

export async function PUT(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const validated = validateBody(iaSettingsSchema, body);
  if (isValidationError(validated)) return validated;

  const { data: v } = validated;

  const { data, error } = await db()
    .from("ia_settings")
    .upsert({ tenant_id: auth.tenantId, ...v }, { onConflict: "tenant_id" })
    .select()
    .single();

  if (error) return apiError(error.message, 500);
  return ok(data);
}
