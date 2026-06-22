---
title: PDF Examples / Sample Templates
sidebar_position: 4
---

# PDF Examples / Sample Templates

Copy-paste, runnable examples for the Muonroi PDF engine. Every template here uses only
[supported HTML/CSS](./supported-html-css.md) — paste one into the render call from the
[engine guide](./pdf-engine-guide.md) and it renders deterministically on any OS.

> All examples assume the pipeline is registered once at startup:
> ```csharp
> builder.Services.AddPdf(builder.Configuration);
> ```
> and that you inject `IMPdfService pdf`.

> **Runnable version:** every scenario below is also a working console app in the building-block repo
> at `samples/Muonroi.Pdf.Samples` — `dotnet run --project samples/Muonroi.Pdf.Samples` renders them
> all to `pdf-output/`.

---

## 1. Minimal render

The smallest possible end-to-end render.

```csharp
const string html = """
    <!DOCTYPE html>
    <html><head><style>
      body { font-family: Arial, sans-serif; font-size: 12pt; color: #222; }
      h1   { color: #0c6b6b; }
    </style></head>
    <body>
      <h1>Hello, Muonroi.Pdf</h1>
      <p>Pure-managed HTML → PDF. No browser, no native binary.</p>
    </body></html>
    """;

await using var output = File.OpenWrite("hello.pdf");
PdfRenderResult result = await pdf.RenderAsync(html, output, new PdfRenderOptions());
Console.WriteLine($"{result.PageCount} page(s), {result.ByteCount} bytes");
```

---

## 2. Invoice (tables, floats, totals)

The bread-and-butter business document: a header block, a line-item table with `%` column
widths and `table-layout: fixed`, and a right-aligned totals box. No flex/grid needed.

```html
<!DOCTYPE html>
<html>
<head>
<style>
  body   { font-family: Arial, sans-serif; font-size: 11pt; color: #222; margin: 0; }
  .head  { overflow: hidden; margin-bottom: 16px; }
  .head .brand { float: left;  font-size: 18pt; font-weight: bold; color: #0c6b6b; }
  .head .meta  { float: right; text-align: right; font-size: 10pt; color: #555; }

  table  { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; }
  th     { background-color: #0c6b6b; color: #fff; text-align: left; }
  .num   { text-align: right; }
  .col-desc { width: 55%; }
  .col-qty  { width: 15%; }
  .col-amt  { width: 30%; }

  .totals { float: right; width: 40%; margin-top: 12px; }
  .totals td { border: none; padding: 2px 8px; }
  .totals .grand { font-weight: bold; border-top: 2px solid #0c6b6b; }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">ACME Corp</div>
    <div class="meta">Invoice #INV-2026-0042<br/>Date: 2026-06-22</div>
  </div>

  <table>
    <thead>
      <tr><th class="col-desc">Description</th><th class="col-qty num">Qty</th><th class="col-amt num">Amount</th></tr>
    </thead>
    <tbody>
      <tr><td>Consulting services</td><td class="num">10</td><td class="num">$1,500.00</td></tr>
      <tr><td>Hosting (annual)</td><td class="num">1</td><td class="num">$600.00</td></tr>
      <tr><td>Support plan</td><td class="num">1</td><td class="num">$300.00</td></tr>
    </tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td class="num">$2,400.00</td></tr>
    <tr><td>Tax (10%)</td><td class="num">$240.00</td></tr>
    <tr class="grand"><td>Total</td><td class="num">$2,640.00</td></tr>
  </table>
</body>
</html>
```

---

## 3. Report with running header & footer + page numbers

Use the programmatic `PdfHeaderFooter` for a 3-column band with a logo, title, and page
numbers via `counter(page)` / `counter(pages)`.

```csharp
var options = new PdfRenderOptions
{
    PageSize    = PdfPageSize.A4,
    Orientation = PdfOrientation.Portrait,
    Margins     = PdfMargins.Uniform(15),
    Header = new PdfHeaderFooter(
        LeftHtml:   "<img src=\"data:image/png;base64,iVBORw0K...\" style=\"width:64px;height:38px;\" />",
        CenterHtml: "<b style=\"color:#0c6b6b;\">Quarterly Report</b>",
        RightHtml:  "Page counter(page)/counter(pages)",
        HeightMm:   20,
        ShowLine:   true),
    Footer = new PdfHeaderFooter(
        CenterHtml: "Confidential — counter(page)/counter(pages)",
        HeightMm:   12,
        ShowLine:   true),
    TemplateId = "quarterly-report",
};

await pdf.RenderAsync(reportHtml, output, options);
```

> Only `counter(page)` / `counter(pages)` are recognized as page tokens. wkhtmltopdf-style
> `[page]` / `[topage]` are **not** supported.

### Pure-CSS alternative (`@page` margin boxes)

If you'd rather keep header/footer in the template, use `@page` margin boxes — no API call:

```html
<style>
  @page {
    size: A4;
    margin: 20mm 15mm;
    @top-center    { content: "Quarterly Report"; }
    @bottom-center { content: "Page " counter(page) " of " counter(pages); }
  }
</style>
```

A programmatic `Header`/`Footer` overrides the matching `@page` band (API wins per band).

---

## 4. Watermark & gradient header band

A diagonal watermark via `transform: rotate(...)` and a graded header band via
`linear-gradient` (rendered as a PDF axial shading). A soft `radial-gradient` vignette also works.

```html
<style>
  .watermark {
    position: absolute; top: 320pt; left: 120pt;
    font-size: 64pt; color: #d0d0d0;
    transform: rotate(-35deg);   /* pivots about box center */
  }
  .banner {
    height: 60px; color: #fff; padding: 16px;
    background: linear-gradient(90deg, #0c6b6b 0%, #13a89e 100%);
  }
  .vignette {
    background: radial-gradient(ellipse at center, #ffffff 0%, #eef3f3 100%);
    padding: 24px;
  }
</style>

<div class="banner"><h1>Certificate of Completion</h1></div>
<div class="vignette">
  <div class="watermark">DRAFT</div>
  <p>Awarded to …</p>
</div>
```

Supported `transform` functions: `translate`/`scale`/`rotate`/`skew`/`matrix` and chains. Supported
gradients: `linear-gradient` and `radial-gradient` (circle/ellipse). `conic-gradient`/`repeating-*`,
non-center `transform-origin`, and 3D transforms are rejected.

---

## 5. Modern layout — Flexbox (opt-in)

Flexbox renders for real only when **`PdfConfigs:Policy:AllowModernLayout = true`** (see
[Modern layout](./supported-html-css.md#modern-layout)). Enable it once:

```json
{
  "PdfConfigs": {
    "Policy": { "AllowModernLayout": true }
  }
}
```

Then a row of equal-height cards is a few lines instead of a table:

```html
<style>
  .cards { display: flex; flex-direction: row; gap: 12px; align-items: stretch; }
  .card  { flex: 1 1 0; border: 1px solid #ccc; padding: 12px; }
  .card h3 { margin: 0 0 6px; color: #0c6b6b; }
</style>

<div class="cards">
  <div class="card"><h3>Revenue</h3><p>$2.64M</p></div>
  <div class="card"><h3>Orders</h3><p>1,204</p></div>
  <div class="card"><h3>Refunds</h3><p>1.8%</p></div>
</div>
```

Supported: `flex-direction`, `flex-wrap`, `justify-content`, `align-items`, `align-content`,
`gap`/`row-gap`/`column-gap`; item `flex-grow`/`flex-shrink`/`flex-basis`/`order`/`align-self`.

---

## 6. Modern layout — CSS Grid (opt-in)

Also behind `AllowModernLayout`. A responsive product grid using `repeat(auto-fill, minmax(...))`:

```html
<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }
  .tile { border: 1px solid #ddd; padding: 10px; height: 80px; }
</style>

<div class="grid">
  <div class="tile">SKU-001</div>
  <div class="tile">SKU-002</div>
  <div class="tile">SKU-003</div>
  <div class="tile">SKU-004</div>
  <div class="tile">SKU-005</div>
</div>
```

A named-area dashboard layout:

```html
<style>
  .dash {
    display: grid;
    grid-template-columns: 200px 1fr;
    grid-template-rows: auto 1fr;
    grid-template-areas:
      "side header"
      "side main";
    gap: 8px;
  }
  .dash .h    { grid-area: header; background: #0c6b6b; color: #fff; padding: 8px; }
  .dash .side { grid-area: side; border: 1px solid #ccc; padding: 8px; }
  .dash .main { grid-area: main; padding: 8px; }
</style>

<div class="dash">
  <div class="h">Dashboard</div>
  <div class="side">Filters</div>
  <div class="main">Content…</div>
</div>
```

Supported track sizes: `px`/`pt`/`%`/`fr`/`auto`/`minmax()`/`repeat()` incl.
`repeat(auto-fill|auto-fit)`. Sparse `grid-auto-flow` only (`dense` is ignored); subgrid is not
implemented.

---

## 7. Images (data-URI + resolver)

Inline images as data-URIs — no resolver needed. PNG color types supported: RGB, palette, RGBA
(composited onto white), **grayscale**, and **grayscale+alpha**; plus JPEG.

```html
<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..." style="width:120px;height:60px;" />
```

To load images from blob storage or a URL, register an `IResourceResolver` **before** `AddPdf`:

```csharp
public sealed class BlobResourceResolver(IBlobStore store) : IResourceResolver
{
    public async Task<ResourceResult?> ResolveAsync(Uri uri, string? hint, CancellationToken ct)
    {
        byte[]? bytes = await store.TryGetAsync(uri.ToString(), ct);
        return bytes is null ? null : new ResourceResult(bytes, hint ?? "image/png");
    }
}

builder.Services.AddSingleton<IResourceResolver, BlobResourceResolver>();
builder.Services.AddPdf(builder.Configuration);
```

Then reference images by URL: `<img src="https://cdn.example/logo.png" />`. 16-bit and sub-8-bit
grayscale PNG are rejected at decode (`PNG-16BIT` / `PNG-GRAYSCALE-DEPTH`) — convert to 8-bit.

---

## 8. Multi-page document

`RenderMultiPageAsync` renders several HTML fragments into one PDF; each fragment starts on a new
page (page counters continue across the whole document).

```csharp
var pages = new[]
{
    "<h1>Cover</h1><p>Annual Report 2026</p>",
    "<h2>Financials</h2><table>…</table>",
    "<h2>Appendix</h2><p>…</p>",
};

await pdf.RenderMultiPageAsync(pages, output, new PdfRenderOptions
{
    Footer = new PdfHeaderFooter(
        CenterHtml: "counter(page)/counter(pages)", HeightMm: 10, ShowLine: false),
});
```

To force a page break **within** one HTML document instead, use CSS:

```html
<div style="page-break-before: always;">…next section…</div>
```

---

## 9. Handling policy rejections

When a template uses a feature outside the subset, the engine throws `PdfPolicyException` **before**
rendering — each violation names the rule, selector, rejected value, and a suggested fix.

```csharp
try
{
    await pdf.RenderAsync(html, output, options);
}
catch (PdfPolicyException ex)
{
    foreach (var v in ex.Violations)
        logger.LogWarning("PDF policy: {Rule} on {Selector}: {Value} → {Fix}",
            v.RuleId, v.CssSelector, v.RejectedValue, v.SuggestedAlternative);
    throw;
}
```

During migration, set `PdfConfigs:Policy:SoftDegradeUnknownDisplay = true` to downgrade
`display:flex/grid` to block (warnings instead of errors), or `AllowModernLayout = true` to render
them for real.

---

## See also

- [PDF Engine Guide](./pdf-engine-guide.md) — API, options, configuration.
- [Supported HTML / CSS / JS](./supported-html-css.md) — the full subset reference.
- [PDF Engine vs DinkToPdf](./pdf-vs-dinktopdf.md) — when to pick which.
