import type { FastifyPluginAsync } from "fastify";

import type { AppConfig } from "../config.js";
import { SYNC_API_VERSION } from "../types/task-sync.js";

const GATEWAY_VERSION = "2.0.0";

export function createHealthRoutes(appConfig: AppConfig): FastifyPluginAsync {
  return async (app) => {
    app.get("/health/live", async () => ({ status: "ok" }));
    app.get("/health/ready", async () => ({
      status: "ok",
      gatewayVersion: GATEWAY_VERSION,
      syncApiVersion: SYNC_API_VERSION,
      syncConfigured: Boolean(
        appConfig.floatlistClientToken
        && appConfig.feishuAppId
        && appConfig.feishuAppSecret
        && appConfig.bitableAppToken
        && appConfig.bitableTableId
      ),
    }));
  };
}
