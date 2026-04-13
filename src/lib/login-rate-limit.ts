/**
 * Client-side rate limiter for login attempts.
 * Limits login attempts per email to prevent brute force.
 * For production, server-side rate limiting should also be in place.
 */

interface LoginAttempt {
  count: number;
  firstAttemptAt: number;
}

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const loginAttempts = new Map<string, LoginAttempt>();

export interface LoginRateLimitResult {
  allowed: boolean;
  remainingMinutes: number;
}

export function checkLoginRateLimit(email: string): LoginRateLimitResult {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || now - entry.firstAttemptAt >= LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttemptAt: now });
    return { allowed: true, remainingMinutes: 0 };
  }

  entry.count++;

  if (entry.count > LOGIN_MAX_ATTEMPTS) {
    const elapsed = now - entry.firstAttemptAt;
    const remainingMs = LOGIN_WINDOW_MS - elapsed;
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
    return { allowed: false, remainingMinutes };
  }

  return { allowed: true, remainingMinutes: 0 };
}

export function resetLoginRateLimit(email: string): void {
  loginAttempts.delete(email.toLowerCase().trim());
}
