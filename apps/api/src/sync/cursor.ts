const PREFIX = "xyj1";

export class InvalidCursorError extends Error {
  constructor(value: string) {
    super(`Invalid sync cursor: ${value}`);
    this.name = "InvalidCursorError";
  }
}

export function encodeCursor(sequence: number): string {
  return Buffer.from(`${PREFIX}:${sequence}`, "utf8").toString("base64url");
}

export function decodeCursor(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  let decoded: string;
  try {
    decoded = Buffer.from(value, "base64url").toString("utf8");
  } catch {
    throw new InvalidCursorError(value);
  }
  const [prefix, sequenceRaw] = decoded.split(":");
  const sequence = Number(sequenceRaw);
  if (prefix !== PREFIX || !Number.isSafeInteger(sequence) || sequence < 0) {
    throw new InvalidCursorError(value);
  }
  return sequence;
}
