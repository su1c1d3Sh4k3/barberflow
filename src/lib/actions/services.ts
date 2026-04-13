"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Categories
export async function getCategories(tenantId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("service_categories")
    .select("*, services(count)")
    .eq("tenant_id", tenantId)
    .order("name");

  if (error) throw new Error(error.message);
  return data || [];
}

export async function createCategory(category: {
  tenant_id: string;
  name: string;
  description?: string;
  color?: string;
}) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("service_categories")
    .insert(category)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/servicos");
  return data;
}

export async function updateCategory(id: string, updates: Record<string, unknown>) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("service_categories")
    .update(updates)
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/servicos");
}

export async function deleteCategory(id: string) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("service_categories")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/servicos");
}

// Services
export async function getServices(tenantId: string, categoryId?: string) {
  const supabase = createServerSupabaseClient();
  let query = supabase
    .from("services")
    .select("*, service_categories(id, name, color)")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("name");

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createService(service: {
  tenant_id: string;
  category_id: string;
  name: string;
  description?: string;
  duration_min: number;
  price: number;
}) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("services")
    .insert(service)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/servicos");
  return data;
}

export async function updateService(id: string, updates: Record<string, unknown>) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("services")
    .update(updates)
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/servicos");
}

export async function deleteService(id: string) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("services")
    .update({ active: false })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/servicos");
}

export async function togglePromo(id: string, promoActive: boolean, discountPct?: number) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("services")
    .update({
      promo_active: promoActive,
      promo_discount_pct: promoActive ? discountPct : null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/servicos");
}
