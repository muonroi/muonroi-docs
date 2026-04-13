using Microsoft.Extensions.DependencyInjection;
using Muonroi.RuleEngine.Abstractions;
using Muonroi.RuleEngine.Core;
using Samples.PaymentApproval;
using Samples.PaymentApproval.Rules;

var services = new ServiceCollection();
services.AddSingleton<IBudgetGrpcClient, FakeBudgetClient>();
services.AddRulesFromAssemblies(typeof(CheckRequesterRoleRule).Assembly);
var provider = services.BuildServiceProvider();

var orchestrator = provider.GetRequiredService<RuleOrchestrator<PaymentApprovalContext>>();
var context = new PaymentApprovalContext("user1", 1000m);
try
{
    FactBag facts = await orchestrator.ExecuteAsync(context);
    if (facts.TryGetValue("ApprovalResult", out var result) && result is ApprovalResult approval)
    {
        Console.WriteLine($"Approved: {approval.Approved}");
    }
}
catch (Exception ex)
{
    Console.WriteLine($"Process failed: {ex.Message}");
}

sealed class FakeBudgetClient : IBudgetGrpcClient
{
    public Task<bool> CheckBudgetAsync(decimal amount, CancellationToken cancellationToken = default) => Task.FromResult(true);
}
