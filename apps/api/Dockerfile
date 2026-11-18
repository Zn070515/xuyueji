FROM node:24-alpine AS build

RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @xuyueji/api build
RUN pnpm --filter @xuyueji/api --prod deploy --legacy /out

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /out /app

USER node
EXPOSE 3000

CMD ["node", "dist/server.js"]
