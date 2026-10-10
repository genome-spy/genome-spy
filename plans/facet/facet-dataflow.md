# Facet transform execution investigation

Date: 2026-10-10. Implementation of the static batch approach is authorized.
The investigation below records the baseline; progress is tracked at the end.

## Conclusion and scope

GenomeSpy can execute ordinary child transforms independently per facet using
one static dataflow graph. Its existing facet batches already express the
required partition identity. Dynamic per-facet operator branches are not
necessary for aggregate, stack, window, sampling, or ordinary row transforms.

The missing work is more than moving a collector: establish partitions before
child transforms, preserve their identity through collectors, and make every
supported stateful transform honor the partition. Arbitrary per-cell parameter
scopes, independent scale runtimes, and incremental tuple updates are separate
problems. This proposal does not introduce those capabilities.

Prefer extending this existing execution model over introducing a second
transform engine or copying Vega's dynamic subflow machinery. Treat Vega-Lite
as a source of reference behavior and optimization ideas, with explicit
decisions for the compiler-sensitive cases described below.

## Reference implementations

Sources inspected in the local checkouts:

- Vega: `tmp/vega`, commit `c03b7d0fe369be1a6e81d23dc899aef6eb7da967`.
- Vega-Lite: `tmp/vega-lite`, commit `f0e76dfc7efa720817249f612f66599e2ca5ead4`.

Both reference projects use BSD-3-Clause, compatible with GenomeSpy's MIT
license provided their notices and conditions are retained for any copied or
closely adapted code. This investigation copies no implementation code; source
links identify the designs being compared.

Vega's [Facet operator](https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-transforms/src/Facet.js)
creates a subflow on demand for each key, routes add/remove/modify pulses to
active subflows, and disposes empty ones. The parser supplies a compiled
subscope, including a `parent` signal. This supports local operator and signal
state and selective incremental updates; it is considerably more machinery
than GenomeSpy's full-stream replay model needs.

Vega-Lite does not always leave transforms inside those runtime subflows. Its
[moveFacetDown/cloneSubtree optimizer](https://github.com/vega/vega-lite/blob/f0e76dfc7efa720817249f612f66599e2ca5ead4/src/compile/data/subtree.ts)
moves transforms ahead of a facet boundary, adding facet dimensions to
aggregate, stack, window, and joinaggregate grouping. At forks, it also copies
transforms to a parent-level path used for scale domains. GenomeSpy's shared
scales already read all terminal collector batches, so that scale-only copied
path should not be needed for the current shared-scale scope.

Local compilation probes confirmed implicit `groupby: ["g"]` on aggregate,
stack, window, and an aggregate-to-stack chain. Thus adding facet fields to
grouping is a proven alternative for these operators, not just a workaround.

However, literal Vega-Lite output is not uniformly "partition first, then run
every child transform": in this checkout a simple unit child's `sample: 1` is
hoisted before faceting and samples globally. A child calculation overwriting
`g` is also hoisted, and a child filter can remove a facet from the domain.
With a layered fork, the compiled cell retains local transforms and the facet
domain comes from the input before that fork. The sampled layer also has a
global scale-domain copy. Do not promise exact equivalence across these cases
without choosing and testing the intended semantics.

## Existing GenomeSpy mechanisms and executable probes

`packages/core/src/types/flowBatch.d.ts` distinguishes facet batches from file
batches. A facet batch has an identity independent of row fields and requires
all rows of that facet to be contiguous. `Collector.#propagateToChildren()`
already emits these boundaries, including empty stored facets, and collector
replay resends them. Graph topology does not depend on the number of batches.

The builder currently adds `groupby: view.getFacetFields()` only to the terminal
unit collector, after child transforms. The following isolated probes used
real existing collectors and transforms with A = [1, 3], B = [10, 20], and a
grouped collector inserted before the transforms:

| Pipeline                                                         | Observed result                                                         |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Grouped collector → aggregate → plain collector                  | Correct A mean 2, B mean 15, despite aggregate output containing no `g` |
| Grouped collector → window → plain collector                     | `row_number` restarts at 1 in each facet                                |
| Grouped collector → project only `v` → plain collector           | Correct facet identity survives dropping `g`                            |
| Grouped collector → stack → plain collector                      | All rows emitted under B; stack continues across A and B                |
| Grouped collector → sample → plain collector                     | All retained rows emitted under B; reservoir spans both facets          |
| Grouped collector → aggregate → stack → plain collector          | Means 2 and 15 stack globally as [0, 2] and [2, 17], both under B       |
| Grouped collector → aggregate → current terminal grouping by `g` | Fails because the aggregate output has no `g`                           |

The sample probe used a reservoir larger than the input, making the batch
mislabeling deterministic. These are temporary probes, not permanent tests or
changes to the builder. The existing aggregate, window, set-intersection, and
displace2d suites also pass: 72 tests across four files. That confirms the
existing supported batch behavior, not end-to-end facet correctness.

The relevant implementation patterns are:

- Aggregate, window, and set-intersection flush before forwarding the next
  boundary. Coverage also flushes at boundaries; its state needs an explicit
  audit before relying on it for general partition execution.
- Stack and sample retain state until whole-stream completion while forwarding
  boundaries immediately. This both mixes computation and mislabels output.
- Pileup resets its algorithm on whole-flow reset, not on facet boundaries.
- Displace2d already demonstrates the other valid pattern: retain rows with
  boundary offsets, compute facets independently, then replay boundaries with
  their output. File boundaries do not split its collision groups.
- Displace1d and filterScoredLabels buffer or replay data without comparable
  partition handling. Scale-dependent and animated transforms need explicit
  audits; changing their first publication alone is insufficient.
- Identifier state must span the whole publication. Resetting it separately
  for A and B was probed and assigns duplicate picking IDs.

## Recommended static partition execution

```text
source → outer facet transforms → partition collector
                                      ├→ child/layer transforms → collector → mark
                                      └→ other layer transforms → collector → mark
```

The branches above are the existing specification-defined layer branches;
their count stays constant as facet membership changes.

1. Establish the partition boundary after transforms declared on the facet
   specification and before transforms declared inside its child. Reuse a
   grouped collector initially. Do not create a view, runtime, or transform
   chain for each key, or implement the unused `data/facetNode.js` subflow stub.
2. Carry the facet tuple as batch metadata through the entire child flow.
   Terminal collectors retain that identity instead of regrouping by fields
   that may have been removed or changed. Explicit user `collect.groupby` is
   initially rejected until it can preserve the ambient partition separately.
3. A buffering transform must either flush the old facet before forwarding the
   next facet boundary, or retain the boundary metadata and emit it with the
   corresponding output later. Its `groupby` subdivides the ambient facet.
   Stateful streaming transforms reset only their partition-local state.
4. Whole-stream `reset()` and `complete()` keep their existing publication and
   observation meanings. Never call recursive reset/complete per facet: that
   clears downstream collectors, reuses picking IDs, and publishes partial
   shared scale domains. Keep expression snapshot refresh after flushing the
   preceding facet under its old context. App's `mergeFacets` relies on this
   order when setting the per-group sample count.
5. Full replay remains the initial update model. A partition collector is
   already a replay source; parameter invalidations can replay its batches in
   the existing transaction and scheduler. Preserve side-input prerequisites
   and consumed revisions rather than adding a facet-specific scheduler.

This adds an upstream array of row references and grouping work, not one graph
per facet. Sequential flushing can reduce transform working buffers from all
rows to the largest facet. Terminal output, grouping, and any retained animation
state still consume memory; benchmark rather than assuming a net memory win.
Retain the current clone-protection behavior after materialized collectors.

Prefer transform-specific changes with the established aggregate/window
pattern first. Introduce a shared flushing helper only if it removes actual
duplication; avoid a new operator hierarchy or automatic reset policy.

## Selected execution contract

- The facet's input collector owns membership after outer transforms. Child
  filters preserve empty input facets, consistently for unit and layered views.
- Child transforms operate on one logical facet at a time. Their ordinary row
  semantics are retained: aggregate/project need not retain the facet fields,
  and overwriting such a field does not change batch identity. Empty ungrouped
  aggregates produce a result, including count zero, inside an existing facet.
- Child-owned data starts a separate ungrouped branch and is repeated in every
  cell. Foreign join data also retains its declared data scope.
- Physical file/shape boundaries survive materialization and replay. They reset
  shape specialization, but do not split a logical facet's reduction. Buffered
  row-preserving transforms retain these boundaries until output publication.
- Explicit `collect.groupby` inside an explicit facet is initially rejected:
  it would repartition the ambient facet identity. Ordinary collection and
  sorting remain supported. Existing App sample grouping is unchanged.
- Existing full-flow reset/completion, picking IDs, observer transactions,
  foreign dependencies, and sample-count expression timing remain authoritative.
- Scale-dependent transforms that have not been made partition-correct fail
  clearly under facets rather than mixing their state. Broader local parameter
  scopes and cell interactions remain outside this dataflow implementation.

## Shared contract risks and downstream checks

- **Files versus facets:** logical partitions can contain several physical
  files. Current grouping discards file boundaries. A probe with `{g, v}` in
  one file and `{g, v, extra}` in another, followed by grouping and cloning,
  silently dropped `extra` from the latter row. Preserve shape/file segments
  within partitions or normalize to a common schema before grouping. Logical
  reductions must not accidentally restart at each physical segment. Aggregate
  and window currently flush on every batch type, so forwarding file metadata
  alone does not solve this. Cover collector replay as well as initial load.
- **Facet membership and empty groups:** decide whether child filters retain
  empty input facets or remove them, including layer-specific filters and
  matrix holes. Retaining empty batch keys is feasible and gives stable input
  membership, but differs from some simple-unit Vega-Lite compiled output.
  Define aggregate/count output on an explicitly empty partition too.
- **Facet fields in output:** metadata can preserve a facet even after project
  or aggregate drops its grouping fields. It does not automatically restore
  those fields for downstream formulas. Decide whether aggregate should
  preserve implicit facet fields to match Vega-Lite's grouping rewrite, or
  follow ordinary local-transform row semantics. Rewriting a grouping field
  after the boundary should not silently change a frozen partition identity.
- **Overridden data:** Vega-Lite treats a child with its own data as unfaceted,
  and repeats that data in each outer cell. GenomeSpy's immediate and WebGL
  render paths already support repeating ungrouped mark data. The builder must
  track data scope explicitly; `getFacetFields()` follows layout ancestry and
  also serves App's sample encoding, so it cannot alone determine execution
  scope. Shared source optimization must preserve these distinct branches.
- **Joins:** a primary facet can query one shared foreign relation without
  partitioning that relation. Existing self-lookup is batch-local. Preserve
  that distinction and foreign readiness/replay; do not silently facet side
  datasets by layout ancestry.
- **App sample flows:** avoid applying new explicit-facet execution scope to
  every existing sample encoding. App's mergeFacets creates its own group
  batches and intentionally suppresses upstream boundaries. Verify its summary
  transforms and sample-count expressions when changing shared batch contracts.
- **Retained state:** animated label placement and future facet-local parameter
  state may need maps keyed by facet identity. They do not require cloned
  FlowNodes, but ordinary partition flushing does not isolate that state by
  itself. Unsupported cases should fail clearly until their contracts are met.

## Alternatives

| Approach                                                   | Benefits                                                                                                                        | Limitations and recommendation                                                                                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add facet fields to child aggregate/stack/window grouping  | Smallest targeted fix; follows Vega-Lite's existing rewrite; preserves grouping fields; avoids another materialization boundary | Requires data-scope tracking; does not isolate sample, pileup, or arbitrary state; fails when earlier transforms drop facet fields. Viable bounded first step if these limits are explicit, or a later optimization. |
| Static graph with contiguous facet batches                 | Reuses collectors, replay, rendering, and existing transforms; supports field-dropping transforms and per-facet sampling        | Needs a consistent lifecycle and file/shape handling. Preferred foundation.                                                                                                                                          |
| Static graph with a state map per transform keyed by facet | Can accept interleaved facets and retain local state without cloning nodes                                                      | Every stateful transform needs state selection, cleanup, and correctly labeled publication; more state and dispatch. Use selectively for retained state, not as the default.                                         |
| Reuse one transform chain by reset/complete for each facet | Appears to reuse existing algorithms unchanged                                                                                  | Current lifecycle recursively clears/publishes descendants and resets global IDs. Making a wrapper safe requires a second lifecycle. Reject this shortcut.                                                           |
| Per-facet transform chains sharing one view/mark subtree   | Strong operator isolation and familiar Vega semantics                                                                           | Operator graph and subscriptions still grow with facet count; dynamic membership needs branch lifecycle. Does not satisfy the preference to avoid dynamic dataflow branches.                                         |
| Partitioned columnar/table evaluator                       | Natural long-term segmented execution; avoids row-field facet tags                                                              | A broad dataflow migration. Keep batch identity compatible with that direction, but do not build a parallel engine just for this feature.                                                                            |

## Optimizer compatibility and code TODOs

Facet partitioning is a semantic boundary, not an accident of graph order.
Record focused optimization TODOs at the applicable builder, collector, and
optimizer code, without implementing an optimizer in this change:

- Share or fuse redundant materializations only when facet identity, empty
  membership, physical shape boundaries, and replay ownership are preserved.
- Hoist row-local transforms only when field dependencies, parameter scope,
  input membership, and row order make the move equivalent.
- Rewrite grouped aggregate/stack/window execution ahead of partitioning only
  when adding facet dimensions preserves output fields and all downstream uses.
- Optimize file provenance storage/replay if profiling warrants it; preserve
  shape transitions even when grouping or sorting reorders rows.

## Implementation milestones and verification

Progress: physical file-shape preservation is implemented in collectors and
shared buffered-publication helpers. Grouping/sorting/replay and reactive replay
regressions pass (45 tests). Single-file inputs use constant provenance;
multi-file inputs currently use row identity, with a focused optimization TODO.
Stack, sample, and pileup now restart at facet boundaries. Aggregate, window,
coverage, set intersection, and self lookup distinguish logical facets from
physical files; a mixed lookup → window → aggregate regression verifies forward
references, preserved row shapes, and independent results. Existing empty facets
can aggregate to count zero. Focused transform checks and Core type checks pass.

1. [x] **Establish the static partition contract.** Update flow building, collector
       preservation, and data-scope handling. Verify spec-to-collector aggregate,
       window, project, tuple facets, layered children, outer transform scope,
       overridden data, empty partitions, and heterogeneous file shapes. Resolve
       the observable compatibility decisions above before exposing behavior.
       Tentative commit: `fix(core): establish facet partitions before child transforms`.
2. [x] **Complete stateful transform support.** Adapt stack, sample, and pileup;
       audit coverage, self lookup, and retained placement transforms. Use mixed
       pipelines such as aggregate → stack and filter → window, and verify IDs
       remain unique. Preserve App mergeFacets and sample-count behavior. Document
       any still-unsupported transforms with explicit errors.
       Tentative commit: `fix(core): isolate stateful transforms within facet batches`.
3. [ ] **Verify updates and rendering across the shared contracts.** Exercise
       parameter replay, foreign-data changes, factor additions/removals, lazy
       multi-file input, shared domains and legends, and collector disposal. Check
       WebGL, Canvas, and SVG with transformed variants of the Anscombe/cars
       examples plus one sample-summary flow. Assert graph node count is unchanged
       between two and many facets. Measure grouping/replay cost and relevant SLOC;
       update user docs and the existing feature Changeset when behavior ships.
       Tentative commit: `test(core): cover facet transform replay and rendering`.

The builder now inserts one grouped input collector per facet specification.
Terminal collectors preserve batch identity. FacetView observes that input
collector directly, removing the child-collector union and preserving empty
cells. Spec-level tests cover tuple/layered pipelines, outer transforms, field
edits, overridden data, parameter replay, foreign updates, heterogeneous files,
global identifiers, constant graph size for 2 versus 50 facets, and disposal.
Unaudited placement transforms and explicit collect grouping reject inherited
facet data. Focused builder/layout/replay/App mergeFacets checks pass (75 tests).

Review the shared batch/collector contract before proceeding to broader
stateful support, then review final cross-subsystem integration. Commit the plan
first, and commit independently meaningful fixes separately during implementation.
