using System.Net.Http.Json;
using Muonroi.RuleEngine.Abstractions;

namespace Samples.PaymentApproval.Rules;

/// <summary>
/// Rule 4: send the request to the financial approval system via REST.
/// </summary>
public sealed class FinancialApprovalRule : IRule<PaymentApprovalContext>
{
    public string Name => "financial-approval";

    public IEnumerable<Type> Dependencies => new[] { typeof(BudgetCheckRule) };

    public async Task<RuleResult> EvaluateAsync(PaymentApprovalContext context, FactBag facts, CancellationToken cancellationToken = default)
    {
        using HttpClient client = new();
        var response = await client.PostAsJsonAsync("https://example.com/finance/approve", new { context.CreatorId, context.Amount }, cancellationToken);
        response.EnsureSuccessStatusCode();
        ApprovalResult? result = await response.Content.ReadFromJsonAsync<ApprovalResult>(cancellationToken: cancellationToken);
        facts["ApprovalResult"] = result;
        return result?.Approved == true ? RuleResult.Passed() : RuleResult.Failed("Financial approval rejected.");
    }
}

public sealed record ApprovalResult(bool Approved);
