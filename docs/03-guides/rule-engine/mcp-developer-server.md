# MCP Developer Server

`muonroi-mcp-dev` is the local stdio MCP server for Muonroi authoring workflows.

It lives in `muonroi-building-block/tools/Muonroi.RuleGen.Mcp` and exposes the developer-side toolchain that was previously only available through standalone CLIs.

## What it covers

- RuleGen: `extract`, `verify`, `register`, `generate-tests`, `merge`, `split`, `watch`, FEEL translation, runtime ruleset JSON loading
- DecisionTableGen: `import-excel`, `validate`, `export-json`, `export-dmn`
- Policy signing: `muonroi_policy_sign`, `muonroi_policy_verify`
- Compliance: `muonroi_compliance_check`, wrapper suggestions, OSS boundary checks
- Scaffolding: rule source, repository, dbcontext, service skeletons

## Required AI workflow

When an agent edits Muonroi C# code, follow this order:

1. Read `muonroi://ecosystem/rules`
2. Call a `muonroi_scaffold_*` tool for the initial skeleton
3. Fill business logic into the generated skeleton
4. Call `muonroi_compliance_check`
5. If the file contains `[MExtractAsRule]`, call `muonroi_rulegen_extract`
6. Call `muonroi_rulegen_register`

This keeps generated code aligned with MBB001-MBB007 and with the RuleGen authoring pipeline.

## Claude Code config

From the workspace root, `.claude/mcp.json` should register both servers:

```json
{
  "mcpServers": {
    "muonroi-cloud": {
      "url": "http://localhost:5035/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer ${MUONROI_TOKEN}",
        "X-TenantId": "${MUONROI_TENANT_ID}"
      }
    },
    "muonroi-dev": {
      "command": "dotnet",
      "args": [
        "run",
        "--project",
        "muonroi-building-block/tools/Muonroi.RuleGen.Mcp/Muonroi.RuleGen.Mcp.csproj"
      ],
      "transport": "stdio"
    }
  }
}
```

Per-repo Claude configs are committed in:

- `muonroi-building-block/.claude/mcp.json`
- `muonroi-control-plane/.claude/mcp.json`
- `muonroi-ui-engine/.claude/mcp.json`

## Cloud pairing

Use `muonroi-dev` for local authoring and filesystem-bound tasks.

Use `muonroi-control-plane` MCP for deployed rule operations such as ruleset CRUD, approvals, canary rollout, audit, tenant management, and decision table operations. That server is hosted from `muonroi-control-plane/src/Muonroi.ControlPlane.Mcp` and is exposed over HTTP transport by the Control Plane API.

Decision table tools exposed from the control-plane MCP include:

- `muonroi_decision_table_list`
- `muonroi_decision_table_get`
- `muonroi_decision_table_evaluate`
- `muonroi_decision_table_get_versions`
- `muonroi_decision_table_get_version`
- `muonroi_decision_table_diff_versions`

## Notes

- The stdio server disables console logging so RuleGen merge/split commands do not corrupt the MCP transport.
- Compliance checks use deterministic Muonroi pattern/project scans for MBB001-MBB007 before code is saved.
- `Muonroi.RuleGen.VisualStudio` remains IDE-only and is intentionally not exposed through MCP.
- `MockLicenseServer` remains dev/test-only and is intentionally not exposed through MCP.
