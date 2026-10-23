# Scrollable view anchors

Status: implemented, validated, and simplified after independent review; complete.

## Problem and goal

Scrollable views currently start at their top-left corner and preserve an offset
from that corner when content changes. The lambda phage experiment needs the
bottom label lanes next to the gene arrows to remain visible as pileup adds or
removes lanes. Horizontal layouts need the corresponding right-edge behavior.

Provide a declarative edge policy covering initial placement, content and viewport
size changes, and alignment when content is smaller than its viewport. Preserve
ordinary manual scrolling and existing top-left behavior by default.

## Grammar

Extend the object forms already accepted by `viewportWidth` and `viewportHeight`
with an optional `anchor` field. Do not add a view-level property or extend the
general `SizeDef` used by content `width` and `height`:

```ts
type ViewportSizeDef = (SizeDef | ExprRef) & {
    anchor?: "start" | "end";
};

viewportWidth?: number | "container" | ViewportSizeDef;
viewportHeight?: number | "container" | ViewportSizeDef;
```

`start` is the default. For width, start/end mean left/right; for height, they mean
top/bottom. These are physical screen edges, independent of scale reversal,
field order, or text direction. Each viewport dimension owns its anchor, without
inheritance. Initially support literal anchors only, without center anchors or
fractions.

Keep the existing size semantics and shorthands: numbers, `"container"`, ordinary
`SizeDef` objects, and scalar `ExprRef`s remain valid. Object sizing still uses
`px`, `grow`, `minPx`, and `maxPx`; for example, a growing right-anchored viewport
is `"viewportWidth": { "grow": 1, "anchor": "end" }`. An expression-based height
can use `"viewportHeight": { "expr": "labelViewportHeight", "anchor": "end" }`.
The expression keeps its existing finite-number-or-container result contract.
Do not add nested expressions to `px` or a new size wrapper.

An anchor-only object is invalid: use `grow: 1` explicitly to request container
allocation. This keeps the existing rule that a size object must define sizing.
As with the existing empty `SizeDef`, optional fields make such an object pass
the concise type/schema shape; reject it with a clear view-size error at runtime
instead of adding a union solely to require at least one size member.

The scrolling lambda label panel becomes:

```json
{
  "name": "labelPanel",
  "height": { "step": 20 },
  "viewportHeight": { "px": 200, "anchor": "end" }
}
```

Its existing index y scale stays non-zoomable. Bottom alignment also handles
sparse content, so this replaces the current minimum-height expression. A view
with a horizontal viewport can configure its width object's anchor independently;
a two-axis viewport can anchor both dimensions.

## Behavior contract

- Initially align content to the chosen edge, including after asynchronous data
  loading first introduces overflow. Do this before the first content placement,
  without rendering a frame at the wrong edge and scrolling afterward.
- With overflow, maintain the pixel distance from the chosen edge as content or
  viewport dimensions change. A view at the bottom stays at the bottom. A user
  who scrolls 80 pixels away stays 80 pixels away when the range permits.
- Manual scrolling changes that distance. Layout never unconditionally resets it
  to zero. Wheel direction, drag direction, and the physical scrollbar thumb
  position keep their existing meaning.
- Clamp the distance when the available scroll range shrinks. If content fits,
  reset the distance to zero and align the content to the chosen edge. Subsequent
  growth starts at that edge again.
- For content smaller than the viewport, bottom/right alignment leaves empty
  space above/to the left. There is no scrollable range, and wheel input remains
  available to an enclosing scroller or genomic navigation.
- Each nested viewport owns its own policy and distance. Recreating a view starts
  a new distance; ordinary relayout does not.

For example, with 600 pixels of content and a 200-pixel viewport, bottom alignment
starts at physical offset 400. After scrolling upward to offset 320, the distance
from the bottom is 80. Growing the content to 800 yields offset 520, rather than
forcing offset 600 or retaining offset 320.

This preserves geometric distance, not the identity of a gene, row, or facet when
data is reordered. It is not a separate chat-style follow-output policy.

## Implementation approach

Keep scroll state and projection in the existing layout subsystem:

- `packages/core/src/spec/view.d.ts`: declare and document the viewport-only
  object extension. Keep general `SizeDef` unchanged. Existing restrictions on
  viewport dimensions already exclude anchoring from surround specifications and
  repeated facet children; preserve them.
- `packages/core/src/view/view.js`: validate the literal anchor while preserving
  size resolution and dimension-level expression invalidation. Read anchor
  metadata from the authored viewport object separately from its resolved size.
  Keep `flexLayout.js` concerned with numeric sizing; its current `parseSizeDef`
  already extracts the size fields from recognized objects.
- `packages/core/src/view/gridView/gridChild.js`: pass the declaring view's
  viewport-width/height anchor to each scrollbar. Defaults remain unchanged.
- `packages/core/src/view/gridView/scrollbar.js`: store a private distance from
  the selected edge, initialized to zero. Preserve physical top/left semantics
  for `viewportOffset`, `setViewportOffset`, wheel/drag input, and callbacks.
  Derive a separate signed translation for content alignment.
- `packages/core/src/view/gridView/gridView.js`: bind viewport/content dimensions
  and clamp scroll state before arranging child content. Apply the derived
  translation to the existing live content rectangle, and bind scrollbar geometry
  before materializing unions or arranging descendants. `updateScrollbar` reads
  content dimensions, so the existing translated rectangle can serve this purpose;
  a separate unshifted rectangle hierarchy is unnecessary. Keep viewport rectangles, clip
  bounds, viewport-hosted chrome, and following-track layout stationary. Preserve
  existing decoration attachment rules: scrolling axes and facet headers/titles
  that follow content must continue to move with it.
- `packages/core/src/view/gridView/gridChildArrangement.js`: keep scrollbar paint
  ordering, but remove the late geometry mutation from its decoration callback.
  It currently updates scrollbar geometry after content has been arranged; that
  is too late for nested layout, flattened rectangles, and materialized unions.

For either axis, let `C` be content size, `V` viewport size, `M = max(C - V, 0)`,
and `d` the anchor distance clamped to `[0, M]`:

| Anchor       | Physical scroll offset | Content translation        |
| ------------ | ---------------------- | -------------------------- |
| Left/top     | `d`                    | `-d`                       |
| Right/bottom | `M - d`                | `-(M - d) + max(V - C, 0)` |

The positive translation for fitting content is alignment, not a negative scroll
offset. This distinction preserves wheel claiming and existing callers. Read
dimensions through the existing rectangle contract; do not add a parallel layout
model or retain redundant previous-size state.

Keep smoothing in physical coordinates while preserving anchor-relative scroll
state, and prevent pending interpolation from restoring an old physical position
after a geometry change. Clamp/reseed pending targets when
necessary. Stop an old smoother before replacing it; the current reinitialization
path does not do so. Keep this local to the scrollbar.

### Downstream compatibility

Outer facet viewports should acquire anchoring through their ordinary hosting
`GridChild`; their cells, headers, axes, and interaction coordinates must follow
the same translated content rectangle.

App's custom sample scroller is different. In
`packages/app/src/sampleView/sampleView.js`, `LocationManager` owns scrolling and
publishes an effective physical offset in `onBeforeRender`. Keep that ownership
and its default top anchor unchanged. Because `SampleSpec` inherits `ViewSpecBase`,
keep its viewport types limited to the existing unanchored size forms in
`packages/app/src/spec/sampleView.d.ts`. Reject an explicitly anchored viewport
object on a sample view until that separate scrolling contract supports it.
Ordinary Core viewports embedded in App support anchored objects normally.

The feature operates on shared layout rectangles, so WebGL, Canvas2D, SVG export,
and the experimental WebGPU consumer must agree without renderer-specific
anchoring code. Picking, rulers, and selections must use the same translated
coordinates as rendering.

## Established patterns and alternatives

[SwiftUI's defaultScrollAnchor](<https://developer.apple.com/documentation/swiftui/view/defaultscrollanchor(_:)>)
similarly treats the anchor as a policy for initial placement and size changes.
[React Virtuoso](https://virtuoso.dev/react-virtuoso/api-reference/virtuoso/)
separates alignment of short content from following newly appended output. That
distinction is useful: this proposal combines edge placement and geometric
distance preservation, without adding a streaming-list following policy.
These are API comparisons; no external code is copied or adapted.

Alternatives considered:

- An initial-scroll-only option fixes first load but loses the selected edge as
  pileup or viewport dimensions change.
- Reversing the y scale changes row ordering and does not implement viewport
  alignment. Assigning an internal scrollbar offset from page JavaScript is not
  a standalone grammar solution.
- Separate initial-position, short-content-alignment, and resize-policy options
  would offer more control but add configuration beyond this use case. Defer
  them until a concrete layout needs independent policies.
- A new view-level anchor property separates the policy from the dimension it
  configures. Extending the existing viewport object keeps that configuration
  together and avoids another top-level property.
- A nested `{ "size": ..., "anchor": ... }` wrapper would duplicate existing
  size forms. Extending recognized `SizeDef` and `ExprRef` objects reuses the
  grammar's current sizing and expression paths.

## Scope, risks, and design decisions

No scale-domain changes, data reordering, DOM scrolling, new dependencies, public
imperative scroll API, scroll-position parameters, or App bookmark/provenance
format changes are planned. Existing specifications need no migration. This is
new backward-compatible Core functionality and warrants a Core minor changeset
when implemented; the proposal itself has no release impact.

The main risks are changing scroll state after nested content has already been
laid out, stale smoother callbacks, mismatched input/render coordinates, and
accidentally overriding App's sample-scrolling ownership. Fractional coordinates
and the existing x-only leader clipping need browser verification.

The viewport object extension follows the requested API direction. Manual
scrolling changes the preserved pixel distance from the selected edge.

## Estimated SLOC impact

Planning estimate against `HEAD` at `1bf953505`, not a measured implementation
diff. Count nonblank lines containing code, excluding comments, using the
repository's production-line policy. The existing WebGL fix and uncommitted
lambda example work are outside this feature estimate.

Target about **100 net production JavaScript SLOC**, with **70-130** a realistic
range for a lean implementation:

| Area                                                                 | Estimated net runtime SLOC |
| -------------------------------------------------------------------- | -------------------------: |
| Viewport anchor lookup and validation                                |                     +25-40 |
| Scrollbar state, projection, alignment, and smoother synchronization |                     +30-55 |
| Grid preparation and translation                                     |                      +3-10 |
| Scrollbar construction wiring                                        |                      +6-10 |
| Removal of the late geometry update                                  |                       -1-3 |
| App sample-view validation boundary                                  |                      +8-14 |

The rounded range is a forecast, not a sum of simultaneously achievable extremes.
Type declarations add approximately **10-20 SLOC**, separately. Full behavior and
integration coverage is likely **350-650 test SLOC**, using existing helpers.
Documentation, example specs, generated schemas, and release-note prose are
excluded from these runtime and declaration estimates.

The main uncertainty is synchronizing smoothing with size changes. Reuse the
existing rectangle and interpolation paths; avoid new retained geometry or
pending-target frameworks. Runtime growth materially beyond 150 SLOC should
trigger a simplification review against the agreed scope.

## Implementation milestone

- [x] Implement the grammar, anchor-relative scrollbar state, early layout
      preparation, underflow alignment, and App type restrictions as one coherent
      change. Keep existing default behavior and physical-offset callers compatible.
- [x] Cover the contract with focused headless spec-to-layout tests in the
      existing grid/facet suites. Test bottom and right independently, two axes,
      nested viewports, initial async overflow, fitting content, growth/shrinkage,
      manual distance preservation, viewport resize, shrink-to-fit then growth,
      pending smoothing, and wheel/drag endpoint behavior. Use representative
      assertions rather than duplicating the offset arithmetic in every case.
      Cover numeric, container, flexible/constrained object, and expression-based
      viewport sizes; reject anchor-only objects and anchors on content sizes.
- [x] Add a compact structured SVG case for anchored mark/guide geometry and
      clipping. Preserve the existing App sample-scroll tests; run relevant Core and
      App schema/type checks, and inspect release impact with the changeset workflow.
- [x] Document the viewport object extension and resize semantics in specification JSDoc and
      `docs/grammar/composition/concat.md`; add a maintained small example covering
      bottom/right anchoring. Update the private scrolling lambda copy to use the
      anchored viewport object and ordinary step height; keep private files out of the commit.

Intended outcome: authors can keep labels or tracks adjacent to the bottom/right
of a stable viewport while retaining normal manual scrolling. All consumers see
the same content placement. Tentative commit:
`feat(core): anchor scrollable views to viewport edges`.

Review the public contract and the layout/App ownership boundary together. Keep
implementation, meaningful tests, documentation, and release note in the same
review; do not split off cosmetic review or measurement milestones.

## Final integration and acceptance

- Default top/left examples retain their existing placement and input behavior.
- In `private/lambda-phage-vconcat/gene-map-scrollable.json`, initial load shows
  the bottom lanes, sparse labels align to the arrow track, and rapid horizontal
  navigation changes label content height without moving the arrow panel or
  losing bottom anchoring. Scrolling away from the bottom remains possible.
- The maintained horizontal counterpart starts at the right and handles viewport
  resize, shrinking data, and manual scrolling symmetrically.
- Test an outer facet and a nested viewport with axes, headers, selection, and
  picking. Check App's sample pane with sticky summaries and existing scrolling.
- Verify shared layout/SVG geometry and browser rendering at fractional device
  pixel ratios, including leader continuity at the label/arrow boundary. No
  first-frame jump, stale animation reset, or claimed wheel input without overflow
  is acceptable.
- After implementation, reconcile these tasks and retire the temporary plan
  according to the repository workflow before creating a PR or merging.

## Local validation record

- Implemented both anchors without changing general content-size objects or
  physical-offset callers. App sample panes reject explicit anchors while ordinary
  Core views embedded in App support them.
- Focused tests cover both axes, fitting and overflowing content, distance
  preservation and clamping, flexible/constrained viewport sizing, expression
  changes, asynchronous data growth in an outer facet, nested viewports, attached
  axes, wheel boundaries, stale interpolation callbacks, App-style synchronization,
  disposal, and SVG clipping.
- Browser validation used the private scrolling lambda spec with rapid animated
  zoom, native scrollbar dragging, viewport resizing, and device pixel ratio 1.25.
  A final 41-frame animated navigation trace had no stale content heights or gaps
  between the label and arrow tracks, and no WebGL errors.
- That trace exposed an existing scheduling problem: a transition could change
  the lane domain while queuing its layout for the next frame. GenomeSpyBase now
  coalesces pending layout and applies it after animation callbacks, before draw.
  A real Engine/Animator regression test covers that frame boundary.
- The private label viewport now fills the container above the arrow track with
  `{ "grow": 1, "anchor": "end" }`, as requested during validation. All vertical
  connectors use x-only clipping. The fixed-lanes and original adaptive copies
  remain unchanged.
- Core/App schemas and type checks, focused lint/format checks, documentation
  build, doc-embed production build, and the release-note checks pass. The user
  authorized committing the feature with its changeset after the KISS review.
- Discarded additional bespoke header/selection/picking fixtures from this
  milestone: the shared layout implementation is covered by nested/facet/SVG
  geometry tests and existing facet interaction, App scrolling, and live Canvas
  regression suites. No new selection or picking behavior was introduced.

Independent KISS review identified two simplifications, both implemented:
animate physical offsets directly without a forwarding facade, and store the
geometric dimension once instead of repeatedly deriving it from scroll direction.
The existing interpolation regression now covers both anchors with the same
physical target and per-frame external synchronization.

The final runtime implementation adds 74 net non-comment JavaScript lines against
`1bf953505`, down from 91 before the review and within the original estimate.
Tests, declarations, docs, private specs, and the prior WebGL fix are excluded.
