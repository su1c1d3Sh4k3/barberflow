import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "@/app/api/_helpers";

export async function GET(request: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  const auth = validateAuth(request);
  if (isAuthError(auth)) return auth;

  const { phone } = await params;
  const { tenantId } = auth;
  const supabase = db();

  try {
    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("phone", phone)
      .eq("tenant_id", tenantId)
      .single();

    if (!contact) return apiError("Contato nao encontrado", 404);

    const { data: coupons, error } = await supabase
      .from("coupon_instances")
      .select("*, coupons(code, discount_type, discount_value)")
      .eq("contact_id", contact.id)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString());

    if (error) return apiError(error.message, 500);

    return ok(coupons || []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao buscar cupons";
    return apiError(message, 500);
  }
}
