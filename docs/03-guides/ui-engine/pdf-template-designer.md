---
title: PDF Template Designer
sidebar_position: 9
---

# PDF Template Designer

`MuPdfTemplateDesigner` is a React component from the `@muonroi/ui-engine-pdf-designer` package (v1.0.0 GA). It provides a Monaco-backed HTML editor for authoring PDF templates with built-in PROFILE-V1 lint, undo/redo history, and save/approval workflow integration.

This is a React-only component. There is no Lit web component equivalent.

## Package

```
@muonroi/ui-engine-pdf-designer
```

```bash
npm install @muonroi/ui-engine-pdf-designer monaco-editor
```

Monaco Editor is an external peer dependency — the host application is responsible for bundling or providing it. The component dynamically imports `monaco-editor` at runtime.

## License Gate

`MuPdfTemplateDesigner` is gated by the `pdf.designer` license capability. When the active license does not include `pdf.designer`, the component renders a locked stub in place of the editor. Ensure the license contains this capability before mounting the component.

See [License Governance](../license-governance/license-activation.md) for activation and capability provisioning.

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `template` | `PdfTemplate` | Yes | The parent template entity. |
| `version` | `PdfTemplateVersion` | Yes | The version to edit. Initial HTML content is read from `version.contentJson`. |
| `readOnly` | `boolean` | No | When `true`, the Monaco editor is read-only and save/submit actions are hidden. |
| `onSave` | `(html: string) => Promise<void>` | Yes | Called when the user saves. Errors thrown inside `onSave` are surfaced in the UI and block the save action. |
| `onSubmitForApproval` | `() => Promise<void>` | No | Called when the user triggers a submit-for-approval action. |
| `onCancel` | `() => void` | No | Called when the user cancels edits. |
| `onLintChange` | `(violations: LintViolation[]) => void` | No | Called whenever the lint result changes. Receives the current violations array (empty array = clean). |

## PROFILE-V1 Lint

The component runs client-side lint on every content change. Lint results gate the save action: any `error`-severity violation blocks saving. `warning`-severity violations are shown but do not block saving.

### Error (blocks save)

| Rule ID | Trigger | Reason |
|---------|---------|--------|
| `forbidden.tag.script` | `<script` | Forbidden element |
| `forbidden.tag.form` | `<form` | Forbidden element |
| `forbidden.tag.iframe` | `<iframe` | Forbidden element |
| `forbidden.tag.svg` | `<svg` | Forbidden element |
| `forbidden.tag.canvas` | `<canvas` | Forbidden element |
| `forbidden.tag.video` | `<video` | Forbidden element |
| `forbidden.tag.audio` | `<audio` | Forbidden element |
| `forbidden.tag.input` | `<input` | Forbidden element |
| `forbidden.tag.button` | `<button` | Forbidden element |
| `forbidden.tag.select` | `<select` | Forbidden element |
| `forbidden.tag.textarea` | `<textarea` | Forbidden element |
| `forbidden.tag.link` | `<link` | Forbidden element |
| `forbidden.link.scheme.javascript` | `href="javascript:` | Forbidden href scheme |
| `forbidden.link.scheme.file` | `href="file:` | Forbidden href scheme |
| `forbidden.import.external` | `@import "https://` | External stylesheet import |

### Warning (allows save)

| Rule ID | Trigger | Reason |
|---------|---------|--------|
| `forbidden.display.flex` | `display: flex` | Not supported by PROFILE-V1 print engine (block layout only) |
| `forbidden.display.grid` | `display: grid` | Not supported by PROFILE-V1 print engine |
| `forbidden.position.fixed` | `position: fixed` | Not supported by PROFILE-V1 |
| `forbidden.css-animation` | `@keyframes` | Animations not supported |
| `forbidden.background.gradient` | `linear-gradient(` or `radial-gradient(` | Gradients not supported |
| `size.html.exceeds-512kb` | Content > 512 KB | Server will reject oversized templates |

## Undo/Redo

The component maintains an undo/redo stack via `usePdfTemplateHistory` with a capacity of 50 actions. Standard keyboard shortcuts (`Ctrl+Z` / `Ctrl+Shift+Z`) are handled by Monaco.

## Usage

```tsx
import { MuPdfTemplateDesigner } from "@muonroi/ui-engine-pdf-designer";
import type {
  PdfTemplate,
  PdfTemplateVersion,
  LintViolation
} from "@muonroi/ui-engine-pdf-designer";

export function TemplatePage({
  template,
  version
}: {
  template: PdfTemplate;
  version: PdfTemplateVersion;
}) {
  const handleSave = async (html: string) => {
    await apiClient.updateDraft(template.id, version.versionNumber, {
      contentJson: html,
      contentType: "text/html",
      updatedBy: currentUserId
    });
  };

  const handleSubmit = async () => {
    await apiClient.submitForApproval(template.id, version.versionNumber, {
      submittedBy: currentUserId
    });
  };

  const handleLintChange = (violations: LintViolation[]) => {
    const errors = violations.filter((v) => v.severity === "error");
    console.log(`${errors.length} error(s), ${violations.length - errors.length} warning(s)`);
  };

  return (
    <MuPdfTemplateDesigner
      template={template}
      version={version}
      onSave={handleSave}
      onSubmitForApproval={handleSubmit}
      onCancel={() => router.back()}
      onLintChange={handleLintChange}
    />
  );
}
```

## See Also

- [License Governance](../license-governance/license-activation.md) — `pdf.designer` capability provisioning
- [UI Engine Architecture](./ui-engine-architecture.md) — package and component inventory
