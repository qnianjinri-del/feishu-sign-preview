import type { FastifyPluginAsync } from "fastify";

import type { AppConfig } from "../config.js";

export function createHealthRoutes(appConfig: AppConfig): FastifyPluginAsync {
  return async (app) => {
    app.get("/health/live", async () => ({ status: "ok" }));
    app.get("/health/ready", async () => ({
      status: "ok",
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
