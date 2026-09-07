# Container-spanning track annotations

## Goals and agreed scope

Implement #516 with the conversation's simplified grammar: optional `annotate:
(UnitSpec | LayerSpec)[]` on `vconcat` and `hconcat`, no wrapper and no placement
property. A nonempty array creates one implicit LayerView; empty/absent arrays
create none. All annotations paint in front of tracks. Include a small docs
example with toy tracks and translucent region rectangles. Implement the #515
container brush interaction fix using the same container geometry and ownership.

Non-goals: back placement, numeric annotation placement APIs, arbitrary wrapping
concat annotations, axis-grid migration, new mark types, a general event framework.

## Current architecture and precedents

`ConcatView.initializeChildren` constructs tracks through the view factory and
`GridView.syncGuideViews` creates generated overlays. GridView currently owns
container selection/ruler overlays, while GridChild installs descendant interval
controllers. `GridView.propagateInteraction` has a separate gap navigation route.
`scaleProjection.js` derives projections from non-chrome resolution members; it
currently unions ranges instead of checking actual alignment. Arrangement records
backend-neutral placements consumed by WebGL, Canvas2D, SVG, and WebGPU.

Baseline: gridView.js 2075 lines; gridChild.js 1050 lines (3125 combined).
Measure changed production helpers as well as these files at completion.

Matplotlib axvspan combines data x with normalized axes y:
https://matplotlib.org/stable/api/_as_gen/matplotlib.pyplot.axvspan.html
Use the same coordinate concept with existing GenomeSpy value/scale-null
encodings; no external code is copied. The existing generated selection marks
already use value: 1 for normalized placement.

## Contracts

- Annotation entries remain ordinary units/layers. Create the implicit layer
  through the existing factory lifecycle; inherit the concat's parameter/data
  scope with `inheritEncoding: false` so track encodings do not leak. Force the
  shared positional resolution on the internal layer and reject independent
  positional resolutions inside annotation layers.
- vconcat annotations project x/x2 through the concat's existing shared scale;
  hconcat annotations project y/y2. Do not introduce a new positional resolution
  or let annotations expand the track domain. Other styling channels remain
  ordinary data-driven encodings. Exclude only shared positional channel
  contributions (existing channel-level `domainInert` support), not the whole
  view: field-driven colors must still infer a domain. Annotation scale settings
  must not override the track projection; reject unsupported projection
  overrides at the annotation boundary. Explicit nested independent projections fail.
- Perpendicular positions use existing normalized unscaled encoding semantics:
  constants (`value`) or field/expression encodings with `scale: null`, with the
  existing x left-to-right and y bottom-to-top convention. Omitted endpoints
  retain ordinary mark defaults. Reject perpendicular data scales clearly.
- Bounds are the union of visible descendant track plotting rectangles, including
  interior gaps; exclude outer axes, titles, and overhang. Validate equal actual
  pixel spans on the shared dimension as well as resolution identity. Avoid
  treating annotation members as geometry sources. Empty visible track sets
  produce no annotation placement or container interaction surface. Geometry
  comes from visible track plotting placements (recursing through nested grids),
  not all scale members. Visible viewport bounds govern clipping/hit testing;
  content coordinates govern data projection for scrolling. Reject unequal
  shared projections rather than silently unioning them. Validate visible
  tracks, including after hide/show and track mutation.
- Default annotation marks to clipping at those plotting bounds, intersected
  with parent clipping. Preserve ordinary explicit `clip: "never"` as an escape
  hatch and document it; do not add a new hard-clipping mechanism.
  Internal gaps may include child chrome within the bounding plotting area;
  this is distinct from expanding bounds to include outer chrome.
- Paint the annotation layer after track content and generated guides. Array
  order is the default; retain ordinary nested layer zindex semantics and document
  any existing ordinary zindex behavior rather than adding ordering machinery.
  Track zindex must not move a track above the annotation layer.
- Decorative annotations must allow track navigation/selections. Honor existing
  mark picking/tooltip semantics for interactive marks; route a picked annotation
  to its view across tracks and gaps, without dispatching the same event twice.
- Keep annotations in traversal for dataflow, parameters, readiness, and disposal,
  but outside track layout and projection-source membership. Dynamic track changes
  must refresh projection validation and bounds without recreating annotation data.
- Reuse container plotting geometry for generated overlays and container-owned
  interval controllers. Preserve ruler controller semantics unless migration is
  required by the shared contract. Do not migrate axis grids.
- #515: GridView owns one controller per container-owned single-axis interval
  parameter. Decouple IntervalSelectionController from GridChild using a small
  explicit host contract for view, geometry, and overlay state, implemented by
  the two actual callers. Invoke container selection handling before child
  navigation, preserving nearest parameter owner/shadowing;
  descendants must not also create controllers for it. Accepted brush gestures
  stop before navigation. Preserve parameter shadowing, nested owners, explicit
  view extents, document-level drag continuation, filter/clear behavior, and
  disposal. Retain gap navigation's existing outer-guide hit area if needed;
  the selection surface itself remains plotting bounds. Consolidate geometry
  and dispatch where it reduces special cases, without changing navigation scope.

## Milestones and review gates

- [ ] M1 — Annotation grammar and container rendering foundation.
      Add typed grammar, implicit layer initialization, validation, common geometry,
      traversal and front rendering. Cover both orientations, layered/data-driven
      annotations, invalid scales/alignment, nesting, hidden/dynamic tracks, scope
      and disposal. Focused unit/layout tests plus SVG geometry, clipping, and paint
      order assertions; inspect shared backend consumers. Commit:
      `feat(core): add container-spanning annotation layers`.
- [ ] M2 — Container interaction ownership and #515.
      Route annotation picking and container brushes using the common surface;
      remove duplicate child ownership. Behavioral tests for create/translate/clear
      from tracks and gaps, x/y orientations, filters, drag release outside, no
      duplicate updates or simultaneous pan, nested/shadowed params, local extents,
      preserved unclaimed gap navigation and disposal. Commit:
      `fix(core): route container brush gestures across track gaps`.
- [ ] M3 — Documentation and integration.
      Document coordinate model and restrictions in concat reference and spec JSDoc;
      add self-contained toy tracks/rectangles example under examples/docs, following
      examples/README.md. Regenerate schema/doc artifacts as appropriate. Run focused
      WebGL screenshot check, inspect actual image, browser-test brush dragging from
      gaps and pan/zoom without brush claim; use an analogous horizontal fixture.
      Run workspace TypeScript, lint, and broader unit suite for shared-contract risk.
      Commit: `docs(core): illustrate track annotations and container coordinates`.

Before implementation: Luna xhigh reviews this plan against source and downstream
consumers; incorporate substantive findings, then commit the reviewed plan.
Implementation: Luna high performs milestones and commits each after verification.
Primary agent independently reviews full implementation, fixes substantive issues,
then performs a separate review exclusively for removal of unnecessary code.
Document checks, findings, and final size tradeoffs here. Reconcile all tasks and
commit final plan status; delete the temporary plan in a later commit when retiring
it for delivery.

## Risks and acceptance

Highest risks: annotation scale participation changing domains; stale geometry
from previous arrangements; nested concat projections; annotation hit targets
stealing gestures; guide recreation leaving duplicate controllers. Prefer existing
lifecycle hooks and explicit boundary rejection to recovery machinery.
Acceptance requires M1–M3 checks and both final review passes. Scope decisions
above resolve #516's outstanding grammar and clipping/order questions; if source
inspection reveals incompatible existing contracts, record the chosen narrow
adjustment before implementation rather than adding speculative abstractions.

## Review and verification record

Luna xhigh reviewed the plan against resolution, clipping, interaction, and view
lifecycle source. Incorporated eight findings: forced positional resolution,
positional-only domain exclusion, track-only viewport/content geometry, explicit
controller host/ownership, picked annotation routing, ordinary clipping escape
hatch, visible-track validation, and disabled track encoding inheritance.

Baseline: 62 GridView tests pass; all workspace TypeScript checks pass; WebGL
first.json smoke passes. Primary reproduced #515 using real mouse gestures:
track creation yielded x=[26.25,51.25], gap translation left the interval unchanged.
Scratch reproduction: /tmp/track-annotation-browser.mjs; local Core server :4173.
Primary owns final browser integration verification while Luna implements M1–M3.
