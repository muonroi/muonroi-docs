---
title: Kubernetes Deployment Guide
sidebar_label: Kubernetes Deployment
sidebar_position: 5
---

# Kubernetes Deployment Guide

This guide covers production-grade Kubernetes deployment of Muonroi services (control-plane, rule-engine) using Helm, including manifests for networking, observability, autoscaling, and multi-tenancy isolation.

## Prerequisites

- Kubernetes 1.28+ (tested on 1.28, 1.29, 1.30)
- Helm 3.12+
- kubectl configured with cluster access
- Prometheus Operator (optional, for `ServiceMonitor`)
- cert-manager v1.13+ (for TLS ingress)
- external-secrets operator (recommended, for secret rotation)

## Quick Start

Install the Muonroi rule-engine Helm chart:

```bash
helm repo add muonroi https://charts.muonroi.io
helm repo update

helm install rule-engine muonroi/rule-engine \
  --namespace rule-engine \
  --create-namespace \
  -f values-production.yaml
```

Or from local chart:

```bash
helm install rule-engine ./k8s/helm/muonroi-rule-engine \
  --namespace rule-engine \
  --create-namespace \
  -f ./k8s/helm/muonroi-rule-engine/values-production.yaml
```

Verify deployment:

```bash
kubectl rollout status deployment/rule-engine -n rule-engine
kubectl get pods -n rule-engine
```

---

## Helm Values (values-production.yaml)

Complete production-ready values file:

```yaml
# Image configuration
image:
  repository: registry.muonroi.io/rule-engine
  pullPolicy: IfNotPresent
  tag: "1.0.0"  # Override with --set image.tag=X.Y.Z

imagePullSecrets:
  - name: registry-credentials

# Replica and scaling
replicaCount: 3

# Pod disruption budget (for safe rolling updates)
podDisruptionBudget:
  enabled: true
  minAvailable: 1
  # maxUnavailable: 1

# Service configuration
service:
  type: ClusterIP
  port: 80
  targetPort: 8080
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "8080"
    prometheus.io/path: "/metrics"

# Ingress configuration
ingress:
  enabled: true
  className: nginx  # or haproxy, istio
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
  hosts:
    - host: rule-engine.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: rule-engine-tls
      hosts:
        - rule-engine.example.com

# Autoscaling (HPA)
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 75
  targetMemoryUtilizationPercentage: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 100
          periodSeconds: 30

# Resource requests and limits
resources:
  requests:
    cpu: "500m"
    memory: "512Mi"
  limits:
    cpu: "2000m"
    memory: "2Gi"

# Probes (liveness, readiness, startup)
livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
    scheme: HTTP
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
    scheme: HTTP
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 2

startupProbe:
  httpGet:
    path: /health/startup
    port: 8080
    scheme: HTTP
  initialDelaySeconds: 0
  periodSeconds: 2
  timeoutSeconds: 3
  failureThreshold: 30  # 60 seconds max startup time

# Pod template
podAnnotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "8080"
  prometheus.io/path: "/metrics"

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000

securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL
  readOnlyRootFilesystem: false

# Database
postgresql:
  enabled: false  # Use external managed database for production
  # If internal PostgreSQL:
  # auth:
  #   username: muonroi
  #   password: # Generated if not provided
  #   database: muonroi_rules

# Redis
redis:
  enabled: false  # Use external managed Redis for production
  # If internal Redis:
  # auth:
  #   enabled: true
  #   password: # Generated if not provided

# ConfigMap for appsettings.json
configMap:
  create: true
  # Inline appsettings.json content
  appSettings:
    Logging:
      LogLevel:
        Default: Information
        Microsoft: Warning
        Muonroi: Information
    AllowedHosts: "*"
    CacheSettings:
      DefaultTtlSeconds: 300
      MaxSize: 10000
    TelemetrySettings:
      EnableMetrics: true
      MetricsPort: 9090

# Secrets (reference external K8s secrets)
secrets:
  create: false  # Use external-secrets-operator instead
  databaseConnectionString: ""
  redisPassword: ""
  jwtSigningKey: ""
  licenseKey: ""

# External secrets (via external-secrets-operator)
externalSecrets:
  enabled: true
  secretStore:
    name: vault-secret-store
    kind: SecretStore
  secrets:
    - name: rule-engine-secrets
      target:
        name: rule-engine-secrets
        template:
          engineVersion: v2
          data:
            DATABASE_CONNECTION_STRING: "{{ .dbConnection }}"
            REDIS_PASSWORD: "{{ .redisPassword }}"
            JWT_SIGNING_KEY: "{{ .jwtSigningKey }}"
            LICENSE_KEY: "{{ .licenseKey }}"
      data:
        - secretKey: dbConnection
          remoteRef:
            key: muonroi/rule-engine/database
        - secretKey: redisPassword
          remoteRef:
            key: muonroi/redis/password
        - secretKey: jwtSigningKey
          remoteRef:
            key: muonroi/jwt/signing-key
        - secretKey: licenseKey
          remoteRef:
            key: muonroi/license/key

# Environment variables
env:
  - name: ASPNETCORE_ENVIRONMENT
    value: Production
  - name: ASPNETCORE_URLS
    value: http://+:8080
  - name: TenantResolution:Mode
    value: Header
  - name: LicenseConfigs:Mode
    value: Online
  - name: LicenseConfigs:Online:Endpoint
    value: https://license.muonroi.io
  - name: LicenseConfigs:Online:EnableHeartbeat
    value: "true"
  - name: LicenseConfigs:Online:HeartbeatIntervalMinutes
    value: "240"

# Environment variables from secrets
envFrom:
  - secretRef:
      name: rule-engine-secrets

# Node affinity (for cost optimization)
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchExpressions:
              - key: app
                operator: In
                values:
                  - rule-engine
          topologyKey: kubernetes.io/hostname
  nodeAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 50
        preference:
          matchExpressions:
            - key: workload-type
              operator: In
              values:
                - compute

# Node selector
nodeSelector:
  {}
  # workload-type: compute
  # zone: us-east-1a

# Tolerations (for node taints)
tolerations: []
  # - key: dedicated
  #   operator: Equal
  #   value: rule-engine
  #   effect: NoSchedule

# Network policies
networkPolicy:
  enabled: true
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - protocol: TCP
          port: 8080
    - from:
        - namespaceSelector:
            matchLabels:
              name: prometheus
      ports:
        - protocol: TCP
          port: 8080
          name: metrics
  egress:
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 5432  # PostgreSQL
        - protocol: TCP
          port: 6379  # Redis
        - protocol: TCP
          port: 443   # HTTPS (license server, etc)
        - protocol: UDP
          port: 53    # DNS
```

---

## Ingress & TLS Configuration

### Cert-Manager Setup

Install cert-manager first:

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

Create a ClusterIssuer for Let's Encrypt:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@muonroi.io
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
```

### Ingress with TLS

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: rule-engine-ingress
  namespace: rule-engine
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    # Rate limiting
    nginx.ingress.kubernetes.io/limit-rps: "100"
    nginx.ingress.kubernetes.io/limit-connections: "50"
spec:
  ingressClassName: nginx
  tls:
    - secretName: rule-engine-tls
      hosts:
        - rule-engine.muonroi.io
        - api.muonroi.io
  rules:
    - host: rule-engine.muonroi.io
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: rule-engine
                port:
                  number: 8080
    - host: api.muonroi.io
      http:
        paths:
          - path: /api/v1
            pathType: Prefix
            backend:
              service:
                name: rule-engine
                port:
                  number: 8080
```

---

## Health Checks & Probes

All Muonroi services expose three health endpoints:

- **`/health/live`** — Pod is alive (uses `IHealthCheckService`)
- **`/health/ready`** — Pod is ready to receive traffic (database + cache connections verified)
- **`/health/startup`** — Pod completed initialization (cold-start cache warm-up done)

Example probe configuration in deployment:

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
    scheme: HTTP
  initialDelaySeconds: 30
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
    scheme: HTTP
  initialDelaySeconds: 10
  periodSeconds: 5
  failureThreshold: 2

startupProbe:
  httpGet:
    path: /health/startup
    port: 8080
    scheme: HTTP
  periodSeconds: 2
  failureThreshold: 30
```

---

## Horizontal Pod Autoscaler (HPA)

Scale based on CPU and memory:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: rule-engine-hpa
  namespace: rule-engine
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: rule-engine
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 75
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 100
          periodSeconds: 30
```

---

## Pod Disruption Budget (PDB)

Ensure graceful drain during node maintenance:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: rule-engine-pdb
  namespace: rule-engine
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: rule-engine
```

---

## Resource Requests & Limits

Recommended values based on expected load:

| Component | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----------|-------------|-----------|-----------------|--------------|
| rule-engine (light) | 250m | 500m | 256Mi | 512Mi |
| rule-engine (standard) | 500m | 2000m | 512Mi | 2Gi |
| rule-engine (heavy) | 1000m | 4000m | 1Gi | 4Gi |
| control-plane | 500m | 2000m | 512Mi | 2Gi |
| PostgreSQL sidecar | 250m | 1000m | 256Mi | 1Gi |
| Redis sidecar | 100m | 500m | 128Mi | 512Mi |

Example request/limit configuration:

```yaml
resources:
  requests:
    cpu: "500m"
    memory: "512Mi"
  limits:
    cpu: "2000m"
    memory: "2Gi"
```

---

## ServiceMonitor (Prometheus Operator)

Export metrics to Prometheus:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: rule-engine-monitor
  namespace: rule-engine
  labels:
    prometheus: kube-prometheus
spec:
  selector:
    matchLabels:
      app: rule-engine
  endpoints:
    - port: metrics
      interval: 30s
      path: /metrics
      scrapeTimeout: 10s
      relabelings:
        - sourceLabels: [__meta_kubernetes_pod_node_name]
          targetLabel: node
        - sourceLabels: [__meta_kubernetes_pod_namespace]
          targetLabel: namespace
```

Apply and verify:

```bash
kubectl apply -f servicemonitor.yaml
kubectl get servicemonitor -n rule-engine
# Verify Prometheus scrape targets
kubectl port-forward -n prometheus svc/prometheus 9090:9090
# Open http://localhost:9090/targets
```

---

## ConfigMap Management

Store `appsettings.json` in ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: rule-engine-config
  namespace: rule-engine
data:
  appsettings.json: |
    {
      "Logging": {
        "LogLevel": {
          "Default": "Information",
          "Microsoft": "Warning",
          "Muonroi": "Information"
        }
      },
      "AllowedHosts": "*",
      "CacheSettings": {
        "DefaultTtlSeconds": 300,
        "MaxSize": 10000
      },
      "TelemetrySettings": {
        "EnableMetrics": true,
        "MetricsPort": 8080
      }
    }
```

Mount in deployment:

```yaml
volumes:
  - name: config
    configMap:
      name: rule-engine-config
volumeMounts:
  - name: config
    mountPath: /app/config
```

---

## Secret Management

### Option 1: Kubernetes Secrets (simple)

Create secrets manually:

```bash
kubectl create secret generic rule-engine-secrets \
  --from-literal=DATABASE_CONNECTION_STRING="..." \
  --from-literal=REDIS_PASSWORD="..." \
  --from-literal=JWT_SIGNING_KEY="..." \
  --from-literal=LICENSE_KEY="..." \
  -n rule-engine
```

Reference in deployment:

```yaml
envFrom:
  - secretRef:
      name: rule-engine-secrets
```

### Option 2: External Secrets Operator (recommended)

Install external-secrets:

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets-system \
  --create-namespace
```

Create SecretStore (HashiCorp Vault example):

```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: vault-secret-store
  namespace: rule-engine
spec:
  provider:
    vault:
      server: https://vault.example.com
      path: secret/muonroi
      auth:
        kubernetes:
          mountPath: kubernetes
          role: rule-engine
```

Create ExternalSecret:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: rule-engine-secrets
  namespace: rule-engine
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-secret-store
    kind: SecretStore
  target:
    name: rule-engine-secrets
    creationPolicy: Owner
  data:
    - secretKey: DATABASE_CONNECTION_STRING
      remoteRef:
        key: database-connection
    - secretKey: REDIS_PASSWORD
      remoteRef:
        key: redis-password
    - secretKey: JWT_SIGNING_KEY
      remoteRef:
        key: jwt-signing-key
    - secretKey: LICENSE_KEY
      remoteRef:
        key: license-key
```

See [Secret Management Guide](secret-management.md) for detailed backend setup.

---

## Network Policies

Restrict ingress/egress traffic:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: rule-engine-netpol
  namespace: rule-engine
spec:
  podSelector:
    matchLabels:
      app: rule-engine
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Allow from ingress controller
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - protocol: TCP
          port: 8080
    # Allow from Prometheus
    - from:
        - namespaceSelector:
            matchLabels:
              name: prometheus
      ports:
        - protocol: TCP
          port: 8080
  egress:
    # Allow to PostgreSQL
    - to:
        - podSelector:
            matchLabels:
              app: postgresql
      ports:
        - protocol: TCP
          port: 5432
    # Allow to Redis
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - protocol: TCP
          port: 6379
    # Allow outbound HTTPS (license server, etc)
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 443
    # Allow DNS
    - to:
        - namespaceSelector:
            matchLabels:
              name: kube-system
      ports:
        - protocol: UDP
          port: 53
```

---

## Multi-Tenancy Isolation

### Per-Tenant Namespaces

Deploy each tenant in separate namespace:

```bash
# Tenant A
kubectl create namespace tenant-a
kubectl apply -f rule-engine-tenant-a.yaml -n tenant-a

# Tenant B
kubectl create namespace tenant-b
kubectl apply -f rule-engine-tenant-b.yaml -n tenant-b
```

### ResourceQuota per Tenant

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: tenant-quota
  namespace: tenant-a
spec:
  hard:
    requests.cpu: "10"
    requests.memory: "20Gi"
    limits.cpu: "20"
    limits.memory: "40Gi"
    pods: "100"
    persistentvolumeclaims: "5"
```

### LimitRange per Tenant

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: tenant-limits
  namespace: tenant-a
spec:
  limits:
    - type: Pod
      min:
        cpu: "10m"
        memory: "32Mi"
      max:
        cpu: "2000m"
        memory: "2Gi"
    - type: Container
      min:
        cpu: "10m"
        memory: "32Mi"
      max:
        cpu: "2000m"
        memory: "2Gi"
      defaultRequest:
        cpu: "500m"
        memory: "512Mi"
      default:
        cpu: "1000m"
        memory: "1Gi"
```

---

## Monitoring & Observability

See [Observability Guide](observability-guide.md) for Prometheus scrape config, Grafana dashboards, and log aggregation setup.

Key metrics to alert on:

- Pod restart count
- HTTP error rate (5xx) > 5%
- Response latency p99 > 500ms
- Rule engine execution failures
- Cache hit ratio < 80%
- Database connection pool exhaustion

Example Prometheus alert rule:

```yaml
groups:
  - name: rule-engine
    interval: 30s
    rules:
      - alert: RuleEngineHighErrorRate
        expr: rate(http_requests_total{app="rule-engine",status=~"5.."}[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High error rate on rule-engine"
      - alert: RuleEngineHighLatency
        expr: histogram_quantile(0.99, http_request_duration_seconds{app="rule-engine"}) > 0.5
        for: 5m
        annotations:
          summary: "High p99 latency on rule-engine"
```

---

## Troubleshooting

Useful kubectl commands:

```bash
# Check pod status and events
kubectl describe pod -n rule-engine -l app=rule-engine

# View logs
kubectl logs -n rule-engine -f deployment/rule-engine --tail=100

# Check resource usage
kubectl top pods -n rule-engine
kubectl top nodes

# Port forward for debugging
kubectl port-forward -n rule-engine svc/rule-engine 8080:8080
curl http://localhost:8080/health/ready

# Execute commands in pod
kubectl exec -it deployment/rule-engine -n rule-engine -- /bin/bash

# Check HPA status
kubectl get hpa -n rule-engine
kubectl describe hpa rule-engine-hpa -n rule-engine

# Verify secret mounts
kubectl get secret -n rule-engine
kubectl describe secret rule-engine-secrets -n rule-engine
```

See [Troubleshooting Guide](troubleshooting-guide.md) for deeper diagnostics.

---

## Related Guides

- [CI/CD, Docker, and Kubernetes](ci-cd-docker-k8s.md) — GitHub Actions pipelines, Docker builds
- [Secret Management Guide](secret-management.md) — Key rotation, external secret stores
- [Observability Guide](observability-guide.md) — Prometheus, Grafana, logging
- [Control Plane Operator Guide](control-plane-operator.md) — Managing rulesets in production
