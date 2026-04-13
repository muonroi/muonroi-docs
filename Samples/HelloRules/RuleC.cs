using Muonroi.BuildingBlock.Shared.Rules;

public class RuleC : IRule<FactBag>
{
    public RuleType Type => RuleType.Business;

    public Task ExecuteAsync(FactBag context, CancellationToken cancellationToken = default)
    {
        if (context.Get<bool>("B"))
        {
            context.Set("C", true);
        }
        return Task.CompletedTask;
    }
}
