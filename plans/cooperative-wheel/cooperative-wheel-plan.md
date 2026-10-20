# Cooperative wheel interaction

Status: proposal. No runtime implementation is included.

Issue: https://github.com/genome-spy/genome-spy/issues/584

## Recommendation

Add `wheelBehavior?: "default" | "cooperative"` to `EmbedOptions`, with
`"default"` preserving existing behavior. In cooperative mode, ordinary wheel
input scrolls a vertically overflowing view or the surrounding page; Ctrl+wheel
uses GenomeSpy's existing genomic navigation. Keep this policy at the embedding
boundary because the host knows the surrounding page's navigation requirements.

The embedding application owns any Ctrl-zoom hint, its wording, placement, and
visibility. GenomeSpy must not display a hint, overlay, tooltip, or notification
for this option. An embedding example may show host-authored explanatory text.

Extend the existing wheel ownership mechanism rather than introducing a generic
gesture framework. Resolve the intended consumer synchronously on the native
event, before native cancellation and before adding zoom inertia.

## Goals and non-goals

- Allow people to scroll a page through an embedded visualization without
  accidentally zooming the genome.
- Retain Ctrl+wheel genomic navigation, including wheel-based trackpad pinch.
- Support ordinary wheel scrolling for Core's vertical viewports and App's
  close-up sample collection, with outward chaining at scroll boundaries.
- Preserve the default interaction behavior, public event hooks, view hit
  routing, and renderer independence.
- Give ownership probing and actual handling the same eligibility rules.

Do not change touchscreen gestures, mouse dragging, keyboard navigation, scale
mathematics, App provenance/bookmarks, or default standalone App configuration.
Do not add automatic detection of scrollable pages, per-view policy options,
configurable modifier keys, a general event-filter callback, or hint UI.

## Current implementation and constraints

- `packages/core/src/types/embedApi.d.ts` declares `EmbedOptions`.
  `embedFactory.js` forwards these options to `GenomeSpyBase`, which constructs
  `genomeSpy/interactionController.js`. App's `appTypes.d.ts` extends the same
  options and `app.js` passes them to Core. No App-specific public option is
  necessary; check the React wrapper's forwarding as a downstream consumer.
- The native wheel handler in `genomeSpy/interactionController.js` dispatches a
  `wheelclaimprobe`, cancels browser scrolling when claimed, and generates
  synthetic wheel events through `utils/inertia.js`. The probe currently has
  only a type and cannot distinguish modifiers, direction, or scroll capacity.
  A check only in `view/zoom.js` would happen after native cancellation.
- `utils/interaction.js` has a boolean `wheelClaimed` flag. `GridView` claims
  zoomable content, shared axes, and gaps. Probe routing and real event routing
  must agree across nested concats, annotations, and facet cells.
- `view/gridView/gridView.js` already finds enclosing overflowing scrollbars
  for content dragging. Its `scrollBy` helper has drag-oriented signs;
  `scrollbar.js` owns clamping and smoother synchronization. `canScroll()`
  detects overflow, not capacity in a requested direction. Core currently has
  no ordinary wheel scrolling for these viewports.
- `sampleView/sampleView.js` captures plain wheel in close-up mode to scroll
  samples, then clears the downstream vertical delta. Ctrl bypasses this path.
  Its probe claims genomic zoom over the main pane but does not represent
  sample scrolling, including scrolling over the metadata sidebar.
  `locationManager.js` owns the clamped sample offset.
- `view/gridView/intervalSelectionController.js` resizes active interval
  selections with wheel input and supports authored event filters. Point
  selection definitions can also use `on: "wheel"`. These consumers must not
  accidentally take plain wheel input from the host in cooperative mode.
- `api.events.subscribe("wheel", ...)` runs synchronously before view handling.
  `preventViewDefault()` vetoes GenomeSpy handling; browser cancellation is a
  separate call on the native source event. Preserve that distinction.

## Proposed interaction contract

The option is fixed for an embedded instance. Omission is equivalent to
`"default"`; invalid values fail at the option boundary. Cooperative behavior
applies only to wheel input, not direct touchscreen gestures.

| Surface/state in cooperative mode           | Ordinary vertical wheel          | Ctrl+vertical wheel      |
| ------------------------------------------- | -------------------------------- | ------------------------ |
| Core view with no vertical scrolling        | Browser/page                     | Existing view navigation |
| Core view with available vertical scrolling | Scroll nearest eligible viewport | Existing view navigation |
| App main pane, overview                     | Browser/page                     | Genomic x zoom           |
| App main pane, close-up                     | Scroll samples                   | Genomic x zoom           |
| App sidebar, overview                       | Browser/page                     | Browser behavior         |
| App sidebar, close-up                       | Scroll samples                   | Browser behavior         |

For this table, browser/page means no GenomeSpy cancellation or wheel side
effects. Ctrl routes through existing view handling, so an eligible active brush
may resize before viewport zoom, following current interaction priority.

Detailed rules:

1. Classify direction using the existing dominant-axis rule: horizontal when
   `abs(deltaX) > abs(deltaY)`, vertical otherwise. Ignore a zero delta vector.
   Unmodified horizontal-dominant wheel is left to the browser in cooperative
   mode. Ctrl+horizontal-dominant wheel retains existing genomic pan routing.
   A consumed vertical-dominant event scrolls only vertically; do not split its
   minor horizontal component between the chart and browser.
2. Ordinary vertical wheel searches from the innermost pointed scrollable
   viewport outward for one that can move in the requested direction. Include
   App close-up sample scrolling as a consumer on main and sidebar surfaces.
   When no consumer can move, let the browser scroll the surrounding page.
3. One native event has one owner. Clamp a consumed scroll to its owner's range;
   do not redistribute leftover deltas or synthesize DOM events to scroll the
   page. Later native events can chain outward once that owner reaches its end.
4. Normalize pixel, line, and page wheel deltas consistently for internal scroll
   capacity checks and application. Use a documented line step and the owning
   viewport height for page deltas. Preserve current zoom sensitivity and
   native browser deltas. Do not add zoom inertia to ordinary scrolling: a
   trackpad already supplies its own momentum.
5. Ordinary cooperative wheel does not invoke built-in wheel navigation or
   declarative wheel selection gestures, including interval resize and point
   selection `on: "wheel"`. Hosts can observe or override input with the native
   event API. Ctrl events retain authored event filters; incompatible filters
   simply do not match. Document this opt-in precedence explicitly.
6. Cancel the native event only for a claimed internal scroll or chart gesture.
   Keep an eligible Ctrl navigation gesture claimed at scale limits, so reaching
   a genomic limit does not suddenly zoom the browser page. Outside eligible
   chart surfaces, leave Ctrl input to the browser. Use a non-passive wheel
   listener where cancellation is required.
7. A new event that changes owner or intent must stop the previous synthetic
   wheel zoom immediately, including a new page-scroll event or a host veto.
   `Inertia.cancel()` currently decelerates; do not mistake that for stopping
   publication. Keep ordinary uninterrupted zoom smoothing compatible, and
   ensure disposal cannot publish later wheel effects.
8. Native subscribers see each real event before policy handling, with unchanged
   source-event identity. A host veto wins. Do not emit extra native callbacks
   for probes, synthetic inertia, or internal scroll execution.

Ctrl eligibility uses `ctrlKey`, including pinch-generated wheel events. Do not
substitute Command on macOS or try to infer whether Ctrl came from a keyboard
or trackpad. Actual device/browser behavior still needs integration verification.

## Ownership design

Pass the selected wheel behavior from `GenomeSpyBase` to the interaction
controller. Extend the internal probe contract with the native wheel's deltas,
modifiers, and resolved intent. Record a small explicit outcome: unclaimed,
scroll, or navigation, together with the selected consumer needed for execution.
Keep this ephemeral to the current input event; do not add persistent view state
or a second hit-testing system.

Let `GridView` and `SampleView` identify their own eligible consumers through
the existing view routing. Share scroll-capacity and navigation eligibility
between the side-effect-free probe and execution; do not mutate offsets or
domains during probing. The controller cancels the original browser event and
executes the chosen action synchronously. Only navigation enters the existing
zoom smoothing path, preserving event modifiers and direction in synthetic
events. Ordinary scrolling bypasses raw wheel selection/default navigation
dispatch to honor the host policy.

Keep the `"default"` path compatible. Avoid replacing the entire wheel system
solely to support this option; share the new ownership representation where it
reduces duplicate decisions, but retain current default scroll/zoom priorities.

## Alternatives considered

- **Only `wheelZoom: "always" | "ctrl"`:** a smaller public option, but its name
  does not explain horizontal panning, internal scrolling, or selection
  precedence. A page-friendly interaction mode needs those decisions together.
- **Host native-event filtering:** already possible with `preventViewDefault`,
  but it suppresses internal scrolling and bypasses existing inertia cleanup.
  Retain the API for host customization rather than using it to implement the
  built-in mode.
- **General callback or event-stream grammar:** D3's
  [zoom filter](https://d3js.org/d3-zoom#zoom_filter) and Vega-Lite's
  [filtered wheel selection zoom](https://vega.github.io/vega-lite/docs/selection.html#zoom)
  are useful precedents, but a generic filter alone does not resolve nested
  scroll ownership. No additional grammar or callback API is needed here.
- **Automatic cooperative behavior:** Google Maps provides
  [cooperative gesture handling](https://developers.google.com/maps/documentation/javascript/interaction).
  Adopt the explicit mode concept, with wheel-only scope and no automatic
  iframe/page detection. These are design references; no upstream code is copied
  or closely adapted, so no third-party source/license integration is planned.

## Implementation milestones

### 1. Wheel policy and Core viewport ownership

- [ ] Add and validate the option, forward it to the controller, and extend the
      existing probe/outcome contract in `interactionEvent.js` and `interaction.js`.
- [ ] Route cooperative ordinary input to direction-aware vertical viewport
      scrolling, then the browser; reuse scrollbar offset/clamping mechanics.
- [ ] Gate built-in and declarative wheel gestures consistently, preserve native
      subscriber precedence, and stop stale synthetic zoom when ownership changes.
- [ ] Cover actual domains, offsets, selected values, and native cancellation
      through focused controller/GridView integration tests. Include shared axes,
      gaps, nested viewports, facets, brush precedence, and zero/horizontal deltas.
      Review related tests and remove duplicated implementation-detail assertions.
- [ ] Document the embed option and precedence in `docs/api/embed-options.md`;
      include host ownership of the Ctrl-zoom hint. Add a Core minor changeset when
      the runtime feature is implemented, replacing this branch's empty marker.

Affected areas: Core embed types/constructor, interaction controller and event
contracts, GridView/scrollbar, selections, and downstream App/custom view probes.
Any shared probe change must preserve existing App behavior during this step.
All live renderers use this same input pipeline; no renderer API changes.

Tentative commit: `feat(core): add cooperative wheel navigation for embeds`

### 2. App cohort scrolling and embedding integration

- [ ] Adapt `SampleView` to the shared ownership rules. In cooperative mode,
      represent sample scrolling on main and sidebar surfaces independently from
      genomic zoom; chain outward at close-up scroll boundaries.
- [ ] Preserve overview/close-up and sidebar behavior in default mode, without
      introducing bookmark or provenance state. Confirm inherited App options and
      React forwarding require no duplicated public configuration.
- [ ] Exercise App's main/sidebar matrix with real sample offsets and genomic
      domains, including close-up at the top/bottom and switching modes during
      inertia. Use existing `sampleView.test.js`/`locationManager.test.js` seams.
- [ ] Add a vertically scrollable host example under
      `packages/embed-examples/src/` with cooperative Core and App cases and
      host-authored Ctrl-zoom text. Explain optional App behavior in
      `docs/sample-collections/analyzing.md` and the embed example index.
      Update the same changeset for any direct App release impact.

Affected consumers: embedded App, Core/App example hosts, React integration,
metadata/sample sidebar surfaces, and native event subscribers. No Core hint UI.

Tentative commit: `feat(app): support cooperative wheel scrolling in cohort views`

### 3. Final browser integration and delivery

- [ ] Run focused affected Vitest suites with the `agent` reporter, workspace
      TypeScript checks, lint, and the applicable documentation/example checks.
- [ ] In a real scrollable page, verify body or enclosing scroll-container
      movement and unchanged domains for plain wheel, Ctrl genomic zoom/pan without
      browser zoom, nested scroll chaining, active brush behavior, and host vetoes
      during inertia. Include wheel entry through shared axes, gaps, and facets.
- [ ] Use `examples/core/layout/grid/scrollable_viewport.json`,
      `examples/core/facet/sine_offsets_scrollable.json`, and
      `examples/app/samples.json` in the host harness. Test Core with Canvas2D and
      WebGL2 and a supported simple WebGPU spec where available. SVG export has no
      input path; existing export behavior must remain unchanged.
- [ ] Verify physical mouse wheel and trackpad pinch/two-finger scrolling in
      Chromium, Firefox, and Safari where available. Record unavailable device or
      browser coverage rather than replacing it with synthetic-event claims.
- [ ] Review the shared ownership/public contract after milestones 1-2 and the
      final Core/App integration. Fix material issues without recursive reviews for
      wording. Verify release checks and reconcile every remaining plan task before
      committing the completed/discarded record, then delete the plan in a later
      commit before creating a PR.

This is an integration gate, not a separate implementation commit unless
verification reveals an independently meaningful change. Follow the
`debug-genomespy-web`, `write-genomespy-docs`, and `test-genomespy-views` skills
when their respective browser, docs, or structured-view workflows are needed.

## Risks, unresolved questions, and acceptance

- **Browser/device verification:** native Ctrl/pinch cancellation and gesture
  transitions are not established by this code-level proposal. The wheel-event
  [platform documentation](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event)
  describes pinch-related Ctrl events and cancellation limitations. Confirm the
  browser matrix before treating pinch support as delivered.
- **Public API and authored events:** `wheelBehavior` and the cooperative
  override of declarative wheel selection gestures are proposed contracts.
  Review them before implementation; the default mode must remain compatible.
- **Scroll delta normalization:** choose a documented line-step constant during
  implementation and verify it on real devices. Native browser/page scrolling
  must receive its original event, without manual pixel scrolling.
- **Routing:** App sidebar scrolling, annotation/facet surfaces, and nested
  viewport ownership are the principal correctness risks. Resolve them through
  existing hit routing rather than cached approximate rectangles.

Acceptance requires the interaction table and detailed rules above, unchanged
default behavior, real page-scroll verification, no duplicate scroll/zoom
effects, and no GenomeSpy-generated Ctrl-zoom hint. The host example demonstrates
that an embedding application can provide its own hint with ordinary DOM text.
