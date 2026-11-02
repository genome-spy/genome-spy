# Interactive gradient legends

Status: milestone 1 implemented; milestones 2 and 3 pending.
Independent plan smell/KISS/DRY reviews complete.
Issue: [#610](https://github.com/genome-spy/genome-spy/issues/610).
Base: `master` at `679b6b59d` (2026-11-02), including categorical legend
binding from #609 / #637 and categorical projections from #608.
Branch: `codex/interactive-gradient-legends`.

This change adds a one-dimensional numeric brush to a gradient legend. It
writes an ordinary interval selection, so chart highlighting, explicit filters,
expressions, embedding APIs, and App persistence consume the same domain bounds.
This plan includes the interval-controller/API refactoring required by #610.
The current task delivers only this reviewed plan; implementation remains pending.

## Scope and authoring contract

```json
{
  "name": "activation_range",
  "select": { "type": "interval", "encodings": ["color"] },
  "bind": "legend"
}
```

- Accept exactly one of `color`, `fill`, or `stroke`, with normal channel
  normalization, an unconditional quantitative field, and a continuous numeric
  gradient legend. Keep the authored logical component in stored values;
  horizontal and vertical ramps never turn `color` into `x` or `y`.
- Support linear and logarithmic position mappings, both orientations, reversed
  display/domain direction, and either drag direction. Additional continuous
  transforms are supported only when the same exact, monotonic, invertible
  mapping used by the ramp and ticks can be constructed. Reject unsupported
  interactive mappings instead of using the display-only linear fallback.
- Encode the distinct positional interval and legend interval forms in
  `spec/parameter.d.ts` and generated schema: positional intervals keep their
  current grammar; the numeric legend form requires `bind: "legend"` and a
  one-element encoding tuple. Schema owns names, lengths, and authoring shapes.
  Initialization validates field/scale capability, semantic compatibility, and
  unambiguous enabled legend ownership.
- Continue using ordinary predicates, for example
  `{"condition": {"param": "activation_range", "value": 1}, "value": 0.15}`.
  Default consumption uses the consumer's same channel, even if its field name
  differs. `project: {"color": "fill"}` binds that logical component to another
  quantitative color input; it does not rewrite the stored component or bounds.
- Explicit filters map the component to a raw field:
  `{"type": "filter", "param": "activation_range", "fields": {"color": "activation_score"}}`.
  Preserve existing empty/group-empty and `test.and` / `or` / `not` semantics,
  including composition with cell-type, record, and independent spatial selections.

Non-goals: stepped/threshold/quantile/quantize selection, nonnumeric components,
multiple legend components or positional/nonpositional mixtures, arbitrary-field
public `project`, scale-domain manipulation by brushing, matching-record masks,
new selection kinds, range-slider APIs, gesture customization frameworks, touch
support expansion, and broader quantitative filtering work from #517/#544.

## Architecture check and reuse

The relevant architecture is [Core's overview](../../packages/core/ARCHITECTURE.md),
[reactivity](../../packages/core/docs/architecture/reactivity.md),
[views and dataflow](../../packages/core/docs/architecture/views-and-dataflow.md),
[rendering](../../packages/core/docs/architecture/rendering.md), and
[App persistence](../../packages/app/APP_ARCHITECTURE.md).

| Responsibility                                                        | Current owner and intended extension                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Declaration, value identity, lexical lookup, compatible outer aliases | `paramRuntime/viewParamRuntime.js`, `paramUtils.js`, and `types/selectionTypes.d.ts`. Extend existing selection capability metadata and value initialization. Use the resolved parameter ref as identity.                 |
| Public values, observations, clear, endpoint interpretation           | `paramRuntime/embedParamApi.js`, `types/embedApi.d.ts`, and `selection/index.js`. Remove their dependency on choosing a controller for semantic operations.                                                               |
| Native predicates and explicit filters                                | `selection/selectionPredicateTree.js`, `selection/selection.js`, and `data/transforms/filter.js`. Extend numeric component/input binding while preserving positional mapping and ranged-mark behavior.                    |
| Shared value change/commit lifecycle                                  | Move controller-owned commit inference to the interval selection's parameter owner. Reuse ref updates, transactions, settled effects, and owner disposal.                                                                 |
| Gestures, host geometry, overlay, canvas containment                  | `view/gridView/intervalSelectionController.js`, `selectionRect.js`, `selectionRectSpec.js`, and `generatedChromeOverlay.js`. Keep one gesture implementation and add only the necessary ramp projection.                  |
| Legend binding and hit routing                                        | `view/legend/legendBinding.js`, `scales/legendResolution.js`, and `view/gridView/gridChildLegends.js`. Extend point/symbol versus interval/gradient dispatch and retain ref/scale ownership through collection.           |
| Numeric domain-to-ramp position                                       | `data/sources/lazy/legendGradientSource.js`. Share its exact normalized position mapping between ramp samples, ticks, brush inversion, and overlay projection.                                                            |
| Rendering and retained resources                                      | Existing CPU predicate path, `rendering/webgl/marks/webGlMark.js`, `rendering/webgl/gl/glslScaleGenerator.js`, and `rendering/webgpu/webGpuMarkAdapter.js` / `webGpuSurface.js`. Renderer resources remain backend-owned. |
| SVG ramp optimization                                                 | `rendering/svg/legendGradient.js`. Optimize only the ramp; render brush and labels through ordinary generated marks.                                                                                                      |
| Bookmarks, undo/redo, provenance labels                               | App `state/paramValueSerialization.js`, `paramProvenanceBridge.js`, and `paramActionInfo.js`. Persist component and bounds without row keys, explicitly encoding an unbounded numeric upper endpoint for JSON.            |

Current constraints that the implementation must address explicitly:

1. `resolveEmbedSelection()` requires a controller even for `getValue()`, and
   `getSelectionController()` rejects multiple hosts at capability creation.
   `getComplexIntervals()` and commit subscriptions currently live in the
   controller. Move only these semantic responsibilities to the value owner;
   retain local controller registration for geometry lookup and cleanup.
2. Each idle controller currently infers a commit from any shared value change.
   Adding a second host would commit another host's intermediate drag writes.
   A selection-level origin/completion distinction is required before adding
   gradient controllers.
3. Initial interval values currently publish from controller setup. Initialize
   them at parameter ownership instead, once, so a later compatible host cannot
   overwrite current or restored values. Preserve x/y and genomic initialization.
4. Grid interval setup and generated rectangle specs assume x/y. Exclude the new
   legend-bound form from plot-controller and concat-overlay setup; do not
   invent positional selection values to reuse those paths.
5. `asSelectionConfig(..., "legend")` currently disables default clearing for
   categorical bindings. Background reset in `legendBinding.js` reads `.values`.
   Keep that categorical behavior; interval bindings use the ramp rules below
   and must never enter the categorical background-reset path.
6. Native scalar interval predicates use `[lo, hi)`, while legacy positional
   filter/helper paths include some closed comparisons. Add correct numeric
   legend membership without silently changing existing positional contracts.
   At the legend's greater-value edge, publish `+Infinity` as the upper bound;
   existing scalar comparisons then include the domain maximum without a new
   inclusive/exclusive policy. Audit transport and value validation separately.
7. `collectSamplingSelections()` currently admits every interval leaf. Restrict
   preservation to the existing record/positional cases so a color interval
   cannot bypass semantic sampling; keep eligible leaves independent of Boolean
   conjunction/negation as established by #608.

### Comparable designs and alternatives

[Vega-Lite legend binding](https://vega.github.io/vega-lite/docs/bind.html)
provides the existing point-selection precedent, but supports symbol legends
only. Its scale-bound interval interaction changes domains, which is a different
contract from this stable color-key brush.

[D3 brushes](https://d3js.org/d3-brush) provide the established create/translate
and separate move/end model. Reuse GenomeSpy's controller and generated marks
instead of adding D3's SVG interaction subsystem and a second state machine.
[D3 numeric inversion](https://d3js.org/d3-scale/linear#linear_invert) requires a
numeric range; normalize domain-to-position rather than invert rendered colors.
[Log domains](https://d3js.org/d3-scale/log) must remain on one side of zero.
These are design references only; no external code or dependency is proposed.
Verify licenses and retain provenance if implementation later adapts source.

A separate gradient parameter, per-row membership texture, mirrored numeric
range, or generic controller/policy registry would duplicate existing ownership
and consumption. Reusing only low-level helpers while retaining a second brush
state machine is also insufficient.

## Decisions for implementation

### Endpoints, clear, and out-of-domain values

Keep the native half-open test `lo <= v && v < hi`. Interior brushes use finite
data bounds, for example `[0.3, 0.7)`. When a nonzero brush reaches the ramp's
numeric maximum, publish `[lo, +Infinity)` and label it `score >= lo` (visually
`≥ 0.3`). The greater-value edge can be on either screen side depending on
orientation and reversal. Recognize that edge from the clamped ramp geometry,
not rounded label text or approximate equality after nonlinear inversion.

A full-ramp brush stores `[domainMin, +Infinity)`. It includes an exact
domain-maximum row and finite values above the displayed maximum; that upper
bound remains unbounded if the domain later expands. Values below `domainMin`
still do not match. Clearing removes the entire constraint, including the lower
bound. A zero-width gesture at the maximum does not become an open-ended range.
This is an explicit upper-edge gesture rule, not a new endpoint-inclusion policy,
an epsilon adjustment, or a change to existing x/y interval behavior.

`null` is clear; an API-authored `[v, v]` remains an active zero-width range
matching no rows. Missing, nonnumeric, NaN, and infinite row inputs do not match
an active numeric interval. Comparison is against the raw input before scale
output or visual clamping, including in explicit filters.

Keep stored bounds when the source or domain changes. Clip domain bounds to the
visible ramp before projecting overlay coordinates, so `+Infinity` never enters
layout, position-scale inversion, or log/linear gesture arithmetic. Labels show
the stored semantics: finite ranges retain their exclusive upper label, while
an unbounded upper endpoint shows `≥ lo`, including when the visible overlay is
partial or absent. Cancel an active drag if its mapping/domain or host changes.

Translation and wheel resize start from the finite visible interval and reuse
the existing gesture operations. Publish only when the clamped interval changes
along the ramp's active axis. Then sort domain bounds and promote the upper
endpoint to `+Infinity` only when a nonzero resulting range reaches its
numeric-maximum edge. Moving/resizing that edge inward restores a finite upper
bound. Cross-axis movement, repeated document events, outward wheel input at a
clamp limit, an unchanged press/release, domain notification, or host initialization
never changes stored bounds. In particular, an API-authored finite
`[lo, domainMax)` stays finite and excludes that maximum; authors request an
open upper bound explicitly with `Infinity`.

Runtime values, API snapshots, and `selectionBounds()` expose the numeric
`Infinity` endpoint. At JSON boundaries, encode only this permitted unbounded
upper endpoint with the explicit token `"Infinity"`, for example
`{"type":"interval","intervals":{"color":[0.3,"Infinity"]}}`. The new legend
initializer permits the same upper token in its channel-keyed value and converts
it to the native numeric endpoint during initialization. App bookmark/provenance
serialization encodes the token before JSON conversion, and restoration decodes
it before validation/publication. Keep `color: null` as clear; a null endpoint
inside a pair is invalid. Preserve existing finite and genomic formats, and keep
this conversion at selection-value boundaries rather than in renderers or a
general JSON replacer. Direct runtime writes accept numeric `Infinity`, not the
serialized string. JSON round trips, undo/redo, and action labels must preserve
the distinction between clear, a finite upper bound, and no upper limit.

### Ramp gesture defaults

| Input                                                     | Rule                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary-button drag on the ramp outside the current range | Create/replace the numeric interval; clamp to the ramp and sort data endpoints. A nonzero range reaching the numeric maximum gets an unbounded upper endpoint.                                                               |
| Primary-button drag inside the visible current range      | Translate the finite visible interval using existing screen-space behavior and exact inversion. Reapply the upper-edge rule after movement; moving inward restores a finite upper endpoint.                                  |
| Press/release without movement outside the range          | Leave a cleared selection, matching the existing brush replacement path. A click inside the range leaves it unchanged.                                                                                                       |
| Default double-click anywhere on the ramp                 | Clear this interval, including when the pointer is outside its current overlay.                                                                                                                                              |
| `select.clear: false` or an authored clear event/filter   | Disable or replace the dedicated clear trigger. Normal creation/replacement still applies, including click-without-drag behavior.                                                                                            |
| Wheel over an active overlay                              | Reuse existing `select.zoom` settings/defaults and scale-aware resize. A nonzoomable color scale therefore enables wheel resize by default; `zoom: false` disables it.                                                       |
| Scroll or unrelated wheel input                           | Preserve existing wheel eligibility, claim probes, and cooperative scrolling, including a claim at a resize limit. Only an eligible resize over the active ramp range is claimed; never zoom/pan the plot from a ramp event. |
| Authored `select.on`                                      | Apply the existing supported mousedown event/filter to ramp creation. It does not enable a geometric plot brush for color. Keep existing translation/modifier behavior.                                                      |
| Plot background, another legend, title, tick, or padding  | Do not clear or mutate this interval. Keep existing categorical background resets and independent plot interactions.                                                                                                         |

Available resize is the existing wheel operation; adding draggable endpoint
handles is deferred. The example explains create, move, wheel resize, and clear.
Use no delayed click/double-click repair or new source-dependent policy system.
Record the endpoint and gesture choices in #610 and the grammar docs before
interaction implementation, as that issue requests. Posting to GitHub is a
separate implementation follow-up, outside this local plan-only task.

### Brushing cursor

Hovering the bound ramp outside an existing brush uses a native I-beam cursor
perpendicular to the ramp's long axis:

| Ramp orientation | Cursor          | Affordance                                            |
| ---------------- | --------------- | ----------------------------------------------------- |
| Horizontal       | `text`          | Vertical I-beam suggesting left/right range brushing. |
| Vertical         | `vertical-text` | Horizontal I-beam suggesting up/down range brushing.  |

Use the standard [CSS cursor keywords](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/cursor)
through existing cursor/hit routing, without custom cursor images or another
interaction path. An existing brush retains `move` on hover and `grabbing` while
translated, with authored `select.mark.cursor` taking its existing precedence.
By default, creation keeps the orientation-appropriate I-beam until release or
cancellation, including over its newly generated overlay.
Titles, ticks, labels, padding, and unbound legends keep their ordinary cursor;
reversal changes the value mapping, not cursor orientation. Browser verification
must check native cursor changes over the actual ramp and overlay for horizontal,
vertical, and reversed examples, plus restoration after leaving or disposal.

### Shared state, API, commits, and lifecycle

- Store only native `{type: "interval", intervals: {color: [lo, hi]}}` values.
  Extend initializer, helper, snapshot, and complex-interval channel types.
  `selectionBounds(activation_range, "color")` returns detached numeric bounds
  reactively through the documented expression helper.
- Use existing declaration/capability metadata to interpret endpoints. Numeric
  reads need no host; locus reads retain compatible assembly/scale conversion.
  Validate compatible outer declarations before publication. Distinct scales
  with the same numeric semantics may project one shared value differently.
- Aliases targeting one actual shared/collected gradient must agree on effective
  `on`, `clear`, `zoom`, and brush styling. Reject conflicting configurations;
  do not silently keep the first binding or introduce a merge/precedence policy.
  Distinct actual hosts sharing the value may keep their local gesture settings
  and brush styles.
- `getSelection()`, `getValue()`, change/commit subscription, and `clear()` resolve
  through the selection value owner. Keep ordinary interval writes through
  `params.get(name).setValue(intervalSelection({...}))`; add no parallel setter.
- Validate the new numeric interval form at the shared parameter write boundary,
  reached by generic/scoped APIs and outer aliases, before publication or drag
  cancellation. Require the declared component with `null` or a finite lower
  endpoint and a finite or positive-infinite upper endpoint satisfying `lo <= hi`.
  Reject NaN, negative infinity, an infinite lower endpoint, undeclared/missing
  components, reversed bounds, and malformed pairs. Decode the permitted JSON
  initializer/restore token before this shared validation. A bad write leaves
  both current state and an active gesture intact. Preserve existing x/y write
  contracts. Pointer dragging sorts and applies the upper-edge rule first.
- Resolve geometry only when `contains({x, y})` is called. Preserve existing
  unambiguous scoped containment; ambiguous or absent geometry fails at that
  operation with a useful scope diagnostic. Existing authored view scopes choose
  hosts; generated chrome stays non-addressable. If one declaring scope really
  has multiple hosts, require a narrower existing scope or report ambiguity.
- Put the minimum gesture origin/completion bookkeeping beside the shared value
  in the existing parameter/selection machinery. Register one active originating
  host and its cancellation callback per value owner; a new host gesture cancels
  the previous one. Controllers explicitly publish intermediate writes and
  completion instead of inferring completion from inactivity in each observer.
- Emit settled change observations during a drag and one commit on release of a
  changed gesture. Idle hosts emit no commits. Committed programmatic writes,
  explicit clears, and accepted wheel updates keep existing commit delivery;
  no-op clicks and unchanged clears produce no duplicate completion.
- A valid external replacement or clear cancels the active gesture before
  equality suppression, even if numerically equal. It is authoritative; later
  retained document events cannot restore stale bounds. Distinguish the originating
  controller's own updates at ingress rather than guessing after propagation.
- Cancellation retains the last published bounds and emits no synthetic commit
  or rollback. This applies to mapping/domain replacement, host removal/disposal,
  and another host taking over. Settled changes already published remain ordinary
  changes. A valid authoritative replacement commits its own changed value; the
  canceled gesture's later release emits nothing. A new originating gesture can
  subsequently commit its own result.
- Keep registration local to the declaring host and value identity shared through
  existing refs/`push: "outer"`. Only explicit compatible gradient declarations
  participate; collection retains one actual host and lexical shadowing remains
  intact. Dispose/cancel listeners, active document drags, generated overlays,
  subscriptions, and owner bookkeeping with their current owners.

### Mapping, feedback, and retained rendering

Extract the normalized position mapping from `legendGradientSource.js` into one
small shared helper used by samples, ticks, and interaction. Separate a strict
interactive capability check from any existing display fallback. Preserve the
actual transformed/piecewise domain and scale configuration; account for
reversal once, consistently with the displayed samples and ticks. Validate finite,
strictly monotonic boundaries and exact inversion, including log validity. The
controller converts between a logical component's numeric interval and the
host's physical x/y direction through this mapping; no second selection is stored.

Extend the existing interval host boundary just enough to supply pointer/domain
conversion, finite visible interval/rectangle projection, and ramp bounds. Keep
creation, translation, wheel handling, document drag, and cancellation in the
existing controller. Preserve index/locus gap-aware positional projection. Adapt generated
rectangle specs to take the component-to-screen mapping and reuse their normal
chrome lifecycle. Any local geometry expressions derive from the native interval
through the same position helper; they are not a separately writable parameter.

Render a visible brush and readable lower/upper numeric labels with the ordinary
generated rect/rule/text path; unbounded ranges show `≥ lo`. Reserve label space
in legend layout and respect authored brush/legend styling. Keep the full ramp
and ticks as a stable color key; do not add responsive ramp dimming in this first
implementation. If generated
feedback needs membership, bind its internal raw numeric input to the existing
native predicate path without expanding public field projection grammar.

The consumer resolver must retain existing same-axis/type positional restrictions
while allowing quantitative color/fill/stroke mappings with ordinary normalized
inputs. CPU, WebGL, and WebGPU compare the retained numeric input. WebGPU's public
`IntervalSelectionProjection` already separates arbitrary component names from
input names, and its slot accepts string-keyed intervals: reuse that capability
first. Change that public generic contract only for a demonstrated missing need;
Core never imports renderer internals.

Appearance-only updates change small endpoint/activity resources and redraw.
They do not scan matching rows, replay chart dataflow, upload chart geometry,
duplicate an existing raw attribute, regenerate ramp samples, change scale
domains, or promote gradient matches through semantic sampling. Explicit dataflow
filters retain normal replay/domain effects; use an explicit color domain in the
primary example. Preserve SVG's single-gradient optimization while exporting the
overlay and endpoint labels as separate ordinary marks.

## Implementation milestones

These are coherent commits within one feature PR. Review the semantic/API boundary
and final integration; combine small follow-up corrections into their milestone.
Measure relevant production size before/after the controller refactor and at final
delivery (`wc -l`, `git diff --stat`); remove obsolete responsibilities/tests rather
than leave compatibility wrappers or overlapping assertions.

### 1. Make interval semantics independent of brush hosts

- Outcome: existing x/y selections have owner-based initialization, endpoint
  snapshots, clear, and coherent commit delivery with multiple explicit hosts.
- Areas: parameter runtime/capabilities, embed API and types, interval helper,
  controller registration, and existing grid/concat/facet callers.
- Verification: extend `embedParamApi.test.js` and existing controller tests for
  host-free reads, detached snapshots, locus conversion, scoped containment,
  outer aliases, one active host plus an idle observer, and programmatic clear/
  replacement (including equal writes) during drag. Assert no completion on
  cancellation by domain replacement, host disposal, or another host taking over.
  Preserve scale-linked x/y brushing, genomic/gap behavior, and disposal. Use real
  runtime settling.
- Docs/migration: update API ownership/containment documentation and generated
  API reference. Existing unambiguous calls remain valid; newly usable value
  operations need no migration. Document moving ambiguous containment to a
  specific authored host scope. No public range API or x/y gesture changes.
- Tentative commit: `refactor(core): decouple interval values from brush hosts`.

### 2. Bind continuous numeric legends through native interval consumers

- Outcome: the authored legend form validates, consumes raw numeric fields on
  every renderer, and shares exact ramp/tick/brush projection. The existing
  controller draws and operates a ramp overlay without plot participation.
- Areas: specification/schema, selection initialization/projection/filtering,
  sampling eligibility, shared gradient mapping, legend ownership/routing,
  controller host projection, generated brush marks, and backend adapters.
- Verification: focused authored-spec subsystem tests for linear/log mapping,
  vertical/reversed display and drag direction, actual bounds, finite half-open
  interiors, upper-edge promotion, and restoring a finite upper bound by moving
  or resizing inward. Cover zero width at the maximum versus clear, rejecting
  nonfinite row inputs even for an unbounded range, and predicate/filter parity.
  Verify cross-axis motion and wheel input at a clamp limit do not promote a
  finite API-authored upper bound or emit a changed value/commit.
  Compose cell type AND activation, a differently named color field and explicit
  color-to-fill consumer, a ranged positional mark, and an independent x brush.
  Reject unsupported scale/binding/alias combinations at the right boundary.
  Test conflicting on/clear/zoom/style on a collected host, differing local
  settings on separate compatible hosts, and invalid API writes during a drag
  without cancellation or publication.
  Add exported SVG assertions for one ramp plus visible finite/open-bound labels,
  including a logarithmic range whose upper endpoint is `Infinity`.
- Docs/migration: update legend, parameter, conditional-encoding, filter, and
  expression grammar as affected, regenerate schema/type tables, and record
  the two design decisions before interaction code. Existing point/symbol and
  unbound gradient behavior remain unchanged.
- Tentative commit: `feat(core): brush numeric ranges in gradient legends`.

### 3. Integrate persistence, examples, and real renderer interaction

- Outcome: the feature survives source/domain replacement, undo/redo, bookmarks,
  and repeated actual GPU interaction, with a polished biological example.
- Areas: App parameter serialization/restore/action titles and
  `state/paramProvenanceTypes.d.ts`, docs examples, `scripts/testInteractiveLegends.mjs`
  and existing renderer test facilities, SVG/Canvas output, and the feature's
  release fragment.
- Verification: shared, independent, and collected gradients with explicit outer
  aliases; change/commit counts across two hosts; owner disposal/host removal;
  restored bounds before hosts initialize; writes/clear during and after drag;
  clipped overlays after domain shrink and restored overlays after expansion.
  Round-trip the explicit `"Infinity"` token through real bookmark JSON and
  undo/redo; keep finite/genomic formats compatible and reject malformed tokens.
  Exercise real WebGL/WebGPU drag, translate, wheel, clear, and picking/event
  ordering, including I-beam/move/grabbing cursor precedence and cleanup in both
  orientations. Check actual Canvas/SVG finite/open-bound appearance. Count
  retained chart uploads and bounded endpoint updates using existing hooks rather
  than a new benchmark.
- Example: `examples/docs/grammar/legend/interactive-gradient-legend.json`,
  illustrative immune cells with shape/cell-type selection AND color/activation
  interval. Clearly label synthetic coordinates/scores, show a stable explicit
  color domain, an exact upper-maximum row, and one finite score above that domain.
  Explain half-open interior bounds, `≥ lo` at the greater end, cursor cues, and
  move/resize back to a finite range. Reuse/extend the small existing immune-cell
  fixture where useful; follow `examples/README.md` portable paths. Supplement
  with a focused log/reversed/shared-host spec under `examples/core/` if it
  improves verification.
- Docs/release: use `write-genomespy-docs`, `debug-genomespy-web`, and
  `test-genomespy-views` for their applicable work. Add/reuse one Core minor
  feature changeset and include App only if its shipped behavior changes.
  Assess any actual API compatibility change before finalizing the bump.
- Tentative commit: `feat: integrate gradient legend brushing with saved state`.

## Final integration and acceptance

- [ ] The polished immune-cell example works in WebGL and WebGPU: choose T cells,
      brush activation, translate/resize it, and clear independently. Only the
      native predicate intersection highlights; record selection and a spatial
      brush still work. Check titles/padding/other legends are inert for this range.
- [ ] Representative linear and log examples produce expected numeric bounds,
      including a geometric midpoint for log, reversed vertical dragging, the
      numeric-maximum edge in either screen direction, exact-maximum and higher
      finite rows, and nonfinite/missing inputs. Interior upper bounds remain
      exclusive; returning an open edge inward restores a finite upper bound.
      Explicit numeric filters agree; legacy positional endpoint behavior stays.
- [ ] Two explicit compatible hosts share values and project independently.
      Reading values and expressions needs no host selection. Only containment
      requires unambiguous geometry. A drag produces no premature or duplicate
      commit from idle hosts; API writes/clear and disposal prevent stale replay.
      With domains `[0,1]` and `[0,2]`, reaching the first host's maximum writes
      `Infinity` for both hosts. Moving inward on the second writes a finite upper
      bound; clipping it on the first does not promote it. Initialization, reads,
      domain changes, no-op input, and idle observers never reinterpret either value.
- [ ] Bookmark capture/restore and undo/redo retain logical components and numeric
      bounds without row keys, including `Infinity` via its explicit JSON token.
      Source/domain replacement retains stored bounds and clips only the overlay;
      it never promotes a finite bound or caps an unbounded one. Existing genomic
      endpoint snapshots and persisted formats still work.
- [ ] A horizontal ramp suggests brushing with a vertical I-beam (`text`), and
      a vertical ramp uses a horizontal I-beam (`vertical-text`). Existing brush
      move/grabbing and authored cursor precedence work; inert legend areas and
      disposal do not leave a brushing cursor active.
- [ ] WebGL/WebGPU pixels and input behavior agree with native membership;
      Canvas2D feedback and actual SVG export retain the full gradient, brush,
      and readable endpoints. SVG optimization does not consume overlay/label marks.
- [ ] Repeated appearance-only brushing reuses chart input buffers, bounds update
      resources independently of row count, and chart/ramp dataflow and color
      domains stay unchanged. Gradient focus preserves the semantic sample;
      ordinary record/positional preservation still works in mixed predicates.
- [ ] Focused Vitest suites pass with `--reporter=agent`. Run workspace type checks,
      lint, schema/API/docs checks, existing browser renderer probes, and release
      checks appropriate to the final diff. Expand testing for a concrete failure
      or unresolved risk, without creating a renderer/configuration cross-product.

## Independent plan review

A Codex subagent reviewed this plan against current source for architectural
smells, KISS, and DRY on 2026-11-02. Its four actionable findings are incorporated:
reject conflicting settings on one actual shared host, define cancellation as
retain-without-completion, validate numeric API writes before cancellation, and
preserve the existing wheel-claim behavior. The review confirmed the native-state
ownership, controller reuse, half-open endpoints, categorical reset separation,
sampling adjustment, and existing generic WebGPU projection contract. No broader
framework or additional selection state was recommended.

A focused follow-up review covered the approved unbounded upper endpoint, finite
gesture geometry, JSON encoding, and native I-beam cursor cues. Its clarifications
are incorporated: only changed, clamped active-axis geometry can promote an
endpoint, and a representative shared-host test uses different domains to prevent
display clipping or idle observation from reinterpreting stored bounds. The
original review conclusions still hold; no new policy or state framework is needed.

## Risks and remaining questions

The largest risk is commit delivery and cancellation across aliases, especially
external writes equal to current values. Resolve it in milestone 1 before adding
hosts. The next risks are mismatched nonlinear inversion and accidentally relaxing
positional mappings or semantic sampling; cover those through representative real
consumers, not generated-shape snapshots. Open upper bounds must be clipped before
gesture/layout math and explicitly encoded before JSON serialization. Domain
changes and canceled gestures must not silently cap/promote stored bounds.
Endpoint labels must remain readable in collected/narrow legends without changing
chart-domain ownership, and cursor cues must agree with the active gesture.

Endpoint and gesture rules are decided above for this proposal. No unresolved
design gate blocks implementation once those choices are recorded in the issue
and grammar docs. Exact helper placement and whether WebGPU needs any public API
change depend on implementation evidence; neither warrants a new abstraction now.

This plan-only commit changes no shipped behavior and needs no changeset. Keep
the reviewed plan on the feature branch for implementation/draft review. Before
merge, reconcile every incomplete acceptance item as completed or explicitly
discarded, commit that reconciliation, then remove the temporary plan in a later
commit as required by `plan-genomespy-change`.

## Milestone 1 checkpoint

Interval initialization, detached semantic reads, clear, and commit delivery now
resolve through parameter ownership. Controllers retain document gestures and
geometry; external writes cancel their active gesture at setter ingress. A
shared completion ref delivers release notifications after graph propagation.
The controller lost 59 lines; the four affected runtime files plus the new
selection state total 2,794 lines versus 2,673 previously. The net growth owns
shared commit/cancellation semantics explicitly instead of duplicating them in
every controller. Focused API, grid, gap, and selection-state tests verify the
existing interactions and new host-independent contracts.

## Milestone 2 checkpoint

Numeric color/fill/stroke bindings now use the native interval controller and
predicate consumers. One normalized mapping serves ramp samples, ticks, brush
projection, and inversion. Generated marks show the finite or open range while
the full ramp remains unchanged. Quantitative color accessors retain missing
scores as NaN so CPU and GPU membership agree. Numeric focus does not contribute
to semantic sampling preservation.

Focused Core suites pass (163 tests), including existing categorical legends,
SVG gradient export, consumers, accessors, runtime API, and grid behavior. Core
TypeScript, changed-source lint, schema/API generation, and release checks pass.
The browser probe exercises actual gestures, native cursor picking, authoritative
replacement, and SVG feedback on Canvas, WebGL, and WebGPU. Remaining composition,
persistence, retained-resource, and example checks belong to milestone 3.
