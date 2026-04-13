using Microsoft.Extensions.Logging;
using Muonroi.RuleEngine.Abstractions;

[RuleGroup("numbers")]
public sealed class LoggingHook(ILogger<LoggingHook> logger) : IHookHandler<int>
{
    private readonly ILogger<LoggingHook> _logger = logger;

    public Task HandleAsync(HookPoint point, IRule<int> rule, RuleResult result, FactBag facts, int context, TimeSpan? duration = null, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("{Point} {Rule} -> {Success}", point, rule.Name, result.IsSuccess);
        return Task.CompletedTask;
    }
}
