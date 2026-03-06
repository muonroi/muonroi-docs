# Open Core Model

Muonroi uses an open-core packaging model.

## OSS layer

- published to public package registries
- licensed under Apache 2.0
- covers contracts, wrappers, rule execution core, decision table core, source generators, testing helpers, and base UI runtime packages

## Commercial layer

- distributed through private feeds or private deployments
- requires a valid Muonroi commercial license
- covers enterprise governance, web runtime surfaces, advanced integrations, rule authoring widgets, and deployed operator services

## License keys and activation

- license keys use the `MRR-...` format
- the license server issues activation proofs signed with rotating keys
- runtime hosts can verify an offline activation proof with a public key
