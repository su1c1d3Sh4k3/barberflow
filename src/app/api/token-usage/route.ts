import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../_helpers";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const p = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(p.get("limit") || "30"), 100);

  const { data, error } = await db()
    .from("token_usage_ledger")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .order("period_start", { ascending: false })
    .limit(limit);

  if (error) return apiError(error.message, 500);

  // Also get current period summary
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { data: currentPeriod } = await db()
    .from("token_usage_ledger")
    .select("tokens_input, tokens_output, estimated_cost")
    .eq("tenant_id", auth.tenantId)
    .gte("period_start", periodStart)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  return ok({
    ledger: data || [],
    current_period: currentPeriod || { tokens_input: 0, tokens_output: 0, estimated_cost: 0 },
  });
}

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const { tokens_input, tokens_output } = await req.json();
  if (typeof tokens_input !== "number" || typeof tokens_output !== "number") {
    return apiError("tokens_input and tokens_output are required numbers", 422);
  }

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  // Cost calculation (approximate Claude pricing: $3/M input, $15/M output)
  const costInput = (tokens_input / 1_000_000) * 3;
  const costOutput = (tokens_output / 1_000_000) * 15;
  const estimatedCost = Math.round((costInput + costOutput) * 100) / 100;

  // Get subscription
  const { data: sub } = await db()
    .from("subscriptions")
    .select("id")
    .eq("tenant_id", auth.tenantId)
    .single();

  // Upsert: add to existing period or create new
  const { data: existing } = await db()
    .from("token_usage_ledger")
    .select("id, tokens_input, tokens_output, estimated_cost")
    .eq("tenant_id", auth.tenantId)
    .eq("period_start", periodStart)
    .maybeSingle();

  let result;
  if (existing) {
    const { data, error } = await db()
      .from("token_usage_ledger")
      .update({
        tokens_input: existing.tokens_input + tokens_input,
        tokens_output: existing.tokens_output + tokens_output,
        estimated_cost: existing.estimated_cost + estimatedCost,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return apiError(error.message, 500);
    result = data;
  } else {
    const { data, error } = await db()
      .from("token_usage_ledger")
      .insert({
        tenant_id: auth.tenantId,
        subscription_id: sub?.id || null,
        period_start: periodStart,
        period_end: periodEnd,
        tokens_input,
        tokens_output,
        estimated_cost: estimatedCost,
      })
      .select()
      .single();
    if (error) return apiError(error.message, 500);
    result = data;
  }

  return ok(result, 201);
}
