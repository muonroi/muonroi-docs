/**
 * bb-recipe-list.js — tool handler for bb.recipe.list
 * Args: { domain?: string }  e.g. "auth", "background-jobs", "caching"
 * Returns: Array<{ recipeId, title, summary, sourceDoc }>
 */
'use strict';

const { search } = require('../qdrant-client.js');

async function bbRecipeList({ domain } = {}) {
  const query = domain
    ? `${domain} recipe guide example how-to muonroi building block`
    : 'muonroi building block recipe guide pattern sample';

  const hits = await search(query, 10);

  return hits.map((h) => ({
    recipeId: h.docId,
    title: h.title || path.basename(h.source || 'unknown'),
    summary: h.excerpt,
    sourceDoc: h.source,
  }));
}

// Note: path is used for title fallback — require it
const path = require('node:path');

module.exports = { bbRecipeList };
