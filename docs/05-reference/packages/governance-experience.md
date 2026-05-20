---
title: Governance & Experience Packages
sidebar_label: Governance & Experience
sidebar_position: 12
---

# Governance & Experience Packages

Comprehensive reference for license governance, experience engine, and UI catalog packages.

---

## Muonroi.Governance.Abstractions

**NuGet:** `Muonroi.Governance.Abstractions` | **Tier:** Commercial | **Distribution:** GitHub Packages

### Purpose

Core abstractions for license state management, feature enforcement, and anti-tamper detection. Defines the contract between OSS and Enterprise implementations.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `ILicenseGuard` | interface | Feature gate, tier validation, action recording |
| `LicenseTier` | enum | Free=0, Licensed=1, Enterprise=2 |
| `LicenseState` | record | License validity, payload, activation proof |
| `ActivationProof` | class | Signed proof from license server (RSA-2048) |
| `LicensePayload` | class | JWT claims: tier, features, expiry, hardware ID |
| `LicenseConfigs` | class | Mode (Offline/Online), paths, anti-tamper settings |
| `ILicenseStore` | interface | Load/save activation proofs |
| `IFingerprintChainStore` | interface | Persist HMAC chain signatures |
| `ILicenseGuardEnhancer` | interface | Lifecycle hooks: OnStartup, OnEnsureValid, OnRecordAction |

### License Tiers & Features

```csharp
public enum LicenseTier
{
    Free = 0,       // No license required, limited features
    Licensed = 1,   // Standard features
    Enterprise = 2  // All features with anti-tampering
}
```

**Feature Matrix by Tier:**

| Feature | Free | Licensed | Enterprise |
|---------|------|----------|------------|
| `db.query`, `db.save`, `db.add`, `db.update`, `db.delete` | ✓ | ✓ | ✓ |
| `http.request` | ✓ | ✓ | ✓ |
| `api.validate` | ✓ | ✓ | ✓ |
| `rule-engine` | — | ✓ | ✓ |
| `workflow` | — | ✓ | ✓ |
| `multi-tenant` | — | — | ✓ |
| `advanced-auth` | — | — | ✓ |
| `audit-trail` | — | — | ✓ |
| `anti-tampering` | — | — | ✓ |
| `grpc`, `message-bus`, `distributed-cache` | — | — | ✓ |

### Core Contracts

#### ILicenseGuard

```csharp
public interface ILicenseGuard
{
    /// Gets the current license state.
    LicenseState Current { get; }

    /// Gets the current tier (Free, Licensed, Enterprise).
    LicenseTier Tier { get; }

    /// Returns true if tier is Free.
    bool IsFreeMode { get; }

    /// Throws if actionType not licensed. Call before executing guarded feature.
    void EnsureValid(string actionType, string? actionName = null, 
        string? payloadHash = null, string? correlationId = null);

    /// Returns true if feature is available.
    bool HasFeature(string featureName);

    /// Throws if feature not available (convenience over HasFeature).
    void EnsureFeature(string featureName);

    /// Records action in HMAC chain (Enterprise only).
    void RecordAction(LicenseActionContext context);

    /// Gets rolling token for chain verification.
    string GetChainToken();

    /// Decrypts data using license-derived HMAC key.
    string DecryptSecurely(string purpose, string encryptedData, 
        Func<string, string, string> decryptor);
}
```

#### LicenseState

```csharp
public sealed class LicenseState
{
    public bool IsValid { get; init; }
    public bool IsExpired { get; init; }
    public string? Error { get; init; }
    
    public LicensePayload? Payload { get; init; }
    public ActivationProof? ActivationProof { get; init; }
    
    public LicenseTier Tier { get; init; } = LicenseTier.Free;
    public string? LicenseId { get; init; }
    public string? OrganizationName { get; init; }
    public DateTimeOffset? ExpiresAt { get; init; }
    public string[]? Features { get; init; }
    
    /// Legacy tier from activation proof (if available).
    public LicenseTier TrustedTier => ActivationProof?.Tier ?? Tier;
    
    /// Checks feature availability with capability resolution.
    public bool HasFeature(string featureName) 
        => LicenseCapabilityResolver.HasAccess(this, featureName);
}
```

#### ActivationProof

Signed proof from the license server, bound to a machine fingerprint:

```csharp
public sealed class ActivationProof
{
    public string ProofId { get; set; }
    public string LicenseKey { get; set; }
    public string LicenseId { get; set; }
    public string OrganizationName { get; set; }
    
    public LicenseTier Tier { get; set; }
    public DateTimeOffset ActivatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    
    public string[] Features { get; set; } = [];
    public string? MachineFingerprint { get; set; }
    public string? ProductVersion { get; set; }
    
    /// Allowed assembly whitelist (Enterprise only).
    public AssemblyManifestEntry[] AllowedAssemblyHashes { get; set; } = [];
    
    /// Nonce for heartbeat validation.
    public string? HeartbeatNonce { get; set; }
    
    /// Signature of the entire proof.
    public string Signature { get; set; }
}
```

#### ActivationResponse

Response from license server `/api/v1/activate`:

```csharp
public sealed class ActivationResponse
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    
    public ActivationProof? Proof { get; set; }
    public string? ActivationProof { get; set; }  // Serialized for storage
    
    /// RS256 JWT for frontend verification (tier, features, exp, license_id, org_name).
    public string? ActivationJwt { get; set; }
}
```

#### LicenseConfigs

Configuration for license modes, paths, and enforcement:

```csharp
public class LicenseConfigs
{
    public const string SectionName = "LicenseConfigs";
    
    /// Offline or Online mode.
    public LicenseMode Mode { get; set; } = LicenseMode.Offline;
    
    /// Path to license.key file (default: "licenses/license.key").
    public string LicenseFilePath { get; set; } = "licenses/license.key";
    
    /// Path to activation_proof.json (default: "licenses/activation_proof.json").
    public string ActivationProofPath { get; set; } = "licenses/activation_proof.json";
    
    /// Fall back to online activation if offline fails.
    public bool FallbackToOnlineActivation { get; set; } = true;
    
    /// Hard (throw on failure) or Soft (log and continue).
    public LicenseFailMode FailMode { get; set; } = LicenseFailMode.Hard;
    
    /// Enable HMAC chain recording.
    public bool EnableChain { get; set; } = true;
    
    /// Path to license-chain.log file.
    public string ChainFilePath { get; set; } = "logs/license-chain.log";
    
    /// Enable anti-tampering detection (Enterprise).
    public bool EnableAntiTampering { get; set; } = false;
    
    /// Online mode settings.
    public OnlineConfig Online { get; set; } = new();
}

public class OnlineConfig
{
    public string Endpoint { get; set; } = "https://license.truyentm.xyz";
    public bool EnableHeartbeat { get; set; } = true;
    public int HeartbeatIntervalMinutes { get; set; } = 240;  // 4 hours
    public int RevocationGraceHours { get; set; } = 24;
    public int TimeoutSeconds { get; set; } = 10;
}
```

---

## Muonroi.Governance

**NuGet:** `Muonroi.Governance` | **Tier:** Commercial | **Distribution:** GitHub Packages

### Purpose

OSS-safe implementation of license protection, activation, and basic feature enforcement. No anti-tampering; suitable for open-source deployments.

### Key Types

| Type | Purpose |
|------|---------|
| `LicenseGuard` | Core guard implementation with feature checks and chain recording |
| `LicenseStore` | Loads/saves activation proofs and JWTs from disk |
| `LicenseVerifier` | Validates proofs and checks expiry |
| `LicenseActivationService` | Client for `/api/v1/activate` endpoint |
| `LicenseRefreshHostedService` | Background heartbeat service (Online mode) |
| `DefaultLicenseFingerprintProvider` | Hardware fingerprint (MAC address + CPU ID) |
| `AssemblyHashCollector` | SHA256 hashes of loaded assemblies |

### DI Registration

#### OSS (Open-Source) Registration

```csharp
services.AddLicenseProtection(configuration);

// Registers:
// - LicenseStore, LicenseVerifier, LicenseRuntimeStatus
// - ILicenseGuard (scoped)
// - ILicenseStore, IFingerprintChainStore, IFingerprintSigner
// - NoopLicenseGuardEnhancer (no anti-tamper)
// - LicenseRefreshHostedService (if online mode)
```

**appsettings.json:**

```json
{
  "LicenseConfigs": {
    "Mode": "Offline",
    "LicenseFilePath": "licenses/license.key",
    "ActivationProofPath": "licenses/activation_proof.json",
    "EnableChain": false,
    "EnableAntiTampering": false
  }
}
```

### Usage Example

```csharp
public class RuleExecutionService(ILicenseGuard guard)
{
    public async Task ExecuteRuleAsync(string ruleId)
    {
        // Pattern 1: Guard (throws if not licensed)
        guard.EnsureValid("rule-engine");
        
        // Pattern 2: Check before branching
        if (guard.HasFeature("audit-trail"))
        {
            await RecordAuditAsync(ruleId);
        }
        
        // Pattern 3: Branch by tier
        switch (guard.Tier)
        {
            case LicenseTier.Enterprise:
                await ExecuteWithFullSecurityAsync(ruleId);
                break;
            case LicenseTier.Licensed:
                await ExecuteStandardAsync(ruleId);
                break;
            case LicenseTier.Free:
                throw new InvalidOperationException("Rule engine not licensed");
        }
    }
    
    public void RecordLicenseAction(string actionType)
    {
        var context = new LicenseActionContext
        {
            ActionType = actionType,
            Timestamp = DateTimeOffset.UtcNow
        };
        guard.RecordAction(context);  // Records to HMAC chain
    }
}
```

---

## Muonroi.Governance.Enterprise

**NuGet:** `Muonroi.Governance.Enterprise` | **Tier:** Enterprise-only | **Distribution:** GitHub Packages

### Purpose

Enterprise-grade governance with anti-tampering detection, HMAC chain verification, code integrity checking, and audit trail enforcement.

### Key Types

| Type | Purpose |
|------|---------|
| `EnterpriseLicenseGuardEnhancer` | Lifecycle hooks with fail-closed enforcement |
| `AntiTamperDetector` | Detects debuggers, profilers, breakpoints |
| `CodeIntegrityVerifier` | SHA256 assembly hash validation |
| `LicenseHeartbeatService` | Periodic heartbeat with nonce rotation |
| `HmacFingerprintSigner` | HMAC-SHA256 chain signing |
| `FingerprintProvider` | Enterprise hardware fingerprint |
| `LicenseActivator` | Saves JWT from activation response |
| `ChainSubmissionHostedService` | Server-side chain validation |

### Anti-Tamper Detection

Runs at startup and detects:

1. **Managed Debugger** — `Debugger.IsAttached`
2. **Native Debugger** — Windows: `IsDebuggerPresent()` API
3. **Profilers** — Environment variables: `CORECLR_PROFILER`, `MicrosoftInstrumentationEngine_*`, etc.
4. **Hardware Breakpoints** — Windows: `GetThreadContext()` check (when enabled)

**When tampering is detected:**
- Security event logged with `[AntiTamper]` prefix
- License automatically downgrades to Free tier
- All Enterprise features blocked at runtime

### Code Integrity Verification

Verifies that loaded assemblies match the approved manifest from license server:

```csharp
public class AntiTamperDetector
{
    /// Detects debuggers, profilers, hooks, and hardware breakpoints.
    public bool DetectTampering()
    {
        if (Debugger.IsAttached) return true;
        if (IsDebuggerPresent()) return true;  // Windows native
        if (IsProfilerAttached()) return true;
        if (configs.EnableHardwareBreakpointDetection && CheckHardwareBreakpoints())
            return true;
        return false;
    }
}

public class CodeIntegrityVerifier
{
    /// Validates assembly hashes against approved manifest.
    public bool VerifyIntegrity(LicenseState state, bool throwOnFailure = true)
    {
        // Collects SHA256 of all loaded assemblies
        // Compares against ActivationProof.AllowedAssemblyHashes
        // Throws on mismatch if throwOnFailure=true
    }
}
```

### DI Registration

#### Enterprise Registration

```csharp
services.AddMEnterpriseGovernance(configuration);

// Registers (in addition to AddLicenseProtection):
// 1. CodeIntegrityVerifier
// 2. AntiTamperDetector
// 3. EnterpriseLicenseGuardEnhancer (fail-closed)
// 4. LicenseHeartbeatService (if enabled)
// 5. ChainSubmissionHostedService (if server validation enabled)
// 6. HmacFingerprintSigner, FileFingerprintChainStore
```

**appsettings.json:**

```json
{
  "LicenseConfigs": {
    "Mode": "Online",
    "LicenseFilePath": "licenses/license.key",
    "ActivationProofPath": "licenses/activation_proof.json",
    "FallbackToOnlineActivation": true,
    "EnableAntiTampering": true,
    "EnableChain": true,
    "FailMode": "Hard",
    "Online": {
      "Endpoint": "https://license.truyentm.xyz",
      "EnableHeartbeat": true,
      "HeartbeatIntervalMinutes": 240,
      "RevocationGraceHours": 24,
      "TimeoutSeconds": 10
    }
  }
}
```

### Startup Protection Flow

```
Application Startup
    ↓
LicenseState loaded & verified
    ↓
[Enterprise Only]
    CodeIntegrityVerifier.VerifyIntegrity()
        → Collect SHA256 hashes of loaded assemblies
        → Compare against ActivationProof.AllowedAssemblyHashes
        → Throw on mismatch (Hard mode) or log warning (Soft mode)
    ↓
    AntiTamperDetector.DetectTampering()
        → Check Debugger.IsAttached
        → Check native debugger (Windows)
        → Check environment profiler vars
        → Check hardware breakpoints (if enabled)
        → Degrade to Free on detection
    ↓
EnterpriseLicenseGuardEnhancer.OnStartup()
    ↓
✓ Startup succeeds with full license features
```

### HMAC Chain Verification

Each heartbeat updates the chain to prevent license tampering:

```
Chain Key Derivation:
  key = SHA256(licenseSignature + projectSeed + salt + serverNonce)

Chain Data Format:
  {previous_hash}|{sequence}|{tenantId}|{action}|{hash}|{timestamp}

Verification on Heartbeat:
  1. Recompute key from signature + seed + salt + nonce
  2. Hash current data
  3. Compare against last hash in chain
  4. If mismatch → License revoked, error response
  5. If match → Return new nonce, extend license
```

### Heartbeat Lifecycle

```
License Active
    ↓
Heartbeat sends every 4 hours (configurable)
    ↓
Network error / Server offline / License revoked
    ↓
Grace Period Starts (24 hours by default)
    ├─ Full functionality maintained
    ├─ Warnings logged
    ├─ Heartbeat continues retrying
    └─ Every failure extends grace
    ↓
Grace Period Expires
    ↓
Tier automatically downgrades to Free
    └─ Enterprise features blocked
    └─ Recurring heartbeat attempts continue
```

### Usage Example

```csharp
public class EnterprisePolicyService(ILicenseGuard guard)
{
    public void EnforcePolicy()
    {
        // EnterpriseLicenseGuardEnhancer provides fail-closed enforcement
        guard.EnsureValid("advanced-auth");
        
        if (!guard.HasFeature("audit-trail"))
        {
            throw new InvalidOperationException("Audit trail required");
        }
        
        var context = new LicenseActionContext
        {
            ActionType = "policy-enforcement",
            ActionName = "enforce_advanced_auth",
            Timestamp = DateTimeOffset.UtcNow
        };
        guard.RecordAction(context);  // Records to HMAC chain
        
        // HMAC chain is verified on each call
        string token = guard.GetChainToken();
    }
}
```

---

## Muonroi.Experience.Abstractions

**NuGet:** `Muonroi.Experience.Abstractions` | **Tier:** Commercial | **Distribution:** GitHub Packages

### Purpose

Core abstractions for the Experience Engine, which extracts learning from agent session logs and stores them in a 4-tier hierarchy.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `NeuronExperience` | record | Extracted experience: trigger, question, reasoning, solution |
| `IExperienceBrain` | interface | LLM-powered extraction (Claude, Ollama) |
| `IExperienceStore` | interface | Storage/retrieval: Qdrant or file-based |
| `IExperienceExtractor` | interface | Hooks for batch extraction |
| `IExperienceInterceptor` | interface | Runtime relevance checking |
| `ExperienceTier` | enum | Principle (0), Behavioral (1), SelfQA (2), RawTrajectory (3) |
| `ExperienceBudgetConfig` | class | Token budgets per tier |
| `ExperienceSearchResult` | class | Result from semantic search |

### Storage Tiers

```csharp
public enum ExperienceTier
{
    /// Generalized principles — highest confidence, lowest cardinality (~400 token budget)
    Principle = 0,
    
    /// Behavioral rules — confirmed patterns, promoted from Self-QA (~600 token budget)
    Behavioral = 1,
    
    /// Self-QA cache — structured Q→Why→Solution, promoted after 3 hits (~500 token budget)
    SelfQA = 2,
    
    /// Raw trajectories — unprocessed session logs, high cardinality, lowest priority
    RawTrajectory = 3
}
```

### Core Models

#### NeuronExperience

```csharp
public sealed record NeuronExperience
{
    /// Unique identifier for this experience entry.
    public required string Id { get; init; }

    /// Short phrase describing the triggering situation.
    /// E.g., "editing file without reading first", "blind-fixing without diagnosis"
    public required string Trigger { get; init; }

    /// The mistake or question this experience addresses.
    public required string Question { get; init; }

    /// Step-by-step reasoning chain explaining why the solution works.
    public required string[] Reasoning { get; init; }

    /// The correct action or pattern to apply in future.
    public required string Solution { get; init; }

    /// Optional generalized principle abstracted from this entry (Tier 0 only).
    public string? Principle { get; init; }

    /// Confidence score (0.0–1.0). Newly extracted entries start at 0.4–0.6.
    public float Confidence { get; init; }

    /// Number of times this entry has been confirmed as relevant by the interceptor.
    public int HitCount { get; init; }

    /// Storage tier this entry belongs to.
    public ExperienceTier Tier { get; init; }

    /// Session or source identifier that produced this entry.
    public required string CreatedFrom { get; init; }

    /// UTC timestamp when extracted.
    public DateTimeOffset CreatedAt { get; init; }
}
```

#### IExperienceBrain

```csharp
public interface IExperienceBrain
{
    /// Analyzes a session log and extracts zero or more experience entries.
    /// Implement to plug in an LLM-powered or rule-based extraction strategy.
    Task<IEnumerable<NeuronExperience>> ExtractAsync(
        string sessionLog,
        CancellationToken ct = default);

    /// Generates a single generalized principle from a cluster of related experiences.
    /// Uses abstraction system prompt (different from ExtractAsync).
    Task<NeuronExperience> AbstractAsync(
        string abstractionPrompt,
        CancellationToken ct = default);
}
```

#### IExperienceStore

```csharp
public interface IExperienceStore
{
    /// Stores a new experience in the tier specified by NeuronExperience.Tier.
    /// Returns false if rejected (budget exceeded or duplicate detected).
    Task<bool> StoreAsync(NeuronExperience experience, CancellationToken ct = default);

    /// Retrieves top-K semantically relevant entries for the given query.
    Task<IEnumerable<ExperienceSearchResult>> FindRelevantAsync(
        string query,
        int topK = 5,
        CancellationToken ct = default);

    /// Promotes an entry one tier upward (e.g., SelfQA → Behavioral).
    Task<NeuronExperience> PromoteAsync(NeuronExperience experience, CancellationToken ct = default);

    /// Demotes an entry one tier downward and resets HitCount to zero.
    Task<NeuronExperience> DemoteAsync(NeuronExperience experience, CancellationToken ct = default);

    /// Clusters semantically similar Tier 2 entries and abstracts them into a Tier 0 principle.
    Task<NeuronExperience> ClusterAndAbstractAsync(
        IEnumerable<NeuronExperience> tier2Entries,
        CancellationToken ct = default);

    /// Returns all entries in the specified tier.
    Task<IEnumerable<NeuronExperience>> FindAllInTierAsync(ExperienceTier tier, CancellationToken ct = default);

    /// Deletes the entry with the given id from whichever tier it occupies.
    Task DeleteAsync(string id, CancellationToken ct = default);
}
```

### Budget Configuration

```csharp
public class ExperienceBudgetConfig
{
    /// Token budget per tier (cumulative).
    public int PrincipleBudget { get; set; } = 400;
    public int BehavioralBudget { get; set; } = 600;
    public int SelfQaBudget { get; set; } = 500;
    public int RawTrajectoryBudget { get; set; } = 1000;
    
    /// Deduplication threshold for semantic similarity (0.0–1.0).
    public float DedupThreshold { get; set; } = 0.85f;
    
    /// Initial confidence range for newly extracted entries.
    public float InitialConfidenceMin { get; set; } = 0.4f;
    public float InitialConfidenceMax { get; set; } = 0.6f;
}
```

---

## Muonroi.Experience.Runtime

**NuGet:** `Muonroi.Experience.Runtime` | **Tier:** Commercial | **Distribution:** GitHub Packages

### Purpose

Runtime implementation of the Experience Engine, including LLM brains (Claude, Ollama), storage backends (Qdrant, File), mistake detection, and evolutionary clustering.

### Architecture

```
Session Trajectory
    ↓
MistakeDetector
    → Detects: retry_loop, user_correction, git_revert, test_red_green
    ↓
ExperienceExtractionPipeline
    → Formats mistake signals → ClaudeExperienceBrain
    ↓
ClaudeExperienceBrain / OllamaExperienceBrain
    → Sends to LLM: "Extract experience from this session"
    → Parses JSON response → NeuronExperience
    ↓
ExperienceStoreOrchestrator
    → Routes to correct store by tier
    → Enforces TokenBudgetEnforcer
    ↓
IExperienceStore (Qdrant / File)
    → Stores in tier, enables semantic search
    ↓
EvolutionBackgroundService (optional)
    → Promotes entries when HitCount >= 3
    → Clusters Tier 2 entries → Abstract into Tier 0 principles
```

### Key Types

| Type | Purpose |
|------|---------|
| `ClaudeExperienceBrain` | POST to Claude API, parse JSON response |
| `OllamaExperienceBrain` | POST to Ollama API, parse streamed response |
| `CompositeExperienceBrain` | Primary brain with fallback chain |
| `QdrantExperienceStore` | Vector semantic search via Qdrant |
| `FileExperienceStore` | JSON files per tier (zero-dep fallback) |
| `ExperienceStoreOrchestrator` | Routes stores by tier, enforces budgets |
| `MistakeDetector` | Detects retry loops, corrections, git reverts, test red/green |
| `MistakeSignal` | (SignalType, Context, ToolCalls[], DetectedAt) |
| `ExperienceExtractionPipeline` | Formats signals → brain → stores |
| `EvolutionBackgroundService` | Promotion + clustering sweeps |
| `ClusteringEngine` | Semantic clustering of similar entries |

### DI Registration

```csharp
// Register store (Qdrant or File)
services.AddExperienceStore(opts =>
{
    opts.StoreType = ExperienceStoreType.Qdrant;
    opts.QdrantUrl = "http://localhost:6334";
    opts.VectorSize = 1536;  // OpenAI embeddings dimension
    opts.Budget = new ExperienceBudgetConfig { };
});

// Register brains (Claude + Ollama fallback)
services.AddExperienceBrain(opts =>
{
    opts.ClaudeEndpoint = "https://api.anthropic.com";
    opts.ClaudeApiKey = Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY");
    opts.ClaudeModel = "claude-haiku-4-5-20251001";
    
    opts.OllamaEndpoint = "http://localhost:11434";
    opts.OllamaPrimaryModel = "llama2";
    opts.OllamaFallbackModel = "mistral";
    
    opts.AiTimeoutSeconds = 120;
    opts.MaxTokens = 800;
    opts.Temperature = 0.3f;
});

// Register evolution (optional)
services.AddExperienceEvolution(opts =>
{
    opts.PromotionThresholdHitCount = 3;
    opts.ClusteringMinMembers = 3;
    opts.PromotionIntervalMinutes = 60;
});

// Register extraction pipeline
services.AddScoped<ExperienceExtractionPipeline>();
services.AddScoped<MistakeDetector>();
services.AddScoped<DefaultExperienceInterceptor>();
```

### MistakeDetector

Detects failure signals in session logs:

```csharp
public sealed class MistakeDetector
{
    /// Analyzes raw JSONL session log and detects mistake signals.
    public async Task<IReadOnlyList<MistakeSignal>> DetectAsync(
        string rawJsonl,
        CancellationToken ct = default)
    {
        // Heuristics:
        // 1. retry_loop — same tool key called 3+ times in a row
        // 2. user_correction — user text after tool_use block
        // 3. git_revert — git revert/reset command in Bash
        // 4. test_red_green — test failure → Edit → test pass
    }
}

public record MistakeSignal(
    string SignalType,           // "retry_loop" | "user_correction" | "git_revert" | "test_red_green"
    string Context,              // 20 lines before + 10 after
    ToolCall[] ToolCalls,        // Associated tool calls
    DateTimeOffset DetectedAt
);
```

### Claude Experience Brain

```csharp
public sealed class ClaudeExperienceBrain(
    IHttpClientFactory httpClientFactory,
    ExperienceBrainOptions options,
    IMLog<ClaudeExperienceBrain>? logger = null) : IExperienceBrain
{
    /// Sends session log to Claude API and extracts experience.
    public async Task<IEnumerable<NeuronExperience>> ExtractAsync(
        string sessionLog,
        CancellationToken ct = default)
    {
        // POST to {ClaudeEndpoint}/v1/messages
        // Headers: x-api-key, anthropic-version: 2023-06-01
        // Parses content[0].text as JSON
        // Returns NeuronExperience[] with Tier=SelfQA, CreatedFrom="claude-brain"
    }
}
```

### Qdrant Experience Store

```csharp
public sealed class QdrantExperienceStore : IExperienceStore
{
    /// Stores experience as vector embedding in Qdrant collection per tier.
    public async Task<bool> StoreAsync(NeuronExperience experience, CancellationToken ct)
    {
        // Embeds experience.Solution via OpenAI API
        // Inserts into Qdrant collection named by tier
        // Enforces TokenBudgetEnforcer — rejects if over budget
    }
    
    /// Semantic search across tier collection.
    public async Task<IEnumerable<ExperienceSearchResult>> FindRelevantAsync(
        string query,
        int topK = 5,
        CancellationToken ct = default)
    {
        // Embeds query
        // Cosine similarity search in Qdrant
        // Returns top-K by similarity score
    }
}
```

### File Experience Store

Zero-dependency fallback using JSON files:

```csharp
public sealed class FileExperienceStore : IExperienceStore
{
    // Directory structure:
    // {FileDirectoryPath}/
    //   └─ principle.json        (Tier 0)
    //   └─ behavioral.json       (Tier 1)
    //   └─ selfqa.json          (Tier 2)
    //   └─ rawtrajectory.json   (Tier 3)
    
    public async Task<bool> StoreAsync(NeuronExperience experience, CancellationToken ct)
    {
        // Appends JSON line to tier file
        // Enforces budget via TokenBudgetEnforcer
    }
    
    public async Task<IEnumerable<ExperienceSearchResult>> FindRelevantAsync(
        string query,
        int topK = 5,
        CancellationToken ct = default)
    {
        // Keyword search: matches query against trigger, question, solution
        // No vector embedding — useful when Qdrant unavailable
    }
}
```

### Evolution Background Service

Automatic promotion and clustering:

```csharp
public sealed class EvolutionBackgroundService : BackgroundService
{
    /// Runs periodically (default: 60 minutes):
    /// 1. Find all entries with HitCount >= 3
    /// 2. Promote to next tier
    /// 3. Cluster similar Tier 2 entries
    /// 4. Abstract clusters into Tier 0 principles
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Implementation handles concurrent promotion and archival
    }
}
```

---

## Muonroi.UiEngine.Catalog

**NuGet:** `Muonroi.UiEngine.Catalog` | **Tier:** Commercial | **Distribution:** GitHub Packages

### Purpose

Scans ASP.NET Core controllers and rule engine APIs at runtime, generates a catalog of endpoints and UI components, enabling dynamic UI generation and API discovery.

### Key Types

| Type | Purpose |
|------|---------|
| `ICatalogScanService` | Scans controller APIs and rule catalog |
| `CatalogScanService` | Default implementation using ASP.NET Core introspection |
| `MUiEngineCatalogApiDescriptor` | API metadata: route, method, auth, request/response types |
| `MRuleCatalogCompatModels` | Rule compatibility metadata |
| `ICatalogSnapshotStore` | Persists/loads catalog snapshots |
| `EfCoreCatalogSnapshotStore` | SQL Server/Postgres persistence |
| `InMemoryCatalogSnapshotStore` | In-memory (for testing) |
| `CatalogScanService` | Scans and builds catalog |

### Catalog Scanning

```csharp
public interface ICatalogScanService
{
    /// Scans all controller actions and returns API descriptors.
    Task<IReadOnlyList<MUiEngineCatalogApiDescriptor>> ScanApisAsync(
        CancellationToken cancellationToken = default);
}

public sealed class CatalogScanService : ICatalogScanService
{
    public async Task<IReadOnlyList<MUiEngineCatalogApiDescriptor>> ScanApisAsync(
        CancellationToken cancellationToken = default)
    {
        // Inspects IApiDescriptionGroupCollectionProvider (ASP.NET Core introspection)
        // For each endpoint:
        //   - Extract route, HTTP method, controller, action
        //   - Detect authorization attributes ([Authorize], [AllowAnonymous])
        //   - Extract request/response types from body parameters and responses
        //   - Collect BindRuleContextAttribute for rule endpoints
        // Returns list of MUiEngineCatalogApiDescriptor
    }
}
```

### API Descriptor

```csharp
public sealed class MUiEngineCatalogApiDescriptor
{
    public string Route { get; set; }                   // e.g., "/api/v1/rules/{id}"
    public string HttpMethod { get; set; }              // GET, POST, PUT, DELETE
    public string ControllerName { get; set; }          // "Rules"
    public string ActionName { get; set; }              // "GetRuleById"
    
    public string? RequestType { get; set; }            // e.g., "Muonroi.RuleEngine.Contracts.GetRuleRequest"
    public string? ResponseType { get; set; }           // e.g., "Muonroi.RuleEngine.Contracts.RuleDto"
    
    public bool IsAuthorized { get; set; }              // true if [Authorize] present
    public bool AllowAnonymous { get; set; }            // true if [AllowAnonymous]
    public bool AllowAnonymousWithoutTenant { get; set; }
    
    public string? Description { get; set; }            // From XML docs or metadata
    public string? DisplayName { get; set; }            // Friendly name
    
    public bool IsBoundRuleContext { get; set; }        // true if [BindRuleContext]
    public string? RuleContextType { get; set; }        // Context type for rule binding
}
```

### DI Registration

```csharp
services.AddUiEngineCatalog(opts =>
{
    opts.PostgresConnectionString = "Host=localhost;Database=catalog";
    // or opts.SqlServerConnectionString = "Server=...";
    // or leave empty for in-memory
});

// Registers:
// - ICatalogScanService
// - ICatalogSnapshotStore (EfCore / InMemory)
// - UiEngineCatalogDbContext (if using SQL)
// - UiEngineCatalogDatabaseMigrator (if using SQL)
```

### Catalog Snapshot

Catalog snapshots are stored/cached to avoid repeated scanning:

```csharp
public interface ICatalogSnapshotStore
{
    /// Saves a snapshot of the current catalog.
    Task SaveSnapshotAsync(
        IReadOnlyList<MUiEngineCatalogApiDescriptor> catalog,
        CancellationToken ct = default);

    /// Loads the latest saved snapshot.
    Task<IReadOnlyList<MUiEngineCatalogApiDescriptor>?> LoadSnapshotAsync(
        CancellationToken ct = default);

    /// Clears the snapshot (for refresh).
    Task ClearSnapshotAsync(CancellationToken ct = default);
}
```

### Rule Binding Attribute

```csharp
[AttributeUsage(AttributeTargets.Parameter)]
public class BindRuleContextAttribute : Attribute
{
    public Type? ContextType { get; }
}

// Usage:
[HttpPost("execute")]
public async Task ExecuteAsync([BindRuleContext] MyRuleContext context, CancellationToken ct)
{
    // Catalog notes: IsBoundRuleContext=true, RuleContextType="MyRuleContext"
}
```

### Usage Example

```csharp
// At startup or on-demand
public class ApiDiscoveryService(ICatalogScanService catalogScan)
{
    public async Task<IReadOnlyList<MUiEngineCatalogApiDescriptor>> DiscoverApisAsync()
    {
        var catalog = await catalogScan.ScanApisAsync();
        
        // Filter by tier
        var rulesApis = catalog
            .Where(x => x.ControllerName == "Rules" && x.IsAuthorized)
            .ToList();
        
        // Generate OpenAPI-like schema
        foreach (var api in rulesApis)
        {
            Console.WriteLine($"{api.HttpMethod} {api.Route} -> {api.ResponseType}");
        }
        
        return catalog;
    }
}
```

---

## Integration Example: Full Stack

Complete example showing governance, experience, and catalog working together:

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

// Governance: License protection (choose one)
if (builder.Configuration.GetValue<bool>("UsesEnterprise"))
{
    builder.Services.AddMEnterpriseGovernance(builder.Configuration);
}
else
{
    builder.Services.AddLicenseProtection(builder.Configuration);
}

// Experience: Runtime extraction and storage
builder.Services.AddExperienceStore(opts =>
{
    opts.StoreType = ExperienceStoreType.Qdrant;
    opts.QdrantUrl = "http://localhost:6334";
});
builder.Services.AddExperienceBrain(opts =>
{
    opts.ClaudeEndpoint = "https://api.anthropic.com";
    opts.ClaudeApiKey = builder.Configuration["ANTHROPIC_API_KEY"];
});

// UI Catalog: API discovery
builder.Services.AddUiEngineCatalog(opts =>
{
    opts.PostgresConnectionString = builder.Configuration.GetConnectionString("Catalog");
});

var app = builder.Build();

// Governance: License endpoint
app.MapMuonroiLicenseInfoEndpoint();

// Experience: Extraction pipeline (background)
_ = app.Services.GetRequiredService<ExperienceExtractionPipeline>();

// Catalog: Scan endpoints
var catalogService = app.Services.GetRequiredService<ICatalogScanService>();
var catalog = await catalogService.ScanApisAsync();

app.Run();
```

**Service Usage:**

```csharp
public class RuleExecutionController(
    ILicenseGuard guard,
    IExperienceStore experienceStore,
    ICatalogScanService catalog) : ControllerBase
{
    [HttpPost("execute")]
    public async Task<IActionResult> ExecuteRule(
        [FromBody] ExecuteRuleRequest req,
        CancellationToken ct)
    {
        // 1. Guard: Ensure licensed for rule-engine
        guard.EnsureValid("rule-engine");
        
        // 2. Execute rule
        var result = await ExecuteAsync(req.RuleId, ct);
        
        // 3. Record action in license chain (Enterprise only)
        guard.RecordAction(new LicenseActionContext
        {
            ActionType = "rule-execution",
            ActionName = req.RuleId,
            Timestamp = DateTimeOffset.UtcNow
        });
        
        // 4. Optionally search experience for similar problems
        if (result.HasErrors)
        {
            var relevant = await experienceStore.FindRelevantAsync(
                $"rule execution error: {result.ErrorMessage}",
                topK: 3,
                ct);
            
            foreach (var exp in relevant)
            {
                result.Suggestions.Add($"Experience {exp.ExperienceId}: {exp.ExperienceTrigger}");
            }
        }
        
        return Ok(result);
    }
}
```

---

## See Also

- [License Activation](../../03-guides/license-governance/license-activation.md) — Offline and online modes
- [Tier Enforcement](../../03-guides/license-governance/tier-enforcement.md) — Feature gates and anti-tampering
- [License Capability Model](../../03-guides/license-governance/license-capability-model.md) — Feature matrix
- [Multi-Tenancy Guide](../../03-guides/multi-tenancy/multi-tenant-guide.md) — Quota enforcement
- [Rule Engine Guide](../../03-guides/rule-engine/rule-engine-guide.md) — Using rule engine with license guards
