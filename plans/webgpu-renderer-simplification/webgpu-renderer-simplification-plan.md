# WebGPU renderer simplification and footprint plan

Status: Proposed; implementation not started.

Date: 2026-08-23

Independent review: Luna review completed and incorporated on 2026-08-23.

## Summary

`@genome-spy/webgpu-renderer` has a sound retained, code-first API and good
coarse-grained feature boundaries. Built-in marks and scales are imported
explicitly, definitions are immutable, the production dependency graph has no
cycles, and the existing bundle fixture excludes unrelated marks, scales, and
font support.

The implementation is nevertheless heavier than the public API suggests. Most
marks statically pull in a common compilation and resource-management kernel:
channel normalization and validation, channel analysis and IR, scale resource
planning, selection handling, WGSL preprocessing and assembly, pipeline
creation, packed-series management, and retained update slots. Text rendering
adds an embedded font, a per-mark font manager, logical-to-glyph expansion, and
mark-local font GPU resources.

This plan reduces package, JavaScript, startup, and runtime memory footprint
without removing renderer features or changing the Core/renderer ownership
boundary. It favors deleting generality and duplicate work over adding
registries, plugin frameworks, compatibility layers, or additional runtime
dispatch.

## Baseline

Measurements from the repository on 2026-08-23:

- Production JavaScript under `packages/webgpu-renderer/src`: 14,116 lines.
- Production module graph: 79 modules, 152 internal import edges, no cycles.
- `npm pack --dry-run`: 145 files, 814,087 bytes unpacked, 227,938 bytes in the
  tarball.
- Unit tests and test utilities published through `src/`: approximately
  145,000 bytes unpacked.
- Point implementation bundle: 100,575 bytes minified, 29,269 bytes gzip.
- Renderer + point + linear fixture: 110,413 bytes minified, 32,165 bytes gzip,
  spanning 42 renderer modules.
- Text implementation bundle with the embedded Lato resources: 218,084 bytes
  minified, 106,009 bytes gzip.
- TypeScript check: passes.
- Unit tests: 151 pass in 26 files.
- WebGPU Playwright tests: 50 pass in 10 files.
- Existing tree-shaking fixture: passes.
- Production `src/` lint: passes. Package-wide lint currently fails on browser
  globals in examples and GPU tests.
- `npm -w @genome-spy/webgpu-renderer run build`: fails because
  `prepublishOnly` references a missing `build` script.

These sizes are comparison baselines, not permanent budgets. Milestone 1 will
make the measurements reproducible and establish checked budgets. Later
milestones must ratchet those budgets down when their intended reductions land.

## Relationship to existing WebGPU plans

The active `plans/webgpu-core-integration/` documents own renderer/Core
integration, retained occurrence placement, facet parity, and resize ownership.
This plan owns renderer-internal simplification and package delivery.

The work must not:

- introduce a renderer scene graph or Core types;
- change facet placement semantics or revive discarded Layout 2.0 work;
- move grammar, scale resolution, dataflow, or scheduling into the renderer;
- make Core depend on renderer implementation modules; or
- block an already-authorized facet milestone solely to achieve a size target.

Milestone 1 may proceed independently because it changes packaging and public
entry points rather than GPU layout. Before Milestones 2–5 change shared GPU
contracts, reconcile this plan with the active facet plan in one review of
`BaseProgram`, shader inputs, draw globals, placement indices, resource layouts,
and binding limits. Neither plan is treated as fixed: change the facet design or
this plan wherever that produces the smaller shared contract, then record the
same decision in both documents.

The reconciled design must pass the WebGPU default-binding-limit gate without
the temporary elevated vertex-stage storage-buffer request. Removal can land in
either implementation sequence, but the plans must define one transition and
must not maintain parallel binding layouts.

## Goals

- Keep every currently implemented renderer feature available.
- Make the package export map an intentional, typed contract rather than an
  internal-source escape hatch.
- Stop publishing tests, test utilities, migration notes, and unrelated
  development artifacts.
- Generate each mark's WGSL and binding metadata once and reuse them for normal
  and picking pipelines.
- Delete the general-purpose WGSL preprocessor in favor of the narrow
  conditional assembly actually used by built-in marks.
- Compute normalized channel analysis once per mark construction and reuse it
  across validation, scale resources, selections, and shader generation.
- Make scale-specific resource code follow the imported scale definition so
  unrelated resource modes can be removed by tree shaking.
- Keep the embedded default font opt-in so custom-font text users do not carry
  the Lato atlas and metrics.
- Reduce avoidable per-frame and per-update allocation without adding multiple
  compatibility paths.
- Preserve normal rendering, picking, selections, dynamic values, scale
  updates, text replacement, deterministic destruction, and Core adapter
  behavior.

## Non-goals

- Removing marks, scales, selections, picking, text, or high-precision index
  support.
- Stabilizing a broad third-party custom-mark or custom-scale plugin API.
- Adding a global mark or scale registry.
- Replacing specialized mark shaders with an uber-shader.
- Adding asynchronous pipeline compilation or a renderer-wide pipeline cache
  before the duplicate per-mark compilation is removed and measured.
- Introducing separate packed and unpacked series-buffer modes.
- Sharing font GPU resources across marks in the initial text milestone;
  renderer-level caching requires its own ownership and lifetime decision.
- Redesigning the public retained handle, draw ordering, or occurrence
  placement API unless implementation exposes a concrete blocker.
- Optimizing code solely to reduce source line count when runtime behavior or
  maintainability would become worse.

## Key decisions

### Use explicit package entry points

Remove the catch-all `./*` export. Keep the package root focused on renderer
lifecycle and broadly used runtime API. Keep built-in marks and scales on their
existing explicit subpaths. Put advanced high-precision helpers and any
retained experimental scale-authoring helpers on explicit, typed subpaths.
Undocumented color, texture, hash-table, and compiler helpers remain internal
unless a concrete external consumer is identified during the export audit.

This follows Node's documented package-exports model: explicit subpaths define
the supported interface and prevent accidental imports of other files. npm's
documented package file filters will be used to exclude development artifacts.

### Reuse compiled artifacts without adding a compiler framework

Keep the existing `ChannelAnalysis` and `ChannelIR` concepts. Normalization
will return or retain the analyses it already computes, and later stages will
consume those values instead of calling `buildChannelAnalysis` again. Shader
assembly will produce one immutable result containing WGSL, binding entries,
resource layout, and any diagnostics needed by both render pipelines.

Do not add a public compiler object, service container, visitor hierarchy, or
mutable build context.

### Reuse one shader module and layout for normal and picking pipelines

Normal and picking pipelines use the same generated WGSL, vertex entry point,
bind-group layout, and pipeline layout. Build those once. Construct two render
pipelines with different fragment targets and blend state from the shared
artifacts. Do not make picking lazy in this milestone: a first-pick compilation
hitch is a separate tradeoff and should be based on measurement.

The WebGPU specification exposes shader modules and render pipeline creation as
separate objects/operations, so sharing the module and layouts does not require
custom behavior or copied implementation.

### Keep optional code beside the definition that selects it

Scale definitions already select validation, WGSL emission, stop normalization,
and domain-map behavior. First reuse cached channel analyses and resource
requirements, keep stable lookup maps, and split concrete color dependencies
where the bundle graph proves they are unnecessarily common.

Introduce a small internal resource strategy only if a measured prototype
removes more code or common bundle weight than it adds. Do not create a second
dispatch mechanism beside `ScaleDef`, and do not grow it with a large public
metadata vocabulary. Custom definitions must either use the retained existing
resource hooks or be intentionally narrowed in Milestone 1; they must not fall
through to silent or partially functional behavior.

### Make the bundled font an explicit preset

`textMark` will accept caller-provided font metrics and bitmap resources without
statically importing Lato. A separate `fonts/lato` entry point will export the
current embedded preset for standalone renderer users. Core must continue to
resolve fonts through its own font manager and pass the resulting metrics and
bitmap as `fontResource`; it must not import the renderer's Lato preset. A
custom-font consumer that does not import the preset must not include the Lato
PNG or JSON.

Use a normal `Map` with a normalized string key for the small font lookup table;
the current per-mark `InternMap` is unnecessary.

## Alternatives considered

### Keep the catch-all export and document private paths

Rejected. A wildcard keeps tests and internals importable and makes accidental
usage indistinguishable from a supported extension contract. Explicit entry
points give tooling and consumers a statically enumerable API.

### Add a feature-plugin system to improve tree shaking

Rejected. Runtime registration and dependency injection would broaden the API
and complicate construction. Built-in scale definitions already provide a
static selection point that bundlers can follow.

### Add a global pipeline cache immediately

Deferred. Sharing one shader module and layout inside each mark removes obvious
duplicate work. Cross-mark caching needs stable keys, lifetime ownership,
device scoping, and evidence that compatible programs recur often enough to
justify the complexity.

### Keep embedded Lato in `textMark` for convenience

Rejected as the only entry point. The preset remains available, but static
inclusion makes every custom-font text bundle carry approximately 90 KB of
font assets before encoding overhead and prevents precise package composition.

### Add an unpacked fast path for simple series

Rejected. The packed path solved binding-limit pressure and provides one
consistent update contract. Reusing staging capacity is preferable to
maintaining two layouts and shader-reader modes.

## Milestone 1: Package contract and reproducible footprint gates

Status: Pending.

### Intended outcome

The tarball contains only intentional runtime files and assets, every public
runtime export has matching types, internal paths are inaccessible through the
package export map, and bundle/package measurements are checked automatically.

### Work

- Inventory actual root and subpath imports in Core, examples, stories, tests,
  and documentation.
- Define explicit exports for the renderer root, built-in marks, built-in
  scales, high-precision helpers, optional font presets, and experimental
  scale authoring if it remains public.
- Remove the `./*` export and migrate all repository consumers to supported
  package specifiers or direct relative imports for package-internal tests.
- Remove undocumented root re-exports that have no external consumer, or move
  justified advanced exports to typed subpaths.
- Align JavaScript exports, declaration exports, README examples, and
  `test-types/publicApi.ts`, including the arrow mark and advanced helper
  subpaths.
- Remove public declaration references to implementation files, including the
  current `keyof typeof import("./marks/programs/...")` channel-name types.
  Export intentional public channel-name types or define them entirely within
  the declaration surface.
- Exclude `*.test.js`, `src/testUtils/`, plan files, test results, and other
  development-only files from the tarball. Keep required font licenses with
  exported font assets.
- Replace the missing `build` hook with one intentional delivery command. It
  must at least run declaration checks, bundle checks, and `npm pack --dry-run`;
  it need not transpile source solely to create a `dist/` directory.
- Make the tree-shaking fixture import public package specifiers and report
  minified and gzip sizes including bundled runtime dependencies. Store exact
  fixture sources for `rendererOnly`, `pointLinear`, `pointOrdinal`,
  `customIdentityMark`, `textCustomFont`, and `textLato`.
- Pin the measurement implementation: use the repository's locked Rollup
  version with a locked minifier, ESM/browser output, dependency bundling, and
  a Rollup module graph; compress the emitted bytes with `gzip -9`. Print tool
  versions and flags in the report so local and CI results are comparable.
- Establish checked initial budgets from the reproducible fixture, then record
  the expected ratchets for Milestones 2–4.
- Configure lint environments so the documented package-wide lint command is
  green for source, examples, stories, and browser GPU tests.

### Affected areas and downstream consumers

- `packages/webgpu-renderer/package.json`, README, declaration files, bundle
  scripts, examples, stories, and type fixtures.
- Core's WebGPU adapter import of high-precision helpers.
- No runtime renderer behavior or GPU layout changes.

### Verification

- `npm -w @genome-spy/webgpu-renderer run test:tsc`
- `npm -w @genome-spy/webgpu-renderer run test:bundle`
- The new delivery/build command.
- `npm pack --dry-run --json --workspace @genome-spy/webgpu-renderer`
- `npx eslint packages/webgpu-renderer/`
- Focused Core WebGPU adapter type and unit tests.
- Verify that the packed file list contains no tests, test utilities, plans, or
  generated test results.
- Verify that imports of documented subpaths succeed and representative
  internal subpaths fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

### Documentation and migration

- Update the README public-surface and high-precision sections to use package
  specifiers rather than `src/index.js`.
- Document advanced/experimental subpaths explicitly and keep internal helpers
  undocumented.
- Record the export-map change as breaking but acceptable for the unpublished
  package.

### Review gate

Review the public export list, declaration coverage, Core imports, and packed
file list before merging. This is the only public-contract review required for
the low-risk packaging work.

### Tentative commit

`refactor(webgpu): tighten renderer package exports`

## Milestone 2: Single mark compilation and minimal shader assembly

Status: Pending.

### Intended outcome

One mark construction performs channel analysis and WGSL assembly once, creates
one shader module and shared layouts, and derives normal and picking pipelines
from those artifacts. The general-purpose shader preprocessor is removed.

### Work

- Start shared GPU-layout work only after the simplification and facet plans
  record the same accepted `BaseProgram`, placement-index, shader-input, and
  binding contract. Either plan may change during that reconciliation.
- Create one immutable internal `CompiledMarkChannels` artifact containing the
  normalized channels, one `ChannelAnalysis` per normalized channel, channel
  IR, resource requirements, and public/input name mappings needed downstream.
- Build that artifact once and pass it into scale validation, selection
  resolution, resource planning, and shader assembly. Validation performed
  during normalization must contribute to the same artifact rather than cause
  later re-analysis.
- Split pure shader/layout compilation from render-pipeline creation.
- Create one shader module, mark bind-group layout, and pipeline layout per mark
  program; use them for both normal and picking pipelines.
- Replace production `#if defined(...)` blocks with explicit optional shader
  fragments or a narrow helper that supports only the built-in conditions.
- Delete `wgsl/preprocess.js` and rewrite its tests around the selected narrow
  assembly helper or remove them when direct template assembly needs no helper.
- Keep mark-specific shaders specialized; do not merge shader bodies.
- Correct the interpolator extent calculation and add focused color utility
  coverage. Decide and document whether RGBA stop alpha is supported; preserve
  it if the accepted input type continues to include alpha.

### Affected areas and downstream consumers

- `BaseProgram`, pipeline builder, mark shader builder, channel analysis/IR,
  channel config resolver, selection resources, and mark shader bodies.
- All built-in marks, normal rendering, picking, and GPU shader tests.
- No public handle or Core adapter shape change.

### Verification

- Focused unit suites for channel validation/IR, shader generation, pipeline
  creation, renderer drawing, and color utilities.
- A pipeline-builder test proving one compiled shader artifact is reused for
  both pipeline descriptors without testing private call counts unnecessarily.
- A focused architecture-contract test proving downstream stages receive the
  same `CompiledMarkChannels` identity and each normalized channel is analyzed
  once. Keep this narrow; other tests should assert behavior rather than calls.
- Full renderer unit suite and all 50 WebGPU Playwright tests.
- Compare generated WGSL for point, rect, rule, link, arrow, and text with
  representative optional channels present and absent.
- Rerun bundle checks and ratchet the point+linear budget to the achieved
  reduction from deleting unused preprocessor capability.

### Documentation and migration

- No user-facing API documentation change is expected.
- Update `packages/webgpu-renderer/MIGRATION_PLAN.md` when this phase starts and
  completes; remove obsolete preprocessor or duplicate-pipeline notes.

### Review gate

Review normal/picking parity, generated binding layouts, shader diagnostics,
and the interaction with the reconciled placement shader inputs before merging.

### Tentative commit

`refactor(webgpu): compile mark shaders once`

## Milestone 3: Measured scale-resource and hot-path simplification

Status: Pending.

### Intended outcome

Repeated scale analysis and lookup work is removed, optional concrete
dependencies are split where measurement justifies it, and bind-group rebuilds
and draw-global writes avoid obvious temporary allocation. A new strategy
boundary exists only if it demonstrates a net simplification.

### Work

- Remove repeated `getScaleResourceRequirements`, stop-length, range-texture,
  and analysis derivation by consuming `CompiledMarkChannels`.
- Keep stable ordinal-range, domain-map, and range-texture lookup maps instead
  of rebuilding maps from `_channelResources` during each bind-group rebuild.
- Split concrete d3 color/interpolation imports from paths that do not need
  them when the pinned module graph identifies an avoidable common dependency.
- Prototype definition-local resource strategies only after the preceding
  deletions. Adopt them only if the diff and bundle report show that they
  remove real shared code without adding parallel dispatch or more concepts.
- Preserve one explicit custom-`ScaleDef` resource contract. Use the existing
  metadata/hooks if sufficient; otherwise narrow the experimental authoring
  surface in Milestone 1. Fail fast for unsupported custom definitions.
- Retain a capacity-sized CPU array for draw globals and fill it directly,
  avoiding a new typed array and per-draw temporary array every frame.
- Reuse fixed-size stop/range scratch storage when doing so reduces allocation
  without complicating the slot contract.
- Keep the packed-series implementation as the only data-buffer path. Reuse
  packed staging capacity only if a focused benchmark shows series replacement
  is material and the change does not add a second layout mode.
- Continue enforcing the reconciled plans' default binding-limit gate. Do not
  restore the temporary elevated storage-buffer request.

### Affected areas and downstream consumers

- Scale definitions, scale resources, scale stops, color/texture utilities,
  bind-group builder, renderer draw globals, and possibly series buffers.
- Every built-in scale and scale update slot.
- Core scale-domain/range updates and selection-driven conditional scales.

### Verification

- Focused scale definition, stop, resource, slot, bind-group, and renderer
  tests.
- GPU coverage for continuous, piecewise, threshold, quantize, ordinal, band,
  index, color-ramp, and conditional-scale paths.
- Run the exact Milestone 1 fixtures and compare both bytes and module graphs.
  Confirm that `pointLinear` excludes ordinal domain maps/buffers and that the
  purpose-built `customIdentityMark` fixture excludes d3 color/interpolation.
  Do not use point+identity as the identity fixture because the built-in point
  program statically selects linear defaults.
- Ratchet the pinned `pointLinear` baseline by at least 10% minified and 5%
  gzip across accepted Milestones 2–3, or record module-level evidence that a
  smaller reduction is the honest limit. Do not add abstractions or distort the
  design solely to meet the target.
- Run Core WebGPU adapter and surface tests to verify retained slot behavior.

### Documentation and migration

- Update the experimental scale-authoring documentation only if the resource
  strategy is intentionally exposed.
- Update `MIGRATION_PLAN.md` to replace the current scattered scale-resource
  follow-ups with the completed ownership model.

### Review gate

Review cached-analysis ownership, every built-in definition, default-binding
evidence, public experimental authoring implications, and Core update behavior.
If a strategy boundary is proposed, review its prototype diff and module graph
before accepting it.

### Tentative commit

`refactor(webgpu): simplify scale resource paths`

## Milestone 4: Optional embedded font and smaller text ownership

Status: Pending.

### Intended outcome

Importing `textMark` with a caller-provided font does not include the embedded
Lato PNG, metrics JSON, or `internmap`. Importing the explicit Lato preset
preserves the current standalone appearance. Core preserves its current
appearance by continuing to pass the font resource resolved by Core.

### Work

- Add an explicit, typed `fonts/lato` entry point containing the current metrics
  and bitmap preset plus its license.
- Remove the static Lato imports from the generic font manager/text program.
- Replace `InternMap` with a plain `Map` keyed by normalized
  family/style/weight.
- Require an explicit renderable font resource when the renderer performs text
  layout or rendering. Preserve the existing `textLayout` path, but do not
  imply that precomputed geometry removes the need for render-time atlas and
  metrics data.
- Keep Core's current font ownership: its font manager resolves both default
  and custom fonts, and the WebGPU adapter passes `{ metrics, bitmap }` as
  `fontResource`. Core must not import `fonts/lato` from this package.
- Update standalone text and ranged-text examples.
- Keep atlas and glyph metrics mark-local in this milestone; record measured
  duplication before proposing shared renderer-level font resources.

### Affected areas and downstream consumers

- Text mark/program, font manager, font assets and licenses, package exports,
  examples, README, and Core's WebGPU text adapter.
- Text layout, asynchronous atlas loading, invalidation, text replacement, and
  destruction.

### Verification

- Text layout and text-program unit tests for explicit Lato, custom font,
  precomputed layout, async atlas invalidation, replacement, and destruction.
- Structured bundle fixtures proving generic `textMark` excludes Lato assets
  and `internmap`, while `textMark` + `fonts/lato` includes them.
- Text geometry GPU test plus rendered text and ranged-text smoke examples.
- Core adapter tests proving default and custom resources both cross the
  boundary as renderer-neutral `fontResource` values.
- `npm pack --dry-run` confirms the Lato license accompanies the preset.

### Documentation and migration

- Document explicit default-font usage and custom font resources in the README.
- Treat the missing implicit default as a breaking prototype API change and
  migrate every repository consumer in the same milestone.

### Review gate

Review the text API migration, Core default rendering, asset loading behavior,
font licensing, and generic/custom-font bundle graphs before merging.

### Tentative commit

`refactor(webgpu): make the embedded font optional`

## Milestone 5: String-indexed text series

Status: Pending; independently discardable if measurements do not justify the
additional shader/data-layout contract.

### Intended outcome

Logical per-string channels remain stored once per string instead of being
expanded to every glyph and then packed again. Text has an explicit dual-count
contract: glyph count determines drawing, while logical string count determines
packed visual-channel storage. Glyph instances use `stringIndex` to read their
parent string's attributes.

### Work

- Measure CPU allocation, upload bytes, and GPU storage for representative
  short labels, long labels, and approximately 2,000 sample labels before
  implementation; keep this measurement within the milestone rather than as a
  separate phase.
- Add one text-only series-index indirection. `TextProgram` keeps `drawCount`
  equal to glyph count and constructs packed series with `logicalCount` equal
  to string count; this must not become a general join or dataflow feature.
- Keep glyph IDs, glyph offsets, and `stringIndex` in glyph-level geometry.
  Keep visual inputs, conditional inputs, unique IDs, and high-precision source
  values in string-level packed series. Text shader readers translate the draw
  index through `stringIndex` before reading those series.
- Define replacement semantics explicitly: new text recomputes both counts,
  validates every logical series against `logicalCount`, rebuilds glyph
  geometry, and updates draw bounds from `drawCount`.
- Ensure all glyphs of one string share its selection/picking identity and that
  visibility predicates and conditional channels evaluate at string level.
- Remove `expandTextSeries`, `expandTextSeriesArrays`, their alias caches, and
  per-glyph copies of logical channel arrays.
- Preserve conditional series channels, high-precision index inputs, dynamic
  values, text replacement, empty strings, and picking IDs.
- If implementation requires mixed cardinalities inside one generic packed
  buffer, extra per-type logical bindings, changes to every non-text accessor,
  or ambiguous interaction with placement indexing, mark this milestone
  discarded with evidence and retain the simpler expansion path.

### Affected areas and downstream consumers

- Text program/layout, packed-series metadata, shader channel readers, picking,
  conditional branches, and Core sample-label rendering.
- Potential interaction with the separate facet placement index; the two
  indices must have distinct names and ownership.

### Verification

- Existing text-program unit tests rewritten around logical string-level
  storage rather than per-glyph implementation details.
- GPU text geometry, normal rendering, and picking tests with multi-glyph
  strings and repeated/empty strings.
- Conditional channels, visibility/selection predicates, shared per-string
  picking IDs, high-precision inputs, and replacement between different string
  and glyph counts.
- Core sample-label example with approximately 2,000 labels after the facet
  placement milestone is available.
- Record before/after CPU bytes, GPU bytes, upload bytes, and replacement time.
  Accept only if memory/upload reduction is material and the accessor contract
  remains narrow.

### Documentation and migration

- No public API change is expected.
- Update internal text architecture comments to describe string-level series
  and glyph-level geometry.

### Review gate

Review the data-layout contract, placement-index interaction, picking identity,
and measured complexity/performance tradeoff before merging. This milestone may
be discarded without blocking retirement of Milestones 1–4.

### Tentative commit

`refactor(webgpu): index text channels by string`

## Final integration verification

After the accepted milestones are complete:

- Run all renderer TypeScript, unit, lint, bundle, packaging, and WebGPU GPU
  checks.
- Run workspace TypeScript checks and focused Core WebGPU adapter, surface,
  rendering-context, and mark translation tests.
- Exercise standalone point, piecewise, threshold, index, text, ranged-text,
  rule, link, arrow, and hatch scenes.
- Verify normal and picking order with repeated retained handles, scissors,
  viewports, visible ranges, and partial instance ranges.
- Verify dynamic scale domains/ranges, conditional encodings, all selection
  types, text replacement, custom font loading, invalidation, and deterministic
  mark/renderer destruction.
- Rerun the reconciled facet plan's representative ordinary-facet and
  approximately 2,000-sample App scenarios to ensure shader/resource
  simplification did not change placement or binding budgets.
- Compare final package and bundle reports with the baseline and explain every
  remaining large common module. Added code is acceptable only where it clearly
  replaces duplication, improves ownership, or enables demonstrated
  tree-shaking.
- Reconcile every pending milestone as completed or discarded, commit that
  record, and delete this temporary plan in a later commit before PR merge.

## Overall acceptance criteria

- All current renderer features remain available through intentional entry
  points and repository consumers use no internal package paths.
- The packed tarball contains no tests, test utilities, plan files, generated
  test results, or undocumented source escape hatch.
- The delivery command, package-wide lint, type checks, unit tests, GPU tests,
  and bundle checks pass.
- Runtime exports and declarations agree for every public entry point.
- One mark construction generates one shader artifact and one shader module;
  normal and picking pipelines share compatible layouts.
- The general-purpose WGSL preprocessor is gone.
- One immutable compiled-channel artifact is reused by validation, resources,
  selections, and shader generation; each normalized channel is analyzed once.
- Repeated scale-resource derivation is gone, and representative bundle
  fixtures exclude unrelated modes and concrete dependencies. Any new strategy
  boundary has measured net benefit.
- Custom-font text does not include the embedded Lato assets or `internmap`.
- Core continues to provide its own resolved font resources and does not import
  the renderer's standalone Lato preset.
- Renderer/Core boundaries and the jointly reconciled facet-placement contract
  remain coherent and within default WebGPU binding limits.
- Final size reports show a material reduction from the baseline, with the
  `pointLinear` ratchet from Milestone 3 met or explicitly revised using
  module-level evidence.

## Risks and mitigations

- **Public export breakage:** The package is unpublished, but Core and examples
  can still drift. Inventory imports first and enforce supported subpaths in
  type and bundle fixtures.
- **Shader/picking divergence:** Share one compiled shader artifact and retain
  full normal/picking GPU coverage.
- **Scale behavior drift:** Simplify cached analysis and lookup first. If a
  strategy prototype is accepted, move one resource mode at a time while
  running unit and GPU parity for every scale family.
- **Bundle-driven over-abstraction:** Prefer deletion and static definition
  imports. Do not add runtime registration to satisfy a byte target.
- **Text default regression:** Keep the same standalone Lato preset, preserve
  Core's existing font ownership, and migrate renderer examples atomically.
- **Facet integration conflicts:** Reconcile both mutable plans before shared
  implementation, record one contract in both, and verify binding layouts and
  sample scenarios together.
- **Hot-path optimization increases state:** Accept reusable staging only when
  ownership and capacity rules stay local and measurable.

## Unresolved questions

- Should experimental scale authoring remain public now, or should only
  built-in definitions be supported until a second consumer exists?
- Should `setDebugResourcesEnabled` remain on the package root after its state
  is moved out of `BaseProgram`, or live on a `debug` subpath?
- Should `fonts/lato` be the only standalone convenience entry point, or should
  the package also expose an explicitly named preconfigured text-mark helper?
- After packed-series and placement work, does any representative mark still
  require more than the WebGPU default storage-buffer binding limit?
- Is string-indexed text data sufficiently beneficial after measurement to
  justify its narrow accessor indirection?

## External design references and provenance

- Node.js package documentation recommends explicit package exports to define
  supported entry points and encapsulate other subpaths:
  <https://nodejs.org/api/packages.html#package-entry-points>
- npm package documentation defines `files` and `.npmignore` controls for the
  published file set:
  <https://docs.npmjs.com/files/package.json/>
- The WebGPU specification defines shader modules and render pipeline creation
  as separate objects/operations, supporting reuse of one module across
  compatible pipelines:
  <https://www.w3.org/TR/webgpu/#shader-module-creation>

No external source code is copied or closely adapted by this plan.
