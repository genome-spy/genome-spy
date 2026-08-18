# Phase 2: Establish Stable Layout Instances

Status: Draft; revise after the Phase 1 review

Tentative PR title: `refactor(core): identify persistent layout instances`

## Purpose

Define the smallest durable identity needed to associate repeated layout output
with rendering and, later, transition state. This phase is about identity and
ownership, not animation, batch reuse, or partial layout.

## Findings to preserve

A `View` object is not always a single rendered/layout instance. App
`SampleView` is the current critical example:

- Sample faceting repeats one hierarchy for the visible samples using stable
  sample keys, per-sample location/size options, and batch delimiters.
- Filtering changes the sample hierarchy and therefore repeated membership and
  order; peek changes the locations of existing sample instances without
  changing their sample identities.
- Axes, legends, titles, backgrounds, separators, scrollbars, selection
  rectangles, and ruler overlays may be generated or arranged as distinct roles.
- Two occurrences can have numerically equal rectangles now but diverge after a
  later layout; numeric rectangle equality is therefore not identity.

Core `FacetView` expresses the same general idea but is not functional currently.
Its row/column facet model should inform future compatibility, while acceptance
for this phase must come from working `SampleView` behavior. Do not add machinery
solely to make unsupported `FacetView` cases appear complete.

The previous attempt reconciled an ordered command list by cursor position and
later added per-view/per-facet rectangle slots. This demonstrated that retained
geometry is possible, but command position is an unsafe source of identity:
insertion or reordering changes every subsequent position and couples layout
reuse to render-command topology. Serializing arbitrary facet IDs for map keys
also adds allocation and leaves identity semantics implicit.

The current `Rectangle` class provides dynamic retained geometry by composing
accessor closures through `modify()`, `translate()`, `expand()`, intersection,
and union operations. This lets existing render callbacks observe upstream
changes, but every property read can reevaluate a dependency chain and
`flatten()` materializes another closure-backed object. The prototype's
`RectangleSlot` added another delegation layer. Stable instance identity should
not imply that this representation must be retained.

Dear ImGui provides a useful contrasting pattern: transient output can be
matched with retained state through explicit hierarchical IDs without retaining
every derived object. GenomeSpy should similarly distinguish stable identity
from the lifetime or representation of computed rectangles. See Dear ImGui's
[ID stack documentation](https://github.com/ocornut/imgui/blob/master/docs/FAQ.md#general-description-of-the-label-and-id-stack-system).

Clay independently demonstrates the same requirement in an immediate-mode
layout engine: stable element IDs connect regenerated output to transitions and
retained rendering, while parent-local IDs disambiguate reusable descendants.
Its transition example keys reorderable items with domain IDs rather than their
current list positions. Adapt the identity principle, not Clay's string hashing
or traversal-derived automatic IDs. See Clay's
[element-ID documentation](https://github.com/nicbarker/clay#element-ids) and
[transition example](https://github.com/nicbarker/clay/blob/main/examples/raylib-transitions/main.c#L1302-L1350).

## Intended outcome

- A documented identity scheme covers an ordinary view and all legitimately
  repeated or generated occurrences.
- Reorderable repeated instances use a semantic or domain key. An ordinal is an
  identity only when ordinal position is itself the stable semantic contract.
- Parent-instance scope is available where reusable generated descendants would
  otherwise collide, but identities are not serialized ancestor paths.
- A completed full layout exposes a deterministic set or sequence of keyed
  instance descriptions.
- Duplicate identities fail in tests rather than silently sharing geometry.
- Instance ownership and cleanup are explicit when facets or generated chrome
  disappear.
- Absence from one layout result does not by itself destroy a persistent
  instance; ownership determines lifetime independently of layout participation.
- Existing `view.coords` and `facetCoords` semantics are documented or wrapped
  so there is one source of truth for final layout geometry.

The likely identity ingredients are parent-instance scope where needed, view
identity, facet or repetition identity, and a small explicit rendering/layout
role. Exact key and storage types should be selected only after Phase 1 reveals
the simplest layout-result shape. Prefer structured or interned keys over
serialized paths or public hashes.

## Representation options to evaluate

1. A compact layout result rebuilt by every full pass, keyed so later phases can
   reconcile it with retained render and transition state.
2. Stable lightweight slots owned by views or by the root layout result and
   updated by each pass.
3. A hybrid in which only instances referenced by retained render commands get
   durable slots while other layout calculations remain ephemeral.
4. Flat numeric records or typed arrays indexed by stable instance identity,
   with derived rectangles and clips calculated once during layout or
   presentation updates rather than lazily on every read.

Prefer the option with the least duplicated state and clearest cleanup. Do not
introduce a general retained scene graph. Stable identity is required; stable
object allocation for every intermediate rectangle is not.

## Affected areas

- The Phase 1 layout-result boundary.
- `View.coords`, `facetCoords`, and `GridChild.coords` ownership.
- App sample-facet enumeration and the dormant Core `FacetView` design.
- Generated grid chrome and decorations.
- Layout snapshots and debug/test representations.

## Verification

- Ordinary, SampleView-faceted, and decorated views produce deterministic,
  unique identities across equivalent full layouts. Core `FacetView` may use
  design-level or focused identity tests until it is revived.
- Reordering or adding one occurrence does not accidentally transfer another
  occurrence's identity.
- Reusable generated descendants under different repeated parents remain
  distinct without relying on their traversal positions.
- Filtering samples preserves surviving sample identities and removes obsolete
  instances cleanly regardless of their previous array index.
- Peek preserves sample identities while their location and size records change
  continuously.
- Equal rectangles belonging to different instances remain distinguishable.
- Removed facets and generated decorations leave no stale owned state.
- SVG, WebGL, picking, and headless paths still agree on final geometry.
- A snapshot-friendly debug representation exposes identity, role, and numeric
  geometry without including unstable implementation details.

## Non-goals

- Keeping normal or picking batches alive across layout changes.
- Incremental measurement or arrangement.
- Target/presented coordinate separation.
- Public identity APIs or transition configuration.

## Risks and open questions

- Which current facet values have semantic identity, and which are merely
  traversal data?
- Should generated chrome use its own view identity, an owning-view role, or
  both?
- Can App sample-view repetition use the same Core mechanism without leaking
  App concepts into Core?
- Does storing both layout-result geometry and `facetCoords` create two sources
  of truth?
- Would a flat keyed result be simpler than persistent per-instance objects?
- Can cleanup remain ownership-driven without introducing frame generations or
  conflating non-participation with destruction?

## Phase acceptance and review gate

Proceed to batch retention only if the identity model is simpler than positional
command reconciliation and covers the representative repeated/decorated cases.
Remove any state that exists only for hypothetical animation behavior.

Tentative commit sequence:

1. `refactor(core): define layout instance identity`
2. `refactor(app): identify repeated sample layout instances`
3. `test(core): expose deterministic layout instances`
