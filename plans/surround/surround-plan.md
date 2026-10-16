# Surround composition

Status: complete and reconciled for PR delivery on 2026-10-16. All five
implementation milestones and the subsequent example/documentation work are
committed. Delete this directory in a separate retirement commit before opening
the PR; the reconciled records remain available in Git history.

## Delivered scope

`surround` replaces wrapping-concat ceremony with a central `spec` and optional
`top`, `right`, `bottom`, and `left` groups. Each side accepts an array or an
object with `views` and shared data, transforms, encodings, parameters, and
other ordinary view settings. Top/bottom tracks share central x coordinates;
left/right tracks share central y coordinates. Perpendicular scales remain
independent unless a side explicitly shares them.

The center controls its plotting width and height, including growing and
step-based sizes. Surround dimensions describe the complete composition.
Tracks specify only their perpendicular thickness. Outer scales can set
coordinate domains, names, reversal, gaps, and zoom settings. Independent
local axes and collected legends retain their existing semantics.

Side tracks can themselves use `surround`. They export their central plotting
interval while reserving fixed or step-based structural insets around it.
Nested panels can occupy free corners; outward extents use a maximum, and
occupied-panel collisions fail with located errors. Automatic chrome overhang
reuses available corner space while honoring explicit settings and padding.

One implicit concat per side provides the authored scope and an internal
positional resolution boundary. Layout reuses GridView sizing and arrangement;
derived plot/guide footprints support collision checks and input routing.
Normal dataflow, imports, selectors, configured visibility, parameter pushes,
clipping, picking, tooltips, leaf rulers, and pan/zoom remain available.

See [the nesting contract](surround-nesting.md) for the worked continuous-scale
fixture and resolution/alignment details, and [the annotated example record](
surround-annotated-matrix.md) for the final categorical acceptance case.
Architecture references: `ARCHITECTURE.md`,
`packages/core/docs/architecture/views-and-dataflow.md`.

## Completed milestones

### 1. Core flat composition

- [x] Add extensible schema/types, guards, factory support, center authority,
      fixed side roles, data/parameter scopes, visibility, and validation.
- [x] Verify sharing/isolation, names, index gaps/reversal, fixed/step/growing
      sizes, axes/legends, imported and multiscale plots, and located errors.
- [x] Preserve navigation boundaries and ordinary concat/facet behavior.
- [x] Add grammar documentation and the minor feature changeset.

Delivered in `a98d4b04a`.

### 2. App authoring and example migrations

- [x] Integrate App recursive types, visibility, schemas, and authored selectors.
- [x] Add the deterministic local-data annotated-matrix example.
- [x] Migrate public UpSet and clustered heatmap examples while preserving
      data, transforms, scales, local guides, legends, and interactions.
- [x] Implement bounded automatic corner overhang and verify explicit overrides.
- [x] Verify schema/docs synchronization, App bundle integration, workspace
      TypeScript/lint, and release policy.

Delivered in `923ca5e2f`. Migration of the private NCI-60 specification was
explicitly discarded at the user's request; its checkout remains untouched.

### 3. Integration and simplification review

- [x] Verify annotated matrix, UpSet, and clustered heatmap in browsers,
      including loading, resize, interaction, visibility, and SVG output.
- [x] Complete independent implementation/example KISS and downstream reviews;
      fix meaningful findings and remove redundant/internal-shape tests.
- [x] Run full/shared subsystem suites and the remaining delivery checks.
- [x] Record completed work and discarded scope for later plan retirement.

Delivered in `3ec242bcf` and `47e6282cf`.

### 4. One-container side scopes

- [x] Replace the extra generated wrapper with a consistent positional
      resolution boundary across lookup, ownership, and declarations.
- [x] Preserve side data scopes, imports, selectors, local sharing, forced/local
      axes, navigation, visibility, diagnostics, and both migrated examples.
- [x] Complete independent review and retain the existing feature changeset.

Delivered in `3cc559f8a`.

### 5. Nested side alignment with fixed structural insets

- [x] Add exported alignment intervals and fixed/step structural allocation.
- [x] Add normalized categorical summaries above the right metadata panel,
      including its independent percentage scale and right axis.
- [x] Reserve maximum outward extents, reject structural collisions, and route
      input through actual occupied panels and guide strips.
- [x] Verify all orientations, growing outer anchors/arms, visibility, imports,
      local/shared guides, legends, and rejection of growing aligned insets.
- [x] Complete independent geometry/implementation review and final integration.

Delivered in `37abf1eae`; the deferred scrolling design and anticipatory code
comments were recorded in `8a6dafe47`.

### Subsequent refinement and documentation

- [x] Refine the acceptance example into a growing expression matrix and a
      two-gene mutation matrix, using categorical axes, axis titles, 10px
      offsets, local encoding-level scales, and right-hand legends.
- [x] Improve grammar prose/property descriptions, cite Marsilea, hide the long
      example spec, and link the public examples.
- [x] Add accessible schematic SVGs with a responsive two-panel layout.
- [x] Trim shared layout/sizing helpers while retaining functionality.
- [x] Migrate the genomic PISA interaction matrix and link its documentation.

Delivered in `85adfbf87`, `20922fd07`, `c0640e02f`, `f73d79a07`, and
`e193a1d2e`. The operator name remains `surround` after the naming review.

## Final measurements

Against `origin/master` at `74bbd7e1315bf2d14c7f2f4b05d4e977170f74a1`,
using the parser-based production-line counter under `.agents/skills/`:

- Runtime JavaScript under `packages/`, excluding tests, comments, and blanks:
  988 added, 132 deleted, net +856 non-comment code lines across 16 files.
- Declarations under `packages/`, counted separately: 72 added, 3 deleted,
  net +69 non-comment code lines across four files.
- `SurroundView` is 686 physical lines and `GridView` is 2,223 physical lines.
  These include comments and blanks and are not production-line counts.
- Public clustered heatmap: 594 lines; UpSet: 403; PISA matrix: 445.

The final trimming commit removes 92 net non-comment runtime lines. Nested
alignment remains more substantial than the original flat-only increment;
there is no promised further reduction or general layout solver.

## Verification and release

Independent design and implementation reviews found no remaining blockers.
Final PR preparation passed 5,043 tests in 532 files, with one skipped and two
todo. Workspace TypeScript, repository lint, Core/App schema generation,
schema-derived documentation synchronization, and release policy/status all
pass. The fetched PR base is unchanged, and the branch is not behind master.

The annotated matrix, UpSet, and public clustered heatmap have passed WebGL
and Canvas checks, including picking, resizing, linked interaction, and SVG.
The PISA migration preserves plotting bounds, source data, parameters, styling,
and collected legends; browser checks verify shared index-scale zoom/pan,
reactive cell labels, ruler fading, and the multiscale sequence logo. The docs
build and desktop/mobile schematic checks pass.

`.changeset/flat-surround.md` covers the compatible Core/App feature. The
fixed release group advances from 1.1.1 to 1.2.0; no additional package bump
is needed for plan retirement or the example/documentation refinements.

## Explicitly deferred or discarded from this delivery

- [x] Defer synchronized scrolling. The intended center-owned viewport/shared
      offset contract is recorded in the nesting design and short code comments;
      all scrollable surround viewports remain rejected in this branch.
- [x] Defer authored concat/facet children, composite centers, growing structural
      insets along an externally aligned dimension, and App SampleView slots.
- [x] Defer surround-root/cross-region axes, explicit corner slots, spans,
      arbitrary grids, automatic collision relocation, named alignment ports,
      surround-owned input controllers, and dynamic structural mutation.
- [x] Discard the private heatmap migration and moving its gene labels out of
      their existing layer; neither is needed for the public examples.

All agreed implementation tasks are complete; these explicit deferrals are
future work. The literature survey is complete. Identifying the remembered
Python package conclusively was not an implementation acceptance requirement.
