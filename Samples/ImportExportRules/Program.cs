using System.Linq;
using ImportExportRules;
using Muonroi.BuildingBlock.Shared.Rules;
using Muonroi.BuildingBlock.Shared.Rules.Orchestration;

// Setup fake services
var identityClient = new FakeIdentityGrpcClient();
var contractClient = new FakeContractRestClient();
var permissionClient = new FakePermissionGrpcClient();

// Register rules with the orchestrator
var orchestrator = new RuleOrchestrator<DeclarationContext>(new IRule<DeclarationContext>[]
{
    new UserCompanyRule(identityClient),
    new CompanyContractRule(contractClient),
    new GoodsPermissionRule(permissionClient)
});

// Only request the final rule; dependencies will be resolved automatically
var context = new DeclarationContext("user-1", "electronics");
var results = await orchestrator.ExecuteAsync(
    HookPoint.BeforePersist,
    context,
    new[] { GoodsPermissionRule.CodeConst },
    shortCircuit: true);

Console.WriteLine($"All rules passed: {results.All(r => r.IsSuccess)}");
