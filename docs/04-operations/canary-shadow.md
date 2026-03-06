# Canary Shadow

Use canary rollout for progressive activation and shadow evaluation for comparison-only runs.

## Canary

- route selected tenants to a new version
- keep the previous version available as fallback
- monitor audit and notification streams before promotion

## Shadow

- run a candidate ruleset without making it authoritative
- compare outputs against the active version
- use the result to decide whether to promote or reject

Canary is traffic-affecting. Shadow is comparison-only.
