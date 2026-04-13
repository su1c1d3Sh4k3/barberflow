import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../_helpers";

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const body = await req.json();

  const { data, error } = await db()
    .from("waitlist")
    .insert({
      tenant_id: auth.tenantId,
      contact_id: body.contact_id,
      professional_id: body.professional_id,
      service_id: body.service_id,
      preferred_date: body.preferred_date,
      preferred_time_from: body.preferred_time_from,
      preferred_time_to: body.preferred_time_to,
      status: "waiting",
    })
    .select()
    .single();

  if (error) return apiError(error.message, 500);
  return ok(data, 201);
}
