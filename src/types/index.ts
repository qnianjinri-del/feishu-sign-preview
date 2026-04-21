export interface PreviewOperator {
  tenantKey?: string | undefined;
  userId?: string | undefined;
  openId?: string | undefined;
}

export interface PreviewContext {
  sourceUrl: string;
  host?: string | undefined;
  previewToken?: string | undefined;
  openMessageId?: string | undefined;
  openChatId?: string | undefined;
  tenantKey?: string | undefined;
  appId?: string | undefined;
  operator?: PreviewOperator | undefined;
}

export interface PreviewParamsInput {
  t?: string | undefined;
  k?: string | undefined;
  u?: string | undefined;
  slot?: string | undefined;
}

export interface ResolvedPreviewParams {
  text: string;
  iconKey?: string | undefined;
  jumpUrl: string;
  sourceUrl: string;
  slot?: string | undefined;
  raw: PreviewParamsInput;
}

export interface FeishuMultiUrl {
  copy_url: string;
  ios: string;
  android: string;
  pc: string;
  web: string;
}

export interface FeishuInlinePreview {
  title: string;
  i18n_title?: Record<string, string> | undefined;
  image_key?: string | undefined;
  url: FeishuMultiUrl;
}

export interface FeishuCardPreview {
  type: "raw" | "template";
  data: Record<string, unknown>;
}

export interface FeishuPreviewResponse {
  inline: FeishuInlinePreview;
  card?: FeishuCardPreview | undefined;
}

export interface PreviewBuildResult extends ResolvedPreviewParams {
  response: FeishuPreviewResponse;
}

export interface FeishuCallbackEnvelope {
  schema?: string | undefined;
  type?: string | undefined;
  challenge?: string | undefined;
  token?: string | undefined;
  encrypt?: string | undefined;
  header?: {
    token?: string | undefined;
    event_type?: string | undefined;
    tenant_key?: string | undefined;
    app_id?: string | undefined;
    create_time?: string | undefined;
  } | undefined;
  event?: {
    operator?: {
      tenant_key?: string | undefined;
      user_id?: string | undefined;
      open_id?: string | undefined;
    } | undefined;
    host?: string | undefined;
    context?: {
      url?: string | undefined;
      preview_token?: string | undefined;
      open_message_id?: string | undefined;
      open_chat_id?: string | undefined;
    } | undefined;
  } | undefined;
}
