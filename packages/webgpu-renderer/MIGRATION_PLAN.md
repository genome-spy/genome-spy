# WebGPU renderer migration backlog

Status: Core retained-frame optimization is complete; the independent package
parity and cleanup backlog remains ongoing.

Core submits renderer-neutral semantic scopes. The renderer derives immutable
rectangle edge-AA modes from normalized channel configs and forms any required
multisample layers itself; explicit sample counts are not part of the public
frame contract.

Completed milestone narratives and retired plans live in Git history. This file
contains only current work that still has a concrete renderer or Core consumer.

## Goals

- Close the remaining observable WebGL/WebGPU feature gaps.
- Keep retained updates and custom definitions explicit and tree-shakeable.
- Accept cleanup and hot-path state only when it removes duplication or
  measured allocation.

## Non-goals

- Reopening the retained mark, ordered draw, or placement contracts without a
  concrete correctness or simplification need.
- Moving Core grammar, dataflow, scale resolution, selections, or layout into
  the renderer.
- Adding registries, a renderer scene graph, per-facet marks, or speculative
  backend abstractions.

## Active integration: selection predicate composition

The renderer uses one recursive predicate tree for channel conditions,
visibility, and order. Interval selection state is retained by opaque component
name; each predicate occurrence binds a component to one mark input through
`projections`. Activity atoms read retained state without a mark input. Core
lowers its existing flat selection union before calling the renderer, so the
renderer has no compatibility union operator.

The renderer contract, retained updates, scalar and packed comparisons, GPU
tests, and Core adapter are complete. Core now resolves the recursive grammar
and endpoint projections before translating them to this renderer; WebGL and
immediate renderers use the same predicate semantics. The existing selection
predicate Storybook scene demonstrates nested tests and retained updates.
User-facing examples and cross-backend integration checks are being completed.

## Active integration: GPU MSDF paths and outline fonts

The production point mark accepts built-in names and closed SVG paths while a
fixed circle retains the minimal analytic fast path. The text mark accepts
device-neutral TrueType resources, uses incremental shared `rgba16float`
atlases, applies basic GPOS/legacy kerning, and preserves 2 by 2 small-text
supersampling. Core lazily loads exact WebGPU outline variants while retaining
BMFont measurement. Canonical msdfgen is maintained in a separate repository
and downloaded only by explicit oracle tests, comparison scripts, and the
Storybook comparison control.

The glyph-based text-effects PoC adds one outline and one scalar-SDF
shadow/glow in label-major order without per-label textures. Text program keys
are constant time and never serialize label contents during zoom or pan.

Remaining path/font follow-up includes a compact wide-range tier for tiny
stroked points, portable Core/Canvas/SVG text effects, and public contract
documentation.

## Milestone 1: Close current Core parity gaps

### Outcome

Core features that currently reject input or render differently have explicit,
tested renderer behavior.

### Work

- Reconcile text SDF edge fade and color-dependent gamma with WebGL using
  focused visual fixtures. Baseline and glyph-bearing geometry already have
  GPU coverage and are not part of this task unless the comparison exposes a
  regression.
- Define missing-value behavior for numeric and color channels consistently
  across Core translation, packed storage, scales, normal rendering, and
  picking.
- Add the remaining Core scale families when exercised by migration targets:
  time, UTC, quantile, and bin-ordinal. Continue rejecting unsupported families
  contextually until each complete contract is implemented.
- Support parameter/expression-driven channel accessors and any still-required
  series-backed enum properties without embedding Core expression semantics in
  the renderer.

### Verification

- Add focused unit and GPU tests for each accepted feature and its picking
  path.
- Compare representative Core examples under WebGPU and WebGL, including DPR 1
  and 2 for text changes.
- Run the recursive Core/docs/App inventories after cross-cutting adapter work.

Tentative commit: `feat(webgpu): close remaining Core rendering parity gaps`

## Milestone 2: Stabilize retained updates and extension boundaries

### Outcome

Dynamic updates and custom definitions have stable identities and production
validation costs are intentional.

### Work

- Design stable public identifiers for multiple series-backed conditional
  branches before allowing their independent replacement. Do not expose the
  current synthetic channel names.
- Keep custom `MarkDefinition` and `ScaleDef` contracts code-first and fail
  loudly when required validation, emission, resource, or update behavior is
  absent.
- Separate development diagnostics from always-on public safety checks only
  after production bundle fixtures prove dead-code elimination and preserve
  boundary validation.

### Verification

- Type and unit tests cover branch identity, replacement, invalidation, and
  incompatible updates.
- Public-import bundle fixtures continue to exclude unrelated marks, scales,
  and bundled font assets.
- Development and production fixtures document which failures remain enabled.

Tentative commit: `refactor(webgpu-renderer): stabilize retained extension updates`

## Milestone 3: Evidence-driven cleanup

### Outcome

Scale and shader internals become smaller without adding strategy layers or
parallel representations.

### Work

- Add a JS/WGSL `hash32` parity test or derive both implementations from one
  small source of truth.
- Merge channel defaulting and normalization only where it deletes duplicate
  decisions between channel specification and configuration resolution.
- Consolidate duplicated WGSL accessor helpers when the resulting module is
  smaller than the current direct functions.
- Profile domain/range slot updates before retaining more scratch storage.
  Accept preallocation only for demonstrated repeated allocation or upload
  cost and keep ownership local to the slot.

### Verification

- Preserve all scale-definition, update, conditional, placement, and picking
  tests.
- Record production source, bundle module, minified, gzip, and packed-package
  deltas. Added structure requires a measured or correctness justification.

Tentative commit: `refactor(webgpu-renderer): remove measured scale duplication`

## Implemented: live compute lasso and density display

`LassoSelection` computes membership from immutable projected f32 positions into a
persistent GPU hash table and selected-ID/input-row-index output. Multi-selection
slots borrow that table directly with explicit activity and caller ownership; the
CPU setter remains available. `createPointLassoSelection` captures centers using
the point renderer's scale/center functions, without uploading another position
array. The ordinary point bundle excludes optional capture and containment code.

Core now uses this path for native region selection. Hash membership updates while
drawing; commit transfers buffer ownership to the backend's semantic-value registry.
CPU consumers receive selected rows on release without rescanning containment or
reuploading IDs. Current consumers retain committed tables across capture/cache
invalidation; clear, replacement and disposal release unused tables. Unchanged slots
compare both semantic selection and table identity rather than rebuilding hashes.

`createPointDensityPreview` adds an explicit image-only display for uniform circles
on opaque white. It caches neutral appearance and recolors by per-pixel selected
fractions without geometry redraws during drawing or release. It deliberately changes
overlap blending and is not a general replacement for conditional point rendering.
The host owns scene invalidation; geometry, counts and cached image rebuild together.
The preview keeps only the latest queued polygon while one compute batch is in flight.
The older density-only no-membership option and unused density activity argument
were removed; native selection uses one compute/table/readback path.

GPU membership follows rendered f32 centers and containment. The separate CPU reference
and geometric bookmark replay use captured mappings at CPU precision; near-edge results
can differ. Paths are sampled to at most 512 vertices. Population-sized ID/index staging
and large CPU Maps remain explicit limits; GPU bookmark replay and compact staging are
outside this iteration. Errors reject unsupported projections and insufficient device
storage limits before producing membership.

Private synthetic and real 1.1M-cell workloads live in tests/lasso, outside embedding
examples and docs deployment; downloaded metadata stays under ignored private/lasso.
Renderer-generic Storybook scenes and GPU fixtures cover capture, conditional colors,
activity, hash insertion/deduplication, snapshot ordering, density bins, no point redraws,
point picking/appearance, queue coalescing, resize and borrowed-resource lifetime.

Fresh M5/Chrome/Metal checks (1200×1000, DPR 1) measured sparse 10M release at about
128 ms and near-full release at about 2.32 s; warm compute/image queue completion was
4.8–5.4 ms and 21.7–23.0 ms respectively. Real-cell log/sqrt release took 17 ms.
Three 10M replace/clear cycles kept tracked buffers at 459,565,620 bytes and disposal
reached zero. These are one-machine wall-clock results, exclude texture/JS memory,
and do not promise portable frame rates or isolated per-pass GPU timings.

## Deferred until a concrete consumer or design exists

- Complex shaping, fallback, variable fonts, and persistent cross-session atlas
  caches remain owned by issue #362. Static TrueType outlines, basic kerning,
  device-lifetime atlas sharing, and the default font now have a concrete
  integration design.
- Independent per-facet scale domains require a separate scale-state proposal;
  placement rectangles remain geometry-only.
- Worker transfer protocols, vector-backend compatibility, and selection-only
  masking need a concrete consumer or measurement before becoming milestones.

## Final integration verification

Run renderer unit/GPU tests, package type/lint/bundle/package checks, focused
Core adapter and surface suites, and the recursive example inventories for any
milestone that changes shared rendering behavior. Update this file when a
milestone starts or finishes, and retire completed detail to Git history rather
than accumulating another companion plan.
