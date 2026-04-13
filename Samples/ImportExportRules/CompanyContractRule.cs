using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Muonroi.BuildingBlock.Shared.Rules;
using Muonroi.BuildingBlock.Shared.Rules.Orchestration;

namespace ImportExportRules;

/// <summary>
/// Verifies via REST whether the company has an active contract.
/// </summary>
public sealed class CompanyContractRule : IRule<DeclarationContext>
{
    public const string CodeConst = "CompanyContract";
    private readonly IContractRestClient _client;

    public CompanyContractRule(IContractRestClient client) => _client = client;

    public string Code => CodeConst;
    public int Order => 1;
    public IReadOnlyList<string> DependsOn => new[] { UserCompanyRule.CodeConst };
    public HookPoint HookPoint => HookPoint.BeforePersist;

    public async Task<RuleResult> EvaluateAsync(DeclarationContext ctx, FactBag facts, CancellationToken ct)
    {
        string? tenantId = facts.Get<string>("TenantId");
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            return RuleResult.Failure("Missing tenant id");
        }

        bool valid = await _client.HasValidContractAsync(tenantId, ct);
        if (!valid)
        {
            return RuleResult.Failure("Company contract invalid");
        }

        facts.Set("ContractValid", true);
        return RuleResult.Success();
    }

    public Task ExecuteAsync(DeclarationContext context, CancellationToken cancellationToken = default)
        => Task.CompletedTask;
}
