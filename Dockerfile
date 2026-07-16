FROM node:20-alpine

RUN apk add --no-cache libc6-compat python3 make g++ openssl

WORKDIR /app

# Install deps (will be overridden by volume mount but needed for image layer cache)
COPY package.json package-lock.json* ./
RUN npm ci

# Install MCP server deps (separate package; same layer-cache reasoning as above)
COPY mcp/package.json mcp/package-lock.json* ./mcp/
RUN cd mcp && npm ci

# Prisma generate
COPY prisma ./prisma
RUN npx prisma generate

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
