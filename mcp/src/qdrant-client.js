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
  const vectors = await embedBatch([text], signal);
  return vectors[0] ?? null;
}

/**
 * embedBatch(texts[], signal) → vector[][]
 *
 * Embeds an array of strings in ONE HTTP call when the provider supports
 * batch input (Ollama, OpenAI, SiliconFlow). Falls back to per-text calls
 * for providers without batch support (Gemini). Single-element arrays go
 * through the same path so callers don't need to special-case length 1.
 */
async function embedBatch(texts, signal) {
  if (!texts.length) return [];
  const c = cfg();
  const provider = c.embedProvider || process.env.EXPERIENCE_EMBED_PROVIDER || 'ollama';
  const model = c.embedModel || process.env.EXPERIENCE_EMBED_MODEL || 'nomic-embed-text';
  const key = c.embedKey || process.env.EXPERIENCE_EMBED_KEY || '';
  const endpoint = c.embedEndpoint || process.env.EXPERIENCE_EMBED_ENDPOINT || '';
  // Embed timeout scales with batch size — Ollama processes inputs sequentially
  // inside the call, so 20 chunks ≈ 20× single-embed latency. 6s/chunk ceiling
  // (network + GPU inference, with safety margin for cold cache).
  const timeout = signal || AbortSignal.timeout(Math.max(60000, texts.length * 6000));

  if (provider === 'openai' || provider === 'siliconflow') {
    const url = endpoint || 'https://api.openai.com/v1/embeddings';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input: texts.map((t) => t.slice(0, 8000)) }),
      signal: timeout,
    });
    if (!res.ok) throw new Error(`Embed HTTP ${res.status}`);
    const data = await res.json();
    return (data.data ?? []).map((d) => d.embedding);
  }

  if (provider === 'gemini') {
    // Gemini has no batch endpoint — fan out sequential per-text calls.
    const out = [];
    for (const text of texts) {
      const url = endpoint || `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text: text.slice(0, 8000) }] } }),
        signal: timeout,
      });
      if (!res.ok) throw new Error(`Embed HTTP ${res.status}`);
      out.push((await res.json()).embedding?.values ?? null);
    }
    return out;
  }

  // Default: ollama — `input` accepts a string OR an array, returns
  // `embeddings: [[...], [...]]` indexed positionally.
  const ollamaBase = c.ollamaUrl || process.env.EXPERIENCE_OLLAMA_URL || 'http://localhost:11434';
  const res = await fetch(`${ollamaBase}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: texts }),
    signal: timeout,
  });
  if (!res.ok) throw new Error(`Embed HTTP ${res.status}`);
  return (await res.json()).embeddings ?? [];
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
  // Embed the whole batch in a single HTTP call — Ollama/OpenAI/SiliconFlow
  // all accept array input. This collapses N round trips into 1 and is the
  // dominant speedup vs. the previous per-point sequential loop.
  const vectors = await embedBatch(points.map((p) => p.text));
  if (vectors.length !== points.length) {
    throw new Error(`Embed mismatch: got ${vectors.length} vectors for ${points.length} points`);
  }
  const withVectors = points.map((pt, i) => {
    const vector = vectors[i];
    if (!vector) throw new Error(`Embedding returned null for id=${pt.id}`);
    return { id: pt.id, vector, payload: { ...pt.payload, text: pt.text } };
  });
  await ensureCollection(withVectors[0].vector.length);

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
 * pointsExist(ids[]) → Set<string>
 *
 * Uses Qdrant's `/points` bulk-fetch endpoint to check existence of many
 * ids in ONE HTTP call. Returns the subset that already exist. Replaces
 * the per-id loop used by the ingestion idempotency check.
 */
async function pointsExist(ids) {
  if (!ids.length) return new Set();
  const res = await fetch(`${qdrantBase()}/collections/${COLLECTION}/points`, {
    method: 'POST',
    headers: qdrantHeaders(),
    body: JSON.stringify({ ids, with_payload: false, with_vector: false }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    // Treat collection-missing / bulk-fetch failure as "nothing exists yet"
    // rather than crashing — first-time ingest creates the collection.
    return new Set();
  }
  const data = await res.json();
  return new Set((data.result ?? []).map((p) => String(p.id)));
}

/**
 * contentHash(text) → 16-char hex for idempotent point id suffix
 */
function contentHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

module.exports = { search, readDoc, upsertPoints, pointExists, pointsExist, contentHash, embed, embedBatch };
