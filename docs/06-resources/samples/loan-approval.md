# Loan Approval Sample

Source path:

- `muonroi-building-block/samples/LoanApproval`

## What this demonstrates

- Rule orchestration with `RuleOrchestrator<LoanApplication>`.
- Code-first extraction markers: `[MExtractAsRule("CREDIT_SCORE")]`, `[MExtractAsRule("DEBT_RATIO")]`.
- A runnable API endpoint: `POST /api/loans`.
- Importable artifacts:
  - `rulesets/loan-approval.json`
  - `decision-tables/loan-tiers.json`

## Quick run

```powershell
cd <workspace-root>\muonroi-building-block\samples\LoanApproval\src\LoanApproval.Api
dotnet restore
dotnet run
```

## Test request

```powershell
curl -X POST http://localhost:5000/api/loans -H "Content-Type: application/json" -d '{"applicantId":"A-100","creditScore":735,"monthlyIncome":4200,"monthlyDebt":1400,"requestedAmount":50000,"employmentMonths":18}'
```
