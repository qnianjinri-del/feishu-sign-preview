export const ZERO_WIDTH_SPACE = "\u200b";

export function decodeUrlComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeOptionalParam(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const decoded = decodeUrlComponentSafe(value).trim();
  return decoded === "" ? undefined : decoded;
}

export function normalizePreviewText(value: string | undefined, maxLength: number): string {
  if (!value) {
    return ZERO_WIDTH_SPACE;
  }

  const flattened = value.replace(/\s+/g, " ").trim();
  if (flattened === "") {
    return ZERO_WIDTH_SPACE;
  }

  if (flattened.length <= maxLength) {
    return flattened;
  }

  return `${flattened.slice(0, Math.max(1, maxLength - 3))}...`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
