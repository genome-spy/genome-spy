# Milestone 3: integrate the domain lifecycle

Status: slices A–C complete and reviewed. Integration evidence and measured
tradeoffs are recorded below.
The main plan's [milestones 5–7](scale-domain-lifecycle-plan.md#5-establish-coherent-synchronous-reactive-updates)
continue the simplification using the existing reactive runtime. This document
records the completed baseline; its completion is not the branch's merge gate.
The follow-on target restores `ScaleResolution` to participant/configuration
resolution and binding lifecycle. The owner placement and synchronous callback
protocol described here record the implemented baseline, not constraints on the
next design. Preserve their tested behavior while replacing manual coordination
with the shared reactive contract; moving these methods into helpers is not the
simplification criterion.
This refines [milestone 3](scale-domain-lifecycle-plan.md#3-integrate-one-domain-owner-and-remove-the-old-lifecycle).
The provisional model is a starting point, not a compatibility specification.
Revise it when a real caller exposes a missing distinction or needless state.

Subagent review on 2026-09-05 found the plan feasible and appropriately bounded.
The two requested corrections are incorporated below: separate initial-readiness
inputs from viewport eligibility, and preserve pending effects across benign
reentrant updates. No other material plan issue was identified.

## Outcome and fixed UX requirements

One domain owner per `ScaleResolution` decides updates before live mutation.
Dataflow reports relevant readiness independently of domain values. Remove the
old domain-finalization, write/restore, and transition-ownership paths as their
replacements become active.

**Automatic domain animations are required UX and will be preserved.** This
includes viewport autoscaling and eligible data/configuration/membership changes
on non-zoomable continuous scales after rendering. Keep current default timing:
150 ms viewport debounce and approximately 500 ms automatic transitions, with
the existing easing/interpolation. Preserve public `zoomTo` duration options,
including the existing 700 ms boolean default. Do not restrict animations to
viewport updates or substitute abrupt domain changes to simplify integration.

Preserve immediate partial/final initial updates, immediate selection-driven
updates, the default absence of a second animation for expression-derived
domains, and immediate structural index/discrete updates. Index scales still
support explicit animated navigation. Calibrated scales must follow every
effective frame before rendering. Preserve cancellation and navigation promises.

Public grammar, named scale APIs, selection persistence/bookmarks, index/locus
coordinate conventions, range/axis behavior, and categorical ordering remain
compatible. Pixel ranges, domain-only sharing, a new scheduler, a generalized
source-provider hierarchy, and a data-query rewrite remain out of scope.

## 1. Relevant-input readiness

### Dependency identity and traversal

Introduce the smallest internal dependency description needed on actual
side-input transforms. A lookup/cross node exposes its foreign collector(s),
and the fact that its completed output incorporated those inputs. Prefer one
shared upstream traversal from an output collector over separate domain,
viewport, and App implementations.

`FlowNode.parent` identifies the primary path and canonical source after flow
optimization. Follow side edges only on transforms encountered on that path.
Keep `flowHandle.auxiliaryCollectors` as the ownership/disposal inventory, not
the readiness graph. This matters in the existing Dynseq example: the actual
track inherits a container's coordinate lookup, but its baseline sibling has
its own inline data and must not wait for that lookup.

The traversal must deduplicate source/collector identities, survive optimizer
source sharing, and terminate at actual source boundaries. Respect current
rejection of nested side-input specifications; do not broaden that grammar.
No dependency scanning or receipt allocation belongs in per-datum hot paths.

Targets: `data/flowNode.js`, `view/flowBuilder.js`,
`data/transforms/lookup.js`, `coordinateLookup.js`, `cross.js`, and
`view/dataReadiness.js` (all under `packages/core/src/`).

### Readiness facts, not a second loading state machine

Provide two queries using the same dependency enumeration:

1. **Initial contribution ready:** output is completed from a meaningful primary
   publication, and required side inputs have been incorporated. A completed
   empty or filtered-out result is ready. A dummy lazy startup completion,
   failed/unavailable input, or output produced while a lookup was unavailable
   is pending.
2. **Current viewport ready:** the output is current and every relevant lazy
   source additionally reports coverage for the member's requested interval.
   Use the source's polymorphic `isDataReadyForDomain(request)` so descriptor
   availability and source-specific rules remain intact.

Do not equate these queries. Navigation changes current coverage without
reopening completed initialization. For initial publication, use existing
source publication/descriptor state where possible; add an explicit publication
fact only where existing state cannot distinguish startup from a real batch.
Do not reduce source readiness to `getLoadedDomain()` alone. For example,
AxisGenomeSource and descriptor-backed BigWig/BigBed/Tabix sources differ.

Resolve the prototype's overloaded `readiness` input during integration: its
source-snapshot readiness means **initial contribution readiness only**. Keep
current viewport coverage gating in the existing viewport evaluator, which
submits no display candidate until coverage is satisfied. Remove the prototype's
use of initial readiness as a viewport coverage test. Progress snapshots can
still update reference/extent/readiness without a viewport candidate. Test that
initial reference finalization and current viewport waiting are independent;
neither fact can substitute for the other.

The scale owner filters relevant contributions before requesting readiness:
constant and `domainInert` accessors do not require field data; configured-domain
contributions can be available before data. A separate data-extent request can
still depend on that data. Hidden/uninitialized members follow current active
membership rules. Before initial completion, active membership can change the
required set; afterward it cannot reopen the domain owner's initial phase.

### Proof that side data reached the output

Current `Collector.complete()` increments `dataRevision` and invalidates domain
subscriptions before ordinary observers run. The lookup's replay listener is
an ordinary observer. Consequently, fresh foreign data plus an old completed
primary collector is not sufficient proof of ready output.

Track a consumed foreign revision on the transform, tied to a completed primary
evaluation. Mark it only when the output was processed with the relevant foreign
input available; invalidate it on reset or a skipped/pending lookup batch. Expose
the receipt before downstream completion can notify scale subscribers. Reject
readiness when a dependency has a newer revision than the consumed receipt.

Handle empty primary batches explicitly: no `handle()` call may occur. Also
handle `Collector.repropagate()`, which can replay without `beginBatch()`.
Do not introduce a receipt stamped exclusively in either method. Preserve
existing lookup replay/index behavior; receipts describe it, not schedule it.

Reuse output collector completion/domain invalidation subscriptions, which
already run for empty and numerically unchanged results. Shared wait helpers
must observe required side collectors and output replay as appropriate, and
evaluate the complete readiness predicate before resolving. A side arrival must
not resolve a wait before its primary output is recomputed. Dispose listeners
with their owning view/flow node; failed initialization must leave no listeners.

## 2. Ownership and source snapshots

Keep authoritative `DomainState` and one commit method directly in
`ScaleResolution`, which already owns bindings and notifications. It owns
transition identity/cancellation, update planning, commit ordering, and selection
synchronization origin. Do not add a callback-heavy `DomainResolution`
coordinator around those existing responsibilities. Keep scale properties, member
topology, physical scale creation/range, categorical indexing, and assembly
lookup in their existing appropriate components.

Keep aggregation and normalization separate from lifecycle decisions:

- `DomainPlanner` calculates candidates, fallback/reset inputs, and data unions.
  Remove its `initialDomainSnapshot` and `captureInitialDomain` responsibilities.
- Reuse `configureDomain()` and domain/index/locus conversion helpers. Full
  property reconfiguration must calculate its candidate using the new resolved
  properties on a working scale; it must not first change the live domain.
- Expose the existing property/domain/range configuration phases as needed.
  Apply generic properties to the working copy before candidate normalization;
  configure live ranges/bins using the decided display's cardinality. Deleting
  domain properties to simulate a domain-free `configureScale()` is insufficient.
- The lifecycle policy receives normalized internal domains. Public interaction
  bounds are converted once; selection and animation bounds are already internal.
- Source snapshots keep reset target, initial reference, and loaded data extent
  distinct. Do not rescan data on every animation frame; frames/reset/navigation
  use owner state. Reuse collector caches and avoid materializing duplicate unions.

The owner exists before expressions need a domain, independently of data-ready
state. Preserve the #505 initialization ordering: pending parameter declarations
precede expression binding, domain reads work before range binding, dependency
cycles fail explicitly, and failed initialization remains retryable.
Seed owner display after physical domain creation/genome binding and before
range-expression binding; roll back that seed if initialization fails.

`ScaleResolution.getDomain()` returns a fresh snapshot of the committed display.
The physical scale mirrors that display; neither is an independently writable
second authority. Preserve the public meaning of `isDomainInitialized()` as
effective-domain availability; do not equate it with all contributors being ready.

### Replacement ledger

| Existing responsibility                                                           | Replacement / deletion                                                                                                             |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ScaleResolution.#initialDomainFinalized` and initial-data/interaction finalizers | Owner lifecycle phase plus relevant readiness; remove all three old paths.                                                         |
| `DomainPlanner.#initialDomain` / `captureInitialDomain`                           | Owner initial reference; keep aggregation functions.                                                                               |
| `#computeScaleState` / `#applyReconfigure` / `#finalizeReconfigure`               | Normalized snapshot, plan, commit; delete write-then-restore and policy-specific manual notifications.                             |
| `ScaleInteractionController.getDomainChangeAction`                                | Policy result; remove old restore/animate/notify classification.                                                                   |
| Controller-owned transition token and direct domain setters                       | Owner transition identity and one animation executor; retain existing math/options validation.                                     |
| Scattered reverse-sync suppression and domain interceptors                        | Owner-origin classification and one mirror/notification boundary; retain only guards demonstrated necessary for reentrant commits. |
| Selection `initial` bypass and source fallback                                    | Consolidate in one linked-source binding owned with the domain lifecycle; do not duplicate it in both resolver and owner.          |
| Viewport debounce/query/cache                                                     | Preserve source-specific behavior; submit reasoned domain updates.                                                                 |

## 3. Reasons, provenance, and a single commit path

Use [the caller mapping](policy-integration.md#mapping-real-callers), with these
integration-specific constraints:

- Ordinary data and topology refreshes use `data`/`membership`. A changed range
  or unrelated property does not grant authored-domain override authority.
- Domain expression changes and actual authored-domain replacement use
  `configuration`. Characterize domain-affecting property edits (`nice`, bounds,
  zero) separately from range-only changes; evaluate all with their final props.
  Pin the legacy zoomable ExprRef case with `domainTransition: true`: it currently
  preserves the display, while default immediate ExprRef updates follow their
  expression. The prototype's blanket configuration authority must be revised
  rather than silently changing this behavior during integration.
- External brush/parameter writes use `selection`, even when equal to the current
  displayed fallback. Owner-origin writes use `selection-sync`; equality alone
  never determines origin.
- Viewport changes keep debounce and current-coverage gating. Passive refresh of
  a linked interval must not stop a running navigation animation.
- Pointer navigation, bookmark/API `zoomTo`, reset, and each animation frame
  submit updates rather than writing a scale. Preserve `renderImmediately`
  validation and ordering for zero-duration cross-instance synchronization.
- Migrate separator-view domain writes. Audit remaining `.domain(value)` calls;
  distinguish local scale copies from shared live instances. If an exposed live
  setter must remain compatible, route it through an explicit owner update with
  a private mirror setter, never through recursive interception.

### Selection origin without a parameter-runtime rewrite

Current writable refs notify direct subscribers synchronously in
`graphRuntime.createWritable`; `ViewParamRuntime` forwards the selection object.
Test that contract with `push: "outer"` and nested parameter transactions.

Prefer an owner-local identity marker for the exact selection object being
published, scoped around `setValue` and cleared in `finally`. A nested external
write with a different object remains external. Compare normalized intervals
before publishing so equal values create no echo. Do not tag persisted selection
objects or infer origin merely from a suppression-depth flag. If synchronous
identity transport cannot be demonstrated for a supported binding, resolve that
specific boundary explicitly before integration; do not add a general scheduler.

### Commit order and reentrancy

1. Compute and validate the plan without live writes. Install next owner state.
2. Mirror a changed displayed domain exactly once. The mirror setter does not
   independently emit a second domain event. A transition target is not a display.
3. Synchronize the linked selection when requested, including seeding an initial
   value that already equals the display. Its origin follows the rule above.
4. Notify domain dependents for actual effective changes. Reentrant source or
   selection updates must observe the installed state; a superseded outer commit
   must not resume effects that restore its stale state or start its old animation.
5. Execute the decided transition/render action against the current owner state.
   Existing synchronous scale-dependent expression propagation settles before the
   animator's render callback. Avoid render/notification work for unchanged frames.

Treat any guard needed for step 4 as commit validity, not another domain policy.
Do not invalidate effects merely because a nested update replaced the state
object or incremented a general revision. An own selection echo or passive data
refresh may retain the same displayed domain and transition. Those benign
updates must preserve the pending domain notification and animation start.
Check validity for the affected display/transition effect; an authoritative
replacement can supersede that effect. Verify notification count and listener
ordering for both benign feedback and a nested external replacement.
Test external selection writes from listeners, clear before the first frame,
transition replacement during a callback, and synchronous lazy publication.
Use existing parameter transactions/flush facilities only at a demonstrated
ordering boundary. Do not introduce a queue that delays calibrated domains by
one frame or promises/microtasks that reorder synchronous scale APIs.

Only readiness/reference/extent changes must still reach their consumers without
pretending the display changed. Audit `zoomLevel`, axis bounds, lazy waiters, and
layout invalidation; introduce a focused internal progress notification only if
these consumers need it. Keep public domain/range event semantics compatible.
Verify the first lazy request explicitly: `activate()` currently subscribes to
domain/layout events but does not itself request data. Preserve visibility/layout
gating and ensure initial requests do not rely on a redundant domain notification.

## 4. Coherent implementation slices

Each slice includes its focused regressions and removes any replaced code. There
are two substantial reviews: this contract before coding, and integrated milestone
3 after the slices. Re-review only a materially changed shared contract.

### A. Relevant readiness with a working shared-data vertical slice

- [x] Implement precise dependencies, consumed-input receipts, and reusable
      initial/viewport readiness queries. Update relevant wait subscriptions.
- [x] Replace domain-length initial readiness with the new contract, retaining
      current animation behavior while dataflow is verified.
- [x] Test a shared primary source, inherited delayed lookups, constant baseline,
      one ready-empty contributor, early navigation, and a later real reload.
- Verify narrow dataflow/scale suites and Core/App type checks. Update the
  dataflow architecture to explain the dependency/readiness boundary.
- Commit: `refactor(core): make domain contributor readiness explicit`.

### B. One owner for live writes and transitions

- [x] Wire normalized source snapshots, interactions, reset, selections, and
      frame updates into one owner. Delete old finalizers, snapshots, and
      write/restore policy as the owner becomes authoritative.
- [x] Retain all automatic/explicit animation modes, interruption rules,
      calibration, and initialization ordering. Port prototype tests as needed.
- [x] Migrate scale recreation, dynamic membership, and direct live setters.
      Preserve categorical encoding and range/size invalidation contracts.
- Verify scale, parameter, selection, lazy/viewport, and layout regressions;
  measure live production size and domain writers. Update scale/reactivity
  architecture and user docs for explicitly adopted bug fixes only.
- Commit: `refactor(core): centralize domain commits and transitions`.

### C. Cross-system integration and deletion check

- [x] Run the full unit suite, workspace TypeScript, lint, and relevant example
      validation; exercise the browser scenarios below and inspect console errors.
- [x] Review the integrated result with a subagent, including App bookmark/data
      waits, renderer inputs, performance, and the deletion ledger. Revise if
      adapters recreate lifecycle decisions or two authorities remain.
- [x] Record verification and measured simplification; reconcile milestone 3.
- Commit: `test(core): verify domain lifecycle integration` if this produces
  additional regressions/fixes; keep review fixes with their coherent slice when
  practical. No permanent compatibility switch or dual execution mode remains.

## 5. Verification matrix

| Scenario / existing example                                    | Required evidence                                                                                                                                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dynseq SPI1 bQTL dependency shape                              | Inherited side inputs gate the real track; overridden baseline is independent. Empty primary/side inputs, real publication, optimized sharing, and replay without beginBatch work. |
| Foreign completion before primary replay                       | A listener placed between foreign revision publication and replay sees pending output; readiness resolves only after output incorporated that revision.                            |
| Shared lazy tracks during early navigation                     | Display survives late and empty completion; reference finishes independently; later eligible data changes still animate.                                                           |
| MSA configured interval with data zoom extent                  | Inclusive/internal bounds, reset target, reference, and changing loaded extent remain distinct; updated extent reaches zoom-level/axis consumers.                                  |
| Viewport-autoscale signal and scatter-plot size/color          | 150 ms debounce, every contributor's current coverage, empty fallback, and real intermediate automatic transition frames.                                                          |
| Two-way linking / genome overview-detail                       | Brush, pan, animated zoom, reset, initial seeding, clear, passive data arrival, nested external writes, and persisted selection restoration.                                       |
| Calibrated CN/depth and same-scale domain-to-range expressions | Every frame settles before render; no second default animation; explicit animation opt-in remains supported; initialization rollback works.                                        |
| Dynamic track/visibility and property edits                    | No reopened initial phase, stale listeners, unwanted navigation reset, or range-only recreation changing domain. Domain-affecting props normalize correctly.                       |
| Index/locus, ordinal metadata and step-sized views             | Structural updates remain immediate, explicit index zoom animates, genome conversions/clamps remain stable, categorical order/GPU encodings and size caches agree.                 |
| Superseded/disposed animation and immediate API rendering      | Old callbacks cannot commit, promises retain completion/cancellation semantics, and `renderImmediately` updates dependents before drawing.                                         |

Use real `Animator` callbacks with controlled timestamps for deterministic frame
assertions; default headless immediate transitions are insufficient evidence of
preserved animation. Reuse `scaleResolution.parameterDependency.test.js` as the
calibration oracle. Assert emitted domain sequences and readiness, not private
field layouts or generated-spec snapshots unless those are actual contracts.

Browser checks use the debug skill on `viewport-autoscale.json`,
`interval_linked_domain_two_way.json`, and the MSA/Dynseq patterns. Prefer local
deterministic data for controlled delays; separately smoke-test the actual
examples when their remote inputs are available. Check visible continuity and
absence of snap-back, axes/marks staying aligned, and console/network errors.
For changed shared projection/layout contracts, use the view-testing skill and
focused SVG/layout assertions. Preserve WebGL and WebGPU inputs without opening
a renderer rewrite. Documentation changes use the docs skill and relevant checks.

## 6. Decisions and success criteria

The behavior contract records intentional corrections: ready-empty finalization,
continued initial-reference collection after early navigation, protection from
late ordinary data when animation is disabled, and effective-change notification
deduplication. Each needs a real integration regression and an explicit consumer
audit. Do not expand the public meaning of `configuration` or change reset
fallbacks just because the provisional model permits it. Pin ambiguous legacy
cases in slice A and revise the model before slice B; unsupported empty reset
behavior is a separate fix unless necessary to preserve a documented example.

Success means the required UX passes, relevant contributors have explicit
readiness, one owner decides and commits the display, and the deletion ledger is
complete. Compare combined production code (including new readiness helpers)
with the baseline, not only `ScaleResolution` line count. Count domain writers,
independent lifecycle flags, and duplicated policy branches. Accept necessary
dependency metadata, but revise integration that merely relocates branches or
adds another layer around the old code. Domain-only sharing stays deferred.

## Slice A delivery record

- Actual flow-node side dependencies and consumed foreign revisions now support
  initial readiness, viewport checks, App waits, and screenshot waits. Configured
  domain/constant contribution handling and effective-domain availability remain
  separate. Empty publications can finish initialization and enable later normal
  automatic transitions.
- Review found and corrected synchronous lookup-response handling, empty BigWig
  descriptor notification order, failed-wait cleanup, and fetched coverage being
  reported before publication. Windowed sources now retain fetched coverage until
  publication; Tabix retains its per-file propagation boundaries.
- Regression tests cover those ordering cases, inherited Dynseq lookup versus
  an overriding baseline, aborted waits, empty collector replay, screenshot
  waiting, and real automatic transition frames following ready-empty completion.
- Subagent re-review found no remaining material issue. All 460 unit test files
  pass (3,917 tests passed, one skipped, two TODOs); workspace TypeScript and
  repository lint pass. Browser checks remain for the live-owner integration.
- Changed production files together grow from 5,614 to 5,758 lines (+144),
  including the new shared readiness helper. The growth buys explicit dependency
  and publication facts; the old owner-policy deletion remains slice B.
- The follow-on ownership review favors state/commit directly in
  `ScaleResolution` over the proposed extra coordinator. It also identifies
  the reusable low-level property/domain/range phases and the zoomable ExprRef
  compatibility case above; slice B implements that boundary.

## Slice B and integrated verification record

- `ScaleResolution` now owns display/reset/reference/data-extent state and the
  only live commit path. Planner snapshots, initial-domain finalizers,
  write/restore branches, suppression counters, and Controller transition
  ownership are deleted. Direct setters enter the owner; only the manager's raw
  mirror writes a committed display. Scale creation and working copies remain
  necessary initialization/normalization writes, not parallel authorities.
- The pure model is live, with initial readiness separate from viewport coverage.
  Expression changes have their own reason to preserve the existing opt-in
  zoomable ExprRef behavior. Reset submits zero-duration navigation using the
  stored reset target; the unused prototype reset variant was removed.
- Selection echoes use scoped outgoing-object identity. Real transaction-wrapped
  animation frames publish the brush and domain together without collector domain
  queries. Nested external selection writes supersede the frame; duplicate domain
  notifications cannot reintroduce stale listener effects. Extent-only progress
  updates zoom-level parameters and axis ticks without a false domain event.
- Review found and fixed cancellation after disposal, invalid interpolation from
  a zero-span initial domain, reentrant range reconfiguration, and an inactive
  selection marker matching an external undefined value. Eight owner integration
  cases and the expanded example lifecycle tests cover these and reset/direct
  cancellation, supersession, raw setter normalization, legacy reset targets,
  range-only recreation, and independently completed initial references.
- Final subagent review found no remaining blocking issue and judged the owner
  design appropriate. A final normalization audit confirmed `configureDomain`
  already returns the working scale's physically normalized getter value; no
  extra normalization pass was added.
- Full unit verification: 461 files passed; 3,928 tests passed, one skipped,
  two TODOs. Workspace TypeScript, repository lint, formatting, and diff checks
  pass. This includes App navigation/bookmark, lazy waits, calibration, dynamic
  view membership, categorical ordering, and layout/rendering contract tests.
- WebGL smoke checks passed the actual viewport-autoscale, two-way linked-domain,
  MSA, and remote Dynseq examples. In an App browser embed, a 500 ms linked zoom
  emitted 31 aligned domain/brush frames; external brush and clear applied their
  expected targets. Actual viewport autoscaling emitted 32 finite frames after
  navigation and retained the selected x interval. The final screenshot showed
  marks and axes aligned. No application errors occurred in successful runs;
  development-mode/GPU readback warnings are expected. These checks are not a
  pixel-diff guarantee or exhaustive WebGPU browser coverage.
- Slice B's eight changed production files total 5,357 → 5,380 lines (+23).
  The five domain components total 4,083 → 4,077 lines (-6), including the
  previously added policy. Across the entire branch, 19 changed/new production
  files total 8,676 → 9,145 lines (+469), including explicit readiness and the
  306-line live policy. Thus this is a reduction in competing state/decision/write
  paths, not an overall line-count reduction. The added contracts and regression
  coverage justify the modest production growth; no extra coordinator, scheduler,
  provider hierarchy, or compatibility execution mode was introduced.
- Existing grammar documentation and example expectations remain applicable.
  Architecture documents describe the adopted readiness, reference, authority,
  and notification corrections. Domain-only sharing remains separate work.

Slices B and C ship together in the owner integration commit because final review
fixes and regression coverage belong to that same coherent change. Plans remain
active for the follow-on milestones; reconcile and retire them before a PR.
