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

export async function updateSession(request: NextRequest) {
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

  const pathname = request.nextUrl.pathname;

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
