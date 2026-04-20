import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/login", "/signup", "/b", "/api/"];
const AUTH_ROUTES = ["/login", "/signup"];
const GATE_WHITELIST = [
  "/conta/planos",
  "/conta/faturamento",
  "/conta",
  "/onboarding",
  "/logout",
  "/api/",
];
const ONBOARDING_WHITELIST = ["/onboarding", "/conta", "/logout", "/api/"];

// ─── Edge-compatible admin token validation (Web Crypto API) ─────────────────
async function validateAdminTokenEdge(token: string): Promise<boolean> {
  try {
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) return false;

    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [b64, sig] = parts;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Decode base64url sig
    const padded = sig.replace(/-/g, "+").replace(/_/g, "/");
    const binStr = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const sigBytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) sigBytes[i] = binStr.charCodeAt(i);

    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(b64));
    if (!valid) return false;

    const payloadPadded = b64.replace(/-/g, "+").replace(/_/g, "/");
    const payloadJson = atob(payloadPadded + "=".repeat((4 - (payloadPadded.length % 4)) % 4));
    const payload = JSON.parse(payloadJson);
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ─── Admin routes — handled separately from Supabase auth ──────────────────
  if (pathname.startsWith("/admin")) {
    // API routes inside /admin are handled by their own route handlers
    if (pathname.startsWith("/admin/api")) {
      return NextResponse.next({ request });
    }

    const adminToken = request.cookies.get("barberflow_admin_token")?.value || "";
    const isAdminAuthenticated = adminToken ? await validateAdminTokenEdge(adminToken) : false;

    // /admin (login page) — redirect to dashboard if already authenticated
    if (pathname === "/admin") {
      if (isAdminAuthenticated) {
        return NextResponse.redirect(new URL("/admin/dashboard", request.url));
      }
      return NextResponse.next({ request });
    }

    // All other /admin/* routes — require admin auth
    if (!isAdminAuthenticated) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public routes (booking page, webhooks, etc.)
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    if (user && AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Protected routes — require auth
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // ─── Check for admin impersonation — bypass subscription + onboarding gates ─
  const impersonateToken = request.cookies.get("barberflow_impersonate")?.value || "";
  if (impersonateToken) {
    const impersonateValid = await validateAdminTokenEdge(impersonateToken);
    if (impersonateValid) {
      // Admin is impersonating — allow access to all app routes, skip gates
      return supabaseResponse;
    }
  }

  // ─── Fetch user profile with tenant_id in a single query ───
  const { data: profile } = await supabase
    .from("users")
    .select("onboarding_completed, tenant_id")
    .eq("id", user.id)
    .single();

  // ─── No profile yet (cascade still in progress or failed) → send to onboarding ───
  if (!profile) {
    if (!ONBOARDING_WHITELIST.some((route) => pathname.startsWith(route))) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // ─── Onboarding Gate ───
  if (!profile.onboarding_completed) {
    if (!ONBOARDING_WHITELIST.some((route) => pathname.startsWith(route))) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
  }

  // ─── Subscription Gate ───
  // Check if subscription is active or in trial
  if (profile?.tenant_id) {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("status, trial_ends_at, current_period_end, plan_id")
      .eq("tenant_id", profile.tenant_id)
      .single();

    if (subscription) {
      const now = new Date();
      let hasAccess = false;

      if (subscription.status === "active") {
        // Active subscription — check period end
        hasAccess =
          !subscription.current_period_end ||
          new Date(subscription.current_period_end) > now;
      } else if (subscription.status === "trial") {
        // Trial — check trial end date
        hasAccess =
          !subscription.trial_ends_at ||
          new Date(subscription.trial_ends_at) > now;
      }
      // All other statuses (past_due, canceled, expired) → hasAccess stays false

      if (!hasAccess) {
        // Subscription expired — only allow whitelist routes
        if (!GATE_WHITELIST.some((route) => pathname.startsWith(route))) {
          const url = request.nextUrl.clone();
          url.pathname = "/conta/planos";
          return NextResponse.redirect(url);
        }
      }

      // ─── Trial Banner Headers ───
      // Pass subscription info so pages can render a countdown banner
      supabaseResponse.headers.set(
        "x-subscription-status",
        subscription.status
      );
      if (subscription.trial_ends_at) {
        supabaseResponse.headers.set(
          "x-trial-ends-at",
          subscription.trial_ends_at
        );
        const trialEnd = new Date(subscription.trial_ends_at);
        const daysLeft = Math.max(
          0,
          Math.ceil(
            (trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          )
        );
        supabaseResponse.headers.set(
          "x-trial-days-remaining",
          String(daysLeft)
        );
      }
      if (subscription.current_period_end) {
        supabaseResponse.headers.set(
          "x-current-period-end",
          subscription.current_period_end
        );
      }
      if (subscription.plan_id) {
        supabaseResponse.headers.set(
          "x-subscription-plan",
          subscription.plan_id
        );
      }
    }
  }

  return supabaseResponse;
}
