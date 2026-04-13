using Muonroi.BuildingBlock.Shared.Rules;

public class RuleA : IRule<FactBag>
{
    public RuleType Type => RuleType.Business;

    public Task ExecuteAsync(FactBag context, CancellationToken cancellationToken = default)
    {
        context.Set("A", true);
        return Task.CompletedTask;
    }
}
