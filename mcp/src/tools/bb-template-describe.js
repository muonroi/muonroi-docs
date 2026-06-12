/**
 * bb-template-describe.js — tool handler for bb.template.describe
 * Args: { shortName: string }  e.g. "mr-micro-sln", "mr-modular", "mr-api"
 * Returns: { shortName, purpose, structure, packages, samplePrompt, sourceDoc }
 *
 * Derives the response from docs.search — no separate schema.
 */
'use strict';

const { search } = require('../qdrant-client.js');

async function bbTemplateDescribe({ shortName }) {
  if (!shortName || typeof shortName !== 'string') throw new Error('shortName must be a non-empty string');

  const query = `${shortName} template structure purpose packages dotnet new`;
  const hits = await search(query, 5);

  if (hits.length === 0) {
    return {
      shortName,
      purpose: 'No information found — run `npm run ingest` to populate the bb-docs collection.',
      structure: null,
      packages: [],
      samplePrompt: null,
      sourceDoc: null,
    };
  }

  const top = hits[0];
  // Extract known packages: look for "Muonroi." prefixed identifiers in excerpts
  const allText = hits.map((h) => h.excerpt).join('\n');
  const pkgMatches = [...allText.matchAll(/Muonroi\.[A-Za-z.]+/g)].map((m) => m[0]);
  const packages = [...new Set(pkgMatches)].slice(0, 10);

  return {
    shortName,
    purpose: top.excerpt,
    structure: hits.length > 1 ? hits[1].excerpt : null,
    packages,
    samplePrompt: `dotnet new ${shortName} -n MyProject`,
    sourceDoc: top.source,
  };
}

module.exports = { bbTemplateDescribe };
