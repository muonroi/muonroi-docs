# Rule Rollout Guide

Current rollout strategy combines approval, activation, canary, and live notification.

## Baseline flow

1. Save a new version.
2. Submit it for approval.
3. Approve it with a different actor.
4. Activate it or route traffic through canary.
5. Broadcast the change to listeners.

## Required options

```json
"RuleControlPlane": {
  "RequireApproval": true,
  "NotifyOnStateChange": true,
  "EnableCanary": true
}
```

## Notification path

- `IRuleSetChangeNotifier`
- Redis pub/sub when enabled
- `RuleSetHubNotifier`
- `RuleSetChangeHub`

## Operational rule

Do not skip the approval state when `RequireApproval=true`; `PostgresRuleSetStore` blocks activation of draft or rejected versions in that mode.
