import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Extract tenant_id from user's session cookie.
 * Works in API routes called from the browser (no service-role key needed).
 */
export async function getTenantFromSession(request: NextRequest): Promise<string | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // API routes can't set cookies on the response here,
          // but getUser() still works for reading the session.
        },
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.app_metadata?.tenant_id || null;
}
