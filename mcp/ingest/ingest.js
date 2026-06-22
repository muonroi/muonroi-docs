#!/usr/bin/env node
/**
 * ingest.js — embed and upsert all crawled docs into the bb-docs Qdrant collection.
 *
 * Usage: node ingest/ingest.js
 *
 * Idempotent: existing points (same id = same filepath+chunkIndex+contentHash) are skipped.
 * Progress: printed every 10 batches.
 * Summary: "Ingested N chunks from M files into bb-docs"
 */
'use strict';

const { crawlAll } = require('./crawl.js');
const { upsertPoints, pointsExist, isThinClient } = require('../src/qdrant-client.js');

const BATCH_SIZE = 10;
const PROGRESS_EVERY = 10; // batches
const EXISTS_BATCH = 200; // ids per bulk-existence check

async function main() {
  if (isThinClient && isThinClient()) {
    console.error('[ingest] ERROR: Thin-client detected (serverBaseUrl present, no qdrantUrl).');
    console.error('Ingest must run on the Experience Engine host (VPS) that has direct Qdrant access.');
    console.error('See recipes/experience-engine.md for details.');
    process.exit(1);
  }

  console.log('[ingest] Crawling sources...');
  const chunks = crawlAll();

  if (chunks.length === 0) {
    console.log('[ingest] No chunks found. Check sources.json paths.');
    return;
  }

  console.log(`[ingest] ${chunks.length} chunks to process. Checking existing points (bulk)...`);

  // Idempotency check via bulk `/points` fetch — N HTTP calls → ceil(N/200).
  // ~10-15 min wall time on the per-id loop collapsed to seconds here.
  const existing = new Set();
  for (let i = 0; i < chunks.length; i += EXISTS_BATCH) {
    const slice = chunks.slice(i, i + EXISTS_BATCH).map((c) => c.id);
    const hits = await pointsExist(slice);
    for (const id of hits) existing.add(id);
  }
  const toIngest = chunks.filter((c) => !existing.has(c.id));

  console.log(`[ingest] ${chunks.length - toIngest.length} chunks already ingested, ${toIngest.length} new.`);

  if (toIngest.length === 0) {
    console.log('[ingest] Nothing to do. Collection is up to date.');
    return;
  }

  // Batch upsert
  const batches = [];
  for (let i = 0; i < toIngest.length; i += BATCH_SIZE) {
    batches.push(toIngest.slice(i, i + BATCH_SIZE));
  }

  const uniqueFiles = new Set(toIngest.map((c) => c.payload.source));
  let done = 0;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    try {
      await upsertPoints(batch);
    } catch (err) {
      console.error(`[ingest] Batch ${b + 1}/${batches.length} FAILED: ${err.message}`);
      process.exit(1);
    }
    done += batch.length;

    if ((b + 1) % PROGRESS_EVERY === 0 || b === batches.length - 1) {
      const pct = Math.round((done / toIngest.length) * 100);
      console.log(`[ingest] Batch ${b + 1}/${batches.length} — ${done}/${toIngest.length} chunks (${pct}%)`);
    }
  }

  console.log(`\n[ingest] Done. Ingested ${toIngest.length} chunks from ${uniqueFiles.size} files into bb-docs.`);
}

main().catch((err) => {
  console.error('[ingest] Fatal:', err);
  process.exit(1);
});
