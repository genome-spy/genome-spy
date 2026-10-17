# Container layout simplification

Baseline: `f886172e426eb9d327c1e27e6b5adc433fb5c3f8`.
Branch: `codex/simplify-container-layouts`.

## Goal and boundaries

Remove duplicate layout and lifecycle paths without changing the grammar,
rendering, interaction, or dynamic mutation contracts. Aim for at least 15%
fewer non-comment production lines in the fixed container/layout scope below;
also measure minified, gzip, and Brotli bytes. Preserve readability rather than
compressing formatting or moving code outside the measured scope.

Scope: `containerView.js`, `layerView.js`, `concatView.js`, `facetView.js`,
`facetLayout.js`, `facetHeaderView.js`, `surroundView.js`,
`containerMutationHelper.js`, and all runtime `.js` files in `gridView/` and
`layout/`. Exclude tests, declarations, and test utilities. Changes to shared
files outside this scope must be reported separately.

## Review findings and decisions

- Layer/concat mutations wrap array splices in multiple callbacks and retain
  options with no production callers. Narrow the helper to its actual callers.
- GridChild repeats axis candidate traversal and guide creation. Resolve a
  candidate once and feed axes and grids from that result. Preserve App's
  duplicate-axis and active-candidate extension points.
- SurroundGrid duplicates regular Grid indexing. Use one explicit-coordinate
  indexing contract for both regular and sparse grids.
- Facet measurement and placement repeat dimensional track bookkeeping.
  Consolidate it while preserving data batches and per-cell guides.
- Decoration placement and generated guides retain redundant bookkeeping.
  Prefer local derived values over synchronized state where supported.
- Remove tests that repeat generated specification details already tested by
  the spec builder; retain integration, geometry, lifecycle, and failure tests.

[Vega's layout design](https://vega.github.io/vega/docs/layout/) separates grid
alignment, plot bounds, and guide roles. That supports retaining GenomeSpy's
existing plot/chrome distinction. Replacing the layout engine with Vega or a
generic constraint solver would add dependencies and migration risk. No code
will be copied or adapted from another project.

## Milestones

- [x] Simplify actual layer/concat mutation contracts and remove unused options.
  Consumers: ViewMutationApi, App dynamic tracks, surround side concats.
  Verify mutation API/ACID, layer, concat, and surround mutation tests.
  Commit: `refactor(core): narrow container mutation plumbing`.
- [ ] Consolidate grid guide creation and placement bookkeeping, including
  controller disposal and derived separator geometry where equivalent.
  Consumers: App SampleGridChild, SVG/Canvas/WebGL placements, shared legends.
  Verify grid/axis/legend tests and App layout/axis suites.
  Commit: `refactor(core): consolidate grid guides and decoration layout`.
- [ ] Unify sparse grid indexing and facet track measurement; simplify surround
  helpers while preserving nested alignment and growth allocation.
  Consumers: facets, surrounds, nested concats, input routing.
  Verify facet dataflow/interaction, surround nested/ACID and layout snapshots.
  Commit: `refactor(core): share grid indexing and facet track layout`.
- [ ] Trim overlapping tests, independently review cumulative implementation
  and downstream consumers, address findings, and record final measurements.
  Verify full unit suite, workspace type checks, lint, and representative
  browser examples: scatterplot matrix, faceting, surround marginal plots,
  nested surrounds, scrollable tracks and collected legends. Exercise resize,
  zoom/pan and visibility changes where applicable.
  Commit: `test(core): retain layout contracts with less duplicated setup`.

Pure refactoring needs one empty changeset and no user documentation changes.
Any discovered observable behavior change must be assessed separately.

## Acceptance and risks

Existing outputs and supported lifecycle/error boundaries remain compatible.
Keep bounded settling for legends and nested growing surrounds; do not replace
it with a speculative solver. Retain facet batch identity, clip geometry,
decoration z-order, guide ownership and disposal. Inspect App subclass hooks
before removing state or methods. Count source with parser tokens, compare
the same Vite build at the baseline and final revision, and report the actual
result even if the 15% target is not safely attainable.

## Results

Mutation milestone: the helper now owns spec splices directly, accepts only
options used by layer/concat, and discovers generated chrome through its normal
ownership markers. Rollback and chrome initialization remain covered by 81
passing mutation/container tests. The baseline scope contains 8,208 non-comment
production lines in 32 files.

Implementation and independent review of the remaining milestones are pending.
