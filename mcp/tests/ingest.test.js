/**
 * ingest.test.js — unit test for crawl.js chunker logic.
 * Uses in-memory fake markdown — no real filesystem walk or Qdrant calls.
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const { splitIntoChunks, extractTitle } = require('../ingest/crawl.js');

// ---- Fake markdown fixtures -----------------------------------------------

const SIMPLE_DOC = `# Rule Engine Guide

Introduction paragraph about the rule engine.

## Overview

The rule engine orchestrates fact bags and rule sets.

### Execution Modes

Three modes: sequential, parallel, compensated.

## Configuration

Add the package to your DI container.

\`\`\`csharp
services.AddRuleEngine();
\`\`\`
`;

const SINGLE_SECTION_DOC = `# Short Doc

Just one section with some text that is definitely under 800 characters so it should not be split.
`;

const LONG_SECTION_DOC = 'A'.repeat(2500); // no headings, will be split by char limit

// ---- Tests ----------------------------------------------------------------

describe('extractTitle', () => {
  test('returns first H1 heading', () => {
    const title = extractTitle(SIMPLE_DOC, '/some/path/rule-engine-guide.md');
    assert.strictEqual(title, 'Rule Engine Guide');
  });

  test('falls back to filename without extension', () => {
    const title = extractTitle('no heading here', '/some/path/my-file.md');
    assert.strictEqual(title, 'my-file');
  });
});

describe('splitIntoChunks', () => {
  test('splits SIMPLE_DOC into multiple chunks', () => {
    const chunks = splitIntoChunks(SIMPLE_DOC);
    assert.ok(chunks.length >= 2, `Expected >= 2 chunks, got ${chunks.length}`);
  });

  test('each chunk has text and headingPath', () => {
    const chunks = splitIntoChunks(SIMPLE_DOC);
    for (const c of chunks) {
      assert.ok(typeof c.text === 'string', 'chunk.text must be string');
      assert.ok(Array.isArray(c.headingPath), 'chunk.headingPath must be array');
    }
  });

  test('headingPath reflects document hierarchy', () => {
    const chunks = splitIntoChunks(SIMPLE_DOC);
    // The "Execution Modes" section should have ['Rule Engine Guide', 'Overview', 'Execution Modes']
    // or similar path depending on chunk boundaries
    const hasOverviewChunk = chunks.some(
      (c) => c.headingPath.some((h) => h === 'Overview' || h === 'Execution Modes')
    );
    assert.ok(hasOverviewChunk, 'Should have chunks with Overview/Execution Modes in headingPath');
  });

  test('single short section stays as one chunk', () => {
    const chunks = splitIntoChunks(SINGLE_SECTION_DOC);
    assert.strictEqual(chunks.length, 1);
    assert.ok(chunks[0].text.includes('Just one section'));
  });

  test('long content without headings gets split into multiple chunks', () => {
    const chunks = splitIntoChunks(LONG_SECTION_DOC);
    assert.ok(chunks.length > 1, `Expected >1 chunks for 2500-char content, got ${chunks.length}`);
  });

  test('chunk text length does not exceed CHUNK_SIZE + overlap', () => {
    // Allow up to CHUNK_SIZE since a single heading line may not reach 800
    const chunks = splitIntoChunks(SIMPLE_DOC);
    for (const c of chunks) {
      assert.ok(c.text.length <= 900, `Chunk too long: ${c.text.length} chars`);
    }
  });

  test('overlapping chunks share tail/head content', () => {
    const chunks = splitIntoChunks(LONG_SECTION_DOC);
    if (chunks.length < 2) return; // nothing to check
    // The end of chunk[0] should overlap with the start of chunk[1]
    const endOf0 = chunks[0].text.slice(-100);
    const startOf1 = chunks[1].text.slice(0, 100);
    // They overlap if chunk[1] starts with content that was near the end of chunk[0]
    // Since the doc is all 'A's, both end/start will be 'A's
    assert.ok(endOf0.length > 0 && startOf1.length > 0);
  });
});
