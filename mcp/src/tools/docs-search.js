/**
 * docs-search.js — tool handler for docs.search
 * Args: { query: string, topK?: number }
 * Returns: Array<{ docId, score, title, excerpt, source }>
 */
'use strict';

const { search } = require('../qdrant-client.js');

async function docsSearch({ query, topK = 5 }) {
  if (!query || typeof query !== 'string') throw new Error('query must be a non-empty string');
  const k = Math.min(Math.max(1, Number(topK) || 5), 20);
  return search(query, k);
}

module.exports = { docsSearch };
