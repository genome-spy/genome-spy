# Core rule paints: smallest outline prerequisite

Status: implemented and verified; no PR opened.
Baseline inspected: origin/master `2fda19d76`.
Requirement: https://github.com/genome-spy/genome-spy/issues/604

## Architectural finding

Rules still expose a single body paint (`color`, `opacity`, `size`).
The standalone WebGPU rule program already supports fill/stroke, all three
alignments, combined coverage, caps and dashes. Core's WebGPU adapter does not
connect those inputs. Core WebGL, Canvas and SVG have single-paint rule paths.
Exposing stroke channels only through WebGPU would omit published Core and
native export consumers. Landing the old rule-specific outline API would
duplicate the shared paint vocabulary. Neither is the proposed first PR.

Issue #604 is currently closed as completed, but its requested Core rule API is
absent from the inspected master. Its state is not evidence of implemented
acceptance criteria. Do not reopen it or change its scope without instruction.

## First PR: explicit rule fill, preserving the single-paint body

Make `fill` a supported rule property and encoding, with `color` retained as
its fallback. Explicit fill wins. Keep `size` as body thickness and preserve
existing opacity behavior. This is an independently useful normalization step,
not a visible outline implementation or completion of #604.

Do not expose stroke, strokeWidth, strokeOpacity, filled or strokeAlign in this
PR. Do not add new public fill-opacity semantics as an incidental extension.
Do not accept a border on one backend while dropping it on another.

Ownership and reuse:

- `src/marks/rule.js` owns supported channels and normalized body encodings.
  Reuse the existing paint normalization/spec-origin/scale-resolution mechanisms
  in `src/marks/markUtils.js`; preserve conditional definitions, not evaluated
  colors. Do not change other marks' paint semantics.
- Existing view-owned scale resolutions continue owning domains, legends and
  shared color identity. Parameters use existing encoders and owner-scoped
  expression subscriptions; no new state or expression evaluator.
- Each renderer consumes the normalized body paint in its existing rule path:
  WebGL delegate/shaders, WebGPU adapter, Canvas painter and SVG renderer.
  Immediate projection still owns geometry/culling. No new GPU geometry,
  resources, draw passes, caches, scene graph or dependencies.
- Tick shares rule implementation. Preserve its appearance, thickness,
  orientation and color/opacity authoring without exposing new tick options.

Sources: `ARCHITECTURE.md`, `packages/core/ARCHITECTURE.md`, Core architecture
documents `rendering.md` and `reactivity.md`, and the paths above. Vega-Lite's
rule documentation provides the comparison for existing positional/config
precedence: https://vega.github.io/vega-lite/docs/rule.html . GenomeSpy's future
size-defined ribbon border is the deliberate divergence specified by #604;
no external code is to be copied.

## Success criteria and delivery

- Existing color/size/opacity rules and ordinary ticks render unchanged.
- Explicit fill works as a constant, field, parameter expression and conditional
  encoding, and takes precedence over color.
- A composed example with shared categorical color scales retains domain,
  legend and conditional-selection behavior after normalization.
- WebGL, WebGPU, Canvas and SVG consume the same normalized body paint. Extend
  existing actual-rendering checks for a representative rule and tick; do not
  create a new custom harness or a full configuration matrix.
- No change to caps, dashes/phase, endpoints, thin/zero-size behavior, clipping,
  bounds, picking IDs or minimum-picking policies.
- Focused behavior/rendering tests, relevant types/lint/schema checks, rule docs
  and a Core minor Changeset agree. Apply docs/delivery skills at implementation.
- Tentative commit: `feat(core): support explicit fill encodings on rules`.

Estimated budget, not a measured diff: 8-12 implementation/documentation files,
roughly 50-120 changed production lines, plus focused tests, generated schema
output and a Changeset. Report exact scope before opening a PR. If this needs
substantial generic-helper changes or parallel tick rendering, stop and revise.

## Following outline slice: decision gate, not implementation scope

Once the body has one canonical paint contract, plan the actual border using
stroke/strokeWidth/strokeOpacity and size-defined nominal fill. Keep common
opacity separate and apply it once. Use #604's defaults (no stroke, width 1,
outside alignment), with no outline-specific channels. Define shared alignment
and filled precedence before exposing those settings; do not invent a temporary
rule-only interpretation.

That slice must account for all required backend/export consumers, actual cap
and dash silhouettes, occurrence ordering, border-aware bounds/picking, and
transparent strokes revealing the nominal fill. Native geometry remains a real
design task: do not assume two wider/narrower strokes satisfy strict Canvas
coverage. Design that geometry before coding the border. Do not pull point,
rectangle, arrow or text alignment migration into this prerequisite.

## Implementation result

- Rules accept explicit fill; all four backend consumers use canonical fill.
- Ticks keep their supported public channels and normalize only internally.
- Extracted the existing three-line color-to-paint copy into
  `applyColorToPaintChannel`; fill/stroke normalization reuse it unchanged.
  This preserves source provenance and color-scale identity without adding a
  second normalization implementation. Rule property types select the existing
  shared fill definition.
- Two composed SVG regressions cover color fallback and explicit fill, shared
  scale identity, legend labels and live selection changes. Existing guide,
  identity and Canvas cache tests retain their behavior assertions with the new
  internal encoder name. No generated shader snapshots changed.
- Core's existing `testRenderers` runner samples rule-property expressions,
  field-fill precedence, legacy color and ordinary ticks through actual Canvas,
  WebGL and WebGPU raster export, before and after parameter updates.
- Full Core suite: 379 files, 4,176 passed, one existing skip and two TODOs.
  Focused pre-integration checks: 348 passed. Actual three-backend check passed.
- Core types, focused ESLint, schema generation, generated documentation,
  release policy and release-status checks pass. New Core minor fragment;
  the fixed release group remains on the planned minor release (1.3.0).
- Refreshed installed dependencies from the existing lockfile. No manifest or
  lockfile changes. No production rendering resources, geometry or opacity
  calculations changed.
- An early fractional-opacity raster sample differed between existing backend
  export paths. No opacity/export correction is included; the fill regression
  uses opaque paints to isolate this contribution. The existing opacity tests
  remain intact. This does not prove #604's future combined-opacity contract.
- Visible outlines and the following-slice design gate above remain outside
  this completed prerequisite. No partial stroke API has been exposed.
