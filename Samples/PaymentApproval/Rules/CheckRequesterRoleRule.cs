using System.Net.Http.Json;
using Muonroi.RuleEngine.Abstractions;

namespace Samples.PaymentApproval.Rules;

/// <summary>
/// Rule 1: validate the creator has the requester role using a REST call.
/// </summary>
public sealed class CheckRequesterRoleRule : IRule<PaymentApprovalContext>
{
    public string Name => "check-requester-role";

    public IEnumerable<Type> Dependencies => Array.Empty<Type>();

    public async Task<RuleResult> EvaluateAsync(PaymentApprovalContext context, FactBag facts, CancellationToken cancellationToken = default)
    {
        using HttpClient client = new();
        var roles = await client.GetFromJsonAsync<List<string>>($"https://example.com/users/{context.CreatorId}/roles", cancellationToken) ?? [];
        bool isRequester = roles.Contains("requester", StringComparer.OrdinalIgnoreCase);
        facts["IsRequester"] = isRequester;
        return isRequester ? RuleResult.Passed() : RuleResult.Failed("Creator must have requester role.");
    }
}
