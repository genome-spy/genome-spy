# WebGPU shared program resources plan

Status: In progress

## Context

Core already retains one renderer mark for repeated occurrences and facets of
the same semantic mark. Separate Core marks still create separate WebGPU
programs even when they generate identical WGSL and binding layouts.

App metadata titles expose the duplication clearly. Every metadata attribute
creates an independent singleton text mark. Today each one creates its own
shader module, bind-group layout, pipeline layout, visible pipeline, picking
pipeline, and text/font GPU resources. The title string itself becomes glyph
data and does not normally make the shader different.

The first optimization should therefore share only immutable program objects.
It is narrow, renderer-owned, and does not change Core views, marks, layout,
paint order, clipping, or lifecycle. Lazy picking is a small follow-up on the
same cache. Font pooling remains conditional because its asynchronous loading
and ownership rules are substantially more complicated and overlap future font
work in issue #362.

## Prior art and provenance

Babylon.js uses renderer-owned WebGPU pipeline and sampler caches based on
rendering state rather than draw-object identity:
<https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUInternals/webGPUOverview.md>.
The WebGPU specification also notes that reusing an explicit pipeline layout
can avoid internal resource rebinding:
<https://www.w3.org/TR/webgpu/#pipeline-layout>.

GenomeSpy will use its own existing WGSL and descriptor construction directly.
No third-party source code will be copied or closely adapted.

## Goals

- Reuse shader modules, bind-group layouts, pipeline layouts, and visible and
  picking pipelines across exactly equivalent renderer programs.
- Keep every mark's mutable buffers, uniforms, bind group, scales, selections,
  text layout, update slots, and lifetime independent.
- Avoid creating a picking pipeline for a program variant that is never used
  for picking, provided the change remains trivial after pipeline sharing.
- Measure the remaining duplicated font resources before deciding whether a
  same-device GPU font pool is justified.
- Keep the required implementation small enough to audit as a local renderer
  optimization.

## Non-goals

- Merging independent Core marks or metadata titles into one semantic mark.
- Adding Core-side shader keys or renderer-internal imports.
- Building a generic descriptor-caching framework for hypothetical pipeline
  states that the renderer does not have.
- Sharing mutable mark resources or bind groups.
- Cross-renderer, cross-device, persistent, or native driver caches.
- Changing the synchronous `createMark()` API or adopting
  `createRenderPipelineAsync()`.
- Implementing font registration, shaping, atlas generation, or persistent
  font caching from issue #362.
- Adding cache eviction before a real workload demonstrates variant growth.

## KISS constraints

The implementation should remove O(mark count) GPU program creation without
introducing a second shader representation or a general resource manager.

- Milestones 1 and 2 together should target roughly 200–300 net new non-test
  lines. Exceeding that range is a review signal, not permission to enlarge the
  abstraction.
- The program cache should be one renderer-owned map or a similarly small
  internal helper. It must not become a public API.
- Existing normalized shader output and the small fixed pipeline-state tuple
  remain the source of truth. Do not add reflection, deep equality, a generic
  serializer, or a reusable cache framework.
- Add only counters needed to prove resource reduction. Do not create a
  permanent profiling subsystem for this change.
- Measure focused line counts and `git diff --stat` after each milestone.
- Font pooling has its own evidence and size gate and is not required to
  complete the program-sharing work.

## Key decisions

### Cache the objects produced by the current pipeline builder

Split the current `buildPipelines()` work into two direct steps:

1. Generate WGSL and the mark resource/bind-group description as today.
2. Look up or create the immutable WebGPU program objects for that exact
   generated shape.

The cache entry contains:

- `GPUBindGroupLayout`;
- `GPUPipelineLayout`;
- `GPUShaderModule`;
- visible `GPURenderPipeline`;
- picking `GPURenderPipeline`, initially eager and made optional in milestone
  2; and
- immutable `resourceLayout` metadata used by each program to create its own
  bind group.

The cache key is deliberately narrow:

- exact generated WGSL;
- ordered bind-group layout entries or an equivalent deterministic signature;
- render and picking target formats;
- primitive topology; and
- whether the placement bind-group layout participates.

These are all variable inputs to the current pipeline descriptors. The global
and placement layout objects are renderer-singletons, and blend state and
entry points are currently fixed. If a future change makes another descriptor
field variable, that change must extend the key and add a focused miss test.
Keep key construction beside pipeline descriptor construction so the two do
not drift.

Use exact strings and primitive tuple values. A hash may label entries for
debugging but must not decide equality. Freeze `resourceLayout` or give each
program a shallow copy.

### Keep cache lifetime equal to renderer lifetime

Programs borrow the cached immutable objects and continue to own all mutable
resources. Destroying a mark does not touch the cache. Shader modules, layouts,
and pipelines have no explicit `destroy()` operation, so reference counting
would not release them earlier. Renderer/device destruction releases all of
them naturally.

Shared shaders and pipelines can no longer carry one Core mark's owner label.
Use a renderer-owned template label such as
`webgpu-renderer: program template <id> pipeline`. Keep Core-derived labels on
mark-owned buffers and bind groups.

### Make picking lazy only if it stays local

Milestone 1 first shares the current eager picking pipeline so caching and
laziness are not debugged simultaneously. Milestone 2 changes the cached
picking field to an optional value and creates it in a small template method
called by `BaseProgram.drawPick()`.

The ordinary visible draw path must not gain a cache lookup. If laziness needs
a public `pickable` flag, asynchronous construction, a new host lifecycle, or
more than a small optional-field/getter change, discard milestone 2. Sharing
already reduces title picking pipelines from one per title to one per program
variant.

### Gate font pooling on measured benefit

After program sharing, count atlas textures/uploads, samplers, and glyph-metric
buffers in representative metadata views. Proceed only if common workloads
retain many equivalent text programs and the duplicated decoded atlas memory
or cold-start work remains material.

If the gate passes, use the smallest renderer-lifetime pool that can share the
current immutable font assets by metrics identity plus bitmap URL/value or
bitmap identity. Strings, glyph instances, and string metrics stay per mark.
The pool must remain internal and must not define the future public font model.

Before that work begins, reword the migration backlog so issue #362 owns font
registration, shaping, atlas generation, and persistent/public caching, while
this proposal covers only same-device GPU object pooling.

## Alternatives considered

### Cache only shader modules

Rejected because duplicate render pipelines and layouts remain. The current
builder creates the complete immutable group together, so sharing that group is
both simpler and more useful.

### Canonicalize complete generic WebGPU descriptors

Rejected for now. The current pipeline state is small and mostly fixed. A
generic object-free descriptor model would add more code than the cache and
would duplicate the descriptors it is meant to describe. Focused key tests are
enough until the renderer supports materially more variable pipeline state.

### Aggregate metadata titles in Core

Rejected for this optimization. It would couple independent view layout,
clipping, ordering, and disposal merely to save renderer resources.

### Implement font pooling together with the program cache

Deferred behind evidence. Font pooling can save significant GPU memory, but it
introduces asynchronous load sharing, stable texture identity, borrowed
resource ownership, and issue #362 coordination. Those concerns should not
delay or inflate the straightforward pipeline cache.

## Risks

- **A missing key field could reuse an incompatible pipeline.** Keep the key
  beside the current fixed descriptor construction and require a miss test
  whenever a descriptor input becomes variable.
- **Shared labels lose direct mark ownership.** Use template labels for shared
  objects and preserve Core owner labels on per-mark resources.
- **The cache could grow with shader variants.** Count entries in debug mode.
  Do not add eviction unless a real long-lived workload demonstrates growth.
- **First-use picking creation could cause input latency.** Keep eager creation
  if the focused GPU test or interaction benchmark shows a meaningful pause.
- **Font work could be rewritten by issue #362.** Do not implement it unless
  current GPU duplication is material, and keep the pool behind the renderer's
  normalized internal font entry.

## Unresolved questions

- How many distinct program variants do realistic metadata views produce after
  exact WGSL-based sharing?
- Is first-use picking pipeline creation measurable on supported browsers?
- After pipeline sharing, are duplicate font textures/uploads a material part
  of launch time or GPU memory in realistic App datasets?

## Milestone 1: Share equivalent program objects

### Intended outcome

Equivalent marks keep independent handles and mutable resources but reuse one
shader module, bind-group layout, pipeline layout, visible pipeline, and eager
picking pipeline per renderer.

### Work

- [x] Add a small renderer-owned program-template cache.
- [x] Refactor `pipelineBuilder.js` to generate the existing WGSL/resource
      shape, construct the focused key, and create objects only on a miss.
- [x] Exclude labels, mark IDs, data, uniforms, and GPU buffer identities from
      the key.
- [x] Freeze or shallow-copy shared `resourceLayout` metadata.
- [x] Give shared objects renderer-template labels while retaining per-mark
      labels on mutable resources.
- [x] Add shader-module and cache hit/miss counters beside the existing pipeline
      counter, only when debug profiling is enabled.
- [x] Record focused production/test line counts and resource counts.

Implementation record:

- Production code grew by 85 lines across the pipeline builder, renderer, base
  program, and new cache helper; focused tests/support grew by 138 lines and
  renderer documentation by 2 lines.
- Two equivalent builds now create one bind-group layout, one pipeline layout,
  one shader module, and two render pipelines, with one cache miss and one hit.
  Previously they created two layouts of each kind, two shader modules, and
  four render pipelines.

### Affected areas and downstream consumers

- `packages/webgpu-renderer/src/renderer.js`
- `packages/webgpu-renderer/src/marks/programs/internal/baseProgram.js`
- `packages/webgpu-renderer/src/marks/programs/internal/pipelineBuilder.js`
- focused renderer cache/pipeline tests and GPU-label documentation

Core, App, WebGL, Canvas2D, and SVG behavior remains unchanged. No public
renderer API should change.

### Verification

- Equivalent point, rect, and metadata-style text programs have different mark
  handles, uniform buffers, and bind groups but share the cached objects.
- Two equivalent programs create one shader module and two pipelines total,
  rather than two shader modules and four pipelines.
- Changes to WGSL, bind-group entries, target formats, topology, or placement
  participation cause cache misses.
- Destroying either borrower leaves the other usable; renderer destruction
  remains idempotent.
- Existing scale, selection, placement, retained-update, text, and picking
  tests pass.
- Run renderer unit tests, type checks, lint, GPU tests, and tree-shaking/bundle
  fixtures.

### Documentation and migration

- Update the renderer README to distinguish shared immutable program objects
  from per-mark mutable resources.
- Update GPU-label documentation and exact-label tests.

Tentative commit:
`perf(webgpu-renderer): share equivalent program objects`

### Review gate

Review the key against every variable used by the current pipeline descriptors,
then review custom program behavior, placement, selections, and bundle
boundaries. Reject abstractions that are larger than the duplicated creation
path they replace.

## Milestone 2: Optionally create picking pipelines on demand

### Intended outcome

Program variants that never participate in picking create no picking pipeline,
without changing renderer or Core lifecycle contracts.

### Work

- [x] Store the cached picking pipeline as optional and create it once from the
      already shared module and layout when `drawPick()` first needs it.
- [x] Keep the visible draw path unchanged.
- [x] Distinguish visible and picking pipeline creation in focused tests or
      existing debug counters.
- [x] Exercise first-use picking in the real-GPU suite and measure focused
      line-count growth.
- [x] Retain this milestone because it requires no public option, async
      lifecycle, or more than a small local change.

Implementation record:

- Production code grew by 5 lines and focused tests by 6 lines relative to
  milestone 1.
- Visible creation now creates one render pipeline. The first picking draw
  creates the second pipeline, and equivalent programs reuse both.
- All 67 real-GPU tests passed, including first-use point, link, and text
  picking. This is a first-use smoke gate rather than a stable latency
  microbenchmark; the supported test environment showed no observable
  regression or timeout.

### Affected areas and downstream consumers

- the milestone 1 cache/template helper
- `BaseProgram.drawPick()`
- renderer picking tests and the Core WebGPU interaction benchmark

### Verification

- Visible creation/drawing produces no picking pipeline.
- The first picking draw creates one pipeline; later equivalent programs reuse
  it.
- Picking IDs, scissoring, placements, draw ranges, and readback remain
  correct.
- Metadata titles remain non-picking participants and never trigger creation.

### Documentation and migration

- Document lazy picking only if the milestone is retained.
- No Core, schema, or App documentation changes are needed.

Tentative commit:
`perf(webgpu-renderer): create picking pipelines on demand`

## Milestone 3: Evidence-gated font GPU pooling

### Intended outcome

Only if measurement justifies it, text programs using the same normalized font
share immutable same-device atlas, sampler, and glyph-metric GPU resources.

### Entry gate

Proceed only when a representative metadata workload demonstrates all of the
following after milestones 1 and 2:

- many simultaneously retained text programs use the same normalized font;
- atlas textures/uploads and glyph-metric buffers still scale with text-mark
  count rather than font count; and
- the duplicated GPU memory or cold-start work is material enough to justify a
  separate ownership boundary.

Otherwise mark this milestone discarded and leave font resources per program
until issue #362 supplies a clearer font lifecycle.

### Work if accepted

- [ ] Reword the migration backlog to separate same-device GPU pooling from
      issue #362's registration, shaping, atlas-generation, and persistence
      scope.
- [ ] Add the smallest renderer-lifetime pool keyed by normalized metrics and
      bitmap identity/value.
- [ ] Share only immutable atlas, sampler, and glyph-metric resources; retain
      per-mark glyph/string buffers and bind groups.
- [ ] Preserve a stable transparent atlas texture during asynchronous loading,
      validate decoded dimensions, and settle failures without unhandled
      rejections.
- [ ] Keep pool destruction renderer-owned and cover device loss and late
      asynchronous completion.
- [ ] Stop if implementation requires a public BMFont cache contract or grows
      beyond roughly 150–200 non-test lines; defer instead to issue #362.

### Affected areas and downstream consumers

- `packages/webgpu-renderer/src/renderer.js`
- `packages/webgpu-renderer/src/marks/programs/textProgram.js`
- internal normalized font-resource helpers and text tests
- `packages/webgpu-renderer/MIGRATION_PLAN.md`

### Verification if accepted

- Equivalent text programs create one atlas texture/upload, sampler, and
  glyph-metric buffer per font while retaining independent text layouts.
- Atlas readiness does not replace texture identity or rebuild every bind
  group.
- Different normalized font resources do not share.
- Load failure, dimension mismatch, partial construction, device loss, and
  renderer destruction cause no leaks, double destruction, or unhandled
  rejection.
- Text unit/GPU tests, type checks, lint, and font tree-shaking fixtures pass.

### Documentation and migration

- Document only the internal renderer-lifetime GPU pool.
- Keep public font registration, shaping, generation, and persistence deferred
  to issue #362.

Tentative commit if accepted:
`perf(webgpu-renderer): pool immutable font GPU resources`

## Acceptance criteria

- Required scope: equivalent programs share immutable WebGPU program objects
  while retaining independent mark state and behavior.
- Required scope stays within the KISS constraints or is simplified before
  completion.
- Lazy picking is retained only if it stays local and introduces no observable
  first-pick regression.
- Font pooling is implemented only after its entry gate passes; otherwise the
  plan records it as discarded rather than incomplete.
- Core never supplies renderer cache keys or imports renderer internals.
- Debug resource counts prove O(program variants), not O(mark count), shader
  module and pipeline creation for equivalent metadata titles.
- Renderer public imports remain tree-shakeable and all focused unit, GPU,
  type, and lint checks pass.

## Final integration verification

- Smoke-test `examples/app/metadata-data-source.json` and
  `examples/app/metadata-hierarchy.json` under WebGPU. Verify flat, leaf, and
  group titles, reserved/rotated layout, clipping, metadata interactions, and
  absence of title picking.
- Smoke-test `examples/core/marks/text/ranged_text.json` for ordinary text and
  picking.
- Compare representative WebGL output; WebGL shader caching remains unchanged.
- Record before/after program variants, shader modules, visible/picking
  pipelines, and—only for milestone 3—font GPU resources.
- Run the renderer unit/GPU/type/lint/bundle checks and focused Core WebGPU
  adapter, surface, retained-frame, text, and picking suites.
- Review total production and test line-count deltas. Added code must remain
  proportionate to the eliminated resource creation.

The plan is temporary. Before PR creation, reconcile every checkbox as
completed or discarded, commit that record, and delete the plan in a later
commit.
