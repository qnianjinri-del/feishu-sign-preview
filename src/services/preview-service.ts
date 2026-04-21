import type { AppConfig } from "../config.js";
import {
  buildEditorUrl,
  buildSourceUrlFromParams,
  parsePreviewParamsFromUrl,
  toMultiUrl,
} from "../lib/url.js";
import type {
  FeishuCardPreview,
  FeishuInlinePreview,
  PreviewBuildResult,
  PreviewContext,
  PreviewParamsInput,
} from "../types/index.js";
import { normalizePreviewText, ZERO_WIDTH_SPACE } from "../utils/text.js";

import { IconService } from "./icon-service.js";
import { SlotService } from "./slot-service.js";
import { VariableService } from "./variable-service.js";

const SITE_PREVIEW_TITLE = "飞书自定义链接预览";
const EDITOR_PREVIEW_TITLE = "飞书签名设置器";

export class PreviewService {
  constructor(
    private readonly appConfig: AppConfig,
    private readonly iconService = new IconService(),
    private readonly variableService = new VariableService(),
    private readonly slotService = new SlotService(),
  ) {}

  async buildFromSourceUrl(sourceUrl: string, context: PreviewContext): Promise<PreviewBuildResult> {
    const url = new URL(sourceUrl);
    const params = parsePreviewParamsFromUrl(sourceUrl);

    if (url.pathname === "/editor") {
      return this.buildStaticPreview({
        sourceUrl,
        raw: params,
        title: this.buildHostTitle(EDITOR_PREVIEW_TITLE, url.hostname),
        jumpUrl: sourceUrl,
      });
    }

    if (url.pathname === "/" && (params.t || params.k || params.slot)) {
      return this.buildFromParams(params, context, sourceUrl);
    }

    return this.buildStaticPreview({
      sourceUrl,
      raw: params,
      title: this.buildHostTitle(SITE_PREVIEW_TITLE, url.hostname),
      jumpUrl: sourceUrl,
    });
  }

  async buildFromParams(
    params: PreviewParamsInput,
    context: PreviewContext,
    sourceUrl = buildSourceUrlFromParams(this.appConfig.publicBaseUrl, params),
  ): Promise<PreviewBuildResult> {
    const slotValue = params.t ? undefined : await this.slotService.resolve(params.slot, context);
    const candidateText = params.t ?? slotValue;
    const resolvedText = await this.variableService.resolveText(candidateText ?? ZERO_WIDTH_SPACE, context);
    const text = normalizePreviewText(resolvedText, this.appConfig.maxTextLength);
    const iconKey = this.iconService.resolveIconKey(params.k);
    const jumpUrl = this.resolveJumpUrl(params);

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
        inline: this.buildInlinePreview(text, iconKey),
        card,
      },
    };
  }

  async buildFallback(context?: Partial<PreviewContext>): Promise<PreviewBuildResult> {
    const sourceUrl = context?.sourceUrl ?? this.appConfig.publicBaseUrl;

    try {
      return await this.buildFromSourceUrl(sourceUrl, { sourceUrl });
    } catch {
      const url = new URL(this.appConfig.publicBaseUrl);
      return this.buildStaticPreview({
        sourceUrl: this.appConfig.publicBaseUrl,
        raw: {},
        title: this.buildHostTitle(SITE_PREVIEW_TITLE, url.hostname),
        jumpUrl: this.appConfig.helpUrl,
      });
    }
  }

  private buildStaticPreview(input: {
    sourceUrl: string;
    raw: PreviewParamsInput;
    title: string;
    jumpUrl: string;
  }): PreviewBuildResult {
    return {
      text: input.title,
      iconKey: undefined,
      jumpUrl: input.jumpUrl,
      sourceUrl: input.sourceUrl,
      raw: input.raw,
      response: {
        inline: this.buildInlinePreview(input.title, undefined),
      },
    };
  }

  private buildInlinePreview(text: string, iconKey: string | undefined): FeishuInlinePreview {
    return {
      title: text === "" ? ZERO_WIDTH_SPACE : text,
      ...(iconKey ? { image_key: iconKey } : {}),
    };
  }

  private resolveJumpUrl(params: PreviewParamsInput): string {
    if (params.u) {
      return params.u;
    }

    return buildEditorUrl(this.appConfig.publicBaseUrl, {
      t: params.t,
      k: params.k,
      slot: params.slot,
    });
  }

  private buildHostTitle(base: string, hostname: string): string {
    return hostname ? `${base}@${hostname}` : base;
  }

  private buildCardPreview(input: {
    text: string;
    jumpUrl: string;
    iconKey?: string | undefined;
    sourceUrl: string;
  }): FeishuCardPreview {
    const markdownText = input.text === ZERO_WIDTH_SPACE ? "个性签名预览" : input.text;

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
