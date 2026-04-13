import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../_helpers";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const { primary_id, secondary_id } = body;

  if (!primary_id || !secondary_id) {
    return apiError("primary_id and secondary_id are required");
  }

  if (primary_id === secondary_id) {
    return apiError("primary_id and secondary_id must be different");
  }

  const supabase = db();

  // Validate both contacts exist and belong to the same tenant
  const { data: primary, error: primaryErr } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", primary_id)
    .eq("tenant_id", auth.tenantId)
    .single();

  if (primaryErr || !primary) {
    return apiError("Primary contact not found", 404);
  }

  const { data: secondary, error: secondaryErr } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", secondary_id)
    .eq("tenant_id", auth.tenantId)
    .single();

  if (secondaryErr || !secondary) {
    return apiError("Secondary contact not found", 404);
  }

  // Transfer appointments from secondary to primary
  await supabase
    .from("appointments")
    .update({ contact_id: primary_id })
    .eq("contact_id", secondary_id)
    .eq("tenant_id", auth.tenantId);

  // Transfer messages from secondary to primary
  await supabase
    .from("messages")
    .update({ contact_id: primary_id })
    .eq("contact_id", secondary_id)
    .eq("tenant_id", auth.tenantId);

  // Transfer appointment_history entries via appointments that were just moved
  // (appointment_history references appointment_id, not contact_id directly,
  //  so they are already transferred when we moved appointments)

  // Merge tags
  const mergedTags = Array.from(
    new Set([...(primary.tags || []), ...(secondary.tags || [])])
  );

  // Merge notes
  const mergedNotes = [primary.notes, secondary.notes].filter(Boolean).join("\n---\n");

  // Update primary contact with merged data
  await supabase
    .from("contacts")
    .update({
      tags: mergedTags.length > 0 ? mergedTags : null,
      notes: mergedNotes || null,
    })
    .eq("id", primary_id);

  // Delete the secondary contact
  await supabase
    .from("contacts")
    .delete()
    .eq("id", secondary_id)
    .eq("tenant_id", auth.tenantId);

  // Fetch updated primary contact
  const { data: merged } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", primary_id)
    .single();

  await logAudit(auth.tenantId, null, "merge", "contact", primary_id, {
    secondary_id,
    secondary_phone: secondary.phone,
    secondary_name: secondary.name,
  });

  return ok(merged);
}
