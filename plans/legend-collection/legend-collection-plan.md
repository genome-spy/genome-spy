# Collected legend resolution plan

## Status

Implemented on `feature/legend-collection`.

## Summary

Add `"collected"` as a legend-only resolution behavior:

```json
{
  "resolve": {
    "legend": {
      "color": "collected"
    }
  }
}
```

The mode preserves normal scale-driven legend resolution but lays out complete
legend views at the composition that declares the mode. Shared scales produce
one shared legend, while independent scales produce separate collected
legends. It does not merge domains, scales, legend entries, or independent
legend resolutions.

Normal legend placement remains resolution-owner based. Independent legends
stay with their source grid children, and shared legends stay with the
`GridView` that owns their shared resolution. Collection is explicit and does
not change this default.

The name is the adjective `"collected"` so it aligns with the existing
`"independent"`, `"shared"`, `"excluded"`, and `"forced"` modes. The concept is
based on patchwork's composition-level guide collection, documented in its
[layout guide](https://patchwork.data-imaginist.com/articles/guides/layout.html).
No upstream code is copied.

## Background

The supporting comparisons are recorded in:

- [`genome-spy-vega-legend-findings.md`](genome-spy-vega-legend-findings.md)
- [`legend-placement-ecosystem-findings.md`](legend-placement-ecosystem-findings.md)

GenomeSpy already separates scale resolution from legend resolution. If a
legend resolution is not configured explicitly, it follows the corresponding
scale resolution. The resolution planner registers each `LegendResolution` on
the view that semantically owns it.

Layout follows that ownership:

- `GridChild` lays out independent legends around an individual child view.
- `GridView` lays out shared legends around its complete child grid.

This produces Vega-Lite-like placement for ordinary compositions. In
`examples/core/legends/threshold-gradient.json`, two independent color legends
remain with their respective horizontally concatenated views. A right legend
occupies space between the views, while a bottom legend is sized relative to
its own view.

Bioinformatics compositions also need a different operation: unrelated
legends may need to be gathered into one centralized area without pretending
that their scales or mappings are shared. ComplexHeatmap and patchwork both
support this distinction.

## Goals

- Keep resolution-owner placement as the default.
- Collect complete, unrelated legends at an explicitly selected composition.
- Preserve normal scale-driven legend sharing during collection.
- Support collection by one legend channel or by all legend channels.
- Allow `"excluded"` to keep a channel or subtree out of an outer collection.
- Reuse existing legend regions, ordering, measurement, and layout behavior.
- Support authored concat roots and implicit root grids.
- Support registered custom root views, including App `SampleView`.
- Keep collection correct across visibility changes and view mutations.
- Fail clearly when a collected legend has no usable grid layout host.
- Document collection as distinct from sharing, merging, and deduplication.

## Non-goals

- Deduplicating visually or semantically equivalent legends.
- Combining unrelated legend entries into one legend.
- Sharing or reconciling scale domains and ranges.
- Named legend destinations such as Plotly's `legend2`.
- A dedicated `guide_area` layout cell.
- Automatic collection based on available space.
- Reactive changes to resolution behavior.
- Per-definition collection overrides outside the existing resolution scopes.
- Free-coordinate legend placement.
- A generalized guide-routing framework or persistent collector registry.

## Existing architecture

The implementation must preserve the following contracts:

- `packages/core/src/spec/view.d.ts` defines resolution targets and behaviors.
- `View.getConfiguredOrDefaultResolution()` makes legend resolution follow
  scale resolution when legend resolution is unspecified.
- `packages/core/src/view/resolutionPlanner.js` determines semantic resolution
  owners and registers resolution members.
- `LegendResolution.getLegendDefs()` produces complete legend definitions and
  keeps their live scale-resolution references.
- `GridChild` discovers independent legend owners inside a child view.
- `GridView` constructs regions for resolutions owned by the complete grid.
- The data-parent tree controls resolution inheritance; the layout-parent tree
  controls physical layout.
- `ViewFactory` currently adds an implicit root `GridView` only for selected
  built-in root spec types.

Collection must not move `LegendResolution` objects or alter their member
registrations. Only generated legend layout views move to another collector.

## Public grammar

### Legend-specific resolution behavior

Split the public resolution behavior types so `"collected"` is accepted only
for legends:

```ts
export type ResolutionBehavior =
    | "independent"
    | "shared"
    | "excluded"
    | "forced";

export type LegendResolutionBehavior =
    | ResolutionBehavior
    | "collected";
```

`ResolveSpec.resolve.legend` uses `LegendResolutionBehavior`, while
`resolve.scale` and `resolve.axis` continue to use `ResolutionBehavior`.
Schema validation must reject `"collected"` for scales and axes.

### One channel

Collect independent color legends at the declaring composition:

```json
{
  "resolve": {
    "scale": { "color": "independent" },
    "legend": { "color": "collected" }
  },
  "hconcat": []
}
```

### All legend channels

Collect every eligible legend channel:

```json
{
  "resolve": {
    "legend": { "default": "collected" }
  },
  "concat": []
}
```

Channel-specific declarations retain their existing precedence over
`default` at the same view.

### Excluding a subtree

Prevent one view or subtree from contributing color legends to an outer
collector:

```json
{
  "resolve": {
    "legend": { "color": "excluded" }
  }
}
```

On a unit view, this keeps that view's color legend at its normal local layout
owner. On a composition, descendant color legends may still share at that
composition according to the existing `"excluded"` semantics, but the
resulting legend cannot be collected by an outer ancestor.

## Semantics

### Semantic resolution

At the view that declares it, `"collected"` controls layout while semantic
legend resolution follows the corresponding scale resolution:

- A shared scale produces one shared `LegendResolution` and one legend.
- Independent scales produce separate `LegendResolution` instances and
  separate collected legends.
- Existing shared legend resolutions inside a child subtree remain shared.
- Collection never merges or deduplicates independent legends.

The resolution planner must treat `"collected"` explicitly by delegating its
semantic behavior to the corresponding scale resolution. Unknown resolution
modes must continue to fail loudly.

### Layout collection

After semantic resolutions are complete, each legend resolution is considered
for collection:

1. Start at the semantic legend-resolution owner.
2. Walk its data ancestors toward the root.
3. At each view, inspect the explicit channel or `default` legend resolution.
4. If it is `"excluded"`, stop and retain resolution-owner placement.
5. If it is `"collected"`, route the complete generated legend views to that
   declaration's grid layout host.
6. If neither mode is encountered, retain existing resolution-owner placement.

The nearest collected declaration wins. This makes nested collection
deterministic and prevents an outer collector from collecting the same legends
again. An `"excluded"` declaration encountered before a collector shields that
channel or subtree from all outer collection declarations.

Collection is evaluated from explicit legend resolution declarations, not
from `getConfiguredOrDefaultResolution()`. Otherwise ordinary independent
scale defaults could be mistaken for collection policies.

### Layout host

The physical collector is:

- The declaring view itself when it is a `GridView`.
- The nearest `GridView` layout ancestor that hosts the declaring authored view
  otherwise.

The second case covers unit, layer, multiscale, and registered custom roots
inside an implicit root grid. It also keeps the semantic declaration on the
authored view while allowing the wrapper to provide root chrome.

If no grid host exists because an internal caller disabled root wrapping, guide
synchronization fails with a message that identifies the collected channel and
the declaring view.

### Legend identity and configuration

Collection changes neither the legend definition nor its live dependencies:

- The original `LegendResolution` remains the semantic owner.
- The original `ScaleResolution` supplies domain and range updates.
- Individual properties such as title, orientation, direction, symbols, and
  gradient configuration remain resolved from the legend's normal config
  scopes.
- Region-level packing and anchoring are resolved from the destination
  collector's config scopes.
- Reactive visibility and `disable` state remain attached to the original
  legend definition.

Collected legends with the same orientation share one destination region but
remain separate `LegendView` instances.

### Ordering

Use the existing deterministic legend ordering:

1. Depth-first source view order.
2. Case-insensitive title, field, or channel label.
3. Channel name as the final tie-breaker.

Collection must not reorder semantic resolution members.

## KISS implementation constraints

Implement collection as a small extension of existing legend discovery and
synchronization:

1. Add one pure helper that walks from a semantic legend owner toward the root
   and returns the nearest collected layout host, stops at `"excluded"`, or
   returns no override.
2. Have existing local and shared legend synchronization call that helper when
   deciding whether they own a definition.
3. Let a collecting `GridView` reuse the existing descendant legend discovery
   and legend-region construction paths.
4. Reuse current initialization, mutation, visibility, disposal, and layout
   invalidation hooks.

Do not add a new semantic resolution object, generalized guide scheduler,
named collector abstraction, or persistent routing map. Collection targets are
cheap derived state and should be recomputed from the view hierarchy when
existing guide synchronization runs.

## Guide synchronization

Extend existing legend synchronization so a collecting `GridView` can inspect
the completed non-chrome subtree. Derive layout contributions from semantic
resolution owners without creating another resolution structure.

For every active legend definition, derive:

```text
semantic resolution owner
    -> optional nearest collected declaration
    -> physical GridChild or GridView collector
    -> orientation region
```

Each definition must appear in exactly one physical collector:

- Local collectors exclude definitions routed to a collected destination.
- Shared `GridView` collectors retain naturally owned definitions unless those
  definitions are routed farther outward.
- A collected destination includes only definitions for which it is the
  nearest collection target.
- Definitions shielded by `"excluded"` remain at their semantic owner's normal
  layout collector.

The collection helper and existing ordered legend discovery provide all
routing information. Do not store a second long-lived map that can disagree
with the resolution hierarchy.

Use the existing guide synchronization calls that already run:

- After initial resolution planning and view-level guide attachment.
- After subtree insertion, removal, replacement, or reordering.
- After visibility changes that affect active legend definitions.

Do not introduce a separate collection scheduler or lifecycle.

Disposal must remove generated legend subtrees, listeners, and dataflow
branches before rebuilding affected regions.

## Implicit root wrapper

Generalize the automatic root wrapper from a whitelist of built-in leaf specs
to a structural rule:

```text
wrap every authored root unless it is already a concat/GridView root
```

Concretely, unit, layer, multiscale, interval-selection, and registered custom
root views are wrapped. Authored `vconcat`, `hconcat`, and `concat` roots remain
unwrapped unless another existing requirement mandates a parent.

`getTopLevelSpecView()` continues to return the authored child. The implicit
wrapper remains non-addressable. App code can therefore traverse the actual
layout root while APIs that need the authored `SampleView` can retrieve it.

This wrapper change is required for explicitly collected legends in App roots;
ordinary legends remain resolution-owner based and do not require root
collection.

## Configuration and layout interaction

Collection is independent from legend-region layout. The collection feature
reuses whichever region direction, spacing, and anchoring behavior is present
on the implementation branch.

The destination collector controls complete-region layout because it owns the
available edge and reserves the space. Individual legends retain their own
entry layout and visual properties.

Adaptive gradient dimensions use the destination legend viewport. A collected
bottom gradient may therefore span the declaring composition, while an
uncollected bottom gradient remains relative to its resolution owner. This is
intentional and must be demonstrated in tests.

## Alternatives considered

### `legend.placement: "local" | "root"`

This directly routes individual legend definitions, but it makes root
collection look like a universal placement default and obscures GenomeSpy's
existing resolution-owner behavior. It also limits collection to a fixed root
instead of the composition that requests it.

Rejected in favor of a composition-scoped resolution declaration.

### Merging legends with independent scales

GenomeSpy could synthesize one legend from multiple independent scales, but it
would need rules for reconciling domains, ranges, titles, formatting, and
interactions. It would also blur semantic ownership.

Rejected. Shared scales already produce one legend naturally; independent
scales remain separate and are only packed together.

### Global figure-level legends by default

This resembles Plotly, but it breaks Vega-Lite-like composition behavior and
makes adaptive gradients use the complete figure extent unexpectedly.

Rejected. Collection remains explicit.

### Named collectors or guide areas

Named destinations and dedicated layout cells offer more control, but they
require a larger routing and layout grammar than the two current use cases.

Deferred. The collected-resolution design does not preclude them later.

## Risks

- Resolution code may accidentally treat `"collected"` as unconditionally
  shared instead of following scale resolution.
- Collection traversal may accidentally cross an `"excluded"` boundary and
  violate its existing no-pull contract.
- Nested collection can duplicate legends unless nearest-target routing is
  enforced centrally.
- Mutation rebuilds can leak listeners or generated dataflow branches.
- Destination region sizing can incorrectly affect sibling flex allocation.
- A broadened implicit wrapper may reveal App code that assumes the authored
  custom view is the physical root.
- Generic resolution types may accidentally expose `"collected"` for axes or
  scales in the generated schema.
- Shared scales with collected legends may intentionally produce visually
  duplicate independent legends; documentation must make the behavior clear.

## Implementation steps

### 1. Define collected legend resolution

**Outcome:** Add the legend-specific resolution behavior and schema contract.
Preserve scale-driven semantic legend resolution in the resolution planner.

**Affected areas:** `spec/view.d.ts`, resolution-mode branching,
`resolutionPlanner.js`, schema tests, and focused resolution tests.

**Verification:** Accept `resolve.legend.color: "collected"` and
`resolve.legend.default: "collected"`; reject the mode for scales and axes;
verify shared scales produce one legend resolution and independent scales
produce distinct legend resolutions.

**Documentation and migration:** Add concise schema documentation. Existing
specifications are unaffected because defaults do not change.

**Tentative commit:** `feat(core): define collected legend resolution`

### 2. Generalize the implicit root grid

**Outcome:** Wrap registered custom roots and other non-grid roots in the
existing implicit `GridView` host.

**Affected areas:** `viewFactory.js`, top-level authored-view mapping, factory
tests, App root integration tests, and mutation selectors.

**Verification:** Confirm that concat roots are not double-wrapped, a custom
registered root is wrapped, `getTopLevelSpecView()` returns the authored view,
and `SampleView` remains discoverable through App APIs.

**Documentation and migration:** No grammar migration. Update implementation
comments to describe the wrapper as the root chrome host rather than only an
axis host.

**Tentative commit:** `fix(core): wrap custom roots for guide layout`

### 3. Route collected legend views

**Outcome:** Discover nearest collected declarations and render each complete
legend at exactly one destination collector without moving semantic
resolutions. Integrate with existing mutation, visibility, disposal, and
layout invalidation paths in the same step.

**Affected areas:** Grid-child legend discovery, `GridView` shared legend
synchronization, the existing guide synchronization entry points, generated
legend disposal, deterministic ordering helpers, and focused layout snapshots.

**Verification:** Cover independent legends collected at root, collection by
one channel and by `default`, distinct titles/domains, mixed orientations,
nested nearest collectors, an internally shared legend collected by an outer
composition, unit-level and subtree-level `"excluded"` barriers, and clear
failure without a grid host. Insert, remove, move, and replace child views;
toggle active legends; ensure no stale or duplicate generated views; confirm
collected legends reserve space only at their collector and do not distort
sibling flex allocation.

**Documentation and migration:** None beyond implementation comments that state
the semantic/layout ownership split.

**Tentative commit:** `feat(core): collect legends at composition layouts`

### 4. Add examples and user documentation

**Outcome:** Demonstrate resolution-owner defaults and explicit collection.

**Affected areas:** `examples/core/legends/`, one compact docs example,
`docs/grammar/legend.md`, composition/resolution documentation, screenshots,
and example snapshots.

**Verification:** Keep `threshold-gradient.json` visually owner-local by
default. Add a matrix-like example using independent scales and
`default: "collected"`. Add a mixed-channel example if it materially clarifies
the behavior. Verify generated thumbnails.

**Documentation and migration:** Explain that collection does not share scales,
merge legends, or deduplicate them. Keep only the essential collected example
in the grammar documentation; place broader demonstrations in the Core legend
gallery.

**Tentative commit:** `docs(core): demonstrate collected legend resolution`

## Acceptance criteria

- Existing specifications retain resolution-owner legend placement by default.
- `threshold-gradient.json` retains its Vega-Lite-like child legend layout.
- `"collected"` is accepted only for legend resolution.
- Collected legends follow scale resolution: shared scales produce one legend,
  while independent scales produce separate legends.
- A declaring composition lays out collected legends in its own regions.
- `default: "collected"` collects all eligible legend channels.
- Nested collection routes each legend to exactly one nearest collector.
- `"excluded"` prevents an outer collector from pulling legends across that
  resolution boundary.
- Collection does not deduplicate or merge complete legends.
- Individual legend properties remain source-configured; region layout remains
  destination-configured.
- Adaptive gradients size against their actual destination viewport.
- Authored concat roots and implicit custom-root wrappers both support
  collection.
- View mutations and visibility changes cannot leave stale, duplicated, or
  orphaned collected legends.
- The implementation adds no persistent collection registry or separate guide
  synchronization framework.
- Core unit tests, TypeScript checks, linting, App integration tests, schema
  generation, docs build, and example snapshots pass.
