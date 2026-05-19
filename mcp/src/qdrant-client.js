/**
 * qdrant-client.js — thin wrapper for bb-docs collection.
 * Reads config from ~/.experience/config.json (qdrantUrl, qdrantKey).
 * Embedding: calls the configured embed provider directly (ollama / openai / siliconflow).
 * Zero npm deps beyond config file I/O.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const CONFIG_PATH = path.join(os.homedir(), '.experience', 'config.json');
const COLLECTION = 'bb-docs';

// ---- Config (lazy) --------------------------------------------------------

let _cfg = null;

function cfg() {
  if (_cfg) return _cfg;
  try { _cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { _cfg = {}; }
  return _cfg;
}

function qdrantBase() {
  return cfg().qdrantUrl || process.env.EXPERIENCE_QDRANT_URL || 'http://localhost:6333';
}

function qdrantKey() {
  return cfg().qdrantKey || process.env.EXPERIENCE_QDRANT_KEY || '';
}

function qdrantHeaders() {
  const k = qdrantKey();
  return { 'Content-Type': 'application/json', ...(k ? { 'api-key': k } : {}) };
}

// ---- Embedding (mirrors experience-engine embedding.js) -------------------

async function embed(text, signal) {
  const c = cfg();
  const provider = c.embedProvider || process.env.EXPERIENCE_EMBED_PROVIDER || 'ollama';
  const model = c.embedModel || process.env.EXPERIENCE_EMBED_MODEL || 'nomic-embed-text';
  const key = c.embedKey || process.env.EXPERIENCE_EMBED_KEY || '';
  const endpoint = c.embedEndpoint || process.env.EXPERIENCE_EMBED_ENDPOINT || '';
  const timeout = signal || AbortSignal.timeout(10000);

  if (provider === 'openai' || provider === 'siliconflow') {
    const url = endpoint || 'https://api.openai.com/v1/embeddings';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input: text.slice(0, 8000) }),
      signal: timeout,
    });
    if (!res.ok) throw new Error(`Embed HTTP ${res.status}`);
    return (await res.json()).data?.[0]?.embedding ?? null;
  }

  if (provider === 'gemini') {
    const url = endpoint || `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text: text.slice(0, 8000) }] } }),
      signal: timeout,
    });
    if (!res.ok) throw new Error(`Embed HTTP ${res.status}`);
    return (await res.json()).embedding?.values ?? null;
  }

  // Default: ollama
  const ollamaBase = c.ollamaUrl || process.env.EXPERIENCE_OLLAMA_URL || 'http://localhost:11434';
  const res = await fetch(`${ollamaBase}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text }),
    signal: timeout,
  });
  if (!res.ok) throw new Error(`Embed HTTP ${res.status}`);
  return (await res.json()).embeddings?.[0] ?? null;
}

// ---- Qdrant collection bootstrap ------------------------------------------

async function ensureCollection(dim) {
  const url = `${qdrantBase()}/collections/${COLLECTION}`;
  const check = await fetch(url, {
    headers: qdrantHeaders(),
    signal: AbortSignal.timeout(5000),
  });
  if (check.ok) return; // already exists

  await fetch(url, {
    method: 'PUT',
    headers: qdrantHeaders(),
    body: JSON.stringify({
      vectors: { size: dim, distance: 'Cosine' },
    }),
    signal: AbortSignal.timeout(10000),
  });
}

// ---- Public API -----------------------------------------------------------

/**
 * search(query, topK) → Array<{ docId, score, title, excerpt, source }>
 */
async function search(query, topK = 5) {
  const vector = await embed(query);
  if (!vector) throw new Error('Embedding failed — check embed provider config');

  const res = await fetch(`${qdrantBase()}/collections/${COLLECTION}/points/query`, {
    method: 'POST',
    headers: qdrantHeaders(),
    body: JSON.stringify({ query: vector, limit: topK, with_payload: true }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Qdrant query failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const points = data.result?.points ?? [];

  return points.map((p) => ({
    docId: String(p.id),
    score: p.score ?? 0,
    title: p.payload?.title ?? '',
    excerpt: (p.payload?.text ?? '').slice(0, 300),
    source: p.payload?.source ?? '',
  }));
}

/**
 * readDoc(docId) → { docId, title, content, source }
 * Fetches the full chunk text stored in Qdrant payload.
 * For multi-chunk documents, this returns the single chunk.
 * If you want the full file, use the source path directly.
 */
async function readDoc(docId) {
  const res = await fetch(`${qdrantBase()}/collections/${COLLECTION}/points/${docId}`, {
    headers: qdrantHeaders(),
    signal: AbortSignal.timeout(5000),
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Qdrant fetch failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const p = data.result;
  if (!p) return null;

  return {
    docId: String(p.id),
    title: p.payload?.title ?? '',
    content: p.payload?.text ?? '',
    source: p.payload?.source ?? '',
  };
}

/**
 * upsertPoint({ id, text, payload }) — for ingest use only.
 * id should be a deterministic string hash.
 * payload is stored alongside the text field.
 */
async function upsertPoints(points) {
  // Embed all in sequence (batching inside caller)
  const withVectors = [];
  for (const pt of points) {
    const vector = await embed(pt.text);
    if (!vector) throw new Error(`Embedding returned null for id=${pt.id}`);
    withVectors.push({
      id: pt.id,
      vector,
      payload: { ...pt.payload, text: pt.text },
    });

    // Ensure collection exists (use first vector dimension)
    if (withVectors.length === 1) {
      await ensureCollection(vector.length);
    }
  }

  const res = await fetch(`${qdrantBase()}/collections/${COLLECTION}/points?wait=true`, {
    method: 'PUT',
    headers: qdrantHeaders(),
    body: JSON.stringify({ points: withVectors }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Qdrant upsert failed: ${res.status} ${body.slice(0, 200)}`);
  }

  return (await res.json());
}

/**
 * pointExists(id) → boolean
 */
async function pointExists(id) {
  const res = await fetch(`${qdrantBase()}/collections/${COLLECTION}/points/${id}`, {
    headers: qdrantHeaders(),
    signal: AbortSignal.timeout(5000),
  });
  return res.ok;
}

/**
 * contentHash(text) → 16-char hex for idempotent point id suffix
 */
function contentHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

module.exports = { search, readDoc, upsertPoints, pointExists, contentHash, embed };
