# Bonus milestone — Close the branch review gaps

Status: implemented and verified, 2026-09-06. M4 remains deferred.

## Outcome and scope

Make the stable mapping dependency survive physical scale replacement, demonstrate
that a second grouped property uses the production mapping path, and avoid parsing
obsolete URL responses. Keep the existing runtime, resolution scope and streaming
contracts. Do not add a scheduler, reconnection protocol, public grammar feature,
or shared asynchronous resource manager.

The review reproduced a scale recreation bug: replacing view-level range
[0, 20] with [0, 100] changes the physical mapping of 5 from 10 to 50, while an
existing scale() parameter stays at 10 and a mapping observer never runs.
The original padding fixture tested a standalone operation, not ScaleInstanceManager.

## Implementation

- [x] Keep the mapping ref and its owner alive for the resolution lifetime.
      Physical scale reset must preserve the manager runtime, mapping operation and
      range-command ref; clear the old command and scale-specific setters/state. Rebind the existing
      operation when replacing the scale, invalidate old range commands, and publish
      replacement even if numeric configuration is unchanged, using physical scale
      identity in configuration equality. Retain DomainRuntime and its navigation state;
      replace domain-input subscriptions after the new mapping is installed. Handle identity mappings
      under the same lifetime contract, including supported transitions to/from null.
      Dispose the owner only when the resolution is disposed. Prefer moving lifecycle
      boundaries over adding intermediary refs or reconnecting consumers.
- [x] Consolidate grouped mapping binding in ScaleInstanceManager. Extend its
      existing dependency/evaluation/application path to internally exercise band/index
      padding, paddingInner and paddingOuter expressions, preserving property precedence
      and resolution scope. Keep range-command compatibility. Do not add public types
      or schema support; continuous reactive padding remains out of scope. Use a small
      explicit property set rather than a generic property-binding framework.
- [x] Update captured CPU encoder scales through the existing owned mapping
      operation path. The Canvas/SVG regression exposed a second stale reference:
      createEncoder captures the physical scale. Luna reviewed this bounded addition:
      thread an optional binding callback through encoder factories, update captured scale and
      metadata together, and preserve the direct per-row scale call. Conditional
      branches must expose current scale metadata too. The binding uses an existing
      operation to apply before observer effects, suppress in-place scale changes by
      identity equality, and inherit view-scope disposal. No facade or new event channel.
- [x] Add an isCurrent() check after URL content loads and before format parsing.
      Keep the post-parser guard for asynchronous readers and existing loading policy.
- [x] Update architecture and plan records with the actual ownership contract,
      validation results and production size delta. Keep transform caches local;
      lookup/cross do not need further changes for this milestone.

## Acceptance and verification

- Existing scale helper parameters and observeMapping subscriptions continue to
  update after view-level properties are replaced or removed, including unchanged
  configuration and identity-scale cases. Old expression inputs detach, range
  commands do not leak to the replacement, and disposal stops pending work.
- Cover actual container mutation that clears and reattaches scale declarations.
  Verify retained mark resource invalidation and WebGL range-texture subscriptions;
  check immediate Canvas/SVG output through existing rendering fixtures. Shared
  resource invalidation also serves WebGPU; reuse existing backend tests rather
  than adding a new renderer-specific coordination path.
- Production padding fixtures exercise band range and padding in one
  transaction and index padding with its normalized positional range. They check
  precedence, domain-to-padding dependencies, final bandwidth,
  stable mapping identity, equality suppression and feedback rejection. No new
  runtime or per-property subscription/disposal code is needed.
- A stale fetched response never calls its parser; existing async-parser freshness
  tests still pass. Preserve existing URL format and error tests.
- Run focused suites during iteration, then the full unit suite, workspace
  TypeScript checks and lint. Record wc/diff size before and after; justify growth
  by removed lifecycle pitfalls and reuse, not speculative future consumers.

## Luna review

Accepted: preserve all mapping-owner refs, clear old commands, include physical
scale identity in equality, use the same mapping ref for identity scales, retain
the domain owner, and explicitly keep padding expressions internal test-only.
No new runtime primitive or public grammar support is needed.

## Completion record

Completed after Luna plan review and its follow-up on captured encoder scales.
The regression now covers stable helper refs, physical replacement with equal
values, old command removal, mark revisions, container removal, identity mappings,
conditional encoders, retained WebGL texture updates and immediate Canvas/SVG
geometry. Encoder operations settle before compatibility range notifications.
Band and index tests use the production mapping manager; stale URL bodies skip
parsing while delayed-parser publication checks remain covered.

Verification: 4025 unit tests passed, 1 skipped and 2 todo across 470 files.
Workspace TypeScript checks pass (Core rerun after the final test correction),
as does repository lint. No new browser/GPU raster comparison was needed for this
change; existing backend suites and focused resource/Canvas/SVG tests cover the
changed contracts.

Production JavaScript: 140 added / 55 removed, net +85 lines. The scale manager
is 483 lines (was 432), encoder module 746 (was 710). Growth adds real grouped
padding binding and fixes retained physical-scale references; GraphRuntime and
transform caches are unchanged. No new scheduler, event channel, facade or
per-property disposal subsystem was introduced.

## Review and delivery

Luna reviewed the plan for lifecycle cases, KISS and scope before implementation.
The final combined diff was reviewed locally. Deliver as one coherent commit;
M4 stays deferred.

Tentative commit: `fix(core): preserve mapping dependencies across scale replacement`

No public documentation migration or new dependency is required. Architecture
notes must distinguish the production internal padding fixture from public grammar.
