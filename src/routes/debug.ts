import type { FastifyPluginAsync } from "fastify";

import { config } from "../config.js";
import { TimeoutError, withTimeout } from "../lib/async.js";
import { createRequestLogMeta } from "../lib/logger.js";
import { buildSourceUrlFromParams } from "../lib/url.js";
import { PreviewService } from "../services/preview-service.js";
import type { PreviewContext, PreviewParamsInput } from "../types/index.js";
import { previewDebugQuerySchema } from "../utils/validation.js";

export function createDebugRoute(previewService: PreviewService): FastifyPluginAsync {
  return async (app) => {
    app.get("/api/debug/preview", async (request, reply) => {
      const parsed = previewDebugQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "Invalid query parameters.",
          details: parsed.error.flatten(),
        });
      }

      const input = parsed.data;
      const sourceUrl =
        input.url ??
        buildSourceUrlFromParams(config.publicBaseUrl, {
          t: input.t,
          k: input.k,
          u: input.u,
          slot: input.slot,
        });

      const context: PreviewContext = {
        sourceUrl,
        host: "debug",
      };

      const logMeta = createRequestLogMeta(request, "/api/debug/preview", { sourceUrl });

      try {
        const preview = await withTimeout(
          input.url
            ? previewService.buildFromSourceUrl(sourceUrl, context)
            : previewService.buildFromParams(input as PreviewParamsInput, context, sourceUrl),
          config.debugTimeoutMs,
          `Debug preview timed out after ${config.debugTimeoutMs}ms.`,
        );

        request.log.info(logMeta, "Debug preview generated.");

        return reply.send({
          sourceUrl,
          raw: preview.raw,
          resolved: {
            text: preview.text,
            iconKey: preview.iconKey,
            jumpUrl: preview.jumpUrl,
          },
          feishuResponse: preview.response,
        });
      } catch (error) {
        const fallback = await previewService.buildFallback({ sourceUrl });
        request.log.error(
          { ...logMeta, err: error, degraded: true, timeout: error instanceof TimeoutError },
          "Debug preview failed, returned fallback payload.",
        );

        return reply.send({
          sourceUrl,
          degraded: true,
          warning: error instanceof Error ? error.message : "Unknown debug preview error.",
          raw: fallback.raw,
          resolved: {
            text: fallback.text,
            iconKey: fallback.iconKey,
            jumpUrl: fallback.jumpUrl,
          },
          feishuResponse: fallback.response,
        });
      }
    });
  };
}
