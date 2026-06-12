'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { buildServer, TOOLS } = require('../src/server.js');

const EXPECTED_TOOLS = [
  'docs.search',
  'docs.read',
  'bb.template.describe',
  'bb.package.describe',
  'bb.recipe.list',
];

// ── buildServer() wiring (transport-agnostic) ──────────────────────────────
// Verifies the shared factory the HTTP entrypoint reuses advertises exactly the 5 tools.
test('buildServer advertises the 5 docs tools over an in-memory transport', async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildServer();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepStrictEqual(names, [...EXPECTED_TOOLS].sort());

  await client.close();
  await server.close();
});

test('static TOOLS export matches the advertised set', () => {
  assert.deepStrictEqual(TOOLS.map((t) => t.name).sort(), [...EXPECTED_TOOLS].sort());
});

// ── HTTP entrypoint ─────────────────────────────────────────────────────────
// server-http exports the (non-listening) http.Server; the test drives listen()/close().
const { httpServer } = require('../src/server-http.js');

async function withServer(fn) {
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  const { port } = httpServer.address();
  try {
    await fn(port);
  } finally {
    httpServer.close();
    await once(httpServer, 'close');
  }
}

test('HTTP server responds 200 on /health', async () => {
  await withServer(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.text()).trim(), 'ok');
  });
});

// A non-initialize POST without a session must be rejected cleanly (not crash).
test('HTTP /mcp rejects a non-initialize request without a session (400)', async () => {
  await withServer(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.strictEqual(res.status, 400);
  });
});
