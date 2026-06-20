---
title: Supported HTML / CSS / JS
sidebar_position: 2
---

# Supported HTML / CSS / JS

The Muonroi PDF engine renders a **bounded, print-safe subset** of HTML and CSS 2.1. It is a layout
engine for documents — not a browser. The default policy profile is **`legacy-print-v1`**
(`LegacyPrintPolicy`): anything outside the subset is **rejected loudly** (`PdfPolicyException`) so a
template never renders subtly wrong.

Write templates against this reference and they render deterministically on every OS.

> **JavaScript is not executed.** There is no DOM scripting, no `onload`, no dynamic content. A
> `<script>` element is a **hard policy rejection** (see below). Compute all content server-side and
> emit static HTML.

---

## Supported HTML elements

| Category | Elements | Notes |
|----------|----------|-------|
| Document | `html`, `head`, `body`, `style`, `title` | One inline `<style>` (or `UserStyleSheet`) per document. |
| Block | `div`, `p`, `h1`–`h6`, `section`, `article`, `header`, `footer`, `ul`, `ol`, `li` | Unknown block-level tags default to `display:block`. |
| Inline | `span`, `strong`, `b`, `em`, `i`, `a`, `br` | `<strong>`/`<b>` bold and `<em>`/`<i>` italic via UA defaults. |
| Table | `table`, `thead`, `tbody`, `tfoot`, `tr`, `td`, `th` | `border-collapse`, `colspan`, fixed/auto layout, per-cell borders. `<th>` is bold + center by UA default. |
| Replaced | `img` | `src` must be a **data-URI** or resolvable via `IResourceResolver`. PNG/JPEG decoded in pure managed code. |
| Rule | `hr` | Rendered as a filled rule; honors `height`/`color`/`background-color`. |
| Links | `a[href]` | `http`, `https`, `mailto` only → emitted as PDF link annotations. |

UA defaults applied: `h1`–`h6` and `th` are **bold**; `th` text is **centered**; legacy IE `body`
margin attributes (`leftmargin`, `topmargin`, …) are honored when CSS hasn't set a margin.

---

## Supported CSS

### Box model & sizing
- `margin`, `margin-top/right/bottom/left`
- `padding`, `padding-*`
- `border`, `border-*-width`, `border-*` (per-side color/style), `border-collapse: collapse`
- `width`, `height`, `min-width`, `max-width`
- Units: `px`, `pt`, `mm`, `cm`, `em`, `rem`, `%`

### Text & fonts
- `font-family` (bundled: `Times New Roman`/`serif`, `Arial`/`sans-serif`, `Courier New`/`monospace`; plus `@font-face`)
- `font-size`, `font-weight` (`bold` / ≥700), `font-style: italic`
- `color`
- `line-height`
- `text-align` (`left` / `right` / `center`)
- `text-transform: uppercase`
- `text-decoration` (`underline` / `line-through`)
- `white-space` (`nowrap` / `pre-wrap` / `pre-line`)
- `word-break` / `overflow-wrap` (`break-word` / `break-all`)
- Full Unicode incl. Vietnamese diacritics (font subsetting embeds only used glyphs).

### Backgrounds
- `background-color` (solid fill — painted behind any box)
- `background-image: url(data:...)` (data-URI only)
- `background` shorthand resolves to a solid color.

### Layout & flow
- `display`: `block`, `inline`, `inline-block`, `flow-root`, `list-item`, `table*`
- `float: left | right`, `clear: left | right | both`
- `position: absolute | relative` (CSS 2.1 print positioning)
- `vertical-align` (notably `top` for table cells)

### Paged media
- `@page { size: A4|A5|...; margin: ... }` — page size + margins from CSS (options override CSS).
- `page-break-before` / `page-break-after` / `page-break-inside: avoid`
- `counter(page)` / `counter(pages)` — page numbering (resolved via a two-pass layout).
- `@font-face` (data-URI `src`) — subset & embedded.

---

## NOT supported — rejected by policy

These raise `PdfPolicyException` under `legacy-print-v1` (with a suggested alternative in each
violation):

| Feature | Why / Alternative |
|---------|-------------------|
| `display: flex` / `inline-flex` | Use `display:block` / `float` / tables. (Soft-degrade can downgrade to block — see below.) |
| `display: grid` / `inline-grid` | Use `display:table`. |
| Flex/grid sub-properties (`gap`, `justify-content`, `grid-template-*`, …) | Dropped; only meaningful with flex/grid. |
| `position: fixed` / `sticky` | Use `position:absolute` or a running header/footer. |
| `transform` (geometric) | Not renderable. |
| `background: linear-gradient(...)` / any gradient | Use a solid `background-color`. |
| `@keyframes` / `animation` / `transition` | Static documents only. |
| External `@import url(http...)` | Inline the stylesheet. |
| `<script>` element | **Forbidden.** Render content server-side. |
| `<a href>` with `javascript:` / `file:` / other schemes | Only `http` / `https` / `mailto`. |

### Soft-degrade mode

Set `PdfConfigs:Policy:SoftDegradeUnknownDisplay = true` to turn `display:flex/grid` from a hard
error into a **warning** — the element renders as `display:block` and rendering proceeds. Useful for
migrating legacy templates incrementally. Default is strict (fail-loud). All other forbidden features
remain hard errors regardless.

---

## Authoring checklist for developers

- ✅ Compute everything server-side; emit **static** HTML. No JS.
- ✅ Use **tables** and **floats** for layout, not flexbox/grid.
- ✅ Inline images as **data-URIs**, or wire an `IResourceResolver`.
- ✅ Use `%` widths for columns so layout adapts to page size; `table-layout: fixed` for predictable tables.
- ✅ Page numbers via `counter(page)` / `counter(pages)`, in the body or in a running header/footer.
- ✅ Control page breaks with `page-break-inside: avoid` on rows/blocks that must not split.
- ✅ Solid `background-color` for shading (e.g. a colored table header band) — gradients are rejected.
- ⛔ No `display:flex` / `grid`, `position:fixed/sticky`, `transform`, gradients, animations, `<script>`.

See the [PDF Engine Guide](./pdf-engine-guide.md) for the API and a worked example, and
[vs DinkToPdf](./pdf-vs-dinktopdf.md) for what differs from a wkhtmltopdf-based pipeline.
