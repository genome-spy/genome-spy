# Annotation legends and scale resolution

## Goal

The existing toy track annotation example must show its region legend without
additional configuration. Place annotation legends in the owning concat's
existing legend regions, like a legend shared by its tracks, while keeping
physical placement separate from scale and legend resolution.

Implemented and reviewed. Preserve the agreed annotate
array, implicit LayerView, foreground placement, and positional projection
contract. No wrapper, annotation-specific resolve property, new legend syntax,
or general guide framework is proposed.

## Current behavior and cause

- `ConcatView.#initializeAnnotationLayer` creates a real LayerView. Its aligned
  positional channel is forced into the concat's track resolution. Perpendicular
  coordinates are unscaled; positional annotations do not expand track domains.
- `ContainerView.getDefaultResolution` returns shared, inherited by LayerView.
  Thus non-positional annotation scales are already shared among entries in the
  implicit layer. `ConcatView.getDefaultResolution` makes non-positional channels
  independent at the concat boundary by default. These scales do not normally
  merge with track scales.
- `resolutionPlanner.js` resolves legends using scale behavior unless explicitly
  overridden. Collection controls layout without merging scale domains.
- `LegendResolution.getLegendDefs` produces definitions per participating scale
  identity. Legend resolution and scale resolution are distinct; sharing the
  former must not merge independent scales or deduplicate by labels.
- `GridChild` discovers legends for ordinary unit/layer children. An annotation
  layer has no GridChild. `GridView.#syncSharedLegends` currently accepts only
  legends owned by the grid or explicitly collected there. The implicit layer's
  ordinary legend therefore has semantic ownership but no physical host.

Relevant implementation: `view/concatView.js`, `view/resolutionPlanner.js`,
`view/gridView/{gridView,gridChild,guideViewSync,legendCollection}.js`, and
`scales/legendResolution.js`, under `packages/core/src/`.

## Decisions

### Scale defaults

Retain ordinary implicit-layer semantics rather than inventing different defaults
for each non-positional channel:

| Relationship | Default | Explicit control |
| --- | --- | --- |
| Annotation aligned x/y and tracks | Same track scale; annotation domain inert | Existing positional restrictions remain |
| Annotation perpendicular y/x | No data scale | Constants or scale:null |
| Non-positional channels among annotate entries | Shared within the implicit layer | Existing nested-layer resolution or excluded subtree |
| Non-positional annotation channels versus tracks | Independent at the concat boundary | Concat resolve.scale.<channel>: shared |
| Legends | Follow corresponding scale resolution | Existing resolve.legend semantics |

Sharing is channel-based, not inferred from matching field names or values. A
rect and text annotation describing the same categories should obtain consistent
colors and one legend. Unrelated concepts encoded by the same channel need
explicit separation. Incompatible nominal/quantitative definitions on a shared
channel retain the existing validation error; do not silently split them.

The user-facing annotation array behaves as a layer, so this default is also
consistent with Vega-Lite's shared scale/legend default for layers:
https://vega.github.io/vega-lite/docs/layer.html#combined-scales-and-guides
GenomeSpy's concat defaults differ; keep GenomeSpy's existing independent
non-positional concat boundary. This is a conceptual comparison; no code is copied.

Existing resolution syntax is sufficient but must be explained precisely:

- Concat `resolve.scale.color: "shared"` intentionally lets participating tracks
  and annotation entries share a color domain and mapping. A shared legend then
  appears once at that resolution's layout host. Normal ancestor resolution
  rules still apply in nested compositions.
- To isolate one annotation from its siblings and ancestors, use its existing
  `resolve.scale.color: "excluded"`. Legends follow that scale unless overridden.
- To make several annotation views independent, place them in an explicit layer
  entry with `resolve.scale.color: "independent"`. That declaration controls its
  children. Do not document `independent` on a unit as an isolation barrier:
  the parent's shared behavior can still resolve that unit upward.
- A layer entry with `resolve.scale.color: "excluded"` forms a group isolated
  from the surrounding implicit layer while sharing color among its children.
- Keep ordinary `resolutionChannel` behavior for non-positional aliases, e.g.
  fill/stroke resolving through color. Verify legend identity follows the actual
  target resolution. Crossings from a styling channel into a positional target
  must not bypass annotation positional validation/domain inertness; reject those
  unsupported crossings at annotation preparation if currently accepted.

The implicit layer's defaults should remain defaults, not forced non-positional
resolution settings. Do not copy concat resolve declarations into annotation
entries or rewrite every style encoding.

### Legend placement

Give an annotation legend a default physical host: the concat that owns the
annotation subtree. Keep its semantic owner and source scale unchanged.

Use that GridView's existing legend regions and layout machinery. Ordinary
orientation, region stacking/wrapping, size reservation, inside placement,
legend styles, suppression, ordering, and interaction behavior apply. Multiple
independent annotation legends stack as complete legends in the same region.
Annotation marks still reserve no space; external legends reserve their ordinary
space. Annotation geometry is calculated after this space is accounted for.

Hosting precedence:

1. Honor the nearest explicit collected declaration using existing routing.
2. If a legend resolution is grid-owned, use that grid's ordinary hosting.
3. Otherwise, if its owner is within an annotation subtree, use the concat
   owning the nearest such subtree.
4. Otherwise, preserve ordinary GridChild hosting.

`resolve.legend.<channel>: "excluded"` blocks outer collection and falls back
to the annotation's normal host; it does not hide a legend. Existing legend:null
and configuration disable settings suppress it. An explicit collected declaration
inside an annotation has the containing concat as its nearest grid layout host.
Outer collection can gather track and annotation legends together. Nested concat
annotation legends stay at their nearest owning concat unless explicitly collected
elsewhere. Never duplicate a legend at both inner and outer hosts.

View-level legends declarations continue to target semantic resolutions, not
physical hosts. A concat-level legends.color is valid only when it resolves
unambiguously under existing rules. When several independent color legends exist,
configure the intended annotation encoding or explicit layer. Do not make physical
hosting silently broaden the meaning of concat-level legends.color.

### Implementation shape

Centralize grid legend host selection in one small helper near the existing
GridView-specific `getLegendCollectionLayoutHost`. It should combine the existing
collection route with the grid-owned and annotation-owned fallbacks above.
Use it in both `syncViewGuideViews` and `GridView.#syncSharedLegends`; avoid two
versions of host precedence. Derive annotation ownership from the existing
annotation-layer identity and layout ancestry, rather than storing another
annotation marker or host registry.

Guide discovery must include annotation legend owners during initial construction,
final guide sync, and mutation-triggered sync. Prefer deriving eligible owners
from existing descendant discovery and filtering by the shared host helper.
Remove any now-redundant concat collection-only discovery branch. Do not change
ordinary track legend hosting or collect every track legend merely because its
concat has annotations. Preserve existing legend filters used by App consumers.

No changes to the resolution planner should be needed for default legend hosting.
Any required positional-alias boundary validation belongs in annotation preparation.
Do not wrap annotations in a synthetic GridChild or move semantic resolutions to
GridView just to obtain legend layout.

## Alternatives considered

- Force all annotation scales to the concat: gives legends a host but merges
  unrelated track and annotation categories and may change track colors/domains.
- Set collected on the implicit layer: supplies a host, but creates an artificial
  nearest collection declaration that intercepts explicit outer collection.
- Make annotation entries independent by default: avoids unrelated shared channels,
  but contradicts the agreed implicit-layer semantics and breaks coordinated
  rect/text color mappings. Existing explicit separation handles this case.
- Add separate annotation legend rendering: duplicates existing region sizing,
  wrapping, styling, filtering, interaction, and backend support.

## Milestones

- [x] M1: Default host routing and semantic contract coverage.
      Add the shared host decision and integrate initial/final/mutation guide sync.
      Test the resolution matrix, ownership/placement independence, explicit outer
      collection, exclusion, suppression, nested containers, independent legends,
      and view-level property ambiguity. Verify color/fill/stroke aliases and close
      any positional alias bypass without changing ordinary scale semantics.
      Update concat reference to explain layer defaults, track independence,
      explicit grouping/separation, and automatic legend placement.
      Tentative commit: `fix(core): host annotation legends at their concat`.
- [x] M2: Layout, rendering, lifecycle, and documentation integration.
      Verify the existing toy example displays region A/B automatically in the
      concat legend region, without adding resolve or legend properties to make
      the test pass. Add representative fixtures for track color plus annotation
      color, shared color, nested collected legends, and horizontal annotations.
      Check semantic scale identity/domain and legend count alongside SVG layout
      bounds. Exercise resize, hidden/showing tracks and annotation views, data
      updates, guide recreation, and disposal without duplicated legends/listeners.
      Inspect WebGL and Canvas rendering and SVG export; smoke-test legend picking
      and #515 gap brushing after legends change plot bounds. Run focused suites,
      workspace TypeScript, lint, docs checks, then broader tests for shared routing.
      Tentative commit: `test(core): verify annotation legends across layout and rendering`.

## Review gates, risks, and acceptance

Review host precedence and scale identity before broad integration. Review final
integration with an emphasis on deleting duplicated host-routing/discovery code.
Measure production changes before/after; this should extend existing legend
hosting rather than add an annotation-specific legend subsystem.

Highest risks are duplicate hosts during guide sync, accidental scale merging,
outer collection being intercepted, and geometry becoming stale when legends
reserve space. Include App legend filtering and dynamic subtree mutation as
consumers of the hosting contract.

No new public API is needed. The main policy choice is retaining shared scales
among annotation entries; this proposal recommends it for consistency with the
implicit layer. The existing example should work unchanged. Acceptance requires
one visible annotation legend at the concat by default, stable independent track
scales, explicit sharing/collection working as documented, and preserved brushing,
clipping, and annotation ordering after legend layout.


## Completed review and verification

Luna (high) implemented default hosting in e05f1a6f6 and positional-alias
validation in 31e45e65b. Primary independently reviewed routing, lifecycle,
scale defaults, App legend filters, and rendering. Review identified and fixed
no-argument guide refresh dropping annotation legends; the resulting discovery
rule replaces the former concat-specific collection branch. Ordinary GridChild
hosting and App filtering remain unchanged.

Primary consolidated overlapping tests into annotationLegendRouting.test.js:
13 tests cover real color scale identity/domains, implicit sharing, explicit
nested independent/excluded groups, outer collection/exclusion, suppression,
ordinary and whole-tree guide refresh, track mutation/resize, SVG placement in
both orientations, valid styling aliases, and rejected positional aliases.
Existing grid legend tests retain coverage for source domain/range updates,
hidden contributors, reactive disable, and grid legend filters. Reusing these
unchanged paths avoids a parallel annotation legend lifecycle.

Final checks: all 472 test files pass; 4070 tests pass, one existing skip and
two existing todos. All workspace TypeScript checks and ESLint pass. Generated
documentation is current, schema generation succeeds, and the unchanged toy
example validates against the generated schema.

Independent browser checks pass for unchanged toy, separate track colors,
explicit shared color, outer collection, and annotation exclusion. The official
WebGL screenshot was visually inspected; Canvas smoke passes. Gap brush
creation, translation with unchanged viewport, clearing, unclaimed navigation,
and document-level continuation pass in x and y with the legend present.
Scratch visual: /tmp/annotation-legends-toy-final.png.

Production JavaScript delta for this follow-up: 34 net lines across three files,
plus six net specification-type documentation lines. Shared host routing replaces
duplicated collection decisions. No new scale-resolution policy or public
configuration property was added. All implementation and review gates are complete;
retire this temporary plan in a subsequent commit.
