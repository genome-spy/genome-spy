# Subtree Isolation Plan

This document investigates GitHub issue #413, "Consolidate internal guide and
chrome subtree isolation", and proposes implementation directions.

## Goal

Generated guide and chrome subtrees should be safe by default while still using
ordinary GenomeSpy views, marks, dataflow, scales, and parameters where that
reuse is useful. The contract should be explicit enough that new guide/chrome
code does not need to remember a fragile combination of options, runtime marks,
and spec-level resolution overrides.

## Non-goals

- Do not replace generated guides with a separate scenegraph-only system.
- Do not make all chrome non-interactive. Some chrome, such as selection
  rectangles and App sidebars, intentionally participates in interaction.
- Do not collapse `layoutParent` and `dataParent`. The split is useful, but its
  current responsibilities need clearer names and helper APIs.
- Do not expose a broad user-facing `internal` flag in the public grammar.

## Why This Matters

The current system has several independent isolation mechanisms:

- `blockEncodingInheritance`
- `markViewAsChrome`
- `markViewAsNonAddressable`
- `resolve.axis: "excluded"`
- `resolve.legend: "excluded"`
- `domainInert`
- ad hoc choices of `dataParent` and `layoutParent`

Each mechanism solves a different problem. The fragility comes from generated
subtree constructors assembling them manually. Missing one can produce bugs that
depend on inherited configuration, such as plot axis grid configuration creating
grid views inside generated legends.

The most important architectural constraint is that generated guides need mixed
isolation. They usually must block user-authored encodings, suppress generated
guides, avoid domain contribution, and stay hidden from user-facing traversal.
At the same time, they often need source scale access, source parameter scope,
ordinary mark rendering, dataflow initialization, and sometimes picking.

## Issue Context

Issue #413 has no comments at the time of this investigation. The issue body
identifies the problem as scattered mechanisms for separating generated
guide/chrome views from user-authored plot views. It explicitly calls out that
the current behavior works only when each generated subtree remembers the right
combination of flags and resolution overrides.

Related code comments in `packages/core/src/view/legendView.js` point to issue
#412 and issue #413. The current legend workaround recursively injects
`resolve.axis.default = "excluded"` and
`resolve.legend.default = "excluded"` into generated legend specs.

## Current Mechanisms

### `blockEncodingInheritance`

Implementation:

- `packages/core/src/view/view.js`: `getEncoding()` stops inheriting
  `dataParent` encodings when `options.blockEncodingInheritance` is true.
- `packages/core/src/view/view.js`: `getFacetFields()` returns no inherited
  fields when the option is true.
- `packages/core/src/view/unitView.js`: `UnitView.resolve()` skips legend
  resolution when the option is true.

Current source uses:

- `packages/core/src/view/axisView.js`
- `packages/core/src/view/axisGridView.js`
- `packages/core/src/view/gridView/gridChild.js`
- `packages/core/src/view/gridView/scrollbar.js`
- `packages/core/src/view/gridView/selectionRect.js`
- `packages/core/src/view/gridView/separatorView.js`
- `packages/core/src/view/titleView.js`
- `packages/core/src/view/legendView.js`
- `packages/app/src/sampleView/sampleView.js`

Notes:

- This is a boundary tool, not a recursive subtree tool.
- Applying it to every generated child would break internal inheritance patterns
  inside generated specs. For example, generated axis and legend layers use
  ordinary container inheritance for their own helper encodings.
- It also has a guide-resolution side effect in `UnitView.resolve()`, which
  makes it more than just an encoding option.

### Runtime Chrome Marks

Implementation:

- `packages/core/src/view/viewSelectors.js` stores chrome overrides in a
  `WeakMap`.
- `markViewAsChrome(view, { skipSubtree: true })` removes the view subtree from
  non-chrome traversals.
- `visitNonChromeViews()` is used by view-level scale and guide config mapping.
- `isChromeView()` is used by guide activity checks, generated legend ownership,
  lazy legend scale lookup, and dynamic chrome initialization.

Current source uses:

- Core: axes, axis grids, grid backgrounds, scrollbars, selection rectangles,
  separators, title views, legend regions, legend views, facet labels.
- App: sample sidebar, sample group backgrounds, sample group background
  strokes.

Notes:

- Chrome is not the same as non-addressable.
- Chrome is not the same as non-picking. `SelectionRect` is chrome but still
  relies on picking behavior to mask marks under an active selection rectangle.
- Chrome status is runtime-only. If a generated subtree is recreated, the
  constructor or helper must mark it again.

### Runtime Non-addressable Marks

Implementation:

- `packages/core/src/view/viewSelectors.js` stores addressability overrides in a
  `WeakMap`.
- `markViewAsNonAddressable(view, { skipSubtree: true })` removes the view
  subtree from selector resolution, selector constraint validation, bookmarkable
  parameter traversal, and App-facing addressable traversals.

Current source uses:

- Core: axes, axis grids, grid backgrounds, scrollbars, selection rectangles,
  separators, title views, legend regions, legend views, facet labels.
- Core implicit root wrapping uses `markViewAsNonAddressable(view)` without
  skipping the subtree.
- App sample sidebar and group backgrounds are chrome but are not marked
  non-addressable.

Notes:

- Addressability must remain a separate policy. The App sidebar is intentionally
  chrome but still participates in visibility/settings workflows.

### `domainInert`

Implementation:

- `packages/core/src/spec/view.d.ts` defines internal view-level
  `domainInert`.
- `packages/core/src/spec/channel.d.ts` defines internal channel-level
  `domainInert`.
- `packages/core/src/view/view.js`: `isDomainInert()` inherits the view-level
  flag through the `dataParent` chain.
- `packages/core/src/view/resolutionPlanner.js`: scale members from inert views
  are registered with `contributesToDomain: false`.
- `packages/core/src/view/unitView.js`,
  `packages/core/src/scales/scaleResolution.js`, and
  `packages/core/src/scales/domainPlanner.js` skip channel-level inert accessors.

Current source uses:

- Axis specs and axis grid specs mark the generated root spec as domain inert.
- Selection rectangle and separator specs are domain inert.
- Legend symbol and gradient helper encodings mark the represented source
  channel as domain inert.
- `packages/core/src/marks/markUtils.js` uses channel-level `domainInert` for
  synthesized secondary quantitative anchors.

Notes:

- `domainInert` prevents domain contribution, not scale membership.
- That distinction is useful for guide marks that need to use a source scale
  without modifying the source scale domain.

### Resolution Exclusion

Implementation:

- `ResolutionBehavior` includes `"excluded"` in
  `packages/core/src/spec/view.d.ts`.
- `packages/core/src/view/resolutionPlanner.js` treats excluded resolution as a
  barrier: it behaves like shared inside the subtree but is not pulled toward
  the root.
- `packages/core/src/scales/viewLevelScaleConfig.js` and
  `packages/core/src/scales/viewLevelGuideConfig.js` skip excluded child
  subtrees when mapping parent-level config.

Current source uses:

- `packages/core/src/view/legendView.js` recursively applies default axis and
  legend exclusion to every generated legend child spec.
- Legend body specs explicitly exclude helper `x` and `y` scale/axis
  resolutions.
- `packages/core/src/view/gridView/separatorView.js` excludes `x` and `y`
  scale/axis resolutions.
- `packages/core/src/view/gridView/gridChild.js` excludes `x` and `y`
  scale/axis resolutions for background stroke helper specs.
- `packages/app/src/sampleView/metadata/metadataView.js` returns excluded
  legend resolution by default.

Notes:

- The recursive legend exclusion exists because generated legend roots are
  concat/grid views. `ConcatView.initializeChildren()` creates grid children and
  guide views, so generated unit views inside a legend can otherwise produce
  internal axes or grids during ordinary construction.
- Axis guide internals are less exposed to this exact bug because generated
  axis roots are layers, not grid views that call `createAxes()`.
- This mechanism is only about resolution topology. It decides where scale,
  axis, and legend resolutions are collected in the data-parent hierarchy. It
  should not imply chrome status, addressability, picking behavior, domain
  contribution, or whether a view is allowed to create guides.

### Internal Attachment Role

The child/auxiliary distinction has broader meaning than resolution topology.
It should be modeled as an internal attachment role that supplies defaults for
several policies. A generated helper view should not need public spec flags just
to say that it is not part of the authored visualization semantics.

Proposed internal option:

```ts
interface CreateViewOptions {
    attachmentRole?: "child" | "auxiliary";
}
```

This option belongs in internal view creation APIs such as
`CreateViewOptions`/`ViewOptions`. It must not be added to the JSON grammar,
schema, or user-facing docs.

Meaning:

- `attachmentRole: "child"` means the view is part of authored/composed
  visualization semantics.
- `attachmentRole: "auxiliary"` means the view supports another view as a
  generated guide, decoration, label, overlay, or App support view.

Default policies:

- Resolution topology: children use normal view-type defaults; auxiliary views
  default scale, axis, and legend resolutions to `"excluded"` unless the spec
  explicitly configures a resolution.
- Encoding inheritance: children inherit only when an authored composition
  boundary opts in; auxiliary views do not inherit authored encodings by default.
- Addressability and chrome: auxiliary views are usually chrome and often
  non-addressable, but App support views can override that default.
- Domain contribution: auxiliary views are often domain inert, but this must
  stay explicit because some helpers intentionally use source scales.
- Picking/interactions: auxiliary views default to the helper's explicit
  behavior. Selection rectangles are auxiliary but interactive.

The role supplies defaults only. Individual policies remain separate and
overrideable so special cases stay visible.

Resolution defaults for real child views:

- Layer children use the current layer default: `"shared"`.
- Concat children use the current concat defaults: independent axes, shared `x`
  for `vconcat`, shared `y` for `hconcat`, otherwise independent.
- Ordinary unit children should eventually default to independent. The current
  `UnitView` default of shared `x` exists for sample aggregate views and should
  become an explicit sample-summary resolution choice.

Likely auxiliary views:

- axes and axis grids
- legend roots and legend internals
- grid backgrounds and strokes
- scrollbars
- selection rectangles
- separators
- title internals
- App sample group backgrounds and strokes

This is deliberately separate from guide-generation policy. An auxiliary view
with excluded resolutions may still create internal guide views if its own
view-type behavior does that. Preventing guide creation is a separate concern.

### `dataParent` and `layoutParent`

Current pattern:

- `layoutParent` determines rendered/layout hierarchy.
- `dataParent` supplies inherited encodings, config scopes, param scope, base
  URL, dataflow ancestry, and scale/axis/legend resolution ancestry.

Generated guide/chrome examples:

- Child-local axes and axis grids: `layoutParent` is the owning grid view,
  `dataParent` is the source view whose scale/axis they represent.
- Shared axes: both parents are the owning grid view.
- Grid backgrounds, titles, scrollbars, and selection rectangles: `layoutParent`
  is the grid view, `dataParent` is the source view.
- Legends: `layoutParent` is the grid view or legend stack; `dataParent` is the
  legend owner/source view.
- App sample summary views: `layoutParent` is the summary container;
  `dataParent` is the sample child view.

Notes:

- `dataParent` is overloaded. It currently means dataflow parent, encoding
  inheritance parent, parameter scope parent, base URL parent, and resolution
  parent.
- Generated subtrees often want source resolution and parameters but not source
  encodings or source guide generation. That mismatch is the root of many hacks.

## Current Call-site Inventory

### Core Axis Views

Files:

- `packages/core/src/view/axisView.js`
- `packages/core/src/view/axisGridView.js`
- `packages/core/src/view/gridView/gridChild.js`
- `packages/core/src/view/gridView/gridView.js`

Current behavior:

- Constructors pass `blockEncodingInheritance: true`.
- Constructors mark roots as chrome and non-addressable with subtree skipping.
- Generated specs are `domainInert: true`.
- Main axis/grid scale resolution is forced toward the source view.
- Axis and axis-grid roots override `isPickingSupported()` to false.

Risk:

- Axis internals still rely on normal layer/unit machinery. A generic recursive
  block-encoding option would break them.
- Axis creation is split between `GridChild` child-local guides and `GridView`
  shared guides.

### Core Legends

Files:

- `packages/core/src/view/legendView.js`
- `packages/core/src/view/gridView/gridChildLegends.js`
- `packages/core/src/data/sources/lazy/legendEntriesSource.js`

Current behavior:

- `LegendView` and `LegendRegionView` pass `blockEncodingInheritance: true`.
- Legend roots and generated child roots are marked chrome and non-addressable.
- Legend child creation forces `layoutSizeParams: "force"` to avoid authored
  width/height params leaking into internal layout expressions.
- `excludeLegendGuideResolutions()` recursively injects guide-resolution
  exclusion.
- Legend body helper `x`/`y` scales are excluded.
- Represented source-channel encodings are channel-level `domainInert`.
- `LegendEntriesSource.findLegendScaleResolution()` climbs out of chrome
  parents to find the source scale resolution.
- Legend roots override `isPickingSupported()` to false.

Risk:

- Legends have the strongest evidence that the current contract is implicit and
  fragile. The recursive helper is a working patch but is local to legend code.
- Source-scale access is intentional, so blanket scale isolation would require
  explicit source-scale exceptions.

### Core Grid Chrome

Files:

- `packages/core/src/view/gridView/gridChild.js`
- `packages/core/src/view/gridView/scrollbar.js`
- `packages/core/src/view/gridView/selectionRect.js`
- `packages/core/src/view/gridView/separatorView.js`

Current behavior:

- Background fill and stroke helpers pass `blockEncodingInheritance: true`.
- Core grid backgrounds are chrome and non-addressable.
- Separators are chrome, non-addressable, domain inert, and exclude helper
  `x`/`y` scale/axis resolution.
- Scrollbars are chrome and non-addressable. They block encoding inheritance but
  are not domain inert because they use constant data and no scale-backed
  encodings.
- Selection rectangles are chrome and non-addressable, block encoding
  inheritance, are domain inert, and force source `x`/`y` scales.
- Selection rectangle data uses underscore-prefixed fields to avoid tooltips
  while preserving picking/masking behavior.

Risk:

- Selection rectangles prove that picking must be a separate policy from chrome
  and addressability.
- Separators and background strokes are decorative and could use a stronger
  default isolation preset than selection rectangles.

### Core Titles and Facet Labels

Files:

- `packages/core/src/view/titleView.js`
- `packages/core/src/view/facetView.js`

Current behavior:

- `TitleView` marks the root as chrome and non-addressable.
- `TitleView` creates child unit views with `blockEncodingInheritance: true`.
- Facet labels are marked chrome and non-addressable.

Risk:

- Title root and title child isolation are split. A future helper should make
  this obvious instead of relying on readers to notice both parts.

### App Sample Chrome

Files:

- `packages/app/src/sampleView/sampleView.js`
- `packages/app/src/sampleView/metadata/metadataView.js`

Current behavior:

- Sample sidebar is marked chrome but not non-addressable.
- Sample group backgrounds and strokes are marked chrome but not
  non-addressable.
- Sample group backgrounds/strokes pass `blockEncodingInheritance: true`.
- Metadata view excludes legend resolution by default and keeps scale/axis
  resolution independent by default.

Risk:

- App chrome needs more nuanced presets than Core guide chrome.
- A future helper must allow "chrome only" and "decorative non-addressable
  chrome" separately.

## Encoding Inheritance Inversion Investigation

The current inheritance direction is the main source of `blockEncodingInheritance`
noise. Ordinary authored composition wants inherited encodings, but most
generated guide/chrome views are created with a `dataParent` only because they
need source dataflow, params, base URL, or scale resolution. They usually do not
want source encodings.

### Current Semantics

Implementation facts:

- `View.getEncoding()` inherits `dataParent.getEncoding()` by default and merges
  the local `spec.encoding` on top.
- `UnitView.getEncoding()` filters inherited channels that the mark does not
  support, while preserving metadata channels such as `key`.
- `Mark.encoding` consumes `unitView.getEncoding()`, so inherited encodings feed
  mark encoders, scale membership, and axis membership.
- `resolutionPlanner` uses full `mark.encoding` for scale and axis resolution,
  but only `view.spec.encoding` for legend resolution.
- `View.getFacetFields()` uses `this.getEncoding().sample` before falling back
  through the layout parent chain.
- `flowBuilder.linearizeLocusAccess()` already has comments and workarounds
  because `getEncoding()` includes inherited channels while rewrites must land
  in the unit spec.

The awkward part is that `blockEncodingInheritance` is not only about encoding:
`UnitView.resolve()` also uses it to skip legend resolution. In an inverted model
that coupling must be split. A normal unit view with no inherited encoding still
needs to create legends from its own `spec.encoding`; a generated helper unit may
need to suppress guide generation even though it has its own helper encodings.

### Authored Usage

Parent-level encoding is established public behavior for authored composition.
A structured scan of `examples/` found 58 container specs that define both a
container operator and `encoding`:

- `layer`: 30
- `vconcat`: 11
- `hconcat`: 10
- `concat`: 5
- `multiscale`: 2

Representative examples:

- `examples/docs/grammar/composition/layer/bar-and-label-layer.json`: the layer
  defines `x` and `y`; child marks inherit them.
- `examples/docs/grammar/composition/concat/grid-concat.json` and
  `shared-axes.json`: concat roots define `x` and `y`; child marks inherit them.
- `examples/docs/grammar/composition/multiscale/multiscale-composition.json`:
  the multiscale root defines `x` and `y`; children add only detail-specific
  encodings.

Docs also describe inherited data and encoding generally in
`docs/grammar/composition/index.md`, explicitly for layers in
`docs/grammar/composition/layer.md`, and for multiscale via expansion to layer
in `docs/grammar/composition/multiscale.md`. Concat docs rely on examples more
than prose, but the examples are user-facing.

SampleView is more ambiguous. `SampleSpec` extends `ViewSpecBase`, so the schema
allows a top-level sample `encoding`, and `SampleView.initializeChildren()` makes
the repeated child a data child of `SampleView`. However, checked repository
examples and tests put the `sample` encoding inside `spec`, not on the sample
root. A change here needs either a compatibility bridge or a deliberate schema
cleanup.

### Opt-in Classification

Views that should opt into child encoding inheritance:

- `LayerView`: yes. This is the canonical shared-encoding composition operator.
  Both initial child creation and `addChildSpec()` must pass the opt-in.
- `ConcatView`: yes. Authored examples rely on parent `x`/`y` encodings. Both
  initial child creation and dynamic mutation must pass the opt-in. Today the
  mutation helper does not pass concat child options, so this is a migration
  trap.
- `MultiscaleSpec`: yes by semantics. It currently normalizes to `LayerView`, so
  it can inherit through the layer implementation if the normalized wrapper and
  child layers are treated like ordinary authored layers.
- `SampleView`: probably preserve for now, but make it explicit. Either pass the
  opt-in to the repeated `sample-facets` child, or normalize top-level
  `SampleSpec.encoding` into `spec.encoding` and eventually remove inherited
  sample-root encoding from the public schema. The latter is cleaner but more
  breaking.
- `FacetView`: inactive today. If revived, the authored `spec` child should
  opt in; generated facet label views should not.

Views that should not opt in:

- Core axes and axis grids
- Core legends and legend regions
- Grid backgrounds and background strokes
- Scrollbars
- Selection rectangles
- Separators
- Title roots and title child unit views
- App sample group backgrounds and strokes
- App metadata/sidebar implementation views unless a specific authored
  composition boundary is being represented

This default-off model would delete most `blockEncodingInheritance: true`
call-site noise. In practice, the first implementation did not need a
replacement legend-suppression option: helper chrome views do not create legends
once inherited encoding is off, and generated legend specs already use recursive
axis/legend resolution exclusion where it matters.

### Design Variants

#### Variant A: Positive Child Option

Replace the negative default with a positive creation option:

```ts
interface CreateViewOptions {
    inheritEncoding?: boolean;
    layoutSizeParams?: "own" | "inherit" | "force";
}
```

`View.getEncoding()` would read parent encodings only when
`options.inheritEncoding === true`. `LayerView` and `ConcatView` would pass
`inheritEncoding: true` when creating authored children. Generated guide/chrome
views would simply omit it.

Feasibility: high.

Pros:

- Smallest implementation that turns the model upside down.
- Keeps runtime behavior close to current authored semantics.
- Removes the need for negative flags on most internal views.
- Works with imports and dynamic mutations because creation options already flow
  through `createOrImportView()` and `ContainerMutationHelper`.
- Clearer developer ergonomics: inheritance is requested by composition views
  that own the semantics.

Cons:

- Requires careful mutation wiring in both layer and concat.
- Requires a compatibility decision for SampleView top-level encoding.
- Must decouple the current legend-resolution side effect from encoding
  inheritance. The first implementation did this by relying on existing
  recursive `resolve.legend.default = "excluded"` logic for generated legend
  specs instead of adding a new runtime option.
- Existing docs that say all hierarchy levels inherit encoding would need to be
  narrowed to composition operators that opt in.

This is the best near-term design.

#### Variant B: Normalize Parent Encoding into Children

Instead of runtime inheritance, composition views could clone/merge parent
encoding into child specs during normalization.

Feasibility: medium.

Pros:

- Child specs become self-contained after normalization.
- Helpers such as `flowBuilder` no longer need to reason about inherited
  channels when rewriting a unit spec.
- Runtime lookup becomes simpler.

Cons:

- Spec mutation is invasive and risks surprising callers that inspect original
  specs.
- Imports, templates, `null` overrides, dynamic mutations, and nested
  composition all need careful merge semantics.
- Duplicates shared parent intent into many children, which makes later edits
  harder.
- It does not address data/param/resolution parent overloading by itself.

This may be useful as a future compiler phase, but it is too large for the
current isolation fix.

#### Variant C: Explicit Parent Roles

Introduce an `encodingParent` separate from `dataParent`, `paramScopeParent`,
and `resolutionParent`.

Feasibility: low to medium.

Pros:

- Architecturally clean.
- Generated views could inherit exactly the relationships they need.
- Avoids option flags for parent-role differences.

Cons:

- Large blast radius across view construction, imports, dataflow, params,
  resolution, mutations, and App integration.
- Hard to migrate incrementally because many systems currently use
  `dataParent` as their ancestry.

This remains the long-term architecture direction, but it should not be the
first encoding-inheritance change.

#### Variant D: Keep Default Inheritance and Improve Helpers Only

Keep `blockEncodingInheritance` and hide it behind internal subtree presets.

Feasibility: high.

Pros:

- Lowest behavior risk.
- Fits the original issue #413 helper-focused plan.

Cons:

- Leaves the most annoying default in place.
- New internal code still needs a helper to avoid accidental inherited
  encodings.
- Does not improve the mental model for authored-vs-generated views.

This is acceptable as a stopgap, but inferior to Variant A for developer
ergonomics.

### Recommended Inversion Path

1. Add a focused regression suite before changing defaults:
   - layer children inherit parent `x`/`y` and metadata `key`
   - concat children inherit parent `x`/`y`, including dynamic `addChildSpec()`
   - multiscale children inherit parent positional encodings after normalization
   - generated legend title views do not inherit plot position encodings
   - generated axes, backgrounds, separators, scrollbars, and selection
     rectangles do not inherit source plot encodings
   - SampleView top-level encoding behavior is either preserved explicitly or
     rejected/normalized explicitly
2. Introduce `inheritEncoding?: boolean` with default `false`.
3. Remove the `UnitView.resolve()` dependence on encoding-inheritance state.
   Generated legends should continue to suppress recursive guide creation using
   explicit `resolve.axis.default = "excluded"` and
   `resolve.legend.default = "excluded"` in generated specs.
4. Wire `LayerView` child creation and mutation helper with
   `inheritEncoding: true`.
5. Wire `ConcatView` initial child creation and mutation helper with
   `inheritEncoding: true`, while preserving the existing
   `layoutSizeParams: "force"` propagation.
6. Preserve `MultiscaleSpec` behavior through its normalized `LayerView`.
7. Decide SampleView policy:
   - compatibility-first: pass `inheritEncoding: true` to the repeated child and
     keep the schema as-is
   - cleanup-first: move top-level sample `encoding` into `spec.encoding` during
     normalization, document/deprecate the old shape, and then avoid inheritance
8. If a compatibility shim helps while editing the branch, keep it private to
   the branch and remove it before merge. Do not land both `inheritEncoding` and
   `blockEncodingInheritance` in master as supported options.
9. Remove negative call sites after generated/chrome views rely on the new
   default-off behavior.

## Solution Options

### Option 1: Consolidate Existing Patterns with Helpers

Create a small internal module, for example
`packages/core/src/view/internalSubtree.js`, that centralizes the current
mechanisms without changing view architecture.

Possible API:

```js
export function markInternalSubtree(view, options = {}) {
    const chrome = options.chrome ?? true;
    const addressable = options.addressable ?? false;
    const skipSubtree = options.skipSubtree ?? true;

    if (chrome) {
        markViewAsChrome(view, { skipSubtree });
    }
    if (!addressable) {
        markViewAsNonAddressable(view, { skipSubtree });
    }
}

export function isolateGuideSpec(spec, options = {}) {
    // Recursively merge resolve.axis.default and resolve.legend.default.
    // Optionally set domainInert and scale defaults for generated helper specs.
}
```

Feasibility: high.

Pros:

- Low risk and incremental.
- Can migrate legends first without changing resolution planner semantics.
- Improves developer ergonomics immediately by replacing repeated
  `markViewAsChrome` + `markViewAsNonAddressable` + option bundles.
- Keeps App-specific chrome exceptions possible.
- Provides a single place to document why each policy exists.

Cons:

- Still relies on call-site opt-in.
- Still uses spec rewriting for recursive guide exclusion.
- Does not solve the overloaded `dataParent` design.
- Does not prevent a future generated subtree from forgetting the helper.

Best use:

- This is the safest consolidation step after or alongside the encoding
  inversion, and should be done before a deeper parent-role refactor.

### Option 2: First-class Internal Subtree Policy on Views

Introduce an internal view option that records a structured isolation policy on
each `View`, with selective inheritance to generated descendants.

Possible API:

```ts
interface InternalSubtreePolicy {
    role: "guide" | "decorativeChrome" | "interactiveChrome" | "appChrome";
    chrome?: boolean;
    addressable?: boolean;
    inheritEncoding?: boolean;
    domainInert?: boolean;
    scaleResolutionDefault?: "normal" | "excluded";
    forcedScaleChannels?: ChannelWithScale[];
    picking?: "normal" | "disabled" | "forcedMask";
}
```

Implementation sketch:

- Store the policy in `View.options` or a private `View` field.
- Apply runtime chrome/addressability marks in one helper.
- Let child creation inherit only the recursive parts of the policy. Do not
  blindly inherit an encoding policy, because internal generated layers may need
  local helper encodings without user-authored parent encodings.
- Use the policy to choose generated spec resolution defaults, such as excluded
  axis/legend topology, rather than adding another `UnitView.resolve()` branch
  unless future generated views truly need runtime guide suppression.
- Optionally teach resolution lookup to default helper scales to `"excluded"`
  unless listed in `forcedScaleChannels`.
- Keep an explicit API for source scale access instead of relying on chrome
  parent climbing.

Feasibility: medium.

Pros:

- Makes the intended contract queryable on a view.
- Could reduce repeated spec mutation if generated resolution defaults become
  role-derived, while still keeping explicit source-scale exceptions visible.
- Can represent the important distinctions: chrome, addressability, domain
  contribution, guide generation, source-scale access, and picking.
- Better long-term developer ergonomics than helper-only consolidation.

Cons:

- Touches `View`, `UnitView`, view creation, and likely `LayerView`/`ConcatView`
  option propagation.
- Needs careful tests because changing resolution defaults can alter shared
  scale topology.
- Requires migration discipline. A half-migrated policy plus old spec hacks
  could be more confusing than either approach alone.

Best use:

- Use after Option 1 has clarified the presets and tests. Do not start here
  unless the helper approach proves insufficient.

### Option 3: Split Parent Roles

Replace the overloaded `dataParent` relationship with explicit parent roles,
for example:

- `layoutParent`
- `dataflowParent`
- `encodingParent`
- `paramScopeParent`
- `resolutionParent`
- `baseUrlParent`

Generated views could then say exactly which relationship they need. A legend
could inherit source scale/param scope while not inheriting plot encodings or
guide generation. A separator could have no resolution parent at all.

Feasibility: low to medium, depending on scope.

Pros:

- Architecturally cleanest model.
- Removes ambiguity from every generated-view constructor.
- Makes future guide/chrome features less surprising.
- Avoids using `blockEncodingInheritance` as a workaround for an overloaded
  parent relationship.

Cons:

- Large blast radius across view construction, dataflow initialization, param
  runtime, resolution planning, imports, mutations, and App code.
- Existing tests and helper APIs assume `dataParent` is the ancestry for many
  systems.
- Hard to do incrementally without compatibility shims.

Best use:

- Treat as a longer-term design direction, not the first fix for issue #413.

### Option 4: Central Guide Builder Service

Move guide/chrome construction behind a central builder, for example
`GuideSubtreeBuilder`, that owns the isolation policy and creates axes, legends,
scrollbars, titles, separators, and selection overlays through a narrow API.

Feasibility: medium.

Pros:

- New guide code has one obvious entry point.
- Can standardize `layoutParent`/`dataParent` choices per guide type.
- Can coexist with Option 1 helpers internally.
- Makes dynamic mutation refresh paths easier to audit.

Cons:

- Could become a large god object if it owns too much layout-specific behavior.
- Grid-specific placement logic is currently distributed for a reason:
  `GridChild`, `GridView`, `LegendRegionView`, and SampleView each have
  different layout responsibilities.
- Needs clear boundaries or it will reduce maintainability.

Best use:

- Use narrowly. A helper module plus small factory functions per guide type is
  preferable to one monolithic builder.

### Option 5: Spec-level Internal Flag

Add an internal spec property such as `internalRole: "guide"` and make the
normal view pipeline interpret it.

Feasibility: medium.

Pros:

- Survives cloned specs and imports.
- Can be inspected in layout snapshots.
- Could let generated specs describe their own isolation contract.

Cons:

- Risks leaking an internal implementation flag into the user-visible schema.
- Does not cover runtime-only behavior such as addressability WeakMaps unless
  constructors or the factory still apply marks.
- User-authored specs could accidentally or intentionally set it unless
  validation rejects it at boundaries.
- Still does not solve `dataParent` overload.

Best use:

- Avoid as the primary design. If needed, keep any spec marker private to
  generated code and strip it before public schema generation.

## Recommendation

Split the work into two tracks. The first track has now landed on `master` in
these commits:

- `7b46d1f2 test(core): cover encoding inheritance in compositions`
- `1678887d refactor(core): invert encoding inheritance`
- `992db17f test(core): type render coordinator test double`

`master` now has default-off encoding inheritance, explicit opt-in at authored
composition boundaries, and no `blockEncodingInheritance` compatibility path in
source. The intermediate idea of a `guideResolution`/`legendResolution` view
option was discarded: helper chrome views do not create legends once encoding
inheritance is off, and generated legend specs already exclude recursive
axis/legend resolution explicitly.

The rebase on newer `master` also introduced a concrete
`generatedChromeOverlay` helper for selection and ruler overlays. Phase 3
centralized the related chrome-ancestor detection used by `GridChild`, so that
helper can now be treated as the seed of the subtree-preset track rather than
designing a helper module from scratch.

The next implementation work should use the cleaned-up generated-overlay
infrastructure to decide the shape of internal `attachmentRole`.

### First Track: Encoding Inheritance

Encoding inheritance is now opt-in instead of inherited by default.

`inheritEncoding?: boolean` defaults to `false` and is opted in at authored
composition boundaries:

- `LayerView` children
- `ConcatView` children
- `MultiscaleSpec` through its normalized layer form
- `SampleView` repeated child and generated summary views, preserving current
  top-level `SampleSpec.encoding` compatibility

`blockEncodingInheritance` was removed before committing the refactor. There is
no second supported inheritance option in the source tree.

This removes the most common reason generated guide/chrome constructors need a
negative isolation flag.

### Later Track: Internal Attachment Roles

Add an internal-only `attachmentRole?: "child" | "auxiliary"` option for view
creation. It is not a grammar property, schema property, or user-facing
configuration surface.

- Real child views use normal authored semantics: layer shared, concat current
  resolution rules, and ordinary unit independent once sample summaries are
  explicit.
- Auxiliary views default resolution topology to excluded, with explicit
  per-channel overrides such as `"forced"` source-scale links.
- The same role can supply defaults for other internal policies, such as chrome,
  addressability, guide generation, and domain contribution, but those defaults
  should remain overridable and testable.

This track is about assigning internal defaults from attachment semantics. It is
not a public grammar feature.

### Later Track: Consolidate Internal Subtree Presets

Build on the existing `packages/core/src/view/gridView/generatedChromeOverlay.js`
helper and migrate call sites only where the new vocabulary removes real
duplication. This gives the team an explicit vocabulary without destabilizing
resolution planning.

Recommended presets:

- `guideSubtree`: chrome, non-addressable, no authored encoding inheritance,
  suppress generated axis/legend resolution, preserve normal scale use unless
  the spec explicitly excludes or forces a scale, domain inert when the whole
  generated subtree should not contribute to domains.
- `decorativeChromeSubtree`: chrome, non-addressable, no authored encoding
  inheritance, no guide generation, no domain contribution, no picking unless
  requested.
- `interactiveChromeSubtree`: chrome, non-addressable by default, no authored
  encoding inheritance, no guide generation, domain policy explicit, picking
  policy explicit. `SelectionRect` belongs here.
- `appChromeSubtree`: chrome, addressability configurable, no automatic
  non-addressable mark. Sample sidebar belongs here.

The helper track should not infer everything from one boolean. It should make
the individual policies visible at the call site while bundling the common
defaults. The first low-risk extraction, chrome-ancestor detection for
generated-overlay suppression, is complete.

### Later Track: Promote Stable Runtime Policy

After the inheritance inversion, attachment-role defaults, and helper migration,
introduce a first-class internal policy only for the parts that prove stable:

- recursive guide-generation suppression
- source-scale exceptions
- recursive domain inertness
- runtime chrome/addressability metadata

Keep `inheritEncoding` positive and narrow. Guide-generation suppression remains
a separate policy.

## Proposed Migration Plan

### Phase 0: Add Regression Tests Before Refactoring

Status: complete in `7b46d1f2`.

Added or preserved focused tests for the first branch:

- Layer, concat, and multiscale children inherit parent encodings after the
  inversion.
- Dynamic `LayerView.addChildSpec()` and `ConcatView.addChildSpec()` preserve the
  same inheritance semantics as initial children.
- Generated legends do not create `AxisGridView` descendants when plot axes have
  `grid: true`.
- Generated legend title views do not inherit plot `x`/`y` encodings.
- Legend symbol marks can still use the represented source scale.
- Legend symbol marks remain domain inert.
- View-level guide and scale configs ignore chrome/excluded generated subtrees.
- Selection rectangles remain chrome and non-addressable but still support the
  required picking/masking behavior.
- App sample sidebar remains chrome without becoming non-addressable.
- SampleView either preserves top-level encoding compatibility or has an
  explicit normalization path with tests.

Useful existing tests:

- `packages/core/src/view/gridView/gridViewLegend.test.js`
- `packages/core/src/view/view.test.js`
- `packages/core/src/scales/viewLevelScaleConfig.test.js`
- `packages/app/src/sampleView/sampleView.test.js`

### Phase 1: Invert Encoding Inheritance in This Branch

Status: complete in `1678887d`.

Implemented behavior:

- Added `inheritEncoding?: boolean` to canonical internal `ViewOptions` in
  `packages/core/src/types/viewContext.d.ts`; `CreateViewOptions` aliases it.
- Made `View.getEncoding()` inherit from `dataParent` only when
  `inheritEncoding` is true.
- Removed the `UnitView.resolve()` coupling to encoding inheritance. Generated
  legend suppression remains spec-level through recursive axis/legend
  resolution exclusion in generated legend specs.
- Passed `inheritEncoding: true` from `LayerView.initializeChildren()` and the
  layer mutation helper.
- Passed `inheritEncoding: true` from `ConcatView.initializeChildren()` and the
  concat mutation helper, preserving existing `layoutSizeParams` propagation.
- Preserved multiscale behavior through `normalizeMultiscaleSpec()` and
  `LayerView`.
- Preserved SampleView top-level encoding compatibility by opting in the
  repeated sample-facet child and generated summary views.
- Removed `blockEncodingInheritance` from source.
- Let generated guide/chrome views rely on default-off inheritance instead of
  passing a negative option.

This phase leaves the source tree with one positive encoding-inheritance
mechanism, not two redundant flags.

### Phase 2: Validate Encoding-Inheritance Behavior

Status: code is on `master`. Automated verification passed locally before
upstreaming; manual smoke testing remains useful before building later
subtree-isolation work on top of it.

Completed automated verification:

- focused tests for layer/concat/multiscale inheritance
- focused tests for legend guide isolation
- focused tests for view-level guide and scale configs
- focused App tests that cover sample sidebar and merge-facet summary behavior
- full `npm test`
- `npm run lint`

Known unrelated verification note:

- `npm --workspaces run test:tsc --if-present` still fails on pre-existing
  implicit-any errors in `packages/core/src/genomeSpy/renderCoordinator.test.js`.

Remaining manual smoke coverage:

- public layer, concat, and multiscale examples with parent-level encodings
- generated legends inside grids, especially axes with `grid: true`
- legend titles and symbol marks with represented source scales
- axes, grid axes, titles, separators, scrollbars, and selection rectangles
- sample view, sample sidebar, and metadata/sidebar workflows
- template/import specs and dynamic child insertion paths

Treat regressions found during this smoke pass as stabilization work before
starting broader attachment-role changes. `blockEncodingInheritance` is already
gone from source.

### Phase 3: Consolidate Generated Chrome Overlay Infrastructure

Status: complete in `c42a4e617` on this branch and cherry-picked to `master` as
`99aaf4d37`.

Existing seed:

- `packages/core/src/view/gridView/generatedChromeOverlay.js` creates generated
  chrome layer views and applies chrome/non-addressable runtime marks.
- `packages/core/src/view/gridView/selectionRect.js` and
  `packages/core/src/view/gridView/rulerOverlay.js` use that helper.
- `packages/core/src/view/gridView/gridChild.js` now uses
  `hasChromeAncestor()` from `viewSelectors.js` instead of carrying a private
  chrome-subtree helper and `TODO(#413)` guard.

Completed work:

- Added shared `hasChromeAncestor()` detection in `viewSelectors.js`.
- Added focused selector tests that preserve the ancestor-only semantics used
  by generated overlay suppression.
- Kept `generatedChromeOverlay` narrow: it still marks and returns generated
  chrome overlays, not become a broad resolution-policy object.
- Did not change legend generation in this phase.

Verification:

- `npx vitest run packages/core/src/view/viewSelectors.test.js packages/core/src/view/gridView/gridChild.test.js`
- `npm test` on the branch before committing
- `npm test` on `master` after cherry-picking

### Phase 4: Add Internal Attachment Role in a Later Branch

Implementation tasks:

- Add `attachmentRole?: "child" | "auxiliary"` to internal view creation
  options. Do not add it to the grammar or schema.
- Make auxiliary views default scale, axis, and legend resolution to
  `"excluded"` when no explicit `resolve` value is configured.
- Keep explicit `resolve` behavior unchanged.
- Wire authored child creation paths as `"child"` where needed.
- Wire generated guide/chrome constructors as `"auxiliary"`.
- Use the same role to provide defaults for other internal policies, such as
  chrome/addressability and domain contribution, without making those defaults
  hard consequences.
- Make the sample-summary x-resolution explicit before changing the ordinary
  `UnitView` default away from shared `x`, if that change still applies.

Tests for this branch should prove that auxiliary resolution defaults are
internal construction behavior rather than public spec behavior.

### Phase 5: Generalize Guide/Chrome Spec Helpers in a Later Branch

Create or extend an internal helper module only after the generated overlay
helper has clarified what is common. A possible destination is
`packages/core/src/view/internalSubtree.js`, but extending
`generatedChromeOverlay.js` or adding adjacent small helpers may be enough.

Responsibilities:

- Apply runtime chrome/addressability marks.
- Return boundary view options only where generated views still need explicit
  options, such as forced layout-size params.
- Recursively apply guide-resolution exclusion to generated specs.
- Optionally apply `domainInert` to a generated root spec.
- Keep presets explicit and small.

Initial public-internal functions:

- `markInternalSubtree(view, options)`
- `excludeGuideResolutions(spec)`
- `isolateGuideSpec(spec, options)`

Use JSDoc types. Keep the module internal to Core and do not add schema docs.

### Phase 6: Migrate Legends First

Replace `excludeLegendGuideResolutions()` in `legendView.js` with the generic
helper.

Keep the current behavior exactly:

- recursively exclude axis and legend resolutions
- preserve forced source scale channels
- keep helper `x`/`y` scale exclusions in legend body specs
- keep `layoutSizeParams: "force"` for generated legend children
- keep chrome and non-addressable marking for both `LegendView` and the created
  child root

This is the highest-value helper migration because legends are the known
failing case.

### Phase 7: Migrate Core Decorative Chrome

Move repeated runtime marking and boundary options to helper calls in:

- `axisView.js`
- `axisGridView.js`
- `gridView/gridChild.js`
- `gridView/scrollbar.js`
- `gridView/selectionRect.js`
- `gridView/separatorView.js`
- `titleView.js`

Do not change behavior during this phase. In particular:

- Do not disable picking for selection rectangles.
- Do not blanket-rewrite guide/chrome specs with default exclusions. Use
  attachment-role defaults for topology and keep source-scale exceptions
  explicit and tested.

### Phase 8: Migrate App Chrome Carefully

Move App call sites to helper presets only after Core presets support the
needed distinction between chrome and non-addressable.

Target files:

- `packages/app/src/sampleView/sampleView.js`
- possibly `packages/app/src/sampleView/metadata/metadataView.js` if a guide
  resolution helper becomes useful there

Preserve current App behavior:

- sample sidebar remains chrome
- sample sidebar remains addressable
- sample group backgrounds remain chrome
- do not silently change App selector/settings behavior

### Phase 9: Consider Runtime Policy

After the inversion, contextual resolution defaults, and helper migration,
evaluate whether remaining complexity justifies Option 2. Good signs that it is
worth doing:

- more generated guide types need recursive guide-resolution suppression
- more code needs to inspect whether a view is an internal guide subtree
- recursive spec mutation becomes hard to reason about
- source-scale lookup keeps needing chrome-parent climbing

If those signs appear, add a first-class internal policy to `ViewOptions` and
migrate one subsystem at a time, starting with legends.

## Design Principles for the Final API

- Prefer named presets over a boolean such as `internal: true`.
- Keep policies separable: chrome, addressability, inherited encoding, guide
  generation, domain contribution, scale resolution, dataflow ancestry, param
  scope, and picking are different concerns.
- Make source-scale access explicit. Generated guides should not need to climb
  out of chrome ancestry unless that remains the least risky compatibility path.
- Keep generated subtrees ordinary enough to use existing marks, transforms,
  scales, and data sources.
- Preserve runtime failure behavior. If an internal guide requests a source
  scale that does not exist, fail clearly.
- Keep App-specific chrome needs visible. The App has legitimate chrome that
  should remain addressable.

## Open Questions

- Should top-level `SampleSpec.encoding` be normalized into
  `SampleSpec.spec.encoding` in a later user-visible cleanup, or should the
  current compatibility path remain indefinitely?
- Which manual smoke specs and App workflows are mandatory before starting the
  attachment-role follow-up work?
- Should `attachmentRole: "auxiliary"` default all scale, axis, and legend
  resolutions to `"excluded"`, with explicit `resolve` overrides such as
  `"forced"` for source-scale links?
- Which defaults should come directly from `attachmentRole`, and which should
  require explicit helper presets so special cases stay visible?
- Should `generatedChromeOverlay` remain a grid-overlay helper, or should its
  marking/chrome-subtree-detection pieces move into more general view helpers?
- Should `LegendEntriesSource.findLegendScaleResolution()` be replaced with an
  explicit source-scale reference on the generated legend view?
- Should `domainInert` remain spec-level, or should generated views get a
  runtime domain-contribution policy that is not part of specs?
- Should non-addressable chrome still expose internal params for debugging, or
  should internal params always be hidden from bookmark/provenance traversal?
- Should a future policy be visible in layout snapshots for easier debugging?

## Preferred Immediate Outcome

The immediate implementation work is complete for the encoding-inheritance
track and for the first generated-overlay cleanup. Both are already on
`master`.

Continue attachment roles, auxiliary resolution defaults, helper presets, and
chrome/domain/addressability consolidation in later branches. The current
`generatedChromeOverlay` helper is a useful seed, but it should not become a
large policy object before the attachment-role follow-up clarifies which
policies belong together.
