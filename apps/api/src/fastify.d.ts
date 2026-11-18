import "fastify";

import type { SessionContext } from "./auth/service.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: SessionContext | null;
  }
}
