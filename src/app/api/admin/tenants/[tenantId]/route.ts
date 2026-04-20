import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { validateAdminRequest } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

// GET /api/admin/tenants/[tenantId] — token history for chart
export async function GET(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  const { valid } = validateAdminRequest(request);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceRoleClient();

  // Get last 12 months of ia_usage
  const { data: usage, error } = await db
    .from("ia_usage")
    .select("period_start, tokens_input, tokens_output, cost_brl")
    .eq("tenant_id", params.tenantId)
    .order("period_start", { ascending: false })
    .limit(12);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate by month (period_start is a date, might have multiple entries per month)
  const monthMap: Record<string, { tokens: number; cost: number }> = {};
  for (const u of usage || []) {
    const month = u.period_start.slice(0, 7); // "YYYY-MM"
    if (!monthMap[month]) monthMap[month] = { tokens: 0, cost: 0 };
    monthMap[month].tokens += (u.tokens_input || 0) + (u.tokens_output || 0);
    monthMap[month].cost += Number(u.cost_brl || 0);
  }

  const history = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      label: new Date(month + "-15").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      tokens: data.tokens,
      cost: Math.round(data.cost * 100) / 100,
    }));

  return NextResponse.json({ data: history });
}

// PATCH /api/admin/tenants/[tenantId] — edit plan / expiry
export async function PATCH(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  const { valid } = validateAdminRequest(request);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { plan_id, expiry_date, subscription_status } = body;

  const db = createServiceRoleClient();

  // Update subscription
  const subUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (plan_id !== undefined) subUpdate.plan_id = plan_id;
  if (subscription_status !== undefined) subUpdate.status = subscription_status;
  if (expiry_date !== undefined) {
    if (subscription_status === "trial" || body.is_trial) {
      subUpdate.trial_ends_at = expiry_date;
    } else {
      subUpdate.current_period_end = expiry_date;
    }
  }

  const { error: subError } = await db
    .from("subscriptions")
    .update(subUpdate)
    .eq("tenant_id", params.tenantId);

  if (subError) return NextResponse.json({ error: subError.message }, { status: 500 });

  // Update tenants.plan to reflect new tier
  if (plan_id || subscription_status) {
    let planTier = body.plan_tier;
    if (!planTier && plan_id) {
      const { data: planData } = await db
        .from("plans")
        .select("tier")
        .eq("id", plan_id)
        .single();
      planTier = planData?.tier;
    }
    if (!planTier && subscription_status === "trial") planTier = "trial";

    if (planTier) {
      await db.from("tenants").update({ plan: planTier }).eq("id", params.tenantId);
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/admin/tenants/[tenantId] — permanently delete tenant and all data
export async function DELETE(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  const { valid } = validateAdminRequest(request);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceRoleClient();
  const tenantId = params.tenantId;

  // Fetch all auth user IDs for this tenant before deleting
  const { data: tenantUsers } = await db
    .from("users")
    .select("id")
    .eq("tenant_id", tenantId);

  // Delete tenant — cascades all related data via FK ON DELETE CASCADE
  const { error: deleteError } = await db
    .from("tenants")
    .delete()
    .eq("id", tenantId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Delete Supabase Auth users
  if (tenantUsers && tenantUsers.length > 0) {
    await Promise.all(
      tenantUsers.map((u) => db.auth.admin.deleteUser(u.id))
    );
  }

  return NextResponse.json({ success: true });
}
