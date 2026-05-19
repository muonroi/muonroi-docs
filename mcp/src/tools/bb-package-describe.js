/**
 * bb-package-describe.js — tool handler for bb.package.describe
 * Args: { packageId: string }  e.g. "Muonroi.RuleEngine.Runtime"
 * Returns: { packageId, purpose, dependsOn, samples, sourceDoc }
 *
 * Derives the response from docs.search — no separate schema.
 */
'use strict';

const { search } = require('../qdrant-client.js');

async function bbPackageDescribe({ packageId }) {
  if (!packageId || typeof packageId !== 'string') throw new Error('packageId must be a non-empty string');

  const query = `${packageId} NuGet package purpose dependencies usage`;
  const hits = await search(query, 5);

  if (hits.length === 0) {
    return {
      packageId,
      purpose: 'No information found — run `npm run ingest` to populate the bb-docs collection.',
      dependsOn: [],
      samples: [],
      sourceDoc: null,
    };
  }

  const top = hits[0];
  const allText = hits.map((h) => h.excerpt).join('\n');

  // Extract "Muonroi.*" package refs as likely dependencies
  const pkgMatches = [...allText.matchAll(/Muonroi\.[A-Za-z.]+/g)].map((m) => m[0]);
  const dependsOn = [...new Set(pkgMatches.filter((p) => p !== packageId))].slice(0, 8);

  // Extract code samples (```...``` blocks)
  const sampleMatches = [...allText.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]);
  const samples = sampleMatches.slice(0, 3);

  return {
    packageId,
    purpose: top.excerpt,
    dependsOn,
    samples,
    sourceDoc: top.source,
  };
}

module.exports = { bbPackageDescribe };
