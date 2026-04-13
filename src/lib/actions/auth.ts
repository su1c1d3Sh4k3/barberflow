"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Called after Supabase Auth signup to create the tenant cascade:
 * tenant → subscription (trial) → company (default) → user profile → settings
 */
export async function createTenantCascade(authUserId: string, metadata: {
  name: string;
  barbershop_name: string;
  phone: string;
  email: string;
  cnpj?: string;
}) {
  const supabase = createServiceRoleClient();

  // 1. Create tenant
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 7);

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({
      name: metadata.barbershop_name,
      cnpj: metadata.cnpj || null,
      plan: "trial",
      trial_ends_at: trialEndsAt.toISOString(),
      public_slug: metadata.barbershop_name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
    })
    .select()
    .single();

  if (tenantError) throw new Error(tenantError.message);

  // 2. Create subscription (trial)
  const { error: subError } = await supabase
    .from("subscriptions")
    .insert({
      tenant_id: tenant.id,
      status: "trial",
      trial_ends_at: trialEndsAt.toISOString(),
    });

  if (subError) throw new Error(subError.message);

  // 3. Create default company
  const { error: companyError } = await supabase
    .from("companies")
    .insert({
      tenant_id: tenant.id,
      name: metadata.barbershop_name,
      phone: metadata.phone,
      email: metadata.email,
      is_default: true,
    });

  if (companyError) throw new Error(companyError.message);

  // 4. Create user profile
  const { error: userError } = await supabase
    .from("users")
    .insert({
      id: authUserId,
      tenant_id: tenant.id,
      name: metadata.name,
      email: metadata.email,
      phone: metadata.phone,
      role: "owner",
    });

  if (userError) throw new Error(userError.message);

  // 5. Set tenant_id in JWT custom claims AND auto-confirm email
  await supabase.auth.admin.updateUserById(authUserId, {
    app_metadata: { tenant_id: tenant.id },
    email_confirm: true,
  });

  // 6. Create default settings
  const { error: settingsError } = await supabase
    .from("settings")
    .insert({
      tenant_id: tenant.id,
      welcome_message: `Olá! 👋 Bem-vindo à *${metadata.barbershop_name}*! Como posso te ajudar?`,
    });

  if (settingsError) throw new Error(settingsError.message);

  // 6. Create default IA settings
  await supabase.from("ia_settings").insert({ tenant_id: tenant.id });

  return tenant;
}
