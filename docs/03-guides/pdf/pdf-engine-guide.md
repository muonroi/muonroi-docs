---
title: PDF Engine Guide
sidebar_position: 1
---

# Muonroi PDF Engine

`Muonroi.Pdf` is a **pure-managed HTML/CSS → PDF renderer**. It turns an HTML+CSS document into a
deterministic, policy-enforced PDF in a single `AddPdf()` call — on **any OS**, with **no native
binary**, **no browser/Chromium engine**, and **no outbound network**.

It is the managed replacement for wkhtmltopdf-style wrappers such as **DinkToPdf**: no `libwkhtmltox`
native dependency to ship, no glibc/musl mismatch, no headless-Chrome process to babysit. See
[PDF Engine vs DinkToPdf](./pdf-vs-dinktopdf.md) for a feature + speed comparison.

> **Authoring templates?** The supported markup is a bounded, print-safe subset of HTML/CSS — read
> [Supported HTML / CSS / JS](./supported-html-css.md) before writing a template. JavaScript is
> **not** executed.

---

## Install & register

The engine ships in the `Muonroi.Pdf` package. Register the whole pipeline once at the composition root:

```csharp
using Muonroi.Pdf.Extensions;

builder.Services.AddPdf(builder.Configuration);
```

`AddPdf` is **idempotent** (every registration uses `TryAdd*`) and binds `PdfConfigs` from the
`"PdfConfigs"` configuration section with `ValidateOnStart()` — a non-positive limit fails fast at
host build time. It also auto-wires Muonroi.Logging and an `ISystemExecutionContextAccessor` if not
already present.

To override any pipeline component (e.g. a custom `IFontResolver` or `IResourceResolver`), register
your implementation **before** calling `AddPdf` — the `TryAdd` contract means yours wins.

---

## Render a document

Inject `IMPdfService` and call one of three overloads.

```csharp
public sealed class InvoiceController(IMPdfService pdf) : ControllerBase
{
    [HttpGet("invoice/{id}")]
    public async Task<IActionResult> Get(string id, CancellationToken ct)
    {
        string html = await BuildInvoiceHtml(id);

        var options = new PdfRenderOptions
        {
            PageSize = PdfPageSize.A4,
            Orientation = PdfOrientation.Portrait,
            Margins = PdfMargins.Uniform(12),
            TemplateId = "invoice-v1",   // emitted in telemetry (hashed, no content)
        };

        // Stream overload — recommended; does not buffer the whole PDF in memory.
        Response.ContentType = "application/pdf";
        await pdf.RenderAsync(html, Response.Body, options, ct);
        return new EmptyResult();
    }
}
```

### `IMPdfService` API

| Method | Use |
|--------|-----|
| `RenderAsync(html, Stream destination, options, ct)` | **Recommended.** Writes the PDF straight to a caller-owned stream. |
| `RenderToBytesAsync(html, options, ct)` → `(byte[] Bytes, PdfRenderResult Metadata)` | Convenience; buffers the output. Prefer the stream overload in production. |
| `RenderMultiPageAsync(IReadOnlyList<string> htmlPages, Stream destination, options, ct)` | Renders several HTML fragments into one PDF; each fragment starts on a new page. |

All overloads return a `PdfRenderResult`:

```csharp
PdfRenderResult result = await pdf.RenderAsync(html, stream, options, ct);
// result.PageCount, result.ByteCount, result.Elapsed,
// result.TemplateHash, result.PolicyId, result.PolicyViolations
```

The service is **singleton-safe** but resolves tenant context per call via `ITenantContext`; all
internal caches are tenant-scoped to prevent cross-tenant leakage.

---

## Render options

`PdfRenderOptions` is a per-call record — safe to vary per request. Do **not** thread a tenant id
through it (tenancy flows ambiently via `ITenantContext`).

| Property | Default | Notes |
|----------|---------|-------|
| `PageSize` | `A4` | `A4`, `A5`, `A3`, `Letter`, `Legal`. |
| `Orientation` | `Portrait` | `Portrait` / `Landscape` (swaps width/height). |
| `Margins` | `10 mm` uniform | `PdfMargins.Uniform(mm)` or `new PdfMargins(top, right, bottom, left)`; clamped to `[0, 100]` mm. `Default20mm` / `Zero` presets available. |
| `Header` | `null` | Full-HTML running header — see below. |
| `Footer` | `null` | Full-HTML running footer. |
| `UserStyleSheet` | `null` | CSS appended at author origin (correct cascade order, unlike wkhtmltopdf). |
| `Policy` | `null` → DI default | CSS subset gate. DI default is `legacy-print-v1` (`LegacyPrintPolicy`). |
| `FontResolver` | `null` → DI default | Per-call override of the registered `IFontResolver`. |
| `ResourceResolver` | `null` → DI default | Per-call override of the registered `IResourceResolver`. |
| `TemplateId` | `null` | Telemetry tag (recommended). |
| `CorrelationId` | `null` | Telemetry correlation tag. |

### Page sizes (points, portrait)

| Size | Width × Height (pt) | mm |
|------|---------------------|----|
| A4 | 595.28 × 841.89 | 210 × 297 |
| A5 | 419.53 × 595.28 | 148 × 210 |
| A3 | 841.89 × 1190.55 | 297 × 420 |
| Letter | 612 × 792 | 8.5 × 11 in |
| Legal | 612 × 1008 | 8.5 × 14 in |

---

## Running header & footer

`PdfHeaderFooter` renders **full HTML** in three columns (left / center / right). Each column is
laid out as a real box tree with the same fonts as the body — so bold, color, font sizes, and even
**images (a logo)** work. Page numbers use the CSS counters `counter(page)` and `counter(pages)`.

```csharp
var options = new PdfRenderOptions
{
    Header = new PdfHeaderFooter(
        LeftHtml:   "<img src=\"data:image/png;base64,...\" style=\"width:64px;height:38px;\" />",
        CenterHtml: "<b style=\"color:#0c6b6b;\">TÂN CẢNG SÀI GÒN</b>",
        RightHtml:  "Trang counter(page)/counter(pages)",
        HeightMm:   20,      // reserved band height; if larger than the page margin it pushes the body down
        ShowLine:   true),   // draws a separator rule between the band and the body
    Footer = new PdfHeaderFooter(
        CenterHtml: "Tài liệu nội bộ — counter(page)/counter(pages)",
        HeightMm:   12,
        ShowLine:   true),
};
```

| Field | Meaning |
|-------|---------|
| `LeftHtml` / `CenterHtml` / `RightHtml` | HTML fragment per column. Each is aligned within its third (left / center / right). |
| `HeightMm` | Reserved band height. When greater than the corresponding page margin, the effective margin grows and the body is pushed below the header band / above the footer band (no overlap). |
| `ShowLine` | Draws a thin separator rule between the header and the body (and between the body and the footer). |

> Only `counter(page)` / `counter(pages)` are supported as page tokens. wkhtmltopdf-style `[page]` /
> `[topage]` / `[date]` tokens are **not** recognized.

---

## Custom resource loading (images, fonts)

The engine never reaches the network on its own. The default `IResourceResolver` is
`ThrowingResourceResolver` — it rejects every non-inlined URL. **Data-URI** images
(`data:image/png;base64,...`) always work without a resolver.

To load images from a URL, app store, or blob storage, register a resolver that returns bytes:

```csharp
public sealed class BlobResourceResolver(IBlobStore store) : IResourceResolver
{
    public async Task<ResourceResult?> ResolveAsync(Uri uri, string? contentTypeHint, CancellationToken ct)
    {
        byte[]? bytes = await store.TryGetAsync(uri.ToString(), ct);
        return bytes is null ? null : new ResourceResult(bytes, contentTypeHint ?? "image/png");
    }
}

// register BEFORE AddPdf to win the TryAdd:
builder.Services.AddSingleton<IResourceResolver, BlobResourceResolver>();
builder.Services.AddPdf(builder.Configuration);
```

Fonts follow the same pattern via `IFontResolver` (the default `DefaultFontResolver` reads
`PdfConfigs:FontResolver` and bundles Liberation Serif/Sans/Mono as the canonical
`Times New Roman` / `Arial` / `Courier New` fallbacks). Embedded `@font-face` (data-URI) is also
supported and subsetted into the output PDF.

---

## Configuration & limits

Bound from the `"PdfConfigs"` section. All limits are enforced and reject oversized or hostile input
(`PdfInputLimitException`) rather than degrading silently.

```json
{
  "PdfConfigs": {
    "Limits": {
      "MaxHtmlBytes": 8388608,
      "MaxDomDepth": 256,
      "MaxElementCount": 100000,
      "MaxImagePixels": 25000000,
      "MaxPages": 1000,
      "MaxRenderDurationMs": 15000,
      "MaxFontFiles": 32
    },
    "Policy": {
      "SoftDegradeUnknownDisplay": false
    }
  }
}
```

| Limit | Default | Breach |
|-------|---------|--------|
| `MaxHtmlBytes` | 8 MiB | `PdfInputLimitException("HTML-MAX-BYTES")` before parsing |
| `MaxDomDepth` | 256 | policy reject |
| `MaxElementCount` | 100 000 | policy reject |
| `MaxImagePixels` | 25 000 000 | `PdfInputLimitException("IMG-MAX-PIXELS")` |
| `MaxPages` | 1 000 | `PdfInputLimitException("PAGE-MAX-PAGES")` |
| `MaxRenderDurationMs` | 15 000 | render is cancelled (`OperationCanceledException`) |
| `MaxFontFiles` | 32 | font resolution capped |

`Policy.SoftDegradeUnknownDisplay = true` turns `display:flex/grid` violations into **warnings**
(the element renders as `display:block`) instead of hard errors — useful when migrating legacy
templates. Default is strict (fail-loud).

---

## Error handling

| Exception | When |
|-----------|------|
| `PdfInputLimitException` | An input limit was breached (HTML bytes, image pixels, page count). |
| `PdfPolicyException` | The CSS subset policy rejected a forbidden feature; `.Violations` lists each one with rule id, selector, rejected value, and a suggested alternative. |
| `OperationCanceledException` | The render exceeded `MaxRenderDurationMs` or the caller cancelled. |

```csharp
try
{
    await pdf.RenderAsync(html, stream, options, ct);
}
catch (PdfPolicyException ex)
{
    foreach (var v in ex.Violations)
        logger.LogWarning("PDF policy: {Rule} on {Selector}: {Value} → {Fix}",
            v.RuleId, v.CssSelector, v.RejectedValue, v.SuggestedAlternative);
    throw;
}
```

---

## Telemetry

`AddPdf` registers a telemetry descriptor discovered by OtelSetup. The engine emits a `pdf.render`
activity span plus operation-count and page-count metrics, tagged with `TemplateId` (hashed) and the
ambient tenant id.

---

## See also

- [Supported HTML / CSS / JS](./supported-html-css.md) — what you can write in a template.
- [PDF Engine vs DinkToPdf](./pdf-vs-dinktopdf.md) — feature + speed comparison and remaining gaps.
- [PDF Template Designer](../ui-engine/pdf-template-designer.md) — the React authoring component with PROFILE-V1 lint.
