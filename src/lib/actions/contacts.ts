"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getContacts(tenantId: string, status?: string) {
  const supabase = createServerSupabaseClient();
  let query = supabase
    .from("contacts")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (status && status !== "todos") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getContact(id: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createContact(contact: {
  tenant_id: string;
  name: string;
  phone: string;
  birthday?: string;
  tags?: string[];
  notes?: string;
  source?: string;
}) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert(contact)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/contatos");
  return data;
}

export async function updateContact(id: string, updates: Record<string, unknown>) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/contatos");
}

export async function toggleContactIA(id: string, enabled: boolean) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("contacts")
    .update({ ia_enabled: enabled })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/contatos");
}

export async function deleteContact(id: string) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/contatos");
}

export async function getContactAppointments(contactId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(`
      *,
      professionals(name),
      appointment_services(services(name, price))
    `)
    .eq("contact_id", contactId)
    .order("start_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getContactMessages(contactId: string, limit = 50) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data || [];
}
