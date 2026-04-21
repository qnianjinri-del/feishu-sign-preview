import * as Lark from "@larksuiteoapi/node-sdk";
import type { FastifyBaseLogger } from "fastify";

import type { AppConfig } from "../config.js";
import type { FeishuCallbackEnvelope, PreviewContext } from "../types/index.js";
import { getString, isRecord } from "../utils/validation.js";
import { PreviewService } from "../services/preview-service.js";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function createFeishuDispatcher(
  appConfig: AppConfig,
  previewService: PreviewService,
  logger: FastifyBaseLogger,
) {
  return new Lark.EventDispatcher({
    verificationToken: appConfig.feishuVerificationToken,
    encryptKey: appConfig.feishuEncryptKey,
    logger,
  }).register({
    "url.preview.get": async (data: Record<string, unknown>) => {
      const contextData = asRecord(data.context);
      const sourceUrl = getString(data.url) ?? getString(contextData?.url);
      const operator = asRecord(data.operator);
      const context: PreviewContext = {
        sourceUrl: sourceUrl ?? appConfig.publicBaseUrl,
        host: getString(data.host),
        previewToken: getString(data.preview_token) ?? getString(contextData?.preview_token),
        openMessageId: getString(data.open_message_id) ?? getString(contextData?.open_message_id),
        openChatId: getString(data.open_chat_id) ?? getString(contextData?.open_chat_id),
        tenantKey: getString(data.tenant_key),
        appId: getString(data.app_id),
        operator: {
          tenantKey: getString(operator?.tenant_key),
          userId: getString(operator?.user_id),
          openId: getString(operator?.open_id),
        },
      };

      const preview = sourceUrl
        ? await previewService.buildFromSourceUrl(sourceUrl, context)
        : await previewService.buildFallback(context);

      return preview.response;
    },
  });
}

export function isChallengeRequest(payload: unknown, encryptKey: string): boolean {
  if (!isRecord(payload)) {
    return false;
  }

  try {
    return Lark.generateChallenge(payload, { encryptKey }).isChallenge;
  } catch {
    return false;
  }
}

export function buildChallengeResponse(payload: FeishuCallbackEnvelope, encryptKey: string) {
  return Lark.generateChallenge(payload, { encryptKey }).challenge;
}

export function buildDispatcherPayload(
  payload: FeishuCallbackEnvelope,
  headers: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...payload,
    headers,
  };
}

export function shouldCheckVerificationToken(
  payload: FeishuCallbackEnvelope,
  encryptKey: string,
  verificationToken: string,
): boolean {
  return Boolean(verificationToken) && !(payload.encrypt && encryptKey);
}

export function hasValidVerificationToken(
  payload: FeishuCallbackEnvelope,
  verificationToken: string,
): boolean {
  if (!verificationToken) {
    return true;
  }

  const bodyToken = payload.token ?? payload.header?.token;
  return bodyToken === verificationToken;
}
