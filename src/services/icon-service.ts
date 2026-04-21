export class IconService {
  resolveIconKey(iconKey: string | undefined): string | undefined {
    if (!iconKey) {
      return undefined;
    }

    const normalized = iconKey.trim();
    return normalized === "" ? undefined : normalized.slice(0, 256);
  }
}
