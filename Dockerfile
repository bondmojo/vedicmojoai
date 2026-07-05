FROM node:20-alpine

RUN apk add --no-cache libc6-compat python3 make g++ openssl

WORKDIR /app

# Install deps (will be overridden by volume mount but needed for image layer cache)
COPY package.json package-lock.json* ./
RUN npm ci

# Prisma generate
COPY prisma ./prisma
RUN npx prisma generate

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
