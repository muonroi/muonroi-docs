# Secret Management Guide

Store JWT signing keys, database credentials, Redis passwords, and third-party API secrets in a dedicated secret store rather than plain configuration files.

## Secret provider abstraction

Muonroi exposes `ISecretProvider` so applications can resolve secrets from different backends.

The default implementation is often `ConfigurationSecretProvider`, but production deployments should usually replace it with a provider for Azure Key Vault, HashiCorp Vault, AWS Secrets Manager, or an equivalent platform.

```csharp
services.AddSingleton<ISecretProvider, ConfigurationSecretProvider>();
```

Consumers such as bearer-token resolution and connection-string providers can pull sensitive values through that abstraction instead of binding directly to plaintext configuration.

## Operational guidance

- Keep secret rotation separate from application releases.
- Scope secrets by environment and tenant where required.
- Never commit production secrets to Git.
- Log secret source and version metadata when useful, but never log secret values.
