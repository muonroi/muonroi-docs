using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Muonroi.BuildingBlock.Shared.Rules;
using Muonroi.BuildingBlock.Shared.Rules.Orchestration;

namespace ImportExportRules;

/// <summary>
/// Retrieves the tenant and role of the user via gRPC.
/// </summary>
public sealed class UserCompanyRule : IRule<DeclarationContext>
{
    public const string CodeConst = "UserCompany";
    private readonly IIdentityGrpcClient _client;

    public UserCompanyRule(IIdentityGrpcClient client) => _client = client;

    public string Code => CodeConst;
    public int Order => 0;
    public IReadOnlyList<string> DependsOn => [];
    public HookPoint HookPoint => HookPoint.BeforePersist;

    public async Task<RuleResult> EvaluateAsync(DeclarationContext ctx, FactBag facts, CancellationToken ct)
    {
        UserInfo info = await _client.GetUserInfoAsync(ctx.UserId, ct);
        facts.Set("TenantId", info.TenantId);
        facts.Set("Role", info.Role);
        return RuleResult.Success();
    }

    public Task ExecuteAsync(DeclarationContext context, CancellationToken cancellationToken = default)
        => Task.CompletedTask;
}
