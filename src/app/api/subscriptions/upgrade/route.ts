import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "@/app/api/_helpers";

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { tenantId } = auth;

  const { new_plan_id } = await req.json();
  if (!new_plan_id) return apiError("Missing new_plan_id");

  const supabase = db();

  // Get current subscription
  const { data: sub } = await supabase
    .from("subscriptions").select("*").eq("tenant_id", tenantId).single();
  if (!sub) return apiError("No subscription found", 404);
  if (sub.status === "canceled") return apiError("Subscription is canceled");

  // Get new plan
  const { data: newPlan } = await supabase
    .from("plans").select("*").eq("id", new_plan_id).single();
  if (!newPlan) return apiError("Plan not found", 404);

  // Get current plan
  const { data: currentPlan } = await supabase
    .from("plans").select("*").eq("id", sub.plan_id).single();
  if (!currentPlan) return apiError("Current plan not found", 404);

  // Calculate proration
  const now = new Date();
  const periodEnd = new Date(sub.current_period_end);
  const periodStart = new Date(sub.current_period_start);
  const totalDays = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)));
  const remainingDays = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  const dailyRateCurrent = currentPlan.total_value / totalDays;
  const unusedCredit = dailyRateCurrent * remainingDays;
  const dailyRateNew = newPlan.total_value / (newPlan.cycle_months * 30);
  const proratedCost = Math.max(0, (dailyRateNew * remainingDays) - unusedCredit);

  // Update subscription
  await supabase.from("subscriptions").update({
    plan_id: new_plan_id,
    updated_at: new Date().toISOString(),
  }).eq("id", sub.id);

  // Create prorated invoice if there's a cost
  if (proratedCost > 1) {
    await supabase.from("invoices").insert({
      tenant_id: tenantId,
      subscription_id: sub.id,
      type: "upgrade",
      description: `Upgrade: ${currentPlan.name} → ${newPlan.name} (prorata)`,
      value: Math.round(proratedCost * 100) / 100,
      status: "PENDING",
      billing_type: sub.payment_method || "PIX",
      due_date: now.toISOString().slice(0, 10),
      period_start: now.toISOString().slice(0, 10),
      period_end: sub.current_period_end,
    });
  }

  return ok({
    previous_plan: sub.plan_id,
    new_plan: new_plan_id,
    prorated_amount: Math.round(proratedCost * 100) / 100,
    unused_credit: Math.round(unusedCredit * 100) / 100,
  });
}
