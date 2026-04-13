using Muonroi.BuildingBlock.External.Mediator.Interfaces;
using Muonroi.RuleEngine.Abstractions;
using Muonroi.RuleEngine.Core;

public sealed class EvaluateNumberQueryHandler(RuleOrchestrator<int> orchestrator)
    : IRequestHandler<EvaluateNumberQuery, FactBag>
{
    private readonly RuleOrchestrator<int> _orchestrator = orchestrator;

    public Task<FactBag> Handle(EvaluateNumberQuery request, CancellationToken cancellationToken)
        => _orchestrator.ExecuteAsync(request.Value, cancellationToken);
}
