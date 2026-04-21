import Fastify from "fastify";
import { pathToFileURL } from "node:url";

import { config } from "./config.js";
import { createLoggerOptions } from "./lib/logger.js";
import { createDebugRoute } from "./routes/debug.js";
import { createHandlerRoute } from "./routes/handler.js";
import { indexRoute } from "./routes/index.js";
import { PreviewService } from "./services/preview-service.js";

export async function buildApp() {
  const app = Fastify({
    logger: createLoggerOptions(config.nodeEnv),
  });

  const previewService = new PreviewService(config);

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "Unhandled request error.");
    reply.code(500).send({
      error: "Internal server error.",
    });
  });

  await app.register(indexRoute);
  await app.register(createDebugRoute(previewService));
  await app.register(createHandlerRoute(previewService));

  return app;
}

async function bootstrap() {
  const app = await buildApp();

  try {
    await app.listen({
      host: config.host,
      port: config.port,
    });
    app.log.info({ host: config.host, port: config.port }, "Server listening.");
  } catch (error) {
    app.log.error({ err: error }, "Failed to start server.");
    process.exit(1);
  }
}

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === entryHref) {
  void bootstrap();
}
