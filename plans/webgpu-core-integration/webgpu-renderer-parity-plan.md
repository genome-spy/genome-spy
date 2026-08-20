# WebGPU renderer feature parity plan

## Purpose

Bring the experimental WebGPU backend materially closer to the existing WebGL
backend so that a specification does not lose visible mark behavior merely by
selecting `renderer: "webgpu"`.

This plan is focused on the current GenomeSpy architecture:

- Core remains the owner of the declarative grammar, encoders, resolved scales,
  mark properties, and view traversal.
- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js` translates those
  semantic values into the low-level renderer contract.
- `packages/webgpu-renderer` owns WGSL, pipelines, storage buffers, uniforms,
  textures, and retained mark resources.
- WebGL remains the behavioral reference implementation in
  `packages/core/src/marks/*.js` and the adjacent GLSL files.

The current worktree contains unrelated, pre-existing WebGPU fixes. They must
remain intact while this plan is implemented; each parity milestone should be
committed independently.

## Current findings

### Mark dispatch

The Core adapter currently dispatches only `point`, `rect`, `rule`/`tick`, and
`text`. The low-level renderer already has a `link` definition and program, but
Core never imports or creates it. There is no WebGPU arrow definition or
program, although WebGL has a complete `ArrowMark` and dedicated arrow GLSL.

### Positional offsets

WebGL applies `xOffset`, `yOffset`, `x2Offset`, and `y2Offset` after positional
scaling in pixel space. The WebGPU adapter currently bakes endpoint offsets into
the positional scale range and requires them to be constant for rectangles and
rules. This loses data-driven and scale-driven offsets. Point and text primary
offsets have separate `dx`/`dy` handling, while ranged text still treats the
secondary offsets as constants.

### Rules and dashes

The WebGPU rule program already contains a dash atlas, `dashMask`, and a
`strokeDash` channel. The Core adapter nevertheless rejects every non-null
`strokeDash` property and does not provide the dash pattern list or pattern
index. This is an adapter plumbing gap, not a new rendering algorithm.

### Point shapes

WebGL supports the twelve mapped shapes plus the stroke-only `x` and `+`
shapes. The WebGPU adapter maps only the first twelve and the WGSL point
program has no line-shape distance path. The WebGPU implementation must keep
the WebGL distinction between filled shapes and stroke-only shapes, including
stroke-width behavior when fill/stroke is absent.

### Rectangles

The WebGPU rectangle program supports a scalar corner radius, hatch patterns,
and a simple shadow approximation. WebGL supports four independent corner
radii and a Gaussian-style rounded-box shadow. The adapter currently rejects
per-corner radii. The parity implementation should use a four-component radius
value and port the existing shadow behavior, preserving the fast path for
plain opaque rectangles.

### Links and arrows

The low-level link program covers WebGL's arc, dome, diagonal, and line link
shapes, but its Core adapter path is missing. Arrow requires a new low-level
definition/program and Core translation of direction, head geometry, placement,
repeat spacing, and endpoint offsets. The existing WebGL arrow shader is the
behavioral reference; no external source code is being copied.

### Other explicit adapter limitations

The audit must keep tracking, and either implement or explicitly document with
tests, the current rejection points for conditional encodings, faceting,
unsupported scale types, non-Lato fonts, data-driven enum properties, and
backend-specific picking. These are not silently considered solved by the mark
parity milestones below.

## Goals

1. Make every WebGL built-in mark type available through the WebGPU Core
   backend: point, rect, rule, tick, text, link, and arrow.
2. Match WebGL's visible behavior for the listed positional, stroke, shape,
   rectangle, shadow, link, and arrow features within the precision and
   antialiasing differences inherent to WebGPU.
3. Keep renderer code generic. `packages/webgpu-renderer` must not import Core
   mark classes, Core channel types, or Core property-resolution logic.
4. Preserve retained-program reuse: changing series, scales, or ordinary
   dynamic values must not recreate a pipeline when the channel structure is
   unchanged.
5. Add representative regression tests at the adapter, shader-generation,
   resource, and browser/GPU levels.
6. Produce one coherent Conventional Commit per implementation milestone.

## Non-goals

- Replacing the existing WebGL renderer or changing automatic backend
  selection.
- Reworking Core's declarative grammar or changing the semantics of WebGL,
  Canvas2D, or SVG.
- Adding a Core-side universal scene graph or making the renderer emulate
  `glHelper`.
- Treating unsupported scales, conditional branches, faceting, or font
  families as acceptable forever. Those are tracked follow-ups and must be
  surfaced explicitly if they remain after the mark work.
- Copying external shader code. Existing GenomeSpy GLSL is the source of truth;
  any future external reference must be license-checked and credited in code
  and this plan before adaptation.

## Design decisions

### Preserve the renderer contract boundary

Core will continue to send explicit mark definitions and normalized channel
configs. New renderer channels such as endpoint offsets, per-corner radii,
arrow direction, and dash indices are generic numeric channels or mark-local
uniforms. The renderer will not learn about `Mark`, `Encoding`, `ExprRef`, or
Core property defaults.

### Represent pixel offsets as channels, not range mutations

Positional channels remain responsible for mapping data to pixel coordinates.
Offset channels are separate pixel-valued channels consumed in the vertex
shader. Constant offsets may use value slots; data-driven offsets use series and
the same scale machinery as other numeric channels. This keeps endpoint range
updates correct and makes `x2Offset`/`y2Offset` symmetric with primary offsets.

### Use immutable definitions for mark selection

Add `arrowMark` as a side-effect-free public definition and import `linkMark`
and `arrowMark` only from the Core WebGPU adapter. Keep one program class per
mark family. The Core adapter remains responsible for mapping Core enums and
properties to numeric codes; the renderer owns the corresponding WGSL.

### Make visual fast paths explicit

Rectangles without corner radii, strokes, hatches, or shadows should continue
to use the exact opaque fill path. Decorated rectangles use the SDF path. Arrow
and link programs should retain the existing segment-count and instance-based
draw model rather than expanding geometry on the CPU.

## Milestones and commit strategy

Each milestone below is intended to end with focused tests passing and one
separate commit. Do not combine unrelated worktree changes into these commits.

### Milestone 1: Establish the parity inventory and regression harness

**Intended outcome:** A durable feature matrix and focused tests make the
remaining gaps observable before shader changes begin.

**Affected areas:**

- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.test.js`
- `packages/webgpu-renderer/src/marks/programs/*.test.js` or adjacent focused
  tests
- `packages/webgpu-renderer/MIGRATION_PLAN.md`
- This plan's implementation record

**Work:**

- Add adapter tests for currently supported and currently rejected mark types,
  including explicit contextual errors.
- Add configuration-shape tests for offsets, dashes, rectangle radii/shadows,
  and the mark definition imports that later milestones will fill in.
- Record the baseline focused unit, TypeScript, lint, and GPU/browser commands.
- Do not alter behavior solely to make the inventory pass.

**Verification:** Run the focused Core adapter suite, WebGPU unit suite, and
renderer TypeScript check. Confirm the baseline failures are attributable to
missing parity behavior rather than the pre-existing dirty changes.

**Documentation/migration:** Add a short parity-progress entry to the WebGPU
migration plan, without marking any feature complete prematurely.

**Tentative commit:**
`test(webgpu): establish renderer feature parity coverage`

### Milestone 2: Add generic endpoint-offset channels

**Intended outcome:** Rectangles, rules/ticks, ranged text, links, and arrows
can consume constant, series-backed, and linear-scale-backed endpoint offsets
in pixel space.

**Affected areas:**

- `packages/webgpu-renderer/src/marks/programs/{rect,rule,text,link}.js`
- New arrow program channel definitions, if introduced before the arrow
  milestone
- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`
- Adapter tests and renderer channel/resource tests

**Work:**

- Add the needed optional/default offset channels to renderer mark specs.
- Update vertex shaders to add primary and secondary offsets after positional
  scale evaluation, with the same y-direction convention as Core/WebGL.
- Replace `readConstantOffset` use for endpoint geometry with numeric channel
  creation that preserves data and scale information.
- Keep point's existing combined `dx`/`dy` behavior without double-applying
  primary offsets.
- Ensure ranged text adds secondary offsets before range fitting.
- Verify retained updates replace offset series without rebuilding pipelines.

**Verification:** Assert exact translated configs for constant and series
offsets, including scaled pixel ranges. Add shader-generation assertions for
all four endpoint offset accessors. Run renderer unit tests, Core adapter tests,
and a GPU smoke case with visibly displaced endpoints.

**Documentation/migration:** Document that offset channels are pixel-valued
after their optional numeric scale, and update the migration checklist.

**Tentative commit:**
`feat(webgpu): support data-driven positional endpoint offsets`

### Milestone 3: Enable dashed rules and complete point shapes

**Intended outcome:** Rule/tick marks accept WebGL-compatible dash patterns,
and point marks support `x` and `+` as stroke-only shapes.

**Affected areas:**

- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`
- `packages/webgpu-renderer/src/marks/programs/ruleProgram.js`
- `packages/webgpu-renderer/src/marks/programs/pointProgram.js`
- Dash atlas tests and adapter/GPU tests

**Work:**

- Translate Core's `strokeDash` property into a renderer-owned dash atlas and
  a pattern index, retaining validation for even, positive integer segments.
- Preserve `strokeDashOffset`, cap behavior, thin-line opacity, and dash
  behavior for both rules and ticks.
- Add point shape codes for `x` and `+`, rotate the `x` geometry consistently
  with WebGL, and make the line-shape path use stroke geometry rather than a
  filled-shape stroke inset.
- Confirm picking coverage for line-only shapes and dash gaps follows the
  intended contract.

**Verification:** Add adapter tests proving dashed rules no longer reject and
carry their atlas configuration. Add WGSL/source tests for both shapes. Run a
GPU screenshot/readback smoke case for dashed, round-capped rules and all point
shape codes.

**Documentation/migration:** Update the renderer migration plan to remove the
dash gap and point-shape gap once GPU tests pass.

**Tentative commit:**
`feat(webgpu): match rule dashes and point line shapes`

### Milestone 4: Match rectangle radii, hatches, and shadows

**Intended outcome:** Rectangles support independent corner radii and a
WebGL-compatible rounded-box shadow while retaining the undecorated fast path.

**Affected areas:**

- `packages/webgpu-renderer/src/marks/programs/rectProgram.js`
- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`
- Rectangle shader/source and GPU tests

**Work:**

- Replace the scalar corner-radius varying with four radii in WebGPU order and
  clamp each radius to the available half-size as WebGL does.
- Translate `cornerRadius`, `cornerRadiusTopLeft`,
  `cornerRadiusTopRight`, `cornerRadiusBottomLeft`, and
  `cornerRadiusBottomRight` with the same precedence and default semantics as
  Core/WebGL.
- Port the existing rounded-box shadow approximation used by WebGL, including
  blur, offset sign conventions, opacity, color, and the region where the
  shadow must not overwrite the fill/stroke.
- Keep hatch patterns and decorated-rectangle antialiasing behavior intact.
- Preserve exact adjacent-edge rendering for plain opaque rectangles.

**Verification:** Add tests for mixed per-corner radii, radius clamping,
shadow offsets in both directions, zero blur, and the plain-rectangle fast
path. Compare representative WebGL/WebGPU screenshots with a tolerance suited
to antialiasing, and run the GPU suite.

**Documentation/migration:** Remove the adapter's explicit per-corner rejection
and replace the shadow TODO with a precise note if any intentional numerical
difference remains.

**Tentative commit:**
`feat(webgpu): match rectangle corners and shadows`

### Milestone 5: Integrate links through Core

**Intended outcome:** Core WebGPU renders arc, dome, diagonal, and line links
using the existing retained WebGPU link program.

**Affected areas:**

- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`
- `packages/webgpu-renderer/src/marks/link*`
- Core adapter tests and browser/GPU smoke specs

**Work:**

- Import the public `linkMark` definition in the adapter.
- Translate endpoint channels, endpoint offsets, size, color, opacity, shape,
  orientation, clamping, arc fading, minimum height, maximum chord length, and
  segment count.
- Match WebGL's defaulting and endpoint inference rules instead of introducing
  WebGPU-only defaults.
- Ensure link draw ranges, pick IDs, and retained series updates use the same
  instance contract as other marks.

**Verification:** Add adapter config assertions for every link shape and a GPU
  smoke test covering vertical/horizontal links, arc fading, and overlap order.
  Run a Core browser example containing link marks.

**Documentation/migration:** Mark the existing low-level-link-but-no-Core-path
  gap complete in the migration plan.

**Tentative commit:**
`feat(core): integrate WebGPU link marks`

### Milestone 6: Implement and integrate arrow marks

**Intended outcome:** Core arrow marks render in WebGPU with the WebGL property
  surface, including block and transcript-style arrows.

**Affected areas:**

- New `packages/webgpu-renderer/src/marks/arrow.js`
- New arrow program and WGSL under `packages/webgpu-renderer/src/marks/programs/`
- Public renderer exports and `index.d.ts`
- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`
- Arrow adapter, shader, and GPU tests

**Work:**

- Port the existing GenomeSpy arrow distance/geometry logic from
  `packages/core/src/marks/arrow.*.glsl` to WGSL, keeping the source's geometry
  decisions and documenting that it is an internal GenomeSpy port.
- Support direction, filled/open heads, head angle and notch angle, stem,
  head width, start notch, minimum stem length, repeat spacing, and inside vs.
  outside placement.
- Support endpoint offsets and fill/stroke/opacity/size channels, plus unique
  IDs for picking.
- Add `arrowMark` as a side-effect-free public definition and include `arrow`
  in the renderer's mark type declarations.
- Add Core dispatch and property/enum translation without importing Core code
  into the renderer package.

**Verification:** Add unit tests for angle clamping and enum translation, WGSL
source/build tests for both head shapes and directions, and GPU tests for
ordinary arrows, short arrows, repeated heads, open heads, and outside
placement. Run existing Core arrow examples in a WebGPU browser.

**Documentation/migration:** Document the renderer-level arrow config and mark
the Core arrow path complete only after browser smoke coverage passes.

**Tentative commit:**
`feat(webgpu): add arrow mark rendering`

### Milestone 7: Close the remaining adapter parity gaps and final integration

**Intended outcome:** The feature matrix has an explicit result for every
WebGL mark/property path, with unsupported behavior either implemented or
documented as a separately tracked limitation.

**Affected areas:**

- Remaining Core WebGPU adapter and renderer mark/scale resources
- `packages/core/src/rendering/webgpu/`
- `packages/webgpu-renderer/MIGRATION_PLAN.md`
- Representative examples and browser test fixtures

**Work:**

- Re-run the inventory against all WebGL mark attributes, properties,
  conditional branches, selection/picking behavior, faceting, scale types,
  font behavior, and lifecycle paths.
- Implement small remaining gaps that are required for the stated parity goal;
  split any larger subsystem (for example full conditional/faceted rendering)
  into a follow-up plan with a concrete status rather than hiding it in the
  adapter.
- Remove stale `unsupported` branches only when behavior and tests replace
  them.
- Update migration documentation with completed milestones and remaining
  limitations.

**Verification:** Run focused suites after each fix, then:

- `npm test -- --reporter=agent` when the cross-renderer risk warrants it;
- `npm --workspaces run test:tsc --if-present`;
- `npm run lint`;
- `npm -w @genome-spy/webgpu-renderer run test:gpu`;
- representative browser smoke tests for point, rect, rule/tick, text, link,
  and arrow examples at DPR 1 and DPR 2;
- WebGL regression tests and existing Canvas/SVG tests to verify that shared
  Core semantics were not changed.

**Documentation/migration:** Reconcile every completed or discarded item in
  this plan and the WebGPU migration plan. This plan is temporary and should
  be committed for historical traceability, then deleted in a later cleanup
  commit before a pull request is created.

**Tentative commit:**
`test(webgpu): complete renderer parity verification`

## Review gates

1. **Shared channel contract gate:** Review Milestone 2 together with every
   affected mark program, Core adapter path, series replacement path, and
   picking path. Offset mistakes can silently affect multiple marks.
2. **Shader geometry gate:** Review Milestones 3 and 4 with GPU output, not
   source inspection alone. Dash coverage, stroke-only shapes, corner SDFs, and
   shadows are sensitive to DPR and antialiasing.
3. **New mark API gate:** Review Milestones 5 and 6 for public definition shape,
   tree-shaking, retained resource lifetime, and Core/renderer dependency
   direction.
4. **Final cross-backend gate:** Compare representative WebGL and WebGPU
   renders and inspect all explicit adapter rejection paths before declaring
   parity complete.

## Risks and mitigations

- **WGSL and GLSL antialiasing differ:** use geometry-aware tolerances and
  inspect screenshots at multiple DPRs; do not weaken tests to exact-match
  unrelated edge pixels.
- **Offset channels change scale/resource layouts:** make offsets explicit in
  channel specs and test retained updates and packed-series replacement.
- **Arrow port is the largest shader change:** isolate it in its own definition
  and commit, port behavior from the existing internal GLSL, and require GPU
  tests for each geometry mode before integration.
- **Core adapter remains a narrow translation layer:** when a limitation is
  caused by an inadequate renderer contract, improve the generic renderer API
  rather than adding Core-only resource workarounds.
- **Dirty worktree changes are mixed with parity work:** inspect diffs before
  every commit and stage only the files belonging to the current milestone.

## Acceptance criteria

- WebGPU Core dispatch supports point, rect, rule, tick, text, link, and arrow
  marks.
- Endpoint offsets work for constant and representative data/scale-backed
  cases without being baked into positional scale ranges.
- Dashed rules, point `x`/`+` shapes, independent rectangle corners, and
  rectangle shadows have focused tests and GPU/browser coverage.
- Links and arrows preserve Core/WebGL property defaults and endpoint behavior.
- Existing retained handles update series, scales, and dynamic values without
  unnecessary pipeline recreation.
- Existing WebGL, Canvas2D, SVG, and non-WebGPU tests remain green.
- Every remaining WebGPU limitation is named in the migration documentation
  and covered by a contextual test or a follow-up plan.

## Implementation record

### Milestone 1

- Status: complete
- Commit: pending
- Tests: Core WebGPU adapter suite passed with the baseline unsupported-mark
  inventory and contextual error assertions.
- Browser/GPU result: not applicable; this milestone changes only test coverage
  and migration documentation.
- Accepted differences: link and arrow remain unsupported until Milestones 5
  and 6.
