"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getProfessionals(tenantId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("professionals")
    .select(`
      *,
      professional_services(service_id, services(id, name)),
      professional_schedules(*)
    `)
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("name");

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getProfessional(id: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("professionals")
    .select(`
      *,
      professional_services(service_id, services(id, name)),
      professional_schedules(*)
    `)
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createProfessional(professional: {
  tenant_id: string;
  company_id: string;
  name: string;
  phone?: string;
  email?: string;
  bio?: string;
  commission_pct: number;
  service_ids?: string[];
  schedule?: Array<{
    weekday: number;
    start_time: string;
    end_time: string;
    break_start?: string;
    break_end?: string;
  }>;
}) {
  const supabase = createServerSupabaseClient();
  const { service_ids, schedule, ...profData } = professional;

  const { data: result, error } = await supabase
    .from("professionals")
    .insert(profData)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Link services
  if (service_ids && service_ids.length > 0) {
    const links = service_ids.map(sid => ({
      professional_id: result.id,
      service_id: sid,
    }));
    await supabase.from("professional_services").insert(links);
  }

  // Create schedule
  if (schedule && schedule.length > 0) {
    const schedules = schedule.map(s => ({
      professional_id: result.id,
      ...s,
    }));
    await supabase.from("professional_schedules").insert(schedules);
  }

  revalidatePath("/profissionais");
  return result;
}

export async function updateProfessional(id: string, updates: Record<string, unknown>) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("professionals")
    .update(updates)
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/profissionais");
}

export async function deleteProfessional(id: string) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("professionals")
    .update({ active: false })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/profissionais");
}
