# WebGPU renderer production-SLOC reduction plan

Status: proposed; intentionally not part of PR #533 until implementation starts

## Objective

Reduce the non-comment production source added by the path-point and outline
font branch while preserving its behavior, future-facing renderer features,
and visual quality. The primary metric is changed runtime SLOC relative to
`origin/master`, not raw Git additions, test size, or formatting density.

The preferred strategy is scope deletion followed by local consolidation. Do
not optimize the number by compressing statements onto fewer lines, moving code
to generated files, hiding it in a dependency, or weakening tests.

## Counting policy and baseline

Use the repository token-based counter. It counts changed lines containing a
non-comment JavaScript token, excludes blank and comment-only lines, and counts
embedded WGSL template contents as runtime source.

```sh
node .agents/skills/count-production-lines/scripts/count-production-lines.mjs \
  --base origin/master --path packages/core/src --extensions .js

node .agents/skills/count-production-lines/scripts/count-production-lines.mjs \
  --base origin/master --path packages/webgpu-renderer/src --extensions .js
```

Report declarations separately with `--include-declarations`. Exclude tests,
examples, Storybook, scripts, plans, and documentation from the production
number. Report vendored runtime separately even though it is included in the
browser bundle.

Current branch baseline:

| Scope | Added | Deleted | Net |
| --- | ---: | ---: | ---: |
| Owned runtime | 4,129 | 228 | 3,901 |
| Vendored runtime | 1,327 | 0 | 1,327 |
| Total runtime | 5,456 | 228 | 5,228 |
| Type declarations | 100 | 4 | 96 |

The largest concentrations are the sparse atlas generator/layout (2,229 added
SLOC), text/font rendering (1,198), vendored font and SVG-path parsing (1,327),
point integration (451), and Core integration (241).

## Targets

- Reduce total net runtime delta from 5,228 to at most 4,700 SLOC.
- Reduce owned net runtime delta from 3,901 to at most 3,500 SLOC.
- Treat 4,400 total net runtime SLOC as a stretch target, not a reason to make
  the code denser or less explicit.
- Every implementation commit must have a negative production-SLOC delta from
  its parent. A refactor that merely moves or renames code does not qualify.
- Preserve or improve the measured browser bundles and packed-package size.

## Non-goals and guardrails

- Do not replace the GPU generator with the canonical WASM oracle.
- Do not remove or degrade the canonical comparison workflow. Preserve the
  Storybook WGSL/oracle toggle, rendered pixel comparisons, atlas-texel
  comparisons, comparison scripts, and checksum-pinned oracle acquisition.
  These facilities are development-only and must remain excluded from the npm
  package and production browser bundles.
- Do not remove the analytic fixed-circle fast path.
- Do not remove text outlines, shadows, glows, label-major effect ordering, or
  their Storybook controls. They are intended future grammar capabilities.
- Do not remove bitmap-font rendering, outline-font rendering, or either font
  route's public entry points merely to meet the SLOC target.
- Do not remove, compact, or weaken any built-in example-font catalog entry,
  application catalog behavior, exact matching, validation, Default Font
  selection, implicit Lato fallback, lazy loading, or request deduplication.
- Do not reduce the supported static TrueType and basic-kerning subset needed
  by the Default Font, Lato variants, and the repository example catalog.
- Do not remove correctness checks at external input and GPU-resource
  boundaries merely to save lines.
- Do not count deleted tests, comments, documentation, or declarations toward
  the production target.
- Do not introduce a framework, code generator, or external dependency whose
  total implementation is larger than the code it replaces.
- Do not add asynchronous module boundaries solely to improve a bundle fixture
  when they increase runtime state or production SLOC.

## Milestone 1: Move comparison compatibility behind a development boundary

### Intended outcome

Production path and font modules expose only normal `rgba16float` behavior.
Development adapters retain the RGBA8 oracle compatibility, backend switching,
and inspection hooks needed for direct visual and numerical comparisons.

### Work

- Make `rgba16float` the sole production MSDF texture format. Move RGBA8
  encoding/decoding required by canonical comparisons into development-only
  oracle adapters and shader variants.
- Remove `atlasBackend`, `atlasFormat`, `uFloatAtlas`, format-specialized
  correction pipelines, and production validation branches that exist only to
  switch between the GPU implementation and the oracle. Recreate the required
  switch in a development adapter imported only by Storybook, tests, and
  comparison scripts.
- Move `createAsciiTrueTypeFont` from the public runtime module to a development
  helper if comparisons still need it. Production text already uses lazy
  `createTrueTypeFont` glyphs.
- Internalize or move standalone atlas wrappers and metadata exports used only
  by tests and comparison scripts behind a development/test entry. Keep every
  inspection hook needed to compare both rendered output and the underlying
  MSDF textures.
- Keep checksum-pinned acquisition of the external msdfgen oracle and retain
  switchable Path Points and Path Text Storybook examples.
- Remove stale migration-plan references to the retired path-points plans.

Expected reduction: 120-220 production SLOC.

### Affected areas and consumers

`src/symbols/`, `pathPointProgram.js`, TrueType exports, oracle tests,
comparison scripts, and the Path Points/Path Text stories. This deliberately
relocates comparison-only low-level APIs; the renderer package is unpublished.
Production modules must not import development modules, while development code
may import focused renderer internals where necessary.

### Verification

- Keep the side-by-side Storybook toggle working for both WGSL and canonical
  msdfgen backends in Path Points and Path Text.
- Keep rendered pixel-diff scripts and atlas-texture/texel comparisons working
  through development-owned adapters.
- Run point/text GPU suites at DPR 1 and 2.
- Confirm every production atlas is `rgba16float`.
- Add package-content and tree-shaking checks that reject oracle binaries,
  RGBA8 comparison shaders, and development adapters from the npm package and
  production browser bundles.

Tentative commit: `refactor(webgpu-renderer): isolate MSDF diagnostics`

## Milestone 2: Consolidate text paths without reducing capabilities

### Intended outcome

Bitmap and TrueType text, text effects, and lazy outline atlases retain their
current contracts while sharing more normalization, layout-buffer, and GPU
resource plumbing.

### Work

- Keep bitmap and outline font resolution distinct where their inputs differ,
  but produce one internal text-layout and glyph-buffer contract.
- Consolidate duplicated string resolution, layout normalization, metric-buffer
  upload, texture/sampler installation, and atlas rebind bookkeeping only when
  the shared helper is smaller than the branches it replaces.
- Keep effect-free text specialized to one quad per glyph and keep effect text
  label-major. Share ordinary fill and sampling code between variants without
  making the fast path allocate render-item buffers.
- Keep the legacy `fonts/lato`, custom bitmap-font, custom TrueType, and Default
  Font entries tree-shakeable and independently measurable.
- Remove stale fields or caches only after reference tracing proves that no
  bitmap, outline, effect, retained-update, or destruction path consumes them.

Expected reduction: 100-220 production SLOC.

### Affected areas and consumers

Renderer font modules, `textProgram.js`, `textRenderItems.js`, renderer resource
destruction, public types, direct renderer examples, and bundle fixtures.
Core, WebGL, Canvas2D, SVG, and Core measurement remain unchanged.

### Verification

- Render text quality, baseline, sequence-logo, lollipop, and MSA examples
  through WebGPU at DPR 1 and 2.
- Verify bitmap text, custom TrueType, Default Font, outlines, shadows/glows,
  late loading, mark replacement, atlas growth, picking, and repeated
  mount/destroy cycles.
- Confirm the bitmap, custom-TTF, Default Font, and point bundle fixtures retain
  their existing tree-shaking boundaries and do not grow.

Tentative commit: `refactor(webgpu-renderer): consolidate text resources`

Review gate: inspect bitmap, outline, and effect consumers together; reject a
shared abstraction if it increases state or obscures their distinct lifecycles.

## Milestone 3: Consolidate the retained MSDF implementation

### Intended outcome

The correctness-critical generator keeps the same algorithm but has fewer
parallel representations and duplicated declarations.

### Work

- Share WGSL `Segment`, `Job`, and parameter declarations across the edge,
  sign-resolution, and correction stages instead of repeating them.
- Carry prepared contours and draw metadata through one layout preparation
  pass. The canonical oracle should consume the final layout record rather
  than forcing a second production path parse.
- Remove redundant atlas result fields, option aliases, and buffer-upload
  helpers after tracing all point and outline-font consumers.
- Keep one renderer-owned generator lifecycle and one immutable-atlas cache.
  Font growth may reuse the generator but remains owned by `OutlineFontAtlas`.
- Consider direct TrueType-contour input only if it deletes the current
  glyph-to-SVG-to-path round trip and produces a smaller implementation. Do not
  add a second contour model merely for speed.
- Do not rewrite distance, edge-coloring, pseudo-distance, or correction math
  without a measured SLOC reduction and unchanged oracle results.

Expected reduction: 200-350 production SLOC.

### Verification

- Preserve atlas median/sign/near-contour comparisons and acute-corner,
  rotation, stroke, growth, and overlapping-contour regressions.
- Re-run the font-atlas stress benchmark and five-million-point smoke fixture
  to reject lifecycle or hot-path regressions.
- Compare point/text minified and gzip bundles after every consolidation.

Tentative commit: `refactor(webgpu-renderer): simplify MSDF atlas generation`

Review gate: inspect the final GPU pipeline and CPU layout against the oracle;
do not accept SLOC savings that reintroduce seams, rounded corners, or clipping.

## Milestone 4: Remove adapter and font-catalog duplication

### Intended outcome

Core preserves the complete temporary example and application font-resolution
behavior with one internal decision path.

### Work

- Use one source-resolution function for Default Font, implicit Lato fallback,
  application catalog entries, and the temporary example catalog without
  changing their precedence or failure behavior.
- Remove duplicate family/style/weight decisions between resolution and
  preparation only if tests demonstrate identical results for every catalog
  entry and fallback combination.
- Keep the example catalog explicit and readable. Do not put several entries
  on one line or generate the table merely to lower SLOC.
- Keep all catalog entries, application overrides, exact variant matching,
  validation errors, lazy loading, and request deduplication.
- Leave this milestone unchanged if consolidation would save only formatting
  lines or make the temporary adapter harder to remove later.

Expected reduction: 0-40 owned production SLOC.

### Verification

- Preserve exact descriptor matching, duplicate/invalid catalog failures,
  Default Font behavior, implicit Lato variants, request deduplication, and
  WebGL-only exclusion.
- Run recursive example-font inventory tests.

Tentative commit: `refactor(core): simplify WebGPU font resolution`

## Alternatives rejected

- Depending on a full font or SVG library would reduce repository SLOC while
  increasing delivered code and capability surface.
- Minifying source, combining independent statements, or encoding logic in
  tables solely to reduce counted lines optimizes the metric rather than the
  implementation.
- Restoring canonical msdfgen WASM as the production generator increases
  initialization cost and duplicates the GPU pipeline.
- Deleting text effects, bitmap fonts, or catalog behavior would reduce SLOC by
  removing intended or currently supported functionality, so it is explicitly
  excluded from this optimization.
- Splitting every point/text variant into asynchronously loaded modules could
  improve selected bundles but adds lifecycle and failure state. Reconsider it
  only after the deletion milestones if bundle size remains unacceptable.

## Final integration verification

- Re-run the token-based SLOC counts and report owned, vendored, declaration,
  added, deleted, and net figures against `origin/master`.
- Run the full unit suite, workspace type checks, root lint, WebGPU GPU suite,
  Storybook build, renderer build, tree-shaking checks, and package-content
  verification.
- Smoke-test lollipop, text quality, text baseline, sequence logo,
  plenty-of-points, and MSA under WebGPU at DPR 1 and 2, including MSA and
  lollipop zoom/pan.
- Re-run the browser bundle matrix. The renderer-only fixture must remain
  effectively unchanged; point and text bundles must not grow.
- Measure the packed package, custom-TTF text route, and Default Font route.
  Report the TTF asset separately from JavaScript.
- Reconcile and retire this temporary plan before updating or merging PR #533.

## Acceptance criteria

- Total net runtime delta is at most 4,700 non-comment production SLOC, with an
  owned net delta at most 3,500.
- Fixed circles remain analytic and allocate no path atlas.
- Named/custom paths and outline glyphs retain accepted visual quality and
  shared `rgba16float` GPU generation.
- Bitmap and outline text rendering, text effects, and Core measurement remain
  behaviorally stable.
- The example/application font catalog retains every descriptor, precedence
  rule, validation behavior, fallback, and lazy-loading property.
- Canonical msdfgen comparisons remain available through Storybook, scripts,
  and tests, including rendered pixel and atlas-texture comparisons.
- No oracle or RGBA8 comparison branch ships in the production npm package or
  production browser bundles.
- The Default Font route remains smaller over the network than master's legacy
  bitmap Lato route.
- Tests and documentation may grow; production code must become materially
  smaller and easier to explain.
