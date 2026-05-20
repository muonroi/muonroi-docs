---
title: CI/CD, Docker, and Kubernetes
sidebar_label: CI/CD, Docker, K8s
sidebar_position: 4
---

# CI/CD, Docker, and Kubernetes

## Overview

Muonroi uses GitHub Actions for continuous integration and deployment pipelines, Docker containers for consistent multi-stage builds, and Kubernetes manifests for production orchestration. This guide covers workflow design, containerization patterns, and deployment strategies across the 4-repository ecosystem.

---

## CI/CD Philosophy

### Release Discipline

The project follows a **two-branch model**:

- **`develop`** — main integration branch for day-to-day feature development
- **`main`** — stable release branch, tagged with semantic versions

All four repositories (`muonroi-building-block`, `muonroi-ui-engine`, `muonroi-control-plane`, `muonroi-license-server`) use the same branching strategy.

### Automation Goals

1. **Build and test** all packages on every push/PR
2. **Enforce modular package boundaries** using MBB (Muonroi Building Block) analyzers
3. **Publish packages** on version tags:
   - OSS packages (54 NuGet) → nuget.org
   - Commercial packages → private feed
   - VSIX extensions → Visual Studio Marketplace
4. **Deploy services** to VPS or K8s clusters
5. **Publish documentation** on docs branch updates

---

## GitHub Actions Workflows

### 1. CI Workflow (`ci.yml`)

Runs on every push and pull request to major branches.

**Building Block (muonroi-building-block)**
```yaml
name: CI

on:
  push:
    branches:
      - dev
      - develop
      - main
  pull_request:
    branches:
      - dev
      - develop
      - main

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    env:
      DOTNET_NOLOGO: true
      DOTNET_CLI_TELEMETRY_OPTOUT: true
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: 8.0.x

      # Proto governance (Buf lint + breaking changes)
      - name: Proto Governance
        run: bash scripts/buf-check.sh

      # Message Bus contract validation
      - name: Message Bus Contract Check
        run: bash scripts/check-messagebus-contracts.sh

      # Distributed Cache contract validation
      - name: Distributed Cache Contract Check
        run: bash scripts/check-distributed-cache-contracts.sh

      - name: Restore
        run: dotnet restore Muonroi.BuildingBlock.sln

      - name: Build
        run: dotnet build Muonroi.BuildingBlock.sln -c Release --no-restore

      - name: Test
        run: dotnet test Muonroi.BuildingBlock.sln -c Release --no-build --verbosity normal
```

**Control Plane (muonroi-control-plane)**
```yaml
name: CI

on:
  push:
    branches:
      - develop
  pull_request:

jobs:
  dashboard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: https://registry.npmjs.org

      - name: Install dependencies
        run: pnpm install --no-frozen-lockfile

      - name: Build dashboard
        run: pnpm --filter @muonroi/control-plane-dashboard build

  api-and-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'

      - name: Restore
        run: dotnet restore

      - name: Build API
        run: dotnet build -c Release --no-restore

      - name: Run tests
        run: dotnet test -c Release --no-build
```

### 2. Publish Workflows

#### OSS NuGet Packages (`publish-oss.yml`)

Triggered by tags matching `oss-v*` or manual dispatch.

```yaml
name: Publish OSS NuGet Packages

on:
  push:
    tags:
      - 'oss-v*'
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Dry run (pack but do not push)'
        type: boolean
        default: true
      version_override:
        description: 'Override version (e.g. 1.0.0-alpha.2)'
        type: string
        default: ''

jobs:
  validate:
    name: Validate Boundary + Build + Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'

      # Enforce modular package boundaries (no illegal cross-layer dependencies)
      - name: Check modular boundaries
        run: pwsh scripts/check-modular-boundaries.ps1 -RepoRoot .

      - name: Restore
        run: dotnet restore Muonroi.BuildingBlock.sln

      - name: Build Release
        run: dotnet build Muonroi.BuildingBlock.sln -c Release --no-restore

      - name: Test
        run: dotnet test Muonroi.BuildingBlock.sln -c Release --no-build

  pack:
    name: Pack NuGet Packages
    runs-on: ubuntu-latest
    needs: validate
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'

      - name: Pack all packages
        run: |
          if [ -z "${{ inputs.version_override }}" ]; then
            dotnet pack Muonroi.BuildingBlock.sln -c Release -o ./artifacts
          else
            dotnet pack Muonroi.BuildingBlock.sln -c Release -o ./artifacts \
              /p:Version=${{ inputs.version_override }}
          fi

      - name: Publish to NuGet.org
        if: ${{ !inputs.dry_run }}
        run: |
          dotnet nuget push ./artifacts/*.nupkg \
            --api-key ${{ secrets.NUGET_API_KEY }} \
            --source https://api.nuget.org/v3/index.json
```

#### Commercial Packages (`publish-commercial.yml`)

Publishes to private NuGet feed for commercial customers.

```yaml
name: Publish Commercial NuGet Packages

on:
  push:
    tags:
      - 'commercial-v*'
  workflow_dispatch:

jobs:
  pack-and-publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'

      - name: Restore & Build
        run: |
          dotnet restore Muonroi.BuildingBlock.sln
          dotnet build Muonroi.BuildingBlock.sln -c Release --no-restore

      - name: Pack commercial packages
        run: dotnet pack Muonroi.BuildingBlock.sln -c Release -o ./artifacts

      - name: Publish to private feed
        run: |
          dotnet nuget push ./artifacts/*.nupkg \
            --api-key ${{ secrets.PRIVATE_FEED_API_KEY }} \
            --source ${{ secrets.PRIVATE_FEED_URL }}
```

#### VSIX Extension (`publish-vsix.yml`)

Packages and publishes VS Code extension to Visual Studio Marketplace.

```yaml
name: Publish VSIX Extension

on:
  push:
    tags:
      - 'vsix-v*'
  workflow_dispatch:

jobs:
  package:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install vsce
        run: npm install -g @vscode/vsce

      - name: Install extension dependencies
        run: npm install
        working-directory: ./vsix-source

      - name: Package VSIX
        run: vsce package
        working-directory: ./vsix-source

      - name: Publish to Marketplace
        run: vsce publish --pat ${{ secrets.VSCODE_MARKETPLACE_TOKEN }}
        working-directory: ./vsix-source
```

### 3. Documentation Workflow (`docs.yml`)

Builds and deploys the Docusaurus documentation site.

```yaml
name: Deploy Documentation

on:
  push:
    branches:
      - main
    paths:
      - 'muonroi-docs/**'
      - 'docs/**'
  pull_request:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install
        working-directory: ./muonroi-docs

      - name: Build site
        run: pnpm build
        working-directory: ./muonroi-docs

      - name: Deploy to GitHub Pages
        if: github.ref == 'refs/heads/main'
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./muonroi-docs/build
```

---

## Docker & Containerization

### Multi-Stage Build Pattern

All services use a three-stage Dockerfile pattern for optimized production images:

**Stage 1: Build** — Compile source code with SDK
**Stage 2: Publish** — Generate runtime artifacts
**Stage 3: Runtime** — Minimal runtime image

### Control Plane API (`muonroi-control-plane`)

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy entire monorepo and restore dependencies
COPY . .
RUN dotnet restore muonroi-control-plane/src/Muonroi.ControlPlane.Api/Muonroi.ControlPlane.Api.csproj

# Build in Release mode
RUN dotnet build muonroi-control-plane/src/Muonroi.ControlPlane.Api/Muonroi.ControlPlane.Api.csproj \
    -c Release -o /app/build

# Publish stage
FROM build AS publish
RUN dotnet publish muonroi-control-plane/src/Muonroi.ControlPlane.Api/Muonroi.ControlPlane.Api.csproj \
    -c Release -o /app/publish

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=publish /app/publish .
EXPOSE 8080
ENTRYPOINT ["dotnet", "Muonroi.ControlPlane.Api.dll"]
```

### License Server (`muonroi-license-server`)

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY . .
RUN dotnet restore muonroi-license-server/src/Muonroi.LicenseServer/Muonroi.LicenseServer.csproj

RUN dotnet build muonroi-license-server/src/Muonroi.LicenseServer/Muonroi.LicenseServer.csproj \
    -c Release -o /app/build

FROM build AS publish
RUN dotnet publish muonroi-license-server/src/Muonroi.LicenseServer/Muonroi.LicenseServer.csproj \
    -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=publish /app/publish .
EXPOSE 8080
ENTRYPOINT ["dotnet", "Muonroi.LicenseServer.dll"]
```

---

## Docker Compose Deployment

### Current VPS Setup

The live deployment uses Docker Compose with three services: Redis, Control Plane API, and License Server.

**Location:** `/opt/muonroi/docker-compose.yml`
**Environment:** Hostinger VPS (72.61.127.154, Debian 12)
**Reverse Proxy:** Apache2 + Cloudflare SSL

### docker-compose.yml

```yaml
version: '3.8'

services:
  # Redis for hot-reload SignalR backplane and caching
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redisdata:/data

  # Control Plane API + MCP Server
  control-plane:
    build:
      context: /opt/muonroi
      dockerfile: muonroi-control-plane/src/Muonroi.ControlPlane.Api/Dockerfile
    restart: unless-stopped
    depends_on:
      redis:
        condition: service_started
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      ASPNETCORE_ENVIRONMENT: Production
      ASPNETCORE_URLS: http://+:8080
      ConnectionStrings__RuleControlPlaneDb: "Host=host.docker.internal;Port=5432;Database=muonroi_rules;Username=muonroi;Password=${POSTGRES_PASSWORD}"
      ConnectionStrings__Redis: "redis:6379"
      ControlPlaneAuth__DisableAuthorization: "true"
      ControlPlaneAuth__SigningKey: "${CP_SIGNING_KEY}"
      ControlPlaneRuntimeInfo__Tier: "Enterprise"
      ControlPlaneRuntimeInfo__IsValid: "true"
      ControlPlaneRuntimeInfo__AllowedFeatures__0: "*"
    volumes:
      - ./secrets:/app/secrets:ro
    ports:
      - "127.0.0.1:8080:8080"

  # License Server
  license-server:
    build:
      context: /opt/muonroi
      dockerfile: muonroi-license-server/src/Muonroi.LicenseServer/Dockerfile
    restart: unless-stopped
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      ASPNETCORE_ENVIRONMENT: Production
      ASPNETCORE_URLS: http://+:8080
      ConnectionStrings__LicenseDb: "Host=host.docker.internal;Port=5432;Database=muonroi_licenses;Username=muonroi;Password=${POSTGRES_PASSWORD}"
      LicenseServer__AdminApiKey: "${LICENSE_ADMIN_KEY}"
      LicenseServer__LicenseServerUrl: "https://license.truyentm.xyz"
    ports:
      - "127.0.0.1:8081:8080"

volumes:
  redisdata:
```

### Deployment Update Script

**Location:** `/opt/muonroi/update.sh`

```bash
#!/bin/bash
set -e

cd /opt/muonroi

# Pull latest code
git pull origin develop

# Build and restart services
docker compose build --no-cache
docker compose up -d --force-recreate

# Show logs
docker compose logs -f
```

**Usage:**
```bash
ssh -i ~/.ssh/muonroi_vps_rsa phila@72.61.127.154 "/opt/muonroi/update.sh"
```

---

## Kubernetes Deployment

### Reference Architecture

For production Kubernetes clusters, use the following manifest templates. Adapt for your cluster's DNS, storage classes, and ingress controller.

### Namespace & ConfigMap

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: muonroi

---

apiVersion: v1
kind: ConfigMap
metadata:
  name: control-plane-config
  namespace: muonroi
data:
  ASPNETCORE_ENVIRONMENT: "Production"
  ASPNETCORE_URLS: "http://+:8080"
  ControlPlaneRuntimeInfo__Tier: "Enterprise"
  ControlPlaneRuntimeInfo__IsValid: "true"
```

### Secrets

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: control-plane-secrets
  namespace: muonroi
type: Opaque
stringData:
  ConnectionStrings__RuleControlPlaneDb: "Host=postgres.muonroi.svc.cluster.local;Port=5432;Database=muonroi_rules;Username=muonroi;Password=YOUR_DB_PASSWORD"
  ConnectionStrings__Redis: "redis.muonroi.svc.cluster.local:6379"
  ControlPlaneAuth__SigningKey: "YOUR_SIGNING_KEY"

---

apiVersion: v1
kind: Secret
metadata:
  name: license-server-secrets
  namespace: muonroi
type: Opaque
stringData:
  ConnectionStrings__LicenseDb: "Host=postgres.muonroi.svc.cluster.local;Port=5432;Database=muonroi_licenses;Username=muonroi;Password=YOUR_DB_PASSWORD"
  LicenseServer__AdminApiKey: "YOUR_ADMIN_API_KEY"
```

### Control Plane Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: control-plane
  namespace: muonroi
spec:
  replicas: 2
  selector:
    matchLabels:
      app: control-plane
  template:
    metadata:
      labels:
        app: control-plane
    spec:
      containers:
      - name: api
        image: muonroi/control-plane:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 8080
        envFrom:
        - configMapRef:
            name: control-plane-config
        - secretRef:
            name: control-plane-secrets
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"

---

apiVersion: v1
kind: Service
metadata:
  name: control-plane
  namespace: muonroi
spec:
  type: ClusterIP
  selector:
    app: control-plane
  ports:
  - protocol: TCP
    port: 8080
    targetPort: 8080
```

### License Server Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: license-server
  namespace: muonroi
spec:
  replicas: 1
  selector:
    matchLabels:
      app: license-server
  template:
    metadata:
      labels:
        app: license-server
    spec:
      containers:
      - name: server
        image: muonroi/license-server:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 8080
        envFrom:
        - secretRef:
            name: license-server-secrets
        env:
        - name: ASPNETCORE_ENVIRONMENT
          value: "Production"
        - name: ASPNETCORE_URLS
          value: "http://+:8080"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 30
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"

---

apiVersion: v1
kind: Service
metadata:
  name: license-server
  namespace: muonroi
spec:
  type: ClusterIP
  selector:
    app: license-server
  ports:
  - protocol: TCP
    port: 8080
    targetPort: 8080
```

### Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: muonroi-ingress
  namespace: muonroi
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - cp.example.com
    - license.example.com
    secretName: muonroi-tls
  rules:
  - host: cp.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: control-plane
            port:
              number: 8080
  - host: license.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: license-server
            port:
              number: 8080
```

### Horizontal Pod Autoscaling

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: control-plane-hpa
  namespace: muonroi
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: control-plane
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

---

## Environment Variables & Secrets Management

### Control Plane Configuration

| Variable | Purpose | Example |
|----------|---------|---------|
| `ASPNETCORE_ENVIRONMENT` | Deployment stage | `Production` |
| `ASPNETCORE_URLS` | Binding address | `http://+:8080` |
| `ConnectionStrings__RuleControlPlaneDb` | PostgreSQL connection | `Host=postgres;Database=muonroi_rules` |
| `ConnectionStrings__Redis` | Redis backplane | `redis:6379` |
| `ControlPlaneAuth__SigningKey` | JWT signing key | (Base64-encoded 256-bit key) |
| `ControlPlaneRuntimeInfo__Tier` | License tier | `Enterprise` |
| `ControlPlaneRuntimeInfo__AllowedFeatures__0` | Feature flags | `*` (all) or specific features |

### License Server Configuration

| Variable | Purpose | Example |
|----------|---------|---------|
| `ConnectionStrings__LicenseDb` | License database | `Host=postgres;Database=muonroi_licenses` |
| `LicenseServer__AdminApiKey` | Admin authentication | (Random 32+ character string) |
| `LicenseServer__LicenseServerUrl` | Public URL | `https://license.truyentm.xyz` |

### Secret Storage

**Local Development:** Store in `.env` files (git-ignored)
**Docker:** Use Docker secrets or `--env-file` flag
**Kubernetes:** Use `Secret` resources with RBAC
**VPS:** Environment variables in `.env` file at `/opt/muonroi/.env`

---

## Monitoring & Health Checks

All services expose `/health` endpoints for liveness and readiness probes.

**Control Plane:**
```bash
curl http://localhost:8080/health
# Response: { "status": "Healthy" }
```

**License Server:**
```bash
curl http://localhost:8081/health
# Response: { "status": "Healthy" }
```

---

## Related Documentation

- [Secret Management](./secret-management.md)
- [Kubernetes Deployment Guide](./kubernetes-deployment-guide.md)
- [Monitoring & Observability](./observability-guide.md)
- [Database Schema](../05-reference/database-structure.md)

---

## Troubleshooting

**Docker build fails:** Ensure all `.csproj` files reference correctly. Check Docker context path.

**Container won't start:** Check environment variables, especially database connection strings and API keys.

**K8s pod crashes:** Inspect logs: `kubectl logs -n muonroi deployment/control-plane`

**Redis connection timeout:** Verify Redis service is running and accessible. Check `REDIS_HOST` environment variable.
