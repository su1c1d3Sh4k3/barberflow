import { NextRequest } from "next/server";
import { validateAuth, isAuthError, validateBody, isValidationError, ok, apiError, db } from "../_helpers";
import { contactSchema } from "@/lib/validations/service";
import { logAudit } from "@/lib/audit";
import { normalizePhone, phoneSuffix } from "@/lib/phone";

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

  const normalized = normalizePhone(body.phone);
  const suffix = phoneSuffix(normalized);

  // Check if contact with same last 11 digits already exists
  const { data: existing } = await db()
    .from("contacts")
    .select("id")
    .eq("tenant_id", auth.tenantId)
    .like("phone", `%${suffix}`)
    .limit(1)
    .maybeSingle();

  let data, error;
  if (existing) {
    // Merge into existing contact (update phone to normalized + any new fields)
    ({ data, error } = await db()
      .from("contacts")
      .update({ ...body, phone: normalized })
      .eq("id", existing.id)
      .select()
      .single());
  } else {
    ({ data, error } = await db()
      .from("contacts")
      .insert({ ...body, phone: normalized, tenant_id: auth.tenantId })
      .select()
      .single());
  }

  if (error) return apiError(error.message, 500);

  await logAudit(auth.tenantId, null, "create", "contact", data.id, { phone: data.phone });

  return ok(data, 201);
}
