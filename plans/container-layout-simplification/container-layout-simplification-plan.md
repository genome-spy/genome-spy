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
`containerMutationHelper.js`, `legendView.js`, and all runtime `.js` files in `gridView/` and
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

### First-pass size results (original scope)

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

At the end of the first pass, the remaining bulk was concentrated in GridView
(1,579 non-comment lines), GridChild (671), and SurroundView (569). Most of their
branches implement active geometry, chrome, or interaction contracts. The
following candidates informed the continuation; only legend ownership was
subsequently authorized and completed.

1. **Make resolved-spec validation one factory boundary.**
   `ViewFactory.createOrImportView()` currently invokes its validator only for
   imports. Surround's `#preparePlot()` and ContainerMutationHelper compensate
   for direct specs separately. Give direct/imported specs one preparation and
   validation boundary, including an explicit authored-spec immutability rule.
   This should remove duplicate validation/preparation paths. First resolve
   whether validation runs before import parameter/config overrides, and retain
   `ViewError` source locations and child-type restrictions. This is a modest
   opportunity; it cannot close the target gap by itself.

2. **Give legend regions one physical layout owner — completed.**
   Regions now own legend children directly, and legends own their chrome.
   Actual SVG output, reactive disable, wrapping, collected legends, inherited
   config/parameters, and mutation disposal were verified. Merely deleting the
   concat without replacing its chrome ownership would lose those decorations.

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

The first pass is complete. The user authorized a second pass on legend-region
ownership and added `legendView.js` to the measurement scope. Recalculate the
same original baseline with the expanded scope; keep first-pass results above
as historical measurements of the original scope.

## Legend ownership milestone

- [x] Give the region one list of LegendView children and make LegendView own
  its background/stroke views around its generated content. Reuse background
  specification builders with GridChild; any extracted helper stays inside the
  measured `gridView/` scope. Preserve the semantic data parent and forced local
  layout parameters. Include inactive legends in hierarchy/lifecycle traversal.
  Route interactions to the active pointed legend, respecting capture/bubble.
- [x] Replace hierarchy-shape chrome tests with emitted SVG assertions for
  stacked fills/strokes, dimensions, paint order and reactive visibility. Verify
  wrapping, gradients, collected legends, dynamic mutation/disposal, and App
  sample parameter isolation. Run browser legend examples and independent
  downstream review before committing.
- [x] Recalculate the 33-file original baseline plus extracted helpers, compare
  the same minified UMD/gzip/Brotli build with the first pass and original base,
  and retain this milestone only if the ownership becomes simpler and size
  improves. Commit: `refactor(core): let legends own their chrome`.

Baseline SVG inspection confirmed that configured legend fill/stroke views are
constructed but not painted because the region bypasses its internal concat's
arrangement. The refactor must draw these views explicitly. This is a visible
bug fix, so replace the existing empty fragment with a Core patch note. No
grammar migration or documentation changes are needed.

Other larger proposals remain deferred from this branch.

### Legend ownership results

The region directly owns all LegendView children, including inactive ones. Each
legend owns and paints its fill/stroke views and applies its padding around the
generated content. Hosts now store regions directly; the former external
`{ legendView, entries }` wrapper and repeated member list are gone. App's peek
packing suspension iterates each region's actual legends. Shared background
builders moved to `gridView/viewBackground.js` and remain counted; GridChild
re-exports them for the existing App consumer. Region size calculation now uses
main/cross dimensions, and parent/child legend placement share anchor handling.

Review caught and addressed propagation after stopped capture/child events by
using the existing interaction frame in both legend containers. Independent
review found no remaining regressions in semantic ancestry, App consumers,
dynamic visibility, constrained gradients, clipping, or lifecycle cleanup.

The new SVG test proves actual fill/outline output, paint order, internal
padding, hide/show restoration, and exactly-once subtree/subscription disposal.
It replaces generated-view existence assertions. Test files grew by 17 lines
for these stronger contracts. Verification: full suite 536 files / 5,050 tests
passed (one skipped, two todo); after the last membership/helper cleanup, 322
focused Core/App tests, workspace type checks, and lint pass. Eight WebGL legend
and surround examples passed smoke checks. A browser fixture visibly paints
two padded legend boxes and collapses/restores their space when disabled.

The baseline now includes `legendView.js`: 9,643 production SLOC across the
original 33 files. The final scope has 34 files because the shared background
builders were extracted; their code remains included. Compared with the first
pass, this milestone removes 38 production SLOC and 86 physical production
lines. Across the branch, it removes 343 SLOC (3.56%) and 529 physical lines.
The one App consumer changes one line with zero net production-line change;
it is outside the Core source-size table.

| Measurement | Original baseline | First pass | With legend ownership |
| --- | ---: | ---: | ---: |
| Production SLOC | 9,643 | 9,338 | 9,300 |
| Scoped minified source bytes | 127,864 | 124,624 | 124,144 |
| Scoped source, gzip bytes | 40,299 | 39,561 | 39,438 |
| Scoped source, Brotli bytes | 34,806 | 34,247 | 34,161 |
| Shipped UMD minified bytes | 1,434,169 | 1,430,898 | 1,430,257 |
| Shipped UMD gzip bytes | 517,958 | 517,270 | 517,198 |
| Shipped UMD Brotli bytes | 416,529 | 416,033 | 415,937 |

Use the same token/minifier/compression methods described above. Skip modules
that do not exist at an earlier revision rather than counting an empty module
separator. The shipped bundle improves by another 641 minified bytes, 72 gzip
bytes and 96 Brotli bytes in this milestone. The total branch reductions are
3,912 minified bytes, 760 gzip bytes and 592 Brotli bytes. Compression gains
remain modest and the 15% SLOC target remains unmet. The milestone is retained
for simpler ownership, fewer generated view/wrapper objects, the rendering fix,
and improvements in all three shipped-size measurements.

The legend ownership milestone is complete. The existing changeset is now a Core
patch note for the rendering/padding fix; unrelated pending fragments still
make the aggregate release plan minor.

## Shared facet/grid track prototype

The user authorized a bounded structural prototype after legend ownership.
Its comparison base is `9151cf92c`; the original branch baseline and expanded
source scope remain unchanged.

- [x] Map shared calculations and prototype a pure measurement/allocation path
  used by both facet and grid. Preserve facet's decorated-track allocation and
  grid's separate structural margin slots; do not merge their rounding or
  zero-size spacing rules. Keep Surround's supported hooks and growth weights.
- [x] Verify incomplete facet rows, directional headers, constraints, scrolling,
  nested surrounds and App layout consumers using existing subsystem suites.
  Independently review the prototype and compressed-size comparison.
- [x] Keep the prototype only if both callers become clearer and shipped
  compressed size improves; otherwise discard the production edits and commit
  the measured decision. Reconcile this milestone before delivery.

Initial mapping found that the genuinely shared pieces are SizeDef summation
and constrained allocation. Deeper measurement differs: facets add fixed
guide/header extents to each track then shrink arranged rectangles; grids
measure separate plot, structural-flex and chrome slots. A generic callback or
mode-driven track engine must justify its added code against those differences.

The combined prototype was discarded after independent review. It shared only
the allocation call sequence, added a result object to every
`mapToPixelCoords` call, and did not simplify either measurement path. Facets
allocate whole decorated tracks and then shrink their rectangles. Grids allocate
separate plot and structural-margin slots, including growing surround arms.
Merging these representations would complicate device-pixel rounding and
zero-size spacing behavior. A mode-driven engine or callback adapters would
replace the remaining explicit calculations with more machinery.

The retained slice gives `sumSizeDefs` optional fixed spacing and empty growth,
removing facet's local helper and its mutation of the track array. Existing
callers retain their default behavior. Before facet data loads, empty sums still
preserve child growth without imposing a zero maximum. Independent review found
no correctness issues and recommended retaining this smaller cleanup.

Measurements relative to `9151cf92c` (negative means smaller):

| Variant                                      | Production SLOC | Physical lines | Shipped minified | Shipped gzip | Shipped Brotli |
| -------------------------------------------- | --------------: | -------------: | ---------------: | -----------: | -------------: |
| Combined allocation and summation, discarded |              -3 |             -2 |            -63 B |        -39 B |          +19 B |
| Summation only, retained                     |              -2 |             -9 |            -74 B |        -30 B |          -11 B |

The retained source scope is 9,298 SLOC / 13,194 physical lines; its individually
minified attribution proxy is 124,081 B / gzip 39,405 B / Brotli 34,159 B.
The shipped bundle is 1,430,183 B / gzip 517,168 B / Brotli 415,926 B, using the
same build and compression settings as previous milestones.

Verification: all 340 tests in the ten focused Core/App layout suites pass for
both prototypes. These cover facet dataflow/interaction and SVG output, flex
constraints, grid/surround layout and snapshots, and App sample/metadata layouts.
No new tests or snapshots are needed for the retained helper substitution.
Core TypeScript, focused ESLint, and release policy checks also pass. The
existing legend-fix changeset still describes the contribution; this cleanup
needs no additional release note.

The branch now removes 345 production SLOC (3.58%) from the expanded baseline,
including `legendView.js`. Shipped savings are 3,986 minified bytes, 790 gzip
bytes and 603 Brotli bytes. The 15% SLOC target remains unmet. This experiment
does not establish a useful shared track engine; that approach is discarded
because the supported layout models require different measurements.

## Gradient legend coordinate simplification

Comparison base: `c013231bf`. Replace constant cross-axis coordinate fields and
five Formula transforms with scaled datum encodings. Keep the ramp's sampled
position fields because SVG recognizes them, the existing pixel coordinate
scale, and the border's independent single-instance data source.

- [x] Remove constant coordinate dataflow and reuse the positional encoding
  builder for field and datum positions. Preserve continuous/discrete ramps,
  orientation, thickness, labels, tick positions and centered border geometry.
- [x] Replace generated border-field assertions with representative SVG
  geometry checks. Verify legend extent/layout, resize, SVG and WebGL examples,
  types and lint; independently review runtime and test changes.
- [x] Measure source and shipped minified/gzip/Brotli bytes using the fixed
  expanded scope. Keep the cleanup if readable and compressed size improves.
  Reconcile the record and commit as
  `refactor(core): remove constant gradient legend transforms`.

This changes generated internals only. The existing changeset remains accurate;
no specification, documentation or migration change is intended.

The positional encoding builder now accepts field names or numeric datums.
Ramp samples keep their parallel-axis fields, while ramp, tick and label cross
positions use the existing pixel scale directly. The border uses one empty datum
and constant positions. All five Formula declarations and their intermediate
fields are deleted; no additional layout or dataflow abstraction is introduced.

Independent review found no actionable correctness or KISS issues, including
secondary-channel resolution, constant WebGL uniforms, border instance count,
resizing, SVG ramp recognition, label extent and the revised tests.

All 118 tests in five focused layout/legend suites pass. Core TypeScript,
focused ESLint, formatting and release-policy checks pass. Six WebGL examples
pass: linear, log, quantize, threshold, gradient controls and the documentation
gradient legend. The gradient-controls WebGL PNG, containing horizontal and
vertical bordered ramps, is byte-identical to a capture of `c013231bf`.

Tests replace generated border-data and appearance assertions with rendered
geometry at two sizes in both directions, retaining the distinct border-outset
sizing contract. This stronger resize/rendering coverage adds 65 physical test
lines overall; it avoids retaining the overlapping internal-shape assertions.

Relative to `c013231bf`, production shrinks by 70 SLOC / 73 physical lines.
The source scope is now 9,228 SLOC / 13,121 physical lines; its minified attribution
proxy is 123,472 B / gzip 39,250 B / Brotli 34,029 B. The shipped bundle is
1,429,579 B / gzip 517,060 B / Brotli 415,807 B, saving 604 / 108 / 119 B in
this milestone with the same build/compression settings.

Across the branch, the expanded scope including `legendView.js` now removes
415 production SLOC (4.30%) and 611 physical lines. Shipped savings from the
original baseline are 4,590 minified bytes, 898 gzip bytes and 722 Brotli bytes.
The 15% SLOC target remains unmet. The existing legend-fix changeset still
describes the contribution; unrelated fragments make the aggregate release plan
minor, and this internal simplification needs no additional note.

## Guide initialization milestone

Comparison base: `5aed6ecc1`. Construction establishes authored views and
resolutions. One explicit startup boundary attaches view-level properties,
ensures assemblies, then materializes guides before configuration/dataflow.
Keep raw hierarchy construction available for assembly preflight and unresolved
configuration inspection. Preserve supported dynamic mutation refreshes.

- [x] Remove early concat/facet/surround guide creation and GridChild's redundant
  UnitView scale-resolution replay. Share startup preparation across browser,
  headless engine and guide-ready test helpers. Let container subclasses,
  including App SampleView, expose their guide hosts through one hook.
- [x] Prepare guides in newly inserted subtrees before parent guide refresh.
  Verify nested mutation, App summaries/metadata, collected legends, facets,
  surrounds, assembly preflight and rendered layout contracts. Replace redundant
  test setup/assertions where applicable; independently review the result.
- [x] Compare fixed-scope and out-of-scope production lines and shipped
  minified/gzip/Brotli sizes. Verify representative browser examples and record
  the outcome before committing
  `refactor(core): initialize guides after hierarchy resolution`.

This internal lifecycle cleanup is not expected to require public documentation
or another changeset. New abstraction/state must remain smaller and clearer than
the repeated startup paths it replaces.

Browser startup, the headless engine and guide-ready test construction now use
`initializeViewGuides`. Container hooks include SampleView's private guide host;
its summary concat participates in the ordinary traversal. Initial concat,
facet and surround construction no longer creates guides. UnitView constructors
already resolve generated encodings, so GridChild's extra traversal is deleted.
No new retained lifecycle state is needed.

Concat mutation prepares each newly inserted subtree before refreshing its own
and collected ancestor guides. This stays in Concat's existing mutation path:
importing the guide synchronizer through the shared mutation helper would create
a LayerView/AxisView module cycle. Layer children cannot contain nested grids.
Metadata's own dynamic refresh remains sufficient because its generated nested
groups suppress axes/legends and constructor chrome remains available.

Tests now request either raw hierarchy/resolution metadata or prepared guides
explicitly. Two extent-test helpers delegate to the headless engine instead of
duplicating construction and data setup. A nested insertion regression verifies
internal axis/legend placement and initialization. One readiness fixture had
both view-level and encoding-level x-scale configuration; removing the redundant
view-level declaration makes it exercise the supported contract. Existing
readiness, font and extent assertions remain unchanged. Tests and test utilities
grow by only two non-comment lines / one physical line overall.

Independent review found no actionable correctness or KISS issues in startup,
mutation, generated chrome, summary/metadata, resolution or import ordering.
All 536 unit-test files pass: 5,051 tests, one skipped and two todo. Workspace
type checks, full lint, formatting and release-policy checks pass. Seven Core
WebGL examples cover facets/scrolling, nested surrounds, annotations, collected
legends and gradients. An App browser fixture renders sample legends and a
configured summary axis, survives resize, and produces a byte-identical PNG to
`5aed6ecc1` before resize.

Production changes relative to `5aed6ecc1`, excluding tests and test utilities:

| Area | SLOC delta | Physical-line delta |
| --- | ---: | ---: |
| Fixed container/layout scope | +1 | +3 |
| Core startup outside that scope | -20 | -20 |
| App SampleView outside that scope | -11 | -6 |
| All changed production | -30 | -23 |

The shared startup code moves into the counted guide helper, so the fixed scope
slightly grows while total production shrinks. Its attribution proxy is
123,654 B / gzip 39,281 B / Brotli 34,033 B. The authoritative shipped bundle is
1,429,304 B / gzip 516,991 B / Brotli 415,742 B: savings of 275 / 69 / 65 B for
this milestone. The clearer lifecycle, deleted startup work and improvement in
all shipped-size measurements justify retaining it.

The expanded fixed scope is now 9,229 SLOC / 13,124 physical lines, a reduction
of 414 SLOC (4.29%) / 608 physical lines from the original baseline. Whole-branch
shipped savings are 4,865 minified bytes, 967 gzip bytes and 787 Brotli bytes.
The 15% target remains unmet. This refactor needs no additional release note;
the existing legend fix note is accurate and unrelated fragments keep the
aggregate release plan minor.

## Chrome guide resolution boundary

Comparison base: `6314367f1`. Decorative chrome retains data, scales and
parameters, but does not contribute axes or legends. Enforce that once before
guide registration and remove repeated generated-spec exclusions and downstream
member filtering. The fixed container/layout denominator remains unchanged;
report resolution, marking and App changes outside it separately.

- [x] Move axis/legend suppression to the resolution boundary. Mark direct
  chrome UnitViews before eager resolution, without adding a separate lifecycle
  or role registry. Preserve exclude versus excludeSubtree semantics.
- [x] Delete recursive legend spec rewriting, redundant guide exclusions and
  AxisResolution chrome filtering. Replace fake-member tests with constructor/
  resolution contracts; retain generated SVG, interaction and App coverage.
- [x] Verify scale links, plot guides, facet headers, rulers, selection overlays,
  App sidebar/metadata and legend output. Independently review, compare source
  and shipped size, and commit as
  `refactor(core): suppress chrome guides at resolution`.

Keep non-addressability independent from chrome. In particular, the App sidebar
stays addressable and its scales remain functional. Internal simplification
alone does not require a new release note.

The resolution planner now skips guide registration for chrome while retaining
ordinary scale resolution. Direct decorative UnitViews receive their role in
the View constructor before eager resolution. The existing WeakMap remains the
single role registry; self-only and subtree exclusions remain distinct.
Legend specs no longer need recursive rewriting, and AxisResolution no longer
filters its members repeatedly. Generated scale exclusions and forced source
scale links remain necessary and are retained.

Two constructor-level tests replace four mocked chrome-member tests and an
overlay existence test. They cover direct and inherited chrome, authored data
parents, shared and private scales, source guide lookup, conflicting guide
properties, and self-only versus subtree exclusion. Obsolete generated-spec
field assertions are removed. Tests shrink by 75 non-comment lines / 91 physical
lines overall.

Independent review found no actionable correctness or simplification issues.
Its suggested source-axis and source-legend lookup assertions are included.
All 536 unit-test files pass: 5,048 tests, one skipped and two todo. Workspace
type checks, full lint, formatting and release-policy checks pass. Six Core
WebGL examples cover facets/scrolling, surrounds, annotations, collected legends
and gradients. Live ruler and interval-selection interactions pass. An App
browser fixture retains its configured summary axis, sample legends and metadata
domain, including after resize; rendered output was inspected.

Production changes relative to `6314367f1`, excluding tests and test utilities:

| Area | SLOC delta | Physical-line delta |
| --- | ---: | ---: |
| Fixed container/layout scope | -44 | -80 |
| Core resolution/marking outside that scope | -13 | -17 |
| App SampleView outside that scope | -2 | -2 |
| All changed runtime production | -59 | -99 |
| Internal type declarations, separately | +1 | +2 |

The fixed-scope attribution proxy is 122,995 B / gzip 39,163 B / Brotli 33,979 B,
saving 659 / 118 / 54 B. The authoritative shipped bundle is 1,428,632 B /
gzip 516,899 B / Brotli 415,688 B: savings of 672 / 92 / 54 B this milestone.

The expanded fixed scope is now 9,185 SLOC / 13,044 physical lines, a reduction
of 458 SLOC (4.75%) / 688 physical lines from the original baseline. Whole-branch
shipped savings are 5,537 minified bytes, 1,059 gzip bytes and 841 Brotli bytes.
The 15% target remains unmet. The existing legend fix changeset remains accurate;
this internal refactor needs no additional fragment.
