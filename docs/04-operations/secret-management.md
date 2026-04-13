---
title: Secret Management Guide
sidebar_label: Secret Management
sidebar_position: 3
---

## Overview

Muonroi applications handle sensitive configuration including JWT signing keys, database credentials, Redis passwords, API keys, and license keys. These must be stored in a dedicated secret store rather than committed to version control or stored in plaintext configuration files.

This guide covers secret provider configuration, rotation procedures, environment patterns for local and cloud deployments, and best practices for protecting sensitive data throughout the application lifecycle.

---

## Secret Provider Abstraction

Muonroi exposes `ISecretProvider` to abstract secret storage backends. This allows applications to resolve secrets from different providers without code changes.

### Default Implementation

```csharp
services.AddSingleton<ISecretProvider, ConfigurationSecretProvider>();
```

The `ConfigurationSecretProvider` reads from standard .NET configuration (appsettings.json, environment variables). While suitable for development, production deployments should replace it with an enterprise secret store.

### Using ISecretProvider

```csharp
public class MyService(ISecretProvider secretProvider)
{
    public async Task ConnectAsync()
    {
        string connectionString = await secretProvider.GetSecretAsync("db:connection-string");
        string apiKey = await secretProvider.GetSecretAsync("stripe:api-key");
        
        // Use secrets
    }
}
```

---

## HashiCorp Vault Provider

HashiCorp Vault is a centralized secrets management system supporting dynamic secrets, encryption-as-a-service, and audit logging.

### Configuration (appsettings.json)

```json
{
  "VaultConfigs": {
    "Type": "HashiCorp",
    "Address": "https://vault.example.com:8200",
    "Token": "${VAULT_TOKEN}",
    "Namespace": "muonroi",
    "SecretsPath": "secret/data/production",
    "AuthMethod": "token",
    "TlsSkipVerify": false,
    "RequestTimeoutSeconds": 30,
    "CacheDurationMinutes": 5
  }
}
```

### Startup Registration

```csharp
services.AddHashiCorpVaultSecretProvider(configuration.GetSection("VaultConfigs"));
```

### Storing Secrets in Vault

```bash
# Login to Vault
vault login -method=ldap username=admin@example.com

# Store database credentials
vault kv put secret/production/db \
  connection-string="Server=db.internal;Database=muonroi;User=admin;Password=xxx"

# Store license keys
vault kv put secret/production/license \
  signing-key="-----BEGIN PRIVATE KEY-----\n..." \
  admin-api-key="sk-admin-xxxx"

# Store API keys
vault kv put secret/production/external-apis \
  stripe-secret="sk_live_xxxxx" \
  sendgrid-api-key="SG.xxxxx"
```

### Retrieving Secrets

Secrets are automatically cached for 5 minutes (configurable). Access patterns:

```csharp
// Direct retrieval
var secret = await secretProvider.GetSecretAsync("db:connection-string");

// With fallback
var secret = await secretProvider.GetSecretAsync(
    "db:connection-string", 
    defaultValue: "Server=localhost;Database=muonroi"
);

// Enum-based paths (recommended)
await secretProvider.GetSecretAsync(SecretPath.DatabaseConnectionString);
```

---

## Azure KeyVault Provider

Azure Key Vault integrates with Azure RBAC, managed identities, and private endpoints for cloud-native deployments.

### Configuration (appsettings.json)

```json
{
  "AzureKeyVaultConfigs": {
    "Type": "AzureKeyVault",
    "VaultUri": "https://muonroi-prod.vault.azure.net/",
    "TenantId": "${AZURE_TENANT_ID}",
    "ClientId": "${AZURE_CLIENT_ID}",
    "ClientSecret": "${AZURE_CLIENT_SECRET}",
    "AuthMethod": "ClientSecret",
    "CacheDurationMinutes": 5,
    "RequireHttps": true
  }
}
```

### Startup Registration

```csharp
services.AddAzureKeyVaultSecretProvider(configuration.GetSection("AzureKeyVaultConfigs"));
```

### Storing Secrets in Azure KeyVault

```bash
# Login to Azure
az login

# Create KeyVault (one-time)
az keyvault create \
  --resource-group muonroi-prod \
  --name muonroi-prod \
  --location eastus

# Store database credentials
az keyvault secret set \
  --vault-name muonroi-prod \
  --name db-connection-string \
  --value "Server=db.internal;Database=muonroi;User=admin;Password=xxx"

# Store license keys
az keyvault secret set \
  --vault-name muonroi-prod \
  --name license-signing-key \
  --file signing-key.pem

# Store API keys
az keyvault secret set \
  --vault-name muonroi-prod \
  --name stripe-secret-key \
  --value "sk_live_xxxxx"
```

### Managed Identity (Recommended)

For workloads in Azure App Service, AKS, or VM with managed identity:

```json
{
  "AzureKeyVaultConfigs": {
    "AuthMethod": "ManagedIdentity",
    "VaultUri": "https://muonroi-prod.vault.azure.net/",
    "CacheDurationMinutes": 5
  }
}
```

---

## Kubernetes Secret Injection (external-secrets-operator)

For Kubernetes deployments, use **external-secrets-operator** (ESO) to synchronize secrets from HashiCorp Vault or Azure KeyVault into K8s native Secrets.

### Installation

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets-system \
  --create-namespace
```

### SecretStore Configuration (Vault)

```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: vault-secret-store
  namespace: muonroi
spec:
  provider:
    vault:
      server: "https://vault.example.com:8200"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "muonroi-app"
      caProvider:
        name: vault-ca
        key: ca.crt
```

### ExternalSecret Mapping

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: muonroi-secrets
  namespace: muonroi
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-secret-store
    kind: SecretStore
  target:
    name: muonroi-app-secrets
    creationPolicy: Owner
  data:
    - secretKey: DatabaseConnectionString
      remoteRef:
        key: production/db
        property: connection-string
    - secretKey: LicenseSigningKey
      remoteRef:
        key: production/license
        property: signing-key
    - secretKey: JwtSigningKey
      remoteRef:
        key: production/jwt
        property: signing-key
```

### Deployment Pod Reference

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: muonroi-control-plane
  namespace: muonroi
spec:
  template:
    spec:
      containers:
      - name: control-plane
        env:
        - name: MUONROI_JWT_SIGNING_KEY
          valueFrom:
            secretKeyRef:
              name: muonroi-app-secrets
              key: JwtSigningKey
        - name: MUONROI_LICENSE_SIGNING_KEY
          valueFrom:
            secretKeyRef:
              name: muonroi-app-secrets
              key: LicenseSigningKey
        - name: CONNECTIONSTRINGS__DEFAULT
          valueFrom:
            secretKeyRef:
              name: muonroi-app-secrets
              key: DatabaseConnectionString
```

---

## Secret Rotation Procedure

Rotating secrets requires coordination between the secret store, application configuration, and dependent services.

### License Key Rotation Checklist

1. **Generate new license key** on License Server
   ```bash
   curl -X POST https://license.truyentm.xyz/api/v1/keys/generate \
     -H "X-Admin-Api-Key: ${LICENSE_ADMIN_KEY}" \
     -H "Content-Type: application/json" \
     -d '{
       "organizationId": "org-name",
       "tier": "Enterprise",
       "validDays": 365,
       "maxActivations": 5
     }'
   ```

2. **Store new key** in secret provider
   - Update Vault: `vault kv put secret/production/license signing-key="..."`
   - Update Azure KeyVault: `az keyvault secret set --name license-signing-key --value "..."`

3. **Apply new key to all environments**
   - Development: manually update `licenses/license.key`
   - Staging: redeploy pods (ESO refreshes in 1h, or force resync)
   - Production: rolling update with readiness checks

4. **Verify activation**
   - Check `/health` endpoint: `"license": { "status": "valid" }`
   - Monitor `License.Heartbeat` audit logs
   - Confirm no auth failures in application logs

5. **Revoke old key** after 30-day grace period
   ```bash
   curl -X POST https://license.truyentm.xyz/api/v1/keys/revoke \
     -H "X-Admin-Api-Key: ${LICENSE_ADMIN_KEY}" \
     -d '{ "licenseKey": "MRR-old-key" }'
   ```

### Database Password Rotation Checklist

1. **Generate new password** in database provider
2. **Store new password** in secret provider (dual-write during transition)
3. **Update connection strings** in all environments
4. **Test connectivity** before removing old password
5. **Revoke old password** after successful cutover
6. **Update backup/DR systems** to use new credentials

### API Key Rotation Checklist

1. **Generate new key** from third-party service (Stripe, SendGrid, etc.)
2. **Test new key** in staging environment
3. **Store new key** in secret provider
4. **Redeploy applications** to pick up new key
5. **Monitor for integration errors** (5-10 minutes post-deployment)
6. **Revoke old key** from third-party dashboard

---

## Environment Variable Patterns

### Local Development (.env)

```bash
# Database
CONNECTIONSTRINGS__DEFAULT=Server=localhost;Database=muonroi_dev;User=sa;Password=Dev123!@#

# License
MUONROI_LICENSE_KEY=MRR-dev-local-key
MUONROI_LICENSE_MODE=Offline

# JWT/Auth
SECURITY__JWT_SIGNING_KEY=dev-256-bit-key-for-testing-only-not-production

# External APIs
STRIPE_SECRET_KEY=sk_test_xxxxx
SENDGRID_API_KEY=SG.test_xxxxx

# Redis
REDIS_CONNECTION_STRING=localhost:6379

# Vault (development mode - token auth)
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=dev-token-for-local-testing
```

### Docker Compose (.env for docker-compose)

```bash
# Database (shared volume for persistence)
POSTGRES_DB=muonroi_rules
POSTGRES_USER=muonroi
POSTGRES_PASSWORD=SecurePassword123!

# Control Plane
CP_DATABASE_CONNECTION=postgres://muonroi:SecurePassword123!@postgres:5432/muonroi_rules
CP_VAULT_ADDRESS=https://vault.internal:8200
CP_VAULT_TOKEN=${VAULT_TOKEN}
CP_JWT_SIGNING_KEY=${JWT_SIGNING_KEY}

# License Server
LICENSE_DATABASE_CONNECTION=postgres://muonroi:SecurePassword123!@postgres:5432/muonroi_licenses
LICENSE_ADMIN_API_KEY=${LICENSE_ADMIN_KEY}
LICENSE_RSA_PRIVATE_KEY_PATH=/secrets/rsa-private.pem

# Redis
REDIS_PASSWORD=RedisPass123!

# General
ENVIRONMENT=production
LOG_LEVEL=Information
```

### Kubernetes Environment Variables

See [kubernetes-deployment-guide.md](/docs/04-operations/kubernetes-deployment-guide.md) for full K8s Secret patterns. Secret references:

```yaml
env:
- name: ConnectionStrings__Default
  valueFrom:
    secretKeyRef:
      name: muonroi-app-secrets
      key: DatabaseConnectionString
- name: MUONROI_JWT_SIGNING_KEY
  valueFrom:
    secretKeyRef:
      name: muonroi-app-secrets
      key: JwtSigningKey
- name: MUONROI_LICENSE_SIGNING_KEY
  valueFrom:
    secretKeyRef:
      name: muonroi-app-secrets
      key: LicenseSigningKey
```

---

## Sensitive Configuration Keys

The following configuration keys **MUST** be stored as secrets and never committed to Git:

### Database

- `ConnectionStrings:Default` — PostgreSQL connection string with credentials
- `ConnectionStrings:License` — License database credentials
- `ConnectionStrings:Replica` — Read replica credentials

### JWT & Security

- `Security:Jwt:SigningKey` — RSA or HMAC signing key (min 256 bits)
- `Security:Jwt:EncryptionKey` — Token encryption key (optional)
- `Security:ApiKey:Secret` — API key salt

### License System

- `License:SigningKeyPath` — RSA-2048 private key for license signing
- `License:AdminApiKey` — License Server admin authentication key
- `License:ActivationProofPath` — Cached activation proof (secured on disk)

### External Services

- `Stripe:SecretKey` — Stripe API secret key
- `SendGrid:ApiKey` — SendGrid API key
- `Auth0:ClientSecret` — OAuth2 client secret
- `Vault:Token` — Vault authentication token

### Redis

- `Redis:ConnectionString` — Redis password/credentials
- `Cache:RedisPassword` — Alternative pattern

### Webhooks & Integrations

- `Webhooks:SigningSecret` — Secret for webhook signature verification
- `Webhooks:CallbackUrl` — May contain credentials; use env var
- `Integration:ApiKey` — Third-party API credentials

---

## Files to Never Commit

Add to `.gitignore`:

```gitignore
# Secrets and licenses
licenses/
*.key
*.pem
*.pfx
*.p12
activation_proof.json
signing_key.json
.env
.env.local
.env.*.local

# Docker/compose secrets
docker/.env
.docker.env

# Kubernetes manifests with embedded secrets
k8s/secrets/
k8s/*-secret.yaml

# IDE/editor secrets
.vscode/settings.json (if contains secrets)
.idea/misc.xml (if contains secrets)

# Build artifacts with embedded secrets
bin/
obj/
dist/
build/
```

---

## Best Practices

1. **Separate secrets from configuration** — Never mix sensitive and non-sensitive config
2. **Use strong encryption** — TLS 1.3+ for secret transport, AES-256 at rest
3. **Audit secret access** — Enable logging in Vault, Azure KeyVault, or secret provider
4. **Rotate regularly** — License keys annually, API keys every 6-12 months, DB passwords every 90 days
5. **Principle of least privilege** — Grant secret read access only to required applications/roles
6. **Monitor secret leaks** — Use tools like TruffleHog to scan Git history
7. **Cache strategically** — Balance performance (5-10 min TTL) with freshness
8. **Log secret source, not values** — Log "Loaded JWT signing key from Vault" not the key itself
9. **Use managed identities** — Prefer Azure Managed Identity or Kubernetes Service Account over static credentials
10. **Test rotation workflows** — Regularly practice full rotation in staging before production

---

## Related Guides

- [License Activation & Reactivation](/docs/04-operations/license-reactivation.md) — License key deployment patterns
- [License Server Administration](/docs/04-operations/license-server-admin.md) — Generating and managing license keys
- [Kubernetes Deployment Guide](/docs/04-operations/kubernetes-deployment-guide.md) — K8s-native secret injection
- [CI/CD Docker & Kubernetes](/docs/04-operations/ci-cd-docker-k8s.md) — Docker Compose and GitHub Actions secret patterns
- [Observability Guide](/docs/04-operations/observability-guide.md) — Audit logging and secret access monitoring
