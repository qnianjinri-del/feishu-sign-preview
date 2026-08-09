import type { PreviewContext } from "../types/index.js";

export class VariableService {
  async resolveText(input: string, _context: PreviewContext): Promise<string> {
    return input;
  }
}
