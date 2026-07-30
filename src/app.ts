import Fastify from "fastify";
import { pathToFileURL } from "node:url";

import { config, type AppConfig } from "./config.js";
import { createLoggerOptions } from "./lib/logger.js";
import { createDebugRoute } from "./routes/debug.js";
import { editorRoute } from "./routes/editor.js";
import { createFloatListSyncRoutes } from "./routes/floatlist-sync.js";
import { createHandlerRoute } from "./routes/handler.js";
import { createHealthRoutes } from "./routes/health.js";
import { indexRoute } from "./routes/index.js";
import { BitableDataProvider } from "./services/bitable-data-provider.js";
import { BitableTaskRepository } from "./services/bitable-task-repository.js";
import { PreviewService } from "./services/preview-service.js";
import { SlotService } from "./services/slot-service.js";
import { TaskSyncService } from "./services/task-sync-service.js";

interface BuildAppOptions {
  appConfig?: AppConfig;
  syncService?: TaskSyncService;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const appConfig = options.appConfig ?? config;
  const app = Fastify({
    logger: createLoggerOptions(appConfig.nodeEnv),
  });

  const bitableDataProvider = new BitableDataProvider({
    appId: appConfig.feishuAppId,
    appSecret: appConfig.feishuAppSecret,
    appToken: appConfig.bitableAppToken,
    tableId: appConfig.bitableTableId,
    viewId: appConfig.bitableViewId,
    resultFieldName: appConfig.bitableResultFieldName,
    statusFieldName: appConfig.bitableStatusFieldName,
    orderFieldName: appConfig.bitableOrderFieldName,
    parentIdFieldName: appConfig.bitableParentIdFieldName,
    targetStatus: appConfig.bitableTargetStatus,
    cacheTtlSeconds: appConfig.bitableCacheTtlSeconds,
    requestTimeoutMs: appConfig.bitableRequestTimeoutMs,
  });
  const previewService = new PreviewService(
    appConfig,
    undefined,
    undefined,
    new SlotService(bitableDataProvider),
  );
  const syncService = options.syncService ?? new TaskSyncService(
    new BitableTaskRepository({
      appId: appConfig.feishuAppId,
      appSecret: appConfig.feishuAppSecret,
      appToken: appConfig.bitableAppToken,
      tableId: appConfig.bitableTableId,
      resultFieldName: appConfig.bitableResultFieldName,
      statusFieldName: appConfig.bitableStatusFieldName,
      subtaskStatusFieldName: appConfig.bitableSubtaskStatusFieldName,
      childStatusFieldName: appConfig.bitableChildStatusFieldName,
      subtaskDataFieldName: appConfig.bitableSubtaskDataFieldName,
      syncIdFieldName: appConfig.bitableSyncIdFieldName,
      orderFieldName: appConfig.bitableOrderFieldName,
      archivedFieldName: appConfig.bitableArchivedFieldName,
      parentIdFieldName: appConfig.bitableParentIdFieldName,
      blockedReasonFieldName: appConfig.bitableBlockedReasonFieldName,
      targetStatus: appConfig.bitableTargetStatus,
      requestTimeoutMs: appConfig.bitableRequestTimeoutMs,
    }),
    {
      idempotencyTtlSeconds: appConfig.floatlistIdempotencyTtlSeconds,
      invalidatePreview: () => bitableDataProvider.invalidate(),
    },
  );

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "Unhandled request error.");
    reply.code(500).send({
      error: "Internal server error.",
    });
  });

  await app.register(indexRoute);
  await app.register(editorRoute);
  await app.register(createHealthRoutes(appConfig));
  await app.register(createDebugRoute(previewService, appConfig));
  await app.register(createHandlerRoute(previewService));
  await app.register(createFloatListSyncRoutes(syncService, appConfig));

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
