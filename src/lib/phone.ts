/**
 * Normalizes a Brazilian phone number to the standard format: DDI+DDD+Number
 * e.g., 5537999575427 (55 + 37 + 999575427)
 *
 * Handles:
 * - 11 digits (DDD+9XXXXXXXX) → prepend 55
 * - 10 digits (DDD+XXXXXXXX, old format) → insert 9 after DDD, prepend 55
 * - 12 digits (55+DDD+XXXXXXXX) → insert 9 after DDD
 * - 13 digits (55+DDD+9XXXXXXXX) → already correct
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 13 && digits.startsWith("55")) return digits;
  if (digits.length === 11) return `55${digits}`;
  if (digits.length === 12 && digits.startsWith("55")) {
    // 55 + DD + 8 digits → insert 9 after DDD (position 4)
    return `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }
  if (digits.length === 10) {
    // DD + 8 digits → insert 9 after DDD, prepend 55
    return `55${digits.slice(0, 2)}9${digits.slice(2)}`;
  }

  // Fallback: return as-is (international or non-standard)
  return digits;
}

/**
 * Extracts the last 11 digits (DDD+Number) for matching contacts
 * regardless of whether DDI is present.
 */
export function phoneSuffix(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-11);
}
