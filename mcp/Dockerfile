# Hosted Streamable HTTP MCP server for Muonroi BB docs (docs-mcp.muonroi.com).
# Serves only — ingest runs on the host (needs the docs + building-block checkouts).
FROM node:20-slim AS base
WORKDIR /app

# Install prod deps from the committed lockfile — `npm ci` enforces exact resolved
# versions + integrity hashes (reproducible, attestable; blocks silent upstream tampering).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# App sources (server-http reuses server.js's buildServer()).
COPY src/ ./src/

# Setup recipes — read directly by the deterministic setup.guide tool (no Qdrant dependency).
COPY recipes/ ./recipes/

ENV PORT=8086
EXPOSE 8086

# Config (Qdrant URL + embed provider/key) is injected via env at runtime — no secrets baked in.
CMD ["node", "src/server-http.js"]
