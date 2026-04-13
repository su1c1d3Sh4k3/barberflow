import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../../_helpers";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");

  const { data, error } = await db()
    .from("messages")
    .select("*")
    .eq("contact_id", id)
    .eq("tenant_id", auth.tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return apiError(error.message, 500);
  return ok(data);
}
