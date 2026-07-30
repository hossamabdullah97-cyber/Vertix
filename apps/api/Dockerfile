# Vertex Connect API — multi-stage build for the pnpm monorepo.
# Build context is the repo root: docker build -f apps/api/Dockerfile .

FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
# openssl is required by the Prisma query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @vertex/db generate
RUN pnpm build

FROM node:22-slim AS runtime
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
# Copy the built workspace (includes the generated Prisma client + engine).
COPY --from=build /app /app
EXPOSE 4000
# Apply pending migrations on boot, then start the server.
CMD ["sh", "-c", "pnpm --filter @vertex/db migrate:deploy || true; node apps/api/dist/main.js"]
