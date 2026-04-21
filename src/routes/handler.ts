import type { FastifyPluginAsync } from "fastify";

import { config } from "../config.js";
import { TimeoutError, withTimeout } from "../lib/async.js";
import {
  buildChallengeResponse,
  buildDispatcherPayload,
  createFeishuDispatcher,
  hasValidVerificationToken,
  isChallengeRequest,
  shouldCheckVerificationToken,
} from "../lib/feishu.js";
import { createRequestLogMeta } from "../lib/logger.js";
import { PreviewService } from "../services/preview-service.js";
import type { FeishuCallbackEnvelope } from "../types/index.js";
import { isRecord } from "../utils/validation.js";

export function createHandlerRoute(previewService: PreviewService): FastifyPluginAsync {
  return async (app) => {
    const dispatcher = createFeishuDispatcher(config, previewService, app.log);

    app.post("/api/handler", async (request, reply) => {
      const body = request.body;
      const payload = isRecord(body) ? (body as FeishuCallbackEnvelope) : undefined;
      const sourceUrl = payload?.event?.context?.url;
      const eventType = payload?.header?.event_type ?? payload?.type ?? "unknown";
      const logMeta = createRequestLogMeta(request, "/api/handler", {
        eventType,
        sourceUrl,
      });

      request.log.info(logMeta, "Received Feishu callback.");

      if (!isRecord(body)) {
        const fallback = await previewService.buildFallback({ sourceUrl: config.publicBaseUrl });
        request.log.warn({ ...logMeta, degraded: true }, "Invalid callback body, returned fallback payload.");
        return reply.send(fallback.response);
      }

      const safePayload = body as FeishuCallbackEnvelope;

      if (isChallengeRequest(safePayload, config.feishuEncryptKey)) {
        if (
          shouldCheckVerificationToken(safePayload, config.feishuEncryptKey, config.feishuVerificationToken) &&
          !hasValidVerificationToken(safePayload, config.feishuVerificationToken)
        ) {
          request.log.warn(logMeta, "Rejected challenge request because verification token was invalid.");
          return reply.code(401).send({ error: "Invalid verification token." });
        }

        request.log.info(logMeta, "Responded to url_verification challenge.");
        return reply.send(buildChallengeResponse(safePayload, config.feishuEncryptKey));
      }

      if (
        shouldCheckVerificationToken(safePayload, config.feishuEncryptKey, config.feishuVerificationToken) &&
        !hasValidVerificationToken(safePayload, config.feishuVerificationToken)
      ) {
        request.log.warn(logMeta, "Rejected callback because verification token was invalid.");
        return reply.code(401).send({ error: "Invalid verification token." });
      }

      try {
        const result = await withTimeout(
          dispatcher.invoke(buildDispatcherPayload(safePayload, request.headers as Record<string, unknown>)),
          config.handlerTimeoutMs,
          `Handler timed out after ${config.handlerTimeoutMs}ms.`,
        );

        if (result) {
          request.log.info(logMeta, "Feishu callback handled successfully.");
          return reply.send(result);
        }
      } catch (error) {
        request.log.error(
          { ...logMeta, err: error, degraded: true, timeout: error instanceof TimeoutError },
          "Failed to handle Feishu callback, returned fallback payload.",
        );
      }

      const safeFallback = await previewService.buildFallback({
        sourceUrl: sourceUrl ?? config.publicBaseUrl,
      });
      return reply.send(safeFallback.response);
    });
  };
}
