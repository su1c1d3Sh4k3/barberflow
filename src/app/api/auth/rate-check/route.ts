import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side rate limiter for login attempts, keyed by IP.
 * Limit: 5 attempts per 15 minutes per IP.
 * In production, replace with Redis for multi-instance deployments.
 */

interface IpAttempt {
  count: number;
  firstAttemptAt: number;
}

const IP_MAX_ATTEMPTS = 5;
const IP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const ipAttempts = new Map<string, IpAttempt>();

// Cleanup expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  ipAttempts.forEach((entry, key) => {
    if (now - entry.firstAttemptAt >= IP_WINDOW_MS) {
      ipAttempts.delete(key);
    }
  });
}, 60_000);

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs; take the first (client)
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  // Fallback
  return "unknown";
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Validate body has email (just to confirm it's a login attempt)
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.email || typeof body.email !== "string") {
    return NextResponse.json(
      { success: false, error: "Email is required" },
      { status: 400 }
    );
  }

  const now = Date.now();
  const entry = ipAttempts.get(ip);

  // Window expired or first attempt
  if (!entry || now - entry.firstAttemptAt >= IP_WINDOW_MS) {
    ipAttempts.set(ip, { count: 1, firstAttemptAt: now });
    return NextResponse.json({ allowed: true });
  }

  entry.count++;

  if (entry.count > IP_MAX_ATTEMPTS) {
    const elapsed = now - entry.firstAttemptAt;
    const remainingMs = IP_WINDOW_MS - elapsed;
    const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

    return NextResponse.json(
      {
        allowed: false,
        retryAfter: retryAfterSeconds,
        error: "Too many login attempts. Try again later.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
        },
      }
    );
  }

  return NextResponse.json({ allowed: true });
}
