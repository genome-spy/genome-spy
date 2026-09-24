# Logical selection predicates and endpoint projection plan

Status: reconciled; implementation complete and temporary plan ready to retire

## Completion record

The implementation and automated verification tasks in Milestones 1–3 are
complete, except for the explicitly discarded items below. The final
integration checklist is satisfied by the automated checks listed here where
applicable; its remaining manual tasks are discarded as PR gates.

- Milestone 1: the renderer-generic predicate tree, component state, input
  projections, validation, shader emission, README, and example are implemented.
  Renderer runtime changed by −45 non-comment JavaScript lines against the PR
  base after simplification.
- Milestone 2: Core normalizes and resolves logical predicates, and CPU,
  Canvas2D, SVG, WebGL, and WebGPU consume the same selection semantics.
  Core runtime changed by +431 non-comment JavaScript lines against the PR base;
  combined Core and renderer runtime changed by +386.
- Milestone 3: the checked-in PISA squid and synthetic endpoint-brush examples,
  grammar guide, schema, generated type links, renderer scene, and migration
  notes document and exercise the feature. Named unit-view predicates were
  added afterward to remove repeated tests from the PISA specification.
- Verification: the root unit suite passed 497 files and 4,412 tests; the
  renderer unit suite passed 44 files and 297 tests; all 116 renderer GPU tests
  passed. Workspace TypeScript checks, root lint, generated-doc checks,
  example/schema tests, and the renderer Storybook build passed.

Discarded or superseded tasks:

- Freezing the normalized Core tree was removed after a simplification review;
  the tree has one owner and no supported mutation path.
- Exact old behavior for a partially active multidimensional brush was
  superseded by the decision to treat it as empty until every axis is active.
  The rule is documented and tested across host, WebGL, and WebGPU paths.
- Updating and manually exercising the private `fig2c-squid.json` prototype was
  replaced by the checked-in public PISA squid specification. The planned
  exhaustive manual real-data sweep of hover, zoom, tooltips, fading, and all
  four rendering backends was not performed. Automated example, host, export,
  shader, and GPU tests cover the shipped predicate behavior instead.
- A full documentation-site build was not used as a release gate; generated
  type-link checks, valid example initialization, Markdown formatting, and
  schema tests cover the changed documentation sources.

## Objective

Allow conditional encodings and conditional draw order to combine selection
predicates with logical `and`, `or`, and `not`, and allow a use of an interval
selection predicate to target a specific positional encoding of the tested
mark.

This is intentionally a conditional-encoding enhancement, not an implementation
of Vega-Lite's broader selection-definition projection model. The design must,
however, leave a clean path for later adding Vega-Lite-compatible `fields` and
`encodings` projection without changing the meaning of the logical predicate
grammar or the renderer API introduced here.

The motivating case is the PISA squid plot in
`private/genomespy-dataset-recipes/recipes/bpreveal-pisa/specs/fig2c-squid.json`:

- an Accessibility brush should test only the link `target` encoded on `x2`;
- a Contribution score brush should test only the link `source` encoded on `x`;
- when both brushes are active, only links satisfying both tests should be
  emphasized;
- an independently hovered link should still be emphasized;
- when neither interval brush is active, all links should retain their normal
  effect encoding.

The change must preserve equivalent predicate behavior in host-side encoders,
Canvas2D, SVG, WebGL, and WebGPU. It must not introduce Core grammar concepts
into `@genome-spy/webgpu-renderer`.

## Current constraints

- Core normalizes a conditional selection test into a flat list of parameter
  names plus one empty policy. It supports one selection or the compatibility
  spelling `{ "param": { "or": [...] } }`, but not a predicate tree.
- Link marks use the `endpoints` hit-test mode by default. An `x` interval
  therefore tests `x OR x2`, which is correct for the current single PISA brush
  but cannot target one endpoint.
- WebGL generates selection checker functions keyed by parameter name and
  reconstructs conditional encoding, point semantic-threshold bypass, and
  order predicates from flattened parameter lists.
- The WebGPU renderer has reusable `all` and `any` visibility nodes, but channel
  conditions and mark order still accept only a single selection or flat
  selection union.
- The WebGPU interval-selection contract currently conflates a retained
  selection component with the mark input being tested: Core publishes an `x`
  interval through a target named `x`. Testing that same component against
  `x2` requires these concepts to be distinct.
- Two track-local brushes need no new interaction machinery. A common ancestor
  can own plain parameters while interval selections in the Accessibility and
  Contribution score children write to them with `push: "outer"`.

## Goals

- Add Vega-Lite-shaped logical composition for selection predicates used by
  conditional encodings and conditional order.
- Add explicit, endpoint-specific channel projection for interval predicate
  leaves.
- Preserve existing direct parameter predicates and flat selection-union
  behavior without migration.
- Normalize the grammar once and use the same predicate semantics in CPU and
  GPU paths.
- Preserve the exact predicate tree for conditional channel evaluation and
  conditional order, and derive active-match predicates for the point mark's
  semantic-threshold bypass.
- Give the WebGPU renderer a small, renderer-generic predicate API with no
  knowledge of GenomeSpy parameters, channels, or view hierarchy.
- Allow the same retained interval component to be tested against different
  mark inputs within one mark.
- Keep selection updates retained: brush movement updates existing uniforms or
  buffers and requests a render without rebuilding mark data or pipelines.
- Preserve Vega-Lite's meanings for the shared public forms: parameter leaves,
  per-leaf `empty`, and logical `and`, `or`, and `not`.
- Keep selection component identity separate from use-site mark-input binding
  so a later selection-definition projection can supply field-derived
  components without changing Boolean predicates or renderer resources.
- Resolve and enforce projected component data types in Core. Quantitative,
  index, and locus interval components, including their high-precision GPU
  representations, are required in the initial implementation.

## Non-goals

- Do not change interval brush controllers, selection storage, persistence,
  `push: "outer"`, or selection serialization.
- Do not add `fields` to selection definitions, reinterpret the existing
  selection `encodings` property, resolve field names across views, or upload
  fields that are not already mark inputs. Those belong to a later, broader
  Vega-Lite compatibility change.
- Do not add PISA-, link-, source-, or target-specific properties.
- Do not generalize transform filters to the full logical predicate grammar in
  this change. Their existing field projection remains unchanged.
- Do not add general expression or field predicates to conditional encodings.
  The recursive grammar shape must leave that extension possible later.
- Do not define interval semantics for nominal or ordinal data. Projected
  interval components and their targets must resolve to the same supported
  ordered GenomeSpy data type.
- Do not add automatic conversion between different GenomeSpy data types or
  coordinate systems. An explicit projection is a binding within one logical
  data domain, not a scale or unit conversion.
- Do not introduce a renderer-neutral GPU abstraction shared by WebGL and
  WebGPU. Core owns the semantic predicate; each backend owns its code
  generation and resources.

## Feasibility and estimated difficulty

This is feasible without a new rendering algorithm or a rewrite. It is a
moderate, cross-cutting feature: most of the work is replacing flattened
predicate assumptions and proving identical semantics across retained and
immediate renderers.

| Area                                        | Difficulty  | Main reason                                                                                                                          |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Grammar, normalization, and host evaluation | Medium      | Recursive shape, runtime cross-reference validation, use-site channel projection, and activity-aware flat-union lowering             |
| WebGL                                       | Medium-high | Predicate logic is spread across shader resource discovery, conditional accessors, point semantic-threshold bypass, and order passes |
| WebGPU renderer                             | Medium      | Retained components must be separated from per-use inputs, including scalar and packed index/locus comparison representations        |
| Canvas2D and SVG                            | Low-medium  | They share host-side encoders, so the work is mainly parity and ordering verification                                                |
| Documentation and PISA integration          | Low         | The authoring change is localized once the grammar and renderer contracts exist                                                      |

WebGL is the more awkward implementation because of its historical flattened
checker generation. WebGPU needs a deliberate public API refactor, but the
result remains small and renderer-generic. The expected scope is several
focused modules plus tests and documentation, not a large new subsystem.

## Complexity budget and automatic redesign gate

Treat production-line budgets as automatic redesign triggers, not reasons to
weaken correctness or game the metric.

Measure committed changes after each implementation milestone with the
repository's `count-production-lines` workflow, using the implementation
branch's PR base or merge base. Count non-comment runtime `.js` lines; exclude
tests, documentation, examples, generated files, and plan/migration documents.
Report `.d.ts` changes separately so public API growth remains visible.

Use these review triggers:

- more than **+200 net runtime SLOC** in `packages/webgpu-renderer/src` after
  Milestone 1; or
- more than **+800 net runtime SLOC** across `packages/core/src` and
  `packages/webgpu-renderer/src` after Milestone 2.

When a trigger is crossed, continue automatically with a focused redesign. Run
at most two redesign/review rounds for that milestone, with only one Sol-medium
reviewer active at a time. A round consists of:

1. Record added, deleted, and net production lines by file.
2. Identify the largest growth sources and simplify within the existing
   grammar, goals, non-goals, and acceptance criteria. Prefer deleting special
   cases, sharing predicate traversal/emission, keeping Core-only knowledge out
   of the renderer, and reusing current index/locus representation utilities.
3. Re-run the affected tests and production-line count.
4. Request a Sol-medium subagent review of the revised design and implementation,
   including whether the remaining growth is necessary and whether a smaller
   solution exists.
5. Resolve every medium-or-higher finding within the protected grammar, goals,
   non-goals, compatibility promises, and acceptance criteria; then re-run the
   affected tests and recount production lines.

After a round, continue to the next milestone when the affected tests pass and
there are no unresolved medium-or-higher findings. Falling below the trigger is
preferred but not mandatory; exceeding it alone does not start another round.
If medium-or-higher findings remain and one round remains, perform the second
round. If such findings or test failures remain after the second round, pause
implementation and report the unresolved tradeoff instead of starting another
review loop.

Do not stop for user approval during the bounded loop. Ask for direction before
the loop is exhausted only if the redesign would change the public grammar,
goals, non-goals, compatibility promises, or acceptance criteria.

## Grammar design

### Logical composition

Follow Vega-Lite's predicate composition shape:

```json
{
  "test": {
    "or": [
      { "param": "pisaLinkHover", "empty": false },
      {
        "and": [
          {
            "param": "accessibilityRegion",
            "project": { "x": "x2" }
          },
          {
            "param": "contributionRegion",
            "project": { "x": "x" }
          }
        ]
      }
    ]
  }
}
```

Define a recursive selection predicate operand consisting of:

- a `ParameterPredicate` leaf;
- `{ "and": [operand, ...] }` with a nonempty array;
- `{ "or": [operand, ...] }` with a nonempty array;
- `{ "not": operand }`.

Reject nodes containing more than one operator or mixing an operator with leaf
properties. Keep the concise direct condition form, such as
`{ "param": "brush", "value": 1 }`, for a single leaf. Logical composition
belongs under `test` so the condition's encoded field, datum, or value remains
unambiguous.

The recursive shape matches Vega-Lite and can later admit other predicate
leaves without changing `and`, `or`, or `not`. This change implements only
selection leaves.

### Use-site channel projection

Extend a selection `ParameterPredicate` with an optional `project` mapping:

```ts
type SelectionPredicateProjection = {
  x?: "x" | "x2";
  y?: "y" | "y2";
};
```

The mapping key identifies a retained interval selection component. In this
change, interval components are the selected `x` and `y` channels. The value is
the positional encoding of the tested mark whose raw domain value is compared
with that component.

Rules:

- `project` is valid only for interval selections.
- Every interval component declared by the parameter's selection definition
  must be covered when `project` is specified. Validate against the declaration,
  not the currently populated interval value, which may be empty. Fail fast on
  missing or extra components.
- Targets stay on the same axis: `x` may target `x` or `x2`; `y` may target
  `y` or `y2`.
- An explicit target tests exactly that logical endpoint. It suppresses the
  mark's automatic secondary-endpoint inference for that dimension.
- In the initial implementation, an explicit target must name an unconditional,
  field-backed positional encoding. Reject missing channels and value-, datum-,
  expression-, or condition-backed targets during view initialization with the
  selection and target channel in the error.
- Core resolves the effective GenomeSpy data type of both the selection
  component's defining channel and the target encoding. The types must match
  exactly and be `quantitative`, `index`, or `locus`; reject nominal, ordinal,
  and cross-type projections before constructing either renderer. A secondary
  encoding such as `x2` inherits the effective type of its primary encoding
  when it omits `type`.
- Scales may have different visual ranges because membership is evaluated on
  raw domain values. The explicit mapping asserts that same-typed values belong
  to the same logical domain.
- Index and locus data, including their existing high-precision representation,
  are required behavior rather than a deferred renderer enhancement.
- With no `project`, existing behavior remains unchanged, including the link
  mark's default `endpoints` hit test over `x` and `x2`.
- The initial string target is deliberately compact. A later richer input
  target can be added as another value form without changing the mapping or
  logical grammar.

This `project` property is a GenomeSpy use-site extension. It answers "which
input of this tested mark should this already-retained selection component
use?" It does not declare what fields a selection captures. Conditional
encodings already operate on mark encodings, and channel targets map directly
to WebGL attributes and WebGPU inputs. Field projection would additionally
need to define selection tuples, resolve fields across views, and upload
otherwise unused fields; that work is deliberately deferred.

### Forward compatibility with Vega-Lite selection projection

Keep two projection stages conceptually and structurally separate:

1. **Selection-definition projection** determines the logical components stored
   by a selection and their default data-field identities. GenomeSpy does not
   implement Vega-Lite-compatible `select.fields` in this change and does not
   change the meaning of its current interval `select.encodings`.
2. **Predicate-use projection** optionally binds one retained component to a
   particular input of the mark being tested. This is the `project` extension
   above.

For the supported subset, shared grammar must have shared meaning. A predicate
such as `{ "param": "brush", "empty": false }`, including when nested below
`and`, `or`, or `not`, follows Vega-Lite's predicate and empty-selection
semantics. Vega-Lite will not accept the GenomeSpy-only `project` property; it
must be documented as an explicit extension rather than presented as portable
syntax.

A multidimensional interval is treated as empty until every declared component
has an interval. Authors who want an axis-specific brush declare only that axis.

Internally, call the retained units **selection components**, not fields or
channels. A component has an opaque stable identifier; today Core derives it
from `x` or `y`, while a future field-projection implementation may derive or
associate it with a projected field. Core resolves the component to a renderer
input for each predicate occurrence. The WebGL and WebGPU layers receive only
that component-to-input binding and never decide whether the component
originated from a channel or field.

A future Vega-Lite compatibility milestone can therefore add selection-side
field metadata and default field-to-input resolution without changing:

- the recursive `and`/`or`/`not` grammar;
- per-leaf `empty` semantics;
- the flat-union lowering;
- the renderer's component state or Boolean predicate tree; or
- the meaning of an existing explicit `project: { "x": "x2" }` override.

That future work must define the supported interaction between field-projected
selections and explicit channel overrides. This plan only reserves the
separation needed to make that decision; it does not add dormant public fields,
field-matching behavior, or speculative renderer properties.

### Resolving pushed selection declarations

The motivating brushes are declared in sibling tracks with `push: "outer"`,
while the link mark sees plain parameters on their common ancestor. Predicate
validation therefore must not use the nearest authored config or inspect the
current parameter value; the nearest config is plain, and the value can still
be unseeded when encoders initialize.

Add an internal selection-capability registry keyed by parameter value-slot
identity: the owning `ViewParamRuntime` plus parameter name. Whenever a local
selection declaration is registered, record its normalized runtime kind
(`single`, `multi`, or `interval`) and, for intervals, its declared components
against the slot it writes. In this change the component IDs remain the current
`x` and `y` interval keys. Once scale resolutions are available, finalize each
interval component descriptor with its effective GenomeSpy data type. A
`push: "outer"` declaration registers against the resolved outer slot; a normal
declaration registers against its local slot.

All view-tree parameter configs must register structural capabilities before
mark encoders run. Resolve component data types after scale resolution but
before predicate validation. A predicate resolves the visible value slot from
its own scope and queries that slot's finalized capability, so sibling pushed
selections work before any interaction has published a value. Multiple
declarations may target one slot only when their normalized kind, component
set, and effective data types are compatible. Reject conflicts deterministically
with both declaration locations in the error. Registration follows the existing
view lifecycle and is removed when its declaring view is disposed.

### Empty-selection semantics

New logical compositions use Vega-Lite's leaf semantics:

- each leaf's `empty` defaults to `true`;
- an empty leaf with `empty: true` evaluates to true for every datum;
- an empty leaf with `empty: false` evaluates to false for every datum;
- a partially active multidimensional interval is empty and follows the leaf's
  `empty` policy;
- `and`, `or`, and `not` apply ordinary Boolean semantics to those results.

This gives the desired PISA behavior: an empty interval brush is the identity
inside the `and`, one active brush constrains one endpoint, and two active
brushes intersect. The hover leaf uses `empty: false` so an empty hover does not
make the outer `or` true.

The existing flat union spelling has different group-level empty semantics:
with `empty: true`, it matches all rows only when every member is empty. Keep
that group-level behavior. A partially active multidimensional member is empty.

Keep the flat form as a concise public shorthand, but lower it losslessly into
the generic internal Boolean tree using a datum-independent selection-activity
atom. For each referenced selection `s`, define its active membership as:

```text
member(s) = predicate(s, empty=true) AND active(s)
```

Then normalize the flat union as follows:

```text
empty=false: member(a) OR member(b)

empty=true:  member(a) OR member(b)
             OR NOT (active(a) OR active(b))
```

The activity guard prevents an empty `empty=true` leaf from matching all data
when another member is active. The final clause restores the group-level
all-empty behavior. Thus the flat shorthand introduces no special internal or renderer
node and proves that the normalized predicate language is a semantic superset.
`active` is an internal Core/renderer primitive, not a new public JSON
predicate; authors continue to use the concise flat shorthand for this common
group-empty behavior.

## Core predicate model

Replace `SelectionPredicateInfo`'s flat `params` representation with an
normalized tree:

- leaf: resolved parameter name, empty policy, selection type, and optional
  interval component-to-channel projection;
- activity leaf: resolved parameter identity and type, with no datum membership
  or empty policy;
- all: nonempty child array;
- any: nonempty child array;
- not: one child.

Keep helpers that:

- collect unique parameter dependencies recursively;
- evaluate whether any referenced selection is active for the conditional-order
  one-pass optimization;
- compile the tree into a host-side datum predicate;
- resolve each parameter through the visible value slot's registered selection
  capability, including compatible pushed declarations in sibling views;
- resolve implicit or explicit component targets against a mark encoding;
- emit backend-specific expressions without flattening the tree.

Ordinary predicate truth drives conditional channels and conditional order.
The point mark's semantic-threshold bypass needs a separate active-match form
for every appearance predicate root:

```text
predicateResult && anyReferencedSelectionActive
```

OR those active-match roots across appearance branches. This preserves the
current rule that an empty selection does not make every point semantically
selected, while still respecting an `and` or `not` as authored. Do not OR
individual parameter membership checks: that would let one side of an `and`
bypass the threshold. Link fading is not an `isDatumSelected()` consumer; it is
controlled by the existing conditional-order second pass.

The same normalized predicate object should drive `color`, `opacity`, `order`,
Canvas2D, SVG, WebGL, and the WebGPU adapter. Backend code may lower it into its
own representation but must not reinterpret empty or component-to-
input binding semantics.

## WebGPU renderer API

### Public predicate shape

Use a generic Boolean tree rather than reproducing Core's grammar spelling:

```ts
type SelectionStateReference =
  | Readonly<{
      selection: string;
      type: "single" | "multi";
    }>
  | Readonly<{
      selection: string;
      type: "interval";
      components: readonly [string, ...string[]];
    }>;

type SelectionPredicateLeaf =
  | (Extract<SelectionStateReference, { type: "single" | "multi" }> &
      Readonly<{ empty?: boolean }>)
  | Readonly<{
      selection: string;
      type: "interval";
      projections: readonly [
        IntervalSelectionProjection,
        ...IntervalSelectionProjection[],
      ];
      empty?: boolean;
    }>;

type SelectionActivityPredicate = Readonly<{
  selectionActive: SelectionStateReference;
}>;

type BooleanPredicate<TLeaf> =
  | TLeaf
  | Readonly<{ all: readonly BooleanPredicate<TLeaf>[] }>
  | Readonly<{ any: readonly BooleanPredicate<TLeaf>[] }>
  | Readonly<{ not: BooleanPredicate<TLeaf> }>;

type SelectionPredicateAtom =
  SelectionPredicateLeaf | SelectionActivityPredicate;

type SelectionPredicate = BooleanPredicate<SelectionPredicateAtom>;

type VisibilityPredicate = BooleanPredicate<
  SelectionPredicateAtom | ScalarComparisonPredicate
>;
```

`ChannelCondition.when` and `MarkOrder.when` accept `SelectionPredicate`.
`visibleWhen` retains the broader `VisibilityPredicate`. Arrays must be
nonempty and each node must select exactly one variant.

`selectionActive` is a renderer-generic, datum-independent atom available in
every selection predicate tree. It is true
when a single-point selection has a selected ID, a multi-point selection is
nonempty, or every retained interval component is active. It ignores membership
and leaf `empty` policy. Core lowers an active-match root to:

```ts
{
  all: [
    ordinaryPredicate,
    {
      any: referencedSelections.map((selectionActive) => ({ selectionActive })),
    },
  ],
}
```

Carrying a complete `SelectionStateReference` keeps the atom self-contained for
resource discovery without attaching an irrelevant mark-input projection.
Repeated references are validated and share the same retained state. Do not
emulate activity with membership or a Core-managed scalar slot: for an active
point selection, `not selected` must active-match the nonselected rows.

Remove the renderer's existing `selectionUnion` node. Core lowers the flat
public shorthand to `all`, `any`, `not`, ordinary selection leaves, and
`selectionActive` as defined above. The renderer therefore exposes one
composable predicate language with no compatibility-only operator.

### Separate retained components from input projections

An interval leaf must identify both the retained selection component and the
mark input tested against it. A renderer-level descriptor should have the
semantic shape:

```ts
type IntervalSelectionProjection = Readonly<{
  component: string;
  input: string;
  secondaryInput?: string;
  hitTest?: "intersects" | "encloses" | "endpoints";
}>;
```

Name the public collection `projections`, replacing the current `targets`.
This makes the occurrence-specific role explicit now that the retained
component and mark input are distinct. The renderer treats component names as
opaque identifiers; it does not know about Core's channels, fields, marks, or
view hierarchy.

Selection resources are keyed by selection name and type. For interval
selections they retain the union of declared components, while each predicate
leaf retains its own projection descriptors. Reusing one selection with
another input projection must not allocate duplicate selection state or fail
because the targets differ.

Every referenced interval component retains a type-independent activity flag.
A component receives typed lower/upper bound storage only when at least one
membership leaf projects it onto a mark input. Thus an interval referenced only
through `selectionActive` has a complete resource layout without inventing an
input representation: its update records whether each component is active and
discards bounds that no predicate reads. If another occurrence in the same mark
tests membership, resource discovery allocates both the shared activity flag
and that component's typed bounds.

Derive bound storage and comparison directly from the projected input. Support
the renderer's existing scalar numeric and high-precision packed numeric input
representations; do not add a public comparator or Core data-type concept. If
one component is used against several inputs, require their resolved low-level
representations to match and fail initialization otherwise.

Retained interval handles expose component names, and updates are keyed by
those names. Every update writes activity; it writes bounds only for components
whose discovered membership use allocated them. Core therefore continues
publishing `selection.intervals.x` even when a predicate projects that component
onto the renderer input corresponding to `x2`.

### Renderer implementation boundaries

- Resource discovery recursively collects selection leaves from channel
  conditions, order, and visibility predicates, including activity atoms.
- Resource validation ensures a selection name keeps one type and that each
  interval component has one retained activity slot and at most one typed bound
  slot. It validates every occurrence's inputs and the per-component comparison-
  representation invariant before resource layout.
- WGSL generation emits selection state access separately from the
  occurrence-specific membership test, allowing multiple projections of the
  same selection.
- WGSL membership comparison supports the renderer's existing scalar and packed
  numeric input representations without learning GenomeSpy data types.
- Activity atoms read the same retained selection state and emit no per-datum
  membership test or additional Core-owned uniform.
- One recursive predicate emitter is shared by visibility, conditional channel
  wrappers, and order. It supports ordinary membership, activity, scalar
  comparisons where allowed, and Boolean composition; there is no flat-union
  emission path.
- Conditional-order activity recursively collects referenced selections. If no
  selection is active, a single draw remains valid because a selection-only
  predicate is then uniform across all instances.
- Core translation stays in `packages/core/src/rendering/webgpu/` and uses only
  documented renderer exports. The renderer must not import Core types or name
  GenomeSpy parameter concepts.

Update `packages/webgpu-renderer/MIGRATION_PLAN.md` when implementation of this
contract starts and when it finishes, as required by the package workflow.

### WebGPU architecture review note

The implemented renderer contract is cleaner overall. Conditional channels,
visibility, and order share one recursive predicate model and emitter. Retained
selection state is keyed by selection name and component, while each predicate
occurrence supplies its own input projection. This removes the flat-union and
target-specific paths without introducing Core grammar concepts into the
renderer. The renderer runtime change is −4 net non-comment `.js` lines against
`origin/master`; that small net change reflects substantial replacement of old
code rather than a simpler feature surface by itself.

The remaining cleanup opportunity is `SelectionDef` in
`selectionResources.js`: it carries several optional fields, and validation is
split among predicate parsing, channel validation, and resource collection.
Keep the current ownership model, but consider tightening that definition and
making the validation sequence easier to follow if this area changes again.

## WebGL implementation

- Retain one uniform or point-selection resource per parameter and interval
  component.
- Resolve each predicate leaf to explicit or inferred mark attributes.
- Derive interval uniform representation from the resolved target attribute and
  reuse the existing high-precision index/locus packing when needed.
- Generate occurrence-specific membership expressions so one parameter can be
  bound to different mark inputs in separate predicate leaves.
- Add a recursive GLSL predicate emitter for membership and activity leaves
  plus all/any/not nodes.
- Support both ordinary and high-precision index/locus membership in point and
  ranged hit-test modes.
- Treat a multidimensional interval as empty until all components are active,
  consistently with host and WebGPU evaluation.
- Pass emitted predicate expressions into conditional encoder generation rather
  than reconstructing checks from parameter names.
- Generate `isDatumSelected()` by OR-ing the active-match form of each complete
  appearance predicate root, and generate `isOrderMatch()` from the ordinary
  normalized order predicate.
- Preserve existing shader caching and retained uniform update behavior. A
  brush update must not compile a new program or upload mark data.

Keep this work inside the WebGL deletion boundary. Do not modify the semantic
Core tree to resemble WebGL checker functions or resource layouts.

## Compatibility and migration

- Existing `{ "param": "name" }` conditions remain valid; partially active
  multidimensional intervals now follow their `empty` policy.
- Existing structured singleton tests use the same rule.
- Existing `{ "param": { "or": [...] }, "empty": ... }` tests remain valid
  and retain their group-empty behavior; partially active multidimensional
  members now count as empty.
- Existing link conditions without `project` continue testing either endpoint.
- Existing serialized selection values and embedding APIs do not change.
- Existing numeric interval values remain logical Core data-domain numbers;
  WebGL and WebGPU pack index/locus bounds only at their backend boundary.
- Shared Vega-Lite predicate syntax retains Vega-Lite meaning. `project` is
  documented as a GenomeSpy-only use-site channel override, not as an
  alternative spelling for Vega-Lite selection-definition projection.
- This change neither resolves nor deepens existing differences in interval
  selection declaration semantics. A later compatibility proposal may add
  selection-side field projection independently.
- The WebGPU renderer public API may break because it is unpublished and has
  one consumer. Update its README, examples, and Core adapter together; do not
  carry a compatibility renderer overload.

## Dependencies and risks

- No external runtime dependency is required. The work depends on the existing
  parameter runtime, generated-schema pipeline, WebGL shader builder, and the
  unpublished WebGPU renderer API.
- The largest correctness risk is semantic drift between host, GLSL, and WGSL
  evaluation. Use one backend-neutral normalized Core tree and a shared truth
  table covering all four brush states, hover, per-leaf empty policies, `not`,
  and the flat-union shorthand; assert the same expected datum IDs in every
  backend.
- The flat union is easy to miscompile because group emptiness differs from
  ordinary Boolean `or`. Normalize it
  only through the documented membership-plus-activity expansion and retain
  focused equivalence regressions for that lowering.
- Recursive predicates increase generated shader source in proportion to the
  authored tree. Emit expressions directly without per-datum allocation, reject
  empty/mixed nodes at initialization, and include a representative nested
  predicate in shader and GPU tests. Do not add a hard nesting limit unless
  measurements show a real compiler or stack constraint.
- A retained WebGPU interval component has one comparison representation, while
  the same component may be referenced from several inputs. Core's exact
  GenomeSpy data-type validation and the renderer's representation invariant
  avoid implicit conversions; contextual initialization errors make conflicts
  explicit.
- High-precision index/locus comparisons must reuse established packing helpers
  and be tested at representation boundaries; converting through `f32` would be
  incorrect.
- Equal data types do not prove equal real-world units. The explicit `project`
  mapping asserts a shared logical domain; document that differing visual
  scales do not transform predicate values.
- JSON Schema can validate the recursive shape and projection syntax but cannot
  resolve a parameter's selection type or a mark's encoding. Keep those
  cross-reference checks in view initialization and test both validation layers.
- Pushed selections may be declared in siblings after the consuming mark in
  document order. Register capabilities while constructing the full view tree
  and run predicate validation only after that registration phase; never make
  correctness depend on child order or the first published selection value.
- Naming channel-derived state as a field in Core or the renderer would make a
  later selection-definition projection invasive. Use opaque component IDs at
  the backend boundary and keep current `x`/`y` channel knowledge in Core's
  selection adapter.
- Canvas2D and SVG share host-side encoders, so they need parity verification,
  not separate predicate compilers. Adding backend-specific logic there would
  be a warning that the Core contract is leaking.

## Alternatives considered

### Two filtered link layers

An unfiltered gray layer plus a foreground layer with sequential selection
filters can prototype the PISA behavior today. It duplicates rendering and
complicates opacity blending, picking, hover, and draw order, so it is not the
product design.

### Implement Vega-Lite field projection now

Adding selection-definition `fields` support would eventually be valuable, but
it is a substantially broader change: it must define selection tuples and
persistence, infer or validate interaction channels, resolve projected fields
in other views, and make unencoded predicate inputs available to both GPU
backends. None of that is required to improve conditional encodings for the
PISA interaction. Defer it to a separate compatibility plan while preserving
the component/input split described above.

Adding a use-site `fields: { "x": "target" }` shortcut is also rejected. It
would resemble selection filters while actually naming the tested mark's data,
and would blur the distinction between Vega-Lite selection-definition
projection and GenomeSpy's explicit mark-input override.

### Endpoint-specific link options

A link-only source/target selector would solve this example but would not
compose across marks, axes, or future ranged encodings. Predicate projection is
the reusable abstraction.

### Only add a flat intersection operator

`{ "param": { "and": [...] } }` would be small but cannot attach distinct
endpoint projections to individual leaves. It would also deepen divergence
from Vega-Lite's established logical predicate structure.

### Expose Core's grammar tree directly to WebGPU

Using `param`, `and`, `or`, and Core channel names in the renderer would couple
an independently usable low-level package to GenomeSpy grammar. The renderer
instead receives generic selection resources, input projections, and
all/any/not nodes.

## Provenance and license

The grammar shape is based on Vega-Lite 6.4.3's documented predicate
composition and `ParameterPredicate`:

- <https://vega.github.io/vega-lite/docs/predicate.html>
- <https://vega.github.io/vega-lite/docs/selection.html>
- <https://github.com/vega/vega-lite/blob/v6.4.3/src/predicate.ts>
- <https://github.com/vega/vega-lite/blob/v6.4.3/src/logical.ts>
- <https://github.com/vega/vega-lite/blob/v6.4.3/src/selection.ts>

Vega-Lite uses the BSD 3-Clause license:
<https://github.com/vega/vega-lite/blob/v6.4.3/LICENSE>.

This plan adopts compatible public JSON concepts (`and`, `or`, `not`, parameter
leaves, and `empty`) with the same supported-subset semantics, but does not copy
Vega-Lite implementation code. GenomeSpy's use-site `project` extension,
normalization, CPU evaluation, GLSL/WGSL emission, and renderer API remain
original. Document both the alignment and the extension boundary near the
public grammar types; a copied-code copyright notice is not required unless
implementation later closely adapts source.

## Milestone 1: Establish predicate and renderer contracts

### Intended outcome

The WebGPU renderer exposes a renderer-generic recursive Boolean contract and
separates retained interval components from occurrence-specific input
projections. Core's existing grammar and behavior continue to work through the
updated adapter; this milestone does not introduce the new Core grammar or an
intermediate normalized shape that other backends cannot consume.

### Work

- Add the generic `BooleanPredicate` tree around renderer selection-membership
  and activity leaves; add `not` alongside existing `all` and `any` support and
  remove the special `selectionUnion` node.
- Emit the renderer-generic `selectionActive` atom from retained selection
  state for channel, order, and visibility predicates, without adding a
  Core-owned activity slot.
- Split retained interval components from occurrence-specific input
  projections in renderer types, handles, resource discovery, validation, and
  WGSL generation.
- Retain a type-independent activity flag for every referenced interval
  component and allocate typed bounds only for components used by membership
  projections.
- Discover all projections before resource layout and enforce one low-level
  comparison representation per `(selection, component)` deterministically.
- Support ordinary and high-precision packed numeric bounds using existing
  renderer representation utilities, without exposing index/locus concepts in
  the renderer API.
- Make conditional channels, visibility, and order share recursive predicate
  validation, resource collection, and expression emission.
- Update Core's WebGPU adapter only as a compatibility bridge: existing leaves
  emit projections where `component` equals the current interval key, and flat
  unions lower to the generic membership-plus-activity tree. Preserve current
  implicit secondary-endpoint and group-empty behavior.
- Update renderer README/API examples and start the corresponding
  `MIGRATION_PLAN.md` entry.

### Affected areas and downstream consumers

- `packages/webgpu-renderer/src/index.d.ts`
- WebGPU predicate validation, selection resources, shader generation,
  conditional channels, order, README, and examples
- `packages/core/src/rendering/webgpu/webGpuMarkAdapter.js` and its focused
  compatibility tests

### Verification

- Renderer validation and unit tests cover nested all/any/not in conditions and
  order, empty arrays, mixed node variants, retained interval updates by
  component, repeated projections without duplicate state, deterministic
  representation conflicts, invalid inputs, and resource cleanup.
- Renderer tests use at least one component name unrelated to `x`, `y`, or a
  field name, proving that component identifiers are opaque backend keys.
- An activity-only interval test uses an opaque `range0` component, updates it
  between empty and active states, and verifies that no input projection or
  typed bound slot is required.
- Visibility tests distinguish activity from membership using an active point
  selection under `not`: nonselected rows active-match and selected rows do not.
- Flat-union lowering regressions cover empty and partially active two-dimensional
  intervals, all-empty groups, `empty: true` and `empty: false`, mixed point and
  interval selections, duplicate compatible names, and conflicting duplicate
  declarations.
- WebGPU GPU tests render logical conditions and order using two independent
  interval selections, including one selection projected to two inputs, while
  existing flat-union images remain unchanged.
- Packed-input tests cover membership and ranged hit tests at high-precision
  representation boundaries.
- Core adapter tests prove all existing singleton and flat-union cases retain
  their current output semantics before the new grammar is introduced.
- Commit the milestone, record renderer runtime and declaration SLOC against the
  implementation base, and run the automatic redesign/review loop if renderer
  runtime growth exceeds +200 net lines.
- Run `npm -w @genome-spy/webgpu-renderer run test:tsc`, renderer unit tests,
  renderer lint, focused GPU tests, and focused Core WebGPU adapter tests.

### Documentation and migration

Document the generic renderer contract without referring to GenomeSpy views or
grammar. Record the active API change in `MIGRATION_PLAN.md`; the public Core
grammar documentation is completed in Milestone 3.

Tentative commit: `refactor(webgpu-renderer): generalize selection predicates`

Review gate: confirm that the renderer has no Core vocabulary, that interval
component state and input projection have separate ownership, component IDs are
opaque, high-precision handling remains internal, one recursive emitter serves
all predicate consumers, and no compatibility-only union operator remains in
the renderer API.

## Milestone 2: Implement equivalent Core rendering behavior

### Intended outcome

Every Core backend evaluates logical selection predicates with use-site channel
projections identically for conditional appearance and conditional draw order.
The point semantic-threshold bypass uses active-match semantics, and link fading
continues to follow conditional-order second-pass behavior. Selection updates
remain retained and do not rebuild mark data.

### Work

- Add the public recursive grammar types and normalize parameter leaves,
  all/any/not nodes, explicit interval projections, and flat-union shorthands
  into one normalized Core tree containing membership and activity leaves.
- Add recursive dependency, activity, ordinary evaluation, and active-match
  helpers. Compile ordinary predicates into host-side datum functions used by
  CPU encoders; Canvas2D and SVG receive the behavior through those encoders.
- Register normalized structural selection capabilities against their local or
  pushed outer value slots, finalize component data types after scale
  resolution, and use the registry for validation without reading live values.
- Resolve explicit targets to unconditional field encodings and perform
  selection-type, component-coverage, same-axis, exact data-type, and
  target-kind validation at view initialization.
- Adapt Core's WebGPU translation to produce generic all/any/not nodes and
  interval projection descriptors, including the activity-based expansion of
  flat-union shorthands.
- Translate WebGPU point semantic-threshold visibility from the active-match
  form of complete appearance roots rather than a union of referenced names.
- Refactor WebGL selection resource discovery and emit recursive,
  projection-specific GLSL predicates.
- Replace WebGL's interval-selection high-precision TODO by reusing the existing
  index/locus attribute and packing representation.
- Drive WebGL conditional accessors and `isOrderMatch()` from ordinary
  predicate roots, and `isDatumSelected()` from active-match roots.
- Preserve the conditional-order single-pass optimization using recursively
  collected selection activity.
- Verify that hover picking and point selections compose with projected
  interval selections without changing unique-ID behavior.

### Affected areas and downstream consumers

- Core encoder construction and selection/order helpers
- `ViewParamRuntime` selection-capability registration, conflict validation,
  and lifecycle cleanup
- Grammar JSDoc, generated schema inputs, and runtime/view initialization
- Canvas2D and SVG through their shared host encoder path
- WebGL scale/conditional GLSL generation, mark selection resources, shader
  snapshots, batching, point semantic-threshold bypass, and link second-pass
  ordering/fading
- Core WebGPU mark adapter and retained selection synchronization
- Raster export, SVG export, normal rendering, and picking consumers

### Verification

- Schema tests cover structural rules: recursive nodes, nonempty arrays, exact
  node variants, and the `project` mapping shape. Runtime/view tests separately
  reject `project` on point selections, dimension mismatches, cross-axis
  mappings, missing encodings, and unsupported conditional or non-field targets.
- A schema regression verifies that `select.fields` remains unsupported in this
  feature, while existing interval `select.encodings` specifications continue
  to validate unchanged.
- Runtime tests reproduce the actual common-ancestor plain parameter, sibling
  link mark, and child `push: "outer"` selection arrangement before any value is
  seeded. They also reject conflicting selection kinds or declared components
  targeting the same value slot or incompatible pushed component types, and
  accept duplicate compatible declarations.
- Projection validation tests accept matching quantitative, index, and locus
  types; verify omitted `x2`/`y2` types inherit their primary type; and reject
  quantitative-to-index, index-to-locus, nominal, and ordinal projections before
  backend construction.
- Host encoder tests cover nested all/any/not, per-leaf empty policies, all four
  PISA interval states plus hover OR, repeated use of one selection with
  different projections, and exact flat-union lowering equivalence.
- Canvas2D and SVG/export tests verify endpoint-specific appearance and matching
  draw order through the shared host predicate compiler.
- WebGL shader tests assert the intended nested Boolean structure and ensure an
  explicit projection does not include the implicit secondary endpoint. A
  partially active two-dimensional interval verifies whole-selection empty
  handling and the separate activity test.
- WebGL and WebGPU tests exercise ordinary and high-precision index/locus inputs
  around representation boundaries. Host encoder and SVG tests use the same
  logical values to prove backend parity.
- WebGL rendering/order tests verify matching and nonmatching passes and
  unchanged picking.
- WebGL and WebGPU point tests verify that
  `predicateResult && anyReferencedSelectionActive` controls semantic-threshold
  bypass, including empty-true leaves and a partially active conjunction. Link
  tests separately verify that the order predicate still controls second-pass
  fading.
- Core WebGPU adapter tests verify `x` interval state is sent once while leaves
  target the renderer inputs corresponding to `x` and `x2` independently.
- Core WebGPU adapter tests verify that large index/locus projections retain
  logical numeric updates, select the renderer's packed representation, and no
  longer take the current scalar-only rejection path.
- Selection runtime tests verify that adding or changing a predicate's
  use-site `project` mapping does not change captured interval components,
  serialized values, persistence, or the `selection.intervals.x` update sent to
  either renderer. Existing unprojected link predicates retain their current
  implicit `x OR x2` behavior.
- Mutation tests or retained-handle spies verify brush movement updates only
  selection resources and requests rendering; it does not recreate pipelines,
  mark handles, or series buffers.
- Commit the milestone, record Core and renderer runtime and declaration SLOC
  against the implementation base, and run the automatic redesign/review loop
  if combined runtime growth exceeds +800 net lines.
- Run focused Core selection, encoder, WebGL, Canvas2D, SVG, and WebGPU adapter
  suites plus both Core and renderer TypeScript checks.

### Documentation and migration

Keep grammar documentation unpublished until WebGL and export parity is
verified. Update the WebGPU migration entry when the new renderer contract and
Core adapter are complete.

Tentative commit: `feat(core): compose endpoint selection predicates`

Review gate: inspect all downstream predicate consumers together, especially
point semantic-threshold bypass, conditional order/link fading, picking, and
export. Reject any backend that reconstructs semantics from a flattened
parameter list. Confirm that only Core's adapter knows the current components
originate from `x` and `y`; neither GPU backend performs field resolution.

## Milestone 3: Document and integrate the interaction

### Intended outcome

The grammar is documented with its empty-selection and compatibility semantics,
and a representative link example demonstrates independent endpoint brushes
across all supported rendering paths.

### Work

- Use the `write-genomespy-docs` workflow to document logical selection tests,
  interval `project`, empty-leaf behavior, direct shorthand, and the existing
  flat-union shorthand with group-empty semantics.
- Clearly separate portable Vega-Lite-shaped predicate syntax from the
  GenomeSpy-only use-site `project` extension, and state that
  selection-definition field projection is not part of this feature.
- Document the exact-type rule, supported quantitative/index/locus data, and
  raw-domain rather than screen-coordinate semantics.
- Add or update a compact public Core example with `x`/`x2` links, two pushed
  interval brushes, hover OR, color/opacity conditions, and conditional order.
- Regenerate and validate the versioned schema and type-link documentation.
- Update the private `fig2c-squid.json` prototype to use separate
  Accessibility and Contribution score brushes when that nested recipe work is
  in scope; otherwise validate an uncommitted local variant as the final real
  consumer.
- Finish the WebGPU migration entry and renderer-generic example or Storybook
  scene if the existing predicate scene does not demonstrate nested retained
  updates adequately.

### Affected areas and downstream consumers

- `docs/grammar/conditional-encoding.md` and generated grammar references
- Schema/type-link outputs and schema tests
- Core selection examples and snapshots
- WebGPU README/example or Storybook predicate scene
- The local BPREVEAL PISA recipe prototype

### Verification

- Validate the documented example against the generated schema.
- Exercise none, Accessibility only, Contribution only, both, hover outside the
  intervals, clearing either brush, resizing a brush, and shared-scale zoom.
- Confirm highlighted membership, color, opacity, foreground order, tooltip
  picking, and order-driven link fading agree under Canvas2D, WebGL, WebGPU,
  and SVG export.
- Run documentation example tests, schema generation checks, focused renderer
  unit/GPU suites, Core unit tests, workspace TypeScript checks, and lint.
- Run the WebGPU Storybook build if a renderer story changes.

### Documentation and migration

Explain that logical composition and per-leaf `empty` follow Vega-Lite, while
`project` is a GenomeSpy extension for binding retained selection components to
particular mark endpoints. Explain that this is distinct from Vega-Lite's
selection-definition field projection. Include the PISA-style endpoint
intersection as the motivating example without depending on private dataset
assets.

Tentative commit: `docs(core): document endpoint selection predicates`

## Final integration verification

- Run the public synthetic endpoint-brush example and the real
  `fig2c-squid.json` interaction with WebGL; run the synthetic equivalent with
  Canvas2D and WebGPU and export it to SVG.
- Verify all four brush states and hover composition against an explicit table
  of expected link IDs, not only pixels.
- Confirm that clearing one brush returns to the other brush's result and
  clearing both restores all links.
- Confirm a single interval selection can target two distinct inputs in one
  renderer mark without duplicate retained selection state.
- Run the same membership cases with quantitative, ordinary index/locus, and
  high-precision index/locus data in WebGL and WebGPU.
- Inspect generated GLSL and WGSL once to ensure predicates are shader-side and
  mark data are not filtered or rebuilt.
- Compare normal and picking passes, conditional-order passes, and order-driven
  link fading across backends.
- Run the full Core unit suite, renderer unit and GPU suites, workspace
  TypeScript checks, root lint, documentation/schema checks, and relevant
  example snapshots.

Final review gate: inspect grammar compatibility, the WebGPU public boundary,
all backend consumers, and the representative interaction together. The feature
is complete only when no backend reconstructs new logical predicates from a
flattened parameter list or retains an endpoint-ambiguous predicate path. The
flat-union shorthand must already be normalized to the generic tree before
reaching backend emitters.

## Acceptance criteria

- The PISA interaction can be authored with two track-local brushes and one
  link mark; no duplicate filtered link layers are required.
- Accessibility-only brushing emphasizes exactly links whose `x2`/target lies
  in the selected interval.
- Contribution-only brushing emphasizes exactly links whose `x`/source lies in
  the selected interval.
- With both active, emphasis is the intersection; with neither active, all
  links use their normal effect encoding.
- Hover composes as OR with the interval intersection and promotes the hovered
  link even when it lies outside the active intervals.
- Color, opacity, order, order-driven link fading, Canvas2D, SVG, WebGL, and
  WebGPU agree.
- Existing singleton and flat-union specifications remain valid. A partially
  active multidimensional interval is now empty, so specs relying on its
  one-axis membership behavior must declare a one-axis brush instead.
- The grammar uses Vega-Lite-shaped `and`, `or`, and `not`; the documented
  GenomeSpy extension is limited to use-site interval endpoint projection.
- A shared predicate that omits `project` has the same empty and Boolean meaning
  as the supported Vega-Lite form. Documentation does not imply that
  GenomeSpy's `project` extension is portable to Vega-Lite.
- The feature does not add selection `fields`, change current selection
  `encodings`, or introduce implicit cross-view field matching.
- Core requires projected components and targets to have the same effective
  interval-capable data type. Quantitative, index, and locus—including existing
  high-precision variants—work in CPU, WebGL, WebGPU, and SVG paths; nominal and
  ordinal projections fail during initialization.
- The WebGPU renderer API contains one generic Boolean tree with membership and
  activity leaves, named selection state, opaque component IDs, and renderer
  input projections. It contains no flat-union compatibility node or Core
  parameter, channel, field, encoding, mark, or view types.
- One selection can be projected to different inputs without duplicate state,
  and brush updates do not recreate pipelines or mark buffers.
- WebGPU exposes datum-independent selection activity explicitly, and active-
  match behavior remains correct for predicates containing `not`.
- An interval referenced only for activity requires no fabricated mark input or
  scalar bound type; it retains only per-component activity state.
- A sibling mark can validate and consume a child `push: "outer"` selection
  through the common value slot before the child publishes its first value.
- Invalid projections and unsupported renderer inputs fail at initialization
  with contextual errors.
- The renderer property is named `projections`, and the existing flat-union
  grammar is documented as concise shorthand for its activity-aware normalized
  Boolean expression.
- A future Core implementation of selection-definition field projection can
  change component metadata and default input resolution without changing the
  renderer predicate tree, retained-state API, or the meaning of existing
  logical predicates and explicit endpoint overrides.
- Production SLOC is measured after Milestones 1 and 2. Crossing a budget
  automatically triggers at most two sequential simplification, verification,
  and Sol-medium review rounds. Implementation continues without user
  intervention when tests pass and no medium-or-higher findings remain, even
  when the SLOC budget is still exceeded; unresolved substantial findings after
  the second round are reported instead of causing an unbounded loop.
