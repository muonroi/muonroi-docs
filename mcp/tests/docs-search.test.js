/**
 * docs-search.test.js — unit test for docs.search tool handler.
 * Mocks the qdrant-client so no real Qdrant or embed provider is needed.
 */
'use strict';

const { test, describe, mock, before, after } = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

// ---- Inline mock for qdrant-client ----------------------------------------

const MOCK_RESULTS = [
  { docId: '1a2b3c4d', score: 0.97, title: 'Rule Engine Guide', excerpt: 'Orchestrator manages...', source: '/docs/rule-engine-guide.md' },
  { docId: '2b3c4d5e', score: 0.91, title: 'BB Micro Solution', excerpt: 'mr-micro-sln template...', source: '/README.md' },
  { docId: '3c4d5e6f', score: 0.85, title: 'Auth Module', excerpt: 'Authentication and OIDC...', source: '/docs/auth.md' },
  { docId: '4d5e6f7a', score: 0.78, title: 'Rule Rollout', excerpt: 'Canary deployment...', source: '/docs/rule-rollout.md' },
  { docId: '5e6f7a8b', score: 0.71, title: 'Decision Table', excerpt: 'DMN model hit policies...', source: '/docs/dt.md' },
];

// Patch Module._resolveFilename to intercept qdrant-client require
const originalResolve = Module._resolveFilename.bind(Module);
const MOCK_MODULE_ID = '__mock_qdrant_client__';

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.includes('qdrant-client')) return MOCK_MODULE_ID;
  return originalResolve(request, parent, isMain, options);
};

require.cache[MOCK_MODULE_ID] = {
  id: MOCK_MODULE_ID,
  filename: MOCK_MODULE_ID,
  loaded: true,
  exports: {
    search: async (query, topK) => MOCK_RESULTS.slice(0, topK),
    readDoc: async (docId) => {
      const hit = MOCK_RESULTS.find((r) => r.docId === docId);
      if (!hit) return null;
      return { docId: hit.docId, title: hit.title, content: hit.excerpt + '\n\nMore content...', source: hit.source };
    },
    upsertPoints: async () => ({ status: 'ok' }),
    pointExists: async () => false,
    contentHash: (text) => require('node:crypto').createHash('sha256').update(text).digest('hex').slice(0, 16),
    embed: async () => new Array(768).fill(0),
  },
};

// Load the tool handlers AFTER mock is registered
const { docsSearch } = require('../src/tools/docs-search.js');

// ---- Tests ----------------------------------------------------------------

describe('docs.search tool', () => {
  test('returns 5 items by default, sorted by score desc', async () => {
    const results = await docsSearch({ query: 'BB micro service template' });
    assert.strictEqual(results.length, 5);
    // Scores should be descending
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score, `score[${i-1}] should be >= score[${i}]`);
    }
  });

  test('each result has required fields', async () => {
    const results = await docsSearch({ query: 'rule engine orchestrator' });
    for (const r of results) {
      assert.ok(typeof r.docId === 'string', 'docId must be string');
      assert.ok(typeof r.score === 'number', 'score must be number');
      assert.ok(typeof r.title === 'string', 'title must be string');
      assert.ok(typeof r.excerpt === 'string', 'excerpt must be string');
      assert.ok(typeof r.source === 'string', 'source must be string');
    }
  });

  test('respects topK parameter', async () => {
    const results = await docsSearch({ query: 'auth', topK: 3 });
    assert.strictEqual(results.length, 3);
  });

  test('throws on missing query', async () => {
    await assert.rejects(() => docsSearch({}), /query/);
  });

  test('throws on non-string query', async () => {
    await assert.rejects(() => docsSearch({ query: 42 }), /query/);
  });

  test('clamps topK to max 20', async () => {
    // Mock returns 5 max; just verify the call doesn't throw
    const results = await docsSearch({ query: 'anything', topK: 100 });
    assert.ok(Array.isArray(results));
  });
});
