# Build context is the REPO ROOT (the API depends on packages/shared).
# ---------- build stage ----------
FROM node:20-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy manifests first so `npm ci` is cached until dependencies actually change
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace packages/shared --workspace apps/api --no-audit --no-fund

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w packages/shared \
 && cd apps/api && npx prisma generate && npm run build

# Drop dev dependencies (TypeScript, Jest, ...) from the final image
RUN npm prune --omit=dev --workspace packages/shared --workspace apps/api

# ---------- runtime stage ----------
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
RUN chmod +x start.sh
USER node
EXPOSE 4000
CMD ["./start.sh"]
