# Kubernetes Deployment Guide

Current deployment guidance is based on the `muonroi-rule-engine` Helm chart.

## Prerequisites

- Kubernetes 1.28+
- Helm 3.12+
- optional Prometheus operator for `ServiceMonitor`

## Install

```bash
helm install rule-engine ./k8s/helm/muonroi-rule-engine \
  --namespace rule-engine \
  --create-namespace \
  -f ./k8s/helm/muonroi-rule-engine/values-production.yaml
```

## Important values

- `image.repository`
- `image.tag`
- `config.license.mode`
- `config.license.tier`
- `config.quota.enabled`
- `postgresql.enabled`
- `redis.enabled`
- `secrets.databaseConnectionString`
- `secrets.redisPassword`

## Tenant namespaces

Run tenant workloads in separate namespaces when you need hard isolation, then apply `ResourceQuota` and `LimitRange` per tenant namespace.
