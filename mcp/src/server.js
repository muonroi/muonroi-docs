#!/usr/bin/env node
/**
 * server.js — stdio MCP server for Muonroi BB docs + recipes.
 *
 * Exposes 6 tools:
 *   docs.search          — semantic search across all ingested docs
 *   docs.read            — fetch full content of one doc chunk by docId
 *   bb.template.describe — structured info about a dotnet new template
 *   bb.package.describe  — structured info about a NuGet package
 *   bb.recipe.list       — list recipes by optional domain
 *   setup.guide          — full ordered setup recipe for an ecosystem component (deterministic)
 *
 * Boot: node src/server.js
 * Register in MCP client: { "command": "node", "args": ["/path/to/mcp/src/server.js"] }
 */
'use strict';

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const { docsSearch } = require('./tools/docs-search.js');
const { docsRead } = require('./tools/docs-read.js');
const { bbTemplateDescribe } = require('./tools/bb-template-describe.js');
const { bbPackageDescribe } = require('./tools/bb-package-describe.js');
const { bbRecipeList } = require('./tools/bb-recipe-list.js');
const { setupGuide } = require('./tools/setup-guide.js');

// ---- Tool registry --------------------------------------------------------

const TOOLS = [
  {
    name: 'docs.search',
    description:
      'Semantic search across all ingested Muonroi Building Block docs and recipes. ' +
      'Returns ranked chunks with title, excerpt, and source path. ' +
      'Use this instead of reading individual files when you need to discover or locate information.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language search query' },
        topK: { type: 'number', description: 'Max results to return (default 5, max 20)', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'docs.read',
    description:
      'Fetch the full markdown content of a single doc chunk by its docId. ' +
      'Get docIds from docs.search first.',
    inputSchema: {
      type: 'object',
      properties: {
        docId: { type: 'string', description: 'Chunk ID returned by docs.search' },
      },
      required: ['docId'],
    },
  },
  {
    name: 'bb.template.describe',
    description:
      'Get structured information about a muonroi-building-block dotnet new template. ' +
      'Returns purpose, project structure, known NuGet packages, and a sample prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        shortName: {
          type: 'string',
          description: 'Template short name, e.g. "mr-micro-sln", "mr-modular", "mr-api"',
        },
      },
      required: ['shortName'],
    },
  },
  {
    name: 'bb.package.describe',
    description:
      'Get structured information about a Muonroi NuGet package. ' +
      'Returns purpose, dependencies, and code samples.',
    inputSchema: {
      type: 'object',
      properties: {
        packageId: {
          type: 'string',
          description: 'NuGet package ID, e.g. "Muonroi.RuleEngine.Runtime"',
        },
      },
      required: ['packageId'],
    },
  },
  {
    name: 'bb.recipe.list',
    description:
      'List available recipes (how-to guides and patterns) for a given domain. ' +
      'Omit domain to list all top recipes.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Optional domain filter, e.g. "auth", "background-jobs", "caching", "rule-engine"',
        },
      },
    },
  },
  {
    name: 'setup.guide',
    description:
      'Returns the full, ordered, agent-executable setup recipe for a Muonroi ecosystem component — ' +
      'prerequisites, the exact values to ask the user for, numbered steps, verification, and ' +
      'troubleshooting. Deterministic (no search). Use this INSTEAD of docs.search whenever the task ' +
      'is to set up / install / configure one of these components.',
    inputSchema: {
      type: 'object',
      properties: {
        component: {
          type: 'string',
          enum: ['experience-engine', 'muonroi-cli', 'muonroi-tools', 'harness', 'ecosystem'],
          description:
            'Which component to set up. "ecosystem" = the full toolchain in dependency order. ' +
            '"muonroi-tools" = the tools-mcp server; "harness" = the mcp-driver server. Default "ecosystem".',
          default: 'ecosystem',
        },
      },
    },
  },
];

// ---- Dispatch -------------------------------------------------------------

async function dispatch(name, args) {
  switch (name) {
    case 'docs.search':      return docsSearch(args);
    case 'docs.read':        return docsRead(args);
    case 'bb.template.describe': return bbTemplateDescribe(args);
    case 'bb.package.describe':  return bbPackageDescribe(args);
    case 'bb.recipe.list':   return bbRecipeList(args);
    case 'setup.guide':      return setupGuide(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ---- Server ---------------------------------------------------------------

/**
 * Builds a fully-wired MCP Server (tool list + dispatch). Transport-agnostic so both the
 * stdio entrypoint (this file) and the HTTP entrypoint (server-http.js) share identical behavior.
 * A fresh Server is created per call — the HTTP transport wants one server per session.
 */
function buildServer() {
  const server = new Server(
    { name: 'muonroi-docs', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await dispatch(name, args ?? {});
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: String(err?.message ?? err) }],
      };
    }
  });

  return server;
}

async function main() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is running — no further output to stdout (stdio transport owns stdout)
}

module.exports = { buildServer, TOOLS };

// Only auto-boot the stdio server when run directly (not when imported by server-http.js / tests).
if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(1);
  });
}
