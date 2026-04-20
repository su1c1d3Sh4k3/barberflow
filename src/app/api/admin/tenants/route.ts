import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { validateAdminRequest } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { valid } = validateAdminRequest(request);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceRoleClient();

  // Fetch all tenants with related data
  const { data: tenants, error: tenantsError } = await db
    .from("tenants")
    .select("id, name, plan, trial_ends_at, created_at, public_slug")
    .order("created_at", { ascending: false });

  if (tenantsError) {
    return NextResponse.json({ error: tenantsError.message }, { status: 500 });
  }

  // Fetch owner users for each tenant
  const { data: users } = await db
    .from("users")
    .select("id, tenant_id, name, email, role")
    .eq("role", "owner");

  // Fetch subscriptions + plans
  const { data: subscriptions } = await db
    .from("subscriptions")
    .select("tenant_id, status, trial_ends_at, current_period_end, plan_id");

  const { data: plans } = await db
    .from("plans")
    .select("id, name, tier, has_ia, price_monthly");

  // Fetch WhatsApp sessions
  const { data: sessions } = await db
    .from("whatsapp_sessions")
    .select("tenant_id, status, phone_number");

  // Fetch current month token usage
  const now = new Date();
  const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const { data: usageData } = await db
    .from("ia_usage")
    .select("tenant_id, tokens_input, tokens_output")
    .gte("period_start", periodStart);

  // Aggregate tokens by tenant
  const tokensByTenant: Record<string, number> = {};
  for (const u of usageData || []) {
    tokensByTenant[u.tenant_id] = (tokensByTenant[u.tenant_id] || 0) + (u.tokens_input || 0) + (u.tokens_output || 0);
  }

  // Build plan lookup
  const planLookup: Record<string, { id: string; name: string; tier: string; has_ia: boolean; price_monthly: number }> = {};
  for (const p of plans || []) {
    planLookup[p.id] = p as { id: string; name: string; tier: string; has_ia: boolean; price_monthly: number };
  }

  // Build subscription lookup
  const subLookup: Record<string, { tenant_id: string; status: string; trial_ends_at: string | null; current_period_end: string | null; plan_id: string | null }> = {};
  for (const s of subscriptions || []) {
    if (s.tenant_id) subLookup[s.tenant_id] = s as { tenant_id: string; status: string; trial_ends_at: string | null; current_period_end: string | null; plan_id: string | null };
  }

  // Build user lookup (owner per tenant)
  const userLookup: Record<string, { id: string; tenant_id: string; name: string; email: string; role: string }> = {};
  for (const u of users || []) {
    if (u.tenant_id) userLookup[u.tenant_id] = u as { id: string; tenant_id: string; name: string; email: string; role: string };
  }

  // Build session lookup
  const sessionLookup: Record<string, { tenant_id: string; status: string; phone_number: string | null }> = {};
  for (const s of sessions || []) {
    if (s.tenant_id) sessionLookup[s.tenant_id] = s as { tenant_id: string; status: string; phone_number: string | null };
  }

  // Compose result
  const result = (tenants || []).map((t) => {
    const owner = userLookup[t.id];
    const sub = subLookup[t.id];
    const plan = sub?.plan_id ? planLookup[sub.plan_id] : null;
    const session = sessionLookup[t.id];

    return {
      id: t.id,
      name: t.name,
      public_slug: t.public_slug,
      created_at: t.created_at,
      owner_name: owner?.name || "—",
      owner_email: owner?.email || "—",
      subscription_status: sub?.status || "trial",
      plan_id: sub?.plan_id || null,
      plan_name: plan?.name || (sub?.status === "trial" ? "Trial" : "—"),
      plan_tier: plan?.tier || t.plan || "trial",
      plan_has_ia: plan?.has_ia ?? false,
      plan_price: plan?.price_monthly || 0,
      trial_ends_at: sub?.trial_ends_at || t.trial_ends_at || null,
      current_period_end: sub?.current_period_end || null,
      whatsapp_status: session?.status || null,
      whatsapp_phone: session?.phone_number || null,
      tokens_this_month: tokensByTenant[t.id] || 0,
    };
  });

  return NextResponse.json({ data: result });
}
