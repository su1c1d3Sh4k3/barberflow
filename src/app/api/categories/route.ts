import { NextRequest } from "next/server";
import { validateAuth, isAuthError, validateBody, isValidationError, ok, apiError, db } from "../_helpers";
import { categorySchema } from "@/lib/validations/service";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const { data, error } = await db()
    .from("service_categories")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .eq("active", true)
    .order("sort_order");

  if (error) return apiError(error.message, 500);
  return ok(data);
}

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const raw = await req.json();
  const validation = validateBody(categorySchema, raw);
  if (isValidationError(validation)) return validation;
  const body = validation.data;

  const { data, error } = await db()
    .from("service_categories")
    .insert({ ...body, tenant_id: auth.tenantId })
    .select()
    .single();

  if (error) return apiError(error.message, 500);
  return ok(data, 201);
}
