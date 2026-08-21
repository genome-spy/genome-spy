# WebGPU renderer parity plan: remaining work

## Purpose

Finish the parity work between the WebGPU and WebGL Core backends. The plan
now contains only unresolved work. Point, rect, rule/tick, text, link, and
arrow dispatch; positional offsets; dashed rules; all point shapes; rectangle
corner radii, hatches, and shadows; supported colors and scales; data-driven
text size; expression-valued properties; and unique-id forwarding are already
implemented and are not repeated as milestones here.

The architecture remains split at the existing boundary:

- Core owns the declarative grammar, encoders, resolved scales, mark
  properties, view traversal, selections, and facet occurrences.
- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js` translates those
  semantic values into generic retained-renderer definitions and channel
  configurations.
- `packages/webgpu-renderer` owns mark programs, WGSL, scale definitions,
  selection resources, pipelines, and retained GPU data.
- WebGL in `packages/core/src/marks/` and its GLSL files remains the behavioral
  reference.

Each milestone should end with focused tests and one Conventional Commit.
Do not re-open completed mark milestones unless a remaining feature exposes a
regression in them.

## Current remaining gaps

### 1. Conditional encodings and selection-driven channels

The WebGPU renderer already supports channel conditions driven by single,
multi, and interval selections. Core encoders expose the same semantics as
ordered branches, where each branch contains an accessor and a selection
predicate, followed by a fallback branch. The adapter still rejects any
encoder with more than one branch instead of translating it.

Implement the Core-to-renderer translation for conditional channels:

- Convert each selection predicate to the renderer's `ChannelCondition`
  shape, preserving selection name, type, interval channel, and empty-state
  behavior.
- Translate branch accessors using the same raw-data and scale handling as
  unconditional channels. A conditional branch may be a constant value or a
  series-backed channel with its own scale.
- Preserve ordered branch precedence and the unconditional fallback.
- Ensure conditional color, opacity, numeric, positional, enum, and text-size
  channels use the correct renderer component/type contract.
- Forward `uniqueId` whenever single or multi selection conditions require it.
- Keep generic validation in `webgpu-renderer`; the adapter should only reject
  a Core branch when it cannot express that branch as a renderer channel or
  value.

Affected areas:

- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`
- Core WebGPU adapter and selection tests
- `packages/webgpu-renderer/src/marks/programs/internal/channelConfigResolver.js`
  only if a generic contract is missing
- Selection slot/resource tests and representative selection examples

Verification:

- Test constant and series-backed conditional branches for numeric, color,
  enum, positional, and text channels.
- Test single, multi, and interval selections, including empty selections and
  fallback behavior.
- Verify selection updates change values through retained slots without
  rebuilding the mark pipeline.
- Smoke-test a Core selection example with WebGL and WebGPU at DPR 1 and 2.

### 2. Faceted and sample-faceted rendering

The adapter still rejects `options.sampleFacetRenderingOptions` and
`mark.encoders.facetIndex`. WebGL renders one occurrence per facet, with
facet-specific data and coordinates. The current WebGPU path creates one
retained configuration for the un-faceted occurrence and does not yet model
the occurrence traversal contract.

Implement facet occurrence support in the Core WebGPU integration:

- Reuse the existing occurrence traversal and facet-coordinate calculations
  instead of duplicating facet grouping logic in the renderer package.
- Create one WebGPU draw/configuration per visible facet occurrence, with the
  correct data batch, view rectangle, opacity, and visible-range culling
  bounds.
- Preserve stable draw ordering and retained resource reuse when only facet
  data or layout changes.
- Handle missing or empty facets the same way as the WebGL path.
- Define how facet-local unique IDs and selection conditions are scoped, then
  test the chosen behavior against WebGL.
- Keep facet placement and grouping in Core; do not add Core-specific facet
  concepts to `packages/webgpu-renderer`.

Affected areas:

- `packages/core/src/rendering/webgpu/webGpuSurface.js`
- `packages/core/src/rendering/webgpu/webGpuRenderCoordinator.js`
- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`
- `packages/core/src/rendering/immediate/markData.js` and occurrence tests
- WebGPU retained draw/resource lifecycle tests

Verification:

- Render ordinary facet-index data, sample facets, missing facets, and empty
  facet batches.
- Compare facet positions, clipping/culling, opacity, and draw order with
  WebGL.
- Verify facet changes do not leak draw handles or recreate pipelines when the
  mark definition remains unchanged.

### 3. Core scale types without renderer definitions

The adapter now translates the scale types already represented by the generic
renderer, including linear, log, pow, sqrt, symlog, time/UTC-as-milliseconds,
point, band, index, ordinal, quantize, and threshold forms. The remaining Core
scale families have no equivalent low-level definition:

- `locus`, whose input may contain genomic coordinates and assembly/contig
  semantics;
- `quantile`, whose bucket boundaries depend on the resolved data domain;
- `bin-ordinal`, whose discrete domain and range are generated from bins; and
- any future Core scale type without a public renderer definition.

For each remaining scale family, choose and implement the correct generic
contract rather than adding another adapter-only special case:

- Define the scale input type, domain/range resources, update behavior, and
  WGSL mapping in `packages/webgpu-renderer/src/marks/scales/defs/`.
- Add a public scale factory and type declaration.
- Normalize Core domains and ranges in the adapter without losing precision or
  ordinal identity.
- Add domain/range update handling to retained scale slots.
- For locus scales, explicitly decide whether Core must materialize numeric
  range-space values or the renderer should receive a generic packed genomic
  representation. Preserve high-precision index behavior.
- For quantile and bin-ordinal scales, test domain recomputation and changes
  to bucket count/range length.

If a scale cannot be supported without a larger data/coordinate subsystem,
record that decision in the migration plan and keep its error in the generic
renderer boundary. Do not silently fall back to linear behavior.

Affected areas:

- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`
- `packages/webgpu-renderer/src/scales/`
- Scale definitions, shader-generation, scale-resource, and retained-update
  tests
- Core examples using genomic, quantile, and binned scales

Verification:

- Compare mapped positions, colors, and sizes with WebGL for representative
  domains, reversed ranges, clamping, domain updates, and high-precision
  coordinates.
- Run renderer scale unit/GPU tests and Core adapter tests for each supported
  scale family.

### 4. Font parity and text resource registration

The WebGPU text program currently resolves Core's default sans-serif to the
embedded Lato atlas and rejects other font families. WebGL can use Core's font
manager and registered font resources.

Bring the WebGPU font path to the same resource contract:

- Define how a text mark requests a family, style, and weight from Core.
- Pass a font resource or atlas identity through the generic text mark config.
- Extend the renderer's font manager/atlas lifecycle to load or receive the
  required glyph metrics and texture resources.
- Preserve data-driven text size, layout-base sizing, padding, squeeze, and
  glyph expansion when the selected font changes.
- Handle unavailable fonts explicitly and consistently with WebGL.

Affected areas:

- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`
- `packages/webgpu-renderer/src/marks/programs/textProgram.js`
- `packages/webgpu-renderer/src/fonts/`
- Text resource, layout, and browser tests

Verification:

- Compare default sans-serif, Lato, an additional registered family, italic,
  and multiple weights with WebGL.
- Verify font changes rebuild only the resources that require rebuilding and do
  not invalidate unrelated mark pipelines.

### 5. Data-driven mark-local properties

The generic renderer exposes several properties as mark uniforms because they
are currently constant for a draw. Core/WebGL can vary some of these through
conditional encodings or property expressions. The remaining examples include
arrow head shape/placement/stem options and link geometry options. They must
not be encoded as a single value when the Core specification supplies a
per-datum or selection-dependent value.

Audit each mark-local property against Core's actual encoding surface:

- If the property is genuinely per-instance, promote it to a typed renderer
  channel and consume it in WGSL.
- If it is selection-dependent but not per-instance, represent it as a generic
  conditional value slot.
- If it is a view/parameter expression, ensure updates use retained dynamic
  values rather than rebuilding a pipeline unnecessarily.
- Keep properties that are structurally uniform (for example shader branch
  configuration) as uniforms and document that contract.
- Do not add Core-specific property types to the renderer package.

Affected areas:

- Core mark property/encoder setup
- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`
- Relevant mark channel specs and WGSL programs
- Generic value/condition slot handling in `packages/webgpu-renderer`

Verification:

- Build a property matrix from WebGL mark attributes and Core mark types.
- Test constant, parameter-expression, conditional, and per-datum cases for
  each property that claims support.
- Assert that unsupported structural properties fail at the renderer contract
  boundary with a useful error.

## Adapter boundary rules

The adapter is a semantic translator, not a second renderer validator. Keep
only checks required to translate Core values:

- required Core encoders are present;
- enum values have a defined numeric mapping;
- raw data can be represented by the renderer's declared typed array;
- Core features with no renderer representation are reported contextually.

Channel component counts, scale compatibility, resource shape, selection slot
validity, and WGSL/pipeline constraints belong in `packages/webgpu-renderer`.
When a new adapter check is proposed, add a test explaining why the generic
renderer cannot perform it.

## Implementation sequence and commits

1. Conditional channel translation and selection resources.
   `feat(core): translate conditional WebGPU channels`
2. Facet and sample-facet occurrence traversal.
   `feat(core): render WebGPU facet occurrences`
3. Remaining generic scale definitions, starting with the scale family needed
   by the highest-value Core examples.
   `feat(webgpu): add remaining parity scale definitions`
4. Font resource registration and text-family parity.
   `feat(webgpu): support registered text fonts`
5. Mark-local dynamic/per-instance property parity.
   `feat(webgpu): support dynamic mark properties`
6. Cross-renderer audit, migration documentation, and final verification.
   `test(webgpu): verify remaining renderer parity`

Each step should include its focused tests and update the migration plan only
for behavior actually implemented. Keep unrelated fixes out of the commit.

## Verification strategy

During implementation, run the narrowest relevant suite:

- `npx vitest run packages/core/src/rendering/webgpu/<test>.test.js --reporter=agent`
- `npx vitest run --root packages/webgpu-renderer --reporter=agent`
- `npm -w @genome-spy/core run test:tsc --if-present`
- `npm -w @genome-spy/webgpu-renderer run test:tsc --if-present`

For each user-visible feature, compare WebGL and WebGPU at DPR 1 and DPR 2,
using representative examples and browser console/page-error checks. GPU tests
must cover the renderer-level shader/resource contract; browser tests must
cover Core traversal, updates, and visible output.

Before declaring the remaining parity work complete, run:

- `npm --workspaces run test:tsc --if-present`;
- `npm run lint`;
- the full relevant Vitest suites;
- the WebGPU GPU suite when available;
- representative Core examples for conditionals, facets, scales, and fonts;
- WebGL regression tests plus shared Canvas/SVG tests.

## Acceptance criteria

- Conditional Core encodings render with the same branch precedence and
  selection behavior as WebGL.
- Faceted and sample-faceted marks render the correct data and coordinates,
  including culling, opacity, ordering, and retained updates.
- Every Core scale used by supported examples either has a generic WebGPU
  definition with matching updates or is explicitly documented as unsupported
  with a follow-up issue/plan.
- Registered text fonts, styles, weights, and dynamic sizes behave like WebGL.
- Mark-local properties are either correctly channelized/conditionalized or
  explicitly constrained by a documented generic renderer contract.
- No remaining adapter check merely duplicates validation already provided by
  `webgpu-renderer`.
- Existing completed parity features remain green while these integrations are
  added.

## Baseline implementation references

The completed work that this plan builds on is recorded in git history,
including the adapter audit commits `068e3cb30` and `43006bf27`. It is
intentionally not listed as open work here.
