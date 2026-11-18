export interface Clock {
  now(): string;
}

export const systemClock: Clock = {
  now() {
    return new Date().toISOString();
  },
};

export function assertIsoTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new TypeError(`Expected an ISO timestamp, received: ${value}`);
  }
  return new Date(parsed).toISOString();
}
