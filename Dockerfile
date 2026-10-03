# =========================================================================
# SOHAR DENTAL LAB — Production Multi-Stage Dockerfile
# =========================================================================

# Stage 1: Build & Prisma Engine Generation
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY backend/package*.json ./backend/
COPY backend/prisma ./backend/prisma/

WORKDIR /app/backend
RUN npm ci
RUN npx prisma generate

# Stage 2: Minimal Production Image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install OpenSSL and curl for Alpine health probe & Prisma runtime
RUN apk add --no-cache openssl curl

# Copy generated Prisma Client & Node Modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/prisma ./backend/prisma

# Copy application source code & static frontend assets
COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app/backend

EXPOSE 5000

# Health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/healthz || exit 1

CMD ["node", "server.js"]
