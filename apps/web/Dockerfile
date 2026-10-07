# syntax=docker/dockerfile:1
FROM node:24.19.0-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
RUN pnpm fetch
RUN pnpm install --frozen-lockfile --filter apps-web...

FROM deps AS build
COPY apps/web apps/web
COPY tsconfig.json ./tsconfig.json
RUN pnpm --filter apps-web run build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apps/web/dist ./dist
COPY --from=build /app/apps/web/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/node_modules ./apps/web/node_modules
EXPOSE 4321
ENV HOST=0.0.0.0
ENV PORT=4321
CMD ["node", "./dist/server/entry.mjs"]
