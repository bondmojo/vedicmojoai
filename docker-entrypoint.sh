#!/bin/sh
set -e

echo "Running prisma generate..."
npx prisma generate

echo "Running database migrations..."
npx prisma migrate deploy

echo "Building application..."
npm run build

echo "Building MCP server..."
(cd mcp && npm run build)

echo "Starting application..."
exec npx next start
