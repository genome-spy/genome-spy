# WebGPU renderer migration backlog

Status: Core retained-frame optimization is complete; the independent package
parity and cleanup backlog remains ongoing.

The completed interaction-performance plan has been retired. Current adapter
simplification and regression-gate work is specified in
`plans/core-webgpu-integration-simplification/core-webgpu-integration-simplification-plan.md`.
Keep milestone detail there rather than duplicating it here.

The retained renderer, Core adapter, ordinary repeated occurrences, and App
sample facets are implemented. Completed milestone narratives live in Git
history. This file contains only current work that still has a concrete
renderer or Core consumer.

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

## Milestone 1: Close current Core parity gaps

### Outcome

Core features that currently reject input or render differently have explicit,
tested renderer behavior.

### Work

- Implement link `noFadingOnPointSelection` through a generic point-selection
  aggregate predicate.
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

## Deferred until a concrete consumer or design exists

- Font registration, shaping, atlas generation, and caching are owned by issue
  #362; do not expose the current BMFont resource representation meanwhile.
- Independent per-facet scale domains require a separate scale-state proposal;
  placement rectangles remain geometry-only.
- Existing-device construction, worker transfer protocols, vector-backend
  compatibility, and selection-only masking need a concrete consumer or
  measurement before becoming milestones.

## Final integration verification

Run renderer unit/GPU tests, package type/lint/bundle/package checks, focused
Core adapter and surface suites, and the recursive example inventories for any
milestone that changes shared rendering behavior. Update this file when a
milestone starts or finishes, and retire completed detail to Git history rather
than accumulating another companion plan.
