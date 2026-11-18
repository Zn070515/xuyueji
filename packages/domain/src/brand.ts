/**
 * Nominal types for identifiers and numeric quantities.
 *
 * The compiler prevents passing a raw string where a UserId is expected. At
 * runtime these are plain strings/numbers; validation happens at the trust
 * boundary (HTTP contracts, import adapters, database mapping).
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export function brandValue<T extends string, B extends string>(value: T, _brand: B): Brand<T, B> {
  return value as Brand<T, B>;
}

export function brandNumber<T extends number, B extends string>(value: T, _brand: B): Brand<T, B> {
  return value as Brand<T, B>;
}
