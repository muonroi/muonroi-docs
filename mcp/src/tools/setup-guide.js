/**
 * setup-guide.js — tool handler for setup.guide
 *
 * Deterministic (no embeddings / no Qdrant): returns the full, ordered, agent-executable setup
 * recipe markdown for one Muonroi ecosystem component, read straight from mcp/recipes/<component>.md.
 * Use this instead of docs.search when the task is "set up / install X".
 *
 * Args: { component?: string }  default "ecosystem"
 * Returns: { component, title, markdown }
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// component -> recipe filename. The enum is the single guard; unknown values are rejected with
// the valid set so the caller can self-correct.
const RECIPES = {
  'experience-engine': 'experience-engine.md',
  'muonroi-cli': 'muonroi-cli.md',
  'muonroi-tools': 'muonroi-tools.md',
  'harness': 'harness.md',
  'ecosystem': 'ecosystem.md',
};

const RECIPES_DIR = path.resolve(__dirname, '..', '..', 'recipes');

function firstHeading(markdown, fallback) {
  const m = markdown.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

async function setupGuide({ component = 'ecosystem' } = {}) {
  const components = Object.keys(RECIPES);
  if (!RECIPES[component]) {
    throw new Error(
      `Unknown component "${component}". Valid components: ${components.join(', ')}.`
    );
  }

  const file = path.join(RECIPES_DIR, RECIPES[component]);
  let markdown;
  try {
    markdown = fs.readFileSync(file, 'utf8');
  } catch (err) {
    // No silent catch: log module + operation + component + error before surfacing.
    console.error(
      `[setup-guide] failed to read recipe for component="${component}" at ${file}: ${err?.message}`,
      { stack: err?.stack?.split('\n').slice(0, 3) }
    );
    throw new Error(`Setup recipe for "${component}" is unavailable: ${err?.message}`);
  }

  return {
    component,
    title: firstHeading(markdown, RECIPES[component]),
    markdown,
  };
}

module.exports = { setupGuide, RECIPES };
