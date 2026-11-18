import type { HealthResponse } from "@xuyueji/contracts";
import type { FastifyPluginAsync } from "fastify";

import type { AppConfig } from "../config.js";
import { API_SERVICE_NAME, APP_VERSION } from "../version.js";

export function healthRoutes(config: AppConfig): FastifyPluginAsync {
  return async (app) => {
    const handler = async (): Promise<HealthResponse> => ({
      status: "ok",
      service: API_SERVICE_NAME,
      version: APP_VERSION,
      mode: config.mode,
      time: new Date().toISOString(),
    });

    app.get("/health", handler);
    app.get("/api/health", handler);
  };
}
