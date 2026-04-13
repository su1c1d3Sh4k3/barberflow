import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../../_helpers";

type Ctx = { params: Promise<{ categoryId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { categoryId } = await params;

  const { data, error } = await db()
    .from("services")
    .select("*, service_categories(name)")
    .eq("tenant_id", auth.tenantId)
    .eq("category_id", categoryId)
    .eq("active", true)
    .order("name");

  if (error) return apiError(error.message, 500);
  return ok(data);
}
