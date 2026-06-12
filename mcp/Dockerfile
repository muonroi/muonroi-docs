# Hosted Streamable HTTP MCP server for Muonroi BB docs (docs-mcp.muonroi.com).
# Serves only — ingest runs on the host (needs the docs + building-block checkouts).
FROM node:20-slim AS base
WORKDIR /app

# Install prod deps. The lockfile is gitignored, so resolve from package.json
# (single pinned dependency: @modelcontextprotocol/sdk).
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# App sources (server-http reuses server.js's buildServer()).
COPY src/ ./src/

ENV PORT=8086
EXPOSE 8086

# Config (Qdrant URL + embed provider/key) is injected via env at runtime — no secrets baked in.
CMD ["node", "src/server-http.js"]
