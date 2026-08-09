import type { FastifyPluginAsync } from "fastify";

import { renderEditorPage } from "../editor/editor-page.js";
import { rootQuerySchema } from "../utils/validation.js";

export const editorRoute: FastifyPluginAsync = async (app) => {
  app.get("/editor", async (request, reply) => {
    const query = rootQuerySchema.parse(request.query);
    reply.type("text/html; charset=utf-8");
    return renderEditorPage({
      t: query.t,
      k: query.k,
      u: query.u,
      slot: query.slot,
      ks: query.ks,
      cols: query.cols,
    });
  });
};
