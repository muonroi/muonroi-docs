# Hướng dẫn Rule Engine

*Xem [bản tiếng Anh](rule-engine-guide.md).* 
*Xem thêm tài liệu nâng cấp chi tiết: [Rule Engine Upgrade (Tiếng Việt)](/docs/guides/rule-engine/rule-engine-upgrade-guide).*

Muonroi rule engine giúp tách logic nghiệp vụ thành các rule nhỏ có thể tái sử dụng. Engine hỗ trợ cả rule viết bằng C# lẫn workflow JSON động. Tài liệu này mô tả các bước cơ bản để áp dụng rule engine trong ứng dụng của bạn.

Thành phần này là tùy chọn và được đóng gói trong NuGet `Muonroi.BuildingBlock` để xử lý các nghiệp vụ phức tạp. Dự án không cần rule engine có thể bỏ qua bước đăng ký.

## Bắt đầu nhanh

1. **Tạo rule** – hiện thực `IRule<T>` và ghi kết quả vào `FactBag`.
2. **Đăng ký** – thêm rule và các `IHookHandler<T>` tùy chọn vào DI container.
3. **Thực thi** – resolve `RuleOrchestrator<T>` rồi gọi `ExecuteAsync` với context.

```csharp
public sealed class PositiveRule : IRule<int>
{
    public string Name => "Positive";
    public string Code => "POS";
    public int Order => 0;
    public IReadOnlyList<string> DependsOn => Array.Empty<string>();
    public HookPoint HookPoint => HookPoint.BeforeRule;
    public RuleType Type => RuleType.Validation;
    public IEnumerable<Type> Dependencies => Array.Empty<Type>();

    public Task ExecuteAsync(int context, CancellationToken token = default) => Task.CompletedTask;

    public Task<RuleResult> EvaluateAsync(int context, FactBag facts, CancellationToken token = default)
    {
        bool ok = context > 0;
        facts["positive"] = ok;
        return Task.FromResult(ok ? RuleResult.Passed() : RuleResult.Failure("Số phải dương"));
    }
}

services.AddRuleEngine().AddRulesFromAssemblies(typeof(PositiveRule).Assembly);

await using var provider = services.BuildServiceProvider();
RuleOrchestrator<int> orchestrator = provider.GetRequiredService<RuleOrchestrator<int>>();
FactBag facts = await orchestrator.ExecuteAsync(5);
bool ok = facts.Get<bool>("positive");
```

`FactBag` lưu trữ toàn bộ output từ các rule trước đó để rule sau có thể sử dụng tiếp.

## Ví dụ end-to-end: duyệt thanh toán

Sample `PaymentApproval` minh họa cách phối hợp nhiều rule để phê duyệt một yêu cầu thanh toán:

1. `CheckRequesterRoleRule` gọi REST API để kiểm tra creator có role **requester**.
2. `FetchWorkflowRule` lấy cấu hình workflow từ dịch vụ BPMN.
3. `BudgetCheckRule` dùng gRPC để đảm bảo đủ ngân sách.
4. `FinancialApprovalRule` gửi yêu cầu tới hệ thống tài chính và trả về quyết định.

Một rule có thể được hiện thực như sau:

```csharp
public sealed class CheckRequesterRoleRule : IRule<PaymentApprovalContext>
{
    public string Name => "check-requester-role";
    public IEnumerable<Type> Dependencies => Array.Empty<Type>();

    public async Task<RuleResult> EvaluateAsync(PaymentApprovalContext context, FactBag facts, CancellationToken token = default)
    {
        using HttpClient client = new();
        var roles = await client.GetFromJsonAsync<List<string>>($"https://example.com/users/{context.CreatorId}/roles", token) ?? [];
        bool isRequester = roles.Contains("requester", StringComparer.OrdinalIgnoreCase);
        facts["IsRequester"] = isRequester;
        return isRequester ? RuleResult.Passed() : RuleResult.Failed("Creator phải có role requester.");
    }
}
```

Đăng ký các rule rồi thực thi workflow:

```csharp
public sealed record PaymentApprovalContext(string CreatorId, decimal Amount);

var services = new ServiceCollection();
services.AddSingleton<IBudgetGrpcClient, FakeBudgetClient>();
services.AddRulesFromAssemblies(typeof(CheckRequesterRoleRule).Assembly);

await using var provider = services.BuildServiceProvider();
var orchestrator = provider.GetRequiredService<RuleOrchestrator<PaymentApprovalContext>>();
var context = new PaymentApprovalContext("user1", 1000m);

FactBag facts = await orchestrator.ExecuteAsync(context);
if (facts.TryGetValue("ApprovalResult", out var result) && result is ApprovalResult approval)
{
    Console.WriteLine($"Approved: {approval.Approved}");
}

public interface IBudgetGrpcClient
{
    Task<bool> CheckBudgetAsync(decimal amount, CancellationToken token = default);
}

sealed class FakeBudgetClient : IBudgetGrpcClient
{
    public Task<bool> CheckBudgetAsync(decimal amount, CancellationToken token = default) => Task.FromResult(true);
}
```

Mỗi rule thêm dữ kiện (`IsRequester`, `WorkflowInfo`, `BudgetSufficient`, `ApprovalResult`) để bước sau có thể phụ thuộc kết quả trước. Xem `Samples/PaymentApproval` để biết toàn bộ mã nguồn.

## Rule kiểu mạnh

Các rule triển khai `IBusinessRule<TContext>` và cung cấp phương thức `IsSatisfiedAsync`. Có thể ghép chúng bằng các extension method `And` và `Or` để tạo đặc tả phức tạp nhưng vẫn bảo đảm an toàn biên dịch.

```csharp
public sealed class MinimumAmountRule : IBusinessRule<Order>
{
    public string Code => "MIN";
    public Task<bool> IsSatisfiedAsync(Order order, CancellationToken token = default)
        => Task.FromResult(order.Total >= 100);
}
```

## Rule bên ngoài

Các rule động có thể được mô tả bằng JSON và đánh giá lúc chạy thông qua [Microsoft RulesEngine](https://github.com/microsoft/RulesEngine). `ExternalJsonRule<TContext>` tải các workflow và kiểm tra chúng với ngữ cảnh được truyền vào mà không cần biên dịch lại.

```csharp
const string json = """
[
  {
    "WorkflowName": "NumberWorkflow",
    "Rules": [
      {
        "RuleName": "IsEven",
        "RuleExpressionType": "LambdaExpression",
        "Expression": "input1.value % 2 == 0"
      }
    ]
  }
]
""";

IBusinessRule<int> external = new ExternalJsonRule<int>(json, "NumberWorkflow");
```

## Kết hợp các cách tiếp cận

Vì cả hai cách đều triển khai `IBusinessRule<TContext>`, chúng có thể ghép với nhau. Điều này cho phép ứng dụng trộn các rule biên dịch sẵn với rule nạp động.

```csharp
IBusinessRule<int> combined = new PositiveRule().And(external);
bool result = await combined.IsSatisfiedAsync(4); // true
```

## Workflow JSON có phiên bản

`RulesEngineService` cho phép tải và thực thi workflow JSON mà không cần biên dịch lại. Các bộ rule được lưu thông qua `IRuleSetStore` (ví dụ `FileRuleSetStore` trên đĩa) và mỗi lần thực thi trả về `FactBag` chứa output từ các action của rule.

```csharp
FileRuleSetStore store = new("rules");
RulesEngineService service = new(store);
await service.SaveRuleSetAsync("NumberWorkflow", json);
FactBag bag = await service.ExecuteAsync("NumberWorkflow", 3);
int result = bag.Get<int>("Double");
```

Để tránh phải dùng tên đầy đủ của lớp trong biểu thức rule, có thể đăng ký các kiểu tùy chỉnh qua `ReSettings` và truyền vào service:

```csharp
ReSettings settings = new() { CustomTypes = new[] { typeof(MyRuleHelpers) } };
RulesEngineService service = new(store, settings);
```

Có thể quay lại phiên bản trước bằng cách chọn số phiên bản mong muốn:

```csharp
await service.SetActiveVersionAsync("NumberWorkflow", 1);
```

## Kiến trúc và luồng thực thi

Rule engine thực thi một tập các hiện thực `IRule<T>`. Mỗi rule được mô tả bởi `RuleDescriptor` chứa mã duy nhất, tên hiển thị, mô tả, hook point, thứ tự chạy và các phụ thuộc tùy chọn. Khi chạy, engine lọc các rule đã đăng ký theo:

- hook point `RuleType` yêu cầu;
- danh sách mã rule tùy chọn;
- các công tắc cấu hình qua `RuleOptions`;
- cờ tính năng `IRuleActivationStrategy<T>`.

Sau khi lọc, các rule được sắp xếp sao cho mọi phần tử trong `DependsOn` chạy trước. Thiếu hoặc phụ thuộc vòng sẽ ném `InvalidOperationException` trước khi bất kỳ rule nào được thực thi.

Khi gọi `ExecuteAsync`:

1. Mở transaction nếu context triển khai `ITransactionalRuleContext`.
2. `ExecuteAsync` của từng rule chạy tuần tự.
3. Thất bại dừng pipeline và được ghi log; thời gian thực thi và kết quả được ghi lại qua OpenTelemetry.
4. Transaction commit hoặc rollback dựa trên kết quả tổng thể.

`RuleOrchestrator<TContext>` trong package `Muonroi.RuleEngine.Core` xây dựng dựa trên các ý tưởng này và bổ sung callback `HookPoint`. Hiện thực `IHookHandler<TContext>` giúp ứng dụng phản ứng trước hoặc sau mỗi rule, hoặc khi có lỗi, mà không làm rối logic nghiệp vụ.

## Bảo mật & tuân thủ

Engine cung cấp các thành phần tùy chọn để đáp ứng yêu cầu an toàn:

* **Ký/niêm phong artifact** – `FileRuleSetStore` nhận `IRuleSetSigner` để ký và xác minh workflow JSON trước khi chạy.
* **RBAC và nhật ký** – đăng ký `AuditTrailHook<T>` để ghi lại quá trình thực thi rule và tích hợp với hệ thống phân quyền.
* **Giảm thiểu dữ liệu** – `AuditTrailHook<T>` cho phép chiếu lại context nhằm loại bỏ trường nhạy cảm trước khi log.
* **Tuân thủ chính sách** – có thể kết hợp với policy engine như [Open Policy Agent](https://www.openpolicyagent.org/) để kiểm tra quyền truy cập trước khi thực thi.

## Triển khai an toàn & kiểm soát rủi ro

Các rule có thể được triển khai với cơ chế giảm thiểu rủi ro:

- **Feature flags** – hiện thực `IRuleActivationStrategy<T>` và tích hợp với nhà cung cấp như [Unleash](https://www.getunleash.io/) để có kill-switch hoặc rollout dần theo tenant, user segment hay tỉ lệ.
- **Canary/Progressive delivery** – chạy song song hai phiên bản rule và dùng công cụ như [Argo Rollouts](https://argo-rollouts.readthedocs.io/) để tăng lưu lượng dần, tự động rollback khi vượt quá ngưỡng lỗi.
- **Shadow evaluation/Dry-run** – thực thi phiên bản mới ở chế độ "bóng" và so sánh output với phiên bản hiện tại trước khi bật chính thức.

Xem [Rule Rollout Guide](/docs/guides/rule-engine/rule-rollout-guide) để biết chi tiết.

## Runtime & hiệu năng

Để khớp dữ kiện lớn với độ trễ thấp, engine nên dùng thuật toán suy diễn dạng Rete/Phreak giúp incremental matching. NRules xây dựng mạng Rete trong khi [Drools](https://docs.drools.org/latest/drools-docs/html_single/) mô tả chi tiết cơ chế engine và inference. Cần tối ưu session và retained facts theo workload để tránh tính toán lại không cần thiết.

### Conflict resolution/Agenda

Salience (priority), activation/agenda groups và `AgendaFilter` cho phép kiểm soát thứ tự rule được kích hoạt. Xem [tài liệu JBoss](https://docs.jboss.org/drools/release/latest/drools-docs/html_single/) và [tài liệu Drools](https://docs.drools.org/latest/drools-docs/html_single/#_rule_agenda) để biết thêm chi tiết.

### Pre-compilation & benchmarking

Biên dịch hoặc warm-up rule trước, pool session và sử dụng payload thân thiện GC để giảm spike độ trễ. Benchmark cả chế độ batch và streaming để kiểm tra đặc tính hiệu năng.

