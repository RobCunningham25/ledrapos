/**
 * Formats an integer amount in cents to South African Rand display format.
 * @param cents - Amount in cents (integer)
 * @returns Formatted string e.g. "R 35.00"
 */
export function formatCents(cents: number): string {
  const rands = (cents / 100).toFixed(2);
  return `R ${rands}`;
}
