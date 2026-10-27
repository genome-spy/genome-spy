# Categorical projections for point selections

Status: implementation in progress; commit after each verified milestone.

Source: [issue #608](https://github.com/genome-spy/genome-spy/issues/608), read
2026-10-27. Repository baseline: `085674617` on `master`, with a clean working
tree before this plan. This is the first PR in
[#607](https://github.com/genome-spy/genome-spy/issues/607), followed by legend
binding in #609 and gradient brushing in #610. The milestones below belong to
one feature PR; renderer support, API, persistence, and documentation are part
of its completion boundary.

## Outcome and scope

An author can select an activation category by clicking a plotted cell and
highlight matching raw values across views, even when the fields or visual
scales differ. Ordinary point selections continue to select individual records.
Both modes use native predicates, Boolean composition, conditional appearance
and order, scoped capabilities, and App history/bookmarks.

The initial category mode has exactly one logical component: `color`, `fill`,
`stroke`, or `shape`. It requires an unconditional nominal/ordinal field input
with a discrete scale. Stored membership uses strings, booleans, and finite
numbers with type-sensitive equality. It survives source and domain changes,
including temporary absence of every selected value. Activity means nonempty
stored membership, independently of loaded matches.

WebGL, WebGPU, Canvas2D, and SVG are required. Category focus must update small
membership resources without enumerating matching records, rebuilding geometry,
or re-uploading the plotted dataset. Explicit filters retain their ordinary
dataflow/domain effects.

Out of scope:

- Legend bindings, legend gestures/feedback, and gradient interaction.
- Selection declarations using arbitrary fields, multiple components,
  quantitative/discretizing inputs, or expression/datum/conditional inputs.
- Public arbitrary-field predicate `project` targets or new filter composition
  syntax.
- A separate public projected-selection API, configurable sampling policies,
  generalized projection/controller frameworks, and matching-row query APIs.
- The broader scope redesign in
  [#599](https://github.com/genome-spy/genome-spy/issues/599), interval host/API
  refactoring assigned to #610, and the full work in #544/#517.

## Architectural fit and current implementation

The owning subsystem is Core's existing selection/parameter machinery. Views
provide explicit interaction sources and per-consumer input bindings; scales
provide stable input IDs; each renderer owns its membership resources. App
serializes semantic selection values through its existing provenance bridge.

The architecture references are [the repository map](../../ARCHITECTURE.md),
[Core reactivity](../../packages/core/docs/architecture/reactivity.md),
[views/dataflow](../../packages/core/docs/architecture/views-and-dataflow.md),
[rendering](../../packages/core/docs/architecture/rendering.md), and
[App state](../../packages/app/APP_ARCHITECTURE.md).

| Area                          | Current source and consequence                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Grammar and defaults          | [parameter.d.ts](../../packages/core/src/spec/parameter.d.ts), [channel.d.ts](../../packages/core/src/spec/channel.d.ts), [transform.d.ts](../../packages/core/src/spec/transform.d.ts), [paramUtils.js](../../packages/core/src/paramRuntime/paramUtils.js): point config has no projection; point initial values are unsupported; filters map positional channels only. Extend these contracts and their generated schemas.                    |
| Membership and activity       | [selection.js](../../packages/core/src/selection/selection.js), [selectionTypes.d.ts](../../packages/core/src/types/selectionTypes.d.ts): records use internal single/multi values. An unused `ProjectedSelection` type/guard exists but has no complete native implementation. Replace that scaffold rather than establishing its separate public kind.                                                                                         |
| Explicit writers and scopes   | [unitView.js](../../packages/core/src/view/unitView.js) installs local point handlers; [viewParamRuntime.js](../../packages/core/src/paramRuntime/viewParamRuntime.js) registers compatible declarations against the owning value slot. Extend their mode/component/cardinality checks and keep local participation.                                                                                                                             |
| Consumer predicates           | [selectionPredicateTree.js](../../packages/core/src/selection/selectionPredicateTree.js) already normalizes direct, named, logical, and flat-union tests, and resolves each interval occurrence to consumer inputs. Extend this path for categories; preserve interval semantics. [encoder.js](../../packages/core/src/encoder/encoder.js) and [order.js](../../packages/core/src/selection/order.js) consume it.                                |
| CPU filters and expressions   | [filter.js](../../packages/core/src/data/transforms/filter.js) uses `makeSelectionTestExpression` with the existing replay machinery. [expression.js](../../packages/core/src/utils/expression.js) registers expression functions; ordinary parameter arguments already bind reactively and lexically. Reuse those mechanisms.                                                                                                                   |
| Encoded identity              | [scaleInstanceManager.js](../../packages/core/src/scales/scaleInstanceManager.js) owns a persistent categorical indexer; [indexer.js](../../packages/core/src/utils/indexer.js) uses typed Map keys. Domain positions are separate from stable input IDs.                                                                                                                                                                                        |
| Channel normalization and IDs | [mark.js](../../packages/core/src/marks/mark.js), [markUtils.js](../../packages/core/src/marks/markUtils.js), and [point.js](../../packages/core/src/marks/point.js) normalize color into fill/stroke, retain resolution-channel metadata, and determine picking/record identity. Do not assume a `color` attribute survives normalization.                                                                                                      |
| WebGL                         | [webGlMark.js](../../packages/core/src/rendering/webgl/marks/webGlMark.js) resolves deduplicated attributes and emits selection predicates; [dataToVertices.js](../../packages/core/src/rendering/webgl/gl/dataToVertices.js) already shares compatible encoded fields; [webGLHelper.js](../../packages/core/src/rendering/webgl/gl/webGLHelper.js) owns textures. Extend retained membership using those inputs.                                |
| WebGPU                        | [webGpuMarkAdapter.js](../../packages/core/src/rendering/webgpu/webGpuMarkAdapter.js) translates predicates and categorical series; [webGpuSurface.js](../../packages/core/src/rendering/webgpu/webGpuSurface.js) updates retained slots. The renderer's [public contract](../../packages/webgpu-renderer/src/index.d.ts) currently has record/interval tests only. Add generic input-set membership there before adapting Core.                 |
| Immediate output              | [immediate point traversal](../../packages/core/src/rendering/immediate/marks/point.js) and host encoders serve Canvas2D/SVG. It currently applies score sampling without the GPU selection bypass; parity requires an explicit correction here.                                                                                                                                                                                                 |
| Public API                    | [embedParamApi.js](../../packages/core/src/paramRuntime/embedParamApi.js), [embedApi.d.ts](../../packages/core/src/types/embedApi.d.ts): scoped point capabilities currently assume row snapshots and key-based writes. Preserve their record behavior and add the membership discriminator.                                                                                                                                                     |
| App and agent                 | [paramProvenanceBridge.js](../../packages/app/src/state/paramProvenanceBridge.js) currently requires point keys; [paramProvenanceTypes.d.ts](../../packages/app/src/state/paramProvenanceTypes.d.ts), [state.d.ts](../../packages/app/src/state.d.ts), action labels/expansion, and [agent validation](../../packages/app-agent/src/agent/actionShapeValidator.js) assume that envelope. Update all of them, including generated action schemas. |

Inherited conditions continue to bind in the consuming unit's lexical scope.
Scale configuration retains its resolution-owner/singleton behavior documented
in #599. This feature must not use a common channel name as evidence of a shared
scale or reinterpret import/provenance addressing scopes as lexical scopes.

### Prior art and reuse

[Vega-Lite selections](https://vega.github.io/vega-lite/docs/selection.html)
provide the established `select.encodings` and click/Shift-toggle/clear model.
Adopt that authoring vocabulary while retaining GenomeSpy's explicit outer
writers and per-consumer channel binding. Predicate `project` remains a
GenomeSpy consumer-mapping extension, separate from selection projection.

Vega-Lite's [BSD-3-Clause license](https://github.com/vega/vega-lite/blob/main/LICENSE)
permits adaptation with its notices retained alongside GenomeSpy's MIT license.
This plan copies no upstream implementation. Any later copied/adapted code must
retain required notices and a durable source/provenance comment.

[PoC #605](https://github.com/genome-spy/genome-spy/pull/605) and its
[initial commit](https://github.com/genome-spy/genome-spy/commit/6263d500b0a6f4b917a162b09092d8be37bf75a6)
demonstrate useful typed-value normalization, membership updates, and persistence
tests. Rework those ideas against current contracts. Its field-based public
kind, extra per-row attributes, missing WebGPU support, and later array binding
do not meet #608. Do not cherry-pick the subsystem wholesale.

## Contract decisions

The helper signatures and direct sampling rule below are the implementation
decisions. Their contracts are recorded in the expression/parameter docs before
implementation; the same decisions are recorded in #608.

### Authoring, initialization, and validation

```json
{
  "name": "activation_states",
  "select": { "type": "point", "encodings": ["color"] },
  "value": [{ "color": "activated" }, { "color": "intermediate" }]
}
```

- Absence of `select.encodings` preserves record membership and existing record
  initialization. Category mode is opt-in; invalid projections never fall back
  to records.
- Use a discriminated specification union so each category initializer object
  has exactly the declared channel and a supported scalar. Generate the
  one-channel list constraint, allowed names, initializer shape, and accepted
  predicate mapping shapes from the types. `select.fields`, singular
  `select.encoding`, tuple initializers, and field-name initializer keys stay
  outside the schema. Do not add runtime alias blacklists or duplicate schema
  validation.
- Runtime resolution validates field/scale capability, referenced selections,
  compatible writers, and consumer input availability. Normalization also
  preserves typed equality, detaches input objects, deduplicates in first-seen
  order, and checks at most one distinct value for `toggle: false`. Omitted
  `value` and `[]` initialize empty. API writes validate the whole input before
  changing state.
- Source binding reads raw values through an unconditional field accessor after
  normal color/fill/stroke normalization. Resolve logical `color` using the
  existing resolution-channel metadata and effective normalized inputs. An
  overridden/nonexistent effective input must fail clearly rather than reading
  an unrelated fill/stroke. Multiple aliases of the same input reuse it.

### State, scope, and operations

Keep existing internal record single/multi representations. Add a private
category-point representation containing its declared component and an ordered
typed set of raw values. Neither the spec object shape nor API tuple shape
dictates internal storage. Do not store source field names, scale IDs, palette
positions, or row matches as shared membership.

Use small replace/toggle/clear helpers across point modes. Keep the existing
event-handler path, event filters, hover ownership, clear defaults, and boolean
toggle defaulting in `asSelectionConfig`. A plain click replaces, Shift-click
toggles only when enabled, and clear empties. A gesture reads current shared
membership so an intervening API write remains authoritative. Invalid/missing
row values cannot enter category state; apply the existing no-hit replace/toggle
behavior instead of publishing an invalid scalar.

Register mode, logical component, and normalized cardinality on the actual
parameter value owner. All writers to that slot must agree. Validate each unit
writer's own source encoding, but allow a container owner with no field input.
An ancestor declaration alone must not install descendant interaction handlers;
local `push: "outer"` aliases explicitly opt into writing. Consumers require
their own readable compatible inputs and may remain read-only.

Retain transaction scheduling, settled subscriptions, lexical shadowing, and
scope disposal. Remove category membership from record-only identity decisions,
while preserving IDs required for picking and ordinary record predicates.

### Membership and consumer mapping

Extend the resolved predicate leaf with category membership and a bound raw
consumer input. Reuse the existing logical tree, named predicates, and flat
union normalization. A single pure category matcher and shared activity helper
serve host predicates, filters, and expression operations where applicable;
do not duplicate selection semantics in each consumer.

Default mapping binds the declared component to the consumer's same logical
channel, resolved through that mark's normalization. Different field names
require no explicit mapping. For the same activation concept shown on shape:

```json
{ "param": "activation_states", "project": { "color": "shape" } }
```

An explicit mapping covers exactly the declared component and resolves a
supported unconditional categorical channel. It only changes which consumer
input is tested. It never renames stored components or values. Category type
compatibility means nominal/ordinal raw scalar membership, not identical scale
identity or display ordering. Mapping activation labels to an unrelated cell
type input simply does not match; the engine does not infer biological joins.

Keep positional interval resolution separate: same-axis endpoint targets and
matching quantitative/index/locus types remain required. Move mapping shape
validation into the generated schema rather than widening the parser's current
hard-coded interval-only shape checks. Runtime checks retain semantic component
coverage and resolved input compatibility.

For category dataflow filters, require the existing explicit field mapping:

```json
{
  "type": "filter",
  "param": "activation_states",
  "fields": { "color": "activation_state" }
}
```

Extend that path using the same typed membership primitive and existing
parameter-driven replay. Transforms have no implicit visual channel. Preserve
record/interval filter behavior; do not broaden filter Boolean grammar or
silently change interval filter endpoint conventions in this PR.

All appearance/order predicates preserve per-leaf `empty` defaults. Flat unions
keep group-level emptiness: an empty member cannot make a partially active
union match everything. A nonempty selection of currently absent values stays
active and matches no row until a valid raw value reappears.

### Expression helper decision

Use parameter values as function arguments, so ordinary lexical binding and
dependency tracking apply without string-name lookup or a second subscription
system. Proposed public functions:

| Function                                | Applicable kinds                                  | Result when empty                       | Diagnostics                                     |
| --------------------------------------- | ------------------------------------------------- | --------------------------------------- | ----------------------------------------------- |
| `selectionActive(selection)`            | Record point, category point, positional interval | `false`                                 | Reject a non-selection argument.                |
| `selectionValues(selection, component)` | Category point                                    | Detached `[]`                           | Reject other kinds and an undeclared component. |
| `selectionBounds(selection, component)` | Positional interval                               | `null` for a cleared declared component | Reject other kinds and an undeclared component. |

`selectionValues` returns a flat array of raw scalars in selection order, for
example `selectionValues(activation_states, 'color')`. It includes absent values.
`selectionBounds(brush, 'x')` returns a detached numeric `[lo, hi]` pair in
native domain coordinates, matching the existing snapshot's `intervals` view;
locus bounds are linearized genomic coordinates. Complex genomic endpoints
remain available through the existing JavaScript snapshot API. #610 will extend
the applicable interval components without changing these signatures.

These helpers read stored state, never matching rows. `selectionActive` reuses
the native activity helper. Bounds access needs no brush controller or screen
geometry and must not trigger the broader interval API refactoring. Register
the functions through the existing expression whitelist and retain located
errors. Migrate the overview/detail example's direct `brush.intervals.x` access
to `selectionBounds(brush, 'x')`; use native `param` predicates for membership.

### Sampling policy decision and compatibility

Adopt the issue's recommended direct rule for every appearance predicate:
collect its referenced record and positional-interval membership leaves,
deduplicate equivalent bound leaves, and preserve a row if any such active leaf
matches it. Category leaves contribute nothing. Activity atoms alone are not
membership matches. Use each interval occurrence's resolved consumer mapping.

Do not evaluate or rewrite the appearance Boolean expression to make this
decision. An eligible leaf under `not`, `and`, or `or` still preserves its own
matches. Empty leaves never preserve rows, regardless of their `empty` fallback.
Order-only conditions retain their current separation from appearance-driven
sampling. Keep one direct implementation rule with backend translation.

| Appearance condition, with `R` record/brush and `C` category | Appearance                             | Extra rows retained through sampling       |
| ------------------------------------------------------------ | -------------------------------------- | ------------------------------------------ |
| `C` or `not C`                                               | Ordinary Boolean membership            | None                                       |
| `R`                                                          | Ordinary membership                    | Matches of active `R`                      |
| `R and C` / `R or C`                                         | Ordinary Boolean composition           | Matches of active `R`                      |
| `not R`                                                      | Complement of ordinary membership      | Matches of active `R`, not its complement  |
| `R1 and R2`                                                  | Intersection                           | Union of matches of active eligible leaves |
| Flat union containing an empty member                        | Existing group-empty semantics         | Matches of active eligible members only    |
| Empty `R` with active `C`                                    | Existing empty fallback for appearance | None from `R` or `C`                       |

Compatibility assessment: the current GPU code uses
`activeMatchResolvedSelectionPredicate(root)`, effectively combining the entire
appearance result with any referenced activity. Therefore eligible-only
compound `and`/`not` cases can change visible sampled rows under this rule, even
without a new category selection. Direct record/brush predicates and simple
positive unions retain their intended behavior. The current GPU implementation
also gates bypass on a unique-ID input; intervals do not intrinsically need that
input. Canvas/SVG currently have no equivalent bypass. Correct these limitations
as part of the documented common default, with focused before/after fixtures.

Treat this as an intentional compatibility change, not an incidental refactor.
If preserving the old eligible-only compound behavior is chosen instead before
implementation, replace this table and its tests/docs with that one explicit
default; do not add a policy interface or configuration switch.

### Scoped API and durable state

Keep `type: "point"` on capabilities and snapshots. Make
`PointSelectionApi`/`PointSnapshot` discriminated unions using
`membership: "records" | "categories"`; record snapshots keep their detached
`data` rows, including the existing omission of picking identifiers. Categories
expose exactly their semantic value view:

```json
{
  "type": "point",
  "membership": "categories",
  "active": true,
  "encodings": ["color"],
  "values": [["activated"], ["intermediate"]]
}
```

Category `setValue([["activated"]])` validates, detaches, deduplicates, and
replaces membership without keys or data readiness. Wrong tuple lengths,
unsupported scalars, and excess distinct values for single cardinality reject
the entire write without publication. `clear()` empties. Point change/commit
subscriptions retain their present settled delivery equivalence and lifetime.
Record `setValue` continues to resolve unique `encoding.key` tuples against
ready rows; category fields never substitute for record keys. Generic parameter
APIs must not become an alternate unvalidated category-write path.

For App, use a category variant such as
`{type: "point", membership: "categories", encodings: ["color"], values: [["activated"]]}`
in the existing `paramChange` value union. Preserve the existing persisted record
envelope `{type: "point", keyFields, keys}` and restore old bookmarks unchanged.
Capture/restore categories before record-key/readiness handling, validate the
logical component/cardinality against the target declaration, and keep detached
raw tuples. Persist no rendered outputs, IDs, or matching-record expansions.

Update action summaries, emptiness detection, bookmark types, App exports, and
agent shape validation/schema generation. Existing “Select related items” and
record-based expansion stay record-only; category selections must not expose
those operations. Agent changes consume App's source types through existing
public boundaries and regenerate artifacts rather than editing generated files.

### Retained GPU contract

Category IDs are derived separately for each bound input's stable categorical
mapping. Reuse its already retained integer attribute/series before visual scale
output. Never compare RGB values, shape codes, dense domain ranks, or IDs from
another scale. Typed values that render identically must remain distinguishable.

WebGL can reuse its integer hash-set texture machinery for selected input IDs.
WebGPU's existing `multi` selection already owns a retained `Uint32Array` hash
set, activity/count state, replacement, and disposal. Generalize its public
input binding so membership can read an existing raw integer input instead of
being fixed to `uniqueId`, preserving record-ID behavior. If the public contract
needs refactoring, share one integer-set primitive between records and
categories rather than adding a parallel predicate/resource family. Extend
only the missing predicate/input/slot contract, validation, and WGSL wiring.
The low-level renderer knows integer inputs/sets, not Core channels, parameter
scopes, raw category types, or the GenomeSpy grammar.

The Core adapter converts selected raw scalars to the consuming input's IDs and
updates that slot. Binding/resource identity must include selection value owner
and consuming mapping/input, not just parameter name: the same selection can
appear against two independent mappings in one mark. Equivalent inputs share
resources. Preserve category ID zero as a valid ID; the existing hash-table
sentinel is distinct. Retain stored activity even when no input row matches.

Selection updates cost work proportional to selected categories and bound
inputs, not loaded rows. Capacity growth may resize a small membership resource.
Subscribe through existing mark revisions and completed mapping effects;
source/domain changes update or rebind the appropriate resources without
rewriting shared semantic state. Release textures/buffers/subscriptions with the
owning backend/view. No backend handles enter semantic marks or parameter state.

## Milestone progress

- Milestone 1: implemented native category state, source validation, scoped API,
  helpers, and precise initializer schema. Focused schema/state/interaction/API
  suites cover the new contracts alongside existing record behavior.

- Milestone 2: implemented per-consumer categorical predicates, order/filter
  parity, mapping schema, and the direct sampling-leaf rule. Core type checks,
  focused behavior suites, all 35 schema tests, and schema generation pass.
  GPU translation is completed in milestones 3 and 4.

- Milestone 3: generalized the existing WebGPU multi-set input binding and
  reused retained resources. Renderer type checks, focused resource/shader
  tests, actual GPU membership/order tests, and Storybook build pass. The GPU
  probe verifies ID zero, clearing, and no series uploads on membership changes.

## Implementation milestones

Each milestone includes its meaningful tests and documentation. Tentative
messages describe future implementation commits, not changes made by this plan.

### 1. Native category point state, grammar, and scoped value API

- **Outcome:** categorical declarations initialize correctly, compatible local
  writers share state, gestures and the scoped API use the same point update
  operations, and expression helpers hide storage.
- **Areas/consumers:** specification types/schema; selection state/activity;
  `paramUtils`, `ViewParamRuntime`, `UnitView`; scoped API types/copy/write
  paths; expression functions. Remove the unused projected-selection scaffold.
  Keep record initialization, picking ownership, and interval controllers intact.
- **Verification:** schema acceptance/rejection and semantic initialization
  failures; typed/deduplicated initial values; API atomic validation and detached
  snapshots/results; click/Shift/clear and `toggle: false`; API replacement then
  gesture; hover filters/defaults; independent/shadowed/shared outer state,
  incompatible writer modes/components/cardinality, disposal, and settled
  transactional observation. Include an owner without a unit field and a
  read-only descendant that never becomes an interaction source.
- **Docs/migration:** record the helper contract in #608 and expression docs
  before helper implementation; document initial object values versus API
  tuples and the new public membership discriminator.
- **Tentative commit:** `feat(core): add categorical point selection values and scoped APIs`

### 2. Per-consumer membership, filters, order, and sampling semantics

- **Outcome:** one native membership meaning reaches conditional encoders,
  order, and explicit filters; the sampling rule is expressed independently.
- **Areas/consumers:** predicate tree/encoder resolution, color normalization
  metadata, `order.js`, filter type/runtime, activity helpers, record identity
  decisions. Keep category and positional interval binding checks distinct.
- **Verification:** authored headless specs through collectors and encoders:
  different field names/default mapping; color-to-shape mapping for the same
  concept without changing snapshots; unrelated values; duplicate visual
  outputs; typed values; invalid/missing values; two-category AND and mixed
  record/brush conditions; direct/named/logical/flat-union empty semantics;
  appearance/order/filter parity; unchanged interval mapping restrictions.
  Use representative interval endpoint regressions without altering their
  existing contracts. Test the selected sampling table through behavior, not
  exact normalized tree shapes.
- **Docs/migration:** explain projection versus consumer mapping, explicit
  filter fields, empty behavior, and the chosen compound sampling compatibility
  change in #608/grammar docs before implementing that behavior.
- **Tentative commit:** `feat(core): bind categorical predicates to consumer inputs`

### 3. Renderer-generic WebGPU input-set membership

- **Outcome:** standalone renderer users can predicate appearance/order against
  retained integer input membership and update the small set independently.
- **Areas/consumers:** public renderer types/slots, predicate validation and
  shader analysis, existing `multi` selection resources, packed-series alias
  reuse, built-in mark consumers. Generalize the retained set's input binding
  and reuse its update/lifetime path for record and category IDs. Keep Core
  imports and grammar out of the renderer.
- **Verification:** public API type checks plus actual GPU output for membership,
  empty/active state, multiple bindings, alias reuse, duplicate visual outputs,
  retained set replacement, and disposal. Preserve existing record-ID tests and
  extend predicate/order GPU tests for explicit raw inputs. Add one generic
  retained-update Storybook scene. Assert no series upload or pipeline rebuild
  on a membership-only update.
- **Docs/migration:** document the generic contract in the renderer README,
  update its migration plan, and build Storybook. The renderer is unpublished;
  improve its API directly where necessary.
- **Tentative commit:** `feat(webgpu-renderer): test retained input values against integer sets`

### 4. Core renderer integration and sampling parity

- **Outcome:** native categorical predicates render correctly on all four
  backends, reusing encoded inputs and following the documented sampling rule.
- **Areas/consumers:** WebGPU adapter/surface; WebGL predicate emission, textures,
  and deduplicated attribute lookup; Canvas2D/SVG shared host predicates and
  immediate point traversal. Include normal, picking, conditional order, and
  export paths for applicable mark families, not just filled points.
- **Verification:** actual WebGL/WebGPU predicates and retained updates, including
  color normalized to fill/stroke and shape; Canvas drawing/SVG output;
  mapped consumers with independent scales/IDs; reorder/removal/reappearance;
  source replacement and disposal. Apply the sampling fixtures to GPU output and
  immediate output, including interval-only consumers without picking IDs.
  Measure uploads, geometry builds, packed attribute aliases, resource count,
  and membership update size. Appearance-only updates must not replay dataflow;
  explicit filtering remains allowed to do so.
- **Docs/migration:** document all required backend support and the immediate
  sampling parity correction; do not retain a WebGPU unsupported-preview caveat.
- **Tentative commit:** `feat(core): render categorical selection membership across backends`

### 5. App persistence and agent-facing compatibility

- **Outcome:** categories capture/restore/undo with raw values and no row keys,
  and generic callers distinguish category values from record selections.
- **Areas/consumers:** provenance bridge/types, bookmark state types, parameter
  action summaries, expansion eligibility, App `agentShared` exports, and agent
  validation/generated action types/schema. Preserve existing record envelopes
  and record expansion. No new AgentApi hook is expected.
- **Verification:** capture, restore before data readiness, clear, undo/redo,
  bookmark/URL round-trip, absent values returning with later data, outer
  ownership, incompatible restore targets, and legacy keyed record bookmarks.
  Assert no collector matching/key lookup for categories. Verify agent
  `paramChange` category payload acceptance and useful rejection of malformed
  payloads, with generated artifacts in sync. Keep row copies and omitted
  picking IDs unchanged for records.
- **Docs/migration:** explain durable category values and record-only expansion;
  update JavaScript/TypeScript narrowing guidance. If an unexpected AgentApi
  hook is needed, discuss its minimal contract first and keep the App boundary
  change in the App commit rather than hiding it inside the agent adapter.
- **Tentative commit:** `feat(app): persist categorical point selections without record keys`

### 6. Demonstration, compatibility notes, and final integration

- **Outcome:** one polished, self-contained example makes #608 independently
  useful before legend binding exists, with complete user documentation.
- **Areas/consumers:** `examples/docs/grammar/parameters/categorical-point-selection.json`
  (new), parameter/condition/filter/expression and embedding docs, generated
  schema/API references, overview/detail example migration, and one coherent
  changeset for the feature. Focused core specs may carry additional probes.
- **Demo:** a readable illustrative immune-cell embedding uses T/B cell types
  on shape and resting/intermediate/activated states on ordinal color. Two
  linked views use `activation_state` and `activation`; compare category clicks
  with individual-record selection, show clear/Shift instructions and semantic
  helper feedback. Keep shape as cell type in the main example; demonstrate
  activation-color-to-activation-shape mapping in a separate focused case.
  Clearly label coordinates and states synthetic/illustrative. Follow
  `examples/README.md`, use inline/small shared data, and keep docs URLs portable.
- **Verification:** perform the integration matrix below, schema/example and
  generated-doc checks, required package builds/type checks/lint, and the
  appropriately broad final test run. Review related tests while implementing:
  keep contract/failure tests and remove duplicate generated-shape assertions.
- **Docs/migration:** apply `write-genomespy-docs`; finish the release assessment
  below with `write-genomespy-changeset` and prepare the eventual PR using
  `prepare-genomespy-change`.
- **Tentative commit:** `feat(core): demonstrate categorical point selection projections`

## Final integration and acceptance

Use `createHeadlessEngine` and the existing scoped APIs for authored-spec
subsystem coverage. Use `test-genomespy-views` for structured SVG/hierarchy
inspection and `debug-genomespy-web` for real browser interaction. Shader source
snapshots and adapter mocks supplement actual output; they do not establish GPU
correctness or buffer-reuse performance.

| Scenario                        | Required evidence                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Published example               | Actual click, Shift-toggle, clear, API replacement then gesture, and linked-view feedback on WebGL/WebGPU/Canvas2D; matching SVG export, including conditional paint order. Exercise ordinary point picking with asynchronous WebGPU delivery.                                                                                                                           |
| Composition beyond the demo     | Two category selections ANDed with a record selection/brush; local versus outer aliases; a read-only consumer; nested shadowing and independent scales. Check the sampling table including negation and empty members.                                                                                                                                                   |
| Category identity and lifecycle | `1`, `"1"`, `false`, and unusual string labels; distinct categories sharing a color/shape; independent mappings; domain reorder/removal/reappearance and source replacement. Stored tuples and activity remain stable.                                                                                                                                                   |
| Existing neighboring features   | `examples/core/selection/selection_union.json`, positional endpoint mapping tests, record key API/persistence, interval linked domains, and migrated `examples/docs/grammar/parameters/genome-overview-detail.json`. Preserve brush navigation/genomic behavior and event filters.                                                                                       |
| App round-trip                  | Capture category focus, change it, undo/redo, reload a bookmark before rows are ready, then load matching rows. No `encoding.key`, record expansion, or matching-row enumeration. Old record bookmarks still restore.                                                                                                                                                    |
| Retained performance            | Repeat category changes on a deterministic large local scored-point fixture with many categories. Instrument GL uploads and WebGPU buffer writes, geometry/series revisions, and shared input aliases. Only small membership resources change after warm-up; sample membership and independent brush state remain unchanged. Measure explicit filter updates separately. |

Completion checklist:

- [x] Helper and sampling decisions are recorded in #608 and docs before their
      respective implementations; deviations from this proposal are reconciled.
- [ ] One-category grammar/schema, object initializers, runtime input validation,
      and typed detached normalization satisfy the issue.
- [ ] Explicit scoped writers, shared operations, settled API subscriptions, and
      lifetime/disposal contracts work in both point modes.
- [ ] All native predicate forms, order, and explicit filters use the agreed
      membership and emptiness semantics without relaxing interval contracts.
- [ ] All four backends pass output checks; GPU updates reuse inputs and avoid
      matching-row scans and chart-buffer uploads.
- [ ] Category focus preserves the semantic sample; documented record/brush
      compound behavior is verified across backends.
- [ ] App and agent contracts distinguish categories, preserve record behavior,
      and restore raw values without readiness or keys.
- [ ] Demo, helpers migration, API/grammar compatibility guidance, generated
      artifacts, changeset, and related-test cleanup are complete.

Use focused suites during each milestone. For final integration, run the root
build first: it generates Core/App schemas and agent artifacts through the
existing workspace build scripts before dependent tests and type checks.

```sh
npm run build
npx vitest run <affected-test-files> --reporter=agent
npm -w @genome-spy/webgpu-renderer run test:gpu -- <affected-gpu-tests>
npm --workspaces run test:tsc --if-present
npm test -- --reporter=agent
npm run lint
npm -w @genome-spy/app-agent run check:agent
npm run build:docs
git diff --exit-code -- docs/api/reference
npm run check:doc-types
npm -w @genome-spy/webgpu-renderer run build-storybook
npm run release:check
npm run release:status
```

Do not separately repeat `build:schemas` or `generate:agent` in this final run;
the root build already performs them. The docs build owns its asset preparation,
API reference generation, and doc-type generation, so check its generated API
output directly instead of invoking another generation through `check:api-docs`.
Keep reviewed generated artifacts committed before checking freshness. Existing
build scripts may repeat prerequisite work internally; changing their
orchestration is outside this feature.

Use the existing browser harnesses for targeted examples rather than requiring
unrelated network-heavy examples. Run the full suite at final integration
because this crosses selection, rendering, API, and persistence contracts. Do
not change timeouts merely to accommodate regressions.

## Compatibility, risks, and delivery

### Release assessment

This plan alone has no release impact and needs no changeset. The implemented
feature needs one fragment covering directly affected packages. Current
recommendation: Core **major**, App **minor**, and App Agent **minor** if its
user-visible action contract changes as planned. Core's broadened public point
union invalidates the existing `type === "point"` implies `.data` assumption;
the selected compound sampling rule also changes existing behavior. Both need
explicit migration guidance. Under the current fixed group, the highest bump
propagates to all eight release packages; do not list them all or include the
unpublished WebGPU renderer just for synchronization. Confirm the final bump
against the implemented diff and calculated release status before delivery.

Minimum TypeScript migration: after narrowing to point, check
`membership === "records"` before reading `data`; category callers read
`encodings`/`values`. Existing record-only application logic should explicitly
require record membership. Spec authors use native predicates and the helpers.
Document the sampling table for existing compound appearance conditions; do not
claim this is wholly backward-compatible functionality.

### Risks and remaining decisions

- **Two pre-implementation gates:** helper names/numeric bounds and the sampling
  compatibility rule are recommended above. They must be settled and recorded,
  rather than inferred from illustrative issue names or PoC behavior.
- **Normalized color and deduplicated inputs:** keep the logical component
  separate from physical fill/stroke attributes and resolve through current
  metadata. Test explicit overrides, filled/unfilled marks, and shared inputs.
- **Independent categorical mappings:** one parameter may need multiple small
  resource bindings. Key by actual value owner and mapping identity; never a
  bare channel/name cache or global category registry.
- **Data/domain lifetime:** absent values stay stored and active. Test all
  selected values absent, unknown-to-mapping API writes, later source arrivals,
  physical scale replacement, and cleanup without reusing stale backend IDs.
- **Schema precision:** verify generated unions reject undeclared initializer
  keys/targets and accept intended mappings. Keep runtime semantic validation
  separate from specification shape validation.
- **App/agent assumptions:** update duplicated state declarations and targeted
  action validators as well as generated schemas; otherwise category payloads
  can appear valid at one boundary and fail at another.
- **Performance proof:** actual buffer/resource measurements are required.
  Category membership tests alone cannot establish retained-input reuse or
  sampling independence.

No additional product-scope question blocks drafting this plan. Exact helper
spelling and the compatibility policy remain visible decision gates for
implementation; low-level set-slot naming may be settled within milestone 3
without broadening the public Core contract.

### Size and review boundaries

Raw `wc -l` baseline for focused existing implementation files:

| Files/group                                                               | Lines at `085674617` |
| ------------------------------------------------------------------------- | -------------------: |
| `selection.js` + `selectionPredicateTree.js`                              |                  913 |
| `unitView.js`, `paramUtils.js`, `viewParamRuntime.js`, `embedParamApi.js` |                2,603 |
| Core WebGPU adapter/surface, `webGlMark.js`, immediate `marks/point.js`   |                5,121 |
| App `paramProvenanceBridge.js`                                            |                1,323 |
| Renderer `selectionResources.js` + `visibilityPredicate.js`               |                  987 |
| Total                                                                     |               10,947 |

These are source-size baselines, not non-comment production counts or targets.
Compare the same files plus new production files at delivery with `wc -l` and
`git diff --stat`; use `count-production-lines` if exact production-line counts
are requested. Growth is expected for the feature but should buy one native
path, all required backends, and explicit compatibility. Remove unused
projected scaffolding, duplicate activity logic, redundant per-row inputs, and
overlapping tests instead of accumulating parallel mechanisms.

The important implementation review boundaries are native state/API/scoping,
the renderer public contract and retained resources, then integrated
App/agent/output behavior. Avoid separate review steps just for measurements or
wording. The requested subagent KISS/YAGNI review found no blockers; its
renderer-reuse and verification-order recommendations are incorporated.

When implementation is authorized, use a feature branch and one coherent PR
for #608, preserving #609/#610's separate boundaries. Keep and reconcile this
plan during draft review. Resolve every unfinished item as completed or
explicitly discarded, preserve that state in branch history, then remove the
temporary plan in a later commit before merge, following the planning skill.
