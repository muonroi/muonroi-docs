# SignalR Hot Reload

The control plane exposes `RuleSetChangeHub` at `/hubs/ruleset-changes`.

## Flow

1. a ruleset change is saved or activated
2. `IRuleSetChangeNotifier` publishes a change event
3. `RuleSetHubNotifier` subscribes and pushes `RuleSetChanged`
4. clients joined to `tenant:{tenantId}` receive the update

When Redis hot reload is enabled, change publication becomes cross-node instead of single-process only.
