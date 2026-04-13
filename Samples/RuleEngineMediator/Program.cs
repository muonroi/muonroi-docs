using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Muonroi.BuildingBlock.External.Mediator;
using Muonroi.BuildingBlock.External.Mediator.Interfaces;
using Muonroi.RuleEngine.Core;
using Muonroi.RuleEngine.Abstractions;
using Muonroi.BuildingBlock.Shared.Rules;

// setup DI with logging, mediator and rule engine
ServiceCollection services = new();
services.AddLogging(b => b.AddConsole());
services.AddMediator(typeof(Program).Assembly);
services.AddRuleEngine()
        .AddRulesFromAssemblies(typeof(Program).Assembly);

await using ServiceProvider provider = services.BuildServiceProvider();

// basic example: run orchestrator directly
RuleOrchestrator<int> orchestrator = provider.GetRequiredService<RuleOrchestrator<int>>();
FactBag basicFacts = await orchestrator.ExecuteAsync(2);
Console.WriteLine($"Basic facts: {string.Join(',', basicFacts.AsReadOnly().Keys)}");

// advanced example: dispatch through mediator
IMediator mediator = provider.GetRequiredService<IMediator>();
FactBag advancedFacts = await mediator.Send(new EvaluateNumberQuery(4));
Console.WriteLine("Advanced facts:");
foreach (var kv in advancedFacts.AsReadOnly())
{
    Console.WriteLine($" - {kv.Key} = {kv.Value}");
}
