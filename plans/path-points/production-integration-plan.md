# Production integration plan for GPU MSDF paths and fonts

Status: PoC feasibility accepted; production architecture proposed

## Summary

Graduate the successful PathPoint and TrueType experiments into shared
`@genome-spy/webgpu-renderer` infrastructure without making the temporary
`PathPoint` mark public. Keep a minimal analytic point shader only for a fixed
regular circle. Let the existing point mark accept shape values that are either
predefined names or SVG path strings, resolving every non-fast-path shape to a
path and compiling the finite set internally. Replace the legacy
A-Frame bitmap-font implementation inside `webgpu-renderer` behind the existing
logical-string text contract with renderer-cached TrueType outlines and
GPU-generated MSDF glyphs. Core temporarily retains its BMFont metrics for
measurement and layout.
Ship only the compact `Default Font` with the renderer. Let Core's temporary
WebGPU integration catalog and application-supplied catalogs map other font
variants to TTF URLs.

The renderer will own a reusable MSDF generation service and device-lifetime
atlas caches. Shape strings remain ordinary mark values and are compiled into
an internal finite table; device-neutral font resources remain usable by more
than one renderer. Custom-shape atlases are immutable and generated in one
batch. Font atlases are populated from the glyphs actually used and grow
without CPU bitmap work or GPU readback.

The canonical msdfgen WASM backend remains an isolated development oracle.
Before this branch is merged, move its pinned C++ sources and build tooling
under `tools/`, move its generated loader and comparison adapter under
package-excluded test tooling, and delete every production import and runtime
comparison toggle. Required attribution for code actually adapted from
msdfgen remains beside that code and in the applicable third-party notices.

## Feasibility decision and accepted residuals

The proof of concept is good enough to proceed:

- custom closed SVG paths render with fill, variable centered stroke, rotation,
  picking, holes under the provisional even-odd rule, and sharp miter-like
  offset contours;
- static TrueType `glyf` outlines, metrics, composite glyphs, GPOS pair
  adjustment, and legacy `kern` fallback render through the same atlas path;
- warm generation of the 16-symbol fixture takes roughly 4-5 ms locally,
  compared with roughly 103-104 ms for canonical WASM at matching dimensions;
- five million atlas-backed square points remain about 20-22% slower than the
  analytic shader, which supports retaining a minimal analytic circle path for
  the common fixed-shape scatter plot; and
- `rgba16float` output visibly improves smoothness over eight-bit output.

The following visual differences are accepted prototype debt rather than
feasibility blockers:

- some small convex 90-degree corners look slightly rounder or flatter than
  the canonical WASM result;
- acute star tips can show isolated subpixel stroke blemishes at particular
  rotations and stroke widths;
- atlas-sampled circles are not quite as smooth as analytic circles; and
- the iterative `f32` quadratic solver and lightweight correction do not match
  canonical msdfgen for every degenerate or difficult outline.

The apparent flattening of the rotated diamond is not quad clipping. A focused
GPU test measures visible coverage more than 0.75 CSS pixels inside the
path-specific expanded quad at a non-symmetric rotation. The star/triangle
matrix rejects deep white seams, detached spikes, and connected coverage loss.
Do not resume visual tuning unless a production consumer fails these bounded
quality criteria.

## Goals

- Make one reusable renderer-owned MSDF generator serve custom point symbols
  and glyph atlases.
- Preserve a fast, exact analytic route for a fixed regular circle.
- Accept predefined shape names and SVG path strings through the ordinary
  point-shape contract while compiling a finite resolved table before drawing.
- Replace fixed square tiles with variable rectangles and bounded reusable
  generation scratch space.
- Use `rgba16float` for production MSDF sampling unless cross-device validation
  establishes a material compatibility or memory problem.
- Preserve logical-string text channels, retained updates, placement,
  alignment, range fitting, picking, and renderer-level resource sharing.
- Preserve fragment-shader supersampling for small text so MSDF minification
  does not reintroduce aliasing or unstable thin features.
- Load the small stripped `Default Font` only through the text/font entry path.
- Let callers supply a catalog that maps exact family, weight, and style
  variants to TTF URLs.
- Reuse Core's existing font-request lifecycle to start asynchronous TTF
  preparation only for descriptors used by the actual view tree; never preload
  the whole catalog.
- Keep Core's temporary example-font catalog entirely inside its dynamically
  loaded WebGPU integration; WebGL-only use must not import the catalog or load
  any of its TTF resources.
- Demonstrate the integrated point/text implementation in representative Core
  specifications, not only renderer Storybook scenes and isolated GPU tests.
- Keep parsing, shaping policy, and Core grammar outside GPU resource code.
- Remove experimental runtime switches and WASM imports from production
  bundles after parity gates pass.
- Isolate canonical msdfgen under explicit development tooling before merging:
  it may remain in the repository, but never under production `src/`, package
  exports, normal browser chunks, or the published package.

## Non-goals

- Replacing the fixed regular-circle fast path with an atlas lookup.
- Exact SVG strokes, open contours, caps, dashes, configurable join styles, or
  a geometric miter limit.
- GSUB, complex-script shaping, bidi, per-glyph font fallback, variable-font
  axes, CFF, color glyphs, hinting, WOFF2 decoding, or browser font discovery.
- Operating a mandatory hosted font-resolution service or contacting any
  third-party font provider implicitly.
- Bundling Core's example-only font families with the generic WebGPU renderer.
- Replacing Core's existing BMFont-based measurement, title/legend layout, or
  fallback behavior in the first WebGPU text integration.
- Arbitrary self-intersecting paths or a public promise for the PoC even-odd
  overlap behavior.
- A persistent on-disk or cross-session atlas cache.
- Preloading or parsing every registered catalog font before a visualization
  can be initialized.
- Multiple atlas resolutions or mipmaps before a measured workload shows that
  one normal class plus an exceptional wide-effect class is insufficient.
- Keeping canonical WASM as a production fallback.

## Architecture decisions

### Expose one point-shape value model with a circle fast path

`pointMark` remains the only production point definition:

1. A fixed `"circle"` uses a minimal analytic shader.
2. Every other predefined name resolves to its canonical closed path.
3. A user-supplied valid closed SVG path string is used directly.

From the user's perspective all three are ordinary `shape` values.

The temporary `pathPointMark` and `PathPointProgram` disappear after the MSDF
variant is hosted by the ordinary point definition. Named non-circle shapes
become renderer-owned canonical path definitions rather than separate analytic
distance functions.

The renderer's public semantic type is
`BuiltinPointShape | SvgPathString`. Constant shape values may be strings
directly. Data-driven values are interned once at normalization time into a
finite table and a `u32` series, just as logical text strings are expanded
outside their GPU hot path. Raw strings never enter instance buffers.

Specialize first on whether `shape` is one fixed regular circle. This matches
the main scatter-plot workload, where every point normally has that shape:

- A fixed regular circle uses a minimal analytic shader with no shape buffer,
  atlas allocation, generator pipeline, branch, or texture sample. This is the
  five-million-point fast path and preserves perfect circles.
- Any fixed non-circle name or SVG path uses a one-entry atlas and an MSDF
  shader with no per-instance shape lookup.
- Any variable shape domain resolves names and SVG strings into a finite path
  atlas and indexes it with an interned `u32` value. A variable circle therefore
  uses the path representation too.

No hybrid analytic/MSDF shader or draw partition is needed. The analytic path
exists only when the whole mark has one fixed regular-circle shape.

Before deleting the current analytic named-shape implementations, capture them
as the visual reference for the renderer-owned default SVG paths. Preserve each
shape's orientation, nominal bounds, relative filled area, and response to size,
rotation, and centered stroke approximately; exact per-pixel equality is not
expected because analytic distance fields and atlas-sampled MSDFs antialias
differently. Include the path circle in this comparison because a variable
shape domain uses it even though a fixed circle retains the analytic fast path.

### Split device-neutral inputs from renderer-owned GPU state

Introduce one public immutable font input and one internal compiled shape
representation, with final names reviewed before export:

- `CompiledPointShapes`: an internal representation of a mark's finite interned
  shape table, parsed custom contours, stable codes, bounds, directional miter
  metadata, and deduplicated edge data. Renderer users do not construct it.
- `OutlineFont`: an immutable parsed static TrueType font exposing character to
  glyph mapping, metrics, quadratic contours, and supported pair adjustment.

Shape compilation and font creation from an `ArrayBuffer` are synchronous and
device-neutral. Fetching a remote font remains the caller's asynchronous
responsibility. The same font object can be passed to several renderer
instances; each renderer creates and owns its own GPU atlas. Compiled custom
shape atlases are cached by their canonical ordered path content so equivalent
point configurations can share them without exposing cache handles in the mark
API.

Font caches use exact input-object identity, matching the useful part of the
current BMFont cache contract. Marks borrow cached resources and never destroy
them. `renderer.destroy()` releases all cached atlases, metadata buffers,
generation scratch resources, and pipelines. Device loss remains terminal; a
replacement renderer rebuilds from the device-neutral inputs.

Synchronous byte parsing does not imply catalog preloading. Core continues to
use its existing BMFont entries and metrics for semantic marks, transforms,
titles, axes, legends, and layout during the first integration. A WebGPU-only
preparation cache observes the same normalized descriptor requests, fetches and
parses each requested TTF exactly once, and later supplies the ready
`OutlineFont` to the low-level renderer. The Core measurement entry and the
WebGPU outline resource are deliberately separate transitional resources.

### Extract a bounded `MsdfAtlasGenerator`

Move preprocessing-independent pipeline creation, job submission, and scratch
reuse out of `PathPointProgram` into one renderer-owned service. It accepts
preprocessed line/quadratic edge batches and destination rectangles, then:

1. rasterizes conservative edge regions and atomically retains nearest channel
   distances;
2. applies nearest-edge-gated pseudo-distance reconstruction;
3. computes sign and lightweight interpolation correction; and
4. copies corrected `rgba16float` rectangles into the destination atlas.

Generation stages a bounded batch in reusable scratch buffers and textures;
scratch allocation is proportional to the configured batch surface, not the
full destination atlas. Submissions stay on the renderer queue. Later render
submissions observe completed entries by queue order, with no CPU wait,
readback, or bitmap upload.

The generator owns pipelines and scratch capacity. A symbol/font atlas owns its
final texture, allocator, entry metadata, pending jobs, and cache keys. This
keeps text layout and symbol semantics out of the low-level generator.

### Use separate symbol and glyph atlas policies

Each resolved point-shape table is finite for the lifetime of a mark program.
Compute variable path rectangles from normalized bounds, target shape
resolution, encoded distance range, and directional miter extent; tightly pack
the resolved subset once. Identical paths share an entry. Named non-circle
shapes resolve to canonical paths and consume atlas space like user paths.

Font atlases are renderer-cached per exact `OutlineFont` and quality class.
Layout first resolves the glyph IDs used by the current logical strings, then
adds missing glyph rectangles in batches. Use a fixed atlas width and a
shelf/skyline allocator with power-of-two height growth. Growth allocates a new
texture, copies existing texels at unchanged coordinates, swaps the cached
texture, and invalidates bind groups of marks using that atlas. Metadata
buffers reserve capacity and grow geometrically.

Start with one ordinary text quality/range class. Allocate a separate
wide-effect class only when a requested outline/effect cannot fit the ordinary
distance range. Do not duplicate every glyph pre-emptively for uncommon
stroked text. Symbols and fonts may choose different shape resolutions while
using the same generator.

This follows the proven separation in
[msdf-atlas-gen](https://github.com/Chlumsky/msdf-atlas-gen): glyph geometry is
wrapped for a chosen scale/range, packed independently, and may be added to a
dynamic atlas. No msdf-atlas-gen source is copied.

### Make `rgba16float` the initial production format

Store signed atlas-pixel distances directly in RGB half floats and leave alpha
unused for now. This avoids the visible eight-bit banding confirmed in both the
symbol and text stories. Linear filtering remains the baseline; bicubic
filtering would multiply texture samples in the per-fragment hot path and does
not address missing source resolution.

Before freezing the format, verify filterability and storage/render/copy usage
on the WebGPU adapter matrix. If a required device cannot use the chosen write
path, generate in supported float scratch and copy/convert through a small
render pass. An eight-bit production fallback requires its own measured visual
and compatibility justification.

### Adapt the existing text mark instead of adding `PathText`

Retain the current renderer text program's useful public and GPU-facing model:
one logical string expands to glyph instances that refer back to the string's
channels, placement, and pick ID. Replace `webgpu-renderer`'s `BmFontManager`,
bitmap loading, BMFont metrics, and the legacy SDF decoder behind that model;
this does not replace Core's temporary measurement path.

The new layout layer consumes an `OutlineFont`, requested strings, font size,
line height, and letter spacing. It maps code points, applies the supported
basic pair adjustments, emits glyph IDs and offsets, and requests missing atlas
entries. Existing alignment, baseline, rotation, range fitting, squeeze fade,
series replacement, and string-cardinality validation remain intact.

Add fill/stroke coverage through the shared MSDF decoder. Ordinary un-stroked
text uses the normal atlas class; a nonzero stroke selects a class with adequate
encoded range. Other effects remain deferred. Empty glyphs advance the pen
without atlas allocation.

Preserve the existing text shader's 2 by 2 subpixel supersampling for small
delivered glyphs. Derive the four UV offsets from screen-space UV derivatives,
decode the MSDF independently at each position, evaluate fill and stroke
coverage for each sample, and average premultiplied coverage/color. Do not
average raw RGB channels before the median or collapse all samples to one
distance before applying the nonlinear fill/stroke thresholds.

The switch is based on projected device-pixel glyph size or equivalent atlas
minification, not CSS font size alone. Compute derivatives in uniform control
flow and use explicit-gradient/level sampling where necessary so a flat
per-glyph small-text decision remains valid WGSL. Large glyphs may use one
sample; variable-size or squeezed text must select supersampling whenever its
delivered size crosses the calibrated threshold. Atlas resolution and
supersampling remain complementary: supersampling does not justify an
undersized source atlas.

Each packed glyph entry reserves a sampling gutter outside its mapped distance
rectangle. Extrude the edge texels or otherwise provide a safe value so linear
filtering and the four derivative offsets cannot read a neighboring glyph.
Include this gutter in packing and atlas-growth tests, but not in glyph layout
metrics or the visible quad's nominal bounds.

The stripped Lato derivative is exposed as `Default Font`, with its OFL notice
and reproducible subset script. A tree-shakeable font entry exports its source
and cached lazy loader; requesting it fetches and constructs the `OutlineFont`.
Point-only and non-text bundles must not fetch or embed it. `Default Font` is
not registered under the Lato family name.
The renderer does not own GenomeSpy's example-font catalog or bundle its full
Lato and other example families.

### Separate font loading from font selection

The renderer text mark must not fetch or select a font. Renderer mark creation
remains synchronous and receives a ready `OutlineFont`. Core semantic mark and
transform construction continues to use the existing BMFont entry and does not
require that outline resource to be ready. Selection and loading involve
network policy, CORS, caching, fallback, and error handling. Keep three layers:

1. low-level construction from selected TTF bytes;
2. WebGPU-only asynchronous loading and parsing of one selected URL; and
3. a temporary bridge from Core's existing synchronous BMFont descriptor
   requests to that preparation cache.

The low-level entry exposes explicit async and byte-oriented construction:

```js
import {
  createTrueTypeFont,
  loadTrueTypeFont,
} from "@genome-spy/webgpu-renderer/fonts/truetype";

const lato = await loadTrueTypeFont(
  new URL("./Lato-Regular.ttf", import.meta.url)
);

const privateFont = createTrueTypeFont(authenticatedResponseBytes);
```

`loadTrueTypeFont` is only a convenience around `fetch` plus strict parsing. It
accepts a URL and returns the same immutable resource as
`createTrueTypeFont(ArrayBuffer)`. Family, weight, and style belong to catalog
selection because the exact font file has already been selected when it is
parsed. Intrinsic metadata used for diagnostics is read from the font itself.
After the requested WebGPU font preparation completes, the adapter retrieves
the cached outline and the renderer text mark receives only the resolved
resource:

```js
renderer.createMark(textMark, {
  font: lato,
  channels: { text: { data: labels } },
});
```

At the higher level, Core and applications retain the familiar
`family + weight + style` request. A catalog entry maps one normalized,
supported variant to a TTF URL; registering the catalog performs no fetch:

```js
const studyFonts = [
  {
    family: "Study Sans",
    weight: 400,
    style: "normal",
    source: new URL("./StudySans-Regular.ttf", import.meta.url),
  },
  {
    family: "Study Sans",
    weight: 700,
    style: "normal",
    source: new URL("./StudySans-Bold.ttf", import.meta.url),
  },
];

const fontCatalog = createFontCatalog({ custom: studyFonts });

await embed(container, spec, {
  renderer: "webgpu",
  fontCatalog,
});
```

The final exported construction syntax remains subject to API review, but the
contract is fixed:

- Normalize omitted weight and style to `400` and `"normal"`.
- Match a requested family/weight/style tuple exactly in the first production
  version; do not silently synthesize or relabel a different face.
- Search the application catalog before Core's temporary WebGPU example
  catalog, allowing an application to override a temporary entry deliberately.
- Start loading when Core's existing font manager requests a descriptor used by
  the constructed view tree, not when its catalog entry is registered. Cache
  descriptor resolution, URL loading, and parsing so a canonical source URL
  creates one device-neutral `OutlineFont`; renderer caches then use that
  object's identity.
- Apply the Default Font/Lato chain only when no family was requested. An
  explicitly missing family or variant fails with a diagnostic listing the
  normalized request.
- Require remote catalog URLs to satisfy ordinary browser fetch and CORS rules.
  Authenticated or otherwise custom loading remains possible by fetching bytes
  in application code and calling `createTrueTypeFont` directly.

The catalog abstraction is independent of the text mark and renderer GPU
resources. `@genome-spy/webgpu-renderer` exports the Default Font and low-level
TTF construction/loading APIs; Core owns the temporary example mappings and
combines them with any application catalog.

Core's temporary catalog lives under `packages/core/src/rendering/webgpu/` and
is reachable only from that backend's dynamically imported module. The WebGPU
backend supplies an optional outline-preparation hook/cache alongside Core's
unchanged `BmFontManager`. No shared Core entry point, WebGL module, or
Canvas/SVG-only route may import the catalog.

Follow Core's existing discovery lifecycle instead of scanning the complete
specification up front. Text marks, generated titles/axes/legends, and
`measureText` transforms already request BMFont entries as their real views and
dataflow nodes are constructed or initialized. The optional WebGPU hook uses
those requests to prepare matching TTF resources and participates in the
existing readiness wait so renderer mark creation sees ready outlines. Newly
initialized visible subtrees repeat the same request-then-wait sequence. A
catalog with one hundred entries and a view using one face therefore performs
one TTF load, not one hundred.

Core measurement remains intentionally unchanged in this milestone. It may use
the embedded default BMFont metrics or the existing A-Frame font metrics and
fallback behavior even when WebGPU renders a TTF outline. This preserves
current title, axis, legend, and `measureText` behavior and avoids making exact
cross-renderer metric parity a prerequisite. A later renderer-neutral refactor
may let each backend provide `measureText`, at which point Core can remove
BMFont-specific measurement and intentionally address reflow and fallback
semantics.

The temporary catalog covers every font descriptor exercised under
`examples/`, including descriptors introduced through built-in themes and
title/axis configuration. Its initial explicit families are Lato, Indie Flower,
Lobster, Oswald, Radley, Roboto Condensed, Source Sans Pro, and Teko. The
concrete variant list must cover at least the current examples: Lato regular,
italic, semibold, bold, and black; Oswald regular and bold; Source Sans Pro bold;
Roboto Condensed bold; and regular faces for Indie Flower, Lobster, Radley, and
Teko. Catalog URLs are immutable/version-pinned and fonts load only when a
resolved descriptor is requested.

Default resolution is deliberately asymmetric:

1. With no family (and for Core's `sans-serif` compatibility alias), try the
   renderer-owned `Default Font` with the normalized requested weight/style.
2. If that face has no matching variant, resolve the same weight/style from
   full Lato in Core's WebGPU catalog.
3. With an explicit family, resolve only that family; do not silently replace
   it with Default Font or Lato.

If neither Default Font nor Lato has the requested implicit-family variant, or
an explicit descriptor is absent, fail with the normalized descriptor. Do not
add nearest-weight matching during this temporary integration.

GenomeSpy must not require a Google API key and must not contact Google Fonts
implicitly. Applications can download and self-host TTF files from the Google
Fonts repository, then put their variant URLs in a custom catalog. A catalog
may point at an application-owned CDN or font-resolution service, but that
service is not required or operated implicitly by the renderer. Google's
no-key CSS API usually delivers CSS-selected webfont resources such as WOFF2
rather than providing the stable TTF loading contract required here. A future
no-key integration can use that API only after GenomeSpy supports WOFF2 and
defines its caching, privacy, and dynamic-subset behavior. It is separate from
initial production support.

Sources:

- <https://developers.google.com/fonts/docs/css2>
- <https://github.com/google/fonts>

### Keep provenance boundaries explicit

- The SVG parser retains its Vega Scenegraph BSD-3-Clause provenance and source
  mapping. Vega/Vega-Lite's finite custom SVG-path shape model motivates the
  public symbol behavior.
- The focused TrueType reader remains under `src/vendor/textShaper/` with the
  pinned MIT source mapping and local modifications.
- The edge-coloring adaptation retains nearby msdfgen MIT attribution.
- The sparse GPU architecture cites Chen et al.; the inspected public shader
  repository had no license, so no GLSL is copied or translated.
- Canonical msdfgen C++/WASM remains as a package-excluded development oracle
  with its MIT notices. The edge-coloring adaptation separately keeps its
  durable source link, copyright attribution, and MIT license notice.

## Alternatives considered

### Replace the fixed regular circle with a path

This gives one implementation route but would add atlas sampling to the hottest
scatter-plot case and makes circles slightly rougher. Shared public semantics
do not require the fixed-circle fast path to use the same GPU implementation.

### Keep atlas ownership in each mark program

This is simple for the Storybook fixture but duplicates textures, generation,
and font data across marks. It also makes incremental glyph population and
device-lifetime reuse awkward. The renderer already demonstrates exact-resource
font pooling and is the correct lifetime owner. Point users should still
provide ordinary shape values, not manage the resulting cache object.

### Generate a fixed full-font atlas at startup

This makes lookup simple but delays first text and allocates unused glyphs.
On-demand glyph batches with geometric atlas growth better fit visualization
labels, where the used character set is usually small and knowable from current
strings.

### Replace Core measurement with outline-font metrics immediately

This would give WebGPU rendering and Core layout one exact metric source, but it
would also require changing title, axis, legend, `measureText`, asynchronous
reflow, fallback, and backend ownership at once. The existing A-Frame/BMFont
measurement path is adequate for the incremental WebGPU integration and remains
unchanged. A later renderer-neutral measurement API can replace it deliberately
for all backends.

### Use one fixed square tile per glyph

The PoC uses this to isolate rasterization. It wastes space on narrow glyphs and
forces a large atlas. Per-entry rectangles are established practice in
msdf-atlas-gen and are required before judging production memory.

### Keep WASM as a browser fallback

Canonical output is valuable for tests, but runtime WASM adds synchronous
initialization, CSP concerns, CPU generation, upload cost, and another
production implementation. WebGPU is the target renderer, so unsupported GPU
capabilities should fail explicitly rather than silently selecting WASM.

## Milestone 1: Shared generation and atlas resource layer

Progress (2026-09-02): the first resource-layer slice is implemented. The
renderer now lazily owns one generator, exact immutable path tables share final
textures and entry buffers, scratch grows under a 64 MiB ceiling with
queue-safe retirement, tight shelf packing supports variable rectangles, and
a versioned texture primitive preserves prior texels across geometric growth.
The remaining work in this milestone is multi-batch generation into one final
atlas, incremental allocation on top of the growth primitive, and dependent
bind-group integration beyond the temporary PathPoint consumer.

### Intended outcome

The PoC algorithm runs through renderer-owned reusable pipelines and bounded
scratch resources, while an immutable symbol atlas owns only final storage and
metadata.

### Affected areas and consumers

- `src/symbols/` preprocessing, layout, packing, and GPU generation;
- `src/renderer.js` device-lifetime resource ownership and destruction;
- internal mark-resource bindings and invalidation; and
- Path Points Storybook and GPU comparison tests.

### Work and verification

- Define typed device-neutral edge jobs and renderer-owned atlas handles.
- Add variable rectangle packing and destination offsets.
- Generate batches through bounded scratch and copy to `rgba16float` atlas
  rectangles without readback.
- Share one atlas for two marks with the same canonical custom-path table; keep
  distinct path tables separate.
- Verify geometric growth/copy preserves prior entries and causes exactly the
  required bind-group invalidation.
- Test destruction, repeated creation, failed preprocessing, queue ordering,
  odd texture dimensions, GPU validation, and terminal device loss.
- Benchmark one entry, 16 symbols, and 128 glyph-like entries; record pipeline
  compilation separately from warm generation and report peak scratch/final
  memory.

### Documentation and migration

Update the symbol implementation README with final buffer layouts, allocator,
ownership, and synchronization. Record measured source and browser-bundle
deltas.

Tentative commit: `refactor(webgpu): share gpu msdf atlas generation`

Review gate: inspect GPU hazards, resource ownership, growth invalidation,
packing identity, and cross-device `rgba16float` support before marks consume
the service.

## Milestone 2: Production custom path symbols in `pointMark`

Progress (2026-09-02): the first production point slice is implemented. A
fixed circle selects a stripped analytic shader without a shape series or MSDF
resources. Fixed named shapes, SVG path strings, and finite variable shape
tables select shared `rgba16float` GPU atlases. Core passes fixed paths directly,
interns variable path strings once, and recreates a retained mark only when its
path-table identity changes. The canonical WASM generator is isolated behind
the temporary comparison mark and is excluded from the production point
bundle. The four requested Core example URLs render with WebGPU, including the
mixed named-shape point example. Isolating WASM reduced the measured
point-plus-linear fixture from 273,506 to 187,781 minified bytes and from 92,969
to 52,938 gzip bytes; the remaining delta is the production path parser,
preparation, and WGSL generator. Remaining work includes the exhaustive visual
matrix, benchmark reruns, inward-stroke semantics, and removal of temporary
comparison entry points after the text migration no longer needs them.

### Intended outcome

The existing point mark accepts predefined names and SVG path strings as one
shape-value union. Only a fixed regular circle retains an analytic fast path;
every other case uses resolved paths. The temporary PathPoint mark is removed.

### Affected areas and consumers

- point definition, program variants, public types, and package exports;
- point rendering, picking, culling, placement, and retained updates;
- custom-symbol Storybook examples; and
- later Core WebGPU point translation.

### Work and verification

- Introduce and validate `BuiltinPointShape | SvgPathString` for constant and
  data-backed shape channels, including one-time string interning.
- Compile and cache the finite custom subset internally; do not expose a
  mandatory symbol-resource construction step.
- Move the PathPoint shader variant under the ordinary point program boundary
  and share channel specifications rather than duplicating them.
- Replace the current multi-shape analytic shader with a minimal fixed-circle
  hot path that has no series-backed shape read. Add one-entry fixed-path and
  finite variable-path variants.
- Define size normalization against path bounds and document the finite symbol
  index contract.
- Preserve path-specific stroke/miter expansion and the current raster safety
  until measurements justify reducing it.
- Compare the analytic and path circle at DPR 1 and 2. Validate all other named
  shapes through their canonical path definitions and keep canonical WASM
  comparisons in explicit test tooling only.
- Compare every renderer-owned default path against the current analytic point
  shape before removing the latter. Use representative small and ordinary
  sizes, no stroke and 1-4 pixel strokes, DPR 1 and 2, and nonsymmetric
  rotations such as 17 and 33 degrees. Review bounds, orientation, filled area,
  stroke placement, corner character, and detached/clipped coverage in a
  deterministic side-by-side or screenshot fixture.
- Exercise dynamic channel replacement, scales, selection, placement, clips,
  opacity scopes, detached export targets, and picking.
- Re-run the five-million-point benchmark with one fixed circle to prove the
  important analytic route is unchanged. Measure fixed path and variable-shape
  routes separately.
- Remove production imports of PathPoint and verify fixed-circle marks do not
  allocate an atlas, initialize generator pipelines, or bind MSDF resources.
  Measure the unavoidable `marks/point` browser-bundle delta of synchronous SVG
  path support; font code, Default Font bytes, and WASM must remain excluded.

### Documentation and migration

Document custom path constraints, sizing, fill rule, stroke quality range, and
finite resource construction. Keep the feature renderer-generic.

Tentative commit: `feat(webgpu): render custom path point symbols`

## Milestone 3: Outline-font resources and MSDF text

Progress (2026-09-02): the device-neutral font boundary is implemented as the
first text slice. `createTrueTypeFont` parses one exact static TTF and converts
glyph outlines lazily by Unicode code point while retaining GPOS/legacy pair
adjustments. `loadTrueTypeFont` deduplicates fetch and parsing by exact URL, and
the compact 47,064-byte Default Font has a separate lazy package entry. The
low-level TrueType entry measures 14,207 minified / 4,902 gzip bytes; adding the
Default Font loader measures 14,540 / 5,058 bytes before the separately fetched
font asset. Point bundles remain unchanged and exclude both entries.

The renderer text mark now accepts the same device-neutral `TrueTypeFont`, lays
out logical strings with spaces and basic kerning, interns the required glyph
paths, and obtains a shared `rgba16float` GPU-generated atlas. It preserves the
existing alignment, baseline, ranged-text, replacement, and BMFont routes while
adding centered strokes and 2 by 2 fragment supersampling. The production WGSL
route is also wired into the existing Path Text comparison story beside the
canonical WASM oracle. Complete renderer verification passes: 258 unit tests,
89 GPU tests, TypeScript, tree-shaking, and package export checks. The custom-font
text fixture measures 181,569 minified / 51,616 gzip bytes; the Lato comparison
fixture measures 282,325 / 122,069 because it deliberately embeds its test font.
The first Core quality smoke test exposed isolated false-inside texels in glyph
padding at small sizes. The text shader now rejects those samples against the
known tight glyph bounds while leaving a stroke- and antialiasing-aware guard
for real outer coverage. Core catalog selection and incremental atlas growth
remain to be implemented.

### Intended outcome

The existing text mark renders supported static TrueType fonts from incremental
GPU-generated `rgba16float` atlases, including basic kerning and stroked text,
without legacy A-Frame bitmap data.

### Affected areas and consumers

- `src/fonts/`, `src/vendor/textShaper/font/`, and font package exports;
- text layout, glyph buffers, shaders, resource cache, and updates;
- Default Font build/reproducibility and renderer bundle fixtures; and
- Core's existing renderer-neutral font-resource handoff.

### Work and verification

- Generalize the ASCII PoC into an `OutlineFont` that resolves requested
  supported code points while preserving strict unsupported-format errors.
- Export explicit `createTrueTypeFont(bytes)` and `loadTrueTypeFont(url)`
  helpers; keep fetching and family/style/weight selection out of text-mark
  construction.
- Keep family/style/weight catalog selection outside the renderer mark and GPU
  resource layers.
- Replace renderer-side BMFont glyph metrics with atlas-entry and font-metric
  buffers.
- Populate missing glyphs in one batch per settled text update and grow the
  shared atlas without changing existing coordinates.
- Reserve and verify per-entry sampling gutters for linear filtering and the
  2 by 2 subpixel footprint, including entries at atlas and shelf boundaries.
- Preserve logical-string channel cardinality, pair positioning, alignment,
  baseline, ranged text, squeeze fade, selection, picking, and replacement.
- Add centered text stroke with explicit range-class selection; keep other
  effects out of the first production slice.
- Test Default Font ASCII, Greek, common mathematical characters, Nordic
  Latin characters, U+2212 minus, composites, missing glyphs, spaces, and real
  Lato kerning pairs.
- Compare WGSL output with canonical WASM at representative 12-96 CSS pixel
  sizes, DPR 1 and 2, ordinary and exceptional strokes. Apply the accepted
  residual budget rather than byte equality. Keep the comparison optional and
  outside normal renderer/browser execution.
- Add small-text fixtures at DPR 1 and 2 with upright and rotated glyphs, thin
  stems, diagonals, counters, kerning, and centered strokes. Verify the 2 by 2
  path against a single-sample diagnostic and calibrate the device-pixel switch
  without visible threshold flicker.
- Measure the fragment cost of single-sample and supersampled text separately;
  retain supersampling wherever the visual fixture shows a material benefit.
- Measure first-use preparation, warm additions, atlas growth, memory, and
  browser bundles for Default Font, a custom TTF URL, and point-only imports.
- Verify point-only bundles exclude the default TTF and all font parsing.

### Documentation and migration

Document supported font tables and scripts, explicit shaping omissions,
Default Font provenance, explicit TTF loading, atlas quality classes, and
failure behavior.
Update public text examples after the bitmap backend is removed.

Tentative commit: `feat(webgpu): generate msdf text from truetype outlines`

Review gate: inspect the public font contract, text-update invalidation,
cross-mark atlas sharing, memory growth, bundle boundaries, and Core adapter
impact before deleting the legacy font route.

## Milestone 4: Core WebGPU adoption and prototype cleanup

### Intended outcome

GenomeSpy Core can translate finite custom point paths and supported font
resources through documented package exports, and no experimental production
route remains.

### Affected areas and consumers

- `packages/core/src/rendering/webgpu/` adapter and focused tests;
- Core point/text property translation and renderer capability errors;
- renderer package exports, Storybook, scripts, and vendor packaging; and
- issue #362 and #474 documentation or follow-up scope.

### Work and verification

- Pass Core's named or SVG-path shape values through the renderer's public
  point-shape union. The renderer interns the resolved finite values and keeps
  its compiled atlas representation private.
- Pass device-neutral outline-font resources through the existing adapter
  boundary and preserve Core text layout semantics supported by the new mark.
- Keep Core's existing `BmFontManager` and BMFont metrics as the measurement
  source. Add only an optional WebGPU outline-preparation hook/cache that
  observes normalized font requests and participates in the existing readiness
  wait.
- Let the dynamically loaded WebGPU backend combine the renderer-owned Default
  Font, an optional application catalog, and its temporary example catalog for
  outline preparation without replacing Core's measurement objects.
- Preserve Core's existing request-then-wait lifecycle for initial and newly
  visible subtrees. Prepare only TTF descriptors requested by actual marks,
  generated guides/titles, and initialized text-measurement transforms.
- Keep the temporary catalog and all imports that expose its TTF URLs under
  `packages/core/src/rendering/webgpu/`. Verify that selecting WebGL does not
  evaluate the catalog module or request any of its fonts.
- Normalize implicit-family requests through Default Font and then matching
  Lato variants; resolve explicit families without fallback substitution.
- Pin and license-audit every temporary catalog URL. Add an inventory check for
  font descriptors used directly or through configuration in `examples/`.
- Test a large catalog with a visualization using one face and assert that only
  that TTF is fetched and parsed. Cover deduplicated descriptors and URLs,
  failed TTF preparation, late visible-subtree requests, and teardown while
  loading. Assert that existing BMFont measurement and fallback behavior is
  unchanged.
- Require no Google API key and make no implicit provider request outside the
  explicit URLs in the temporary or application catalog.
- Fail explicitly for unsupported font formats, shaping needs, and malformed or
  unbounded path sets.
- Remove `pathPointMark`, the temporary Path Text construction, runtime backend
  toggles, and any package export that exposes PoC details.
- Move the pinned upstream subset, wrapper, license, and reproducible build from
  `packages/webgpu-renderer/vendor/msdfgen/` to isolated tooling such as
  `packages/webgpu-renderer/tools/msdfgen/`. Move the generated WASM loader and
  canonical rasterizer/comparison adapter out of `src/` to a location such as
  `tests/oracles/msdfgen/` that is excluded by the package manifest.
- Replace `build:msdfgen-wasm` and the runtime toggle with explicit development
  commands such as `build:msdf-oracle` and `test:msdf-oracle`. No production
  module may import the oracle transitively; ordinary tests need not initialize
  it unless they intentionally exercise the comparison.
- Preserve implementation-independent GPU coverage/topology regression tests
  so routine correctness does not depend solely on a second implementation.
- Compare representative Core examples under WebGPU, including
  the mandatory URLs listed under final integration verification, legends with
  custom shapes, labels using U+2212, rotated/stroked text, selection, zoom,
  picking, and SVG hybrid export.
- Run renderer and Core unit/type/lint/GPU/bundle/package checks and build
  Storybook.

### Documentation and migration

Add user-facing Core documentation only when the grammar/API is exposed.
Reconcile every remaining task in the PoC plans before their later retirement;
do not merge temporary plan files in the final PR.

Tentative commit: `feat(core): use gpu path symbols and outline fonts`

## Acceptance criteria

- Fixed regular-circle rendering keeps its minimal analytic shader and measured
  performance.
- Custom paths and glyphs use one renderer-owned generator with no CPU
  per-texel work, readback, or bitmap upload.
- Two marks resolving to the same canonical custom-path set share final GPU
  resources; marks using the same exact font input share their glyph atlas.
- Generation scratch memory is bounded independently of atlas capacity.
- Font atlas growth preserves existing entry coordinates and invalidates all
  dependent bindings safely.
- Delivered path and text atlases use `rgba16float` on the supported device
  matrix, with a documented fallback decision if required.
- The earlier deep star seams, detached corner islands, missing rectangle
  strokes, vertical sign streaks, and clipped outer miters remain absent.
- Renderer-owned default paths approximately preserve the current analytic
  named shapes' orientation, nominal bounds, relative filled area, and visible
  size/rotation/stroke behavior. Differences are limited to expected
  antialiasing and sampling details.
- The accepted minor corner/star residuals are documented and bounded by GPU
  regression tests.
- Point-only browser bundles exclude font code and Default Font bytes.
  Because `marks/point` accepts SVG strings synchronously, its custom-path code
  may remain in that entry; the measured bundle increase must be documented.
- Fixed regular-circle point marks allocate no atlas, initialize no MSDF
  generator pipeline, read no per-instance shape value, and execute the minimal
  analytic shader hot path.
- Text retains current logical-string behavior and adds supported TrueType
  outlines, basic kerning, centered stroke, and 2 by 2 fragment supersampling
  for small delivered glyphs.
- Low-level font loading accepts explicit TTF bytes or a URL. Core's WebGPU-only
  high-level selection composes a user catalog over its temporary example
  catalog, uses normalized exact family/weight/style keys, and requires no API
  key or implicit Google Fonts lookup.
- Constructing a Core view continues to use synchronous BMFont entries for
  measurement. Registering a TTF catalog performs no fetch; the WebGPU bridge
  prepares only descriptors requested by actual view/dataflow initialization
  and makes their outlines ready before low-level renderer-mark creation.
- The renderer package owns only Default Font. Core's temporary example catalog
  is absent from the WebGL module graph, and none of its TTF URLs are requested
  during WebGL-only use.
- Canonical msdfgen exists only under package-excluded `tools/` and test-oracle
  locations when the branch is ready to merge. No oracle source, WASM payload,
  loader, rasterizer, runtime toggle, or transitive import exists under
  production `src/`, package exports, ordinary browser chunks, or packed npm
  contents. Relevant MIT licenses and focused adaptation attribution remain.

## Risks and unresolved questions

- `rgba16float` storage/filter/copy combinations may expose adapter-specific
  limits; the write path needs validation before the format becomes public.
- Atlas growth requires rebinding every dependent mark without allowing one
  frame to combine stale metadata and a new texture.
- A fixed atlas width can fragment; repacking would improve memory but changes
  UVs and increases invalidation scope.
- Large high-edge-count glyph batches may make the global sign loop or atomic
  contention dominate despite sparse distance rasterization.
- The initial public path fill rule and size normalization still need a Core
  grammar decision. Vega-compatible input does not require copying Vega's
  canvas implementation.
- A finite resolved path table needs a documented maximum based on device
  limits and memory, not an arbitrary small constant. Data updates that add a
  previously unseen path require deliberate mark recreation or a later
  incremental-symbol contract.
- Ordinary and wide-effect range thresholds must be derived from requested
  screen size, DPR, and effect width, then validated against real labels.
- Basic kerning is useful for Latin text but is not a substitute for shaping.
  Unsupported scripts must fail or degrade according to an explicit policy.
- The small-text supersampling threshold can trade texture bandwidth for
  quality and may vary with DPR and atlas resolution. It must be based on
  delivered device-pixel size and calibrated from visual and timing fixtures,
  rather than copied as an unexplained CSS-pixel constant.
- Core's temporary example catalog can drift as examples and built-in themes
  change; its inventory check must cover direct mark/transform properties and
  font descriptors introduced through resolved configuration.
- A TTF request introduced after a readiness barrier must participate in the
  corresponding graphics or visible-subtree initialization before a low-level
  WebGPU text mark is created. This does not change when Core may read its
  existing BMFont metrics.
- Exact variant matching is intentionally simpler than CSS font matching. Add
  nearest-weight or style fallback only after a concrete Core use case defines
  deterministic semantics.
- The exact exported `OutlineFont` name and the point shape-channel input type
  should be frozen only after the Core adapter exercises them. The compiled
  point-shape cache remains internal.

## Final integration verification

- Run renderer Vitest, TypeScript, lint, focused and full WebGPU suites,
  Storybook build, tree-shaking fixtures, production build, and packed-package
  inspection.
- Run these local Core URLs with `renderer=webgpu` as mandatory browser smoke
  and screenshot fixtures:
  - `http://localhost:8080/?spec=examples/docs/examples/genomic-data/pik3ca-tcga-brca-lollipop.json&renderer=webgpu`
  - `http://localhost:8080/?spec=examples/core/marks/text/quality.json&renderer=webgpu`
  - `http://localhost:8080/?spec=examples/core/marks/text/text_baseline.json&renderer=webgpu`
  - `http://localhost:8080/?spec=examples/docs/grammar/mark/point/plenty-of-points.json&renderer=webgpu`
- Require the lollipop view to render its mixed point, text, rule, link, axes,
  and legend composition without adapter errors. Require `quality.json` to
  exercise readable 1-19 pixel text and the small-text supersampling path.
  Require `text_baseline.json` to load and visibly distinguish its catalog font
  variants while preserving alignments. Require `plenty-of-points.json` to
  cover its variable default shapes, fills, sizes, 0-4 pixel strokes, and
  rotations without missing or misindexed atlas entries.
- Run focused Core adapter/surface suites and representative live examples at
  DPR 1 and 2 on at least two WebGPU adapter families.
- Pixel-diff custom points and text against canonical WASM using matching
  formats where possible, and separately inspect delivered `rgba16float`
  quality through the explicit oracle command. Also run the full verification
  without initializing the oracle.
- Inspect the source tree, package scripts, production build graph, and packed
  package to prove that no msdfgen source, WASM payload, generated loader, or
  stale production import is shipped.
- Record cold compilation, first-use and warm batch latency, five-million-point
  draw time, final atlas bytes, peak scratch bytes, source bytes, minified/gzip
  browser deltas, and package contents.
- Verify repeated mount/update/destroy cycles and replacement-renderer recovery
  after terminal device loss.
- Revisit the accepted artifact list only if the production architecture
  worsens it or a representative Core view makes a residual objectionable.
