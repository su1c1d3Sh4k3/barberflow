import { NextRequest } from "next/server";
import { validateAuth, isAuthError, validateBody, isValidationError, ok, apiError, db } from "../_helpers";
import { appointmentSchema } from "@/lib/validations/service";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const p = req.nextUrl.searchParams;

  let query = db()
    .from("appointments")
    .select("*, contacts(name, phone), professionals(name), appointment_services(*, services(name))")
    .eq("tenant_id", auth.tenantId);

  if (p.get("professional_id")) query = query.eq("professional_id", p.get("professional_id")!);
  if (p.get("status")) query = query.eq("status", p.get("status")!);
  if (p.get("date_from")) query = query.gte("start_at", p.get("date_from")!);
  if (p.get("date_to")) query = query.lte("start_at", p.get("date_to")!);

  const { data, error } = await query.order("start_at", { ascending: true }).limit(100);
  if (error) return apiError(error.message, 500);
  return ok(data);
}

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const raw = await req.json();
  const validated = validateBody(appointmentSchema, raw);
  if (isValidationError(validated)) return validated;
  const body = validated.data;
  const supabase = db();

  try {
    // 1. Resolve or upsert contact
    let contactId = body.contact_id;
    if (!contactId) {
      const { data: contact, error: contactErr } = await supabase
        .from("contacts")
        .upsert(
          { phone: body.client_phone, name: body.client_name, tenant_id: auth.tenantId },
          { onConflict: "tenant_id,phone" }
        )
        .select("id")
        .single();
      if (contactErr) return apiError(contactErr.message, 500);
      contactId = contact.id;
    }

    // 2. Fetch services and calculate duration + price
    const serviceIds: string[] = body.service_ids || (body.service_id ? [body.service_id] : []);
    const { data: services } = await supabase
      .from("services")
      .select("id, duration_min, price")
      .in("id", serviceIds);
    if (!services || services.length === 0) return apiError("No valid services found", 400);

    const totalDuration = services.reduce((s: number, sv: { duration_min: number }) => s + sv.duration_min, 0);
    let totalPrice = services.reduce((s: number, sv: { price: number }) => s + Number(sv.price), 0);

    const startAt = new Date(body.start_at);
    const endAt = new Date(startAt.getTime() + totalDuration * 60000);

    // 3. Validate coupon if provided
    let discountAmount = 0;
    if (body.coupon_code) {
      const { data: coupon } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", body.coupon_code)
        .eq("tenant_id", auth.tenantId)
        .eq("active", true)
        .single();

      if (coupon) {
        discountAmount = coupon.discount_type === "percentage"
          ? totalPrice * (coupon.discount_value / 100)
          : coupon.discount_value;
        totalPrice = Math.max(0, totalPrice - discountAmount);
      }
    }

    // 4. Get default company
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("tenant_id", auth.tenantId)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();

    // 5. Create appointment with advisory lock (atomic check+insert)
    const { data: apptResult, error: apptErr } = await supabase.rpc("create_appointment_locked", {
      p_tenant_id: auth.tenantId,
      p_company_id: body.company_id || company?.id,
      p_contact_id: contactId,
      p_professional_id: body.professional_id,
      p_start_at: startAt.toISOString(),
      p_end_at: endAt.toISOString(),
      p_total_price: totalPrice,
      p_discount_amount: discountAmount,
      p_coupon_code: body.coupon_code || null,
      p_source: body.source || "api",
      p_notes: body.notes || null,
    });

    if (apptErr) {
      if (apptErr.message.includes("SLOT_CONFLICT")) {
        return apiError("Time slot conflict", 409);
      }
      return apiError(apptErr.message, 500);
    }

    const appt = apptResult;

    // 6. Insert appointment_services
    const apptServices = services.map((sv: { id: string; price: number; duration_min: number }) => ({
      appointment_id: appt.id,
      service_id: sv.id,
      price_at_time: sv.price,
      tenant_id: auth.tenantId,
    }));
    const { error: svcError } = await supabase.from("appointment_services").insert(apptServices);
    if (svcError) return apiError(svcError.message, 500);

    // 7. Log to appointment_history
    await supabase.from("appointment_history").insert({
      appointment_id: appt.id,
      action: "created",
      performed_by: "system",
      tenant_id: auth.tenantId,
    });

    // 8. Update contact status
    await supabase
      .from("contacts")
      .update({ status: "agendado", last_appointment_at: startAt.toISOString() })
      .eq("id", contactId);

    // Audit log
    await logAudit(auth.tenantId, null, "create", "appointment", appt.id, {
      professional_id: body.professional_id,
      contact_id: contactId,
      start_at: startAt.toISOString(),
    });

    return ok(appt, 201);
  } catch (e: unknown) {
    return apiError(e instanceof Error ? e.message : "Internal error", 500);
  }
}
