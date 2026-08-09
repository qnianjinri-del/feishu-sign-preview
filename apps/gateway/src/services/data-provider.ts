import type { PreviewContext } from "../types/index.js";

export interface DataProvider {
  getSlotValue(slot: string, context: PreviewContext): Promise<string | undefined>;
}

export class NoopDataProvider implements DataProvider {
  async getSlotValue(): Promise<string | undefined> {
    return undefined;
  }
}
