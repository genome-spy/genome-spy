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
initial translation; series-backed conditional encodings with point and
single-channel interval predicates; non-faceted tooltip picking through the
renderer pick channel; and Core-loaded text font metrics, styles, weights, and
atlases. Multi-channel interval predicates and literal conditional branches
are not yet complete, and the WebGPU path does not yet translate Core's
score-based semantic zoom, as detailed below.

Every active milestone ends with focused tests and one Conventional Commit.
Faceting remains a separate, final, postponed milestone and must not be
implemented or redesigned until explicitly authorized.

## Goals and non-goals

This revision adds two active parity projects. First, make Core's WebGPU backend
support interval selections over both `x` and `y`, with the same logical
selection driving GPU conditional encodings and CPU dataflow filters. Second,
add a minimal typed visibility predicate over scalar inputs and existing
selection resources, then use that abstraction to match Core's score-based
semantic zoom without adding GenomeSpy grammar concepts to the low-level
renderer.

Goals:

- preserve Core's existing interval-selection grammar and parameter values;
- represent every configured interval dimension in one renderer-owned logical
  selection resource over a fixed list of scalar inputs and evaluate the inputs
  with AND semantics;
- make empty state explicit instead of inferring it from a reversed sentinel;
- retain the current fast update path: uniform writes only, with no mark,
  pipeline, bind-group layout, bind group, or series-buffer recreation;
- keep single-channel `x` and `y` selections working through the same contract;
- preserve same-axis ranged-datum hit testing through secondary channels; and
- verify conditional rendering, CPU filtering, picking, and linked views
  together with the real penguins example;
- introduce immutable predicate trees over visual or non-visual scalar inputs,
  retained scalar slots, existing selection tests, and only the ordered
  comparisons plus `all`/`any` composition needed by concrete visibility use
  cases;
- add early point-instance visibility shared by normal and picking pipelines;
  and
- translate Core `semanticScore` behavior through generic score input,
  threshold, selection-bypass, and visibility contracts while leaving
  quantile/zoom policy in Core.

Non-goals:

- changing the public Core selection grammar or the shape of
  `IntervalSelection.intervals`;
- moving Core transform filtering, aggregation, or scale-domain computation
  into the GPU; renderer visibility changes rendering and picking only;
- adding interval predicates for two-component high-precision index/locus
  inputs; the renderer currently requires scalar interval target inputs, and
  that separate limitation must remain explicit;
- changing point-selection or multi-selection storage;
- introducing dynamic selection input sets or predicate topology after mark
  creation;
- adding named predicate references, predicate graphs, subexpression
  deduplication, equality, `not`, or a general range-expression language before
  a concrete consumer requires them;
- exposing arbitrary WGSL or a general-purpose expression compiler in the
  renderer;
- generalizing predicate-driven conditional encodings or early visibility to
  every mark program in this milestone; existing selection conditions continue
  to use their established path;
- adding legend brushing or expanding Core's public interval-selection grammar
  beyond x/y in these milestones; and
- implementing, redesigning, or expanding faceting.

## Investigation findings and current limitations

The reported URL was reproduced in Chromium with WebGPU. Initialization reaches
`createSelectionCondition` and fails before the first complete frame with:

`Interval selection "brush" must target one channel for WebGPU. Mark: point. View: viewRoot/scatterPlot`

The same example under WebGL accepts a two-dimensional drag. The brush colors
only points inside both the x and y ranges and the two linked bar charts are
recomputed from the same selection without console errors.

| Area                                 | Current behavior and limitation                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core creation and interaction        | `packages/core/src/paramRuntime/paramUtils.js` creates one `IntervalSelection` with a key for every configured encoding. `packages/core/src/view/gridView/intervalSelectionController.js` updates all configured channels together, orders pointer-derived bounds, writes a new parameter object, and uses `null` for cleared channel intervals. This path already supports x+y and should remain Core-owned.                                                                                              |
| CPU selection semantics              | `packages/core/src/selection/selection.js` builds one predicate per selected channel and joins them with `&&`; `packages/core/src/data/transforms/filter.js` watches that expression and repropagates linked dataflow branches. The AND behavior needed by the bar charts already exists, but focused x+y and empty tests are missing.                                                                                                                                                                     |
| WebGL GPU predicates                 | `packages/core/src/marks/mark.js` allocates a separate typed uniform pair per interval channel, uploads `[1, 0]` when a channel is `null`, ANDs the channel tests, and ORs an `empty` fallback when any uniform pair is reversed. It also selects `intersects`, `encloses`, or `endpoints` behavior for ranged marks from `mark.defaultHitTestMode`.                                                                                                                                                       |
| Core WebGPU adapter                  | `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js#createSelectionCondition` converts a predicate to one `when.channel` and rejects `Object.keys(selection.intervals).length !== 1`. It cannot describe x+y or carry Core's ranged hit-test mode.                                                                                                                                                                                                                                                    |
| Core WebGPU retention                | `packages/core/src/rendering/webgpu/webGpuSurface.js` scans conditional channel configs to rediscover one interval target, caches only one bounds pair, converts missing bounds to `[1, 0]`, and calls `slot.set(min, max)`. It cannot update multiple targets atomically. Its `getLogicalChannelSeries` also assumes every conditional branch has `condition.channel`; literal interval conditions such as the existing x-only interval example currently reach it with only `condition.value` and throw. |
| Renderer public contract             | `packages/webgpu-renderer/src/index.d.ts` exposes one optional `SelectionPredicate.channel` and an interval slot `set(min, max)`. It has no way to declare several targets or to distinguish an inactive channel from a reversed active pair.                                                                                                                                                                                                                                                              |
| Renderer normalization and resources | `packages/webgpu-renderer/src/marks/programs/internal/selectionResources.js` collapses conditions to one `SelectionDef`, rejects a second interval channel, allocates one vec2 uniform, and initializes it to `[1, 0]`. Scalar target validation is correct for the present scope, but mixed scalar types across x and y cannot be represented by the one-uniform definition.                                                                                                                              |
| WGSL generation                      | `packages/webgpu-renderer/src/marks/shaders/markShaderBuilder.js` emits one interval test. It computes `minSel` and `maxSel` with `min`/`max` and then checks `minSel > maxSel`, so the initialized `[1, 0]` sentinel can never be detected as empty. Existing GPU tests cover active x-only and same-axis x/x2 overlap, but not empty, y-only, x+y, or reversed bounds.                                                                                                                                   |
| Secondary channels                   | The existing `secondaryChannel` shader path compares a ranged datum (`x`/`x2` or `y`/`y2`) with one interval dimension. It is orthogonal to a multi-dimensional selection: x+y requires two primary target tests combined with AND. The range-comparison generator is reusable inside each target, but one secondary channel must not be modeled as another selection dimension.                                                                                                                           |
| Score-based semantic zoom            | `packages/core/src/marks/point.js` samples and sorts `semanticScore`, computes a zoom-dependent quantile threshold, and uploads it as `uSemanticThreshold`. `point.vertex.glsl` culls below-threshold points before geometry work but lets points participating in relevant selections bypass the threshold. The Core WebGPU adapter does not translate `semanticScore`, and the renderer has neither non-visual predicate inputs nor a generic early-visibility consumer.                                 |
| Picking and tooltips                 | Visible and picking pipelines already share the same selection definitions, uniform buffer, bind group, and channel WGSL, and interval slot updates already call `markPickingDirty()`. No separate picking resource is needed, but conditional position/size changes must be verified because they affect pick geometry.                                                                                                                                                                                   |

The failure is therefore not a Core selection-creation problem and not a
dataflow-filter problem. It is an underspecified Core-to-renderer predicate and
slot contract, followed by single-target resource and WGSL assumptions.

## Scope decisions and non-goals

### Scale scope follows WebGL semantics, with explicit unsupported types

WebGPU must expose only scale behavior that Core’s current WebGL path can
translate and that this migration explicitly elects to support. The renderer
package must not acquire a scale merely because Vega or the low-level API can
represent it.

The intended Core-to-renderer mapping is:

| Core scale                                  | Renderer representation                                    | Status                 |
| ------------------------------------------- | ---------------------------------------------------------- | ---------------------- |
| linear, sequential-linear, diverging-linear | `linear` or corresponding range stops                      | Supported scope        |
| log                                         | `log`                                                      | Supported scope        |
| pow, sqrt                                   | `pow`, `sqrt`                                              | Supported scope        |
| symlog                                      | `symlog`                                                   | Supported scope        |
| ordinal                                     | integer category input through `ordinal`                   | Supported scope        |
| band, point                                 | integer category input through `band`                      | Supported scope        |
| index                                       | `index` with 1- or 2-component `u32` input                 | Supported scope        |
| locus                                       | Core-normalized `index` with 1- or 2-component `u32` input | Supported scope        |
| quantize                                    | `quantize`, only where WebGL supports the same use         | Supported scope        |
| threshold                                   | `threshold`, only where WebGL supports the same use        | Supported scope        |
| quantile                                    | none                                                       | Explicitly unsupported |
| bin-ordinal                                 | none                                                       | Explicitly unsupported |

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

### Multi-channel intervals are one logical selection resource

The renderer contract should describe the complete, fixed target set of an
interval predicate instead of exposing one `channel` string. Use a
discriminated interval predicate with a target array conceptually equivalent
to:

```ts
type IntervalSelectionTarget = {
  input: string;
  secondaryInput?: string;
  hitTest?: "intersects" | "encloses" | "endpoints";
};

type IntervalSelectionPredicate = {
  selection: string;
  type: "interval";
  targets: IntervalSelectionTarget[];
  empty?: boolean;
};
```

The precise public type names may follow the renderer's naming conventions,
but these semantics are required:

- `targets` is non-empty, ordered, and fixed for the mark lifetime;
- primary `input` names are unique within one selection. Duplicate primary
  inputs are rejected because the update object is keyed by those names and a
  duplicate test would be semantically redundant;
- every target names one primary scalar renderer input; a renderer input may be
  visual today or non-visual in the later predicate milestone;
- `secondaryInput`, when present, is the other endpoint of the same ranged
  datum and uses the declared hit-test mode. The renderer default is
  `intersects`; the Core adapter must nevertheless materialize
  `mark.defaultHitTestMode`, including the link mark's `endpoints` override,
  rather than relying on the low-level default;
- all primary targets are evaluated with AND;
- `empty` remains a property of each conditional predicate call, so the same
  logical selection may be used by conditions with different empty behavior;
  and
- every occurrence of a selection name in one mark must declare the same type
  and target descriptors.

Core's `encodings: ["x", "y"]` therefore becomes one interval selection with
two renderer targets. It must not become independent `brush_x` and `brush_y`
resources. Splitting it would duplicate semantic state, make empty handling
ambiguous, require another predicate-composition layer, and allow one axis to
be observed between separate updates. The renderer target list must support an
arbitrary fixed number of scalar inputs even though Core emits only x and y in
this milestone. Small fixed target sets should use generated uniform fields so
they retain the existing bind group; do not encode two as an API or resource
limit.

The matching public interval slot should expose its target names and accept the
complete interval state in one call, conceptually:

```ts
{
    type: "interval";
    /** Stable immutable declaration order. */
    targets: readonly string[];
    set(
        intervals: Readonly<
            Partial<Record<string, readonly [number, number] | null>>
        >
    ): void;
}
```

`set()` is a complete replacement, not a patch. Every declared target omitted
from the object is inactive, exactly like a target whose value is `null`.
Unknown keys throw rather than being ignored. The exposed `targets` array keeps
the target declaration order and cannot change during the mark lifetime. The
implementation validates the whole update, stages every target's activity and
bounds, and only then performs one uniform-buffer upload and one picking
invalidation. A rejected update leaves the previous selection state intact.

The renderer API is unpublished, so replace the old `channel` and
`set(min, max)` forms rather than retaining a compatibility shim. Compatibility
is required at the Core grammar level: an x-only selection becomes one target
and a y-only selection becomes one target through exactly the same new path.

#### Empty and reversed bounds

`null` or a missing interval is the Core representation of an inactive target.
The adapter/surface must preserve that state explicitly. The renderer should
pack fixed-layout activity state alongside one independently typed vec2 bounds
uniform per target. A bit mask is acceptable only with an explicit capacity
contract that is not tied to x/y; per-target flags avoid that artificial limit.
The renderer must not infer activity from bound ordering.

For each target, WGSL should behave as follows:

1. If the active bit is clear, that target contributes `allowEmpty` to the AND.
2. If it is active, normalize the two supplied bounds with `min`/`max` and run
   the scalar or ranged-datum hit test.
3. AND every target result.

This makes a wholly empty selection pass only predicates whose `empty` option
allows it, supports a partially populated selection without discarding active
dimensions, and preserves the renderer's useful tolerance for reversed
non-null bounds. Normal pointer brushing remains canonicalized by Core before
the renderer sees it. The explicit activity flag fixes the current impossible
empty check without overloading `[1, 0]`.

For partial selections, use Core's CPU expression semantics as the canonical
contract: each inactive target contributes `allowEmpty`, then all targets are
ANDed. WebGL's reversed-sentinel expression treats any inactive target as an
empty whole selection when `empty: true`; normal brush interaction does not
expose that difference because it updates or clears all configured targets
together. Do not reproduce that sentinel artifact in the new renderer API.

#### Ranged-datum hit testing

Hit testing first normalizes an active selection pair to
`sLo = min(s0, s1)` and `sHi = max(s0, s1)`. A scalar datum matches when
`sLo <= value && value <= sHi`.

When a target declares `secondaryInput`, read endpoints `d0` and `d1` and
normalize them to `dLo = min(d0, d1)` and `dHi = max(d0, d1)`. Evaluate the
declared mode exactly as follows:

```text
intersects = dHi >= sLo && dLo <= sHi
encloses   = sLo <= dLo && dHi <= sHi
endpoints  = (sLo <= d0 && d0 <= sHi) ||
             (sLo <= d1 && d1 <= sHi)
```

Thus all three modes are insensitive to endpoint order, while `endpoints`
still differs from `intersects` when the selection lies strictly inside a long
ranged datum. Supplying `hitTest` without `secondaryInput` is invalid. The
renderer normalizes an omitted ranged-datum mode to `intersects`; Core always
supplies the mark's resolved default so WebGPU matches WebGL, including link
marks whose default is `endpoints`.

#### Ownership by layer

| Layer               | Responsibility                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core                | Own selection parameter creation, configured x/y encodings, `null` empty state, interaction updates, canonical pointer-derived bounds, parameter propagation, CPU selection expressions, AND filtering, and render/dataflow scheduling. Core grammar and transform semantics do not move into the renderer.                          |
| Core WebGPU adapter | Translate one Core interval predicate into generic fixed target descriptors; map x/y to renderer scalar inputs; include a secondary endpoint only when the mark has one; carry `mark.defaultHitTestMode`; preserve `predicate.empty`; and report contextual unsupported Core capabilities such as non-scalar high-precision targets. |
| Core WebGPU surface | Read the latest Core parameter value, compare and cache every target's activity and bounds, and update the one renderer slot atomically only when state changes. It must not rediscover the target set by scanning arbitrary conditional channel branches.                                                                           |
| `webgpu-renderer`   | Validate target consistency and scalar input shapes; derive each target's scalar type; allocate activity and typed bounds fields; expose the atomic slot; update the uniform buffer; generate target-level WGSL and AND composition; reuse the same resources for normal and picking pipelines; and own all GPU resource lifetimes.  |

The renderer should remain generic: it receives scalar input names, endpoint
names, and hit-test modes, but no Core `Selection`, encoding, view, or
parameter-runtime types. The initial implementation may resolve those inputs
through existing renderer channels, but its public predicate terminology and
internal target model must not require that every scalar input be a visual mark
output.

#### Performance and resource lifetime

The target descriptors and uniform layout are pipeline shape and are created
once. Runtime brush updates change only the activity state and bounds values in
the existing per-mark uniform buffer. `SelectionResourceManager` should update
all fields first and `BaseProgram` should perform one uniform-buffer upload per
logical selection update. Interval updates return no rebind requirement because
they never replace a bound GPU resource.

The Core surface should keep a fixed cached snapshot for each retained
selection and reuse it for comparisons rather than allocating maps or typed
arrays on every render. A changed brush must not call `createMark`, replace
series, rebuild a pipeline or bind-group layout, or create a bind group. Only a
static change to the selection type or target descriptors may recreate the
mark. The existing multi-point selection buffer growth behavior remains
unchanged.

“An arbitrary fixed number” means that the public contract has no x/y-specific
or two-target cap; it does not promise infinite uniform capacity. After the
complete per-mark uniform layout is assembled and before creating a GPU buffer
or pipeline, the renderer must compare its required byte length with
`device.limits.maxUniformBufferBindingSize`. An overflow fails mark creation
with a contextual error containing the selection name, target count, required
bytes, and device limit. If activity is packed into a bit mask, validate its
declared bit capacity as well. Do not silently truncate targets, split one
logical selection across separately updated resources, or introduce an
arbitrary public maximum. A future measured need beyond uniform capacity would
justify a separate storage-buffer design.

### Typed predicates separate state, tests, and rendering effects

After the penguins fix is complete, add the smallest renderer-owned predicate
abstraction needed for score-based semantic zoom. Do not compile semantic zoom
into a synthetic interval selection: a selection is interactive named state,
whereas semantic zoom is a Core visibility policy driven by a derived dynamic
threshold. The visibility predicate may read both kinds of retained state
without pretending that they are the same concept.

The initial contract should separate three concepts:

1. **Scalar operands:** a predicate may read a typed per-instance scalar input
   or a retained dynamic scalar slot. An input may also feed a visual channel,
   but non-visual inputs such as a score must not require a scale or visual
   output.
2. **An immutable predicate tree:** leaves are an ordered scalar comparison
   (`<`, `<=`, `>`, or `>=`) or a call to an existing selection test with an
   explicit empty policy. Interior nodes are only `all` and `any`. The tree and
   operand types are fixed at mark creation; input buffers, threshold slots,
   and selection resources retain their existing independent update paths.
3. **One initial consumer:** optional point-instance `visibleWhen`. It must cull
   before expensive point geometry and fragment work and run identically in
   normal and picking pipelines.

Represent predicates as inline immutable trees, not named definitions or a
reference graph. Recursively validate and emit each small tree. Share the input
series, dynamic slots, and selection resources it reads, but do not add
predicate references, cycle detection, or subexpression deduplication. Existing
selection-driven conditional encodings continue to use the selection checker
introduced by the penguins milestones. The new selection leaf must call that
same checker rather than reimplementing single-, multi-, or interval-selection
semantics. Predicate-driven conditional encodings and visibility for other mark
programs can be added later when a real consumer justifies them.

Generic visibility is deliberately different from Core's `filter` transform.
It controls whether an instance is rendered and pickable; it does not remove
rows from collectors, recompute aggregates, or alter scale domains. Specs that
need linked aggregation continue to use CPU dataflow filters even when the same
parameter also drives a GPU predicate.

For score-based semantic zoom, preserve the current WebGL ownership split and
lower `selected || semanticScore >= threshold` as follows:

- `packages/core/src/marks/point.js` continues to sample and sort scores and to
  compute the zoom-dependent quantile threshold from `semanticZoomFraction`;
- the Core WebGPU adapter supplies each datum's raw score as one non-visual
  `f32` input and declares one retained `f32` threshold slot initialized from
  `mark.getSemanticThreshold()`;
- when the mark has `uniqueId`, for every selection resource that WebGL would
  include in `isPointSelected()`, Core adds one selection leaf with
  `empty: false`. If several selections apply, their leaves are alternatives in
  the same `any`; without `uniqueId`, Core adds no selection-bypass leaves;
- Core adds the ordered-comparison leaf `scoreInput >= thresholdSlot` and emits
  one flat visibility tree conceptually equivalent to
  `any(selectionLeaf1, selectionLeaf2, ..., compare(scoreInput, ">=", thresholdSlot))`.
  If no relevant selection exists, `visibleWhen` is just the comparison leaf;
- the renderer resolves the leaves to the already-retained selection resources,
  score series, and threshold uniform and emits a small WGSL helper equivalent
  to `checkSelectionA(false) || checkSelectionB(false) || score >= threshold`;
  and
- both normal and picking point vertex paths call the helper before computing
  point geometry. A false result writes the established valid culled/offscreen
  point output and returns, so the datum produces neither visible fragments nor
  a pick ID.

For one relevant selection, the retained renderer configuration is
conceptually:

```ts
{
    visibleWhen: {
        any: [
            { selection: "brush", empty: false },
            {
                compare: ">=",
                left: { input: "semanticScoreInput" },
                right: { slot: "semanticThreshold" },
            },
        ],
    },
}
```

The public field names may follow renderer conventions; the tree shape and
resource ownership are the contract. `selected` is not uploaded as a new
per-datum Boolean mask. It is evaluated from the existing selection resource
against the current datum, while the other branch reads the score series and
one threshold uniform.

A brush update changes only its selection resource, and a zoom update changes
only the threshold uniform. The score series changes only when mark data
changes. None of those updates changes the predicate tree, WGSL, pipeline,
bind-group layout, or bind group. `empty: false` is essential: an empty
selection contributes false and therefore cannot make every below-threshold
point visible. With no `semanticScore` input, Core omits `visibleWhen` and the
renderer follows its normal all-instances-visible path.

The renderer must not expose `semanticScore`, `semanticZoomFraction`, GenomeSpy
zoom levels, quantile sampling, or Core selection types in its public API. A
future continuous-legend brush can reuse a non-visual scalar input and the
existing interval-selection leaf; legend interaction, scale inversion,
parameter creation, and Core grammar expansion are outside these milestones.

### Picking scope

The low-level pick texture and pipeline are connected to Core’s existing
non-faceted hover and tooltip flow. Core still owns
`Collector.findDatumByUniqueId`, `Mark.isPickingParticipant`, view-coordinate
checks, custom tooltip handlers, and click/hover state; the renderer only
renders and reads the pick texture. Facet-scoped picking remains part of the
postponed facet milestone.

## Current remaining milestones

### 1. Generalize the renderer interval-selection contract and WGSL

**Status: complete.** Implemented in `07b4321f2`. Renderer unit, type, lint,
and WebGPU GPU suites pass.

**Intended outcome:** `@genome-spy/webgpu-renderer` represents x-only, y-only,
and x+y intervals through one public contract, one logical slot, and a stable
uniform layout. Its generated predicate handles explicit empty state, reversed
non-null bounds, per-target ranged data, and AND composition. The target list
is generic over N fixed scalar inputs even though Core initially supplies only
x and y.

**Affected areas and downstream consumers:**

- `packages/webgpu-renderer/src/index.d.ts`: replace the single `channel`
  predicate and `set(min, max)` slot with discriminated scalar-input target and
  atomic update types. Use input terminology that permits later non-visual
  inputs. Specify stable exposed target order, unique primary names,
  complete-replacement updates, missing/`null` inactive values, and rejection
  of unknown update keys. Keep single and multi selection variants unchanged.
- `packages/webgpu-renderer/src/marks/programs/internal/channelConfigResolver.js`:
  replace validation of the required singular `when.channel` with validation
  and normalization of a nonempty target array. Reject duplicate primary input
  names, unknown or non-scalar primary/secondary inputs, invalid hit-test
  modes, a hit-test mode without a secondary input, and the obsolete singular
  form before resource construction. Normalize an omitted ranged mode to
  `intersects` so descriptor-consistency checks compare canonical forms.
- `packages/webgpu-renderer/src/marks/programs/internal/selectionResources.js`:
  collect and validate a target list per selection name, derive scalar types
  independently, allocate per-target bounds plus scalable activity state,
  initialize inactive state, reject inconsistent duplicate declarations, and
  stage complete atomic updates without allocating a storage buffer or
  requesting a rebind.
- `packages/webgpu-renderer/src/marks/programs/internal/baseProgram.js`: expose
  the new interval slot and ensure one call updates all selection uniforms,
  uploads the uniform buffer once, and marks picking dirty once. Validate the
  completed uniform byte length against
  `device.limits.maxUniformBufferBindingSize` before GPU resource or pipeline
  creation and report contextual interval-capacity errors.
- `packages/webgpu-renderer/src/marks/programs/internal/pipelineBuilder.js` and
  `packages/webgpu-renderer/src/marks/shaders/markShaderBuilder.js`: carry the
  target descriptors to both normal and picking pipeline generation, emit one
  test per target, reuse the secondary-endpoint range test inside a target,
  default omitted ranged hit testing to `intersects`, implement the documented
  order-independent formulas for `intersects`, `encloses`, and `endpoints`, and
  AND the target results.
- `packages/webgpu-renderer/src/marks/programs/internal/bindGroupBuilder.js`
  should require no behavioral change; verify that interval state stays in the
  existing uniform binding and document that result in tests/review.

**Verification:**

- Exercise `channelConfigResolver.js` through
  `baseProgram.validation.test.js`: accept target arrays and reject an empty
  array, duplicate primary names, unknown/non-scalar primary or secondary
  inputs, invalid hit-test modes, a hit-test mode without a secondary input,
  and the obsolete singular `channel` form. Assert omitted ranged hit testing
  normalizes to `intersects`.
- Expand `selectionResources.test.js` to cover one x target, one y target, two
  targets with independently derived scalar types, a synthetic third scalar
  input proving the contract is not capped at two, duplicate-use consistency,
  inactive initialization, a complete update with every key, missing and
  explicit-null inactive targets, unknown-key rejection without partial state
  mutation, atomic updates, and a false `needsRebind` result for interval
  updates.
- Expand `markShaderBuilder.test.js` with representative WGSL assertions for
  explicit activity checks, x+y AND composition, and a secondary endpoint
  nested within one target rather than treated as a third dimension.
- Expand `tests/mark-shader-builder.gpu.test.js` with small truth tables for:
  x-only; y-only; x+y where x-only, y-only, both, and neither match; wholly and
  partially empty states with `empty: true` and `empty: false`; reversed active
  bounds; default `intersects`; all three ranged-data formulas; both datum
  endpoint orders; and an interval lying strictly inside a ranged datum to
  distinguish `intersects` from `endpoints`.
- Extend `baseProgram.slots.test.js` to assert stable exposed target order,
  complete-replacement rather than patch semantics, unknown-key failure, and
  one upload plus one picking invalidation per accepted call. Spy on device and
  renderer operations to prove repeated interval updates do not recreate a
  pipeline, bind-group layout, bind group, mark, or series buffer.
- Add a focused `BaseProgram` capacity test with a mocked small
  `maxUniformBufferBindingSize`: accept a layout at the limit and reject an
  oversized target list before buffer/pipeline creation, with the selection
  name, target count, required bytes, and device limit in the error.
- Run the renderer Vitest, type, lint, and WebGPU GPU suites after the public
  contract is coherent.

**Documentation and migration:** update the selections section and examples in
`packages/webgpu-renderer/README.md`, revise the stale selection-gap notes in
`packages/webgpu-renderer/MIGRATION_PLAN.md`, and remove old single-channel API
wording rather than documenting both forms. No Core user-facing grammar docs
change in this milestone.

**Review gate:** review the resolver boundary, public predicate/slot types,
complete-replacement and failure semantics, uniform layout and device-capacity
validation, empty semantics, N-target extensibility, exact hit-test formulas
and defaults, and update lifetime before adapting Core. The review must include
both normal and picking pipeline consumers and confirm that the API does not
require targets to be visual outputs.

Tentative commit: `feat(webgpu): support multi-channel interval selections`

### 2. Adapt Core WebGPU selection translation and retained updates

**Status: complete.** Implemented in `8ecd12bc0`; final verification and the
pick-readback serialization follow-up are included in the completion commit.
Core selection/filter and WebGPU adapter/surface suites pass. The penguins
example passes forward and reverse brushing plus clear/restore at DPR 1 and 2
under WebGPU, with no page or console errors; WebGL comparison is also
error-free.

**Intended outcome:** the penguins specification initializes and brushes under
WebGPU. Its point color condition is evaluated on the GPU with x AND y, while
the existing CPU filter repropagates the same selection to both linked bar
charts. Single-channel selections retain their behavior and literal
conditional branches no longer fail during retained-series collection.

**Affected areas and downstream consumers:**

- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`: remove the
  one-channel rejection; translate every interval key to one generic scalar
  input target; attach a secondary endpoint only when the Core encoding has it;
  carry `mark.defaultHitTestMode`; and preserve branch order and `empty`.
- `packages/core/src/rendering/webgpu/webGpuSurface.js`: update selections from
  the target list exposed by the renderer slot, preserve `null` as inactive,
  cache all target values without per-frame container churn, and call the slot
  once per changed logical selection. Remove `findIntervalSelectionChannel`
  and skip absent `condition.channel` entries when collecting literal
  conditional series.
- `packages/core/src/selection/selection.js` and
  `packages/core/src/data/transforms/filter.test.js`: no production filtering
  change is expected. Add focused coverage that records the existing x+y AND,
  empty, and linked-filter semantics so GPU integration cannot accidentally
  redefine them.
- The interval controller, parameter runtime, selection overlay, render
  coordinator, interaction controller, and tooltip handler should not need
  production changes. Treat any required change there as evidence that the
  adapter/renderer contract is still incomplete and return to the milestone 1
  review gate.

**Verification:**

- Expand `webGpuMarkAdapter.test.js` with x-only, y-only, and x+y translation;
  ordered targets; `empty` propagation; mixed conditional value/series
  branches; secondary endpoint plus hit-test mode; and the retained contextual
  rejection for unsupported two-component target inputs.
- Expand `webGpuSurface.test.js` with active, wholly empty, and partially empty
  interval updates; unchanged-state suppression; x+y atomic slot calls;
  literal conditional values; and assertions that `createMark`,
  `series.replace`, and unrelated value/scale slots are untouched during brush
  updates.
- Add Core selection/filter tests using data where some rows match only x,
  only y, both, or neither. Assert AND behavior, `empty: true` pass-through,
  `empty: false` rejection, and repropagation after the parameter changes.
- Exercise the existing x-only interval example under WebGPU, plus a focused
  y-only spec, to protect single-channel compatibility and clear behavior.
- Run the real
  `examples/docs/grammar/parameters/penguins.json?renderer=webgpu` interaction:
  drag in both directions, confirm only points inside both dimensions use the
  conditional color, confirm both bar charts update and restore on clear,
  hover selected and unselected points to verify tooltip/picking continuity,
  and require no page or console errors. Compare against WebGL at DPR 1 and 2.
- Verify that conditional position or size under an interval uses the same
  updated selection in the pick pass; conditional color alone must not change
  IDs or tooltip datum resolution.
- Run focused Core WebGPU and selection/dataflow suites during iteration, then
  Core type checks and lint before integration verification.

**Documentation and migration:** no Core grammar migration or docs page is
needed because x+y interval selection is existing supported syntax. Record the
completed parity capability in this temporary plan and the renderer migration
notes; do not add a duplicate permanent Core API description.

**Review gate:** review the adapter and surface together with CPU filter,
picking, and tooltip consumers. Confirm with instrumentation or spies that a
brush update reuses the retained mark and bind group.

Tentative commit: `fix(core): support multi-channel WebGPU interval selections`

### 3. Add scalar visibility predicates for point marks

**Intended outcome:** `@genome-spy/webgpu-renderer` exposes a generic,
statically compiled visibility predicate tree over visual or non-visual scalar
inputs, dynamic scalar slots, and existing selection tests. Point marks use it
to cull instances from both visible and picking passes. Core uses this
abstraction to match WebGL score-based semantic zoom—including the
selected-point bypass—while the renderer remains unaware of `semanticScore`,
zoom levels, quantiles, and GenomeSpy selection grammar. The first version is
an immutable tree, not a named predicate graph or general expression language.

**Affected areas and downstream consumers:**

- `packages/webgpu-renderer/src/index.d.ts`: add public non-visual scalar-input,
  dynamic scalar-slot, selection-test leaf, ordered-comparison leaf,
  `all`/`any`, and point `visibleWhen` contracts. Do not add named predicate
  definitions or references, equality, `not`, arbitrary range expressions, or
  caller-supplied WGSL. Predicate topology is immutable for a retained mark;
  only declared inputs, slots, and selection state receive updates.
- `packages/webgpu-renderer/src/marks/programs/internal/channelConfigResolver.js`,
  `seriesBuffers.js`, and `packedSeriesLayout.js`, plus
  `packages/webgpu-renderer/src/marks/shaders/channelAnalysis.js` and
  `channelIR.js`: admit non-visual scalar inputs, validate their component and
  scalar types, reuse their series buffers when the same input is already
  visual, and expose raw values to predicate codegen without requiring a scale
  or visual output channel. Do not introduce a second series-upload path.
- Add one focused renderer-owned predicate validator/emitter under
  `packages/webgpu-renderer/src/marks/shaders/`. It should recursively walk the
  small inline tree, validate scalar operand types and non-empty `all`/`any`
  nodes, register the existing resources encountered by its leaves, and emit
  one visibility helper. It should not assign predicate identities, build a
  dependency graph, detect cycles, or deduplicate predicate subexpressions.
- `packages/webgpu-renderer/src/marks/programs/internal/selectionResources.js`:
  retain ownership of selection state and expose the existing generated
  selection checker to visibility leaves. Resource discovery must include
  selections referenced only by `visibleWhen`, while the leaf uses
  `empty: false` for semantic-zoom bypass. Do not create a second selection evaluator
  or migrate working conditional encodings merely to use the new tree.
- `packages/webgpu-renderer/src/marks/programs/internal/baseProgram.js` and
  `pipelineBuilder.js`: create retained dynamic scalar slots, collect the
  predicate's existing input/selection resources, pass the immutable tree to
  normal and picking point pipeline generation, and update slot values without
  rebuilding pipelines or bind groups.
- `packages/webgpu-renderer/src/marks/shaders/markShaderBuilder.js` and
  `packages/webgpu-renderer/src/marks/programs/pointProgram.js`: expose
  `isInstanceVisible(i)` and invoke it before expensive point geometry. When
  `visibleWhen` is absent, emit the trivial true path. On false, produce a
  valid zero-size/offscreen point result and return. Do not design a custom-mark
  visibility hook or modify every built-in program in this milestone; extend
  the same predicate tree to another program only with its first real consumer.
- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js`: when a point mark
  has a data-driven `semanticScore`, provide its raw numeric series as a
  non-visual renderer input, expose `mark.getSemanticThreshold()` as a retained
  dynamic scalar slot, collect exactly the selection resources used by WebGL's
  `isPointSelected()` when `uniqueId` is available, and build a flat
  `any(relevantSelectionLeaves, score >= threshold)` for `visibleWhen`. Omit the
  selection alternatives when none apply. Do not move score sampling, quantile
  calculation, zoom policy, or grammar interpretation out of Core.
- `packages/core/src/rendering/webgpu/webGpuSurface.js`: update the semantic
  threshold operand through the existing retained dynamic-value pattern and
  suppress unchanged writes. Normal zoom/render scheduling already supplies
  the latest threshold and should not need a new renderer lifecycle.
- `packages/core/src/marks/point.js`, `point.vertex.glsl`, and
  `packages/core/src/rendering/immediate/marks/point.js` remain behavioral
  references. Production changes there are not expected; if the new renderer
  abstraction cannot represent their score threshold and selection-bypass
  semantics, revise the renderer contract rather than weakening parity.

**Verification:**

- Add renderer unit tests for unknown or non-scalar inputs, ordered-comparison
  operand type mismatches, empty Boolean nodes, nested `all`/`any`, selection
  leaves with explicit empty policy, and rejection of unsupported predicate
  shapes. There are no predicate references or cycles to test.
- Add slot/resource tests proving dynamic comparison thresholds update one
  uniform buffer, dirty picking, and do not recreate a mark, pipeline,
  bind-group layout, bind group, or series buffer.
- Add focused GPU truth tables for `<`, `<=`, `>`, `>=`, `all`, and `any`; a
  non-visual input used only by point `visibleWhen`; and the exact
  `any(selectionWithEmptyFalse, score >= threshold)` tree. Assert hidden points
  produce neither visible fragments nor pick IDs, an empty selection does not
  bypass the threshold, and reversed active interval bounds still follow the
  selection checker.
- Re-run the existing single-, multi-, and interval-selection conditional
  tests because visibility shares their selection resources. The penguins x+y
  behavior, empty policy, secondary endpoints, and update performance must
  remain unchanged; no conditional-encoding migration is required.
- Expand `webGpuMarkAdapter.test.js` and `webGpuSurface.test.js` to cover
  semantic-score series translation, absence of score input when the channel is
  not configured, threshold changes across zoom levels, unchanged-threshold
  suppression, one and several selection-bypass leaves, and suppression of the
  bypass when `uniqueId` is unavailable.
- Run `examples/core/techniques/semantic_zoom.json` and
  `examples/docs/grammar/mark/point/semantic-zoom.json` under WebGL and WebGPU
  at representative zoom levels. Compare visible population trends, verify
  below-threshold selected points remain visible, verify hidden points cannot
  be picked or shown in tooltips, and require no console/page errors at DPR 1
  and 2.
- Verify Canvas2D/SVG behavior remains unchanged. The renderer visibility tree
  is a WebGPU implementation contract; it must not silently redefine Core's
  backend-neutral semantic zoom or dataflow filtering behavior.

**Documentation and migration:** document non-visual scalar inputs, immutable
visibility trees, dynamic scalar slots, point visibility, picking behavior, and
the distinction between GPU visibility and data filtering in
`packages/webgpu-renderer/README.md`. Reconcile the selection and dynamic
property gaps in `packages/webgpu-renderer/MIGRATION_PLAN.md`. Core's existing
semantic zoom docs need no grammar rewrite; update them only if WebGPU renderer
support is explicitly documented by backend.

**Review gate:** review the immutable tree and point visibility path as a
public, performance-critical renderer contract. The review must inspect
selection resource ownership, normal and picking point pipelines, retained
updates, Core semantic zoom translation, and non-WebGPU backends. Reject named
predicate graphs, speculative operators or consumers, arbitrary WGSL injection,
Core-specific predicate types, per-update predicate recompilation, and
opacity-only pseudo-filtering.

Tentative commit: `feat(webgpu): add point visibility predicates`

### 4. Faceted and sample-faceted rendering — postponed

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
- Core interval encodings and ranged hit-test semantics have a renderer target
  representation;
- Core semantic visibility policy can be expressed through generic scalar
  inputs, an immutable visibility tree, and dynamic slots without leaking Core
  property names;
- categorical values have a Core-owned integer mapping;
- an unsupported Core scale is reported contextually; and
- raw values can be represented by the renderer’s declared typed array.

The adapter must not independently duplicate validation for channel/input
component counts, visibility-tree structure, scale resource layout, selection or
operand slot validity, bind-group limits, or WGSL/pipeline constraints. Those
belong in `packages/webgpu-renderer`. Any new adapter check needs a test
explaining why the generic renderer cannot perform it.

## Alternatives considered

- **One renderer selection per interval channel:** rejected because it loses the
  one-parameter identity, requires a new composed-predicate abstraction,
  duplicates empty policy, and makes updates non-atomic.
- **Pack x and y into one vec4 sentinel uniform:** rejected because targets may
  have different scalar types and a reversed-pair sentinel cannot distinguish
  empty state from a valid reversed input.
- **Store interval dimensions in a storage buffer:** rejected for the expected
  small, fixed target lists. Generated uniform fields preserve independent
  scalar types and the existing binding; a storage buffer adds a binding and
  possible bind-group churn without improving ordinary x/y/color/size-like
  predicate updates. Fail contextually when the completed uniform layout
  exceeds the actual device limit; revisit storage only if a measured real use
  case needs more targets.
- **Keep `channel` and add an optional second channel:** rejected because it
  bakes a two-axis special case into a generic renderer contract and does not
  extend cleanly to per-target secondary endpoints or hit-test modes.
- **Evaluate the x+y predicate in Core and upload a per-datum mask:** rejected
  because every brush move would rebuild/upload an O(n) series, while a few
  uniform values allow the existing shader to evaluate the predicate in O(1)
  update work.
- **Represent semantic zoom as a synthetic interval selection:** rejected
  because it conflates interactive named state with a derived visibility
  policy, imports selection empty semantics into a one-sided threshold, and
  still needs Boolean composition for selected-point bypass.
- **Compile semantic visibility into zero size or opacity:** rejected because
  those are mark-specific visual encodings, may still execute expensive
  geometry/fragment work, and do not reliably remove hidden instances from the
  picking pass.
- **Accept arbitrary WGSL predicates:** rejected because it prevents structural
  validation, safe resource planning, deterministic caching, and equivalent
  normal/picking behavior. A small immutable tree covers the required ordered
  comparisons and Boolean composition without becoming another expression
  language.
- **Introduce named predicate definitions and references:** rejected for the
  first implementation because the concrete trees are small. Inline trees
  eliminate identity, reference, cycle, and subexpression-caching machinery;
  their input, slot, and selection resources are still shared normally.
- **Generalize all conditional encodings and mark programs immediately:**
  rejected because semantic zoom needs one new point-visibility consumer.
  Existing selection conditions already work, and later consumers can reuse
  the tree when they provide a concrete requirement and a valid mark-specific
  early-cull result.

## Risks and unresolved questions

- Uniform field names must not collide when selection and input names contain
  similar text. Prefer stable target indices in internal uniform names while
  retaining original names for diagnostics and public slots.
- Mixed `f32`, `u32`, and `i32` target bounds must obey `UniformBuffer` packing
  and WGSL alignment independently; do not coerce the whole selection to the
  first target's type.
- The logical N-target contract is bounded physically by the complete mark
  uniform layout. Validate the calculated byte length against the device limit
  before GPU creation; do not let a low-level WebGPU validation error obscure
  which selection and target count exceeded capacity.
- Partially populated interval selections are uncommon in pointer interaction
  but valid in the runtime shape. The active-mask truth tables are required so
  their behavior is deliberate rather than an accident of a sentinel.
- The renderer's reversed-bound tolerance is safe only because activity is
  explicit. Core pointer interaction continues to provide ordered bounds; this
  milestone does not redefine arbitrary hand-authored raw selection objects.
- A selection can guard several conditional channels in one mark. Target
  descriptor disagreement must fail during mark creation rather than selecting
  whichever condition is visited first.
- Frequent brush updates also repropagate CPU transform filters when a spec uses
  them. That dataflow cost is expected and separate from GPU resource churn;
  the renderer must still keep its update cost to uniform state.
- Two-component large index/locus interval predicates remain unresolved outside
  this project. Keep the scalar validation and contextual Core error so the new
  target-array API does not imply support.
- Predicate inputs must preserve typed-array sharing and retained series
  replacement rules. Treating a non-visual input as a separate upload path
  would waste memory and create another aliasing contract.
- Point visibility needs a valid culled vertex result that avoids the known
  cost of leaving discarded vertices at an expensive on-screen position. Keep
  the first hook point-specific; do not claim a cross-mark contract until
  another mark establishes its required output.
- Selection-backed predicates used only by `visibleWhen` must still allocate
  and update their selection resources. Resource collection cannot continue to
  inspect conditional channels alone.
- The selected-point semantic zoom bypass must name only the relevant
  selection predicates and force `empty: false`; an empty selection must not
  make every below-threshold point visible.
- Predicate topology changes are pipeline changes. Dynamic operands must be
  declared up front so zoom and brush updates cannot accidentally trigger WGSL
  regeneration.

There are no blocking design questions for scalar x/y interval parity. Before
milestone 3 implementation, settle the exact public naming for scalar inputs
and dynamic slots during its review gate; there are intentionally no predicate
references or custom-mark visibility hook to settle. Those choices do not block
milestones 1 and 2. Any proposal to expand this plan to high-precision interval
inputs, a public Core predicate grammar, or faceted selection scope requires a
separate decision.

## Verification strategy

Use the narrowest relevant suite during each milestone:

- `npx vitest run packages/core/src/rendering/webgpu/<test>.test.js --reporter=agent`
- `npx vitest run packages/core/src/selection/selection.test.js packages/core/src/data/transforms/filter.test.js --reporter=agent`
- `npx vitest run --root packages/webgpu-renderer --reporter=agent`
- `npm -w @genome-spy/core run test:tsc --if-present`
- `npm -w @genome-spy/webgpu-renderer run test:tsc --if-present`

The representative test matrix is:

| Scenario               | Renderer unit/GPU                                        | Core adapter/surface                                        | CPU/filter                         | Browser integration                              |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------- | ------------------------------------------------ |
| x-only interval        | Required                                                 | Required                                                    | Representative                     | Existing interval example                        |
| y-only interval        | Required                                                 | Required                                                    | Representative                     | Focused y-only spec                              |
| x+y interval           | AND truth table                                          | Ordered two-target translation and atomic update            | AND rows and repropagation         | Penguins brush                                   |
| wholly/partially empty | Both `empty` policies and activity state                 | `null`/missing mapping and unchanged suppression            | Both `empty` policies              | Clear and restore                                |
| reversed active bounds | Normalize after activity test                            | Preserve explicit active state                              | Core pointer bounds remain ordered | Reverse-direction drag                           |
| conditional encodings  | Literal and series branches                              | Branch order, literal-series collection, no mark recreation | Not applicable                     | Point color plus conditional pick-geometry smoke |
| filtered linked views  | Not applicable                                           | Latest selection visible in the same render cycle           | Parameter-driven repropagation     | Both penguins bar charts                         |
| N scalar inputs        | Three-input AND proof and device-capacity boundary       | Core intentionally emits x/y only                           | Not applicable                     | Not required for penguins                        |
| ranged datum           | Default and three modes with either endpoint order       | Core passes each mark's resolved default                    | WebGL formulas are reference       | Link endpoint smoke                              |
| visibility predicates  | Ordered comparisons, `all`/`any`, invalid trees          | Non-visual input and dynamic slot retention                 | Not applicable                     | Point visibility GPU cases                       |
| semantic zoom          | `any(selection, score >= threshold)` and hidden pick IDs | Score series, threshold updates, selected bypass            | Existing Core logic is reference   | Both semantic-zoom examples across zoom levels   |

For browser work, use the GenomeSpy browser-debugging workflow and compare
WebGL and WebGPU at DPR 1 and DPR 2. Include console/page-error checks and
the interaction examples needed for picking and tooltips.

Final integration verification crosses all three active milestones and must run
after the renderer and Core changes are combined:

1. Run the focused renderer GPU truth tables and Core adapter/surface,
   selection, and filter suites.
2. Run both package type checks and lint the affected package trees.
3. Run the full renderer Vitest and GPU suites, then the relevant Core full
   unit suite if shared selection-expression logic changed.
4. Compare WebGL and WebGPU for the x-only example, focused y-only case, and
   penguins x+y brush at DPR 1 and 2, including clear, reverse-direction drag,
   linked bars, hover, tooltip datum, and console/page errors.
5. Compare WebGL and WebGPU semantic zoom at several zoom levels, including
   selected below-threshold points, hidden-point picking, and visible population
   trends at DPR 1 and 2.
6. Use spies or temporary development instrumentation to confirm that repeated
   brush moves do not recreate marks, pipelines, layouts, bind groups, or
   series buffers and that threshold changes do not recompile predicates or
   recreate retained resources. Remove temporary instrumentation before
   completion.

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
- Core x-only, y-only, and x+y interval predicates translate to one renderer
  selection resource with a fixed scalar-input target list; x+y is an AND
  across targets, and the renderer contract is not capped at two inputs.
- Interval target declarations are nonempty and use unique primary input names.
  The slot exposes their stable order; `set()` completely replaces the state,
  treats missing and `null` declared keys as inactive, rejects unknown keys,
  and leaves prior state untouched on a rejected update.
- Empty targets use explicit activity state, `empty: true` and `empty: false`
  match Core semantics, and reversed non-null renderer bounds remain active and
  are normalized independently of emptiness.
- Same-axis secondary channels remain ranged-datum endpoints within a target
  and honor the documented order-independent `intersects`, `encloses`, and
  `endpoints` formulas; they are not counted as additional interval dimensions.
  The renderer defaults to `intersects`, while Core explicitly passes each
  mark's resolved default, including link `endpoints`.
- The renderer validates the complete uniform layout against
  `device.limits.maxUniformBufferBindingSize` before buffer or pipeline
  creation and reports the responsible selection, target count, required
  bytes, and device limit instead of imposing a two-target or arbitrary public
  maximum.
- Conditional literal and series encodings match WebGL branch precedence and
  selection behavior for single- and multi-channel intervals.
- Updating an interval selection performs one logical slot update and uniform
  upload per affected retained mark without recreating marks, pipelines,
  layouts, bind groups, or series buffers.
- The penguins WebGPU example colors points selected by both axes and filters
  both linked bar charts from the same current parameter value; clear restores
  the expected empty behavior.
- The renderer accepts typed visual and non-visual scalar predicate inputs and
  validates immutable trees containing ordered comparisons, selection leaves,
  and `all`/`any`, without named references, speculative operators, arbitrary
  WGSL, or Core grammar types.
- Point `visibleWhen` removes a false instance from normal and picking passes
  before expensive geometry work. Other mark programs and predicate-driven
  conditional encodings remain outside this milestone.
- Visibility selection leaves call the same selection checker used by existing
  conditional encodings; they do not duplicate selection semantics or require
  a conditional-encoding migration.
- Core score-based semantic zoom supplies a non-visual score and retained
  threshold slot to the renderer visibility tree. WebGPU matches WebGL's
  zoom-dependent threshold behavior and evaluates a flat
  `any(relevant selections with empty false, score >= threshold)` tree. It keeps
  relevant selected points visible only under the same `uniqueId` precondition
  as WebGL.
- Semantic threshold updates write retained uniform state without rebuilding
  predicate WGSL, pipelines, bind groups, marks, or series buffers.
- GPU visibility does not change collectors, aggregates, scale domains, or
  linked dataflow; Core filter transforms retain those responsibilities.
- Two-component large index/locus channels remain explicitly unsupported as
  interval predicate targets even though those channels remain supported for
  ordinary rendering.
- Parameter/expression-driven dynamic properties update retained resources
  without unnecessary pipeline, bind-group, program, or buffer churn.
- WebGPU picking drives the existing Core hover and tooltip behavior for
  non-faceted views, including interval-conditioned geometry, asynchronous
  reads, and DPR conversion.
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
- `packages/core/src/selection/selection.js` and
  `packages/core/src/data/transforms/filter.js` for interval AND expressions,
  empty handling, and parameter-driven dataflow repropagation;
- `packages/core/src/view/gridView/intervalSelectionController.js` for
  multi-channel creation, canonical pointer bounds, clear, drag, and wheel
  updates;
- `packages/core/src/marks/mark.js` for WebGL's per-channel interval uniforms,
  AND checker, secondary-channel hit-test modes, retained expression updates,
  and picking participation;
- `packages/core/src/marks/point.js`, `point.vertex.glsl`, and
  `packages/core/src/rendering/immediate/marks/point.js` for semantic score
  sampling, zoom-dependent threshold calculation, early visibility, selection
  bypass, and non-WebGPU behavior;
- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js` and
  `webGpuSurface.js` for the current one-channel translation and retained slot
  synchronization that milestones 1 and 2 replace;
- `packages/webgpu-renderer/src/index.d.ts`,
  `src/marks/programs/internal/selectionResources.js`,
  `src/marks/programs/internal/baseProgram.js`, and
  `src/marks/shaders/markShaderBuilder.js` for the current public selection
  contract, resource layout, slot updates, and WGSL generation;
- `packages/webgpu-renderer/src/marks/programs/internal/channelConfigResolver.js`,
  `seriesBuffers.js`, and `packedSeriesLayout.js`, plus
  `src/marks/shaders/channelAnalysis.js` and `channelIR.js`, for extending the
  existing typed series pipeline to non-visual predicate inputs;
- `packages/webgpu-renderer/src/marks/programs/pointProgram.js` for the initial
  point-only visibility hook; and
- `packages/core/src/genomeSpy/renderCoordinator.js` and
  `interactionController.js` for the WebGL pick/tooltip flow.
