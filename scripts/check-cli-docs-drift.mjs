#!/usr/bin/env node
// Run `node scripts/check-cli-docs-drift.mjs` to catch CLI-vs-docs drift. Add to CI.
//
// Compares field/variant names between muonroi-cli source and the reference
// docs at docs/05-reference/cli-settings-reference.md + verify-recipes-matrix.md.
// Exit 0 = aligned, 1 = drift detected.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const CLI_ROOT = resolve(REPO_ROOT, "..", "muonroi-cli");

const SETTINGS_SRC = resolve(CLI_ROOT, "src/utils/settings.ts");
const RECIPES_SRC = resolve(CLI_ROOT, "src/verify/recipes.ts");
const SETTINGS_DOC = resolve(REPO_ROOT, "docs/05-reference/cli-settings-reference.md");
const RECIPES_DOC = resolve(REPO_ROOT, "docs/05-reference/verify-recipes-matrix.md");

async function readSafe(p) {
  try {
    return await readFile(p, "utf8");
  } catch (err) {
    console.error(`[drift] cannot read ${p}: ${err.message}`);
    process.exit(1);
  }
}

function extractSettingsFields(src) {
  // Pull the `export interface UserSettings { ... }` block, then field names.
  const start = src.indexOf("export interface UserSettings");
  if (start < 0) return [];
  let depth = 0;
  let i = src.indexOf("{", start);
  const open = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = src.slice(open + 1, i);
  // Only collect top-level fields (depth 0 inside the interface body).
  // Nested anonymous object types (e.g. providers.openai) live at depth>0
  // and are documented in their parent row, not as separate keys.
  const names = new Set();
  let d = 0;
  let lineStartDepth = 0;
  for (const line of body.split(/\r?\n/)) {
    lineStartDepth = d;
    for (const ch of line) {
      if (ch === "{") d++;
      else if (ch === "}") d--;
    }
    if (lineStartDepth !== 0) continue;
    const m = line.match(/^\s*([a-zA-Z_][\w]*)\??\s*:/);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

function extractVerifyAppKinds(src) {
  const m = src.match(/export type VerifyAppKind =([\s\S]*?);/);
  if (!m) return [];
  const variants = new Set();
  for (const v of m[1].matchAll(/"([a-zA-Z][\w-]*)"/g)) variants.add(v[1]);
  return [...variants].sort();
}

function docMentions(doc, name) {
  // Match in inline-code (`name`) — avoids false positives in prose.
  const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  return new RegExp("`" + escaped + "(?:`|[.:\\s])", ).test(doc);
}

function report(label, sourceNames, doc) {
  const missing = sourceNames.filter((n) => !docMentions(doc, n));
  if (missing.length > 0) {
    console.error(`[drift] ${label}: ${missing.length} name(s) in source but missing from docs:`);
    for (const n of missing) console.error(`         - ${n}`);
    return 1;
  }
  console.log(`[drift] ${label}: OK (${sourceNames.length} names matched)`);
  return 0;
}

const [settingsSrc, recipesSrc, settingsDoc, recipesDoc] = await Promise.all([
  readSafe(SETTINGS_SRC),
  readSafe(RECIPES_SRC),
  readSafe(SETTINGS_DOC),
  readSafe(RECIPES_DOC),
]);

const fields = extractSettingsFields(settingsSrc);
const kinds = extractVerifyAppKinds(recipesSrc);

let failed = 0;
failed += report("UserSettings fields", fields, settingsDoc);
failed += report("VerifyAppKind variants", kinds, recipesDoc);

process.exit(failed > 0 ? 1 : 0);
