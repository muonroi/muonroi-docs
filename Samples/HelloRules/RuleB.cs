using Muonroi.BuildingBlock.Shared.Rules;

public class RuleB : IRule<FactBag>
{
    public RuleType Type => RuleType.Business;

    public Task ExecuteAsync(FactBag context, CancellationToken cancellationToken = default)
    {
        if (context.Get<bool>("A"))
        {
            context.Set("B", true);
        }
        return Task.CompletedTask;
    }
}
