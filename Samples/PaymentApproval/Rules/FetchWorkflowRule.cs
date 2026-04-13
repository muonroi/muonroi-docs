using System.Net.Http.Json;
using Muonroi.RuleEngine.Abstractions;

namespace Samples.PaymentApproval.Rules;

/// <summary>
/// Rule 2: retrieve workflow definition from BPMN system via REST.
/// </summary>
public sealed class FetchWorkflowRule : IRule<PaymentApprovalContext>
{
    public string Name => "fetch-workflow";

    public IEnumerable<Type> Dependencies => new[] { typeof(CheckRequesterRoleRule) };

    public async Task<RuleResult> EvaluateAsync(PaymentApprovalContext context, FactBag facts, CancellationToken cancellationToken = default)
    {
        using HttpClient client = new();
        WorkflowInfo? info = await client.GetFromJsonAsync<WorkflowInfo>("https://example.com/bpmn/payment-workflow", cancellationToken);
        if (info is null || info.Locked || !info.Configured)
        {
            return RuleResult.Failed("Approval workflow unavailable.");
        }
        facts["WorkflowInfo"] = info;
        return RuleResult.Passed();
    }
}
