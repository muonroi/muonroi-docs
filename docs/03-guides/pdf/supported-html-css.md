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
| Replaced | `img` | `src` must be a **data-URI** or resolvable via `IResourceResolver`. PNG/JPEG decoded in pure managed code (see [Images](#images) for supported PNG color types). |
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
- `background-image: linear-gradient(...)` / `background: linear-gradient(...)` — rendered as a PDF
  axial shading (ShadingType 2). Supports an angle (`Ndeg`/`to <side>`) and two or more color stops
  with optional `%` positions.
- `background-image: radial-gradient(...)` / `background: radial-gradient(...)` — rendered as a PDF
  radial shading (ShadingType 3). Supports `circle` and `ellipse` (ellipse is the CSS default),
  `at <keyword>` positions (`center`/`top`/`left`/…), and two or more color stops. Extent defaults to
  `farthest-corner`; explicit sizes and the `closest-*`/`farthest-side` extent keywords are not yet
  supported. `conic-gradient` and `repeating-*` gradients are **not** supported.
- `background` shorthand resolves to a solid color (or a linear-/radial-gradient, per above).

### Layout & flow
- `display`: `block`, `inline`, `inline-block`, `flow-root`, `list-item`, `table*`
- `display`: `flex` / `inline-flex` / `grid` / `inline-grid` — **opt-in** behind
  `PdfConfigs:Policy:AllowModernLayout = true`. See [Modern layout (opt-in)](#modern-layout)
  below. With the flag off (default) these still soft-degrade / reject as documented in
  [NOT supported](#not-supported--rejected-by-policy).
- `float: left | right`, `clear: left | right | both`
- `position: absolute | relative` (CSS 2.1 print positioning)
- `vertical-align` (notably `top` for table cells)
- `transform` — the full CSS 2D affine set: `translate`/`translateX`/`translateY`,
  `scale`/`scaleX`/`scaleY`, `rotate`, `skew`/`skewX`/`skewY`, `matrix(a,b,c,d,e,f)`, and
  multi-function chains (e.g. `translate(..) rotate(..) scale(..)`). All functions compose
  left-to-right into a single CTM and transform the block and its text about the block center
  (the CSS default `transform-origin: 50% 50%`; non-center `transform-origin` is not yet supported).
  Unknown transform functions (e.g. `perspective()`) are rejected.

### Paged media
- `@page { size: A4|A5|...; margin: ... }` — page size + margins from CSS (options override CSS).
- `@page` margin boxes — `@top-left/@top-center/@top-right` and `@bottom-left/@bottom-center/@bottom-right`
  declare a pure-CSS running header/footer. `content:` may mix string literals with
  `counter(page)`/`counter(pages)`. A programmatic `options.Header`/`Footer` overrides the matching
  band (API wins per band).
- `page-break-before` / `page-break-after` / `page-break-inside: avoid`
- `counter(page)` / `counter(pages)` — page numbering (resolved via a two-pass layout).
- `@font-face` (data-URI `src`) — subset & embedded.

---

## Images

Images are decoded in pure managed code — no native image library. `<img src>` and
`background-image: url(...)` accept the same set.

**JPEG:** baseline + progressive, decoded to RGB.

**PNG (8-bit samples):**

| PNG color type | Support |
|----------------|---------|
| RGB (`color_type=2`) | ✅ |
| Palette / indexed (`color_type=3`) | ✅ |
| RGBA (`color_type=6`) | ✅ — alpha composited onto white |
| Grayscale (`color_type=0`) | ✅ — expands to `R=G=B` |
| Grayscale + alpha (`color_type=4`) | ✅ — composited onto white |

**Rejected at decode** (raise `PdfFormatException` with a clear code):

- 16-bit PNG (`bit_depth=16`, any color type) — `PNG-16BIT`. Convert to 8-bit.
- Sub-8-bit grayscale PNG (`bit_depth` 1/2/4) — `PNG-GRAYSCALE-DEPTH`. Convert to 8-bit.
- `GIF` / `WebP` / `SVG` / `BMP` / `TIFF` — no decoder in v1.

---

## Modern layout (opt-in: flex / grid) {#modern-layout}

By default the engine renders the CSS 2.1 print subset and **rejects** `display:flex/grid`
(fail-loud). Set **`PdfConfigs:Policy:AllowModernLayout = true`** to enable real Flexbox **and** CSS
Grid layout engines (pure-managed, deterministic, golden-tested). The flag is off by default so
existing templates keep byte-identical output; turning it on is a deliberate per-deployment choice.

> When `AllowModernLayout` is **off**, `display:flex/grid` is a hard `PdfPolicyException` (or a
> block soft-degrade if `SoftDegradeUnknownDisplay = true`). The two flags are independent —
> `AllowModernLayout` renders flex/grid for real; `SoftDegradeUnknownDisplay` downgrades them to
> block. If both are set, `AllowModernLayout` wins (flex/grid render).

### Flexbox (`display: flex` / `inline-flex`)

Container properties: `flex-direction` (`row` / `row-reverse` / `column` / `column-reverse`),
`flex-wrap` (`nowrap` / `wrap` / `wrap-reverse`), `justify-content` (`flex-start` / `flex-end` /
`center` / `space-between` / `space-around` / `space-evenly`), `align-items` and `align-content`
(`flex-start` / `flex-end` / `center` / `stretch` / `baseline`), and `gap` / `row-gap` /
`column-gap`.

Item properties (on any child): `flex-grow`, `flex-shrink`, `flex-basis`, `order`, `align-self`.

### CSS Grid (`display: grid` / `inline-grid`)

Container properties: `grid-template-columns` / `grid-template-rows` with track sizes in `px` / `pt`
/ `%` / `fr` / `auto` / `minmax(min, max)` / `repeat(n, …)` — **including `repeat(auto-fill, …)` and
`repeat(auto-fit, …)`** (track count resolved from the definite axis size; `auto-fit` collapses empty
tracks). Plus `grid-auto-columns` / `grid-auto-rows`, `grid-auto-flow` (`row` / `column`; **sparse
only** — a trailing `dense` is ignored), `grid-template-areas`, `gap` / `row-gap` / `column-gap`,
`justify-items` / `align-items` and `justify-content` / `align-content` (`start` / `end` / `center`
/ `stretch` / `space-*`).

Item placement (on any child): `grid-column` / `grid-row` (and the `*-start` / `*-end` longhands),
`grid-area` (named area or line numbers), `justify-self`, `align-self`.

**Not implemented under the flag:** `dense` auto-flow packing, subgrid, `closest-*` / `farthest-side`
content-distribution edge cases. These degrade gracefully (sparse placement / default sizing) rather
than throwing.

---

## NOT supported — rejected by policy

These raise `PdfPolicyException` under `legacy-print-v1` (with a suggested alternative in each
violation):

| Feature | Why / Alternative |
|---------|-------------------|
| `display: flex` / `inline-flex` / `grid` / `inline-grid` | **Rejected by default.** Opt in with `AllowModernLayout` to render them for real (see [Modern layout](#modern-layout)), or use `display:block` / `float` / tables. (Soft-degrade can downgrade to block — see below.) |
| Flex/grid sub-properties (`gap`, `justify-content`, `grid-template-*`, …) | Dropped unless `AllowModernLayout` is on; only meaningful with flex/grid. |
| `position: fixed` / `sticky` | Use `position:absolute` or a running header/footer. |
| `transform-origin` (non-center) / `perspective()` & 3D transforms | Transforms pivot about the box center only; 2D affine functions (translate/scale/rotate/skew/matrix + chains) **are** supported. |
| `conic-gradient` / `repeating-*` gradients | Use `linear-gradient(...)` or `radial-gradient(...)` (both supported) or a solid `background-color`. |
| `filter` / `backdrop-filter` / `clip-path` / `mix-blend-mode` | No managed renderer for visual filters/clipping/blending. Pre-render the effect into an image. Under the strict profile these **fail loud**; under the default `legacy-print-v1` they are silently ignored (not painted). |
| `@keyframes` / `animation` / `transition` | Static documents only. |
| External `@import url(http...)` | Inline the stylesheet. |
| `<script>` element | **Forbidden.** Render content server-side. |
| `<a href>` with `javascript:` / `file:` / other schemes | Only `http` / `https` / `mailto`. |

### Soft-degrade mode

Set `PdfConfigs:Policy:SoftDegradeUnknownDisplay = true` to turn `display:flex/grid` from a hard
error into a **warning** — the element renders as `display:block` and rendering proceeds. Useful for
migrating legacy templates incrementally. Default is strict (fail-loud). All other forbidden features
remain hard errors regardless.

To instead render flex/grid **for real** (not downgrade to block), use
[`AllowModernLayout`](#modern-layout). The two flags are independent;
`AllowModernLayout` takes precedence when both are set.

---

## Authoring checklist for developers

- ✅ Compute everything server-side; emit **static** HTML. No JS.
- ✅ Use **tables** and **floats** for layout, not flexbox/grid.
- ✅ Inline images as **data-URIs**, or wire an `IResourceResolver`.
- ✅ Use `%` widths for columns so layout adapts to page size; `table-layout: fixed` for predictable tables.
- ✅ Page numbers via `counter(page)` / `counter(pages)`, in the body or in a running header/footer.
- ✅ Control page breaks with `page-break-inside: avoid` on rows/blocks that must not split.
- ✅ Solid `background-color`, `linear-gradient(...)` or `radial-gradient(...)` for shading (e.g. a colored/graded header band or a soft radial vignette).
- ✅ Running header/footer via `options.Header`/`Footer` **or** `@page` margin boxes (`@top-center { content: ... }`).
- ✅ `transform` for watermarks/badges — `rotate()`, `scale()`, `translate()`, `matrix()` and chains (pivot about box center).
- ⛔ No `display:flex` / `grid`, `position:fixed/sticky`, non-center `transform-origin`/3D transforms, `conic-gradient`/`repeating-*` gradients, animations, `<script>`.

See the [PDF Engine Guide](./pdf-engine-guide.md) for the API and a worked example, and
[vs DinkToPdf](./pdf-vs-dinktopdf.md) for what differs from a wkhtmltopdf-based pipeline.
