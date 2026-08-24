# WebGPU renderer simplification and footprint plan

Status: Complete and reconciled; ready to retire. Milestones 1–3 and 5 are
implemented, and Milestone 4 is discarded in favor of issue #362.

Created: 2026-08-23

Revised against the implemented facet baseline: 2026-08-24

Independent review: Luna review completed and incorporated on 2026-08-23.

Final disposition: follow-up low-hanging work releases uploaded text-layout
arrays and replaces generic D3 piecewise interpolation with a local color-stop
loop. Font representation remains owned by issue #362. No incomplete work
remains in this plan.

## Summary

`@genome-spy/webgpu-renderer` now has an intentional package surface and working
faceted rendering. Facet support established generic retained placement sets,
draw-level and per-instance placement indices, placement-aware clipping and
picking, logical text draw ranges, and operation within WebGPU's default
storage-buffer limit. Those are implemented contracts, not future prerequisites.

The accepted simplifications now compile mark channels and WGSL once, share
normal/picking shader and layout artifacts, retain draw-global staging, bind
scale resources from their owning map, and keep text series at logical-string
cardinality. The former general WGSL preprocessor, text-series expansion
helpers, derived resource maps, and unused `internmap` dependency are gone.

The bundled font remains behind the opt-in registration entry point. That
boundary is intentionally unchanged until issue #362 defines the TTF shaping,
atlas generation, caching, and default-font design without exposing BMFont
details prematurely.

## Implemented baseline

### Milestone 1 package result

Commit `71be361af` completed the package-contract milestone:

- explicit, typed package entry points replaced the wildcard source escape;
- tests, test utilities, plans, and migration notes are excluded from packing;
- reproducible public-import bundle fixtures report minified, gzip, and module
  counts;
- the delivery command runs type, bundle, lint, and package-content checks;
- the embedded Lato assets became opt-in; and
- Core imports only documented renderer, mark, scale, and high-precision
  entry points.

The optional-font asset goal originally assigned to Milestone 4 therefore
landed early. The remaining font redesign is deferred to
[issue #362](https://github.com/genome-spy/genome-spy/issues/362), which tracks
replacing the current BMFont/aframe-fonts representation. Until that design is
settled, the side-effect entry point is an intentional opacity boundary rather
than a public atlas-and-metrics preset.

### Facet result

The faceted-rendering plan's Milestones 1–5 are implemented and verified. The
remaining simplification must preserve:

- renderer-neutral immutable placement topology owned by Core/App layout;
- renderer-owned `PlacementSet` resources and explicit replacement/lifetime;
- draw-level and per-instance placement selection;
- ordered occurrence ranges, visibility pruning, clipping, normal rendering,
  and picking parity;
- text ranges expressed in logical strings and translated to glyph draws;
- approximately 2,000-sample App facet behavior; and
- the default limit of eight vertex-stage storage buffers without an elevated
  device request.

The facet work's placement semantics are fixed, but its shader markers are an
implementation detail. Milestone 2 may replace them with shader-local
conditional blocks so placement code remains visible at each point of use. It
must not replace them with implicit mark-name checks or a generic plugin system.

### Current measurements

Measurements reproduced on 2026-08-24 with the locked Rollup/esbuild fixture
and zlib gzip level 9:

| Fixture                       | After Milestone 1 | Current after facets |           Change |
| ----------------------------- | ----------------: | -------------------: | ---------------: |
| `rendererOnly` min/gzip       |     9,860 / 3,287 |       13,638 / 4,264 |    +3,778 / +977 |
| `pointLinear` min/gzip        |  113,243 / 33,399 |     123,544 / 35,655 | +10,301 / +2,256 |
| `pointOrdinal` min/gzip       |  115,701 / 34,009 |     126,002 / 36,293 | +10,301 / +2,284 |
| `customIdentityMark` min/gzip |    10,007 / 3,367 |       13,785 / 4,345 |    +3,778 / +978 |
| `textCustomFont` min/gzip     |  119,621 / 35,601 |     126,761 / 37,178 |  +7,140 / +1,577 |
| `textLato` min/gzip           | 220,377 / 105,652 |    227,517 / 107,249 |  +7,140 / +1,597 |

Current package and source measurements:

- 14,805 production JavaScript lines across 83 files under `src/`;
- 111 packed files, 633,970 bytes unpacked, and 193,799 tarball bytes;
- 157 unit tests pass in 26 files;
- type checking, bundle verification, lint, and dry-run package-content checks
  pass; and
- `internmap` remains declared as a runtime dependency although production code
  no longer imports it.

The facet-related bundle growth is not itself a regression: it represents a
necessary feature. It is the honest baseline for all remaining ratchets.

## Goals

- Preserve every currently implemented renderer and facet feature.
- Analyze and compile each mark configuration once.
- Share generated WGSL, shader modules, bind-group layouts, and pipeline layouts
  between normal and picking pipelines.
- Narrow the WGSL preprocessor to the shader-local conditional blocks used by
  built-in marks and placement.
- Remove repeated scale-resource derivation and temporary retained-path maps and
  typed arrays.
- Remove unused runtime dependencies without exposing or stabilizing BMFont
  atlas internals.
- Measure logical-string text storage against the implemented 2,000-sample
  facet path, adopting it only if it simplifies code as well as memory use.
- Ratchet source and bundle footprint down after each accepted milestone.

## Non-goals

- Removing marks, scales, selections, picking, placement, text, or
  high-precision inputs.
- Changing Core's ownership of grammar, dataflow, scale resolution, traversal,
  or placement topology.
- Reopening the renderer's retained draw or placement API without a concrete
  simplification or correctness need.
- Introducing mark/scale registries, service containers, visitor hierarchies,
  a renderer scene graph, or an uber-shader.
- Adding a second series-buffer layout mode for ordinary marks.
- Adding cross-mark pipeline or font-resource caches without a separate
  measured ownership/lifetime case.
- Replacing BMFont/aframe-fonts with TTF shaping, generating or caching font
  atlases at runtime, or choosing between `text-shaper` and another font
  renderer. Those decisions belong to issue #362.
- Expanding the transitional `{ metrics, bitmap }` integration shape into the
  documented way to consume the bundled default font.
- Generalizing text's string-to-glyph relation into arbitrary joins or dataflow.

## Key decisions

### Compile one plain internal artifact

Channel normalization will produce one plain immutable
`CompiledMarkChannels` record containing normalized channels, one analysis per
channel, channel IR, resource requirements, and the channel/input name sets used
by selections and shader generation. Existing subsystems consume this record
instead of calling `buildChannelAnalysis` independently.

This is a data record, not a public compiler object or extensibility framework.

### Share GPU compilation, not render-pipeline state

Normal and picking variants use the same WGSL, shader module, mark bind-group
layout, and pipeline layout. They remain two render pipelines because their
fragment targets, entry points, and blending differ. Placement participation is
fixed in the shared pipeline layout when the mark is created.

### Keep shader-local ifdefs; narrow the conditional language

Conditional code is easier to understand when it remains beside the WGSL it
controls. Keep `#if defined(NAME)`, `#else`, `#endif`, nesting, and the `!`,
`&&`, and `||` expressions used to combine feature symbols. Use the same
mechanism for placement, `uniqueId`, and ranged-text x/y variants.

Delete `#define`, `#undef`, `#ifdef`, `#ifndef`, `#elif`, numeric/macro values,
and mutable macro state. Enabled symbols come only from the mark's compiled
channel and placement configuration. The result is a conditional-block
evaluator, not a general C-style preprocessor.

### Do not add a scale-resource strategy layer

The implemented `ScaleDef` contract already owns validation, WGSL emission,
resource requirements, and update hooks, and facets now pass default binding
limits with that design. The previously proposed definition-local resource
strategy is discarded for this plan. Reuse existing analyses and the existing
resource map through direct lookups; introduce no second dispatch vocabulary.

Experimental custom `ScaleDef` values keep their current explicit contract and
must continue to fail loudly when required behavior is absent.

### Keep the bundled font preset opaque; defer its representation

Keep `fonts/lato` as the opt-in registration entry point for now. Although its
module side effect and registry add machinery, exporting Lato as a
`FontResource` value would make the current BMFont metrics and bitmap atlas part
of the practical public contract. That works against issue #362, whose purpose
is to replace those implementation details with a higher-level font source and
shaping path.

Do not broaden or document `{ metrics, bitmap }` as the long-term font API.
Core's current resource adapter is a transitional integration boundary. Issue
#362 owns the eventual high-level source or handle, the bundled default-font
mechanism, atlas generation, and caching. Simplification may remove unused
dependencies around the present implementation, but must not pre-empt that
design by moving atlas internals onto callers.

### Keep logical text storage conditional on evidence

Facet implementation made the cost and contract concrete: retained draw ranges
are logical strings, while visual series and per-instance placement are
currently copied to glyph count. A text-only logical-series reader could remove
those copies without adding bindings, but it touches picking, selections,
replacement, high-precision inputs, and placement. Milestone 5 remains a
measured go/no-go milestone.

## Alternatives considered

### Keep separate normal and picking compilation because it already works

Rejected. Both paths use the same generated WGSL and vertex interface. Keeping
duplicate shader generation, modules, and layouts adds construction work and a
parity risk without preserving a useful capability.

### Replace placement resources while simplifying shaders

Rejected. The implemented storage representation passes the portable binding
gate and the public placement contract is generic. A buffer/texture redesign
would broaden risk without evidence that it simplifies the common bundle or
runtime.

### Assemble conditional WGSL from JavaScript snippets

Rejected. Moving small variant branches out of the shader separates related
logic and makes the final program harder to inspect. Shader-local conditionals
retain one readable template while the narrow evaluator removes unused code.

### Add definition-local scale resource strategies

Discarded. Existing `ScaleDef` metadata already drives the working resource
path. Reusing its compiled results is smaller than adding another interface and
dispatch layer.

### Export the bundled Lato atlas as a `FontResource`

Rejected. It would be statically traceable, but it would expose and encourage
dependence on the BMFont metrics/bitmap representation that issue #362 intends
to replace. The current side-effect entry point keeps those details private and
is the smaller compatibility boundary until a high-level font design exists.

### Implement logical-string text storage unconditionally

Rejected. Glyph expansion is correct and now covered by facet tests. The extra
indexing contract is justified only by measured memory/upload reduction and net
source simplification.

## Milestone 1: Package contract and reproducible footprint gates

Status: Complete in `71be361af`.

### Outcome

The package exposes intentional typed subpaths, excludes development artifacts,
and has reproducible bundle and package checks. Custom-font bundles exclude the
Lato JSON and PNG.

### Affected areas and downstream consumers

Package metadata, declarations, delivery/bundle scripts, README examples, and
Core's renderer imports were migrated together.

### Verification and migration

The completed commit added public type fixtures, self-import bundle fixtures,
package-content validation, package-wide lint coverage, README migration, and
Core import migration.

### Commit

`build(webgpu-renderer): complete Milestone 1 package contract`

## Milestone 2: Single compilation and minimal shader conditionals

Status: Complete.

### Intended outcome

One mark construction normalizes and analyzes channels once, evaluates
shader-local conditionals once, creates one shader module and shared layouts,
and derives normal and picking pipelines from those shared objects. Only the
narrow conditional language remains.

### Work

- Make normalization return or construct `CompiledMarkChannels` and pass the
  same record through uniform layout, scale resources, selections, packed-series
  layout, and shader generation.
- Remove independent analysis construction from `channelIR`,
  `ScaleResourceManager`, `SelectionResourceManager`, and validation paths.
- Split the current `buildPipeline` into one compilation/layout step and a small
  render-pipeline creation step.
- Create one mark bind-group layout, shader module, and pipeline layout; create
  normal and picking pipelines from them with different fragment settings.
- Preserve placement participation in the shared pipeline layout and compile
  both draw-level and per-instance placement paths from the same artifact.
- Replace the four external placement-marker patches with shader-local
  `#if defined(PLACEMENT_ENABLED)` blocks at the corresponding varying,
  initialization, bounds, and clipping sites.
- Replace `wgsl/preprocess.js` with a small conditional evaluator supporting
  only `#if defined(NAME)`, `#else`, `#endif`, nesting, and `!`/`&&`/`||` over
  defined symbols. Reject malformed, unknown, and unsupported directives.
- Preserve existing shader-local `uniqueId` and ranged-text conditions, and
  supply all enabled symbols explicitly from the compiled mark artifact.
- Delete tests for macro definition/mutation and other removed syntax; retain
  focused tests for supported expressions, nesting, inactive blocks, malformed
  directives, and placement conditions.
- Keep specialized mark shader bodies; do not introduce a common uber-shader or
  public compiler API.

### Affected areas and downstream consumers

- Channel normalization/analysis/IR, shader builder, pipeline builder,
  `BaseProgram`, scale and selection resource managers.
- Point, rect, rule, link, arrow, and text programs.
- Normal rendering, picking, placement clipping, and Core's WebGPU adapter.

### Verification

- Focused tests prove every normalized channel is analyzed once and downstream
  stages receive the same compiled record.
- Pipeline tests prove one shader module and one pipeline layout create both
  render pipelines.
- Shader tests cover optional `uniqueId`, ranged text x/y variants, selections,
  and draw-level/per-instance placement with the applicable symbols enabled and
  disabled.
- Run the full renderer unit and GPU suites and focused Core WebGPU adapter and
  surface suites.
- Run all bundle fixtures and record source/module/minified/gzip deltas. The old
  general parser must be replaced by the smaller conditional evaluator in every
  applicable production graph.

Completed verification:

- 159 renderer unit tests and 51 WebGPU GPU tests pass.
- 74 focused Core WebGPU and placement tests pass.
- Type checking, lint, bundle verification, and `git diff --check` pass.
- One shader-module and pipeline-layout creation is asserted for both render
  pipelines, and the compiled channel record retains the supplied analysis map.
- From the post-facet baseline, `pointLinear` changed from 123,544 / 35,655 to
  123,298 / 35,601 minified/gzip bytes; `textCustomFont` changed from
  126,761 / 37,178 to 126,513 / 37,135. Module counts are unchanged. The
  milestone primarily removes duplicate construction work and reduces
  production JavaScript from 14,805 to 14,781 lines.

### Documentation and migration

Update `packages/webgpu-renderer/MIGRATION_PLAN.md` when the milestone starts
and completes. No public API migration is expected.

### Review gate

Review the compiled-record boundary, normal/picking parity, generated layouts,
conditional syntax, placement blocks, and shader diagnostics before merging.

### Commit

`refactor(webgpu-renderer): compile mark shaders once`

## Milestone 3: Stable resource views and retained staging

Status: Complete.

### Intended outcome

Bind-group rebuilds and draw submission reuse stable resource views and staging
capacity. Scale-resource code consumes the compiled analysis instead of
re-deriving policy. The working facet path remains within default limits.

### Work

- Pass compiled analyses and resource requirements into
  `ScaleResourceManager`; remove its independent channel-analysis pass.
- Let bind-group construction read ordinal ranges, domain maps, and range
  textures directly from the existing per-channel resource map. Delete the
  getters that allocate intermediate maps; do not maintain duplicate indexes.
- Retain one capacity-sized draw-global `ArrayBuffer` alongside the GPU buffer,
  grow both together, and write fields directly instead of allocating a typed
  array and per-draw number array each frame.
- Remove obvious post-facet duplication and stale state encountered in these
  paths, including repeated guards, redundant derived collections, and the
  unused `internmap` runtime dependency.
- Preserve the defensive copy that gives `PlacementSet` immutable CPU
  ownership; do not trade a clear lifetime contract for one avoided copy.
- Reuse stop/range scratch arrays or packed-series staging only when a focused
  update benchmark shows material churn and the change remains local.
- Do not add scale strategies, alternate binding layouts, or another packed-
  series mode.

### Affected areas and downstream consumers

- Scale resources, bind-group builder, `BaseProgram`, renderer draw globals,
  placement-enabled frames, and retained scale slots.
- Core domain/range updates, conditional scales, normal frames, and on-demand
  picking frames.

### Verification

- Focused tests cover direct resource lookup, correct replacement/destruction,
  and bind-group rebuilds after capacity changes without intermediate maps.
- A renderer test proves repeated equal-capacity frames reuse draw-global CPU
  staging while writing correct float/u32 fields.
- Unit and GPU scale coverage includes continuous, piecewise, threshold,
  quantize, ordinal, band, index, color-ramp, and conditional paths.
- Placement-heavy text plus selection and scale configurations continue to run
  with eight vertex-stage storage buffers.
- Re-run ordinary facets, approximately 2,000 sample facets, normal rendering,
  and picking through focused Core/App coverage.
- Record source and bundle deltas; accepted hot-path state must replace more
  allocation/derivation than it adds in ownership complexity.
- Verify the packed package has no `internmap` runtime dependency and production
  graphs contain no reference to it.

Completed verification:

- 160 renderer unit tests, including retained-staging reuse and direct resource
  binding, and 51 WebGPU GPU tests pass.
- 124 focused Core/App WebGPU, placement, ordinary-facet, and 2,000-sample
  facet tests pass.
- Type checking, lint, bundle verification, package dry-run, and
  `git diff --check` pass. The package has 111 files, 633,846 unpacked bytes,
  and 192,588 tarball bytes, with no direct `internmap` dependency.
- Relative to Milestone 2, `pointLinear` changed from 123,298 / 35,601 to
  123,148 / 35,622 minified/gzip bytes and `textCustomFont` changed from
  126,513 / 37,135 to 126,086 / 37,071. `rendererOnly` grew from
  13,638 / 4,264 to 13,912 / 4,340 because it owns the retained staging path.
  Production JavaScript decreased from 14,781 to 14,755 lines.

### Documentation and migration

Update the migration plan's scale-resource and setter follow-ups to describe
only remaining measured work. No public documentation change is expected.

### Review gate

Review resource ownership if it changes beyond the local maps and staging
buffers described here.

### Commit

`refactor(webgpu-renderer): reuse retained resource staging`

## Milestone 4: Font boundary cleanup

Status: Discarded from this plan; the optional asset split landed in Milestone
1 and the remaining redesign is tracked by issue #362.

### Decision and rationale

Preserve the opt-in `fonts/lato` registration entry point, its package
`sideEffects` exception, and the internal registry until issue #362 defines a
replacement. These pieces are not ideal in isolation, but deleting them now
would require exporting the bundled BMFont metrics and bitmap or shifting those
details onto every caller. That would optimize the current implementation into
a harder-to-change public convention.

Do not export Lato as a `FontResource`, advertise direct BMFont atlas assembly,
or simplify away the current boundary before the TTF shaping and default-font
design is known. Keep Core's `{ metrics, bitmap }` adapter working as a
transitional internal integration, but do not broaden it. Remove the unrelated
unused `internmap` dependency in Milestone 3.

When issue #362 is planned, re-evaluate the registry, `BmFontManager`, public
font input, bundled default, tree shaking, runtime atlas generation, caching,
and migration together. That work needs its own footprint and runtime-cost
measurements rather than a premature cleanup milestone here.

## Milestone 5: Measured logical-string text storage

Status: Complete.

### Intended outcome

If measurement justifies the change, text keeps logical visual channels and
per-instance placement once per string while glyph geometry remains per glyph.
Logical draw ranges, placement, selections, and picking retain current behavior
without additional GPU bindings or a general mixed-cardinality framework.

### Work

- Measure current CPU allocation, upload bytes, packed-series GPU bytes, and
  replacement time for short labels, long labels, and the implemented
  approximately 2,000-sample facet scenario.
- If accepted, store `glyphId` in the existing glyph-instance structure along
  with `stringIndex` and offsets, reusing its current padding rather than adding
  another buffer.
- Keep visual channels, conditional branches, `uniqueId`, high-precision source
  values, and per-instance `__placementIndex` in logical-string packed series.
- Give text channel readers one explicit text-only index expression that maps a
  glyph draw index through `glyphs[i].stringIndex` before reading logical
  series.
- Separate text's logical series count from its glyph GPU instance count inside
  the existing program contract. Keep public draw ranges logical and continue
  translating them through the implemented glyph-offset table.
- Define replacement atomically: validate logical arrays, rebuild layout and
  glyph geometry, update both counts, replace packed logical series, and retain
  the pipeline and atlas.
- Ensure every glyph of a string shares placement, selection visibility, and
  picking identity.
- Delete `expandTextSeries`, `expandTextSeriesArrays`, placement-index
  expansion, and their alias caches after the logical path works.

Discard the milestone if it requires mixed cardinalities inside one generic
packed buffer, extra per-type bindings, changes to ordinary mark accessors, or a
general indexing abstraction. The implemented glyph-expansion path is correct
and remains the KISS fallback.

### Affected areas and downstream consumers

- Text layout/program, packed-series count handling, shader accessors,
  placement indexing, conditional channels, selections, picking, and Core/App
  sample labels.

### Verification

- GPU and unit tests cover multi-glyph, repeated, and empty strings; logical
  draw subranges; draw/per-instance placement; conditional channels;
  visibility and selections; shared picking IDs; high-precision inputs; and
  replacement across different logical/glyph counts.
- Re-run the approximately 2,000-sample App scenario and record end-to-end text
  series/upload/GPU bytes before and after.
- Accept only if representative long-label packed-series bytes fall by at least
  half, no binding is added, and production code does not grow after expansion
  helpers are deleted. Otherwise record the evidence and mark this milestone
  discarded.

Completed decision and measurements:

- Accepted with no new binding or packed-buffer mode. `GlyphInstance` now uses
  its former padding word for `glyphId`, while generated text readers map the
  glyph draw index through `glyphs[i].stringIndex`.
- In the existing 2,000-label fixture (34,000 glyphs), the minimal glyph-id plus
  placement packed series fell from 272,000 to 8,000 bytes, a 264,000-byte or
  97.1% reduction. The 544,000-byte glyph geometry buffer is unchanged.
- A representative x/y/unique-id/placement workload fell from 680,000 to
  32,000 packed bytes for the same long labels, a 648,000-byte or 95.3%
  reduction. For one-glyph labels it falls from 40,000 to 32,000 bytes; the
  benefit intentionally scales with label length.
- A Node microbenchmark of the removed four-array expansion loop averaged
  0.153 ms per 2,000-long-label replacement and 0.012 ms for 2,000 one-glyph
  labels on the measurement host. Layout time is common to both designs and
  was excluded.
- 162 renderer unit tests and 52 WebGPU tests pass, including a real text
  visible/picking-pipeline submission before and after changing glyph count.
  Seventy-one focused Core/App adapter, surface, placement, and 2,000-sample
  tests also pass.
- Relative to Milestone 3, `textCustomFont` changed from 126,086 / 37,071 to
  125,468 / 36,714 minified/gzip bytes and `textLato` changed from
  226,842 / 107,193 to 226,224 / 106,841. The shared text-only indexing hook
  adds 133 / 31 bytes to point fixtures; ordinary marks still emit the same
  `read_name(i)` expressions and gain no resource or runtime path.
- Production JavaScript decreased from 14,755 to 14,586 lines. The expansion
  helpers and alias caches were deleted, and replacement keeps all logical
  arrays at string count.
- The packed package remains at 111 files and decreased from 633,846 to
  629,228 unpacked bytes and from 192,588 to 191,467 tarball bytes.

### Documentation and migration

No public API change is expected. Update internal text architecture comments to
distinguish logical series, logical draw ranges, and glyph instances.

### Review gate

The measured go/no-go gate accepted the implementation. Final review should
focus on the text data-layout contract, picking identity, replacement, and
placement interaction before merging.

### Commit

`refactor(webgpu-renderer): index text channels by string`

## Footprint ratchets

Every accepted milestone must report production source lines, fixture module
graphs, minified bytes, and gzip bytes before and after. A fixture may grow only
with an explicit explanation tied to preserved behavior.

The original working targets from the post-facet baseline were:

- `pointLinear`: at or below 117,900 minified and 34,800 gzip bytes;
- `textCustomFont`: at or below 124,500 minified and 36,900 gzip bytes; and
- production JavaScript below the current 14,805 lines.

Final evidence revises the byte ratchets rather than adding broader machinery:

- `pointLinear` finishes at 123,281 / 35,653, down 263 minified bytes and two
  gzip bytes from the post-facet baseline but above its aspirational target.
  Its 60-module graph still includes the required scale, selection, visibility,
  retained-placement, and shader-generation paths; removing another roughly
  5.4 kB would require a new feature or architecture decision, not a
  low-hanging deletion.
- `textCustomFont` finishes at 125,468 / 36,714. It meets the gzip target and
  misses the minified target by 968 bytes while deleting the glyph-expansion
  path and cutting representative long-label series storage by over 95%.
- Production JavaScript finishes at 14,586 lines, meeting the source ratchet by
  219 lines relative to the post-facet baseline.

The final measured fixture values become the delivery ratchets. Further byte
work should start from a new module-level finding rather than obscuring the
implemented contracts to reach the original estimates.

## Final integration verification

After accepted milestones are complete:

- Run renderer type, unit, lint, bundle, package, Storybook, and WebGPU GPU
  checks.
- Run workspace type checks and focused Core WebGPU adapter, surface,
  coordinator, rendering-context, mark translation, and placement-source tests.
- Exercise standalone point, ordinal, piecewise, threshold, index, text,
  ranged-text, rule, link, arrow, hatch, and placement scenes.
- Verify normal/picking order, repeated handles, scissors, viewports, visible
  ranges, logical text ranges, and partial instance ranges.
- Verify dynamic scale updates, conditional encodings, selections, text
  replacement, the opaque Lato preset and transitional custom font resources,
  asynchronous invalidation, and deterministic mark/placement/renderer
  destruction.
- Re-run ordinary facets and the approximately 2,000-sample App scenarios,
  including reorder, filtering, closeup/peek, placement replacement, labels,
  metadata, and range marks.
- Confirm the most resource-heavy placement/text/selection/scale case stays at
  or below default WebGPU binding limits.
- Compare final reports with both the Milestone 1 and post-facet baselines and
  explain remaining large common modules.
- Mark every milestone completed or discarded, commit that record, and delete
  this temporary plan in a later commit before merge.

## Overall acceptance criteria

- All implemented renderer and facet features remain available.
- One mark construction creates one compiled-channel record, one generated
  WGSL artifact, one shader module, one mark bind-group layout, and one pipeline
  layout shared by normal and picking pipelines.
- Only the documented narrow WGSL conditional evaluator remains; the general
  preprocessor is gone.
- Scale resources consume compiled requirements and bind directly from their
  single resource map without rebuilding derived maps.
- Repeated equal-capacity frames reuse draw-global CPU staging.
- The package has no unused `internmap` dependency and does not expose the
  bundled BMFont atlas as a public preset value. The opt-in `fonts/lato`
  side-effect remains isolated until issue #362 replaces its representation.
- Milestone 5 is either accepted with its measurement and narrow contract or
  explicitly discarded with evidence.
- Type, unit, lint, bundle, package, GPU, and focused Core/App facet checks pass.
- Final footprint reports meet the working ratchets or contain a justified
  module-level revision.

## Risks and mitigations

- **Placement regression during shader cleanup:** Treat the implemented
  placement semantics as first-class and run draw/per-instance placement in
  normal and picking passes for every mark family.
- **Compilation artifact becomes a framework:** Keep it a plain internal record
  passed explicitly between existing functions.
- **Conditional evaluation hides shader errors:** Preserve generated-source
  labels, fail loudly on malformed or unsupported directives, and test every
  placement condition in enabled and disabled variants.
- **Scale update behavior drifts:** Reuse existing analysis and resource rules;
  do not redesign `ScaleDef` dispatch in this plan.
- **Retained staging obscures ownership:** Keep capacity and destruction beside
  the GPU resource it mirrors and accept state only when it replaces measured
  allocation.
- **Premature font cleanup freezes BMFont details:** Keep the current opaque
  preset boundary and defer registry, shaping, atlas, and caching decisions to
  issue #362.
- **Logical text indexing spreads complexity:** Require no new binding, no
  ordinary-mark accessor change, and net source deletion; otherwise discard it.

## Resolved question

- The 2,000-sample long-label workload exceeds the Milestone 5 packed-series
  reduction gate by a wide margin, adds no binding, and deletes production
  code, so logical-string indexing is accepted.

## External design references and provenance

- Node.js package exports define supported entry points and encapsulate other
  subpaths: <https://nodejs.org/api/packages.html#package-entry-points>
- npm's package `files` rules define the published file set:
  <https://docs.npmjs.com/files/package.json/>
- WebGPU exposes shader modules and render pipelines as separate objects,
  allowing one module to serve compatible pipelines:
  <https://www.w3.org/TR/webgpu/#shader-module-creation>
- GenomeSpy issue #362 tracks replacing aframe/BMFont assets with a higher-level
  TTF shaping and bundled-default-font design:
  <https://github.com/genome-spy/genome-spy/issues/362>

No external source code is copied or closely adapted by this plan.
