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
- [x] Consolidate grid guide creation and placement bookkeeping, including
  controller disposal and derived separator geometry where equivalent.
  Consumers: App SampleGridChild, SVG/Canvas/WebGL placements, shared legends.
  Verify grid/axis/legend tests and App layout/axis suites.
  Commit: `refactor(core): consolidate grid guides and decoration layout`.
- [x] Unify sparse grid indexing and facet track measurement; simplify surround
  helpers while preserving nested alignment and growth allocation.
  Consumers: facets, surrounds, nested concats, input routing.
  Verify facet dataflow/interaction, surround nested/ACID and layout snapshots.
  Commit: `refactor(core): share grid indexing and facet track layout`.
- [x] Trim overlapping tests, independently review cumulative implementation
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

Grid milestone: separator geometry now uses normalized unscaled coordinates,
removing position/domain caches and scale updates during layout. Local/shared
legend creation uses one lifecycle path; controllers share disposal, and axes
and legends share their orientation calculations. Stable sorting preserves
decoration queue order without a sequence counter. App's duplicate-axis and
active-candidate hooks remain intact. Verification: 359 focused Core/App tests
and Core TypeScript pass; an SVG test checks separator geometry after resize.

Grid/facet milestone: one Grid implementation now indexes ordinary wrapping
layouts and explicit sparse surround cells. Ordinary queries remain arithmetic
and membership grouping remains lazy after review identified unnecessary eager
allocation. Facet track maps share their dimensional aggregation. Redundant
container construction/spec assignment and the separate immediate-child lookup
were removed. Six layout suites (139 tests) and Core TypeScript pass.

Independent reviewers inspected mutation lifecycle, App consumers, sparse-grid
indexing, facet geometry, separators, axis candidates, legend filters and
disposal, overlay validation, and decoration order. No actionable regressions
remain. The full suite passed 534 files / 5,049 tests (one skipped, two todo);
workspace TypeScript and repository lint pass. Ten representative WebGL examples
passed smoke checks. Browser interaction checks confirmed wheel zoom and drag
pan change domains, resizing changes the allocated center width, and hiding then
restoring a surround track collapses then restores its reservation.

### Size results

The 15% production-SLOC target was **not reached**. The fixed scope decreased
from 8,208 to 7,903 non-comment lines: 305 fewer (3.72%). Physical production
lines decreased from 11,812 to 11,369: 443 fewer. Across changed production files,
the parser-aware diff reports 290 added / 595 deleted lines. Tests and
declarations are excluded. No runtime code moved outside the scope.

Test files decreased by 424 physical lines overall, including the new separator
SVG regression and sparse-grid boundary coverage. The five overlapping-test
files alone decreased by 473 lines; the grid table saved another 10 and the new
separator regression adds 59. Test removal keeps the contracts at their useful
level: actual views/placements for lifecycle and layout, spec builders for exact
generated overlay definitions.

| Measurement | Baseline bytes | Final bytes | Reduction |
| --- | ---: | ---: | ---: |
| Scoped minified source | 110,644 | 107,404 | 3,240 (2.93%) |
| Scoped source, gzip | 35,316 | 34,598 | 718 (2.03%) |
| Scoped source, Brotli | 30,679 | 30,091 | 588 (1.92%) |
| Shipped UMD bundle, minified | 1,434,169 | 1,430,898 | 3,271 (0.23%) |
| Shipped UMD bundle, gzip | 517,958 | 517,270 | 688 (0.13%) |
| Shipped UMD bundle, Brotli | 416,529 | 416,033 | 496 (0.12%) |

Source counts use the repository's TypeScript-aware token policy. For exact
changed-line counts, run:

```sh
node .agents/skills/count-production-lines/scripts/count-production-lines.mjs \
  --base f886172e4 --path packages/core/src/view --extensions .js --files
```

Scoped byte counts concatenate individually minified modules in sorted path
order using the installed esbuild, with `minify: true`, `target: "esnext"`, and
`legalComments: "none"`. They are an attribution proxy, not a shipped bundle.
The authoritative bundle comparison uses the repository's Vite configuration
at the baseline and final revision with the same installed dependencies:

```sh
cd packages/core
npx vite build --outDir /tmp/genomespy-layout-after-bundle
```

Count the UMD `index.js` as UTF-8 bytes; compress with Node's `gzipSync` at
level 9 and `brotliCompressSync` at quality 11. Vite's printed gzip figure uses
different compression defaults and should not be mixed with the table above.

### Further simplification proposals

The remaining bulk is concentrated in GridView (1,579 non-comment lines),
GridChild (671), and SurroundView (569). Most of their branches implement active
geometry, chrome, or interaction contracts. Reaching 15% in this scope requires
removing about 927 more production lines. The following are design candidates,
not promised savings or unfinished work in this branch.

1. **Make resolved-spec validation one factory boundary.**
   `ViewFactory.createOrImportView()` currently invokes its validator only for
   imports. Surround's `#preparePlot()` and ContainerMutationHelper compensate
   for direct specs separately. Give direct/imported specs one preparation and
   validation boundary, including an explicit authored-spec immutability rule.
   This should remove duplicate validation/preparation paths. First resolve
   whether validation runs before import parameter/config overrides, and retain
   `ViewError` source locations and child-type restrictions. This is a modest
   opportunity; it cannot close the target gap by itself.

2. **Give legend regions one physical layout owner.**
   `LegendRegionView` retains both `#legendViews` and an internal concat, then
   measures and arranges legends manually. Its concat still supplies GridChild
   chrome and layout ancestry. A direct region that owns decorated legend
   placements could remove the unused concat layout role and duplicate
   membership. Define the decoration/lifecycle contract first; verify actual
   SVG background/stroke output, reactive disable, wrapping, collected legends,
   inherited config/parameters, and mutation disposal. The attempted immediate
   child-only deletion was discarded because it lost background wrappers.

3. **Share measured track geometry between facet and grid.**
   Facet's repeated-child topology is distinct from GridView's child ownership,
   but their track padding, guide extents, allocation and placement arithmetic
   overlap. Extract only the measured track calculation, leaving ownership and
   dataflow in the respective containers. A useful contract must handle repeated
   facet batches, outer axes in incomplete rows, header bands, constrained growth,
   scrolling, and nested surrounds. Prototype against both existing consumers
   before adopting an abstraction; small dimensional-helper experiments already
   showed that fewer source lines can increase compressed bytes.

4. **Create guides at one resolution-complete lifecycle stage.**
   Concat and facet materialize guides during child initialization and refresh
   them after view-level guide properties are attached. A single documented
   post-resolution stage could remove redundant work and some synchronization.
   Audit direct App construction, dynamic insertion/reorder, collection hosts,
   font readiness, and generated dataflow before changing this lifecycle. Local
   deletion of early calls would leave supported construction paths incomplete.

### Deliberate limits

- Keep bounded legend/surround allocation settling: geometry depends on the
  final constrained plot allocation and nested arm growth.
- Keep App axis candidates and active-candidate hooks: sample layouts use them.
- Keep gesture ownership, gap projection, cancellation and clipping policies:
  the interval controller's size largely comes from these supported behaviors.
- Keep surround validation after resolution changes; validating only initial
  construction would miss later side-concat mutations.
- Do not shorten by centralizing property tables or generic callbacks unless
  the result improves readability and compressed bytes on the real bundle.

All planned milestones are complete. The larger proposals above are explicitly
deferred from this branch. The empty changeset records no new release impact;
existing unrelated fragments still plan a minor release of the fixed group.
