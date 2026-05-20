---
title: RuleGen VS Code Extension
sidebar_label: RuleGen VS Code Extension
sidebar_position: 11
---

# RuleGen VS Code Extension

The **RuleGen VS Code extension** streamlines rule development by bringing code generation, rule discovery, and Control Plane integration directly into your editor. Extract rules from source code, watch for changes, publish to the control plane, and explore your entire ruleset—all without leaving VS Code.

## Why Use the Extension?

- **Zero-friction extraction** — Scan your project for `[MExtractAsRule]` attributes and generate rule files automatically
- **Live feedback** — Enable the watcher to regenerate rules on every save
- **Integrated publishing** — Push rules to the Control Plane without CLI switches
- **Rule Explorer** — Visual tree of all rules in your workspace with metadata
- **Smart navigation** — Jump between source rules and their generated code instantly

## Installation

### From VS Code Marketplace

1. Open VS Code and press `Ctrl+Shift+X` (or `Cmd+Shift+X` on macOS) to open the Extensions sidebar
2. Search for **"RuleGen"**
3. Click **Install** on the **Muonroi RuleGen** extension (ID: `muonroi.rulegen-vscode`)
4. Reload VS Code when prompted

### Manual Installation (VSIX File)

If you prefer to install from a VSIX file:

1. Download the latest `.vsix` from the [Muonroi Releases](https://github.com/muonroi/muonroi-ui-engine/releases)
2. Open the VS Code Command Palette (`Ctrl+Shift+P`)
3. Run: **Extensions: Install from VSIX**
4. Select the downloaded file
5. Reload VS Code

## Configuration

### Project Setup (.rulegenrc.json)

Create a `.rulegenrc.json` file in your project root to configure RuleGen behavior:

```json
{
  "outputDir": "./generated/rules",
  "scanPatterns": [
    "**/*.cs"
  ],
  "excludePatterns": [
    "**/obj/**",
    "**/bin/**",
    "**/.git/**"
  ],
  "namespace": "MyApp.Rules",
  "generateAsync": true,
  "preserveExistingFiles": false
}
```

**Common options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outputDir` | string | `./Rules/Generated` | Directory for generated `.g.cs` files |
| `scanPatterns` | string[] | `["**/*.cs"]` | Glob patterns to scan for `[MExtractAsRule]` |
| `excludePatterns` | string[] | `["**/obj/**", "**/bin/**"]` | Paths to exclude from scanning |
| `namespace` | string | (inherited) | Namespace for generated rule classes |
| `generateAsync` | boolean | `true` | Generate `async` rule methods |
| `preserveExistingFiles` | boolean | `false` | Keep manual edits in generated files |

### VS Code Settings

Open **Settings** (`Ctrl+,`) and search for `RuleGen` to configure extension behavior:

```json
{
  "rulegen.controlPlaneUrl": "https://cp.yourcompany.local",
  "rulegen.autoActivateLicense": false,
  "rulegen.showRuleMetadataInCodeLens": true,
  "rulegen.watcherDebounceMs": 500
}
```

## Free Features

All developers get these features regardless of license:

### 1. Extract All Rules

Extract every `[MExtractAsRule]` rule in your project and generate corresponding `.g.cs` files.

**Command Palette:** `RuleGen: Extract All Rules`

**Keyboard:** `Ctrl+Alt+R E` (Windows/Linux) or `Cmd+Alt+R E` (macOS)

**What happens:**
1. Extension scans your project for decorated rule methods
2. Parses metadata (order, hook point, rules)
3. Generates typed rule classes in `outputDir`
4. Shows success/error summary

### 2. Start Rule Watcher

Enable automatic re-extraction whenever you save a file containing rules.

**Command Palette:** `RuleGen: Start Rule Watcher`

**What happens:**
- Extension monitors changes to `.cs` files
- On save, re-runs extraction if `[MExtractAsRule]` decorators changed
- Debounces rapid saves (default 500ms)
- Shows status in the VS Code status bar

**Stop watcher:** `RuleGen: Stop Rule Watcher` or close the workspace

### 3. Go to Generated Rule

Jump from a rule class directly to its generated `.g.cs` file.

**Keyboard:** `Ctrl+Shift+G` (in any rule class)

**Shortcut:** Right-click a rule class name → **Go to Generated**

### 4. CodeLens Integration

Inline metadata displays above each `[MExtractAsRule]` method:

```csharp
[MExtractAsRule(
    Hook = "approval-decision",
    Order = 10
)]
public class ApprovalRule : IRule
{
    // CodeLens shows:
    // Hook: approval-decision | Order: 10 | Generated: ApprovalRule.g.cs
    // Click to jump to generated code
}
```

## Premium Features (Licensed/Enterprise)

Unlock advanced workflows by activating your license in VS Code.

### License Activation

**Command Palette:** `RuleGen: Activate License`

**Flow:**
1. Open command palette and select `RuleGen: Activate License`
2. Enter your `MRR-xxxxx` key when prompted
3. Extension validates the key against the License Server
4. On success, all premium features unlock automatically
5. License status displays in the status bar

**Keyboard:** `Ctrl+Alt+R L`

**View status:** `RuleGen: Show License Status`

### Premium Feature 1: Rule Explorer

A visual tree view of all rules in your workspace with their dependencies, hooks, and metadata.

**Command Palette:** `RuleGen: Open Rule Explorer`

**Keyboard:** `Ctrl+Alt+R X`

**Explorer panel shows:**
- All extracted rules grouped by hook point
- Rule order and execution dependencies
- Rule input/output fields
- Links to source and generated files
- Search/filter by name

**Click on a rule to:**
- Navigate to source code
- View generated rule class
- See rule metadata (hook, order, async)

### Premium Feature 2: Publish Ruleset to Control Plane

Push extracted rules directly to the Control Plane API without using the CLI.

**Command Palette:** `RuleGen: Publish Ruleset to Control Plane`

**Keyboard:** `Ctrl+Alt+R P`

**Before publishing:**
1. Extract all rules or enable the watcher
2. Configure `rulegen.controlPlaneUrl` in settings
3. Ensure you have a valid license and API credentials

**Publish flow:**
1. Extension collects all extracted `.g.cs` files
2. Packages them into a ruleset bundle
3. Posts to Control Plane at `/api/v1/rulesets/publish`
4. Shows upload progress and confirmation
5. Provides link to review/approve in the dashboard

**Post-publish:**
- Rules appear in the Control Plane dashboard as a new draft version
- Navigate to **Rule Management** → **Versions** to review
- Approve changes and activate when ready

### Premium Feature 3: Premium Watch Mode

Enhanced watcher that automatically extracts and publishes rules on save.

**Command Palette:** `RuleGen: Enable Premium Watch Mode`

**What it does:**
- Starts the file watcher (free feature)
- On rule changes, automatically re-extracts rules
- Publishes updated ruleset to Control Plane
- Shows extraction + publish status in VS Code

**Keyboard:** `Ctrl+Alt+R W`

**Stop:** `RuleGen: Disable Premium Watch Mode`

**Use case:** Perfect for iterative development—change a rule, save, and it's automatically live in the Control Plane after approval.

## Keyboard Shortcuts Reference

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| Extract All Rules | `Ctrl+Alt+R E` | `Cmd+Alt+R E` |
| Go to Generated Rule | `Ctrl+Shift+G` | `Cmd+Shift+G` |
| Activate License | `Ctrl+Alt+R L` | `Cmd+Alt+R L` |
| Open Rule Explorer | `Ctrl+Alt+R X` | `Cmd+Alt+R X` |
| Publish Ruleset | `Ctrl+Alt+R P` | `Cmd+Alt+R P` |
| Premium Watch Mode | `Ctrl+Alt+R W` | `Cmd+Alt+R W` |

## Troubleshooting

### Rules not extracted after saving?

1. Check that `[MExtractAsRule]` decorator is present
2. Verify `.rulegenrc.json` path patterns match your files
3. Open **Output** panel → select **RuleGen** channel for debug logs
4. Ensure watcher is running: `RuleGen: Show Watcher Status`

### "License invalid" error?

1. Verify your `MRR-xxxxx` key is correct
2. Check that License Server is reachable: `rulegen.controlPlaneUrl`
3. Run `RuleGen: Show License Status` to see expiry and tier
4. Licenses expire after the configured validity period—renew or request a new key

### Publish fails with "401 Unauthorized"?

1. Ensure Control Plane URL is correct in settings
2. Verify you have API credentials (usually via VS Code auth flow)
3. Check network access to Control Plane endpoint
4. See [Control Plane Overview](../control-plane/control-plane-overview.md) for authentication details

### Extension is slow or unresponsive?

1. Increase `rulegen.watcherDebounceMs` in settings (default 500ms)
2. Exclude large directories via `excludePatterns` in `.rulegenrc.json`
3. Disable CodeLens if not needed: `rulegen.showRuleMetadataInCodeLens: false`
4. Restart VS Code and check the Output panel for performance logs

## Best Practices

1. **Enable the watcher during development** — Keeps your generated code in sync with source
2. **Commit `.rulegenrc.json`** — Share configuration across the team
3. **Review generated code before publish** — Check `.g.cs` files for correctness
4. **Use premium watch mode for rapid iteration** — Combines extraction and publish in one workflow
5. **Organize by hook point** — Group related rules under the same hook for easier maintenance
6. **Test rules in Control Plane before production** — Use dry-run to validate behavior

## Related Documentation

- [RuleGen Guide](./rulegen-guide.md) — Comprehensive RuleGen usage and CLI options
- [Rule Source Generator](./rule-source-generator.md) — How `.g.cs` files are generated and structured
- [Control Plane Overview](../control-plane/control-plane-overview.md) — Publishing, versioning, and deployment
- [Rule Engine Basics](./rule-engine-guide.md) — Understanding rule execution and flow graphs

## API Reference (For Contributors)

The extension is written in TypeScript and uses the following key APIs:

- **RuleGen CLI bridge** — Spawns `rulegen` CLI as child process for extraction
- **VS Code File System API** — Watches and scans workspace files
- **License Server integration** — HTTP POST to validate and manage MRR keys
- **Control Plane SDK** — REST client for publishing rulesets
- **Language Server Protocol (LSP)** — CodeLens and hover diagnostics (planned)

For source code, visit: https://github.com/muonroi/muonroi-ui-engine/tree/develop/packages/rulegen-vscode
