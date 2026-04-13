"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getCompany(companyId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getCompanies(tenantId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("is_default", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateCompany(companyId: string, updates: Record<string, unknown>) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("companies")
    .update(updates)
    .eq("id", companyId);

  if (error) throw new Error(error.message);
  revalidatePath("/empresa");
}

export async function createCompany(data: Record<string, unknown>) {
  const supabase = createServerSupabaseClient();
  const { data: result, error } = await supabase
    .from("companies")
    .insert(data)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/empresa");
  return result;
}

export async function getBusinessHours(companyId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("business_hours")
    .select("*")
    .eq("company_id", companyId)
    .order("weekday");

  if (error) throw new Error(error.message);
  return data || [];
}

export async function upsertBusinessHours(companyId: string, hours: Array<{
  weekday: number;
  open_time: string;
  close_time: string;
  break_start?: string;
  break_end?: string;
  closed: boolean;
}>) {
  const supabase = createServerSupabaseClient();

  // Delete existing hours for this company
  await supabase.from("business_hours").delete().eq("company_id", companyId);

  // Insert new hours (only open days)
  const openDays = hours.filter(h => !h.closed).map(h => ({
    company_id: companyId,
    ...h,
  }));

  if (openDays.length > 0) {
    const { error } = await supabase.from("business_hours").insert(openDays);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/empresa");
}
