import "dotenv/config";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = await buildApp({ config, logger: true });

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    {
      mode: config.mode,
      paymentsEnabled: config.paymentsEnabled,
      aiEnabled: config.aiEnabled,
    },
    "xuyueji api listening",
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
