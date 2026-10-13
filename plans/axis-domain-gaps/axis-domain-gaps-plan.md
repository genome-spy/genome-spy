# Scale groups, mark clamping, and gapped axis domain lines

Status: implementation authorized. The earlier unsupported-feature decision is
superseded by the reusable group-data and mark-clamping design below.
Commit the current baseline first, then commit each verified milestone.
The uncommitted rect-clamping implementation is a starting point to review and
generalize, not a completed milestone.

## Goals and boundaries

- Split index/locus axis domain lines at enabled grouping gaps, retaining the
  existing continuous line when gaps are disabled.
- Generate reusable, finite group intervals from resolved scales. One axis
  supplies rules; two axes supply a Cartesian product for group outline rects.
- Offer opt-in clamping on every mark type: rect, point, rule, tick, text, link,
  and arrow, with independent x/y selection.
- Keep projection occurrence-specific across WebGL, WebGPU, Canvas2D, SVG,
  picking, shared views, and exports arranged at a different size.

Do not change the flat scale grammar, scale clamping, gap mapping, inversion,
within-band placement, or half-open endpoint affinity. Marks that cross a gap
remain continuous. There is no new axis option, arbitrary curve-clipping
algorithm, nested grouping hierarchy, or general-purpose reactive join system.
Clamping defaults to false, preserving existing marks.

## Findings and approach

`packages/core/src/view/axisView.js` currently generates one domain rule with
literal viewport endpoints, `data: { values: [{}] }`, and `clip: false`.
`createGenomeAxis()` builds on the same function. AxisView already makes its
subtree domain-inert and forces resolution toward the plotted scale.

The existing endpoint encodings can project finite half-open intervals:
`[a,c0), [c0,c1), ..., [cn,b)`. Starts land after a cut and ends before it.
Local clamping then limits offscreen endpoints to each occurrence's viewport;
collapsed rules disappear. This replaces the earlier four-layer exterior-rule
proposal with one segmented layer and the existing continuous fallback.
The accepted finite-extent semantics leave outer padding uncovered when gaps
are enabled.

The same intervals can feed ordinary rects. Generation owns data coordinates;
marks own projection, clamping, styling, and picking. No CPU pixel-coordinate
source or mark-generating abstraction is needed.

## Shared mark clamping contract

Move the uncommitted rect-only property into `MarkPropsBase` and shared mark
defaults:

```typescript
clamp?: boolean | "x" | "y"; // false by default; true selects both axes
```

The property is a static mark/config option, like the current rect implementation.
It applies to position encodings regardless of scale type, including literal
coordinates. It does not mutate a shared scale or change `invert()`.

Clamp projected defining coordinates to the occurrence's plot bounds on each
selected axis, after scaling, band/gap endpoint affinity, position-channel
`xOffset`/`yOffset`/`x2Offset`/`y2Offset`, and facet placement. Point's legacy
`dx`/`dy` are positional aliases and also precede clamping, retaining their
existing signs and physical pixel size inside facets. Preserve the existing
facet stage when clamping is disabled. Then derive the mark's geometry. Text's
glyph-local `dx`/`dy`, rotation/alignment, symbol size, stroke width, caps, and
arrowheads retain their geometry role and can extend beyond those bounds.
`clip` continues to control pixel clipping independently.
Bounds must be expressed in the coordinate space used by that rendering path,
including translated views and WebGPU placement transforms. For sample facets,
clamp to the facet occurrence's bounds, not the enclosing track. In WebGL,
clamping after facet placement requires its transformed bounds rather than
global normalized `[0,1]`; zero-height placements remain suppressed. The current
uncommitted rect baseline needs this parity correction. WebGPU clamp channels
remain in the local coordinate space before placement transforms.

| Mark      | Coordinates clamped                                                      | Collapse behavior when clamping is enabled                                                                  |
| --------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Rect      | Both range endpoints                                                     | Hide if either selected axis has zero span, before minimum-size expansion                                   |
| Point     | Position anchor including legacy positional offsets                      | Pin to the boundary; preserve symbol size                                                                   |
| Rule/tick | Both endpoints                                                           | Hide only if the final 2D endpoints coincide, before tangents, minimum length, and caps                     |
| Link      | Both endpoints before control-point construction                         | Hide coincident endpoints; retain the existing curve parameters, including `clampApex`                      |
| Arrow     | Both endpoints before direction/head construction                        | Hide coincident endpoints; retain arrowhead geometry                                                        |
| Text      | Anchor, or explicit range endpoints before fitting/centering/logo sizing | Hide an explicit range collapsed on a selected axis; do not manufacture a secondary endpoint for point text |

A horizontal or vertical rule has zero span on one axis and remains valid.
Diagonal rules and links can change shape when explicitly clamped. Their
unclamped behavior remains unchanged. No separate public zero-length-rule
option is needed for generated domain lines.

Implementation should share small axis-selection/bounds helpers where they
remove duplication, while keeping mark-specific geometry stages explicit.
Do not introduce a new rendering framework or force all marks through one
projection function. Specialize disabled GPU paths so default marks gain no
clamp channels, bindings, or shader operations.

### Culling, picking, and downstream consumers

Clamping must precede anchor-visible-range rejection. In particular, far-off
point anchors can become visible at a boundary, so the data-space x index must
not discard them first. Review `rendering/xIndex/markXIndex.js` and each
backend's culling path. Bypass narrowing on a selected axis where it cannot
conservatively preserve clamped geometry; retain safe filtering on other axes.
Do not expand this change into a spatial-index redesign.

Drawing, GPU picking, CPU hit bounds, and SVG/Canvas exports must use the same
clamped geometry and collapse policy. Test both WebGPU point programs, ranged
and point text, sequence-logo text, ticks lowered to rules, positional offsets,
reversed endpoints, and translated/faceted placements. Offset checks must
distinguish point's legacy positional aliases from text's glyph-local
displacement; include a representative alias/sign and facet case.

## Reusable scale-group data

Add a small public lazy source with one or both positional channels:

```json
{ "data": { "lazy": { "type": "scaleGroups", "channels": ["x"] } } }
```

```json
{ "data": { "lazy": { "type": "scaleGroups", "channels": ["x", "y"] } } }
```

Validate a nonempty, unique list drawn from x/y and resolved index/locus scales.
Each requested axis contributes fixed fields `xGroup`, `xStart`, `xEnd` or their
y equivalents. Group numbers are zero-based in ascending data order; they are
not stable identities across cut edits. Boundaries are numeric half-open data
coordinates, linearized across the assembly for locus scales. Consumers encode
them using the corresponding index/locus type and `band: 0` on both endpoints.
There is no per-row endpoint-side field or `domainInert` workaround on x2/y2.

A pure helper splits a finite full extent at normalized cuts strictly inside
it. Boundary and exterior cuts create no empty groups. One channel publishes
its intervals; two publish their Cartesian product in deterministic order.
The product costs O(nx * ny) rows and is intended for group counts, not a dense
cell generator. No renaming options, label generation, or general join API are
needed for the initial feature.

Group membership follows the effective gaps in the completed mapping. Use cuts
only when resolved width is positive and positions are nonempty; otherwise
publish one full-extent group. Positive-to-positive width changes retain the
same rows. Crossing zero or toggling null/empty positions changes the effective
cuts and may republish. Do not add a binding for inactive raw gap positions:
the current constant-disabled mapping deliberately discards them.

### Full extent and ownership

Keep group bounds independent of the displayed domain and navigation limits:

- Locus uses the assembly's finite span, including chromosomes without loaded
  rows. Assembly replacement updates the source.
- Index uses an authored finite interval domain when present, including a
  reactive interval. Otherwise use the finalized initial full reference from
  the existing domain lifecycle. Selection-linked domains use their independent
  full fallback/reference rather than the changing selection.
- Preserve the lifecycle's stable initial-reference semantics for inferred
  index domains. Later streaming rows do not silently enlarge that reference;
  authors needing a changing full extent can provide a reactive interval.
- Normalize index bounds to the scale's half-open band semantics exactly once:
  an authored `[0,19]` covers `[0,20)`. Respect existing domain-direction
  semantics rather than blindly sorting an already expanded reversed interval.
  Output reversal does not change group membership.

Add a brief code comment at the full-extent reader noting that an inferred
reference is assumed to cover the full data; a viewport-derived index domain
may instead describe only the initial viewport. Leave that hypothetical
combination unhandled. Add no special validation, fallback branch, extent state,
or tests for it.

Expose the minimum internal read/dependency API from ScaleResolution, derived
from DomainRuntime and configuration, without a parallel extent cache or a
second domain owner. Prefer a lazily allocated native computed ref whose value
contains the full extent and its readiness, with equality on those relevant
values. Authored finite intervals and available assemblies need not await data;
inferred references await their contributors. Do not use `getDomain()`
or `zoomExtent` as a proxy: the former moves and the latter can be infinite.
`subscribeZoomExtent()` alone is insufficient for reset-target-only updates.

Bootstrap must allow the real data contributors to finish before finalizing an
inferred reference. Publish a meaningful empty batch while no usable extent is
available; do not wait on the generated source's own collector. Distinguish an
empty valid dataset from an unsupported non-finite reference and report the
latter clearly after readiness. Do not add a fallback to the visible domain.
The source's `isDataReady()` must distinguish provisional empty output from a
valid ready empty extent, even if both have completed a publication batch.
Readiness comes from the extent producer, never the source's own collector.
Pending-to-ready changes must notify downstream consumers even when the rows
remain empty; include readiness in the relevant-state comparison.

Generated guide/outline views use view-level `domainInert: true` and resolve the
scales from their data-bearing parent. This is necessary because a half-open
end must not feed back as another inclusive index datum. AxisView already has
this contract; the public example will show it on the outline layer. Also
report the source's scale dependencies through existing dataflow metadata.
Do not add implicit domain-registration changes for all lazy sources.

### Source lifecycle

Implement a small DataSource using the existing lazy registry and activation,
publication, disposal, and readiness lifecycle. `SingleAxisLazySource` listens
to navigation/layout and only supports one axis, so it is not the right base.
Observe completed mappings for cut/configuration changes and the full-extent
producer for reference changes. Compare relevant values before generating or
publishing: pan, zoom, resize, DPR, positive-to-positive width changes, and
detached export layouts must not rebuild group rows or buffers. Batch two-axis
changes through the existing runtime. Add no timer or parallel scheduler.
Equality suppression applies to live dependency updates only. Explicit
`load()`/`repropagate()` must replay the current rows even when geometry is
unchanged, including downstream filter changes with exterior-only cuts.

This is synchronous derived data, not a viewport fetcher. Existing App lazy-only
waits select `SingleAxisLazySource` and intentionally exclude this source, as
they exclude other synchronous guide sources. Preserve that API boundary rather
than add fetch/coverage methods to group generation. Verify ordinary initialization
flushes its derived output after the scale contributors settle, and test a group
subtree whose real contributor is still pending outside it: lazy-only waiting
must retain its existing contract, while ordinary data readiness remains false
until the reference and the corresponding rows are ready. Full-root initialization
must settle derived publication in the real contributor's completion boundary;
SVG export reads the current initialized state and does not initiate loading.

Existing `cross` accepts eager foreign data and explicitly rejects a lazy
foreign source. Form the bounded x/y product inside this source rather than
extend join readiness and subscriptions. This revises the earlier suggestion
that the current cross transform could directly combine two lazy group sources.

## Axis integration

For index/locus scales with potentially enabled gaps, generate two fixed domain
children inside the existing domain subtree:

1. The existing continuous viewport rule, active when resolved gaps are off.
2. Rules over `scaleGroups` intervals, active when resolved gaps are on. Use
   the existing half-open encoding with `band: 0`, `clamp: mainAxis`, and
   `clip: false`. Copy existing domain color, width, dash, and cap properties.

Drive mutually exclusive filters with one private AxisView boolean derived
from the completed scale mapping. Read resolved numeric width and normalized
cuts, not the static shader-specialization predicate: an ExprRef evaluating to
zero must activate the continuous fallback. Keep this boolean out of the
public group-row schema. Share the small effective-gap predicate with the source
instead of duplicating its policy. Do not rebuild the hierarchy on every toggle.

When the configuration proves gaps permanently disabled (constant zero/null
width or empty/null positions), retain the original single domain rule without
a group source or clamp path. Preserve the existing scale shader/resource
elimination invariant. Dynamic zero/empty values retain their existing dynamic
resource policy while changing the visible domain-line layer correctly.

The fallback has its own `[{}]` data, so it remains independent of source
readiness or an empty group extent. Offscreen groups collapse and disappear;
partially visible groups stop at the viewport edge. Outer padding may remain
uncovered in the enabled path. Preserve existing cap/dash styling rather than
add special cap trimming or continuous dash phase across segments.

## Alternatives and complexity

- **Shared scale clamp:** compact, but affects ordinary diagonals, links, and
  inverse mapping. Mark-local opt-in keeps that choice with each mark.
- **Rect/rule-only clamp:** slightly less implementation, but an arbitrary
  grammar restriction. A common option is coherent if mark-specific anchor,
  range, and collapse semantics are documented and tested.
- **Four exterior/interior rule layers:** avoids clamping, but needs mixed
  coordinate encodings, exterior offsets, and reversal handling. Reusable finite
  intervals remove those special cases.
- **CPU-preprojected guide rows:** cannot represent multiple shared-view
  occurrences or differently sized exports with one collector.
- **Shader masking, infinite sentinels, background covers:** add renderer or
  packing contracts and do not help ordinary group rectangles.
- **General reactive cross support:** useful independently, but larger than the
  bounded product required here. Keep it out of this change.

[D3 axis](https://d3js.org/d3-axis) separates the domain path from ticks;
[D3 linear clamping](https://d3js.org/d3-scale/linear#linear_clamp) supplies a
familiar output-bounding operation, though this plan applies it per mark;
[Vega cross](https://vega.github.io/vega/docs/transforms/cross/) illustrates
keeping Cartesian data generation separate from mark geometry. These are design
references, not copied implementations; no external code is being adapted.

The remaining complexity is real: full-reference readiness, ranged text,
preprojection culling, and backend parity. The KISS constraint is to handle
those contracts once without adding exterior-rule roles, pixel datasets,
implicit scale mutation, or a new join/rendering framework.
Use effective cuts from the completed mapping rather than add a separate
producer for inactive raw cuts. Keep hypothetical domain combinations out of
the implementation scope.

## Milestones

### 1. Make local clamping a shared mark capability

- [x] Generalize the uncommitted rect property/defaults into the common mark
      grammar and config. Implement the table above in immediate rendering,
      WebGL marks/shaders, and all relevant WebGPU programs/public channel types
      through Core's public adapter boundary. Include rule-derived ticks,
      native/path points, text/logo variants, culling, and picking consumers.
- [x] Verify representative geometry and default-off compatibility with focused
      subsystem/SVG tests and real GPU picking tests. Include far-off clamped
      points beyond x-index overscan, diagonal rules/links, zero horizontal or
      vertical span, collapsed ranges, offsets, and live occurrence resizing.
      Include one nonzero-height sample facet with offscreen endpoints and
      offsets to establish local-bound parity across renderers.
- [x] Move rect-only documentation into shared mark documentation with concise
      per-mark semantics; update renderer API docs/schema and the existing
      clamping changeset. Measure the change against the uncommitted rect
      baseline and inspect tests for duplicated implementation assertions.

Verification: 295 focused rendering tests passed; the full suite passed 4,911
tests before identifying stale shader assertions/snapshots and the temporary
smoke fixture. Updated assertions and seven reviewed shader snapshots pass.
Real WebGPU clamping/picking tests, WebGL smoke checks, workspace type checks,
lint, schema generation, and Storybook build passed. Independent review fixed
zero-height immediate placements and clamped legacy point offset parity.
The diff was inspected against the committed rect baseline. Growth supplies
the shared contract across renderers; the final milestone records exact
non-comment production-line counts.

Outcome: every mark accepts the same option with consistent anchor/endpoint
semantics. Review gate: common contract, downstream culling, and renderer parity
before relying on it for guides. Tentative commit:
`feat(core): support local clamping across mark types`.

### 2. Publish reusable group intervals from resolved scales

- [x] Add the pure interval helper and `scaleGroups` lazy source, descriptor,
      registry loading, full-extent dependency, and lifecycle wiring in Core's
      genome/scales/data subsystems. Keep the implementation confined to the
      chosen producer/source contract.
- [x] Verify the real spec-to-collector path: one/two axes, index/locus, inferred
      readiness, authored/reactive extents, cut edits, assembly replacement,
      empty input, scale replacement, disposal, and no domain feedback. Verify
      no row publication on navigation, positive-to-positive width changes, or
      layout/export; verify effective enablement transitions republish correctly.
      Include a pending contributor outside the generated subtree to verify
      provisional-empty readiness, initialization, and the lazy-only wait boundary.
- [x] Document descriptor, fields, half-open encoding, inferred-reference
      stability, view-level domain inertness, and product size. Add schema
      coverage and a user-facing changeset.

Verification: 449 tests across scale, source, readiness, and schema suites passed,
along with Core type checks, schema generation, and release validation.
Independent review corrected the resolved-scale-type guard and found no remaining
readiness or lifecycle issues. Layout/export publication checks continue with
the integrated guides in milestones 3 and 4.

Outcome: one source supplies domain-space intervals for both rules and rects.
Review gate: prove finite-reference/readiness and cycle behavior using the real
lifecycle before integrating AxisView. Exact internal accessor names remain an
implementation choice; the policy above is the contract. Tentative commit:
`feat(core): generate group intervals from index and locus scales`.

### 3. Use group intervals for axes and the heatmap example

- [x] Integrate the two domain children, private enablement dependency, and
      statically disabled fast path in `axisView.js`, including genome axes.
      Preserve ticks, labels, continuous fallback, and guide styling.
- [x] Replace the recent core heatmap outline formulas/aggregation with the
      two-axis source and top-layer gray unfilled rects using `clamp: true`,
      `clip: false`. Enable domain lines to demonstrate their new gap behavior.
      Follow `examples/README.md` for shared specs.
- [x] Verify generated views and rendered SVG behavior through the view-testing
      workflow, plus GPU interaction: all axis orientations, reversed output,
      padding, cuts outside/at bounds, partially visible gaps, wholly offscreen
      groups, shared axes at different widths, and reactive on/off transitions.
      Assert default-disabled gaps add no gap shader resources or helpers.
- [x] Update grouping-gap/mark docs and examples, regenerate schemas as needed,
      and record the automatic axis behavior in release notes. No spec migration
      is required; `axis.domain: false` remains available.

Verification: 68 SVG/example/axis tests passed, including all orientations,
reactive fallback, shared occurrences at different widths, and quantitative
encodings with explicit index scales. Core type checks and lint passed.
Both core examples passed real WebGL/WebGPU captures with pixel comparison.
Browser verification caught and fixed eager assembly initialization during axis
construction; mapping subscription now uses the existing post-scale hook.
The subagent's endpoint-affinity finding was fixed using existing metadata.

Outcome: automatic gapped domain lines and public group outlines share the same
source and ordinary clamped marks. Tentative commit:
`feat(core): draw axis domain lines from scale groups`.

### 4. Integration verification and independent KISS review

- [x] Exercise `examples/core/scale-grouping-gaps.json`, the core grouping-gap
      heatmap, and a chromosome-gap locus example in WebGL and WebGPU. Pan,
      zoom, resize, edit width/positions without a navigation nudge, and toggle
      zero/null/empty values. Check unclamped data alongside clamped guides,
      hover picking, Canvas/SVG export, and an export with a different size.
- [x] Run appropriately scoped tests, schema/example validation, workspace
      type checks, and lint. Broaden testing only for unresolved risk. Record
      focused added/deleted/net production SLOC and explain necessary growth.
- [x] Have a subagent review the integrated implementation for KISS,
      simplification opportunities, smells, and correctness across downstream
      consumers. Fix all obvious findings that do not need user input, remove
      redundant tests/helpers, and rerun affected checks. Ask for input only on
      substantive unresolved behavior or tradeoffs.

Verification: the full unit suite passed 4,946 tests; the final focused suites
passed 102 tests after review fixes. All three real WebGPU clamping/picking tests
passed. Workspace type checks, lint, schemas, release validation, and the
Storybook build passed. Documentation type generation and eleven targeted
Markdown-extension tests passed. WebGL, WebGPU, and Canvas browser checks passed
live width repaint without navigation, zero/null/empty toggles, chromosome
boundaries, zoom, resize, datum picking, SVG export, and raster export at a
different size. The two GPU example comparisons differed beyond the pixel
threshold at fewer than 0.6% of pixels.

Independent review found and resolved y-only rectangle precision handling,
quantitative/index axis endpoint affinity, early assembly initialization,
and negative synthetic endpoints from reversed inclusive domains. Group bounds
are intersected with the supported nonnegative index space without changing the
scale's domain. Tests now exercise one shared AxisView at unequal widths and an
actual fractional gap at a viewport edge. No actionable KISS or correctness
findings remain; no new abstraction or compatibility machinery was added.

Production-line comparison against the committed rectangle-only baseline
`56b4b5b49` (tests, docs, examples, blank lines, and JS comments excluded):

| Runtime source             | Added | Deleted |  Net |
| -------------------------- | ----: | ------: | ---: |
| Core JavaScript            |   394 |      90 | +304 |
| WebGPU renderer JavaScript |   168 |      51 | +117 |
| Core GLSL                  |    92 |      34 |  +58 |
| Total                      |   654 |     175 | +479 |

JavaScript counts use the production-line skill's parser token policy, including
embedded WGSL as template content. GLSL uses nonblank lines after removing C-style
comments. Including specification declarations adds 6 and deletes 1 more line
(net +5). Growth supplies the shared all-mark contract and the reusable source;
AxisView uses ordinary rules and preserves the constant-disabled fast path.

Outcome: verified integration with the requested independent review/fixing pass.
Use one coherent commit for any independently meaningful integration fixes,
for example `fix(core): align clamped guide behavior across renderers`; do not
create a review-fix commit when fixes belong in an earlier milestone's commit.

## Acceptance and plan disposition

### Follow-up simplification

- [x] Hide exhausted gap placements instead of rejecting container resizes.
      GPU visibility guards replace CPU capacity validation and instance scans;
      CPU occurrence traversal hides the same geometry. Inversion/navigation
      use ordinary domain mapping while space is exhausted.
- [x] Update WebGPU domains and optional fractional ranks atomically through
      `setDomain(domain, ranks)`, removing the separate rank setter and reset/
      restore ordering. Combine identical value/series scale initialization.
- [x] Verify resize recovery and picking on both axes in WebGL, WebGPU, Canvas,
      and SVG, including the heatmap with axes/outlines. All 4,950 unit tests,
      nine focused GPU tests, workspace type checks, lint, and release checks
      passed. Final browser review caught and fixed guard/preprocessor newline
      separation, with a focused regression assertion.

This follow-up removes 68 runtime production lines net against `012444633`
(107 added and 175 deleted under the same parser-token counting policy; tests,
docs, examples, and declarations excluded). The rectangle-baseline net growth
therefore becomes +411. Existing user example edits remain outside this commit.

Clamping is available on all seven mark types and defaults off. Enabled index
and locus axes have finite continuous pieces separated by actual gaps;
disabled axes retain the existing viewport line. The heatmap's group rectangles
come from the same source and keep visible outline strokes during navigation.
All render/picking/export paths agree, and navigation does not regenerate group
data. Constant-disabled gaps retain their zero-resource specialization.

No user decision is currently required. The reference/readiness and text/culling
review gates must expose any implementation mismatch before broadening the
architecture. Reconcile completed or discarded tasks before retirement and
preserve that record in Git history
before deleting this temporary plan for a PR.
