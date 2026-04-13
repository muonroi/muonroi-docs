# Feature Flags (Optional Subsystems)

This page explains how to enable/disable optional subsystems at startup via `FeatureFlags` in `appsettings.*.json`.

## Flags

- `UseGrpc` (bool): Registers gRPC server endpoints.
- `UseServiceDiscovery` (bool): Enables service discovery/registration and health-checks (e.g., Consul integration).
- `UseMessageBus` (bool): Enables message bus integration (MassTransit). Requires `MessageBusConfigs`.
- `UseBackgroundJobs` (bool): Enables background job scheduler/worker. Requires `BackgroundJobConfigs`.
- `UseEnsureCreatedFallback` (bool): If no EF Core migrations exist, auto-create schema via `EnsureCreated()` at startup (dev/bootstrap convenience). Keep `false` in strict production environments.

## Example

```json
"FeatureFlags": {
  "UseGrpc": true,
  "UseServiceDiscovery": true,
  "UseMessageBus": false,
  "UseBackgroundJobs": false,
  "UseEnsureCreatedFallback": true
}
```

## Message Bus

Select exactly one bus type:

- Kafka
  ```json
  "MessageBusConfigs": {
    "BusType": "Kafka",
    "Kafka": {
      "Host": "localhost:9092",
      "Topic": "sample-topic",
      "GroupId": "sample-group"
    }
  }
  ```
- RabbitMQ
  ```json
  "MessageBusConfigs": {
    "BusType": "RabbitMq",
    "RabbitMq": {
      "Host": "localhost",
      "VirtualHost": "/",
      "Username": "guest",
      "Password": "guest"
    }
  }
  ```

## Background Jobs

Pick a scheduler:

- Hangfire (default)
  ```json
  "BackgroundJobConfigs": {
    "JobType": "Hangfire",
    "ConnectionString": "Server=.;Database=Hangfire;Trusted_Connection=True;MultipleActiveResultSets=true"
  }
  ```
- Quartz
  ```json
  "BackgroundJobConfigs": {
    "JobType": "Quartz",
    "ConnectionString": "Your job storage connection string"
  }
  ```

## Kubernetes

```json
"KubernetesConfigs": {
  "ClusterType": "K8s",
  "ClusterEndpoint": "https://your-cluster-api"
}
```

## Environment overrides

You can override any flag or option via environment variables:

- Windows (PowerShell):
  ```powershell
  $env:FeatureFlags__UseMessageBus = "true"
  $env:MessageBusConfigs__BusType = "Kafka"
  ```
- Linux/macOS (bash):
  ```bash
  export FeatureFlags__UseMessageBus=true
  export MessageBusConfigs__BusType=Kafka
  ```

## Notes

- Keep `FeatureFlags` values as booleans (no encryption).
- When `EnableEncryption` is `true`, only encrypt string fields where supported (e.g., passwords/hosts). Do not encrypt enums, booleans or numeric fields.
