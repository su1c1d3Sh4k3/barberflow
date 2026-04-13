"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getSettings(tenantId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data;
}

export async function upsertSettings(tenantId: string, updates: Record<string, unknown>) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ tenant_id: tenantId, ...updates });

  if (error) throw new Error(error.message);
  revalidatePath("/definicoes");
}

export async function getFollowups(tenantId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("followups")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("order_num");

  if (error) throw new Error(error.message);
  return data || [];
}

export async function upsertFollowup(followup: {
  id?: string;
  tenant_id: string;
  order_num: number;
  delay_hours: number;
  message: string;
  enabled: boolean;
}) {
  const supabase = createServerSupabaseClient();

  if (followup.id) {
    const { error } = await supabase
      .from("followups")
      .update(followup)
      .eq("id", followup.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("followups")
      .insert(followup);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/definicoes");
}

// Coupons
export async function getCoupons(tenantId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("coupons")
    .select("*, coupon_instances(count)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function createCoupon(coupon: {
  tenant_id: string;
  base_name: string;
  discount_pct: number;
  duration_days: number;
}) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("coupons")
    .insert(coupon)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/definicoes");
  return data;
}

// IA Settings
export async function getIASettings(tenantId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ia_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data;
}

export async function upsertIASettings(tenantId: string, updates: Record<string, unknown>) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("ia_settings")
    .upsert({ tenant_id: tenantId, ...updates });

  if (error) throw new Error(error.message);
  revalidatePath("/definicoes/ia");
}

// WhatsApp Session
export async function getWhatsAppSession(tenantId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("whatsapp_sessions")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data;
}
