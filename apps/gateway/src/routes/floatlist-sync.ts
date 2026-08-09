import { timingSafeEqual } from "node:crypto";

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { MINIMUM_DESKTOP_VERSION, SYNC_API_VERSION } from "@floatlist/contracts";

import type { AppConfig } from "../config.js";
import { SyncConfigurationError } from "../services/bitable-task-repository.js";
import type { TaskSyncService } from "../services/task-sync-service.js";
import {
  SyncNotFoundError,
  SyncValidationError,
  SyncVersionConflictError,
} from "../services/task-sync-service.js";
import { mutationRequestSchema } from "../types/task-sync.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

function hasValidBearerToken(request: FastifyRequest, expected: string): boolean {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return false;
  const actual = authorization.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createFloatListSyncRoutes(
  syncService: TaskSyncService,
  appConfig: AppConfig,
): FastifyPluginAsync {
  return async (app) => {
    const rateLimits = new Map<string, RateLimitEntry>();

    app.addHook("onRequest", async (request, reply) => {
      if (!appConfig.floatlistClientToken) {
        return reply.code(503).send({ error: "FloatList sync is not configured." });
      }
      const now = Date.now();
      const windowMs = appConfig.floatlistRateLimitWindowSeconds * 1_000;
      const current = rateLimits.get(request.ip);
      const entry = !current || current.resetAt <= now
        ? { count: 1, resetAt: now + windowMs }
        : { count: current.count + 1, resetAt: current.resetAt };
      rateLimits.set(request.ip, entry);
      if (rateLimits.size > 10_000) {
        for (const [ip, value] of rateLimits) {
          if (value.resetAt <= now) rateLimits.delete(ip);
        }
      }
      if (entry.count > appConfig.floatlistRateLimitMaxRequests) {
        reply.header("Retry-After", Math.max(1, Math.ceil((entry.resetAt - now) / 1_000)));
        request.log.warn({ route: request.routeOptions.url, requestId: request.id }, "FloatList sync rate limit exceeded.");
        return reply.code(429).send({ error: "Too many FloatList sync requests." });
      }
      if (!hasValidBearerToken(request, appConfig.floatlistClientToken)) {
        request.log.warn({ route: request.routeOptions.url, requestId: request.id }, "Rejected FloatList sync authentication.");
        return reply.code(401).send({ error: "Invalid FloatList client token." });
      }
    });

    const upgradeRequired = (_request: FastifyRequest, reply: FastifyReply) => reply.code(426).send({
      error: "FloatList desktop 0.3.0 or newer is required by this gateway.",
      minimumDesktopVersion: MINIMUM_DESKTOP_VERSION,
      syncApiVersion: SYNC_API_VERSION,
    });
    app.get("/api/floatlist/v1/tasks", upgradeRequired);
    app.post("/api/floatlist/v1/mutations", upgradeRequired);

    app.get("/api/floatlist/v2/tasks", async (request, reply) => {
      try {
        const snapshot = await syncService.getSnapshot();
        const etag = `"${snapshot.version}"`;
        if (request.headers["if-none-match"] === etag) return reply.code(304).send();
        reply.header("ETag", etag);
        reply.header("Cache-Control", "private, no-cache");
        return reply.send(snapshot);
      } catch (error) {
        if (error instanceof SyncConfigurationError) {
          return reply.code(503).send({ error: error.message });
        }
        throw error;
      }
    });

    app.post(
      "/api/floatlist/v2/mutations",
      { bodyLimit: appConfig.floatlistSyncBodyLimit },
      async (request, reply) => {
        const parsed = mutationRequestSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "Invalid mutation request.", details: parsed.error.flatten() });
        }
        const idempotencyKey = request.headers["idempotency-key"];
        if (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 128) {
          return reply.code(400).send({ error: "A valid Idempotency-Key header is required." });
        }
        try {
          const snapshot = await syncService.applyMutations(parsed.data, idempotencyKey);
          reply.header("ETag", `"${snapshot.version}"`);
          return reply.send(snapshot);
        } catch (error) {
          if (error instanceof SyncVersionConflictError) {
            return reply.code(409).send({ error: error.message, snapshot: error.snapshot });
          }
          if (error instanceof SyncValidationError) return reply.code(422).send({ error: error.message });
          if (error instanceof SyncNotFoundError) return reply.code(404).send({ error: error.message });
          if (error instanceof SyncConfigurationError) return reply.code(503).send({ error: error.message });
          throw error;
        }
      },
    );
  };
}
