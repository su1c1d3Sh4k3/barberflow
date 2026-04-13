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
      .from("conversation_states")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .select("id");

    if (error) return apiError(error.message, 500);

    return ok({ deleted_count: data?.length || 0 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao limpar estados";
    return apiError(message, 500);
  }
}
