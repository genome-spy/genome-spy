# WebGPU renderer simplification and footprint plan

Status: Milestone 1 and faceted rendering complete; Milestones 2–5 revised and
pending.

Created: 2026-08-23

Revised against the implemented facet baseline: 2026-08-24

Independent review: Luna review completed and incorporated on 2026-08-23.

## Summary

`@genome-spy/webgpu-renderer` now has an intentional package surface and working
faceted rendering. Facet support established generic retained placement sets,
draw-level and per-instance placement indices, placement-aware clipping and
picking, logical text draw ranges, and operation within WebGPU's default
storage-buffer limit. Those are implemented contracts, not future prerequisites.

The renderer remains heavier than necessary underneath that API. Mark creation
still analyzes the same channels in several subsystems, generates the same WGSL
twice, creates duplicate shader modules and pipeline layouts for normal and
picking passes, and carries a general WGSL conditional parser for a handful of
built-in conditions. Scale-resource views and draw-global staging allocate
temporary objects on retained paths. Text uses a package-global font registry
even though each text program resolves only one font resource, and it expands
every logical string channel—including facet placement—to glyph cardinality.

The remaining work preserves all implemented features while deleting duplicate
compilation, global registration, broad preprocessing, and avoidable retained-
path allocation. It does not redesign working facet semantics merely to make
the implementation prettier.

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
landed early. Milestone 4 now addresses the unnecessary global registry and
side-effect entry point introduced by that implementation.

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

The placement shader markers added by the facet work are an intentional narrow
template contract. They may be simplified together with shader assembly, but
must not be replaced by implicit mark-name checks or a generic plugin system.

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
- Replace the general WGSL preprocessor with the narrow assembly used by the
  built-in marks and placement hooks.
- Remove repeated scale-resource derivation and temporary retained-path maps and
  typed arrays.
- Make font presets pure explicit values and remove package-global font state.
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

### Keep placement hooks; delete the conditional language

The explicit placement markers are simpler than embedding placement logic in
every mark or branching on mark identity. Keep a small required-marker injector
for those hooks. Emit optional `uniqueId`, ranged-text x/y, and similar built-in
fragments directly from JavaScript. Delete the parser for `#define`, nested
`#if`, `#elif`, Boolean expressions, and macro state.

### Do not add a scale-resource strategy layer

The implemented `ScaleDef` contract already owns validation, WGSL emission,
resource requirements, and update hooks, and facets now pass default binding
limits with that design. The previously proposed definition-local resource
strategy is discarded for this plan. Reuse existing analyses and the existing
resource map through direct lookups; introduce no second dispatch vocabulary.

Experimental custom `ScaleDef` values keep their current explicit contract and
must continue to fail loudly when required behavior is absent.

### Make font presets values, not registration effects

Core already passes its resolved `{ metrics, bitmap }` resource. Standalone
users should do the same by importing a pure Lato resource value. A global font
registry, mutable default, per-mark manager clone, and package `sideEffects`
exception are unnecessary for the implemented one-resource-per-mark API.

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

### Add definition-local scale resource strategies

Discarded. Existing `ScaleDef` metadata already drives the working resource
path. Reusing its compiled results is smaller than adding another interface and
dispatch layer.

### Keep font registration for convenient defaults

Rejected. An explicit exported Lato value is equally convenient, statically
traceable, and avoids mutable module state and a side-effect package exception.

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

## Milestone 2: Single compilation and narrow shader assembly

Status: Pending.

### Intended outcome

One mark construction normalizes and analyzes channels once, generates WGSL
once, creates one shader module and shared layouts, and derives normal and
picking pipelines from those shared objects. The general WGSL preprocessor is
gone.

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
- Replace built-in `#if defined(...)` blocks with direct fragments or explicit
  required markers. Retain the four placement hooks and validate each required
  marker exactly once.
- Delete `wgsl/preprocess.js` and its implementation-language tests.
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
  draw-level placement, and per-instance placement with hooks present/absent.
- Run the full renderer unit and GPU suites and focused Core WebGPU adapter and
  surface suites.
- Run all bundle fixtures and record source/module/minified/gzip deltas. The
  preprocessor module must disappear from every production graph.

### Documentation and migration

Update `packages/webgpu-renderer/MIGRATION_PLAN.md` when the milestone starts
and completes. No public API migration is expected.

### Review gate

Review the compiled-record boundary, normal/picking parity, generated layouts,
placement hooks, and shader diagnostics before merging.

### Tentative commit

`refactor(webgpu-renderer): compile mark shaders once`

## Milestone 3: Stable resource views and retained staging

Status: Pending.

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
  paths, including repeated guards or redundant derived collections.
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

### Documentation and migration

Update the migration plan's scale-resource and setter follow-ups to describe
only remaining measured work. No public documentation change is expected.

### Review gate

Review Milestones 3 and 4 together unless resource ownership changes beyond the
local maps and staging buffers described here.

### Tentative commit

`refactor(webgpu-renderer): reuse retained resource staging`

## Milestone 4: Pure explicit font resources

Status: Pending; optional font asset separation already completed in Milestone 1.

### Intended outcome

Text marks receive one explicit font resource. The Lato entry point exports that
resource as a pure value. The package has no global font registry, implicit
default mutation, per-mark registry clone, `internmap` dependency, or font-
related side-effect declaration.

### Work

- Change `fonts/lato` from registration-on-import to an exported immutable
  `FontResource` value.
- Pass the imported value explicitly in standalone examples, stories, tests,
  and bundle fixtures. Keep Core passing the resource resolved by Core's own
  font manager.
- Let text normalization and layout consume the supplied metrics directly.
  Remove `fontRegistry.js` and the per-mark `BmFontManager` lookup/clone when no
  second in-mark font consumer exists.
- Preserve `font`, style, and weight as text-layout metadata where needed, but
  do not use them to consult global renderer state.
- Keep `textLayout` callers responsible for the atlas and metrics needed at
  render time.
- Remove the package `sideEffects` exception and the unused `internmap` runtime
  dependency.

### Affected areas and downstream consumers

- Font resource/layout helpers, text program, package metadata and exports,
  standalone examples/stories, public type fixtures, and README.
- Core's adapter contract remains `{ metrics, bitmap }` and should need no
  renderer-font import.

### Verification

- Text layout/program tests cover explicit Lato, custom resources, precomputed
  layouts, atlas invalidation, replacement, and destruction.
- `textCustomFont` excludes Lato assets and all registry modules;
  `textLato` includes the resource, JSON, PNG, and license through a named
  import rather than a side effect.
- Package and bundle checks pass with `sideEffects: false` and no `internmap`
  dependency.
- Core default and custom fonts render through the existing adapter resource
  translation.

### Documentation and migration

Update the README from side-effect registration to explicit resource import.
The package is unpublished, so migrate all repository consumers atomically and
do not retain the registration path.

### Review gate

Combine with the Milestone 3 review unless the public font-resource shape
changes beyond the already exposed `{ metrics, bitmap }` contract.

### Tentative commit

`refactor(webgpu-renderer): make font presets pure resources`

## Milestone 5: Measured logical-string text storage

Status: Pending and independently discardable.

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

### Documentation and migration

No public API change is expected. Update internal text architecture comments to
distinguish logical series, logical draw ranges, and glyph instances.

### Review gate

Review the measured go/no-go decision before implementation. If accepted,
review the text data-layout contract, picking identity, replacement, and
placement interaction before merging.

### Tentative commit

`refactor(webgpu-renderer): index text channels by string`

## Footprint ratchets

Every accepted milestone must report production source lines, fixture module
graphs, minified bytes, and gzip bytes before and after. A fixture may grow only
with an explicit explanation tied to preserved behavior.

Working final targets from the post-facet baseline are:

- `pointLinear`: at or below 117,400 minified and 34,600 gzip bytes;
- `textCustomFont`: at or below 120,500 minified and 36,100 gzip bytes; and
- production JavaScript below the current 14,805 lines.

These targets recover a meaningful part of the implementation growth while
retaining facet capability. Revise them only with module-level evidence; do not
introduce abstraction or obscure code merely to meet a byte count.

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
  replacement, explicit Lato and custom fonts, asynchronous invalidation, and
  deterministic mark/placement/renderer destruction.
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
- The general WGSL preprocessor and global font registry are gone.
- Scale resources consume compiled requirements and bind directly from their
  single resource map without rebuilding derived maps.
- Repeated equal-capacity frames reuse draw-global CPU staging.
- The package has pure explicit font resources, `sideEffects: false`, and no
  unused `internmap` dependency.
- Milestone 5 is either accepted with its measurement and narrow contract or
  explicitly discarded with evidence.
- Type, unit, lint, bundle, package, GPU, and focused Core/App facet checks pass.
- Final footprint reports meet the working ratchets or contain a justified
  module-level revision.

## Risks and mitigations

- **Placement regression during shader cleanup:** Treat the implemented hook
  contract as first-class and run draw/per-instance placement in normal and
  picking passes for every mark family.
- **Compilation artifact becomes a framework:** Keep it a plain internal record
  passed explicitly between existing functions.
- **Shader diagnostics become harder to locate:** Preserve generated-source
  labels and test required marker counts while removing the preprocessor.
- **Scale update behavior drifts:** Reuse existing analysis and resource rules;
  do not redesign `ScaleDef` dispatch in this plan.
- **Retained staging obscures ownership:** Keep capacity and destruction beside
  the GPU resource it mirrors and accept state only when it replaces measured
  allocation.
- **Font convenience regresses:** Provide one explicit Lato resource import and
  migrate every standalone consumer in the same milestone.
- **Logical text indexing spreads complexity:** Require no new binding, no
  ordinary-mark accessor change, and net source deletion; otherwise discard it.

## Unresolved question

- Does the implemented 2,000-sample label workload show enough total
  packed-series and upload reduction to accept Milestone 5 under its no-growth
  constraints?

## External design references and provenance

- Node.js package exports define supported entry points and encapsulate other
  subpaths: <https://nodejs.org/api/packages.html#package-entry-points>
- npm's package `files` rules define the published file set:
  <https://docs.npmjs.com/files/package.json/>
- WebGPU exposes shader modules and render pipelines as separate objects,
  allowing one module to serve compatible pipelines:
  <https://www.w3.org/TR/webgpu/#shader-module-creation>

No external source code is copied or closely adapted by this plan.
