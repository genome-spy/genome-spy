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
- whether it contributes render occurrences and retains backend resources;
- whether it is currently presented and interactive.

Immediate hide/show can discard the very geometry and render membership needed
for an exit animation. Semantic zoom therefore needs these concepts separated,
but only for persistent views whose lifetime is already well defined.

CSS View Transitions offers a useful lifecycle model—match old and new visual
states, preserve an outgoing visual until the transition ends, and animate to
the new state—but GenomeSpy can initially keep persistent views live rather than
capture bitmap snapshots. See [CSS View Transitions Level 1](https://www.w3.org/TR/css-view-transitions-1/).

Clay's enter/exit transition model is useful evidence for two narrower
requirements: a disappearing parent owns the lifetime of its exiting subtree,
and exiting content needs an explicit position in sibling paint order. GenomeSpy
should adapt those requirements to persistent live views rather than Clay's
per-frame subtree cloning. See Clay's
[transition configuration](https://github.com/nicbarker/clay#clay_transitionelementconfig)
and [exit handling](https://github.com/nicbarker/clay/blob/main/clay.h#L4211-L4307).

## Intended behavior

- A zoom-dependent policy changes whether a persistent concat child participates
  in the target layout.
- One full layout computes the new targets for participating siblings.
- An exiting child remains drawable from its last presentation while siblings
  move toward their new targets; its opacity and exit geometry follow a defined
  policy.
- An entering child obtains render membership before presentation begins and
  animates from a defined parent- or sibling-relative start toward its target.
- Completion releases temporary exit state and updates backend occurrence
  topology once if render membership changes. WebGL may rebuild batches;
  WebGPU may update its ordered draw list while retaining compatible resources.
- Reversing direction during a transition continues from current presented
  geometry and opacity without a jump.
- Threshold hysteresis or an equivalent policy prevents flicker around semantic
  zoom boundaries.

The semantic track is the transition owner. Its layers and other descendants
initially enter and exit as a unit and do not create independent enter/exit
state. App `SampleView` peek remains the one specialized nested transition and
must compose with or be cancelled by the outer track transition explicitly.
Per-layer semantic behavior is not introduced in this phase.

Only instances participating in the target layout are interactive. An exiting
track stops participating in picking and interaction when its exit begins, even
though it remains drawable until presentation completes. An entering track uses
its presented geometry for interaction once it joins the target layout.

Exiting content also needs a deterministic paint position relative to reflowing
siblings. Evaluate underneath, previous natural order, and above-sibling behavior
using the representative semantic-track example, then select and test one
internal policy. A public ordering option is not required.

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
- Visibility, occurrence-topology, and backend invalidation semantics.
- Transition matching and lifetime from Phase 4.
- Picking, interaction routing, clipping, and opacity.
- Data/resource lifetime for persistently configured but non-participating
  tracks.
- WebGPU ordered occurrence submission and retained-handle cleanup at semantic
  enter/exit boundaries.

## Verification

- A representative concat view shows and hides persistent tracks while entering,
  exiting, and sibling reflow remain coherent at deterministic timestamps.
- At least one semantic track contains a `SampleView`. Filtering its samples and
  entering, exiting, opening, closing, or scrolling peek before and during the
  outer track transition preserves sample identity, clipping, picking, and
  cleanup without multiplying transition state.
- Descendant layers do not create independent enter/exit state when their
  semantic track transitions. Parent motion and SampleView peek are each applied
  exactly once.
- Reversing zoom direction at multiple transition points causes no coordinate or
  opacity jump.
- Hysteresis prevents repeated toggles near a threshold.
- Exiting content remains correctly clipped but is excluded from picking and
  interaction from the start of its exit.
- Exiting content follows the selected deterministic paint-order policy while
  siblings reflow through its previous area.
- Temporary state and obsolete backend occurrences are cleaned up after
  completion or cancellation.
- WebGPU keeps compatible handles for persistent semantic tracks across exit and
  re-entry, submits exiting content in the selected paint position, and excludes
  it from picking according to the shared interaction policy.
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
- WebGL batch rebuilding and WebGPU occurrence-topology updates at enter/exit
  boundaries must not occur on every animation frame. Resource reconstruction
  must remain independent of occurrence reordering.
- Active pointer capture must be cancelled or transferred deterministically when
  its track begins exiting.
- Exit paint order must work with retained WebGL mark-grouped batches and
  explicit WebGPU ordered draws; Clay's ordering choices are cases to evaluate,
  not an implementation to copy.
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
