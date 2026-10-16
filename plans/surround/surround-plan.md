# Flat surround composition

Status: reviewed incremental plan; implementation in progress.

## Goal and evidence

Replace the wrapping-concat ceremony in the UpSet mutation example and private
NCI-60 heatmap with a center and four optional groups of aligned tracks. This
first version supports a single plotting rectangle per authored child. It must
leave the schema and internal alignment contract suitable for later nesting.

- `examples/docs/examples/generic/upsetr-mutations.json` needs a layered center,
  layered top intersection bars, layered left set bars, shared outer transforms
  and the pushed `setCursor` parameter, step sizing, and local axes.
- `private/genomespy-dataset-recipes/recipes/cellminer-nci60-rna-seq/specs/heatmap.json`
  needs unit dendrograms, a layered center, right metadata tracks sharing one
  source/parsing/encoding scope, independent collected legends, rotated bottom
  titles, growing dendrogram thickness, and named/reversed/gapped index scales.
- Architecture sources: `ARCHITECTURE.md`, `packages/core/ARCHITECTURE.md`, and
  `packages/core/docs/architecture/views-and-dataflow.md`.
- Implementation sources: `viewFactory.js`, `resolutionPlanner.js`,
  `gridView/gridView.js`, `gridView/gridChildArrangement.js`, `layout/grid.js`,
  `viewLevelScaleProps.js`, `viewLevelGuideProps.js`, `zoomNavigationUtils.js`,
  and Core/App specification types.
- Comparable designs and verified limitations are recorded in
  [the literature survey](surround-literature.md). Adopt four-side grouping and
  separate central plot versus full footprint. No external code is copied.
- Headless resolution probes established that ordinary shared/excluded scopes
  represent matrix rows/columns and nested local measurements. These probes did
  not establish nested spatial layout. Root-axis declarations are ambiguous;
  cross-region axis hoisting also exposed an initialization edge case.

## First-version public contract

```js
{
  spec: matrix,
  surround: {
    top: [columnDendrogram],
    left: [rowDendrogram],
    right: {
      data: cellLineData,
      encoding: rowEncoding,
      spacing: 4,
      views: [cancerType, p53, doublingTime, sampleLabels]
    }
  },
  spacing: 8,
  scales: { x: columnScale, y: rowScale }
}
```

- `surround` is the discriminator; `spec` is the center. Each optional side is
  an array or an authored scope object with required `views`.
- Top/bottom implicitly vconcat; left/right implicitly hconcat. Reading order is
  top-to-bottom or left-to-right, including on the top and left.
- Slot types use ordinary `ViewSpec | ImportSpec` recursion. Runtime validation
  initially accepts only unit/layer plots, including normalized multiscale and
  imported forms. Reject concat, facet, nested surround, and App SampleView after
  import expansion. Do not create orientation-specific recursive type unions.
- Side groups retain normal scope properties: shared data, transforms, encodings,
  parameters, configuration, templates, names, visibility, local resolve/scales,
  titles, overhang, and spacing. Child sources can override inherited data.
- Outer scope flows to center and sides. Center-local setup does not flow to
  sides. Generated wrappers are non-addressable; authored nodes stay addressable.
- x is shared between center and top/bottom, y between center and left/right.
  Each direct track's perpendicular scale is independent by default. Optional
  side-local sharing stays isolated from the center and opposite side.
- Retain normal domain inference and declaration precedence. Outer `scales.x/y`
  control authoritative domains, order, names, gaps, reversal, and zoom settings.
  Reject disconnected aligned scales. Ignore constant/null positional encodings
  when identifying actual participation.
- The center controls its plotting width/height using existing fixed, growing,
  and step sizes. Each side child controls only its perpendicular thickness.
  Reject explicitly authored aligned sizing on side groups/plots and normalize
  inherited plot sizing to container so config/theme defaults cannot impose an
  independent minimum. Remove UpSet's redundant aligned sizes during migration. Root sizes describe the full layout.
- Measure existing axes, titles, padding, overhang, and legends. Align plot
  starts and lengths, rather than decorated bounding boxes. Preserve growing
  dendrogram thickness and right-track title reservation.
- Root spacing separates center from sides; group spacing separates its tracks.
  Both default to the existing concat spacing of 10 pixels.
- Hidden/empty sides collapse with their gap and fixed roles never repack. A
  hidden center hides the composition. Derived configured visibility governs
  role layout, guide visibility, and lazy subtree initialization. Preserve the
  existing domain lifecycle semantics; this feature does not redefine effective
  domain membership after ancestor visibility changes. Empty/loading data does
  not remove an authored track.
- Axes stay on authored plots; default independent guide hosts can reference
  shared scales. Omit root positional axes and reject root shared/forced axes.
  Collected independent legends surround the full composition.
- Preserve picking, tooltips, clipping, leaf rulers/selection controllers, outer
  parameter pushes, and zoom/pan. Filter inherited unrelated center scales from
  side wheel/drag/claim candidates while preserving real local perpendicular
  zoom. Implement this once with an internal positional scale/axis lookup boundary
  on the generated excluded scope; ordinary lookup outside that scope is unchanged. Center-to-side gaps do not initiate navigation.
- Reject surround-owned input controllers and all plot/group viewports in this
  first version; scrolling can be added with an explicit projection contract. No dynamic surround
  insertion/removal API is introduced.

## Extension boundary and implementation

Use a small native `SurroundView` reusing GridView/GridChild guide measurement,
flex allocation, and backend-neutral arrangement. Every child and generated
scope is factory-created with ordinary lifecycle and origin mapping.

Introduce only two focused GridView seams:

1. Active children and grid-compatible row/column membership plus occupied-cell
   lookup, used consistently in measurement, preparation, and arrangement.
2. Per-row/column plot-size selection. Concat keeps largest-child sizing;
   surround selects the center for the central row and column.

Use fixed center/top/right/bottom/left cells without placeholder marks. Reuse the
existing arrangement and decoration paths instead of copying `arrange()`.

Each side has an excluded perpendicular scope around an ordinary concat scope.
An internal `scaleLookupBoundaryChannels` option stops scale and positional-axis
ancestor lookup only at this generated scope, after checking its own resolutions.
This prevents dangling perpendicular declarations and constant-coordinate tracks
from reaching the center, without a separate navigation filter.
The latter preserves independent perpendicular scales among its children.
Putting exclusion directly on that concat would incorrectly share those scales.
Preserve the authored side's data/parameter scope without duplicate source work.

Keep a center plotting anchor separate from complete composition bounds. In v1
it is the center unit/layer placement. Later a nested surround can expose its
validated center anchor through the same contract. Do not implement a general
recursive participant/occurrence inspector or constraint solver now.

Validate flat shape and unsupported operations at construction/import boundaries,
actual aligned scale identity after resolution, and plot geometry in the shared
layout path. Preserve spec origins in errors. Existing concat/facet and all
LayoutResult consumers are regression gates.

Integrate the grammar into App recursive types/schema with ordinary configurable
visibility; runtime flat-shape validation also excludes SampleView. No new App
bookmark/state mechanism is needed. Both examples are expected to work in App.

## Deferred work

- Nested authored concats, facets, and surround children, including exported
  coordinate participation and recursive central-anchor layout.
- Surround-root axes and cross-region shared axes, including hoisting behavior. Reject positional axis
  resolutions caught by surround even when a child requests forced resolution.
- Corners, spans, general grids, independent aligned scrolling, surround input
  controllers, and dynamic structural mutation.
- Moving heatmap gene labels out of their existing center layer is optional and
  not required for this migration.

These replace the broader nesting, facet inspection, and input-controller tasks
from the original proposal. They are deliberately discarded from this delivery.

## Alternatives and risks

- A wrapping-concat macro is initially compact, but placeholder identities,
  visibility repacking, and center authority need layout policies anyway. Native
  fixed roles provide the central anchor required for later extension.
- Restricting recursive slot types complicates imports and later nesting without
  proving geometric compatibility. Use broad slots with clear runtime support.
- Broad GridView refactoring or new rendering code is unnecessary. Measure
  focused before/after sizes and re-check growth for KISS.
- Title/legend text can change plot allocation. Reuse bounded layout settling and
  inspect real output, especially rotated metadata titles and index gaps.
- The private recipe has pre-existing unrelated edits and an untracked NCI-60
  directory. Preserve them; stage only the requested heatmap specification if
  committing its migration in its separate repository.

## Milestones

Each milestone produces a coherent Conventional Commit with rationale and its
verification recorded here. Review shared architecture/API changes before the
first feature commit and review the final implementation/specs for KISS and
smells. No PR or push is requested.

### 1. Core flat composition

- [x] Add spec types, guards, factory/root handling, native roles and center
      sizing, side isolation/scopes, visibility, validation, and navigation.
- [x] Add focused loaded-data/headless tests for four-sided flat layouts,
      unit/layer/import support, independent and optionally shared local scales,
      source/parameter inheritance, step/growing sizing, names/gaps/reversal,
      local axes/collected legends, hidden sides/center, and useful rejections.
- [x] Verify unrelated inherited scales do not navigate from constant-coordinate
      labels; keep local perpendicular navigation. Verify ordinary concat/facet
      layout and shared guide behavior remain unchanged.
- [x] Add concise public grammar documentation and a Core minor changeset.
      Run focused subsystem/layout tests and Core TypeScript/lint checks.

Areas: Core types, factory, GridView/GridChild, resolution/projection/navigation,
selectors and renderer-independent layout. Commit:
`feat(core): add flat surround composition`.

### 2. App authoring and example migrations

- [ ] Integrate App types/visibility/schema recursion; regenerate both schemas
      and applicable schema-derived docs/navigation.
- [ ] Add a compact local-data docs example for deterministic schema/render tests.
- [ ] Migrate UpSet without changing transforms, hover pushes/highlighting,
      bar scales, labels, or local axes. Remove placeholders, exclusions, and
      duplicated aligned sizes.
- [ ] Migrate only the private heatmap spec; preserve shared metadata source and
      encodings, titles, collected legends, dendrograms, scales/gaps/reversal, and
      feature labels. Commit only this requested file on a private feature branch.
- [ ] Verify schema acceptance, App visibility/name lookup, example layout/SVG,
      workspace TypeScript, applicable docs generation, lint, and release impact.

Areas: App types/schema and visibility consumers, docs/schema examples, public
UpSet and private heatmap. Main commit:
`feat(app): integrate surround authoring and examples`.
Private commit: `refactor: express NCI-60 heatmap with surround`.

### 3. Integration and simplification review

- [ ] Browser-check local example, UpSet, and private heatmap: loading errors,
      resize, zoom/pan, picking/hover linking, visibility restoration, and SVG.
- [ ] Have a subagent inspect implementation and example diffs for KISS, smells,
      downstream effects, needless machinery, and duplicated layout/spec setup.
      Apply worthwhile fixes and verify them with focused checks.
- [ ] Review related tests for duplicate/internal-shape coverage. Run the full
      unit suite once for shared GridView changes, workspace TypeScript, lint,
      schema/docs synchronization, and release checks.
- [ ] Record final outcomes; reconcile all tasks as completed or discarded and
      commit this record. Delete temporary plans in a later commit before any PR.

Areas: cross-backend layout, SVG, browser interaction, existing concat/facet,
release/docs integration. Commit with actual integration changes, tentatively:
`test(core): verify surround rendering and interactions`.

## Acceptance

Both examples use surround without placeholder marks, authored positional
exclusions, or repeated aligned sizes. Tracks share the intended coordinates and
side data scopes while retaining independent local measurement/color scales.
Decorations, interaction, gaps/reversal, resizing, and visibility work through the
existing shared layout/rendering paths. Unsupported nesting fails clearly after
imports, public types remain extensible, and concat/facet regressions pass.
Schemas, docs, and one feature changeset describe the shipped scope. Private or
remote data is not a dependency of deterministic CI. All requested milestones
are committed on feature branches, with unrelated user work untouched.

## Review and verification log

- Original broader proposal reviewed on 2026-10-15 by `review_surround_plan`.
  Its ownership, guide, visibility, navigation, and layout-seam findings remain
  incorporated. Its broader nested-container guarantee is now discarded.
- Flat incremental proposal reviewed on 2026-10-16 by `review_surround_plan`.
  Incorporate theme/config sizing overrides, rejection of forced axis hoisting
  and perpendicular lookup leakage, and preserve existing domain visibility
  semantics. No architectural blocker remains. A follow-up review preferred the narrow internal
  lookup boundary over dangling-declaration special cases plus navigation filtering.
- Core architecture review on 2026-10-16: center participating leaves must also
  be checked against the exported scale; this is fixed and regression-tested.
  Hoisting validation now checks actual surround-owned axes before guide sync.
  Actual UpSet and private NCI-60 conversions passed headless checks, including
  the heatmap at three canvas sizes. No core architecture blocker remains.
- Final implementation/example KISS review: pending.

Core milestone verification: 15 surround subsystem tests and 111 existing focused
concat/facet/layout/scale/legend regressions passed; 34 generated-schema tests
passed. Core TypeScript, targeted lint, schema generation, and release policy
checks passed. The feature is a compatible minor release (fixed group: 1.2.0).
