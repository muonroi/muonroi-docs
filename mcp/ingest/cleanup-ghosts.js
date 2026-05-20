#!/usr/bin/env node
/**
 * cleanup-ghosts.js — delete bb-docs points whose `source` no longer exists
 * on disk. Ghost chunks accumulate when:
 *   - files are moved/renamed (old path remains indexed)
 *   - the chunk-id format changes (crawl.js UUID migration in commit X)
 *
 * Usage: node ingest/cleanup-ghosts.js [--dry-run]
 *
 * Idempotent: safe to re-run. Uses Qdrant `/points/scroll` to page through
 * the collection and `/points/delete` to remove stale ids in batches of 500.
 */
'use strict';

const fs = require('node:fs');

const QDRANT_URL = process.env.EXPERIENCE_QDRANT_URL || 'http://localhost:6333';
const QDRANT_KEY = process.env.EXPERIENCE_QDRANT_KEY || '';
const COLLECTION = 'bb-docs';
const SCROLL_LIMIT = 500;
const DELETE_BATCH = 500;
const DRY_RUN = process.argv.includes('--dry-run');

const headers = {
  'Content-Type': 'application/json',
  ...(QDRANT_KEY ? { 'api-key': QDRANT_KEY } : {}),
};

async function scrollAll() {
  const out = [];
  let next = null;
  do {
    const body = {
      limit: SCROLL_LIMIT,
      with_payload: ['source'],
      with_vector: false,
      ...(next ? { offset: next } : {}),
    };
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`scroll HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const pt of data.result?.points ?? []) {
      out.push({ id: pt.id, source: pt.payload?.source ?? null });
    }
    next = data.result?.next_page_offset ?? null;
  } while (next);
  return out;
}

async function deleteIds(ids) {
  if (!ids.length) return;
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/delete?wait=true`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ points: ids }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`delete HTTP ${res.status}: ${await res.text()}`);
}

(async () => {
  console.log(`[cleanup] Mode: ${DRY_RUN ? 'DRY-RUN' : 'EXECUTE'}`);
  console.log(`[cleanup] Qdrant: ${QDRANT_URL} / collection=${COLLECTION}`);
  console.log('[cleanup] Scrolling collection...');
  const points = await scrollAll();
  console.log(`[cleanup] Loaded ${points.length} points.`);

  const fileExists = new Map();
  const ghostIds = [];
  let noSource = 0;
  for (const pt of points) {
    if (!pt.source) {
      noSource += 1;
      ghostIds.push(pt.id);
      continue;
    }
    let exists = fileExists.get(pt.source);
    if (exists === undefined) {
      exists = fs.existsSync(pt.source);
      fileExists.set(pt.source, exists);
    }
    if (!exists) ghostIds.push(pt.id);
  }

  console.log(`[cleanup] Stale sources (file gone): ${ghostIds.length - noSource}`);
  console.log(`[cleanup] Missing payload.source : ${noSource}`);
  console.log(`[cleanup] Total ghost points     : ${ghostIds.length}`);
  console.log(`[cleanup] Surviving healthy      : ${points.length - ghostIds.length}`);

  // Print sample stale paths so the user can sanity-check before delete.
  const sampleStale = [...fileExists.entries()].filter(([, ok]) => !ok).slice(0, 10);
  if (sampleStale.length) {
    console.log('\n[cleanup] Sample stale paths (first 10):');
    for (const [path] of sampleStale) console.log(`  - ${path}`);
  }

  if (DRY_RUN) {
    console.log('\n[cleanup] DRY-RUN — no deletions performed. Re-run without --dry-run to apply.');
    return;
  }

  if (!ghostIds.length) {
    console.log('\n[cleanup] Nothing to delete.');
    return;
  }

  console.log(`\n[cleanup] Deleting ${ghostIds.length} ghost points in batches of ${DELETE_BATCH}...`);
  for (let i = 0; i < ghostIds.length; i += DELETE_BATCH) {
    const slice = ghostIds.slice(i, i + DELETE_BATCH);
    await deleteIds(slice);
    console.log(`[cleanup] Deleted ${Math.min(i + DELETE_BATCH, ghostIds.length)}/${ghostIds.length}`);
  }
  console.log('[cleanup] Done.');
})().catch((err) => {
  console.error('[cleanup] Fatal:', err.message);
  process.exit(1);
});
