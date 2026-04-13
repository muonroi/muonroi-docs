using Muonroi.RuleEngine.Abstractions;

namespace Samples.PaymentApproval.Rules;

/// <summary>
/// Rule 3: verify available budget using a gRPC service.
/// </summary>
public sealed class BudgetCheckRule : IRule<PaymentApprovalContext>
{
    private readonly IBudgetGrpcClient _client;

    public BudgetCheckRule(IBudgetGrpcClient client) => _client = client;

    public string Name => "budget-check";

    public IEnumerable<Type> Dependencies => new[] { typeof(FetchWorkflowRule) };

    public async Task<RuleResult> EvaluateAsync(PaymentApprovalContext context, FactBag facts, CancellationToken cancellationToken = default)
    {
        if (!facts.ContainsKey("WorkflowInfo"))
            return RuleResult.Failed("Workflow information missing.");

        bool ok = await _client.CheckBudgetAsync(context.Amount, cancellationToken);
        facts["BudgetSufficient"] = ok;
        return ok ? RuleResult.Passed() : RuleResult.Failed("Insufficient budget.");
    }
}

/// <summary>
/// Minimal abstraction of the gRPC budget checker.
/// </summary>
public interface IBudgetGrpcClient
{
    Task<bool> CheckBudgetAsync(decimal amount, CancellationToken cancellationToken = default);
}
