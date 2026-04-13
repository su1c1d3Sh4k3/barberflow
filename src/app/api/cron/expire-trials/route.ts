import { NextRequest } from "next/server";
import { ok, apiError, db } from "@/app/api/_helpers";

function validateCron(request: NextRequest): boolean {
  const secret = request.headers.get("x-cron-secret");
  return secret === process.env.CRON_SECRET;
}

export async function POST(request: NextRequest) {
  if (!validateCron(request)) return apiError("Unauthorized", 401);

  const supabase = db();

  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("status", "trial")
      .lt("trial_ends_at", new Date().toISOString())
      .select("id");

    if (error) return apiError(error.message, 500);

    return ok({ expired_count: data?.length || 0 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao expirar trials";
    return apiError(message, 500);
  }
}
