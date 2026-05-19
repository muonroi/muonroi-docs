/**
 * docs-read.js — tool handler for docs.read
 * Args: { docId: string }
 * Returns: { docId, title, content, source }
 *
 * Fetches the full markdown content for a doc chunk stored in bb-docs.
 * If the docId points to a single chunk, returns that chunk's text.
 * Tip: use docs.search first to get docIds, then docs.read to get full content.
 */
'use strict';

const { readDoc } = require('../qdrant-client.js');

async function docsRead({ docId }) {
  if (!docId || typeof docId !== 'string') throw new Error('docId must be a non-empty string');
  const doc = await readDoc(docId);
  if (!doc) throw new Error(`Document not found: ${docId}`);
  return doc;
}

module.exports = { docsRead };
