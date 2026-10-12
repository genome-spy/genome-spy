# Lasso review stack

## Goal and scope

Make draft PR #562 reviewable without rewriting working selection logic or
dropping the CPU reference, live WebGPU selection, density display, or persistence.
This is a delivery plan, not a renderer redesign. Keep tests with their behavior.
Do not add abstractions just to obtain smaller diffs.

Audit target: `feat/lasso-selection-pr` at `8b1b0856`, compared with
`origin/master` at `4fc8274a`. Original development branch and user edits stay intact.

## Findings and revised decision

The original four-way split is possible only with additional shared-file edits:

- `LassoSelection` and `lasso.wgsl.js` share density counters, settings, buffers,
  and dispatch with membership computation.
- `WebGpuRegionSelectionPreview` owns both transferred selection tables and
  cached density display. Its invalidation and disposal are shared.
- `RegionSelectionController` combines CPU fallback, backend materialization,
  cancellation, readback, and density scheduling. Separating CPU from GPU means
  staging versions of this same interaction contract.

Prefer three dependent PRs following existing package boundaries. Density stays
with the corresponding renderer utility and Core adapter; it is a distinct review
section inside each PR. WebGPU is required, not deferred optional scope.

### 1. Generic WebGPU utilities

- Outcome: projected point capture, compute-produced hash tables and ID readback,
  borrowed table ownership, density image utility, and standalone demonstrations.
- Files: changed `packages/webgpu-renderer/**`, including exports, point/path
  shader changes, tests, bundle fixtures, stories, README and migration notes.
- Consumers: existing renderer selection slots and point picking; no Core or App
  imports are required by the new utilities.
- Verification: renderer types, bundle exclusions, compute and density GPU tests;
  remaining GPU/picking tests and Storybook before publication.
- Tentative title: `feat(webgpu-renderer): add GPU lasso selection utilities`.

### 2. Native Core integration

- Outcome: complete native region grammar, CPU reference, nonlinear projection,
  live WebGPU integration, stable committed membership, and linked consumers.
- Files: changed Core sources, tests, types and public docs; native demos, UMAP
  preparation, GIF, root development harness and related configuration.
- Include the one-line `AgentSelectionParameterDeclaration.selectionType`
  expansion in `agentContextTypes.d.ts`: otherwise unchanged agent code fails
  type-checking when Core introduces `region`. Leave incidental formatting aside.
- The native history demo imports its helper conditionally. Move `native/history.js`
  and its advertised history route to PR 3; do not leave a broken advertised route
  or static missing-import build in PR 2.
- Document persistence only when PR 3 supplies it. Keep renderer root imports and
  backend ownership unchanged. Schema/reference generation belongs with its source.
- Verification: all Core tests and types, unchanged App/agent types, schema/docs
  builds, backend smoke tests, live linked selection, nonlinear scales, replacement,
  clear, navigation and disposal. Include both 10M display modes for comparison.
- Tentative title: `feat(core): add native lasso selection across renderers`.

### 3. App persistence and agent compatibility

- Outcome: polygon-based bookmarks, ordered replay, undo/redo, loading completion,
  and validated agent actions.
- Files: changed App and remaining agent sources/tests/generated schemas; history
  helper and example wiring, corresponding persistence documentation.
- Dependencies: Core region intent, materialization and producer readiness helpers;
  no App dependency is needed by Core or the renderer.
- Verification: App provenance and agent validation suites, workspace types,
  generated schemas, three-backend history and linked-filter smoke tests.
- Tentative title: `feat(app): persist and restore lasso selections`.

## Investigation evidence

- Extracted all 35 changed renderer files onto the master base in a temporary
  directory, with no Core/App changes. Renderer type and bundle checks passed;
  all eight compute/density tests in `lasso.gpu.test.js` and
  `lassoDensity.gpu.test.js` passed in Chrome.
- Extracted Core plus renderer without App/agent changes. All 66 tests in the
  region controller, native unit-view and WebGPU surface suites passed. Unchanged
  App type-check passed. Agent type-check identified the declaration widening above;
  repeating it with only that one-line widening passed.
- All 51 existing focused renderer selection-resource, CPU region and App region
  provenance tests passed on the full PR branch.
- Temporary candidates reuse installed dependencies; clean installation and full
  checks on actual review branches remain publication gates.

## Completed delivery gates

- [x] Construct branches `feat/lasso-renderer`, `feat/lasso-core`, `feat/lasso-app`
  from the audited base, with each branch based on its predecessor.
- [x] Preserve the development branch, umbrella branch and user working changes.
- [x] Add an empty renderer fragment; Core minor / agent declaration patch in PR 2;
  App and agent minor in PR 3. The fixed group remains a minor release overall.
- [x] Stage history fixture and persistence documentation only with App support.
- [x] Regenerate agent schemas on Core and App branches. The Core regeneration also
  synchronizes inherited base schema drift; the App delta adds region action values.
- [x] Complete branch checks and final browser integration checks below.
- [x] Compare final source/types/adjacent tests with umbrella: all 69 changed files
  match byte-for-byte, excluding generated artifacts. Generated agent schemas also
  match the umbrella at the final tip. Renderer docs are deliberately scoped to
  standalone utilities; release fragments are partitioned, with no runtime rewrite.
- [x] Reconcile this record for a dedicated commit, followed by plan deletion before
  creating the replacement PRs. Keep #562 open as the umbrella.

## Final verification

Renderer branch: locked clean installation; 299 unit tests across 44 files; all 24
changed GPU tests in Chrome; types, bundle exclusions, lint, Storybook build and
release policy. Its empty fragment introduces no release bump; the base already
contains a pending minor release for the fixed group.

Core branch: clean installation after lockfile change; 4,945 unit tests across 525
files; all workspace source/test types, lint, Core build and declaration generation,
minimal bundle boundaries, schemas, API docs and documentation site (no issues),
19 Markdown-extension tests, generated agent checks and release policy. Documentation
preparation was repeated sequentially after unit checks; the earlier concurrent run
lost its required App schema input. Browser checks passed for nonlinear linked
WebGL/WebGPU/Canvas drawing, replacement, clear, zoom, resize, exports and data reset.
Native 10M density: 758,329 live IDs exactly matched committed membership, with no
large uploads, unchanged membership after zoom and zero tracked buffers after
finalization. Real 1.1M log/sqrt: 62,952 live IDs matched committed membership, also
without uploads or disposal leaks.

App branch: 4,969 unit tests across 526 files; all workspace source/test types, lint,
App/documentation and agent builds, synchronized agent artifacts and grammar index,
release policy. Save JSON intent, undo, redo, reordered-data restore and linked
filtering passed in WebGL, WebGPU and Canvas. Dependencies are unchanged from the
Core clean install. Existing suite has one skip and two TODOs.

No extra production compatibility layers were introduced. Further renderer splits
were discarded because they would stage alternative versions of shared layouts
and native lifecycle logic. Checks target affected GPU suites; unrelated font/oracle
suites, additional hardware and per-pass GPU timing were not rerun. Final publishing
and links are recorded in PR metadata after retiring this temporary plan.
