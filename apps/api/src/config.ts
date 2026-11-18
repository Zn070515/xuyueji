export type AppMode = "demo" | "production";

export interface AppConfig {
  readonly port: number;
  readonly host: string;
  readonly mode: AppMode;
  readonly demoMode: boolean;
  readonly paymentsEnabled: boolean;
  readonly aiEnabled: boolean;
  readonly databaseUrl: string | null;
  readonly mockPaymentSecret: string;
  readonly rateLimitMax: number;
  readonly corsOrigins: readonly string[];
  readonly trustProxy: boolean;
}

const DEV_MOCK_SECRET = "xuyueji-dev-only-mock-secret";

function parsePort(value: string | undefined): number {
  const port = Number(value ?? "3000");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`API_PORT must be a valid port, received: ${value}`);
  }
  return port;
}

function parseOrigins(value: string | undefined): readonly string[] {
  const defaults = ["http://127.0.0.1:5173", "http://localhost:5173"];
  if (!value) {
    return defaults;
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseRateLimit(value: string | undefined): number {
  const parsed = Number(value ?? "120");
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`RATE_LIMIT_MAX must be a positive integer, received: ${value}`);
  }
  return parsed;
}

/**
 * Safety defaults are deliberately conservative:
 * - demo mode is on unless DEMO_MODE=false
 * - payment and AI are off unless both production mode and an explicit flag
 *
 * M0 must never accidentally expose a paid model path.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const demoMode = env.DEMO_MODE !== "false";
  const paymentsEnabled = !demoMode && env.PAYMENTS_ENABLED === "true";
  const aiEnabled = !demoMode && env.AI_ENABLED === "true";

  return {
    port: parsePort(env.API_PORT),
    host: env.API_HOST?.trim() || "127.0.0.1",
    mode: demoMode ? "demo" : "production",
    demoMode,
    paymentsEnabled,
    aiEnabled,
    databaseUrl: env.DATABASE_URL?.trim() || null,
    mockPaymentSecret: env.MOCK_PAYMENT_SECRET?.trim() || DEV_MOCK_SECRET,
    rateLimitMax: parseRateLimit(env.RATE_LIMIT_MAX),
    corsOrigins: parseOrigins(env.CORS_ORIGINS),
    trustProxy: env.TRUST_PROXY === "true",
  };
}
