using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Muonroi.BuildingBlock.Shared.Rules;
using Muonroi.BuildingBlock.Shared.Rules.Orchestration;

namespace ImportExportRules;

/// <summary>
/// Final gRPC check to ensure the user can create the declaration for the goods type.
/// </summary>
public sealed class GoodsPermissionRule : IRule<DeclarationContext>
{
    public const string CodeConst = "GoodsPermission";
    private readonly IPermissionGrpcClient _client;

    public GoodsPermissionRule(IPermissionGrpcClient client) => _client = client;

    public string Code => CodeConst;
    public int Order => 2;
    public IReadOnlyList<string> DependsOn => new[] { UserCompanyRule.CodeConst, CompanyContractRule.CodeConst };
    public HookPoint HookPoint => HookPoint.BeforePersist;

    public async Task<RuleResult> EvaluateAsync(DeclarationContext ctx, FactBag facts, CancellationToken ct)
    {
        if (!facts.TryGet<bool>("ContractValid", out bool valid) || !valid)
        {
            return RuleResult.Failure("Company contract invalid");
        }

        bool allowed = await _client.HasPermissionAsync(ctx.UserId, ctx.GoodsType, ct);
        return allowed ? RuleResult.Success() : RuleResult.Failure("Permission denied");
    }

    public Task ExecuteAsync(DeclarationContext context, CancellationToken cancellationToken = default)
        => Task.CompletedTask;
}
