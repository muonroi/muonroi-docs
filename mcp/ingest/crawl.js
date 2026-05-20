/**
 * crawl.js — walk configured source roots and split markdown into chunks.
 *
 * Output: Array of chunk objects ready for embedding:
 *   {
 *     id: string,            // deterministic: sha256(source + chunkIndex)[:16]
 *     text: string,          // ~800 chars, 100-char overlap, markdown-aware breaks
 *     payload: {
 *       source: string,      // absolute file path
 *       title: string,       // first H1 or filename
 *       headingPath: string[], // breadcrumb of H1..H3 at this chunk
 *       chunkIndex: number,
 *       totalChunks: number,
 *       mtime: number,       // ms since epoch
 *       contentHash: string, // sha256[:16] of full file
 *     }
 *   }
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SOURCES = require('./sources.json');
const CORE_ROOT = 'D:/sources/Core';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const SKIP_DIRS = new Set(SOURCES.skip);

// ---- Filesystem walk ------------------------------------------------------

function* walkDir(dir, globPattern) {
  // Simple recursive walk — we implement manual glob matching
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(full, globPattern);
    } else if (entry.isFile() && matchGlob(entry.name, globPattern)) {
      yield full;
    }
  }
}

function matchGlob(filename, globPattern) {
  // Only need to match filename-level glob or **/*.ext
  const basename = path.basename(globPattern);
  if (basename.startsWith('*')) {
    const ext = basename.slice(1); // e.g. ".md"
    return filename.endsWith(ext);
  }
  return filename === basename;
}

// ---- Heading-aware chunker ------------------------------------------------

const HEADING_RE = /^(#{1,3})\s+(.+)$/m;

function extractTitle(content, filepath) {
  const m = content.match(/^#\s+(.+)$/m);
  if (m) return m[1].trim();
  return path.basename(filepath, path.extname(filepath));
}

function splitIntoChunks(content) {
  // Split preferring H2/H3 header boundaries, then paragraph breaks.
  // Returns array of { text, headingPath }
  const lines = content.split('\n');
  const sections = [];
  let currentHeadings = []; // stack: [h1, h2, h3]
  let currentLines = [];

  function flushSection() {
    const text = currentLines.join('\n').trim();
    if (text.length > 0) {
      sections.push({ text, headingPath: [...currentHeadings] });
    }
    currentLines = [];
  }

  for (const line of lines) {
    const hm = line.match(/^(#{1,3})\s+(.+)$/);
    if (hm) {
      const level = hm[1].length; // 1, 2, or 3
      const heading = hm[2].trim();
      // Flush on H2/H3 boundaries (H1 is the doc title, don't split there)
      if (level >= 2 && currentLines.length > 0) {
        flushSection();
      }
      // Update heading stack
      if (level === 1) currentHeadings = [heading];
      else if (level === 2) currentHeadings = [currentHeadings[0] ?? null, heading].filter(Boolean);
      else if (level === 3) currentHeadings = [currentHeadings[0] ?? null, currentHeadings[1] ?? null, heading].filter(Boolean);
    }
    currentLines.push(line);
  }
  flushSection();

  // Now split each section into ~800 char chunks with 100-char overlap
  const chunks = [];
  for (const section of sections) {
    const text = section.text;
    if (text.length <= CHUNK_SIZE) {
      chunks.push({ text, headingPath: section.headingPath });
      continue;
    }
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + CHUNK_SIZE, text.length);
      const chunkText = text.slice(start, end);
      chunks.push({ text: chunkText, headingPath: section.headingPath });
      if (end === text.length) break;
      start = end - CHUNK_OVERLAP;
    }
  }

  return chunks;
}

// ---- Main crawl -----------------------------------------------------------

function crawlAll() {
  const results = [];

  for (const root of SOURCES.roots) {
    const absRoot = path.join(CORE_ROOT, root.path);
    if (!fs.existsSync(absRoot)) {
      process.stderr.write(`[crawl] Skipping missing root: ${absRoot}\n`);
      continue;
    }

    const files = [...walkDir(absRoot, root.glob)];
    process.stderr.write(`[crawl] ${root.label}: ${files.length} files in ${absRoot}\n`);

    for (const filepath of files) {
      let content;
      try { content = fs.readFileSync(filepath, 'utf8'); }
      catch { continue; }

      const stat = fs.statSync(filepath);
      const mtime = stat.mtimeMs;
      const fileHash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
      const title = extractTitle(content, filepath);
      const chunks = splitIntoChunks(content);

      for (let i = 0; i < chunks.length; i++) {
        const chunkContent = chunks[i];
        // Deterministic id: hash of filepath + chunkIndex + contentHash (mtime-agnostic)
        const idRaw = `${filepath}:${i}:${fileHash}`;
        const hex = crypto.createHash('sha256').update(idRaw).digest('hex').slice(0, 32);
        const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

        results.push({
          id,
          text: chunkContent.text,
          payload: {
            source: filepath,
            title,
            headingPath: chunkContent.headingPath,
            chunkIndex: i,
            totalChunks: chunks.length,
            mtime,
            contentHash: fileHash,
          },
        });
      }
    }
  }

  process.stderr.write(`[crawl] Total chunks: ${results.length}\n`);
  return results;
}

module.exports = { crawlAll, splitIntoChunks, extractTitle };
