# Appsettings Guide

## Control plane

```json
"ControlPlaneAuth": {
  "DisableAuthorization": true,
  "SigningKey": "dev-control-plane-signing-key-change-this",
  "Issuer": "muonroi-control-plane",
  "Audience": "muonroi-control-plane-clients"
}
```

## Rule control plane

```json
"RuleControlPlane": {
  "RequireApproval": true,
  "NotifyOnStateChange": true,
  "EnableCanary": true,
  "AuditSignerKeyId": "ruleset-control-plane",
  "AuditPrivateKeyPemPath": ""
}
```

## Decision tables

`DecisionTableEngineOptions`

- `PostgresConnectionString`
- `SqlServerConnectionString`
- `Schema`
- `AutoMigrateDatabase`

## License

Important license configuration points include:

- `LicenseConfigs:Mode`
- `LicenseConfigs:LicenseFilePath`
- `LicenseConfigs:ActivationProofPath`
- `LicenseConfigs:PublicKeyPath`

## Connection strings

- `RuleControlPlaneDb`
- `Redis`
