import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "@/app/api/_helpers";
import { cancelSubscription } from "@/lib/asaas/subscriptions";

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { tenantId } = auth;

  const { reason } = await req.json().catch(() => ({ reason: undefined }));
  const supabase = db();

  const { data: sub } = await supabase
    .from("subscriptions").select("*").eq("tenant_id", tenantId).single();
  if (!sub) return apiError("No subscription found", 404);
  if (sub.status === "canceled") return apiError("Already canceled");

  // Cancel on Asaas if recurring
  if (sub.asaas_subscription_id) {
    await cancelSubscription(sub.asaas_subscription_id).catch(() => {});
  }

  // Keep access until current_period_end
  await supabase.from("subscriptions").update({
    status: "canceled",
    canceled_at: new Date().toISOString(),
    cancellation_reason: reason ?? null,
    auto_renew: false,
    updated_at: new Date().toISOString(),
  }).eq("id", sub.id);

  return ok({
    canceled_at: new Date().toISOString(),
    access_until: sub.current_period_end,
  });
}
