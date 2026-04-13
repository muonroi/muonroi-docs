using Muonroi.RuleEngine.Abstractions;

[RuleGroup("numbers")]
public sealed class SquareRule : IRule<int>
{
    public string Name => "Square";
    public string Code => nameof(SquareRule);
    public int Order => 1;
    public IReadOnlyList<string> DependsOn => new[] { nameof(EvenRule) };
    public HookPoint HookPoint => HookPoint.BeforeRule;
    public RuleType Type => RuleType.Business;
    public IEnumerable<Type> Dependencies => new[] { typeof(EvenRule) };

    public Task ExecuteAsync(int context, CancellationToken cancellationToken = default) => Task.CompletedTask;

    public Task<RuleResult> EvaluateAsync(int context, FactBag facts, CancellationToken cancellationToken = default)
    {
        int square = context * context;
        facts["square"] = square;
        return Task.FromResult(RuleResult.Passed());
    }
}
