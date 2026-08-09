FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/gateway/package.json apps/gateway/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile

COPY apps/gateway apps/gateway
COPY packages/contracts packages/contracts
RUN pnpm --filter @floatlist/contracts build \
  && pnpm --filter @floatlist/gateway build \
  && pnpm --filter @floatlist/gateway deploy --prod /gateway

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
COPY --from=build --chown=node:node /gateway ./
USER node
EXPOSE 3000
CMD ["node", "dist/app.js"]
