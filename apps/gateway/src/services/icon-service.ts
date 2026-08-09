import { defaultEditorIconKey, editorIconCatalog } from "../data/icon-catalog.js";
import type { EditorIconOption } from "../data/icon-catalog.js";

export class IconService {
  resolveIconKey(iconKey: string | undefined): string | undefined {
    if (!iconKey) {
      return undefined;
    }

    const normalized = iconKey.trim();
    return normalized === "" ? undefined : normalized.slice(0, 256);
  }

  getDefaultEditorIconKey(): string {
    return defaultEditorIconKey;
  }

  getEditorCatalog(): EditorIconOption[] {
    return editorIconCatalog;
  }
}
