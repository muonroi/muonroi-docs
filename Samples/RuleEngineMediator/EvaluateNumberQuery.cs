using Muonroi.BuildingBlock.External.Mediator.Interfaces;
using Muonroi.RuleEngine.Abstractions;

public sealed record EvaluateNumberQuery(int Value) : IRequest<FactBag>;
