import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "@/app/api/_helpers";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const p = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(p.get("limit") || "20"), 100);
  const offset = parseInt(p.get("offset") || "0");

  const { data, error } = await db()
    .from("invoices")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .order("due_date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return apiError(error.message, 500);
  return ok(data);
}
