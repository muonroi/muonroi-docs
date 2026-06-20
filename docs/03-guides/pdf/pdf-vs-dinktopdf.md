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
- Choose **DinkToPdf / a browser engine** when templates genuinely require **JavaScript execution**,
  **flexbox/grid layout**, or arbitrary modern-CSS fidelity you cannot rewrite into the print subset.

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
| `background: linear-gradient(...)` | ✅ (PDF axial shading) | ✅ |
| `transform: rotate()` (watermark) | ✅ (single `rotate()` only) | ✅ |
| **Flexbox / CSS Grid** | ❌ (rejected; soft-degrade → block) | ✅ |
| **JavaScript execution** | ❌ (not executed; `<script>` rejected) | ✅ (with `javascript-delay`) |
| **radial/conic gradients, non-rotate transforms, animations** | ❌ | ✅ |
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
2. **No flexbox / CSS grid.** Modern layout must be expressed with tables/floats.
   *Mitigation:* the [PDF Template Designer](../ui-engine/pdf-template-designer.md) lints templates
   against the print profile; soft-degrade mode downgrades flex/grid to block during migration.
3. **Limited CSS transforms/gradients; no filters/animations.** `transform:rotate()` and
   `linear-gradient` **are** supported; `translate`/`scale`/`matrix`/`skew`, `radial`/`conic`
   gradients, CSS filters, and animations are not. Use solid fills and pre-rendered images for the rest.
4. **CSS subset, not full CSS 2.1/3.** Exotic selectors and properties outside
   [the supported list](./supported-html-css.md) are ignored or rejected.

> **Closed in Phase 14:** `@page` margin boxes (`@top-center { content: ... }`) now drive a pure-CSS
> running header/footer; `background: linear-gradient(...)` renders as a PDF axial shading; and
> `transform: rotate()` renders a diagonal watermark.

For server-generated business documents these gaps are rarely blocking, and you gain no native
dependency, deterministic output, thread-safe concurrency, a security policy gate, and an actively
maintained engine.

---

## See also

- [PDF Engine Guide](./pdf-engine-guide.md)
- [Supported HTML / CSS / JS](./supported-html-css.md)
- [PDF Template Designer](../ui-engine/pdf-template-designer.md)
