using Muonroi.BuildingBlock.Shared.Rules;

var engine = new RuleEngine<FactBag>()
    .AddRule(new RuleA(), new RuleDescriptor("A", "Rule A", "First rule", RuleType.Business))
    .AddRule(new RuleB(), new RuleDescriptor("B", "Rule B", "Depends on A", RuleType.Business, 1, new[] { "A" }))
    .AddRule(new RuleC(), new RuleDescriptor("C", "Rule C", "Depends on B", RuleType.Business, 2, new[] { "B" }));

var bag = new FactBag();
await engine.ExecuteAsync(bag, RuleType.Business);

Console.WriteLine($"Facts: {string.Join(",", bag.AsReadOnly().Keys)}");

Console.WriteLine("Catalog:");
foreach (var r in engine.GetCatalog())
{
    Console.WriteLine($"{r.Code} - {r.Name} depends on [{string.Join(',', r.DependsOn)}]");
}
