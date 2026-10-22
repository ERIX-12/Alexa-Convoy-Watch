# Convoy Watch Dockerfile
# Multi-stage production container build for Node 22
# NOTE: Docker daemon is unavailable in the AI Studio environment; this file is unverified locally.

FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY packages/mcp-provenance/package*.json ./packages/mcp-provenance/
RUN npm ci

# Copy source
COPY . .

# Build packages, client SPA, and server bundle
RUN npm run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
COPY packages/mcp-provenance/package*.json ./packages/mcp-provenance/
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/packages/mcp-provenance/dist ./packages/mcp-provenance/dist

EXPOSE 3000

# Non-root user for security
USER node

CMD ["node", "dist/server.js"]
