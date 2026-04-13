import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { z } from "zod";

const signupSchema = z.object({
  name: z.string().min(3),
  barbershopName: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email(),
  password: z.string().min(6),
  cnpj: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      const messages = parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
      return NextResponse.json({ success: false, error: messages }, { status: 422 });
    }

    const { name, barbershopName, phone, email, password, cnpj } = parsed.data;
    const supabase = createServiceRoleClient();

    // 1. Check if email already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const emailExists = existingUsers?.users?.some((u) => u.email === email);
    if (emailExists) {
      return NextResponse.json(
        { success: false, error: "Este email já está cadastrado" },
        { status: 409 }
      );
    }

    // 2. Create auth user via admin API (auto-confirmed, no email sent)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, barbershop_name: barbershopName, phone, cnpj: cnpj || null },
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { success: false, error: authError?.message || "Erro ao criar conta" },
        { status: 500 }
      );
    }

    const authUserId = authData.user.id;

    // 3. Create tenant
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    const slug = barbershopName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({
        name: barbershopName,
        cnpj: cnpj || null,
        plan: "trial",
        trial_ends_at: trialEndsAt.toISOString(),
        public_slug: `${slug}-${Date.now().toString(36)}`,
      })
      .select()
      .single();

    if (tenantError) {
      // Rollback: delete auth user
      await supabase.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ success: false, error: tenantError.message }, { status: 500 });
    }

    // 4. Create subscription (trial)
    await supabase.from("subscriptions").insert({
      tenant_id: tenant.id,
      status: "trial",
      trial_ends_at: trialEndsAt.toISOString(),
    });

    // 5. Create default company
    await supabase.from("companies").insert({
      tenant_id: tenant.id,
      name: barbershopName,
      phone,
      email,
      is_default: true,
    });

    // 6. Create user profile
    const { error: userError } = await supabase.from("users").insert({
      id: authUserId,
      tenant_id: tenant.id,
      name,
      email,
      phone,
      role: "owner",
    });

    if (userError) {
      // Rollback
      await supabase.from("companies").delete().eq("tenant_id", tenant.id);
      await supabase.from("subscriptions").delete().eq("tenant_id", tenant.id);
      await supabase.from("tenants").delete().eq("id", tenant.id);
      await supabase.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ success: false, error: userError.message }, { status: 500 });
    }

    // 7. Set tenant_id in JWT
    await supabase.auth.admin.updateUserById(authUserId, {
      app_metadata: { tenant_id: tenant.id },
    });

    // 8. Create default settings + IA settings
    await supabase.from("settings").insert({
      tenant_id: tenant.id,
      welcome_message: `Olá! 👋 Bem-vindo à *${barbershopName}*! Como posso te ajudar?`,
    });
    await supabase.from("ia_settings").insert({ tenant_id: tenant.id });

    return NextResponse.json({
      success: true,
      data: {
        user_id: authUserId,
        tenant_id: tenant.id,
        email,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { success: false, error: "Erro interno ao criar conta" },
      { status: 500 }
    );
  }
}
