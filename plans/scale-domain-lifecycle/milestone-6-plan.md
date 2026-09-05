# Milestone 6: reactive domain integration experiment

Status: implementation, independent review and final verification complete.
The representative integration gate passes with the deletion obligations below.
The overall simplification and merge gates remain open for milestone 7.

## Chosen boundary

Use replaceable input bindings and stable output refs. A fully computed domain
graph would require replacing dependencies and downstream ranks during scale
bootstrap and membership changes; expanding GraphRuntime into a dynamic graph
editor is not justified for this experiment. Instead use the existing synchronous
publication queue for stateful domain policy, as already done for streaming data.

Resolve contributor/configuration/expression/viewport bindings during construction
or topology changes. Candidate/readiness/reset/extent computations enqueue one stable input job.
Source completion and collector replay batch their entire synchronous fan-out.
Streaming jobs precede candidate and domain command jobs; all resulting computeds
settle between jobs. Initial history stays provisional until a finalization job
runs after domain publication and before every observer effect. It only marks the
phase ready, freezing the latest reference after calibration has settled. This
avoids a second dependency-order graph for stateful domain producers.

The domain resource owns policy history and animation execution. It publishes
physical scale mapping and stable displayed-domain refs before terminal effects
deliver compatible events and render requests. Candidate inputs can be disposed
and rebound without replacing public domain refs or losing navigation history.
`ScaleResolution` retains compatibility/configuration validation and explicit
bootstrap/recreation, then delegates domain APIs to the resource.

## Feedback and public behavior

- Selection ingress captures value, origin, and change identity synchronously.
  The ingress subscriber only records/enqueues; it cannot calculate candidates,
  apply policy, mirror scales, or notify. An exact scoped outgoing-object marker
  classifies echoes at ingress, so origin survives deferred processing. No
  persistent selection schema change or general provenance framework is needed.
- Process each external selection command once. An equal external clear remains
  authoritative and cancels a queued/running animation; passive refreshes and own
  echoes do not. Preserve `initial` bypass, raw reset versus normalized display,
  and independently completed initial reference/loaded extent.
- Reverse selection synchronization is source publication, not a terminal
  effect. Nested external replacements must settle before notification/render
  observers. Do not replace current guards with effect-registration-order rules.
- Automatic and explicit transitions retain timing/interpolation, intermediate
  calibration, cancellation identity, and promise completion. Synchronous setters
  and immediate rendering flush before returning outside an enclosing transaction.
- Keep staged scale seeding/rollback. Domain reads during range binding remain
  valid; true domain/mapping cycles remain errors. Empty/pending/lazy bootstrap
  and dynamic contributor lifecycle remain compatible.

## Implementation and deletion ledger

1. Introduce the smallest owner-bound internal writable-ref facility needed for
   stable domain publication, alongside existing computed/effect facilities.
   Keep fixed graph dependencies; no dynamic graph editor or second scheduler.
2. Establish the domain publication resource using the existing pure policy and
   animation math. Remove resolution-owned commit/animation state and notification
   serial/ordering orchestration as the resource assumes authority. Native domain
   dependency refs feed calibrated expressions before compatibility events.
3. Bind configured expression and viewport candidates to resolved inputs; remove
   their resolution-wide refresh callbacks and per-update topology discovery.
   Preserve viewport debounce/coverage/empty fallback as explicit input policy.
   Keep any still-unmigrated paths named and bounded for milestone 7.
4. Bind selection ingress and reverse publication through the same resource and
   test real linked animation/clear. Do not create another owner for selection
   initialization or a parallel compatibility execution mode.

Acceptance requires real deletion across the combined path. A moved commit method
or candidate reader that calls back into resolution-wide `getProps`/`refresh`
does not count as the final result. If integration cannot eliminate those paths
without larger machinery, revise the design and record that the decision gate
has not passed; do not expand the migration.

## Verification and review

- Run focused scale/parameter/readiness suites while integrating, including real
  Animator frame tests. Add behavior tests for joint parameter + replay inputs,
  coherent calibrated domains, external equal clears, deferred own echoes, nested
  external writes, and no per-frame contributor/scale-property rediscovery.
- Use actual viewport-autoscale and two-way linked-domain examples, with
  deterministic data for numerical tests. Check same-scale domain-to-range,
  index/locus, lazy/ready-empty behavior, dynamic membership/recreation/disposal,
  and immediate API rendering.
- Use browser checks for visible autoscale transitions and linked animated
  navigation, then full unit/workspace TypeScript/lint verification. Preserve
  WebGL/WebGPU and Canvas/SVG consumption contracts.
- Review this contract before runtime edits, then have a subagent assess the
  integrated experiment against the deletion ledger and downstream behavior.
  Revisit only material design/correctness changes, not routine wording fixes.
- Record combined production size, state/notification paths, and query/replay
  counts against milestone 5. Update architecture after the design is validated.
- Tentative commit: `refactor(core): drive viewport domains through reactive dependencies`.

The independent design review favors this stable-output/publication-job boundary
over dynamic computed rebinding, with two essential constraints: streaming replay
must precede domain policy, and reverse selection sync must publish before terminal
observers. Full async generations and unrelated reactive consumers remain deferred.

## Integration evidence and remaining deletion gate

The live continuous path now binds configured expressions, member accessors,
viewport constraints and selection ingress once per configuration/topology change.
Displayed domains are stable native parameter refs. Ordinary candidate refreshes
and animation frames no longer call resolution-wide property/contributor discovery.
The resolution's previous continuous expression/selection/viewport callbacks are
inactive; discrete/index/locus adapters remain explicitly temporary for milestone 7.

The common publication queue replaces the domain notification serial and manual
reentrant commit/animation guards. Domain state, transitions, cancellation and
immediate render requests live in `DomainRuntime`. Selection synchronization and
zoom-level inputs publish before terminal events/rendering. The resource owns a
separate scope because a shared scale can outlive its creating member view.

Review found and fixed four boundary failures: rendering before deferred commands,
commands stranded by failed replay, stale historical references under reversed
calibrated layer order, and data invalidations swallowed by own selection echoes.
Replacing bindings now cancels queued source snapshots while preserving public
navigation, and preserves the last nonempty viewport input. The removal regression
was checked with cancellation temporarily disabled: it exposes the stale selection
candidate, then passes with cancellation restored.

Own echoes are the lowest-priority source invalidation. Their isolated fast path
updates reset state without rescanning data; a simultaneous real input change
requires a complete source snapshot. Readiness cannot be downgraded by an own echo.
A failed propagation discards queued caller-owned commands through a cleanup-only
update-job hook; already-published state is not rolled back. Disposal prevents later
frames, zoom-input callbacks or transition completions from publishing.

Production measurement includes the union of files affected by milestones 5 and 6,
plus the six existing scale/domain implementation modules; excludes tests and the
unrelated concurrent scoring work:

| Baseline                  | Production lines |
| ------------------------- | ---------------: |
| Milestone 4 (`7a68e8a43`) |            8,760 |
| Milestone 5 (`770d6220a`) |            9,032 |
| Milestone 6               |            9,834 |

The increase of 802 lines over milestone 5 (1,074 over milestone 4) is real interim debt: stable resources and shared scheduling coexist
with the old discrete/index/locus source adapter and planner caches. This experiment
shows simpler **coordination on the migrated path**, not a smaller subsystem.
Independent review supports continuing only with a firm milestone 7 deletion gate:
remove the old subscription/refresh machinery and candidate-cache authority rather
than retaining them for getters. Do not introduce another producer graph, additional
compatibility modes or a general asynchronous reactive framework.

Verification: 3,957 passing unit tests in 462 files (one skipped, two todo),
all workspace TypeScript checks and repository lint pass; focused contracts for parameter-plus-replay updates,
reversed calibration order, immediate rendering inside transactions/publication,
failed replay, removal/rebinding, selection/data coalescing, and retained viewport
fallback. Existing tests cover lazy/ready-empty inputs, index/locus/categorical
semantics and real animation/cancellation. Data-member topology/data-domain reads
remain absent during linked frames; legacy chrome observers still check visibility.
Four WebGL examples smoke-rendered: viewport autoscale, two-way linking, MSA and
Dynseq. Live viewport zoom produced 31 intermediate automatic domain updates;
two-way navigation produced 31 domain/brush-aligned updates and cleared to [0,100].
