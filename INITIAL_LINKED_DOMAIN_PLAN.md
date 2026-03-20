# Initial Linked Domain Plan

## Purpose

Implement startup-time `initial` domains for selection-linked scale domains, with
semantics that fit overview+detail use cases and avoid making the brush itself
the primary persisted state.

This plan covers:

- Core schema and runtime changes
- Validation changes
- App bookmark/hash/provenance behavior
- Documentation updates
- Test coverage

The goal is to support specs such as:

```json
{
  "encoding": {
    "x": {
      "field": "pos",
      "type": "locus",
      "scale": {
        "domain": {
          "param": "brush",
          "initial": [
            { "chrom": "chr7", "pos": 1 },
            { "chrom": "chr7", "pos": 50000000 }
          ]
        }
      }
    }
  }
}
```

## Agreed Semantics

### 1. Domain-first model

For linked domains, the linked scale domain is the semantic state. The interval
selection is primarily an interaction mechanism that can expose and manipulate
that domain.

This is especially important for overview+detail configurations, where adding an
overview brush should not fundamentally change the meaning of the visualization.

### 2. `initial` is configured startup state

`initial` on a selection-linked domain means:

- It is author-configured domain state, analogous to an explicit literal
  `domain`.
- It participates in configured-domain resolution for linked domains.
- It may then be overwritten by bookmark, URL hash, or provenance restore.

In other words:

- on a clean startup, the linked scale may initialize from `initial`
- on a restore path, restored state may replace it

### 3. Clearing the selection resets to default/data-derived domain

When the linked interval selection is cleared after interaction:

- The scale domain must reset to the usual configured-or-default behavior,
  which in practice means the normal data-derived/default domain.
- It must not snap back to `initial`.

This means `initial` must not become sticky after an explicit clear.

### 4. Reverse sync behavior

For linked domains with reverse sync enabled (`sync: "twoWay"` or effective auto
two-way):

- Startup from `initial` should populate the linked interval selection so the
  overview brush is visible and consistent with the detail domain.
- Clearing the selection should clear the interval and reset the scale domain to
  the normal default/data-derived domain.

### 5. `zoom: true` + `sync: "oneWay"` should be disallowed

This combination creates contradictory state because:

- the scale domain can diverge from the linked interval param
- App restore currently replays params and scale domains separately
- the linked selection is no longer a reliable representation of the domain

This validation must use resolved zoomability, not only raw channel-def values,
because locus/index scales are zoomable by default.

### 6. Interval selections may be ephemeral

Interval selections should continue to support `persist: false`.

That is useful for overview brushes that are purely auxiliary UI. However:

- if the linked interval is ephemeral, the current linked detail extent will not
  be restored through the selection
- if the linked interval uses `persist: true`, that persisted selection should
  be the bookmarkable representation of the linked domain

## Proposed API Change

Extend `SelectionDomainRef` in
[packages/core/src/spec/scale.d.ts](/Users/klavikka/hautaniemi/genome-spy/packages/core/src/spec/scale.d.ts)
with:

```ts
initial?: ScalarDomain | ComplexDomain;
```

Notes:

- `initial` should accept the same user-facing interval types as normal scale
  domains.
- For locus scales, this allows chromosomal locus objects instead of requiring
  internal linearized numbers.
- This lives on the domain link, not on the selection param, because the domain
  is the important state here.

Suggested docs wording:

- "Initial configured domain for the linked scale when the linked interval
  selection is empty."
- "Persisted state may override this initial domain during restore."
- "Clearing the linked interval selection resets the domain to the normal
  default/data-derived domain."

## High-Level Implementation Strategy

Implement this in phases, in the order below.

## Phase 1: Schema and domain-planning groundwork

### Step 1. Extend the schema type

File:

- [packages/core/src/spec/scale.d.ts](/Users/klavikka/hautaniemi/genome-spy/packages/core/src/spec/scale.d.ts)

Tasks:

- Add `initial?: ScalarDomain | ComplexDomain` to `SelectionDomainRef`.
- Document the configured-startup semantics.
- Document that clearing a linked interval returns to the normal default/domain
  behavior rather than `initial`.

### Step 2. Extend domain link metadata

Files:

- [packages/core/src/scales/domainPlanner.js](/Users/klavikka/hautaniemi/genome-spy/packages/core/src/scales/domainPlanner.js)
- any related tests

Tasks:

- Extend `SelectionDomainLinkInfo` to carry enough information about `initial`.
- Resolve `initial` through the same complex-domain conversion path used for
  literal domains.
- Keep the value in an internal numeric form suitable for scale resolution, but
  preserve the concept of it being user-facing at the schema boundary.

Important distinction:

- `getConfiguredDomain()` should treat `initial` as configured domain state.
- `getDefaultDomain()` should remain unchanged.
- explicit clear handling must still be able to bypass `initial`, so `initial`
  does not act as the reset target after interaction.

Expected result:

- domain planning knows whether a linked domain has `initial`
- empty linked selections can still yield a configured domain through `initial`
- default-domain logic remains untouched

## Phase 2: Scale-resolution startup semantics

### Step 3. Add configured-domain `initial` handling

Primary file:

- [packages/core/src/scales/scaleResolution.js](/Users/klavikka/hautaniemi/genome-spy/packages/core/src/scales/scaleResolution.js)

Secondary files if needed:

- [packages/core/src/scales/scaleInteractionController.js](/Users/klavikka/hautaniemi/genome-spy/packages/core/src/scales/scaleInteractionController.js)

Tasks:

- Make `DomainPlanner.getConfiguredDomain()` return `initial` when:
  - a linked selection domain exists
  - the linked interval is empty
  - `initial` is defined
- Keep `getDefaultDomain()` and default-domain behavior unchanged.

Design constraint:

- explicit clear handling must still be able to bypass `initial`
- therefore, `ScaleResolution` needs a way to request configured-domain
  resolution without `initial` after a clear action

Possible implementation shapes:

1. Add an option such as `getConfiguredDomain({ includeInitial: boolean })`.
2. Add an option at the `getConfiguredOrDefaultDomain(...)` layer.
3. Keep a small `ScaleResolution` flag that requests "ignore linked initial"
   during post-clear recomputation.

Recommended approach:

- make `initial` part of configured-domain planning
- add an explicit opt-out path for post-clear recomputation instead of treating
  `initial` as a purely startup-only special case

### Step 4. Reverse-sync configured `initial` into the interval param

File:

- [packages/core/src/scales/scaleResolution.js](/Users/klavikka/hautaniemi/genome-spy/packages/core/src/scales/scaleResolution.js)

Tasks:

- When the active configured domain comes from linked-domain `initial` and
  reverse sync is active, write the matching interval into the linked selection
  param.
- This should make the overview brush visible immediately on a clean startup.

Important behavior:

- restore paths may later overwrite the domain and selection
- clear handling must still be able to remove the interval and return to
  default/data-derived domain without reapplying `initial`

### Step 5. Preserve clear-to-default behavior

Files:

- [packages/core/src/scales/scaleResolution.js](/Users/klavikka/hautaniemi/genome-spy/packages/core/src/scales/scaleResolution.js)
- linked-domain tests

Tasks:

- Ensure that when the linked interval is cleared after interaction,
  `ScaleResolution` recomputes the domain while bypassing linked-domain
  `initial`.
- Ensure that reverse sync does not reintroduce `initial` after a clear.

Expected behavior after this phase:

- startup without restored state: `initial`
- later clear: normal default/data-derived domain

## Phase 3: Validation

### Step 6. Reject effective zoomable + `sync: "oneWay"`

Primary file:

- [packages/core/src/scales/scaleResolution.js](/Users/klavikka/hautaniemi/genome-spy/packages/core/src/scales/scaleResolution.js)

Why here:

- resolved zoomability is known here after merging/inference
- locus/index default zoomability must be accounted for
- `DomainPlanner` alone sees the link config, but not necessarily the final
  effective zoomability

Tasks:

- Add validation that throws when:
  - a linked selection domain exists
  - effective sync mode is `"oneWay"`
  - the linked scale is effectively zoomable

Error message should explain:

- why the configuration is invalid
- that `sync: "twoWay"` / auto is required for zoomable linked domains
- that `zoom: false` is an alternative if the author wants a one-way linked
  domain

Optional follow-up:

- keep a defensive validation in `domainPlanner.js` for obviously explicit bad
  cases if it can be done without false positives
- but the authoritative check should remain in `ScaleResolution`

## Phase 4: App persistence model

### Step 7. Decide persistence authority for linked domains

Current behavior in App:

- bookmarkable params are persisted through provenance
- named zoomed scales are persisted separately into `scaleDomains`

For linked domains, this can duplicate the same state in two forms.

Target model:

- if the linked interval selection uses `persist: true`, the selection is the
  persisted bookmark representation for the linked domain
- the actual linked scale domain must not also be serialized into bookmark
  `scaleDomains`
- if the linked interval selection is ephemeral, it is not persisted through
  provenance

Short-term recommended model:

- if a linked interval selection uses `persist: true`, persist it through
  provenance and do not also persist the linked scale domain into bookmark
  `scaleDomains`
- if the linked interval selection is ephemeral, do not persist it through
  provenance

Primary file:

- [packages/app/src/app.js](/Users/klavikka/hautaniemi/genome-spy/packages/app/src/app.js)

Tasks:

- add a way to detect whether a named scale resolution is backed by a linked
  selection domain
- determine whether the linked selection param is bookmarkable / persistent
- skip `hashData.scaleDomains[name]` when the linked selection itself is the
  persisted representation
- ensure App startup does not overwrite already-initialized linked selections
  with empty provenance defaults when there is no bookmark/hash/provenance
  state to apply

This likely requires a small API extension from Core, for example exposing link
metadata through `ScaleResolution`.

Additional startup note:

- Core may initialize a linked domain from `initial` and reverse-sync the brush
  before App provenance wiring is created.
- App must preserve that live state on clean startup.
- Therefore, `ParamProvenanceBridge` should skip its initial apply pass when the
  provenance entry set is empty, while still applying non-empty restored
  provenance normally.

### Step 8. Preserve support for ephemeral interval selections

Files:

- Core already supports `persist: false`
- App provenance logic should be verified, not reworked unless needed

Tasks:

- confirm that interval selections with `persist: false` are excluded from
  bookmark/provenance capture
- document the consequence:
  - ephemeral overview brush means the current linked detail extent is not
    restored through the selection

Longer-term option:

- if needed later, add explicit domain persistence independent of the selection
  param
- that is not required for the first implementation of `initial`

## Phase 5: Documentation

### Step 9. Update grammar docs

Files:

- [docs/grammar/parameters.md](/Users/klavikka/hautaniemi/genome-spy/docs/grammar/parameters.md)
- possibly [docs/grammar/scale.md](/Users/klavikka/hautaniemi/genome-spy/docs/grammar/scale.md)

Tasks:

- document `initial` on selection-linked domains
- explain configured-startup semantics
- explain clear-to-default behavior
- document the zoomable + `sync: "oneWay"` restriction
- mention that interval selections can be marked `persist: false`

### Step 10. Update examples

Files:

- [examples/docs/grammar/parameters/genome-overview-detail.json](/Users/klavikka/hautaniemi/genome-spy/examples/docs/grammar/parameters/genome-overview-detail.json)
- possibly add a new small focused example if needed

Tasks:

- update the overview+detail example to use `initial`
- optionally add an example showing an ephemeral overview brush with
  `persist: false`

## Phase 6: Tests

Add tests before or alongside implementation. Keep them close to the affected
code.

### Core tests

Files likely involved:

- [packages/core/src/scales/domainPlanner.test.js](/Users/klavikka/hautaniemi/genome-spy/packages/core/src/scales/domainPlanner.test.js)
- [packages/core/src/scales/scaleResolution.selectionLink.test.js](/Users/klavikka/hautaniemi/genome-spy/packages/core/src/scales/scaleResolution.selectionLink.test.js)

Add the following coverage:

1. Schema/domain planning

- linked domain accepts `initial`
- `initial` can use quantitative intervals
- `initial` can use locus complex intervals
- empty linked selection resolves to configured `initial`

2. Startup behavior

- no restored state + empty selection + `initial` => linked scale starts at
  configured `initial`
- configured `initial` reverse-syncs the interval param when effective sync is
  two-way
- configured `initial` does not require explicit `sync: "twoWay"` when auto and
  the scale is zoomable by default
- restored provenance/bookmark state can overwrite `initial`

3. Clear behavior

- clear after startup from `initial` resets to default/data-derived domain
- clear does not restore `initial`
- reverse sync keeps the interval cleared after reset

4. Validation

- zoomable linked domain with `sync: "oneWay"` throws
- explicit `zoom: false` + `sync: "oneWay"` remains allowed
- locus/index default zoomability also triggers the rejection

5. Existing behavior regression checks

- current one-way non-zoomable linking still works
- current two-way linking still works
- no feedback-loop regressions for shared-scale error cases

### App tests

Files likely involved:

- bookmark/hash related tests in App
- provenance tests if direct unit coverage is easier there

Add the following coverage:

1. Bookmark/hash deduplication

- linked domains with persisted selections are not stored twice as both param
  action and `scaleDomains`

2. Restore behavior

- persisted linked-domain state restores consistently through param provenance
- ephemeral interval selection does not get captured
- empty provenance at startup does not clear a live linked interval that was
  populated from `initial`

3. Overview+detail semantics

- adding an ephemeral overview brush does not change bookmarkable state when the
  linked domain itself is not being persisted through the selection

## Suggested Implementation Order

1. Update `SelectionDomainRef` schema with `initial`.
2. Extend linked-domain metadata in `DomainPlanner`.
3. Make configured-domain planning include linked `initial`.
4. Add post-clear bypass for linked `initial` in `ScaleResolution`.
5. Implement reverse sync for configured `initial`.
6. Add clear-to-default tests and fix behavior.
7. Add zoomable + one-way validation.
8. Expose enough link metadata for App to avoid double persistence.
9. Update App hash/bookmark serialization.
10. Ensure empty startup provenance does not override live linked-selection
    state initialized by Core.
11. Update docs and examples.
12. Run focused and broader tests.

## Open Design Checks During Implementation

These should be resolved while coding, but do not block the overall plan.

### A. Where to store post-clear bypass state

Question:

- Should the "ignore linked initial after clear" state live in
  `ScaleResolution`, `DomainPlanner`, or be passed explicitly as an option?

Recommendation:

- Keep the policy in `ScaleResolution`, but prefer an explicit option passed to
  `DomainPlanner` over hidden mutable planner state.

### B. How App detects linked domains

Question:

- Should App inspect spec/runtime internals, or should Core expose a small API?

Recommendation:

- Expose a small API from `ScaleResolution`, such as:
  - whether the scale has a linked selection domain
  - link sync mode
  - whether reverse sync is enabled

Avoid making App reach into internal planner state directly.

### C. Whether to fix selection `value` now

There is a separate issue: selection params document `value`, but current
default-param handling appears to ignore selection `value`.

Recommendation:

- do not block the linked-domain work on this
- optionally file a follow-up task or fix it if the touch surface is small

It is related, but it is not the right primary mechanism for linked-domain
startup semantics.

### D. What to persist when the linked interval is ephemeral

Question:

- If a linked interval selection uses `persist: false`, should bookmarks omit the
  linked state entirely, or should the actual linked scale domain be serialized
  separately?

Recommendation:

- Treat `persist: true` as settled:
  - persist the selection through provenance
  - skip separate linked `scaleDomains`
- Leave the ephemeral case as an explicit implementation decision:
  - either fully ephemeral, meaning no restoreable linked state
  - or domain-persisted, meaning the domain is saved even though the brush is
    not

This should be decided before App bookmark changes are finalized.

## Risks

1. Configured `initial` can easily regress into a sticky fallback after clear.

Mitigation:

- add explicit tests that clear after startup does not restore `initial`

2. Validation may miss inferred zoomability.

Mitigation:

- perform the authoritative validation after merged scale props are resolved

3. App may still duplicate state if Core metadata is not surfaced cleanly.

Mitigation:

- add a minimal explicit API instead of duplicating inference logic in App

4. Reverse sync could accidentally create loops during startup.

Mitigation:

- reuse the existing reverse-sync suppression mechanics
- add tests specifically for startup-from-`initial`

5. App startup can accidentally clear live linked-selection state even when
   Core initialized it correctly.

Mitigation:

- skip the initial provenance apply when there are no stored provenance entries
- add an App test that reproduces the clean-startup interval-selection case

## Verification Checklist

Before considering the work complete:

- `SelectionDomainRef` supports `initial`
- linked domains resolve configured `initial` when the linked interval is empty
- clearing the linked selection returns to default/data-derived domain
- zoomable + `sync: "oneWay"` is rejected, including locus/index defaults
- linked domains with persisted selections are not duplicated in App
  hash/bookmark state
- clean startup with empty provenance preserves a linked interval populated from
  `initial`
- interval selections still support `persist: false`
- docs and examples are updated
- focused Core and App tests pass

## Expected User-Facing Outcome

After this work:

- authors can define an initial detail extent for linked overview+detail views
- clearing the brush behaves intuitively by returning to the natural domain
- zoomable linked domains remain internally consistent
- overview brushes can be marked ephemeral without forcing statefulness
- bookmark/hash behavior becomes easier to reason about
