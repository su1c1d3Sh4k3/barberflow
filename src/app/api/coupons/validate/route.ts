import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../_helpers";

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { code } = await req.json();

  if (!code) return apiError("code is required");

  const { data: coupon, error } = await db()
    .from("coupons")
    .select("*")
    .eq("code", code.toUpperCase())
    .eq("tenant_id", auth.tenantId)
    .eq("active", true)
    .single();

  if (error || !coupon) return apiError("Coupon not found or inactive", 404);

  // Check expiry
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return apiError("Coupon expired", 400);
  }

  // Check usage limit
  if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
    return apiError("Coupon usage limit reached", 400);
  }

  return ok({
    valid: true,
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value,
    code: coupon.code,
  });
}
