import { NextRequest } from "next/server";
import { ok, apiError, db } from "../_helpers";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(req: NextRequest) {
  const { data, error } = await db()
    .from("plans")
    .select("*")
    .eq("active", true)
    .order("price_monthly", { ascending: true });

  if (error) return apiError(error.message, 500);
  return ok(data);
}
