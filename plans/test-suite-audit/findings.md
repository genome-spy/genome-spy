# Test suite audit: Milestone 1 findings

Status: Milestone 1 review completed on 2026-09-26. The outcome of the full
audit is recorded at the end of this document.

## Inventory and method

Collected the root Vitest projects with:

```sh
npx vitest list --json=/tmp/genomespy-vitest-list-20260926.json
```

The complete, sorted per-file count is in `vitest-inventory.tsv`. This is a
collection inventory, not a count of passing tests or a deletion target.

| Package | Files | Collected cases |
| --- | ---: | ---: |
| core | 322 | 3,268 |
| app | 90 | 617 |
| webgpu-renderer | 44 | 297 |
| app-agent | 26 | 188 |
| playground | 6 | 25 |
| inspector | 4 | 13 |
| embed-examples | 3 | 5 |
| doc-embed | 1 | 4 |
| react-component | 1 | 1 |
| **Total** | **497** | **4,418** |

There are 520 repository files matching
`\.(test|spec)\.[cm]?[jt]sx?$` by filename.
The 23 outside this root Vitest collection are 21 WebGPU `.gpu.test.js` files
run through Playwright and two msdfgen oracle Vitest files selected by
`packages/webgpu-renderer/vitest.oracle.config.js`. Running
`npx vitest list --config vitest.oracle.config.js --json` from that package
collects 4 cases in `tests/oracles/msdfgen/pathRasterizer.test.js` and 3 in
`tests/oracles/msdfgen/pathAtlas.test.js`. Thus the root and oracle Vitest
collections together contain 499 files and 4,425 cases. The Playground's
`tests/upload.playwright.js` is another separate browser check. The Playwright
checks are not included in those Vitest totals.

Three read-only Luna reviews covered disjoint primary areas: Core dataflow,
reactivity, and view lifecycle; Core layout, examples, SVG, and shaders; and
API wrappers, App, App Agent, WebGPU, smaller packages, and controls. I checked
their proposed overlaps against nearby tests and production code before
ranking the queue below. Cost and protection are separate qualitative ratings;
test length or test count alone never makes a test a deletion candidate.

The fixed-seed control sample was selected from the 485 collected files other
than the six initial candidates and six named subsystem suites in the plan.
For each eligible repository path, compute the lowercase hex SHA-256 digest of
`genomespy-test-audit-2026-09-26`, a zero byte, and that path. Sort ascending by
digest, then take 6 Core, 2 App, 1 App Agent, 2 WebGPU, and 1 other file. The
seed and quotas deliberately provide cross-package controls; the sample is not
used to estimate a suite-wide deletion percentage.

The selection command below reads the committed inventory. Its excluded paths
are the six initial candidates and six named subsystem suites:

```sh
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const seed = "genomespy-test-audit-2026-09-26";
const paths = readFileSync("plans/test-suite-audit/vitest-inventory.tsv", "utf8")
    .trim().split("\n").slice(1).map((line) => line.split("\t")[0]);
const excluded = new Set([
    "packages/core/examples.test.js",
    "packages/core/layout.test.js",
    "packages/core/src/embedFactory.test.js",
    "packages/core/src/view/flowBuilder.test.js",
    "packages/core/src/rendering/webgl/shaderSnapshot.test.js",
    "packages/webgpu-renderer/src/scales/linear.test.js",
    "packages/core/src/data/reactiveReplay.test.js",
    "packages/core/src/paramRuntime/graphRuntime.test.js",
    "packages/core/src/view/viewMutationApi.acid.test.js",
    "packages/core/src/view/layout/flexLayout.test.js",
    "packages/core/src/scales/scaleResolution.parameterDependency.test.js",
    "packages/core/src/rendering/svg/standaloneAxes.test.js",
]);
const quotas = { core: 6, app: 2, "app-agent": 1, "webgpu-renderer": 2, other: 1 };
for (const [group, quota] of Object.entries(quotas)) {
    const selected = paths.filter((path) => {
        const pkg = path.split("/")[1];
        return !excluded.has(path) &&
            (group === "other" ? !(pkg in quotas) : pkg === group);
    }).map((path) => ({
        path,
        digest: createHash("sha256").update(seed + "\0" + path).digest("hex"),
    })).sort((a, b) => a.digest.localeCompare(b.digest)).slice(0, quota);
    for (const { path } of selected) console.log(path);
}
NODE
```

| Control file | Cases | Review result |
| --- | ---: | --- |
| `packages/core/src/rendering/canvas2d/canvas2DRenderCoordinator.test.js` | 5 | Keep: settled layout, picking, allocation, and failure lifecycle. |
| `packages/core/src/data/formats/vcf.test.js` | 3 | Keep: parsing output and failure location. |
| `packages/core/src/genomeSpy/cursorManager.test.js` | 5 | Keep: precedence, live updates, and disposal. |
| `packages/core/src/data/sources/lazy/legendEntriesSource.test.js` | 1 | Keep: generated chrome parent routing. |
| `packages/core/src/rendering/svg/examples.test.js` | 3 | Keep: structured export output. |
| `packages/core/src/scales/scaleResolution.contributorBindings.test.js` | 2 | Keep: shared domain publication and detached contributors. |
| `packages/app/src/utils/nestPaths.test.js` | 1 | Keep: no overlapping nesting contract found. |
| `packages/app/src/sampleView/metadata/metadataUtils.test.js` | 48 | Keep pending assertion-level review: covers distinct metadata transformations. |
| `packages/app-agent/src/agent/chatPanel.test.js` | 7 | Keep: user-visible chat/focus behavior. |
| `packages/webgpu-renderer/src/marks/programs/textProgram.test.js` | 18 | Keep core text contracts; remove one assertion that only checks local arithmetic. |
| `packages/webgpu-renderer/examples/pathTextScene.test.js` | 1 | Keep: pair placement and advance adjustment. |
| `packages/playground/src/editor/schemaRequestService.test.js` | 10 | Keep: URL routing and failure behavior; table is already compact. |

The controls matter: several long or mocked tests protect distinct lifecycle,
rendering, and user-visible behavior. The audit does not support pruning them
on appearance alone.

## Ranked decision queue

Each item states the smallest defensible action. **Replace** and **simplify**
are proposals for later milestones, not authorization to delete the current
assertions before the replacement is verified. Cost refers to maintenance and
review burden unless a runtime measurement is named.

### 1. Example hierarchy snapshots: replace selectively

`packages/core/examples.test.js:18-21` initializes 204 offline examples and
snapshots assemblies, view hierarchy, and data source summaries. **Cost: high**
for the exact payload: its snapshot has 15,273 lines and was changed in 50
commits; one recent `test: update snapshot` commit added 41 lines. Some updates
come from legitimate new examples, so churn alone does not prove waste.
**Protection:
high** for all-example initialization, uncertain for every serialized name and
source identifier. `packages/core/examples.schema.test.js` validates 227 specs against the
schema but does not initialize their headless engines. Keep the initialization
loop. First identify a small set of examples whose exact structure matters,
then replace only the remaining snapshot assertions with initialization and
representative structural checks. **Confidence: medium.** Residual risk:
unreviewed examples may have unique hierarchy or source behavior visible only
in the snapshot. Milestone 3; review gate before shrinking broad coverage.

### 2. Flow-builder graph paths: replace with row and branch behavior

`packages/core/src/view/flowBuilder.test.js:89-223` indexes child paths and
checks classes such as `CloneTransform`. **Cost: medium:** four cases and a
`byPath` helper couple tests to graph shape across a 255-line file. **Protection:
medium/high:** branch isolation, source overrides, and auxiliary relation
wiring matter, but numeric graph paths are not a public contract. Preserve the
collector sorting cases at lines 46-86.
`packages/core/src/data/transforms/cross.test.js:168` already builds a
headless spec, checks the Cartesian rows and two sources, and verifies disposal;
it provides strong overlap for the cross graph-path case. Other flow-builder
cases need a small spec-to-collector replacement that proves their distinct
branch outputs and non-mutation of sibling rows. Keep a structural assertion
only if a graph invariant cannot be observed in rows. **Confidence: high** for
removing exact paths after replacements, medium for dropping the clone check.
Residual risk: losing branch isolation. Milestone 3.

### 3. Full-tree layout snapshots: narrow after mapping interactions

`packages/core/layout.test.js:52-124` snapshots representative grid, concat,
axis, and config specs. **Cost: medium:** 2,417 snapshot lines and 11 commits
touching that file, though this is less churn than the examples snapshot.
**Protection: medium/high** for end-to-end arrangement interactions. Its
point-with-legend case already checks concrete plot bounds and legend position
at lines 60-76. `packages/core/src/view/layoutSnapshot.test.js` checks shared
axes, SizeDef constraints, nested concat dimensions, and legends;
`packages/core/src/view/axisPlacement.test.js` and
`packages/core/src/view/gridView/legendCollection.test.js` add focused contracts.
Keep distinct example
scenarios, but narrow full trees where named geometry or SVG assertions cover
the same behavior. **Confidence: medium.** Residual risk: losing an unexpected
interaction across configuration and layout. Milestone 3.

### 4. Embed factory fixtures: combine setup, retain public checks

`packages/core/src/embedFactory.test.js:36-143` repeats subclass constructors
and `createEmbed` setup for four forwarding checks. **Cost: medium** from
repeated fixture code in a 292-line file. **Protection: high:** parameter access
and SVG/raster export are distinct public API routes; the adjacent mutation,
lifecycle, and failure tests at lines 145-285 add other contracts. Combine the
four cases with a shared configurable mock or small helper only if their
individual failures stay clear. Do not delete the API assertions. **Confidence:
medium.** Residual risk: abstraction could obscure which route failed.
Milestone 2.

### 5. Graph propagation order: preserve the DAG contract, relax sibling order

`packages/core/src/paramRuntime/graphRuntime.test.js:144-183` expects the exact
evaluation order `["b", "c", "d", "e", "f"]`. **Cost: low/medium:** this can
fail when equally ranked siblings change order without affecting coherent
observation. **Protection: high** for multi-level propagation and one
evaluation per node. Assert final values, single evaluations, and prerequisite
ordering; do not make sibling order a contract unless a consumer needs it.
Neighboring diamond and observer tests at lines 205-259 support coherent
publication. **Confidence: medium.** Residual risk: an accidentally unstable
scheduler could become less visible, so retain topological-order evidence.
Milestone 2 or 3.

### 6. Text program arithmetic assertion: delete the assertion only

`packages/webgpu-renderer/src/marks/programs/textProgram.test.js:395-408`
computes `glyphCount` from local `labels` and asserts
`glyphCount * 8 - 8000 === 264000`. **Cost: low**, but this is a clear
assertion with **no regression protection:** no renderer output participates in
the expression. Delete that assertion and its now-unused local calculation.
Keep the same test's `program.drawCount`, placement-index data, and packed
buffer checks, which protect logical rather than glyph cardinality.
**Confidence: high.** Residual risk: none for this isolated arithmetic check.
Milestone 2.

### 7. Flex zero-gap permutations: simplify only if labels stay diagnostic

`packages/core/src/view/layout/flexLayout.test.js:258-384` repeats forward and
reverse zero-size placement permutations. **Cost: low/medium** from repeated
setup; **protection: high** because spacing and reverse allocation have distinct
failure modes. A labeled table could reduce fixture duplication while keeping
leading, middle, trailing, and reverse cases. **Confidence: medium.** Residual
risk: over-combining can hide which edge case failed. Milestone 3.

## Keep or defer pending stronger replacement evidence

- **Keep generated shader snapshots for now.**
  `packages/core/src/rendering/webgl/shaderSnapshot.test.js` snapshots broad
  point, selection, link, arrow, and scatter variants in 8,520 lines. Six
  commits touched the snapshot. Its fake GL helper unconditionally reports
  successful compilation/linking at lines 84-94, so snapshot size is not a
  reason to drop generated-source protection. Focused assertions at lines
  184-246, 268-321, 423-525, and 578-640 cover distinct shader semantics.
  Assess a real GLSL compile/render path before narrowing generated variants.
- **Keep view mutation acid scenarios.**
  `packages/core/src/view/viewMutationApi.acid.test.js:326-1059` covers shared
  guide ownership, in-flight sources, rollback, scoped parameters, and reflow
  batching beyond isolated `packages/core/src/view/viewMutationApi.test.js`
  operations. It is 1,192
  lines, but the scenarios carry unique cross-operation protection. Simplify
  repeated identity/full-state checks only when a smaller assertion proves the
  same invariant.
- **Keep reactive replay and scale dependency boundaries.**
  `packages/core/src/data/reactiveReplay.test.js` covers debounce, replay
  ordering, disposal, failed retries, and async reload interplay.
  `packages/core/src/scales/scaleResolution.parameterDependency.test.js` covers
  inherited/chained parameters, cycles, subtree insertion, transition frames,
  and mutation atomicity. Their setup complexity follows the behavior.
- **Defer the GraphRuntime disposer-count assertion.**
  `packages/core/src/paramRuntime/graphRuntime.test.js:352-377` expects exactly
  six internal unregistrations.
  It is brittle, but it guards a real accumulation risk. Do not remove it until
  a repeated binding/disposal check detects retained callbacks without relying
  on an exact internal count.
- **Keep the linear scale config test for now.**
  `packages/webgpu-renderer/src/scales/linear.test.js:6-19` mostly restates a
  small factory, but it is only 20 lines and checks shared frozen definition
  identity. `packages/webgpu-renderer/src/scales/linear.js` explicitly describes
  an immutable shared definition.
  GPU suites exercise linear scale use, not clearly that identity contract.
  Low maintenance savings make deletion a poor priority; keep the assertion
  while that API contract remains.
- **Keep standalone axes, Canvas2D coordinator, metadata, and chat behavior.**
  `packages/core/src/rendering/svg/standaloneAxes.test.js` checks rendered SVG
  and axis survival through child
  replacement and zoom. Control-sample Canvas2D, App metadata, and App Agent
  chat tests cover distinct rendering lifecycle and user-facing behaviors.

## Verification and remaining limits

I ran the three large candidate suites with:

```sh
npx vitest run packages/core/examples.test.js packages/core/layout.test.js \
  packages/core/src/rendering/webgl/shaderSnapshot.test.js --reporter=agent
```

The focused run passed 319 tests in 2.49 seconds. For these files, execution
time is not the main observed cost; snapshot review and change churn are the
stronger evidence. The reviews and overlap checks were read-only. No full unit,
GPU, or browser suite was required to verify this inventory.

The ranked queue is a starting point, not a complete judgment on every test in
the 497-file inventory. Further candidates discovered during feature work
should use the same rubric. Before any deletion with uncertain coverage,
inspect the retained assertion and cross-subsystem contract named above.

## Final audit outcome

The root Vitest collection now has 497 files and 4,413 runnable cases, down
from 4,418. Two focused example cases were added, six redundant full-tree
layout cases and one graph-path cross case were removed; all other cases were
retained or rewritten. The full unit run passed 4,413 tests, with 1 skipped
and 2 todo. The separate two-file, seven-case msdfgen oracle collection was
untouched. The existing one-case Playground Playwright suite gained a rendered
pixel assertion without adding a browser scenario.

| Change | Retained protection | Maintenance effect |
| --- | --- | --- |
| Shared examples | All 204 offline specs initialize and contain a visual unit; template expansion and relative URL wiring have focused checks. | Removed the 15,273-line hierarchy/source snapshot. |
| Flow builder | Headless rows show formula output, sibling isolation, and nested source override; `cross.test.js` checks auxiliary Cartesian rows and disposal. | Removed exact child-path and node-class checks, plus the `byPath` helper; one redundant cross case was deleted. |
| Layout | Eight examples check plot/legend bounds, nested grids, shared axes, adjacent tracks, imported tracks, and panel alignment. Existing focused layout and SVG suites cover other geometry and rendering contracts. | Removed the 2,417-line full-tree snapshot and six cases whose layout shape added no distinct contract. |
| Public API and text program | Embed API forwarding, lifecycle, failure, and text buffer checks remain. | Shared setup removed 112 lines from `embedFactory.test.js`; one arithmetic-only text assertion and six unused lines were removed. |
| Zero-size flex layout | Five scenarios still run in both directions, with explicit expected positions. | One labeled table replaces duplicated setup and individual expectations. |
| Browser stack | The CI upload scenario checks dataflow publication and visible red rendered marks. | One scenario, no new browser fixture or screenshot baseline. |

The broad example and layout snapshots together removed 17,690 serialized
lines; the edited test source files are 163 lines shorter in aggregate. These
counts are maintenance measures, not proxies for test quality. The
flow-builder and layout assertions were checked against their supported
failure modes: removing the defensive clone made the sibling-isolation test
fail, and changing the browser mark to blue made the rendered-pixel assertion
fail. Both mutations were restored and the tests passed again.

### Subsystem coverage and retained candidates

- **Dataflow and reactivity:** complete headless specs exercise sources,
  transforms, collectors, cross inputs, and disposal. `reactiveReplay.test.js`,
  `graphRuntime.test.js`, and `scaleResolution.parameterDependency.test.js`
  retain propagation, observer, replay, cycle, and lifecycle checks. These
  subsystem tests are more valuable than graph-shape assertions.
- **Hierarchical layout and output:** `layout.test.js`, `layoutSnapshot.test.js`,
  and `flexLayout.test.js` check arranged geometry and guide placement;
  `rendering/svg/examples.test.js` and `standaloneAxes.test.js` check emitted
  output across the view hierarchy. The real-browser upload test adds one
  end-to-end rendering check through the Playground, Core, and WebGL.
- **Generated GLSL:** the 8,520-line shader snapshot remains. Its fake GL
  reports compile/link success, so exact generated-source checks still protect
  variants that the focused semantic assertions and one browser draw do not
  cover. A representative `first.json` WebGL smoke run succeeded; this does
  not prove every generated shader variant compiles. Narrowing this snapshot
  is future work only after reliable per-variant compiler or rendering checks.
- **Other low-value leads kept:** the WebGPU linear-scale test protects
  definition identity at little cost. The GraphRuntime exact sibling-order
  assertion and disposer count are brittle but guard scheduling and cleanup;
  replacing them now would add assertion machinery without clear savings.
  Mutation, Canvas2D, App metadata, and agent chat tests retain distinct
  lifecycle or user-visible protection.

No further `AGENTS.md` rule emerged: its current guidance already asks for
observable contracts, representative assertions, and feature-time pruning.
The inventory was broad, but assertion-level decisions were made for the
ranked candidates and sample, not for every case in the repository.
