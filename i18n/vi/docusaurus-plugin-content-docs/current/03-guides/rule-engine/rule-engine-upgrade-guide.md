# Rule Engine Upgrade và Cách Dùng (Chi Tiết)

Tài liệu này tổng hợp các thay đổi sau nâng cấp Rule Engine trong `MuonroiBuildingBlock`, cách cấu hình, các loại rule được hỗ trợ, và kịch bản verify theo cách dùng thực tế từ template.

## 1. Những điểm mới sau upgrade

Phiên bản nâng cấp bổ sung các nhóm năng lực chính:

1. **Code-first extraction** từ method sang rule:
   - Attribute: `MExtractAsRuleAttribute` (alias `ExtractAsRuleAttribute`)
   - Runtime mode attribute: `MRuleModeAttribute` (alias `RuleModeAttribute`)
   - CLI `Muonroi.RuleGen` với 3 lệnh: `extract`, `verify`, `register`
2. **API đăng ký thống nhất** cho typed rule engine:
   - `services.AddRuleEngine<TContext>(...)` (alias `AddMRuleEngine<TContext>`)
   - Alias cũ `AddRuleOrchestrator<TContext>` vẫn còn để tương thích ngược
3. **Runtime router đa chế độ** qua `IMRuleExecutionRouter<TContext>`:
   - `Traditional`, `Rules`, `Hybrid`, `Shadow`
4. **Nâng cấp workflow JSON runtime**:
   - Hỗ trợ JSON dạng code-based (mảng mã rule)
   - Hỗ trợ JSON expression-based (Microsoft RulesEngine)
   - Hỗ trợ lưu phiên bản và rollback `SetActiveVersionAsync`
5. **Test toolkit**:
   - `MRuleTestBuilder<TContext>`, `MRuleOrchestratorSpy<TContext>`
   - `FactBagAssertions.Should(...)`
6. **Mở rộng FEEL evaluator**:
   - Logic (`AND/OR/NOT`), toán tử số học, so sánh, `in`, `contains`, `startsWith`
   - Function: `today`, `now`, `days`, `years`, `upper`, `lower`, `abs`, `round`, `sum`
   - Hỗ trợ nested path và wildcard (`items[*].price`)

## 2. Các loại Rule Engine/Rule hiện được hỗ trợ

### 2.1 Typed Rule (`IRule<TContext>`) - C# code

- Dùng khi muốn compile-time safety, debug dễ, dependency rõ ràng.
- Interface chính: `IRule<TContext>`.
- Orchestration chính: `RuleOrchestrator<TContext>` hoặc `RuleEngine<T>`.

### 2.2 JSON Workflow (code-based)

- JSON chỉ chứa `WorkflowName` + danh sách mã rule (`Rules: ["RuleA", "RuleB"]`).
- Runtime map mã rule -> class `IRule<TContext>` đã compile sẵn.
- Phù hợp khi cần bật/tắt/thay đổi luồng rule mà không build lại ứng dụng.

### 2.3 JSON Workflow (expression-based)

- Dùng schema Microsoft RulesEngine (`RuleName`, `Expression`, `Actions`...).
- Không cần class rule cứng cho từng rule expression.
- Phù hợp khi nghiệp vụ cần thay đổi điều kiện nhanh từ JSON/config.

### 2.4 Code-first Generated Rule (từ handler/service method)

- Đánh dấu method bằng `[ExtractAsRule("CODE")]`.
- Sinh file rule `.g.cs` và file đăng ký DI tự động bằng `Muonroi.RuleGen`.
- Phù hợp khi refactor dần từ business method sang rule engine.

### 2.5 NRules Integration (`Muonroi.RuleEngine.NRules`)

- Hỗ trợ rule phức tạp theo mô hình inferencing (Rete).
- Có khả năng bật/tắt/version rule theo cấu hình.
- Dùng cho domain có rule graph lớn và nhiều quan hệ facts.

### 2.6 CEP (Complex Event Processing) (`Muonroi.RuleEngine.CEP`)

- `CepEngine<T>` xử lý event theo window (sliding/tumbling), TTL, out-of-order.
- Dùng cho kịch bản streaming/event-driven thay vì request/response rule thuần.

## 3. Lưu ý license trước khi dùng

Một số luồng thực thi rule gọi `ILicenseGuard.EnsureFeature(FreeTierFeatures.Premium.RuleEngine)`.

- Môi trường test theo template cần key hợp lệ (Paid/Enterprise nếu bật capability tương ứng).
- Nếu thiếu key hợp lệ, runtime có thể chặn execute rule engine.

## 4. Cấu hình runtime mode

```json
{
  "RuleEngine": {
    "ExecutionMode": "Rules",
    "TraditionalWeight": 0.5,
    "RulesWeight": 0.5,
    "LogDifferences": true
  }
}
```

- `ExecutionMode`:
  - `Traditional`: chỉ chạy path cũ
  - `Rules`: chỉ chạy rule orchestrator
  - `Hybrid`: chia traffic theo weight
  - `Shadow`: chạy primary path + shadow rule path để so sánh
- `TraditionalWeight` và `RulesWeight` dùng khi `Hybrid`.
- `LogDifferences` dùng khi `Shadow`.

## 5. Đăng ký DI chuẩn sau nâng cấp

```csharp
services.AddRuleEngine<MyContext>(o =>
{
    o.ExecutionMode = RuleExecutionMode.Hybrid;
    o.TraditionalWeight = 0.3;
    o.RulesWeight = 0.7;
})
.AddRule<MyValidationRule>()
.AddRule<MyBusinessRule>()
.AddHook<MyAuditHook>()
.AddListener<MyRuleEventListener>();
```

API alias:

- `AddRuleEngine<TContext>(...)`: khuyến nghị dùng
- `AddMRuleEngine<TContext>(...)`: tương đương
- `AddRuleOrchestrator<TContext>(...)`: legacy alias (obsolete)

## 6. Mẫu dùng runtime router (Traditional/Rules/Hybrid/Shadow)

```csharp
public sealed class ApproveOrderService(IMRuleExecutionRouter<OrderContext> router)
{
    public async Task<FactBag> ApproveAsync(OrderContext ctx, CancellationToken ct)
    {
        return await router.ExecuteAsync(
            context: ctx,
            traditionalPath: async token =>
            {
                // Logic legacy path
                await Task.CompletedTask;
            },
            modeOverride: null, // null => lấy từ MRuleEngineOptions
            cancellationToken: ct);
    }
}
```

## 7. Runtime add/remove typed rule

```csharp
RuleEngine<MyContext> engine = new();
engine.AddRule(new BaseRule());
engine.AddRule(new PlusFiveRule());

await engine.ExecuteAsync(context, CancellationToken.None, Enum.GetValues<RuleType>());

// Gỡ rule theo code
var removed = engine.RemoveRule("PlusFive");

// Bổ sung rule mới runtime
engine.AddRule(new PlusTwentyRule());
await engine.ExecuteAsync(context, CancellationToken.None, Enum.GetValues<RuleType>());
```

Phù hợp cho các kịch bản cần đổi rule khi hệ thống đang chạy (A/B test, fallback rule).

## 8. Dùng JSON workflow: add/update/remove rule theo version

### 8.1 Dạng code-based JSON

```json
[
  {
    "WorkflowName": "RuntimeWorkflow",
    "Rules": [ "JsonBase", "JsonPlusFive" ]
  }
]
```

### 8.2 Dạng expression JSON

```json
[
  {
    "WorkflowName": "ExpressionWorkflow",
    "Rules": [
      {
        "RuleName": "Double",
        "RuleExpressionType": "LambdaExpression",
        "Expression": "input1.value > 0",
        "Actions": {
          "OnSuccess": {
            "Name": "OutputExpression",
            "Context": { "expression": "input1.value * 2" }
          }
        }
      }
    ]
  }
]
```

### 8.3 Lưu và thực thi

```csharp
FileRuleSetStore store = new("rules");
RulesEngineService service = new(store);

await service.SaveRuleSetAsync("RuntimeWorkflow", jsonV1);
var bagV1 = await service.ExecuteAsync("RuntimeWorkflow", context);

await service.SaveRuleSetAsync("RuntimeWorkflow", jsonV2);
var bagV2 = await service.ExecuteAsync("RuntimeWorkflow", context);

// rollback version
await service.SetActiveVersionAsync("RuntimeWorkflow", 1);
```

## 9. Code-first extraction từ handler block

### 9.1 Đánh dấu method

```csharp
[ExtractAsRule("Order_ValidateAmount", Order = 10, HookPoint = HookPoint.BeforePersist)]
public Task ValidateAmountAsync(OrderContext context)
{
    // business logic hiện có
}
```

### 9.2 Sinh rule và file register

```powershell
dotnet run --project tools/Muonroi.RuleGen -- extract `
  --source src/MyFeature/OrderHandler.cs `
  --output src/MyFeature/GeneratedRules `
  --namespace MyFeature.Generated.Rules `
  --context MyFeature.OrderContext

dotnet run --project tools/Muonroi.RuleGen -- verify `
  --source src/MyFeature/OrderHandler.cs `
  --rules src/MyFeature/GeneratedRules

dotnet run --project tools/Muonroi.RuleGen -- register `
  --rules src/MyFeature/GeneratedRules `
  --output src/MyFeature/GeneratedRules/MGeneratedRuleRegistrationExtensions.g.cs `
  --namespace MyFeature.Generated.Rules
```

Sau đó gọi extension sinh tự động:

```csharp
services.AddMGeneratedRules();
```

## 10. Hook point, dependency và thứ tự chạy

- `DependsOn` (theo code) và `Dependencies` (theo type) đều được orchestrator kiểm tra.
- Thiếu dependency hoặc dependency vòng sẽ ném lỗi trước khi chạy.
- Có thể lọc theo hook point khi chạy:

```csharp
var facts = await orchestrator.ExecuteAsync(context, HookPoint.BeforeRule, cancellationToken);
```

Các hook point phổ biến:

- `BeforeRule`, `AfterRule`, `Error`
- CRUD hooks: `BeforeCreate`, `AfterCreate`, `BeforeUpdate`, `AfterUpdate`, `BeforeDelete`, `AfterDelete`
- Pipeline hooks: `BeforeValidateInput`, `BeforeMap`, `BeforePersist`, `AfterPersist`, `OnSuccess`, `OnFailure`

## 11. Kịch bản API sample để verify sau upgrade

Khi test trong project generate từ template, nên có tối thiểu các API sample sau:

1. `POST /api/rules/typed/runtime-switch`
   - Verify add rule runtime + remove rule runtime.
2. `POST /api/rules/json/workflow-version`
   - Verify save version mới và rollback version cũ bằng `SetActiveVersionAsync`.
3. `POST /api/rules/json/expression`
   - Verify expression JSON chạy không cần hardcoded class rule.
4. `POST /api/rules/router-mode`
   - Verify 4 mode `Traditional/Rules/Hybrid/Shadow` qua `IMRuleExecutionRouter<TContext>`.
5. `POST /api/rules/generated`
   - Verify rule sinh từ `Muonroi.RuleGen` và đăng ký bằng `AddMGeneratedRules`.

Checklist pass:

- Không có missing/ambiguous code mapping trong workflow code-based JSON.
- Rule dependency chạy đúng thứ tự.
- Facts output đúng kỳ vọng cho cả typed rule và expression JSON.
- Shadow mode log được khác biệt khi bật `LogDifferences = true`.
- Không cần workaround ngoài luồng dùng template chuẩn.

## 12. Tài liệu liên quan

- [Rule Engine Guide](rule-engine-guide.md)
- [Rule Engine Configuration Reference](/docs/guides/rule-engine/rule-engine-configuration-reference)
- [Rule Engine Advanced Patterns](/docs/guides/rule-engine/rule-engine-advanced-patterns)
- [Rule Engine Testing Guide](/docs/guides/rule-engine/rule-engine-testing-guide)
- [Workflow JSON Format (Tiếng Việt)](/docs/guides/rule-engine/workflow-json-format)
