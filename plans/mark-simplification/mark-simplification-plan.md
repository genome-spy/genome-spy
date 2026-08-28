# Semantic mark simplification plan

Status: Proposed

## Context

The recent renderer-boundary work moved retained WebGL state, shaders, buffers,
textures, and draw callbacks out of `packages/core/src/marks/`. The remaining
semantic mark hierarchy is much smaller, but it still contains two kinds of
cleanup opportunity:

1. Dead APIs and compatibility paths whose callers have already disappeared.
2. WebGL-specific policies and tests that remain under the semantic mark
   boundary.

The current production JavaScript baseline is 568 lines in
`packages/core/src/marks/mark.js` and 1,512 lines across the mark base,
subclasses, `markUtils.js`, and `ruleLikeEncoding.js`. Line count is not an
acceptance target by itself, but each cleanup must report its focused before and
after counts so that added machinery is justified.

Git history shows that the App stopped calling `Mark.findDatumAt()` in
`3c9fecc84` when interval-based sample actions introduced dedicated datum
lookup. Current repository-wide searches also find no production callers for
`augmentDefaultProperties()` or `makeRenderingResourcesVolatile()`. The latter
is exercised only by a test written for the otherwise unused API.

## Goals

- Delete dead mark APIs, stale lookup code, incorrect unused helpers, no-op
  overrides, and redundant default/encoding work.
- Keep semantic marks focused on resolved configuration, normalized encoding,
  encoders, shared text/font data, semantic zoom data, and hit-test semantics.
- Keep WebGL-only optimizations, uniform mappings, and tests under
  `packages/core/src/rendering/webgl/`.
- Preserve the established backend-neutral rendering revision contract except
  for its demonstrably unused volatile mode.
- Preserve grammar behavior and output across WebGL, WebGPU, Canvas2D, SVG,
  picking, tooltips, scale resolution, and App interval aggregation.
- Produce one focused implementation commit for every cleanup item below.

## Non-goals

- Replacing mark subclasses with a definition table or a new plugin system.
- Changing public mark grammar, encoding precedence, offset semantics, hit-test
  semantics, or semantic zoom behavior.
- Rewriting mark encoding normalization or merging the existing focused helper
  modules solely to reduce the number of files.
- Changing GPU shader behavior, visual appearance, paint order, picking IDs,
  or renderer selection.
- Removing other deprecated mark properties such as `geometricZoomBound`.
- Removing or generalizing the `minBufferSize` WebGL allocation hint. Its axis
  capacities and Text growth workaround need separate performance evidence.
- Moving rendering revision ownership out of semantic marks. That would be a
  cross-renderer lifecycle redesign rather than a KISS cleanup.

## Key decisions

### Prefer deletion before ownership refactors

Dead code and duplicated work will be removed before moving responsibilities.
This makes later diffs smaller and prevents a renderer-boundary refactor from
preserving APIs that have no consumers.

Every milestone below is one commit. Adjacent items must not be squashed merely
because they are small: the requested history should make each cleanup
independently reviewable and revertible.

### Retain the mark subclasses

The subclasses still provide useful semantic polymorphism:

- point owns semantic-score sampling and threshold calculation;
- text owns shared font metrics and ranged-text normalization;
- rect, rule, link, and arrow own mark-specific encoding normalization; and
- link overrides the shared hit-test mode.

Replacing these classes with a registry would mostly translate methods into a
parallel data structure without deleting the behavior. The hierarchy should be
simplified in place.

### Defer changes that need new machinery

The existing rendering revision contract is intentionally backend-neutral and
is used by WebGL, WebGPU, and Canvas2D. Replacing it with renderer-owned trackers
would add lifecycle state and duplicate-subscription risks across rendering,
picking, and export surfaces. This plan removes only the unused volatile mode.

Likewise, `minBufferSize` is WebGL-specific, but replacing it requires a proven
capacity policy and resolution of the known Text buffer-growth workaround. The
hint remains until a reproducible benchmark or deterministic allocation test
justifies a separate change.

### Keep tests with their owner

Tests that import WebGL delegates, compile GLSL, inspect uniforms, or exercise
WebGL viewport/indexed draw helpers belong under `src/rendering/webgl/`. Tests
for semantic encoding normalization, configuration precedence, semantic zoom,
and shared mark behavior remain under `src/marks/`.

## Alternatives considered

### Leave small dead methods as extension hooks

Rejected. The mark classes are internal, the methods have no consumers, and no
documented extension contract uses them. Empty extension points make the
semantic surface harder to understand and test.

### Fix the unused `is*Props()` guards

Rejected. Four guards currently compare against `"point"`, but none is called.
Correcting unused code would preserve an unnecessary API and require tests for
behavior with no consumer.

### Move rendering revisions or buffer capacity in this cleanup

Deferred. Both changes require new ownership or allocation machinery and have
cross-renderer or performance consequences. They should proceed only in
separate plans with concrete lifecycle and benchmark evidence.

### Combine all deletions into one commit

Rejected for this change because each cleanup item must have a separate commit.
The resulting commits are small but describe distinct evidence and ownership
decisions.

## Milestone 1: Remove unused default-property augmentation

### Intended outcome

`Mark` no longer exposes an unused protected mutation hook for
`defaultProperties`.

### Work

- [x] Remove `Mark.augmentDefaultProperties()` and its JSDoc.
- [x] Confirm that no subclass, test helper, or downstream package calls it.

### Affected areas and consumers

- `packages/core/src/marks/mark.js`
- mark subclasses and test fixtures as search-only downstream checks

### Verification

- Run `rg "augmentDefaultProperties" packages` and require no matches.
- Run `npx vitest run packages/core/src/marks/markConfigPrecedence.test.js
  --reporter=agent`.

### Documentation and migration

None. The method is internal and unused.

### Tentative commit

`refactor(core): remove unused mark default augmentation`

## Milestone 2: Remove volatile rendering-resource revisions

### Intended outcome

The rendering revision state has no mode that is supported only by its own
unit test.

### Work

- [x] Remove `volatileResources` from `RenderingRevisionState`.
- [x] Remove `Mark.makeRenderingResourcesVolatile()`.
- [x] Simplify `getRenderingRevision()` while preserving its current `0`
      result before revision tracking has been initialized.
- [x] Remove the volatile-category assertions while retaining scale dependency
      coverage.

### Affected areas and consumers

- `packages/core/src/marks/mark.js`
- `packages/core/src/marks/mark.test.js`
- WebGPU and WebGL revision consumers, which must continue receiving numbers

### Verification

- Run `rg "volatileResources|makeRenderingResourcesVolatile" packages` and
  require no matches.
- Run `npx vitest run packages/core/src/marks/mark.test.js
  packages/core/src/rendering/webgpu/webGpuMarkAdapter.test.js
  --reporter=agent`.

### Documentation and migration

None. The API is internal and has no production caller.

### Tentative commit

`refactor(core): remove unused volatile mark revisions`

## Milestone 3: Remove obsolete mark datum lookup

### Intended outcome

The mark hierarchy no longer carries the old App-specific scalar-locus lookup
hook.

### Work

- [x] Remove the empty `Mark.findDatumAt()` method.
- [x] Remove `RectMark.findDatumAt()` and imports used only by it.
- [x] Confirm the App continues to use its interval-aware datum lookup and
      attribute aggregation utilities.

### Affected areas and consumers

- `packages/core/src/marks/mark.js`
- `packages/core/src/marks/rect.js`
- `packages/app/src/sampleView/datumLookup.js`
- App attribute aggregation and selection feature lookup as downstream checks

### Verification

- Run `rg "findDatumAt" packages` and require no matches.
- Run the focused Core Rect tests.
- Run the App datum lookup, attribute accessor, and selection feature field
  value tests with the Vitest agent reporter.

### Documentation and migration

None. The removed method is internal and already has no caller.

### Tentative commit

`refactor(core): remove obsolete mark datum lookup`

## Milestone 4: Remove unused mark-property type guards

### Intended outcome

`markUtils.js` contains only helpers with real consumers, and the incorrect
unused `is*Props()` implementations cannot become latent bugs.

### Work

- [x] Remove `isPointProps`, `isRectProps`, `isRuleProps`, `isTextProps`, and
      `isLinkProps` with their JSDoc blocks.
- [x] Confirm no generated schema or documentation process imports them.

### Affected areas and consumers

- `packages/core/src/marks/markUtils.js`
- schema/docs generation as a downstream import check

### Verification

- Run `rg "is(Point|Rect|Rule|Text|Link)Props" packages docs` and require no
  matches.
- Run the focused mark tests and workspace TypeScript checks for Core.

### Documentation and migration

None. These are unused runtime helpers rather than specification types.

### Tentative commit

`refactor(core): remove unused mark property guards`

## Milestone 5: Remove redundant base mark defaults

### Intended outcome

Base mark construction and default encoding have one source for configured
defaults.

### Work

- [x] Remove `xOffset`, `yOffset`, and `minBufferSize` literals duplicated in
      `Mark.defaultProperties`; configured defaults remain authoritative.
- [x] Remove undefined `sample` and `uniqueId` placeholders and offset defaults
      from `getDefaultEncoding()` when the property-to-value pass already
      supplies them.
- [x] Preserve conditional automatic `uniqueId` encoding for picking.

### Affected areas and consumers

- `packages/core/src/marks/mark.js`
- configuration precedence, offset, and picking consumers

### Verification

- Extend or retain representative assertions for default offsets, explicit
  zero secondary offsets, configured overrides, and automatic picking IDs.
- Run `mark.test.js`, `markConfigPrecedence.test.js`, and focused
  Canvas/WebGL/WebGPU picking tests.
- Run Core TypeScript checks.

### Documentation and migration

None. Resolved grammar behavior must remain identical.

### Tentative commit

`refactor(core): remove redundant base mark defaults`

## Milestone 6: Remove duplicate unsupported-channel filtering

### Intended outcome

Inherited encoding is filtered once by `UnitView`, without a second deletion
pass in `Mark.encoding`.

### Work

- [x] Add or strengthen tests covering every mark type with an inherited
      channel that it does not support.
- [x] Confirm every mark-specific `fixEncoding()` introduces only channels in
      that mark's supported-channel contract.
- [x] Remove the final unsupported-channel deletion loop in `Mark.encoding`.

### Affected areas and consumers

- `packages/core/src/marks/mark.js`
- all semantic mark subclasses
- `packages/core/src/view/unitView.js`
- scale, axis, legend, tooltip, and inherited-encoding consumers

### Verification

- Run the per-mark inherited-channel matrix and existing layer/concat/grid
  inherited-encoding tests.
- Run resolution planner, axis, legend, tooltip, and Core TypeScript tests.
- Inspect the normalized encoding of every mark type for unsupported channels.

### Documentation and migration

None. The surviving `UnitView` filter preserves existing behavior.

### Tentative commit

`refactor(core): remove duplicate mark channel filtering`

## Milestone 7: Remove Point no-op overrides

### Intended outcome

`PointMark` contains only Point-specific behavior.

### Work

- [x] Remove the empty Point default-encoding object and no-op
      `getDefaultEncoding()` override.
- [x] Remove the no-op `super.initializeData()` call.

### Affected areas and consumers

- `packages/core/src/marks/point.js`
- Point encoding and semantic-score initialization

### Verification

- Run Point tests and representative semantic-zoom tests.
- Confirm Point default encoding remains identical.

### Documentation and migration

None. These are no-op implementation details.

### Tentative commit

`refactor(core): remove Point mark no-op overrides`

## Milestone 8: Remove the mark context convenience chain

### Intended outcome

Callers use the already-public owning view context rather than forwarding
through both semantic and WebGL mark layers.

### Work

- [x] Replace `Mark.getContext()` callers with `mark.unitView.context` or
      `this.unitView.context` as appropriate.
- [x] Remove the corresponding `WebGLMark.getContext()` forwarding method.
- [x] Keep `Mark.getType()` because it has broad semantic and diagnostic use.

### Affected areas and consumers

- `packages/core/src/marks/mark.js`
- `packages/core/src/marks/point.js`
- `packages/core/src/rendering/webgl/marks/webGlMark.js`

### Verification

- Run `rg "getContext\\(\\)" packages/core/src/marks
  packages/core/src/rendering/webgl/marks` and inspect every remaining match.
- Run Point semantic zoom tests and focused WebGL mark tests.

### Documentation and migration

None. This is an internal convenience removal.

### Tentative commit

`refactor(core): remove redundant mark context accessors`

## Milestone 9: Move rectangle opacity policy into WebGL

### Intended outcome

Semantic `RectMark` no longer owns an optimization consumed only when WebGL
chooses blending state.

### Work

- [x] Remove `Mark.opaque` and `RectMark.opaque`.
- [x] Remove the semantic Rect rounded-corner and stroke helpers when they
      become unused.
- [x] Implement the conservative opaque check in `WebGLRectMark` by reusing the
      equivalent private helpers already present there; do not create another
      copy.
- [x] Remove the `WebGLMark.opaque` forwarding getter and provide a WebGL-local
      default of false for other delegates.
- [x] Preserve conservative behavior for expression-backed properties and
      effective view opacity.

### Affected areas and consumers

- `packages/core/src/marks/mark.js`
- `packages/core/src/marks/rect.js`
- `packages/core/src/rendering/webgl/marks/webGlMark.js`
- `packages/core/src/rendering/webgl/marks/rect.js`

### Verification

- Add focused WebGL assertions for plain opaque Rects and Rects with stroke,
  rounded corners, shadows, encoded opacity, minimum opacity, or view opacity.
- Run Rect semantic tests, WebGL mark tests, and curated opaque/translucent Rect
  screenshot cases.
- Confirm Canvas2D and SVG output is unchanged because neither consumes the
  optimization.

### Documentation and migration

No user documentation. Update rendering architecture wording only if it claims
that semantic marks expose backend optimization flags.

### Tentative commit

`refactor(core): keep rectangle opacity policy in WebGL`

## Milestone 10: Move arrow uniform mappings into WebGL

### Intended outcome

Semantic Arrow code contains only encoding and arrow semantics; GLSL uniform
ordering stays with the WebGL delegate and shader constants.

### Work

- [x] Remove `ARROW_UNIFORM_ENUMS` and `enumIndex()` from semantic `arrow.js`.
- [x] Delete the unused `directions` duplicate; direction-channel mapping
      remains in the generic encoder.
- [x] Move head-shape, head-placement, and fail-fast mapping next to
      `WebGLArrowMark`.
- [x] Move the corresponding uniform-order tests under WebGL.
- [x] Preserve WebGPU's independent `ARROW_DIRECTION_CODES` mapping and
      immediate renderers' string-based direction handling.

### Affected areas and consumers

- `packages/core/src/marks/arrow.js`
- `packages/core/src/marks/arrow.test.js`
- `packages/core/src/rendering/webgl/marks/arrow.js`
- WebGL arrow GLSL constants

### Verification

- Run semantic Arrow tests and the relocated WebGL Arrow tests.
- Run arrow shader snapshots and representative forward/reverse, open/triangle,
  and inside/outside rendering cases.
- Confirm Canvas2D, SVG, and WebGPU continue using their own semantic mappings.

### Documentation and migration

None. Uniform ordering is private WebGL implementation detail.

### Tentative commit

`refactor(core): keep arrow uniform mappings in WebGL`

## Milestone 11: Move remaining WebGL tests behind the renderer boundary

### Intended outcome

The test tree communicates the same ownership boundary as production code.

### Work

- [x] Move generated GLSL snapshot tests and snapshots from `src/marks/` to an
      appropriate `src/rendering/webgl/` location.
- [x] Move offset-aware indexed drawing, viewport scope, and logical visible
      rectangle tests out of semantic `mark.test.js`.
- [x] Move the WebGL text uniform-vector test out of semantic `text.test.js`.
- [x] Leave the Arrow uniform-order tests moved with milestone 10 in place, and
      relocate the remaining WebGL-owned tests without duplicating that work.
- [x] Leave semantic factory, encoding, offset, text-data, and configuration
      tests under `src/marks/`.
- [x] Update relative fixture paths and accept only the channel-order snapshot
      changes produced by milestone 6.

### Affected areas and consumers

- `packages/core/src/marks/*.test.js`
- `packages/core/src/marks/__snapshots__/`
- `packages/core/src/rendering/webgl/**/*.test.js`

### Verification

- Run all moved and remaining mark/WebGL test files directly.
- Confirm snapshot content is unchanged except for relocation and the
  channel-order normalization from milestone 6.
- Run `rg "rendering/webgl|WebGL|GLSL|shader|uniform" packages/core/src/marks
  --glob "*.test.js"` and justify every remaining match.

### Documentation and migration

None.

### Tentative commit

`test(core): move WebGL mark tests behind renderer boundary`

## Final integration verification

- [ ] Record production-source line counts for every touched semantic and
      WebGL file before and after. Report tests and snapshots separately so
      relocation cannot masquerade as simplification.
- [ ] Confirm the complete change reduces total touched production code, not
      merely `src/marks/`; justify any cleanup that moves more code than it
      deletes.
- [ ] Run `npm --workspaces run test:tsc --if-present`.
- [ ] Run `npm run lint`.
- [ ] Run the full unit suite with `npm test -- --reporter=agent` when focused
      suites are green.
- [ ] Smoke-test WebGL, WebGPU, and Canvas2D with representative Point, Rect,
      Rule/Tick, Text, Link, and Arrow specifications.
- [ ] Verify ordinary and software picking, tooltips, point selections,
      parameter-driven encoding/property changes, semantic zoom, nested
      offsets, index/locus zooming, axis labels/grids, SVG export, and hybrid
      rasterization.
- [ ] Confirm the minimal entry and renderer bundle-boundary checks still keep
      WebGL out of unregistered entry chunks.
- [ ] Review all incomplete tasks in this plan, marking each complete or
      explicitly discarded, and commit that reconciled state.
- [ ] Delete `plans/mark-simplification/` in a later commit before creating or
      merging a pull request.

## Review gates

### After milestones 1-8

Review the deletion-only sequence together. Check that repository-wide usage
searches cover Core, App, tests, schema generation, and examples, and that the
default and channel-filter cleanups preserve inherited-channel and picking
behavior for every mark type.

### After milestones 9-11 and final integration

Review the renderer-boundary sequence across semantic marks, WebGL delegates,
Canvas2D, SVG, and WebGPU. Check that production behavior is unchanged and the
test moves reflect ownership without regenerating shader output.

## Risks

- Removing the second encoding filter could expose a mark-specific normalizer
  that accidentally creates an unsupported channel. Focused inherited-encoding
  tests must establish the invariant before deletion.
- Moving opaque detection could accidentally enable blending for opaque Rects
  or disable it for translucent ones, changing color and compositing output.
- Test relocation can unintentionally regenerate large snapshots even when
  production shader output is unchanged.

## Deferred follow-ups

- Reconsider `minBufferSize` only after reproducing or disproving the Text
  growth problem and establishing a deterministic allocation test or named
  interaction benchmark for dense axis labels and grid lines.
- Reconsider rendering revision ownership only if profiling or lifecycle bugs
  justify a separate architecture plan. That plan must define ownership across
  live rendering, picking, SVG rasterization, detached Canvas2D, failed launch,
  and subtree disposal before proposing new trackers.

## Acceptance criteria

- Every numbered milestone is delivered as its own focused Conventional Commit
  with the tentative message or a clearly justified equivalent.
- Repository-wide searches confirm all removed APIs and helpers have no
  remaining callers.
- Total touched production code is smaller after the full change; exact
  before/after production and test counts are recorded separately in the
  reconciled plan.
- Semantic marks contain no WebGL uniform ordering or blending optimization.
- Existing rendering revision ownership and `minBufferSize` behavior remain
  unchanged except for removal of the unused volatile revision mode and a
  duplicated default literal.
- All reactive parameter, selection, scale, picking, and export behavior remains
  correct across WebGL, WebGPU, Canvas2D, and SVG.
- Architecture documentation is updated only if the final ownership moves make
  an existing statement inaccurate.
- The reconciled plan is committed and then removed in a later commit before PR
  creation or merge.
