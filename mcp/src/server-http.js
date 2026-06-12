#!/usr/bin/env node
/**
 * server-http.js — hosted Streamable HTTP MCP server for Muonroi BB docs + recipes.
 *
 * Same 5 tools as the stdio server (src/server.js → buildServer()), exposed over Streamable HTTP
 * so clients install by URL: https://docs-mcp.muonroi.com/mcp. Anonymous (public BB docs — no key);
 * the tenant/identity model of the control-plane MCP does not apply here.
 *
 * Routes:
 *   POST /mcp     — JSON-RPC (initialize creates a session; subsequent calls reuse Mcp-Session-Id)
 *   GET  /mcp     — SSE stream for an existing session
 *   DELETE /mcp   — terminate a session
 *   GET  /health  — liveness probe (200 "ok")
 *
 * Config is read from env by qdrant-client.js (EXPERIENCE_QDRANT_URL / EXPERIENCE_EMBED_*). No secrets here.
 */
'use strict';

const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js');
const { buildServer } = require('./server.js');

const PORT = Number(process.env.PORT || 8086);
const HOST = process.env.HOST || '0.0.0.0';
const MCP_PATH = '/mcp';

/** sessionId → transport. Each session owns one Server instance. */
const transports = new Map();

function log(msg, extra) {
  // Structured, non-stdout-owned logging (HTTP transport does not own stdout, but keep to stderr for consistency).
  process.stderr.write(`[docs-mcp-http] ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}\n`);
}

/** Reads and JSON-parses the request body. Returns undefined for an empty body. */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 4 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`Invalid JSON body: ${err?.message ?? err}`));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

async function handleMcpPost(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { jsonrpc: '2.0', error: { code: -32700, message: String(err?.message ?? err) }, id: null });
  }

  const sessionId = req.headers['mcp-session-id'];
  let transport = sessionId ? transports.get(sessionId) : undefined;

  if (!transport) {
    // No existing session — only an `initialize` request may open one.
    if (sessionId || !isInitializeRequest(body)) {
      return sendJson(res, 400, {
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: no valid session id, and not an initialize request.' },
        id: null,
      });
    }

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, transport);
        log('session initialized', { sid, sessions: transports.size });
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
        log('session closed', { sid: transport.sessionId, sessions: transports.size });
      }
    };

    const server = buildServer();
    await server.connect(transport);
  }

  try {
    await transport.handleRequest(req, res, body);
  } catch (err) {
    log('handleRequest(POST) failed', { message: String(err?.message ?? err) });
    if (!res.headersSent) {
      sendJson(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
}

async function handleMcpSessionRequest(req, res) {
  const sessionId = req.headers['mcp-session-id'];
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) {
    return sendJson(res, 400, { error: 'Invalid or missing session id' });
  }
  try {
    await transport.handleRequest(req, res);
  } catch (err) {
    log('handleRequest(session) failed', { message: String(err?.message ?? err) });
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error' });
  }
}

const httpServer = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];

  if (req.method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (url === MCP_PATH) {
    if (req.method === 'POST') return void handleMcpPost(req, res);
    if (req.method === 'GET' || req.method === 'DELETE') return void handleMcpSessionRequest(req, res);
    res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST, GET, DELETE' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  sendJson(res, 404, { error: 'Not Found' });
});

function shutdown() {
  log('shutting down');
  for (const t of transports.values()) {
    try { t.close(); } catch { /* best-effort */ }
  }
  httpServer.close(() => process.exit(0));
  // Hard exit if connections linger.
  setTimeout(() => process.exit(0), 3000).unref();
}

module.exports = { httpServer };

// Auto-boot only when run directly (Docker CMD / `npm run start:http`).
// When imported (tests), the caller drives listen()/close() to avoid a stuck cached listener.
if (require.main === module) {
  httpServer.listen(PORT, HOST, () => {
    log(`listening on http://${HOST}:${PORT}${MCP_PATH} (health: /health)`);
  });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
