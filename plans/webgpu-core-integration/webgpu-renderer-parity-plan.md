# WebGPU renderer parity plan: remaining work

## Purpose

Bring the WebGPU Core backend to the supported feature level of the current
WebGL backend while keeping the rendering boundary intentional:

- Core owns the declarative grammar, encoders, resolved scales, locus
  conversion, category indexing, view traversal, selections, tooltips, and
  facet occurrences.
- `packages/core/src/rendering/webgpu/` translates those semantic values into
  generic retained-renderer definitions and draw commands.
- `packages/webgpu-renderer` owns mark programs, WGSL, pipelines, bind groups,
  scale resources, value slots, series buffers, and the low-level pick pass.
- WebGL in `packages/core/src/marks/`, `packages/core/src/gl/`, and the
  interaction controller remains the behavioral reference.

Completed work is intentionally omitted from the open milestones. The current
adapter already covers mark dispatch for point, rect, rule/tick, text, link,
and arrow; positional offsets; dashed rules; point shapes; rectangle corner
radii, hatches, and shadows; supported colors and scales already represented by
the low-level renderer; data-driven text size; expression-valued properties at
initial translation; and unique-id forwarding to the renderer pick channel.

Every active milestone ends with focused tests and one Conventional Commit.
Faceting remains a separate, final, postponed milestone and must not be
implemented or redesigned until explicitly authorized.

## Scope decisions and non-goals

### Scale scope follows WebGL semantics, with explicit unsupported types

WebGPU must expose only scale behavior that Core’s current WebGL path can
translate and that this migration explicitly elects to support. The renderer
package must not acquire a scale merely because Vega or the low-level API can
represent it.

The intended Core-to-renderer mapping is:

| Core scale | Renderer representation | Status |
| --- | --- | --- |
| linear, sequential-linear, diverging-linear | `linear` or corresponding range stops | Supported scope |
| log | `log` | Supported scope |
| pow, sqrt | `pow`, `sqrt` | Supported scope |
| symlog | `symlog` | Supported scope |
| ordinal | integer category input through `ordinal` | Supported scope |
| band, point | integer category input through `band` | Supported scope |
| index | `index` with 1- or 2-component `u32` input | Supported scope |
| locus | Core-normalized `index` with 1- or 2-component `u32` input | Supported scope |
| quantize | `quantize`, only where WebGL supports the same use | Supported scope |
| threshold | `threshold`, only where WebGL supports the same use | Supported scope |
| quantile | none | Explicitly unsupported |
| bin-ordinal | none | Explicitly unsupported |

`locus` is not a request for a new low-level genomic scale. Core already owns
assembly, contig, complex-locus parsing, domain resolution, zooming, and
conversion to numeric positions. The adapter should translate the resolved
locus scale at the renderer boundary to the existing index contract. No
locus-specific types, genome stores, or contig logic belong in
`packages/webgpu-renderer`.

WebGL has two index input representations. For an index or resolved locus
domain that fits the normal 32-bit address space, it supplies one `uint` per
datum. For a domain that needs the large-coordinate path, it supplies a
`uvec2` containing the split high/low parts. WebGPU must select the same mode
from the resolved numeric domain and use the smallest matching storage:
`Uint32Array` with `inputComponents: 1` for the normal mode, or a packed
`Uint32Array` with `inputComponents: 2` for the large-coordinate mode. A
`Float64Array` is an accepted renderer convenience for packing, but it is not
the target Core representation because it doubles the source-side storage and
forces an avoidable conversion.

GenomeSpy does not support time scales. Do not add `time` or `utc` scale
handling to Core or WebGPU, and remove any adapter mapping that would expose
those types as supported.

Quantile and bin-ordinal must remain unsupported in WebGPU. Do not add scale
definitions, WGSL, or adapter fallbacks for them. They should fail with a
contextual unsupported-capability error at the Core WebGPU boundary, while
generic renderer validation remains responsible for renderer-internal shape
errors. A future scale type is not automatically part of WebGPU parity.

### Category identity remains in Core

WebGPU storage and WGSL inputs remain numeric. Strings, numbers, and other
categorical scalar values must be converted to stable integer IDs before they
reach `packages/webgpu-renderer`.

The source of truth is the existing Core machinery used by WebGL:
`ScaleResolution` maintains a categorical `domainIndexer`, and
`packages/core/src/gl/dataToVertices.js` uses that indexer, or creates one from
the resolved domain, before constructing GPU attributes. The WebGPU adapter’s
private category map is only a temporary implementation detail and must be
removed; it must not become a second category-domain system.

The eventual contract is:

- Core assigns each category one stable integer for the lifetime of the
  resolved scale. For example, `apple`, `pear`, and `orange` may become
  `1`, `2`, and `3`; a later batch containing `pear`, `orange`, and `plum`
  becomes `2`, `3`, and `4`.
- Core supplies those integers in every categorical series and supplies the
  current integer IDs as the categorical scale domain. Updated data reuses the
  existing Core assignments; it does not re-index from zero for each batch.
- The adapter uses that Core mapping for band/point inputs, ordinal values,
  ordinal colors, enum-like properties, and conditional branches.
- The renderer receives integer typed arrays or integer value slots only. It
  never interns strings or interprets Core categorical objects.
- The existing renderer domain map is retained when needed. It is not a
  second category identity system: it maps Core IDs such as `2`, `3`, and `4`
  to the current scale’s range slots and supports sparse integer domains.
- Mapping changes update the relevant series or scale resources without
  changing pipeline layout. A capacity reallocation is acceptable when the
  domain grows, but it must not trigger an unrelated pipeline rebuild.

### Dynamic properties are a performance contract

Parameter- and expression-driven mark properties must remain retained and
cheap to update. WebGL’s reference behavior is `Mark.registerMarkUniformValue`:
it watches the expression through `paramRuntime`, calls a raw uniform setter
when the value changes, marks uniforms dirty, and requests a render. It does
not rebuild the shader, vertex attributes, or mark buffers for a scalar
uniform update.

WebGPU should preserve the same distinction:

- Dynamic scalar, color, enum, and selection values use retained value slots or
  uniform resources.
- Data-driven series values replace only the affected series buffer when the
  channel shape remains unchanged.
- Scale domain/range changes update retained scale resources.
- Mark type, channel presence, scalar/vector component count, text atlas
  identity, and other shader-layout changes may recreate a program/pipeline.
- A parameter change must not recreate a mark program, pipeline, bind-group
  layout, or unrelated channel buffers.

The adapter must not eagerly turn every `ExprRef` into a new per-frame series
or rebuild a complete config merely because the expression changed. The
retained surface/renderer API must receive the smallest update corresponding
to the changed property.

### Picking is part of the Core backend contract

The low-level renderer already has a separate pick texture and pick pipeline,
and mark programs already emit `uniqueId + 1`. Core does not yet connect that
facility to its normal interaction path: the WebGPU coordinator renders only
with `{ picking: false }`, the backend does not expose `readPickingId`, and the
renderer API is asynchronous while `InteractionController` currently expects a
synchronous pixel read.

The goal is to reuse Core’s existing hover and tooltip flow, including
`Collector.findDatumByUniqueId`, `Mark.isPickingParticipant`, view-coordinate
checks, custom tooltip handlers, and click/hover state. Do not create a second
tooltip implementation in the renderer package.

The initial picking milestone covers non-faceted views. Facet-scoped picking
remains part of the postponed facet milestone.

## Current remaining milestones

### 1. Conditional encodings and selection-driven channels

The WebGPU renderer supports channel conditions driven by single, multi, and
interval selections. Core exposes ordered conditional encoder branches, but
the adapter still rejects encoders with more than one branch.

Implement the translation while retaining the renderer’s generic contract:

- Convert each Core selection predicate to the renderer’s `ChannelCondition`,
  preserving selection name, type, interval channel, and empty-state behavior.
- Translate constants and series-backed branches using the same scale and
  categorical-indexing path as unconditional channels.
- Preserve branch order and the unconditional fallback.
- Cover numeric, color, opacity, positional, enum, and text-size channels.
- Forward `uniqueId` whenever a selection condition needs it.
- Keep only semantic adapter checks. Channel shape, slot validity, and WGSL
  constraints belong in `packages/webgpu-renderer`.

Affected areas:

- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`
- Core WebGPU adapter and selection tests
- Renderer channel-condition and selection-slot tests only where a generic
  contract is missing

Verification:

- Test constant and series-backed conditional branches for every supported
  channel class.
- Test single, multi, and interval selections, including empty selections.
- Verify selection updates use retained slots and do not rebuild pipelines.
- Smoke-test a Core selection example against WebGL at DPR 1 and 2.

Tentative commit: `feat(core): translate conditional WebGPU channels`

### 2. Scale boundary, index-width selection, and Core-owned category IDs

Make the adapter’s scale surface match the scope table above and align its
categorical conversion with WebGL’s existing `domainIndexer` machinery.

Implementation work:

- Add the Core adapter mapping for `locus` to the renderer’s existing `index`
  representation. Core must provide already-resolved numeric locus values and
  domain/range semantics.
- Select the index representation from the resolved numeric domain using the
  same boundary as WebGL. Use one `Uint32Array` component for normal domains;
  use two packed `Uint32Array` components containing the high/low split only
  for the large-coordinate path. Do not use `Float64Array` as the normal Core
  representation.
- Keep `quantile` and `bin-ordinal` rejected. Add tests proving no low-level
  definition is selected for either type.
- Remove or reject `time` and `utc`; GenomeSpy does not support time scales.
- Audit every other adapter case against the WebGL scale generator and
  `webGLHelper`; remove any WebGPU-only scale exposure outside the supported
  table.
- Replace the adapter-local categorical identity map with the resolved Core
  `domainIndexer`, or introduce the smallest Core helper needed to expose that
  existing identity without duplicating scale-resolution state.
- Ensure each categorical series contains the stable Core IDs, including when
  a new batch introduces a category that was absent from the previous batch.
- Pass the current Core IDs as the renderer scale domain. Retain the renderer’s
  existing integer-domain map for sparse IDs; do not add another identity
  assignment in WebGPU.
- Verify categorical data in positional, color, opacity, enum, and conditional
  channels, including strings and numeric categories.
- Preserve stable IDs during domain updates and shared-scale resolution.

Affected areas:

- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`
- `packages/core/src/scales/scaleResolution.js` or a focused Core scale/indexer
  helper, only if the existing indexer needs a supported access path
- WebGPU scale and adapter tests
- `packages/webgpu-renderer` only for generic index-scale width and integer
  domain-map behavior; do not add string support or a second category indexer

Verification:

- Compare categorical positions/colors and locus positions with WebGL.
- Test explicit and implicit domains, unknown categories, domain growth, and
  shared scales.
- Test reversed ranges, clamping, domain updates, normal-width indices, and
  high-precision loci.
- Assert quantile and bin-ordinal remain unsupported with useful errors.
- Assert time and UTC remain unsupported.
- Assert category conversion produces the stable Core integer IDs in numeric
  typed arrays before renderer creation and does not introduce renderer-side
  string handling.
- Test the sequence `apple/pear/orange -> 1/2/3`, then
  `pear/orange/plum -> 2/3/4`, including the renderer’s sparse integer domain
  map and unchanged pipeline layout.
- Assert normal index data uses one `u32` component and large-coordinate index
  data uses two packed `u32` components, with no unnecessary float64 source
  series.

Tentative commit: `feat(core): align WebGPU scales with WebGL semantics`

### 3. Retained dynamic mark properties

Complete the property matrix for mark-local values and implement the update
path with WebGL-like retention guarantees.

Audit each property on point, rect, rule/tick, text, link, and arrow against
the Core mark classes, WebGL uniform registration, conditional encoders, and
the renderer’s current value-slot/channel APIs.

Classify each property as:

- a retained scalar/vector value slot for parameter- or selection-driven
  values;
- a typed data-driven channel whose series can be replaced independently;
- a structural pipeline property whose changes legitimately require a new
  program/pipeline; or
- unsupported until a generic renderer contract is designed.

Do not encode a per-datum property as one constant value. Conversely, do not
promote a structurally uniform shader option to a per-instance buffer merely
to avoid a clear error. Preserve the smallest resource update possible:

- expression changes update a value slot and request rendering;
- channel data changes replace only that channel’s series;
- scale changes update scale slots;
- pipeline/bind-group layout changes are reserved for real structural changes.

The adapter and retained surface must preserve expression identity or register
Core parameter watchers so a change does not require reconstructing every mark
config. Add instrumentation tests around program, pipeline, bind-group, and
buffer creation counts for repeated expression updates.

Affected areas:

- Core mark property and encoder setup
- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`
- `packages/core/src/rendering/webgpu/webGpuSurface.js`
- Relevant renderer value/channel slot APIs and WGSL programs
- Mark property and retention tests

Verification:

- Test constant, parameter-expression, selection-dependent, and per-datum
  cases for every property claiming support.
- Test updates over multiple frames and assert no unnecessary pipeline,
  bind-group, program, or unrelated series-buffer churn.
- Compare arrow/link geometry, point/rect geometry, text size, and colors with
  WebGL.
- Verify unsupported structural properties fail at the renderer contract
  boundary with a contextual error.

Tentative commit: `feat(webgpu): retain dynamic mark property updates`

### 4. WebGPU picking and tooltip integration

Connect the low-level asynchronous pick API to Core’s existing interaction
controller and tooltip path.

Implementation work:

- Render a WebGPU pick frame containing only marks for which
  `mark.isPickingParticipant()` is true, analogous to WebGL’s second buffered
  rendering context.
- Expose a backend/coordinator pick operation that handles the renderer’s
  `Promise<number | null>` API and converts canvas logical coordinates to the
  renderer’s expected coordinate system and DPR.
- Adapt the interaction path for asynchronous reads without allowing stale
  pointer results to overwrite newer pointer positions. Preserve the existing
  drag/zoom throttling behavior.
- Decode the low-level ID convention (`0` means no hit; rendered IDs are
  `uniqueId + 1`) before passing the Core unique ID to the existing view
  traversal.
- Reuse `Collector.findDatumByUniqueId`, view facet-coordinate checks for the
  non-faceted path, tooltip handlers, cursor state, and click/hover behavior.
- Ensure scissor and visible-range culling apply to the pick draw just as they
  do to the visible draw.
- Keep pick resources separate from normal rendering and avoid rebuilding
  normal pipelines, bind groups, or series buffers when only the pick pass is
  requested.

Affected areas:

- `packages/core/src/rendering/renderingBackend.js`
- `packages/core/src/rendering/webgpu/index.js`
- `packages/core/src/rendering/webgpu/webGpuSurface.js`
- `packages/core/src/rendering/webgpu/webGpuRenderCoordinator.js`
- `packages/core/src/genomeSpy/interactionController.js`
- WebGPU renderer pick tests where its generic API is incomplete

Verification:

- Unit-test no-hit, hit, stale-result, DPR, out-of-bounds, and coordinate
  conversion behavior.
- Test that non-picking marks are absent from the pick pass.
- Test unique-ID lookup through a collector and the existing tooltip handler.
- Browser-smoke-test hover, tooltip, click, and tooltip dismissal on a
  non-faceted point/rect example with WebGL/WebGPU comparison.

Tentative commit: `feat(core): connect WebGPU picking to tooltips`

### 5. Font resource parity

The WebGPU text program currently resolves the default sans-serif to its
embedded atlas and rejects other font families. Bring it to the same resource
contract as WebGL without disturbing unrelated mark pipelines.

Implementation work:

- Define how Core supplies font family, style, weight, and atlas identity.
- Extend the renderer font/atlas lifecycle to load or receive the required
  glyph metrics and texture resources.
- Preserve data-driven text size, layout-base sizing, padding, squeeze, and
  glyph expansion.
- Handle unavailable fonts consistently with WebGL.

Affected areas:

- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`
- `packages/webgpu-renderer/src/marks/programs/textProgram.js`
- `packages/webgpu-renderer/src/fonts/`
- Text resource, layout, and browser tests

Verification:

- Compare default sans-serif, Lato, another registered family, italic, and
  multiple weights with WebGL.
- Confirm changing a text atlas rebuilds only the dependent text resources.

Tentative commit: `feat(webgpu): support registered text fonts`

### 6. Cross-renderer integration audit

Run the complete supported-surface audit after the individual milestones.
Update this plan to mark only behavior that is actually implemented, and
record any intentionally unsupported behavior at the adapter boundary.

Verification must include:

- WebGL/WebGPU comparisons at DPR 1 and 2 for supported scale families,
  categorical values, dynamic properties, selection conditions, and tooltips.
- The scrollable viewport/grid example that exposed inverted axes, misplaced
  labels, and missing culling.
- Representative point, rect, rule/tick, text, link, and arrow examples.
- Console/page-error checks and retained-resource instrumentation during
  parameter changes and hover.

Tentative commit: `test(webgpu): verify supported renderer parity`

### 7. Faceted and sample-faceted rendering — postponed

The adapter still rejects `options.sampleFacetRenderingOptions` and
`mark.encoders.facetIndex`. WebGL renders one occurrence per facet, with
facet-specific data and coordinates. The current WebGPU path does not yet
model occurrence ownership, retained draw lifetimes, facet-local selections,
or facet-scoped picking.

This work is intentionally postponed. Do not implement, redesign, or expand
it until the user explicitly authorizes continuation. When resumed, the work
must:

- reuse Core’s existing occurrence traversal and facet-coordinate calculations;
- create one retained draw/configuration per visible facet occurrence;
- preserve draw ordering, clipping, visible-range culling, opacity, and empty
  facet behavior;
- define facet-local unique-ID and selection scoping before implementing
  facet picking; and
- keep facet grouping and placement in Core, with no Core-specific concepts in
  `packages/webgpu-renderer`.

Tentative commit, only after authorization: `feat(core): render WebGPU facet occurrences`

## Adapter boundary rules

The adapter is a semantic translator, not a duplicate renderer validator. It
may check:

- required Core encoders and mark semantics are present;
- a Core feature has an intentional renderer representation;
- categorical values have a Core-owned integer mapping;
- an unsupported Core scale is reported contextually; and
- raw values can be represented by the renderer’s declared typed array.

The adapter must not independently duplicate validation for channel component
counts, scale resource layout, selection slot validity, bind-group limits, or
WGSL/pipeline constraints. Those belong in `packages/webgpu-renderer`. Any new
adapter check needs a test explaining why the generic renderer cannot perform
it.

## Verification strategy

Use the narrowest relevant suite during each milestone:

- `npx vitest run packages/core/src/rendering/webgpu/<test>.test.js --reporter=agent`
- `npx vitest run --root packages/webgpu-renderer --reporter=agent`
- `npm -w @genome-spy/core run test:tsc --if-present`
- `npm -w @genome-spy/webgpu-renderer run test:tsc --if-present`

For browser work, use the GenomeSpy browser-debugging workflow and compare
WebGL and WebGPU at DPR 1 and DPR 2. Include console/page-error checks and
the interaction examples needed for picking and tooltips.

Before declaring this parity work complete, run the relevant full Vitest
suites, workspace TypeScript checks, lint, the WebGPU GPU suite when
available, and representative Core examples. Quantile and bin-ordinal must
remain rejected throughout.

## Acceptance criteria

- Supported Core scales have matching WebGPU behavior, with `locus` translated
  to the renderer’s index contract and locus-specific logic remaining in Core.
- Index and locus channels use one `u32` component for normal domains and two
  packed `u32` components only for large-coordinate domains, matching WebGL’s
  representation and minimizing series memory.
- Quantile and bin-ordinal are explicitly unsupported in WebGPU and have no
  low-level renderer definitions or silent fallback.
- Time and UTC scales remain unsupported.
- Categorical strings and other scalar categories are indexed once by existing
  Core machinery and reach WebGPU as stable integer data. Renderer domain maps
  may map those IDs to current range slots, but do not assign new identities.
- Conditional encodings match WebGL branch precedence and selection behavior.
- Parameter/expression-driven dynamic properties update retained resources
  without unnecessary pipeline, bind-group, program, or buffer churn.
- WebGPU picking drives the existing Core hover and tooltip behavior for
  non-faceted views, including asynchronous reads and DPR conversion.
- Registered text fonts, styles, weights, and dynamic sizes match WebGL.
- Adapter checks are limited to semantic translation and contextual
  unsupported-capability reporting.
- Faceting remains postponed and is not a completion criterion until explicitly
  authorized.

## Baseline implementation references

The completed work that this plan builds on is recorded in git history,
including the adapter audit and the explicit faceting-postponement commits.
The open milestones above are based on the current Core WebGL paths:

- `packages/core/src/gl/dataToVertices.js` for category indexing;
- `packages/core/src/scales/scaleResolution.js` for stable categorical
  domains, indexer lifetime, and Core locus resolution;
- `packages/core/src/gl/glslScaleGenerator.js` and `webGLHelper.js` for the
  WebGL scale capability and normal/large index attribute reference;
- `packages/webgpu-renderer/src/marks/scales/defs/band.js` and `ordinal.js`
  for the existing integer-input and sparse-domain-map contract;
- `packages/core/src/marks/mark.js` for retained expression/uniform updates
  and picking participation; and
- `packages/core/src/genomeSpy/renderCoordinator.js` and
  `interactionController.js` for the WebGL pick/tooltip flow.
