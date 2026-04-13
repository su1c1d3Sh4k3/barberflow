/**
 * Validates a Brazilian CNPJ using the standard algorithm (2 check digits).
 * Accepts raw digits (14 chars) or formatted (XX.XXX.XXX/XXXX-XX).
 * Returns true if valid, false otherwise.
 */
export function validateCNPJ(cnpj: string): boolean {
  // Strip formatting
  const digits = cnpj.replace(/[.\-/]/g, "");

  // Must be exactly 14 digits
  if (!/^\d{14}$/.test(digits)) return false;

  // Reject known invalid patterns (all same digit)
  if (/^(\d)\1{13}$/.test(digits)) return false;

  // Calculate first check digit
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]) * weights1[i];
  }
  let remainder = sum % 11;
  const check1 = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(digits[12]) !== check1) return false;

  // Calculate second check digit
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(digits[i]) * weights2[i];
  }
  remainder = sum % 11;
  const check2 = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(digits[13]) !== check2) return false;

  return true;
}

/**
 * Formats a CNPJ string to XX.XXX.XXX/XXXX-XX.
 */
export function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}
