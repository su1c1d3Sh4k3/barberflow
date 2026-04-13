import { NextRequest } from "next/server";
import { validateAuth, isAuthError, validateBody, isValidationError, ok, apiError, db } from "../_helpers";
import { serviceSchema } from "@/lib/validations/service";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const url = req.nextUrl.searchParams;

  let query = db()
    .from("services")
    .select("*, service_categories(name)")
    .eq("tenant_id", auth.tenantId)
    .eq("active", true);

  if (url.get("category_id")) query = query.eq("category_id", url.get("category_id")!);
  if (url.get("professional_id")) {
    query = query.in(
      "id",
      db()
        .from("professional_services")
        .select("service_id")
        .eq("professional_id", url.get("professional_id")!) as unknown as string[]
    );
  }

  const { data, error } = await query.order("name");
  if (error) return apiError(error.message, 500);
  return ok(data);
}

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const raw = await req.json();
  const validation = validateBody(serviceSchema, raw);
  if (isValidationError(validation)) return validation;
  const body = validation.data;

  const { data, error } = await db()
    .from("services")
    .insert({ ...body, tenant_id: auth.tenantId })
    .select()
    .single();

  if (error) return apiError(error.message, 500);
  return ok(data, 201);
}
