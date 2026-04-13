import { NextRequest } from "next/server";
import { validateAuth, isAuthError, validateBody, isValidationError, ok, apiError, db } from "../../_helpers";
import { couponSchema } from "@/lib/validations/coupon";

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const validated = validateBody(couponSchema, body);
  if (isValidationError(validated)) return validated;

  const { data: v } = validated;
  const code = v.code || `PROMO${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await db()
    .from("coupons")
    .insert({
      tenant_id: auth.tenantId,
      code: code.toUpperCase(),
      discount_type: v.discount_type,
      discount_value: v.discount_value,
      max_uses: v.max_uses || null,
      current_uses: 0,
      expires_at: v.expires_at || null,
      active: true,
    })
    .select()
    .single();

  if (error) return apiError(error.message, 500);
  return ok(data, 201);
}
