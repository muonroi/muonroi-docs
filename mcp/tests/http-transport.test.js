'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { buildServer, TOOLS } = require('../src/server.js');
const { setupGuide, RECIPES } = require('../src/tools/setup-guide.js');

const EXPECTED_TOOLS = [
  'docs_search',
  'docs_read',
  'bb_template_describe',
  'bb_package_describe',
  'bb_recipe_list',
  'setup_guide',
];

// Sections every setup recipe must expose so an agent can execute it end-to-end.
const REQUIRED_RECIPE_SECTIONS = [
  '## Prerequisites',
  '## Values to collect from the user',
  '## Steps',
  '## Verify',
  '## Troubleshooting',
];

// ── buildServer() wiring (transport-agnostic) ──────────────────────────────
// Verifies the shared factory the HTTP entrypoint reuses advertises exactly the expected tools.
test('buildServer advertises the docs tools over an in-memory transport', async () => {
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

// ── setup.guide (deterministic recipe retrieval) ────────────────────────────
test('setup.guide returns each component recipe with all required sections', async () => {
  for (const component of Object.keys(RECIPES)) {
    const res = await setupGuide({ component });
    assert.strictEqual(res.component, component);
    assert.ok(res.title && res.title.length > 0, `${component} has a title`);
    for (const section of REQUIRED_RECIPE_SECTIONS) {
      assert.ok(
        res.markdown.includes(section),
        `${component} recipe is missing section "${section}"`
      );
    }
  }
});

test('setup.guide defaults to the ecosystem recipe', async () => {
  const res = await setupGuide({});
  assert.strictEqual(res.component, 'ecosystem');
  assert.ok(res.markdown.includes('## Steps'));
});

test('setup.guide rejects an unknown component with the valid set', async () => {
  await assert.rejects(
    () => setupGuide({ component: 'not-a-thing' }),
    /Valid components:.*ecosystem/
  );
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
