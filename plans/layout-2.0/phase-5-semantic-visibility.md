# Phase 5: Semantic Visibility for Persistent Concat Children

Status: Early draft; revise after the Phase 4 review

Tentative PR title: `feat(core): transition semantic track visibility`

## Purpose

Support the motivating semantic-zoom scenario: zoom-dependent concat children
enter or leave layout smoothly while the configured views, data, and expensive
resources remain persistent.

This is intentionally narrower than general structural view transitions.

## Findings to preserve

Current configured visibility tends to conflate several different facts:

- whether a view exists in the configured hierarchy;
- whether it participates in target layout;
- whether it has render commands/resources;
- whether it is currently presented and interactive.

Immediate hide/show can discard the very geometry and render membership needed
for an exit animation. Semantic zoom therefore needs these concepts separated,
but only for persistent views whose lifetime is already well defined.

CSS View Transitions offers a useful lifecycle model—match old and new visual
states, preserve an outgoing visual until the transition ends, and animate to
the new state—but GenomeSpy can initially keep persistent views live rather than
capture bitmap snapshots. See [CSS View Transitions Level 1](https://www.w3.org/TR/css-view-transitions-1/).

## Intended behavior

- A zoom-dependent policy changes whether a persistent concat child participates
  in the target layout.
- One full layout computes the new targets for participating siblings.
- An exiting child remains drawable from its last presentation while siblings
  move toward their new targets; its opacity and exit geometry follow a defined
  policy.
- An entering child obtains render membership before presentation begins and
  animates from a defined parent- or sibling-relative start toward its target.
- Completion releases temporary exit state and may rebuild the batch once if
  render membership changes.
- Reversing direction during a transition continues from current presented
  geometry and opacity without a jump.
- Threshold hysteresis or an equivalent policy prevents flicker around semantic
  zoom boundaries.

Layers within one semantic track should initially enter and exit as a unit.
Arbitrary child insertion, removal, reparenting, and facet restructuring may use
the existing immediate structural fallback.

## Policy and API questions to defer

The first implementation needs a controllable internal policy but need not
commit to public grammar. Candidate sources include a parameter expression,
application state, or a later declarative visibility property. Decide only after
a concrete semantic-zoom example proves the desired threshold and hysteresis
behavior.

Likewise, initial enter/exit geometry, opacity, duration, and easing should begin
with one coherent internal policy. General per-view transition customization is
not required to validate the architecture.

## Affected areas

- Concat/grid participation and sizing.
- Visibility and scene-invalidation semantics.
- Transition matching and lifetime from Phase 4.
- Picking, interaction routing, clipping, and opacity.
- Data/resource lifetime for persistently configured but non-participating
  tracks.

## Verification

- A representative concat view shows and hides persistent tracks while entering,
  exiting, and sibling reflow remain coherent at deterministic timestamps.
- At least one semantic track contains a `SampleView`. Filtering its samples and
  entering, exiting, opening, closing, or scrolling peek before and during the
  outer track transition preserves sample identity, clipping, picking, and
  cleanup without multiplying transition state.
- Reversing zoom direction at multiple transition points causes no coordinate or
  opacity jump.
- Hysteresis prevents repeated toggles near a threshold.
- Exiting content remains correctly clipped and pickable only according to the
  chosen interaction policy.
- Temporary state and obsolete batch commands are cleaned up after completion or
  cancellation.
- Disabled transitions, reduced motion, headless rendering, and unsupported
  structural changes use deterministic immediate behavior.

## Non-goals

- A general CSS-compatible transition API.
- Bitmap snapshots unless live persistent rendering proves insufficient.
- Smooth arbitrary insertion, removal, reparenting, or facet topology changes.
- Per-layer semantic behavior inside a track.
- Incremental layout.

## Risks and open questions

- Non-participating persistent views may retain data and GPU memory indefinitely;
  resource policy needs measurement.
- Batch rebuilding at enter/exit boundaries must not occur on every animation
  frame.
- Interaction with exiting content needs an explicit rule.
- Target layout has no rectangle for an exiting child, so exit geometry must be
  presentation-only and must not leak back into sizing.
- Semantic thresholds based directly on animated geometry could create feedback;
  policy should use stable zoom/application state.

## Phase acceptance and review gate

The phase succeeds when the concat semantic-zoom scenario works without general
structural-transition machinery. Before expanding scope, evaluate whether live
views are sufficient, whether retained hidden resources are acceptable, and
whether a public API is now justified by actual use.

Tentative commit sequence:

1. `refactor(core): separate layout participation from presentation visibility`
2. `feat(core): transition persistent concat children`
3. `test(core): cover semantic zoom interruption and hysteresis`
