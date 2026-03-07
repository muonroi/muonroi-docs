# Decision Table Widget

The primary authoring surface is `mu-decision-table`.

## Important attributes

- `api-base`
- `validate-endpoint`
- `export-endpoint`
- `feel-endpoint`
- `history-endpoint`
- `reorder-endpoint`
- `table-id`
- `enable-version-diff`

Use `MuDecisionTableReact` from `@muonroi/ui-engine-react` when embedding the widget in React applications.

## Commercial runtime guard

`@muonroi/ui-engine-rule-components` now enforces runtime license verification in the browser.
Without a valid activation proof, commercial widgets render a `License required` panel instead of the editor surface.

### React bootstrap

```ts
import { MLoadRuleEngineCustomElements } from "@muonroi/ui-engine-react";

const proof = await fetch("/api/v1/info")
  .then((res) => res.json())
  .then((payload) => payload.activationProof as string);

await MLoadRuleEngineCustomElements({ activationProof: proof });
```

### Angular bootstrap

```ts
import { MLoadRuleEngineCustomElements } from "@muonroi/ui-engine-angular";

await MLoadRuleEngineCustomElements({
  activationProof: proofFromBackend
});
```

If needed, pass `publicKeyPem` to `MLoadRuleEngineCustomElements` to override the default embedded verifier key.
