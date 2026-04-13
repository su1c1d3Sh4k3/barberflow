import { NextRequest } from "next/server";
import { validateAuth, isAuthError, validateBody, isValidationError, ok, apiError, db } from "../_helpers";
import { contactSchema } from "@/lib/validations/service";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const p = req.nextUrl.searchParams;
  const limit = parseInt(p.get("limit") || "20");
  const offset = parseInt(p.get("offset") || "0");
  const search = p.get("search")?.trim() || "";
  const status = p.get("status") || "";

  let query = db()
    .from("contacts")
    .select("*", { count: "exact" })
    .eq("tenant_id", auth.tenantId);

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  if (status && status !== "todos") {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) return apiError(error.message, 500);
  return ok({ items: data, total: count ?? 0, offset, limit });
}

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const raw = await req.json();
  const validation = validateBody(contactSchema, raw);
  if (isValidationError(validation)) return validation;
  const body = validation.data;

  const { data, error } = await db()
    .from("contacts")
    .upsert(
      { ...body, tenant_id: auth.tenantId },
      { onConflict: "tenant_id,phone" }
    )
    .select()
    .single();

  if (error) return apiError(error.message, 500);

  await logAudit(auth.tenantId, null, "create", "contact", data.id, { phone: data.phone });

  return ok(data, 201);
}
