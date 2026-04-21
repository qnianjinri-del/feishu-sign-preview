import type { PreviewContext } from "../types/index.js";

import { BitableDataProvider } from "./bitable-data-provider.js";
import type { DataProvider } from "./data-provider.js";

export class SlotService {
  private readonly provider: DataProvider;

  constructor(provider?: DataProvider) {
    this.provider = provider ?? new BitableDataProvider();
  }

  async resolve(slot: string | undefined, context: PreviewContext): Promise<string | undefined> {
    if (!slot) {
      return undefined;
    }

    return this.provider.getSlotValue(slot, context);
  }
}
