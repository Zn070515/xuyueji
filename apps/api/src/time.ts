/**
 * PostgreSQL returns timestamps such as "2026-11-18 09:31:38+00". The HTTP
 * contract promises ISO 8601 strings, so normalize at the DTO boundary.
 */
export function toIso(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

export function toIsoOrNull(value: string | null): string | null {
  return value === null ? null : toIso(value);
}
