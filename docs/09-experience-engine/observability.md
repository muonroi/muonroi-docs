---
title: Observability
sidebar_label: Observability
sidebar_position: 6
---

# Experience Engine Observability & Admin Tools

The Experience Engine provides a comprehensive suite of observability tools and admin commands to monitor health, track learning velocity, inspect knowledge graphs, and manage the knowledge base.

## Stats & Metrics

Monitor learning velocity and usage patterns with the stats command:

```bash
node tools/exp-stats.js              # last 7 days
node tools/exp-stats.js --since 30d  # custom window
node tools/exp-stats.js --all        # all time
```

Output includes:
- **Hit rate**: percentage of suggestions successfully applied
- **Mistakes avoided**: count of errors prevented by hints
- **Velocity**: lessons learned per week
- **Tier distribution**: confidence level breakdown of entries

The same metrics are available via REST:

```bash
curl http://localhost:8082/api/stats
```

## Health Check

Run a 14-point diagnostic dashboard to verify all Experience Engine systems:

```bash
bash ~/.experience/health-check.sh        # interactive dashboard
bash ~/.experience/health-check.sh --json # machine-readable output
bash ~/.experience/health-check.sh --watch # auto-refresh every 30s
```

View the last persisted health snapshot:

```bash
exp-health-last
```

The health check validates:
- Configuration files and paths
- SSH tunnel connectivity (for VPS deployments)
- Qdrant vector database availability
- Embedding API responsiveness
- Brain API connectivity
- Core system files
- Agent hook wiring
- Activity log integrity
- Model routing configuration

## Gates Inspection

Check server-side readiness for each operational gate:

```bash
node tools/exp-gates.js
```

Or via REST:

```bash
curl http://localhost:8082/api/gates
```

Each gate reports status as PASS, WARN, or FAIL:
- **Qdrant**: Vector database availability
- **Embed**: Embedding service health
- **Brain**: Brain API connectivity
- **Hooks**: Agent hook wiring status

## Knowledge Graph

Inspect relationships between experience entries using the knowledge graph API:

```bash
curl "http://localhost:8082/api/graph?id=<experience-id>"
```

Response includes graph edges such as:
- `generalizes`: broader principle this entry generalizes from
- `relates-to`: related entries and lessons
- `supersedes`: entries this one has replaced or improved upon

Example:

```bash
curl "http://localhost:8082/api/graph?id=a1b2c3d4"
```

## Timeline (Knowledge Evolution)

View the complete evolution of a topic across all related entries:

```bash
curl "http://localhost:8082/api/timeline?topic=dependency+injection"
```

The timeline shows:
- Which entries superseded which over time
- Timestamps of revisions and refinements
- The current consensus principle or best practice
- Historical context for decision reversals

## Admin Tools

| Tool | Command | Purpose |
|------|---------|---------|
| **Stats** | `node tools/exp-stats.js` | Usage and velocity metrics across time windows |
| **Gates** | `node tools/exp-gates.js` | Server readiness check for all operational gates |
| **Dogfood Loop** | `node tools/exp-dogfood-loop.js` | Controlled live confirmation loop for organic lessons |
| **Holdout Harness** | `node tools/exp-holdout-harness.js` | Seed-vs-holdout replay to prove novel-case coverage |
| **Demote** | `node tools/exp-demote.js` | Demotion or reclassification of entries |
| **Backup** | `node tools/exp-portable-backup.js` | Portable export of knowledge base |
| **Restore** | `node tools/exp-portable-restore.js` | Portable restore to new machine or VPS |
| **Replay Sessions** | `node tools/exp-replay-sessions.js` | Replay recorded session events for analysis |
| **Server Maintain** | `node tools/exp-server-maintain.js` | Server maintenance and cleanup flow |
| **Bulk Seed** | `node tools/experience-bulk-seed.js` | Bulk seeding from existing memory directories |

## Portable Backup & Restore

Export the entire knowledge base for transfer to new machines or VPS deployments:

```bash
# Export to JSON
node tools/exp-portable-backup.js --output backup-2025-05.json

# Restore on new machine or VPS
node tools/exp-portable-restore.js --input backup-2025-05.json
```

Backup files are self-contained JSON exports that include all entries, confidence scores, relationships, and metadata.

## Seeding from Existing Memory

Bootstrap the Experience Engine from existing Claude project memories:

```bash
node tools/experience-bulk-seed.js --memory-dir ~/.claude/projects/*/memory
```

This allows you to:
- Migrate experience entries between machines
- Seed new installations with lessons from established projects
- Accelerate learning rather than waiting for organic feedback

Specify memory directories from Claude project folders, workspace memories, or other structured knowledge bases.

---

## Related Resources

- [Experience Engine Overview](./overview)
- [Getting Started](./getting-started)
- [Configuration](./configuration)
