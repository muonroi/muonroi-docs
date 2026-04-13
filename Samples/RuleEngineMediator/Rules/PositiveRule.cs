using Muonroi.RuleEngine.Abstractions;

[RuleGroup("numbers")]
public sealed class PositiveRule : IRule<int>
{
    public string Name => "Positive";
    public string Code => nameof(PositiveRule);
    public int Order => 0;
    public IReadOnlyList<string> DependsOn => Array.Empty<string>();
    public HookPoint HookPoint => HookPoint.BeforeRule;
    public RuleType Type => RuleType.Validation;
    public IEnumerable<Type> Dependencies => Array.Empty<Type>();

    public Task ExecuteAsync(int context, CancellationToken cancellationToken = default) => Task.CompletedTask;

    public Task<RuleResult> EvaluateAsync(int context, FactBag facts, CancellationToken cancellationToken = default)
    {
        bool positive = context > 0;
        if (positive)
        {
            facts["positive"] = true;
            return Task.FromResult(RuleResult.Passed());
        }
        return Task.FromResult(RuleResult.Failure("Number must be positive"));
    }
}
