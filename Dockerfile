# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (skip prepare script - we'll build manually)
RUN npm ci --ignore-scripts

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npx tsc

# Production stage
FROM node:22-alpine

WORKDIR /app

# Prevent npm from generating unnecessary files
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only (skip prepare script)
RUN npm ci --omit=dev --ignore-scripts

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN adduser --disabled-password --gecos "" appuser && chown -R appuser:appuser /app
USER appuser

# Default to SSE mode for Docker
ENV PORT=8000
ENV HOST=0.0.0.0

EXPOSE 8000

# Run in SSE mode by default
CMD ["node", "dist/index.js", "sse"]
