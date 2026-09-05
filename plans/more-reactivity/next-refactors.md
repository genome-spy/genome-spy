# Next refactors

Status: M1 implemented and verified, 2026-09-05. M2–M4 remain proposed.
See [direction and research](more-reactivity-plan.md) for rationale and contracts.

## Sequence and review boundaries

Implement M1 first. Review its producer/output contract and downstream behavior
before expanding the migration. M2 and M3 are independent follow-up slices once
their respective publication contracts are agreed; M3 need not wait for all of M2
if fixing the existing URL race is more urgent. M4 follows the successful contracts.
Do not combine all four into one large refactor.

Use nearest package AGENTS instructions before implementation. Use the view-test,
browser-debug and user-documentation skills when the corresponding work begins.
Tentative commit messages below follow the prepare-genomespy-change workflow.

## M1 — Grouped scale mapping as the first production consumer

- [x] Implement and verify one coherent mapping path.

Completed (2026-09-05): range configuration and all four mapping helpers now use
one native operation output, retaining effective resolution scope. Stable rebinding
validates cycles and reranks queued consumers. Mark resources and retained WebGL
textures consume completed mappings; public range commands retain a compatibility
bridge. The old range binding/listener helper and event-backed expression refs are
removed. Domain and assembly-configuration dependencies remain separate.

Verification includes the full unit suite (3,997 passing tests), all workspace
TypeScript checks and lint. New behavioral tests cover grouped band padding,
nested mixed-input updates, equality, rebinding, cycles, disposal, continuous
padding, scheme interpolation, public range commands, and immediate Canvas/SVG
geometry. Real browser animation checks observed 23–24 coherent mapping updates
per renderer and verified immediate SVG radius and datum picking on WebGL, WebGPU
and Canvas. The dedicated WebGPU harness and WebGL comparison both passed
viewport-autoscale, viewport-index ruler, and lazy BigWig examples. The generic
screenshot harness cannot initialize WebGPU with its software-renderer flags;
the dedicated harness uses the supported Metal launch configuration.

Size gate: changed production JavaScript totals 427 added / 246 removed lines
(net +181). This milestone does not reduce total code size: stable producer
rebinding, cycle validation, rank maintenance, and the public range-command bridge
outweigh the deleted coordination paths. The growth supplies the missing ordering
and lifetime contracts; the second grouped-property fixture needs no additional
scheduler, event channel, or disposal subsystem. Future migrations must reuse this
foundation and remove their old wiring.

**Outcome:** existing ExprRef range arrays consume settled values and publish one
coherent mapping. Band/index padding precedence is an internal fixture demonstrating that
another property group needs little additional wiring.

**Affected areas:** `packages/core/src/paramRuntime/{graphRuntime,types,paramRuntime,viewParamRuntime,expressionRef,paramUtils}.js`,
`scales/{scaleResolution,scaleInstanceManager}.js`, `utils/expression.js`, and
mapping consumers in marks, axes, legends, layout and renderer backends. Paths
after the first are under `packages/core/src/`.

**Implementation shape:**

1. Bind non-datum expressions using their existing explicit dependency refs and
   the existing effective resolution scope. Compile a configuration record from
   constants and bound values, with one owner and explicit equality. Preserve
   shared-scale owner lookup and existing single-member compatibility behavior;
   do not introduce per-property declaration scope. Do not eagerly convert formula,
   filter or `displace1d` datum evaluation into a computed value.
2. Introduce only the producer/output capability missing from the current runtime.
   The mapping operation consumes the complete configuration plus displayed domain,
   performs necessary validation, applies setters, and publishes its output before
   dependent helpers/observers run. Model its outgoing edge in rank/cycle analysis.
   Reuse GraphRuntime's queue and transaction machinery; do not add a scheduler or
   encode semantic ordering with unexplained numeric job priorities.
3. Expose a native final-mapping dependency. `range()`, `bandwidth()`, `scale()`
   and `invert()` derive from it; `domain()` keeps its existing native displayed-domain dependency. Use coarse
   mapping invalidation initially. Mapping must update when displayed domain changes
   even if configured range/padding is unchanged. `linearize()` performs assembly
   coordinate conversion, not final mapping; keep its dependency tied to resolution
   configuration rather than inventing a range dependency.
4. Replace `resolveRange`'s expression subscriptions and range listener registry.
   Route internal mapping changes through the owner rather than intercepted setters.
   Audit external scale mutation and retain only a necessary public compatibility
   bridge. A terminal effect may request rendering; it must not own a hidden
   dependency-producing configuration update.
5. Make initial application explicit: effects currently do not run at registration.
   Bind only once bootstrap inputs exist; retain supported domain-before-range
   initialization. Replace bindings as a coherent owned unit on shared-view changes.
   Ensure queued old work cannot publish after replacement or disposal.

**Verification and acceptance:** extend `graphRuntime.test.js`,
`viewParamRuntime.scopedExpression.test.js`, `scaleInstanceManager.test.js`,
`scaleResolution.expressionScope.test.js`, `scaleResolution.parameterDependency.test.js`
and the relevant lifecycle/topology tests. Verify behavior rather than helper shape:

- Width/height 10/10 → 20/30 in one nested transaction exposes only the final 600
  to a grouped consumer; diamond dependencies settle independently of creation order.
- Unchanged scalar/expression/configuration results suppress redundant application;
  arrays use the declared comparator. Initial configuration applies exactly once.
- Existing range expressions and internal padding precedence observe one complete
  configuration, using resolution-owner values even when child declarations shadow those names.
  Preserve existing single-member compatibility tests.
- A mapping consumer also depending directly on a changed source cannot observe a
  new source with old mapping. Repeat with intermediate computed chains and with
  binding replacement, covering range(), bandwidth(), scale() and invert(). This catches rank-zero output adapters masquerading as nodes.
- Domain-to-range and band/index domain-to-padding fixtures are valid; direct and
  indirect mapping feedback through bandwidth(), scale() and invert() fails clearly.
  Continuous padding remains domain-normalization policy: preserve its static
  behavior with a regression test and defer reactive continuous padding. Preserve lazy `displace1d` bootstrap.
- Animation frames, automatic domain transitions, interruption, external selection
  writes, and immediate rendering preserve displayed-domain calibration in-frame.
- CPU geometry, retained GPU mapping inputs, picking, SVG and Canvas2D exports
  agree on the settled configuration. Do not require unnecessary buffer uploads.
- Disposal/rebinding prevents late jobs and removes subscriptions. Errors reject
  propagation waiters without partial downstream publication or automatic retry.

Keep `data/reactiveReplay.test.js` in the regression run: mapping/parameter changes
must not undo shared-source replay coalescing. Use narrow suites during iteration.

**Deletion and size gate:** remove the migrated range listener/setup path and
event-backed helper dependencies. The generic `activateExprRefProps` helper remains
only for unmigrated consumers; do not claim it is deleted by migrating ranges.
Compare total changed production code, including any new runtime machinery, and
explain growth. A second internal property group should be configuration plus its
behavior, without a new event, scheduler flag or disposal subsystem.

**Documentation/migration:** update Core reactivity architecture for operation,
timing, scope and equality contracts. Update user-facing expression timing docs only
if observable behavior changes. No schema addition is necessary for internal padding.

**Tentative commit:** `refactor(core): apply reactive scale mapping as one graph operation`

**Review gate:** producer dependencies, cycle detection, topology replacement,
public scale compatibility and CPU/GPU/export consumers. Resolve this before M4.

## M2 — Declared side-input publication

See the [detailed M2 implementation plan](milestone-2.md) for publication
contracts, implementation slices, risks, and the verification matrix.

- [ ] Make lookup and cross use the same dependency/publication protocol.

**Outcome:** `dataDependencies` determines side-input invalidation, replay and
consumed-revision readiness, rather than merely describing readiness traversal.

**Affected areas:** `data/{flowNode,collector,dataReadiness}.js`,
`data/transforms/{lookup,cross,coordinateLookup}.js`, existing replay scheduling,
view readiness waiters, domain contributor readers and App availability consumers.

**Implementation shape:** retain stable optimized replay roots. On a declared
foreign revision change, invalidate transform-specific caches through a narrow
hook and enqueue the primary root once. On successful completion, record the exact
input revisions consumed before notifying downstream readers. Include empty output.
If input is pending, retain the current supported readiness/loading policy rather
than pretending completion consumed it. Let the protocol own and dispose observation;
keep keyed indexes, self-input buffers, coordinate coverage and Cartesian products local.

This extends the existing queue; it is not a base class that simply moves each
transform's old callbacks elsewhere. Do not put reactive nodes around individual rows.

**Verification:** lookup/cross/coordinate-lookup suites plus
`data/reactiveReplay.test.js`, `data/dataReadiness.test.js`, `view/dataReadiness.test.js`.
Cover foreign-first and primary-first arrival, simultaneous primary/side changes,
shared replay roots, unchanged revisions, ready-empty completion, lazy coverage,
inherited lookup versus overriding data branches, self-lookup and disposal.
Observers must never see readiness for a foreign revision not incorporated in output.
Exercise domain extents and App attribute availability after side-input replacement.

**Deletion and size gate:** both lookup and cross lose observer/replay and consumed
revision plumbing; account for new shared code when measuring the reduction.

**Documentation/migration:** update views/dataflow architecture and contributor
guidance on declaring dependencies. Preserve public transform behavior and schemas.

**Tentative commit:** `refactor(core): coordinate side-input publication through data dependencies`

**Review gate:** shared completion/readiness contract, optimized replay topology,
coordinate lookup and App consumers, not merely lookup/cross class size.

## M3 — Fresh asynchronous URL publication

- [ ] Give eager URL replacements explicit generations and guarded publication.

**Outcome:** an obsolete request cannot publish rows, reset newer output, alter its
status, or signal its completion. Synchronous propagation remains independent of
network readiness.

**Affected areas:** `data/sources/{urlSource,urlDescriptorController,urlDescriptor,dataSource}.js`,
source disposal, loading status, source tests and downstream availability waiters.
Audit lazy sources separately before extending the same policy to their caches.

**Implementation shape:**

1. Capture a complete request snapshot (URL descriptors, format and related inputs)
   after graph stabilization. Advance a source-owned generation when replacement
   inputs become authoritative, not only when the delayed fetch callback starts.
   This closes the gap in which an old response could beat a scheduled reload.
2. Best-effort abort superseded fetches. Keep generation validation after descriptor
   expansion, fetch, decompression and async parsing; abort is not the proof of
   freshness. Disposal invalidates the generation too.
3. Stage results per request and publish reset, file batches, rows, revision,
   status and completion in one guarded synchronous boundary. Preserve file batch
   identity, descriptor fields, optional missing files, format handling and limits.
   Do not let concurrent async parsers append into live downstream state.
4. Proposed policy: retain last completed output during replacement, explicitly
   distinguish pending/fresh output for availability, and apply current-request
   errors to status without fabricating fresh completion. Confirm this behavior
   against loading UI and existing error/limit tests before changing it.
5. Permit ordinary parameter-driven replay against retained old data while pending,
   but it cannot satisfy a request requiring the new source generation. New data
   uses current transform parameters when it commits. Cross-source atomic snapshot
   publication is not promised by a per-source generation.

**Verification:** controlled out-of-order requests A/B (including A → B → A),
supersession before fetch dispatch, old rejection after new success, pending async
parser, multi-file publication, disposal, ready-empty input, descriptor failures
and current-request errors. Verify stale work never changes downstream rows,
readiness or loading status. Test URL plus filter changes in one transaction.
Measure staged-result memory for a representative multi-file eager load.

**Deletion and size gate:** remove request paths that mutate live output before
freshness is established; avoid layered token checks spread across consumers.
Growth is justified by the concrete stale-publication race, not hypothetical recovery.

**Documentation/migration:** document pending-data presentation and distinguish
propagation barriers from data-availability waits. No universal async-ready promise.

**Tentative commit:** `fix(core): reject superseded URL loads before publication`

**Review gate:** async ownership, publication ordering, loading/error semantics,
memory and availability. Do not close #463 after M1 alone.

## M4 — Expand the successful contract to layout and rendering

- [ ] Propose and implement the next bounded layout/property consumer after M1.

**Outcome:** a representative step-sized view derives invalidation from explicit
domain/topology/size inputs and needs no constructor-specific listener registration.

**Affected areas:** `view/view.js`, view creation and size caches, layout scheduling,
App `SampleGroupView`, axis measurement, render/picking/export boundaries.

Keep full arrangement and existing LayoutResult. Separate intrinsic size demand
from allocated viewport size; do not model their negotiation as an unrestricted
computed cycle. Retain established canvas-size settling and axis measurement policy.
Use the same settled boundary for backend consumption, not a new render scheduler.

**Verification:** dynamic category counts, hidden-to-visible initialization,
subtree insertion/disposal, nested concat/grid sizing, App sample grouping,
resize/axis measurement and immediate export. Use structured layout/view tests and
browser smoke tests; compare all active backends. Require deletion of replaced
step-listener registration and ancestor invalidation plumbing for the selected path.

**Documentation/migration:** update layout architecture and direct-view construction
guidance; preserve public sizing semantics.

**Tentative commit:** `refactor(core): derive step-size invalidation from reactive inputs`

**Review gate:** layout feedback and final cross-subsystem integration. Detailed API
design is intentionally deferred until M1 demonstrates a smaller reusable contract.

## Final integration verification and measurement

Before delivering a cross-subsystem implementation, run focused regression suites,
workspace TypeScript checks and lint; run the full unit suite for the combined
runtime/dataflow integration. Browser checks must include actual animation frames,
not only a final awaited state. Representative real examples:

- `examples/docs/grammar/scale/viewport-autoscale.json`: pan/zoom and reset;
  pair with an expression-calibrated dependent scale fixture and verify each frame.
- `examples/docs/grammar/transform/cross/cross-heatmap.json`: replace foreign input,
  including empty data, and inspect resulting domains and geometry.
- `examples/core/lazy-data/bigwig.json` and `bigbed.json`: rapid viewport changes,
  navigation during loading, hidden tracks and disposal. Existing lazy protections
  must survive even before adopting any new resource protocol.
- App sample grouping, metadata-derived scale reconfiguration, attribute availability,
  undo/redo and bookmark restoration: verify the Core boundary preserves provenance.
- Render a grouped scale fixture through active GPU backends and Canvas2D/SVG,
  inspect picking and immediate exports during animation and after replacement.

Record backend availability and any blocked external data access; do not substitute
a unit-test claim for an unrun browser or GPU check.

Source-inspection baseline at the proposal commit (whole files, including comments):

| File under `packages/core/src/`  | Lines |
| -------------------------------- | ----: |
| `paramRuntime/graphRuntime.js`   |   765 |
| `paramRuntime/paramUtils.js`     |   352 |
| `paramRuntime/expressionRef.js`  |   100 |
| `scales/scaleInstanceManager.js` |   399 |
| `data/transforms/lookup.js`      |   513 |
| `data/transforms/cross.js`       |   185 |
| `data/sources/urlSource.js`      |   309 |
| Total                            |  2623 |

At each milestone use `wc -l` and `git diff --stat` for all affected production
files, including new helpers. Also count grouped applications, replay roots,
downstream notifications and GPU uploads in representative scenarios. These
measurements belong to the milestone; they are not separate implementation steps.

Before a PR, reconcile unfinished tasks as completed or explicitly discarded and
commit that record; delete these temporary plan files in a later commit. Preserve
settled architecture decisions in the relevant permanent architecture documents.
