import type { FastifyRequest, FastifyServerOptions } from "fastify";

export function createLoggerOptions(nodeEnv: string): NonNullable<FastifyServerOptions["logger"]> {
  return {
    level: nodeEnv === "development" ? "debug" : "info",
    base: {
      service: "feishu-sign-preview",
      env: nodeEnv,
    },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-lark-signature",
        "headers.authorization",
        "headers.cookie",
        "headers.x-lark-signature",
      ],
      remove: true,
    },
  };
}

export function createRequestLogMeta(
  request: FastifyRequest,
  route: string,
  extra: Record<string, unknown> = {},
) {
  return {
    route,
    requestId: request.id,
    method: request.method,
    ...extra,
  };
}
