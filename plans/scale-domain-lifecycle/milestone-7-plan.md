# Milestone 7: one domain input implementation

Status: complete; implementation and integrated design reviewed.

## Outcome and deletion boundary

Use the milestone 6 publication resource for every scale kind. Delete the
`DomainPlanner` cached class and the resolution's legacy selection/expression
subscriptions, viewport scheduler, duplicate readiness, and source-update policy.
Keep pure configured/data/default domain functions for bootstrap and unbound
`getDataDomain()` calls (including App's synthetic sample resolution).

`ScaleResolution` resolves participants, validates shared configuration, creates
bindings, and explicitly recreates physical scales. `domainInputs` owns the one
reactive input path; `DomainRuntime` owns historical state and animations. The
physical scale manager maintains categorical index mapping alongside normalization.
No additional scheduler, compatibility mode, or reactive graph is permitted.

## Required boundary details

- Preserve raw data domains versus internal index/locus intervals; convert each
  at the existing boundary exactly once. Genome defaults and loaded data extents
  are distinct. Empty input cannot turn into a NaN index extent.
- Preserve categorical learned indices for implicit domains, explicit reordering,
  disappearing/reappearing categories, ordinal unknown behavior, and the indexer
  exposed to GPU/mark consumers through physical scale properties.
- Resolve selection metadata and shared feedback conflicts without evaluating
  ordinary domain expressions during preflight. Preserve scope and assembly
  bootstrap, initialization cycles, range expressions, and rollback.
- Simplify viewport debounce to the one input path and retain coverage/readiness
  and last-nonempty semantics. Public getters do not create a second cache owner.
- Preserve every milestone 6 synchronization/animation contract. Reduce repeated
  reads and duplicate subscriptions as implementations are removed.

## Verification and judgment

Run existing scale/parameter/readiness suites during integration. Add behavioral
coverage for reactive categorical order/identity and remaining type boundaries.
Then run full tests, workspace TypeScript, lint, and real viewport/linking/MSA/
Dynseq browser checks. Review the combined implementation with a subagent,
including App and physical scale consumers, before committing.

Measure the same production cohort as milestone 6 against milestones 4, 5 and 6.
Explain residual state and ordering rules. Accept only if there is one traceable
input/ownership path and meaningful deletion; passing tests alone is insufficient.
Record an explicit final verdict and remaining limitations, update architecture,
and reconcile the implementation plan. Plan retirement/PR/merge are separate
steps; do not claim merge readiness merely from this milestone's completion.

Commit subject: `refactor(core): unify domain inputs and remove legacy coordination`.

## Completed implementation and review

All scale kinds now use the same replaceable input bindings and publication
resource. Deleted the cached `DomainPlanner` class, resolution-level expression
and selection subscriptions, viewport event subscription refresh, duplicate
readiness queries, selection fallback/echo state, and legacy source-update policy.
Bootstrap still validates configuration without eagerly evaluating ordinary
expressions. App's synthetic sample resolution retains a pure unbound data reader.

Categorical IDs now remain stable independently of authored display order. This
is required by retained WebGL vertex data and WebGPU series caches; changing a
domain cannot silently renumber existing rows. Empty index input remains empty
until scale normalization, and loaded extents convert to half-open coordinates
once. Authored domains avoid unused collector domain queries.

Beauvoir and Euclid reviewed the integrated deletion and downstream contracts.
Their findings produced the categorical-ID and empty-index fixes; both accepted
the revised design. Heisenberg replaced callback-specific tests with behavioral
ASCAT, scoped-range, disposal, and categorical cases. The selection-echo stale
snapshot guard remains necessary: two queued navigations can leave the first
navigation's echo behind the second. It is a concrete queue contract, not a
legacy adapter. No additional scheduler or cache owner was introduced.

## Verification

- Full unit suite: 3,965 passed, one skipped, two todo, across 464 files.
- Workspace TypeScript, lint, formatting and diff checks pass.
- Browser smoke checks pass for viewport autoscale, two-way interval linking,
  MSA, and Dynseq. No visualization errors; development/driver warnings only.
- Live linked animation emitted 43 observed frames with exactly aligned brush
  and displayed domains; final [20,40], external clear restored [0,100].
- Live MSA navigation retained loaded extent [0,1653], converted public
  [200,210] to internal [200,211], and reset to internal [190,231] / public
  [190,230]. Navigation plus reset emitted 44 domain events.
- A reviewer exercised the actual headless/WebGPU adapter across explicit
  [A,B] -> [B,A], removal, and reappearance. Retained series stayed [0,1];
  reordered domain IDs became [1,0] with the same indexer and cached series.
- Representative performance contracts cover bounded ASCAT topology/property
  work, no unused authored-index domain query, retained categorical IDs, and
  existing replay/frame coalescing tests. These are not a throughput benchmark.

## Size and verdict

Same 21-file production cohort as milestone 6 (shared runtime/dataflow changes
and the affected scale path; tests excluded):

| State                                | Lines | M7 change vs state |
| ------------------------------------ | ----: | -----------------: |
| Branch starting point (`dba23f9b6^`) | 8,457 |               +705 |
| Milestone 4 (`7a68e8a43`)            | 8,760 |               +402 |
| Milestone 5 (`770d6220a`)            | 9,032 |               +130 |
| Milestone 6 (`e79de6141`)            | 9,834 |               -672 |
| Milestone 7                          | 9,162 |                  0 |

Within that cohort, `ScaleResolution` falls from 2,166 to 1,689 lines and
`domainPlanner.js` from 838 to 595. The input binder grows from 381 to 417 and
the physical manager from 377 to 416; the domain runtime loses one line and
viewport handling loses 26. The shared runtime foundation is included in the
comparison, so helper extraction does not disguise total growth.

Verdict: keep this design. The interim growth has largely been repaid by real
deletion, and the remaining growth buys coherent propagation and explicit
historical policy. The key improvement is one traceable path from inputs to
publication, rather than a claim that fewer total lines prove simplicity.
`ScaleResolution` still has substantial configuration, validation, lifecycle,
and public API code; reducing its line count further is not itself an objective.

Async request cancellation/generations, arbitrary cross-system reactive
consistency, and domain-only sharing remain outside this task. Issue #463's
completed subset is synchronous replay/domain/selection/calibration publication,
not a claim that all asynchronous glitches are fixed. WebGL's existing texture
mapping does not fully support dynamic explicit categorical reorder/removal;
this refactor preserves retained IDs but does not solve that separate renderer
limitation. No new renderer invalidation system was added to conceal it.

All seven implementation milestones are complete. Plan retirement and whole-branch
PR preparation remain separate delivery work; no PR or merge is performed here.
