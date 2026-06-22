---
title: PDF Engine vs DinkToPdf
sidebar_position: 3
---

# Muonroi PDF Engine vs DinkToPdf

[DinkToPdf](https://github.com/rdvojmoc/DinkToPdf) is a .NET wrapper around **libwkhtmltox**
(wkhtmltopdf / WebKit). It renders almost any HTML a 2016-era WebKit could — including flexbox,
grid, and JavaScript — but at the cost of a **native binary dependency**, a **single-threaded
converter bottleneck**, and a now-**unmaintained** rendering core.

Muonroi.Pdf takes the opposite trade: a **pure-managed**, deterministic, policy-enforced engine over
a [bounded HTML/CSS subset](./supported-html-css.md). This page is an honest comparison so you can
pick the right tool.

---

## TL;DR

- Choose **Muonroi.Pdf** for server-generated business documents (invoices, reports, shipping forms,
  contracts): no native deps, deterministic output, thread-safe, sandboxed, AOT-friendly,
  tenant-aware. This covers the large majority of back-office PDF needs.
- Choose **DinkToPdf / a browser engine** when templates genuinely require **JavaScript execution**
  or arbitrary modern-CSS fidelity (CSS filters, blend modes, animations) you cannot rewrite into the
  print subset. Note Muonroi.Pdf now renders **Flexbox and CSS Grid** for real behind the opt-in
  `AllowModernLayout` flag, so modern layout alone is no longer a reason to reach for a browser engine.

---

## Feature comparison

| Capability | Muonroi.Pdf | DinkToPdf (wkhtmltopdf) |
|------------|-------------|-------------------------|
| Runtime dependency | **Pure managed** — no native lib | `libwkhtmltox` native binary per OS/arch |
| Deployment | Any OS, container, AOT-friendly, no glibc/musl trap | Must ship & match the native lib; common Linux/Alpine pitfalls |
| Thread-safety | **Singleton-safe, concurrent** | Converter is **not** thread-safe — must serialize through one synchronized queue |
| Outbound network | **Never** (resolvers are explicit, opt-in) | Can fetch remote assets by default |
| Security posture | CSS subset **policy gate**, input limits, no `<script>`, scheme allow-list | Full WebKit incl. JS — larger attack surface |
| Determinism | **Byte-deterministic** (golden-tested) | Varies with native lib version |
| Page size / orientation | A4, A5, A3, Letter, Legal · Portrait/Landscape | Yes |
| Margins | mm, per-side, `@page` | Yes |
| Running header/footer | **Full-HTML, 3-column, images, `HeightMm`, `ShowLine`** | Full-HTML header/footer (separate HTML) |
| Page numbering | `counter(page)` / `counter(pages)` | `[page]`/`[topage]` tokens + JS |
| Tables, floats, absolute pos | Yes | Yes |
| `background-color` / images / `@font-face` | Yes (data-URI + resolver, glyph subsetting) | Yes |
| Vietnamese / full Unicode | Yes (subset-embedded) | Yes |
| `@page` margin boxes (`@top-center { content }`) | ✅ pure-CSS running header/footer | ✅ |
| `background: linear-gradient(...)` / `radial-gradient(...)` | ✅ (PDF axial + radial shading) | ✅ |
| `transform` (translate/scale/rotate/skew/matrix + chains) | ✅ (composed to one CTM, box-center pivot) | ✅ |
| **Flexbox / CSS Grid** | ✅ opt-in (`AllowModernLayout`) — real layout engines; off by default → reject/soft-degrade | ✅ |
| **JavaScript execution** | ❌ (not executed; `<script>` rejected) | ✅ (with `javascript-delay`) |
| **conic gradients, non-center `transform-origin`/3D transforms, animations** | ❌ | ✅ |
| Multi-tenant cache isolation | ✅ built-in | n/a |
| Maintenance status | **Active** | wkhtmltopdf core **archived/unmaintained** |

---

## Speed

Pure-managed rendering means **no process spawn and no native-library load** on the hot path. Render
cost is CPU-bound and predictable; there is no inter-process or WebKit warm-up tax per call.

Measured on a developer machine for the **~50 KB reference template** (`PerfGateTests`):

| Render | Measured | Engine gate ceiling | Dev-machine goal |
|--------|----------|---------------------|------------------|
| **Cold** (first call, incl. JIT warm-up) | **≈ 548 ms** | ≤ 1500 ms | ≤ 300 ms |
| **Warm** (steady-state, best of 5) | **≈ 127 ms** | ≤ 400 ms | ≤ 80 ms |

> Numbers are informational and hardware/template dependent — reproduce locally with
> `dotnet test --filter PerfGateTests` (look for the `[PERF]` lines).

**How this compares to DinkToPdf structurally** (rather than a single synthetic number):

- **No native init tax.** DinkToPdf loads `libwkhtmltox` once; first use pays that load. Muonroi.Pdf
  pays only .NET JIT on the cold path (then warm renders are pure CPU).
- **Throughput / concurrency is the real differentiator.** DinkToPdf's converter is single-threaded —
  concurrent requests **serialize** through one synchronized converter, so throughput is capped by
  one core regardless of how many you have. Muonroi.Pdf is singleton-safe and renders concurrently,
  so it scales across cores. For a busy report service this usually matters more than per-document ms.
- **Deterministic latency.** No WebKit layout/JS variance → stable p99, which suits SLA-bound APIs.

If you need an exact per-document benchmark for your workload, render your real template through both
and measure; the structural points above explain *why* the managed engine tends to win on server
throughput even when single-document latency is comparable.

---

## Remaining gaps (Muonroi.Pdf vs DinkToPdf)

Honest list of what DinkToPdf/WebKit still does that the managed engine does not:

1. **No JavaScript.** Dynamic templates, client-side charting libraries, or `onload` hooks won't run.
   *Mitigation:* render data and charts (as images/SVG-less data-URI PNGs) server-side.
2. **Flexbox / CSS grid are opt-in.** They render for real only when
   `PdfConfigs:Policy:AllowModernLayout = true`; with the flag off (default) modern layout must be
   expressed with tables/floats. *Mitigation:* enable `AllowModernLayout` for full flex/grid, or use
   soft-degrade mode (downgrades flex/grid to block) during migration. The
   [PDF Template Designer](../ui-engine/pdf-template-designer.md) lints templates against the profile.
3. **Limited CSS effects; no filters/animations.** The full 2D affine `transform` set
   (translate/scale/rotate/skew/matrix + chains) and both `linear-gradient` and `radial-gradient`
   **are** supported; `conic-gradient`/`repeating-*` gradients, non-center `transform-origin`, 3D
   transforms, CSS filters, and animations are not. Use solid fills and pre-rendered images for the rest.
4. **CSS subset, not full CSS 2.1/3.** Exotic selectors and properties outside
   [the supported list](./supported-html-css.md) are ignored or rejected.

> **Closed in Phase 14:** `@page` margin boxes (`@top-center { content: ... }`) now drive a pure-CSS
> running header/footer; `background: linear-gradient(...)` renders as a PDF axial shading; and
> `transform: rotate()` renders a diagonal watermark.
>
> **Closed in Phase 15:** `transform` now covers the full 2D affine set (translate/scale/rotate/skew/
> matrix + multi-function chains, composed to one CTM); `background: radial-gradient(...)` renders as
> a PDF radial shading (ShadingType 3, circle + ellipse). `conic-gradient`/`repeating-*`, non-center
> `transform-origin`, and 3D transforms remain unsupported.
>
> **Closed in Phase 18/19 (opt-in `AllowModernLayout`):** real **Flexbox** (`flex-direction`, `wrap`,
> `justify-content`/`align-*`, `gap`, item `flex-grow`/`shrink`/`basis`/`order`) and **CSS Grid**
> (`grid-template-*` with `fr`/`minmax`/`repeat(auto-fill|auto-fit)`, named areas, sparse auto-flow,
> `gap`, item placement) layout engines — pure-managed and golden-tested. Off by default; `dense`
> grid packing and subgrid remain unimplemented.

For server-generated business documents these gaps are rarely blocking, and you gain no native
dependency, deterministic output, thread-safe concurrency, a security policy gate, and an actively
maintained engine.

---

## See also

- [PDF Engine Guide](./pdf-engine-guide.md)
- [Supported HTML / CSS / JS](./supported-html-css.md)
- [PDF Template Designer](../ui-engine/pdf-template-designer.md)
