import type { PreviewContext } from "../types/index.js";

import { NoopDataProvider, type DataProvider } from "./data-provider.js";

export class SlotService {
  private readonly provider: DataProvider;

  constructor(provider?: DataProvider) {
    this.provider = provider ?? new NoopDataProvider();
  }

  async resolve(slot: string | undefined, context: PreviewContext): Promise<string | undefined> {
    if (!slot) {
      return undefined;
    }

    return this.provider.getSlotValue(slot, context);
  }
}
