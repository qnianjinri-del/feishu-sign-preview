import type { AppConfig } from "../config.js";
import { buildEditorUrl, buildSourceUrlFromParams, isSafeRedirectUrl, toMultiUrl } from "../lib/url.js";
import type {
  FeishuCardPreview,
  PreviewBuildResult,
  PreviewContext,
  PreviewParamsInput,
} from "../types/index.js";
import { normalizePreviewText } from "../utils/text.js";

import { IconService } from "./icon-service.js";
import { SlotService } from "./slot-service.js";
import { VariableService } from "./variable-service.js";

export class PreviewService {
  constructor(
    private readonly appConfig: AppConfig,
    private readonly iconService = new IconService(),
    private readonly variableService = new VariableService(),
    private readonly slotService = new SlotService(),
  ) {}

  async buildFromSourceUrl(sourceUrl: string, context: PreviewContext): Promise<PreviewBuildResult> {
    const { parsePreviewParamsFromUrl } = await import("../lib/url.js");
    const params = parsePreviewParamsFromUrl(sourceUrl);
    return this.buildFromParams(params, context, sourceUrl);
  }

  async buildFromParams(
    params: PreviewParamsInput,
    context: PreviewContext,
    sourceUrl = buildSourceUrlFromParams(this.appConfig.publicBaseUrl, params),
  ): Promise<PreviewBuildResult> {
    const slotValue = params.t ? undefined : await this.slotService.resolve(params.slot, context);
    const candidateText = params.t ?? slotValue;
    const resolvedText = await this.variableService.resolveText(candidateText ?? " ", context);
    const text = normalizePreviewText(resolvedText, this.appConfig.maxTextLength);
    const iconKey = this.iconService.resolveIconKey(params.k);
    const jumpUrl = isSafeRedirectUrl(params.u ?? "")
      ? (params.u as string)
      : buildEditorUrl(this.appConfig.publicBaseUrl, {
          t: params.t,
          k: params.k,
          slot: params.slot,
        });

    const card = this.appConfig.enableCardPreview
      ? this.buildCardPreview({ text, jumpUrl, iconKey, sourceUrl })
      : undefined;

    return {
      text,
      iconKey,
      jumpUrl,
      sourceUrl,
      slot: params.slot,
      raw: params,
      response: {
        inline: {
          title: text,
          image_key: iconKey,
          url: toMultiUrl(jumpUrl),
        },
        card,
      },
    };
  }

  async buildFallback(context?: Partial<PreviewContext>): Promise<PreviewBuildResult> {
    const sourceUrl = context?.sourceUrl ?? this.appConfig.publicBaseUrl;
    return this.buildFromParams({}, { sourceUrl }, sourceUrl);
  }

  private buildCardPreview(input: {
    text: string;
    jumpUrl: string;
    iconKey?: string | undefined;
    sourceUrl: string;
  }): FeishuCardPreview {
    const markdownText = input.text === " " ? "个性签名预览" : input.text;

    return {
      type: "raw",
      data: {
        config: {
          wide_screen_mode: true,
          enable_forward: true,
        },
        header: {
          title: {
            tag: "plain_text",
            content: "飞书链接预览",
          },
        },
        elements: [
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: markdownText,
            },
          },
          {
            tag: "note",
            elements: [
              input.iconKey
                ? {
                    tag: "img",
                    img_key: input.iconKey,
                    alt: {
                      tag: "plain_text",
                      content: "icon",
                    },
                  }
                : {
                    tag: "plain_text",
                    content: "使用默认链接图标",
                  },
              {
                tag: "plain_text",
                content: input.sourceUrl,
              },
            ],
          },
          {
            tag: "action",
            actions: [
              {
                tag: "button",
                text: {
                  tag: "plain_text",
                  content: "打开跳转地址",
                },
                type: "primary",
                multi_url: toMultiUrl(input.jumpUrl),
              },
            ],
          },
        ],
      },
    };
  }
}
