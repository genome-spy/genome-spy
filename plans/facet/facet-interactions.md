# Facet cell interactions

The subsequent correctness and simplification review is complete; its final
verification and supported scope are recorded in
[facet-compatibility.md](facet-compatibility.md).

## Goal and contract

Route pointer input to the visible facet cell, resolve its picked datum, show
tooltips, and pan/zoom shared positional scales using that cell's plot bounds.
Keep one child subtree, parameter runtime, dataflow, and set of mark resources.
Selections and scale domains remain shared across cells; independent positional
scales and per-cell parameter runtimes are outside this change.

## Current implementation and decisions

`FacetView.arrange` computes cell rectangles and repeats the child with a tuple
`facetId`. WebGL and Canvas picking render those occurrences. The cell router
now carries that tuple to the child, picking retains it in mark hits, and the
parent grid navigates shared scales through the cell's full plot bounds.

- Retain the visible cell layout for hit testing, including the parent clip.
  Headers and spacing do not route input to an arbitrary child. Preserve the
  ordinary capture/bubble and propagation-stop rules for layered children.
- Carry the facet tuple through routed events and mark hits. A repeated view's
  enter/leave transitions must distinguish cells while ancestors outside the
  facet keep subtree semantics. Use cell geometry for coordinate consumers.
- Reuse the existing renderer-neutral picking and tooltip pipeline, including
  asynchronous invalidation. Repeated child-owned data can have the same datum
  and picking identifier in different cells, so hover identity includes the cell.
- Keep gesture ownership in the parent grid. Resolve a facet cell's plot bounds
  before calling the existing navigation path, deduplicate shared resolutions,
  preserve drag-scroll fallback, wheel claiming, and disposal cancellation.
- Add an optimization TODO only where the implementation exposes a concrete
  avoidable cost. This work must not depend on the rudimentary flow optimizer.

Vega's local `tmp/vega/packages/vega-view/src/events.js` and `events-extend.js`
associate events with scene items and compute coordinates relative to containing
groups. GenomeSpy can represent that occurrence with its existing facet tuple
and layout rather than creating scene/view/dataflow branches. No Vega code is
copied. Alternatives rejected: per-cell views/controllers (resource and runtime
duplication), a second facet-specific zoom implementation (diverging gesture
policy), and normalizing gestures against the complete facet grid (wrong anchor
and pan distance).

## Milestones and commits

1. **Cell routing and coordinates** — `feat(core): route pointer events into facet cells`.
   Update FacetView, Interaction, dispatcher, and coordinate consumers. Verify
   wrapped and tuple cells, clipping, layers, capture/bubble, propagation stops,
   cell transitions, and shared selection behavior through real laid-out specs.
2. **Picking and tooltips** — `fix(core): retain facet identity when picking marks`.
   Update renderer-neutral hit resolution and public hit conversion as needed.
   Verify different facet data and repeated child-owned data, hover changes,
   scoped picking, tooltip data, and existing asynchronous guards. Document any
   additive public hit field in its API type and existing feature changeset.
3. **Shared navigation and integration** — `feat(core): navigate shared scales from facet cells`.
   Adapt the grid's existing zoom target resolution to cell plot geometry.
   Verify wheel anchors, shared domains, mouse pan, touch gesture routing,
   scroll clipping/fallback, wheel claiming, and cancellation. Update facet
   documentation, changeset, and the main plan's current completion record.

## Acceptance and integration verification

- [x] Click and point selection reach the correct cell/layer with facet identity.
- [x] Enter/leave transitions use the correct old/new cell, including canvas exit.
- [x] Picking and tooltips resolve marks in later cells and repeated own datasets.
- [x] Shared scales zoom/pan once per gesture using the pointed cell's bounds.
- [x] Clipped cells and facet headers/gaps do not acquire a child target.
- [x] Scrolled facets retain correct picking and gestures; drag-scroll and
      disposal behavior follow the existing grid policy.
- [x] Browser input checks cover WebGL and Canvas with wrapped cells and a
      scrolled viewport; smoke the Anscombe and cars examples.
- [x] Focused subsystem tests, relevant full tests, workspace types, lint, Core
      build, and release checks pass. Measure runtime growth against `8ba72e478`
      and review additions for opportunities to consolidate.

Baseline physical lines: FacetView 450, GridView 2027, InteractionController
1206, InteractionDispatcher 201. Main risks are clipped versus full plot bounds,
stale asynchronous hits, repeated-data hover identity, and interfering with the
grid's gesture ownership or scroll fallback.

Routing milestone: the shared cell wrapper also supplies point-aware interval
brush projection. A document drag retains its initiating cell's full bounds;
the outer grid wrapper does not install a duplicate facet brush. Dispatcher
hover paths now use one map of views to facet tuples instead of a redundant
array/set pair. Focused tests cover layers, stops, tuple transitions, headers,
gaps, clipping, and a brush started in the second cell.

Picking milestone: collector indexing now skips empty leading batches, which
otherwise prevented inherited facet data from being picked. Hits and custom
tooltip contexts include `facetId`; public hits copy the tuple. Shared datum
occurrences have distinct hover/tooltip identity, and stale asynchronous tooltip
results cannot replace a newer cell's content. Real laid-out collector tests
cover inherited and child-owned datasets through explicit picking, public hit
conversion, hover notifications, and tooltip content. Existing asynchronous
picking and scoped interaction tests remain passing.

Navigation milestone: GridView selects the facet cell's full plot bounds and
uses its existing resolution/gesture path. It ignores stale mark snapping from
another cell. Tests cover shared layered resolutions, wheel claiming and
anchors, touch pan, document drag and disposal, clipped bounds, and viewport
drag-scroll fallback. Scrolling originally left the retained culled cell list
stale; scrollbar callbacks now schedule reflow when the scrolled subtree
contains facets, including an enclosing concat. The nearby TODO records
caching facet presence and refreshing only facet placements as future work.

Browser checks passed for inherited data, repeated child-owned data, and a
scrolled viewport in both WebGL and Canvas. Every scenario verifies explicit
picking, facet identity, custom tooltip content, click selection, wheel zoom,
and document mouse pan. Only development HMR websocket connection messages
were excluded from console-error checks; application errors were checked.

Final verification: all 518 unit-test files passed (4,796 tests; one skipped,
two todo). Workspace TypeScript checks, lint, Core build/schema/declarations,
API documentation generation, and release checks passed. Anscombe wrapped,
cars matrix, and the means example passed smoke checks in WebGL and Canvas.
The existing Core minor changeset covers this additive facet functionality;
the synchronized release group remains a minor release.

Physical lines in the principal runtime files changed from 450 to 500 in
FacetView, 2,027 to 2,059 in GridView, 1,206 to 1,246 in InteractionController,
and 201 to 212 in InteractionDispatcher. The additions implement occurrence
identity and cell geometry while retaining one child and one gesture owner;
the dispatcher's redundant array/set tracking was consolidated into one map.
Across runtime JavaScript under `packages/core/src`, the physical diff against
`8ba72e478` is +302/-116 lines, net +186, excluding tests and type declarations.

Public cell identity is limited to the `facet` operator. App sample faceting
uses overlapping shader-transformed bounds, which cannot identify the sample
from a rectangle hit; it retains its existing picking and navigation contract.
