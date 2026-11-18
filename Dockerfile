# Multi-stage production Dockerfile for RealOps Music Bot
# Stage 1: Build TypeScript source
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json tsconfig.json ./

# Install all dependencies including devDependencies for build
RUN npm ci

# Copy source files
COPY src/ ./src/

# Compile TypeScript to dist/
RUN npm run build

# Prune devDependencies to keep image lightweight
RUN npm prune --omit=dev

# Stage 2: Minimal runtime image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install curl in runner for container health checks
RUN apk add --no-cache curl

# Copy production dependencies and built code from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist

# Run as non-root user 'node' for security
USER node

# Healthcheck to verify node process is running
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

CMD ["node", "--enable-source-maps", "dist/index.js"]

