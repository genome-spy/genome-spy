# Shared stroke API and GPU rule rendering

Status: reviewed by two independent Sol subagents, 2026-10-27. Both support
the standalone renderer scope. The bounded outside-border body proof passes
and a concrete test allocation is recorded below. Implementation is authorized on fresh-master branch `codex/gpu-rule-borders`.
Inside/center geometry and final integration remain verification gates.
**No new dependencies.** The Canvas rectangle work is set aside. This plan does
not inherit approval from reviews of earlier Canvas or broad outline plans.

Requirement: [#604](https://github.com/genome-spy/genome-spy/issues/604), using
[#602](https://github.com/genome-spy/genome-spy/pull/602) as a proof of concept,
not as a second outline-specific public API. The issue was re-read for this plan.

## Outcome and ownership

Rules acquire a filled ribbon and a border through the existing paint channels.
`size` remains body thickness. Stroke alignment eventually has the same meaning
on the supported filled mark families. Preserve existing unoutlined rules,
ordinary ticks, legacy point inward strokes, scales, legends and reactivity.

Architecture check, grounded in `ARCHITECTURE.md` and the linked rendering guide:

- Semantic marks (`core/src/marks`) own supported channels and normalization.
  `fixFill`/`fixStroke` and `getConfiguredMarkDefaults` already own paint fallback,
  resolution-channel identity and property/config precedence. Extend those paths;
  do not introduce a separate outline vocabulary or a second normalization pass.
- WebGL delegates own GLSL, buffers and draw callbacks. The standalone WebGPU
  renderer owns WGSL, resource layout and low-level mark inputs. Core's WebGPU
  adapter only translates encoders/properties to the documented renderer API.
- `webgpu-renderer/AGENTS.md` explicitly puts new renderer-generic capabilities
  before exposure through Core grammar. The unpublished package can change its
  API; update its actual consumers instead of keeping redundant compatibility
  aliases or adding adapter workarounds.
- Existing rule programs already own the projected endpoints, body extrusion,
  caps, dash atlas and instance ordering. Extend them. No CPU scene graph,
  per-datum objects, duplicate rows, offscreen composition or new rendering pass.
- Bounds/picking follow the same occurrence and border extent. The GPU shader
  builder already derives picking from `shade`; verify that actual route.
- Canvas/SVG and their shared immediate projection remain later consumers.
  Finishing #604 still requires native integration; it is not a prerequisite
  for a useful unpublished GPU proof.

Current source: `core/src/marks/rule.js` accepts `color`, `opacity` and `size`;
`core/src/rendering/webgl/marks/rule.{js,vertex.glsl,fragment.glsl}` and
`webgpu-renderer/src/marks/programs/ruleProgram.js` paint one body color.
`core/src/rendering/webgpu/webGpuMarkAdapter.js#createRuleConfig` feeds the same
low-level rule definition for rules and ticks. That shared caller must stay valid.

Comparable design: Vega-Lite uses ordinary rule line paint and positional
channels. #604 deliberately changes border semantics while retaining GenomeSpy's
`color`/`size` authoring. Reuse established channels and Porter–Duff paint algebra;
do not copy Vega's ordinary separate paint operations as proof of seamless GPU
composition. No third-party code is copied and no new dependency is proposed.

## Target shared contract

- Core property: `strokeAlign: "inside" | "center" | "outside" | ExprRef`.
  It is a mark property, not a new Core encoding channel.
- Width w means the entire painted band. Inner contraction / outer expansion:
  inside w/0, center w/2–w/2, outside 0/w.
- Existing paint names only: `fill`, `stroke`, `fillOpacity`, `strokeOpacity`,
  `strokeWidth`; `color` follows `filled` and explicit-paint precedence.
- New Core rule defaults: filled body, null stroke, width 1, outside alignment.
  Other families keep their current defaults until their verified rollout.
- Legacy point `inwardStroke` maps true→inside, false→center. Explicit/configured
  alignment wins. Resolve precedence before inserting defaults so a default
  center value cannot mask a legacy true expression. Do not ship this mapping
  until all affected point consumers use the canonical result.
- Nominal body geometry is independent of border visibility/width. Keep the
  existing thin-body treatment and common fade, and hide nonpositive sizes.
  A null/transparent border must reproduce the old body, including thin rules.
  Include a near-transparent stroke in the proof so a zero-alpha fast path
  cannot hide a body-coverage change at butt endpoints or fractional widths.
- Resolve premultiplied paint inside one fragment, with Ci <= Cf <= Co:

  ```text
  result = Ci*F + (Cf-Ci)*(S + (1-S.a)*F) + (Co-Cf)*S
  ```

  Apply common opacity/fade once after that result. CSS color alpha and each
  paint's own opacity contribute once. Keep the no-border fast path.

- Preserve occurrence ordering, conditional encodings and retained updates.
  Expand both end and side bounds; a wider centerline with unchanged butt ends
  does not implement a complete outside border.

One Core integration risk is already visible: `fixFill` and `fixStroke` currently
copy the general `opacity` into per-paint opacity when those channels are absent.
The new combined-paint contract requires a separate common factor. Reusing these
helpers unchanged would apply common opacity incorrectly. Resolve that ownership
coherently across affected consumers before Core exposure; do not add a rule-only
normalization mode, fold view opacity into both paints, or retrofit a second pass.
The first renderer-only proof avoids changing this existing Core contract.

## Proposed first PR: solid WebGPU rule ribbons

Tentative title: `feat(webgpu-renderer): add aligned borders to solid rules`.

Purpose: demonstrate and qualify the shared paint/alignment contract in an
existing GPU rule program, with real pixels and picking, before publishing new
Core grammar. This is usable independently through the renderer and its existing
Rules example; it is not an unused helper or a broad mark refactor.

Included:

1. Extend the renderer's rule inputs with fill/stroke paints, per-paint opacity,
   stroke width and alignment, retaining `size` and common `opacity` separately.
   Use the existing numeric style-input convention for low-level alignment;
   document inside/center/outside codes beside that contract. It does not add
   a Core alignment encoding. Start with a zero-width low-level border default
   so existing standalone configurations retain their appearance.
2. Replace the low-level body input `color` with `fill`. Update the Rules example
   and Core adapter's rule/tick translation in the same PR. Core still reads
   its existing `color` encoder; only the renderer destination key changes.
   Do not retain a second low-level alias or expose new Core paint properties.
3. Cover solid ribbons with all three existing cap styles and all three
   alignments. The bounded proof retains the original body quad and its native
   raster boundaries inside a fixed 3x3 perimeter mesh, instead of reconstructing
   hard body clipping from interpolated distances. This generates 54 vertices
   only for declared border geometry, in the same instanced draw; it creates no
   CPU vertex data, index buffers, extra passes or occurrence copies. Keep the
   original six-vertex geometry and original shading when no width input is
   declared. Specialize from immutable input structure, not the current value of
   a dynamic handle. Keep shape math local until a second actual consumer needs
   a shared helper. Inside/center behavior still needs implementation and proof.
4. Preserve existing unbordered dashed rules. For this preview, reject a
   non-empty `dashPatterns` table combined with any explicitly declared channel
   key `stroke`, `strokeWidth`, `strokeOpacity` or `strokeAlign`. Inspect original
   `config.channels` in `ruleMark.createProgram`, before constructing RuleProgram;
   BaseProgram allocates resources during construction. Normalized defaults are
   not declarations. An absent/empty table is allowed, and the presence of
   `strokeDash` alone is allowed: Core already sends that channel for plain rules.
   The declaration rule also rejects explicit zero/transparent values and
   scalar/series/conditional inputs; do not inspect initial values or add update
   interception. Even all-on patterns in a non-empty table take this conservative
   preview boundary. Document it and remove it when dashed borders are supported.
   Do not multiply a widened silhouette by the old binary dash mask or silently
   drop borders.
5. Use the same completed silhouette for border picking. Preserve original datum
   IDs, placement/clamp behavior and no-border geometry. Demonstrate retained
   scalar/series updates through existing handles.

Excluded: Core `strokeAlign` grammar/schema, Core rule normalization, WebGL,
Canvas/SVG, points/rectangles/arrows/text, dash-border geometry, resource framework,
new shader registry, generated schema churn and example-wide migrations.

### Expected files and size

Exactly ten expected delivery paths:

| Area                            | Paths                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| Renderer implementation         | `webgpu-renderer/src/marks/programs/ruleProgram.js`, `webgpu-renderer/src/marks/rule.js` |
| Low-level types and type checks | `webgpu-renderer/src/index.d.ts`, `webgpu-renderer/test-types/publicApi.ts`              |
| Real GPU checks                 | `webgpu-renderer/tests/rule-definition.gpu.test.js`                                      |
| Existing executable example     | `webgpu-renderer/examples/ruleScene.js`                                                  |
| Renderer docs/backlog           | `webgpu-renderer/README.md`, `webgpu-renderer/MIGRATION_PLAN.md`                         |
| Existing Core consumer          | `core/src/rendering/webgpu/webGpuMarkAdapter.js`, its adjacent `.test.js`                |

Paths above are relative to `packages/`. No App changes. The existing Rules
Storybook entry already runs this example, so a new story/runner is unnecessary.
The scene currently has one 2,000-occurrence dashed mark. It needs a separate
solid-bordered retained handle alongside that dashed handle, with ranges, updates
and cleanup for both. Budget this composition; do not remove the old dash example
or add border inputs to its dashed mark.

Concrete allocation after the bounded proof, **added raw lines**, excluding plans:

| Delivery area                                                      | Target allocation |
| ------------------------------------------------------------------ | ----------------: |
| Three runtime JS files, including factory guard and adapter rename |               160 |
| Low-level types and public type smoke                              |                20 |
| Permanent GPU regression additions in the existing rule test       |               225 |
| Core adapter regression additions                                  |                 8 |
| Two-handle Rules example                                           |                40 |
| Renderer README and migration backlog                              |                25 |
| Total allocated                                                    |               478 |
| Headroom before the 500-line review trigger                        |                22 |

This is a concrete allocation, not a claim that the future diff is exactly 478
lines. The disposable renderer proof currently changes one runtime file by
**+51/-7 formatted raw lines**; it only proves outside borders and keeps the old
body input name. Alignment inputs, paint-opacity separation, declaration checks,
renaming and examples still consume the remaining runtime allocation.

The formatted GPU draft is **173 lines**, actually executed at DPR 1/2. It includes
renderer creation/cleanup, texture readback, thin/reversed/minimum-length/cap and
zero-size rows, retained width/alpha updates, independently calculated expected
body pixels, and body/border picking. Its 52-line allowance to reach 225 is split:
20 for alignment/cap sample cases, 20 for inside/center translucent paint and
crossing/common-opacity cases, 12 for declaration-boundary checks. Reuse its
local capture setup; do not create a new helper framework or snapshot collection.
Keep the existing 63-line placement/picking test unchanged; it is not an added-line
cost. Existing clamp regressions are neighboring coverage, also unchanged.

The 173-line draft has no baseline dumps or performance runner. Those transient
qualification artifacts stay outside Git and supplement permanent regression
cases. Do not replace those permanent cases with assertions about WGSL strings,
private methods or the reference arithmetic alone. If integration of the missing
cases needs more than the allocation and 22-line headroom, stop and re-scope.

The limits remain **ten delivery files, 250 added non-comment production lines or
500 raw added lines**, excluding temporary plans. Do not compress tests, remove
meaningful coverage or raise these limits to fit. Exact added/deleted raw and
non-comment production counts are still required before opening a PR.

This limited unpublished WebGPU change needs no new Core release fragment if
published behavior truly remains unchanged. Reassess the full diff with the
changeset skill; Core's eventual public feature is a minor release per #604.
The old Canvas patch fragment must not be carried into this PR.

### Proof and delivery gates

The bounded nominal-body gate is passed for outside alignment on the tested
hardware. Keep the definition: `Cf` is the existing body coverage, including
clamped thin width, independent common fade, minimum length, cap treatment and
the original quad's hard boundaries. An inclusive interpolated endpoint test
failed, and an oriented half-open test still moved pixel-center boundary samples
as border width changed. No epsilon or tolerance increase was accepted.

The successful route preserves those original body triangles. Eight surrounding
mesh cells have zero fill contribution; the body cell retains the old body
interpolants. Resolve border and fill once in each covered fragment. Tighten
perimeter bounds to actual stroke growth plus longitudinal half-pixel AA; the
body already has transverse AA padding. Common fade/opacity remains a single
post-composition factor. Nonpositive-size rules remain hidden.

This proves body preservation and the outside composition under the legacy
thin-rule treatment; it is not a completed proof of all alignment semantics or
all GPU/driver precision behavior. Inside/center contraction and their empty
interiors remain gates. Do not change the nominal-body convention or migrate
Core opacity normalization while implementing them.

At this numeric low-level boundary, "no border" means the untouched default
zero width, explicit zero width, or transparent RGBA stroke—not a nullable paint
input. Core's later `stroke: null` grammar is normalized by Core. Do not introduce
nullable renderer channels to mimic that future grammar.

Qualify the geometry/paint change through the existing renderer API and
`tests/rule-definition.gpu.test.js` browser harness.
A JavaScript formula test, shader-string assertion or replacement shader is not
proof of the actual mark path. No GPU test skip counts as a pass.

- No-border pixel/picking comparisons with master, including dashed rules, caps,
  minimum length, fractional width, zero/negative size, placement and clipping.
- Size 4 + outside width 1 has a four-pixel nominal body and six-pixel total band,
  including both butt endpoints. Verify square/round caps and diagonal rules.
- DPR 1/2 and subpixel strokes: opaque internal coverage has no background seam;
  translucent/CSS-alpha strokes reveal the expected underlying fill. Compare
  premultiplied pixels against the issue's independently calculated formula.
- Null/zero/transparent borders reproduce the original nominal body. Verify
  overly wide/inside borders collapse the inner region without negative geometry.
  Preserve legacy thin-body fade; do not change it to make a screenshot pass.
- Crossing occurrences, common opacity, clip-edge border extent and picking
  preserve order/identity. Test retained paint/width/alignment changes without
  rebuilding per-datum geometry or uploading unchanged series.
- Border/dash declarations fail at the documented boundary. Existing Core rules
  and ordinary ticks continue through the adapter with unchanged output.
- Profile identical baseline/candidate no-border and bordered solid scenes with
  1,000 rules, DPR 1/2, five warmups and 30 paired samples. Include completed GPU
  work, frame time, draw count, uploads and retained allocations. No new pass or
  per-frame CPU buffers. No-border regression >10% and >1 ms is a review trigger.
  Present all results; do not infer cheap GPU work from submission time alone.
- Run focused GPU tests, Core adapter tests, both workspace type checks, lint,
  renderer build/tree-shaking checks and the existing Rules Storybook build.
  Reassess release impact, update the migration backlog and retire temporary
  plans by the repository workflow before merge.

If caps, thin-body compatibility or default picking cannot fit this geometry and
scope, stop before integration. Do not add a generic path/offset engine or quietly
reduce the contract. This is a proposed first PR, not a proven implementation.

## Subsequent milestones, not a fixed PR stack

Re-scope after the first GPU evidence; do not pre-author a large patch series.

1. **Complete GPU rule geometry.** Add true dashed-ribbon boundaries and phase,
   including cap ends, gaps and wide strokes; qualify WebGPU and implement the
   same contract in the existing WebGL rule delegate. Keep ticks unchanged and
   update GPU bounds/picking. Tentative commit: `feat(rendering): compose rule
ribbon borders in GPU shaders`. Verify crossings, zoom, clipping and existing
   unoutlined rules. No Core public property should be silently accepted by an
   unimplemented backend. No Canvas rectangle fix is a prerequisite.
2. **Expose the shared Core API in supported slices.** Introduce a shared type
   and property mixin; attach it only to mark families with working consumers.
   Normalize rule paints using existing helpers, retaining conditional definitions,
   shared color scale/legend identity, config precedence and expressions. Then
   implement the legacy point mapping and remaining filled-family consumers in
   independently verified slices. Do not advertise `strokeAlign` on a common
   props base while its other consumers ignore it. Tentative commit: `feat(core):
expose shared rule fill and stroke alignment`. Include types/schema, grammar
   docs/migration examples and the minor changeset with each released capability.
   Run composed headless spec→encoder/scale/layout checks and actual GPU tests.
3. **Native integration and remaining families.** Re-plan Canvas/SVG against the
   concrete GPU geometry and API, with an explicit support boundary before Core
   exposure. Retain the user's strict Canvas coverage/performance requirements
   and accepted native vector-SVG one-output-pixel hairline limit. Text preserves
   label ordering and the agreed original glyph contours; native font limitations
   remain unresolved. Tentative commit: `feat(rendering): align native stroke
geometry and exports`. Do not resurrect the abandoned rectangle compositor.

Final #604 qualification still requires every acceptance criterion: all filled
families and alignments, legacy inward strokes, shared scales/legends, ticks,
transparent/translucent/common opacity, caps/dashes, zero/thin marks, label order,
clipping/bounds/picking, cross-renderer/export evidence and matching docs/schema/
minor release notes. The proposed first PR completes only a small GPU subset.

## Branch and review discipline

The current branch contains the rejected Canvas implementation. Preserve it as
reference. Implementation must start on a fresh `codex/` branch from fetched
master and copy only this relevant plan; do not base the PR on the Canvas branch,
cherry-pick its implementation, or carry its tests/resources/changeset.

Only plan files are changed now. The user asked to see scope before code;
implementation is not started and no PR is opened. Two independent Sol reviews (`gpu_rule_architecture`, `gpu_rule_simplicity`)
checked this proposal against actual consumers and ownership. Both found the
renderer feature independently useful and the adapter rename appropriate; picking
already shares `shade`, so no picking bridge is needed. No additional explicit
rule color consumer was found beyond the Rules example and Core adapter.
Run existing rect-clamping scene/GPU checks too because they instantiate default
rules. No dependencies, shared geometry framework, compatibility alias or new
resource lifecycle is justified.

Review disposition: factory declaration rules, numeric no-border semantics and
the two-handle example are clarified above. The bounded nominal-coverage gate and
concrete evidence allocation are now recorded. The reviewers did not review the
new perimeter-mesh implementation; do not treat their earlier review as approval
of its geometry/performance tradeoff. Full feature qualification remains pending.

## Bounded GPU proof evidence (2026-10-27)

Freshly fetched master is `91ce56e30eeb08f30e63fca518935d386e7f00f1`.
Disposable baseline/candidate checkouts are under
`/private/tmp/genomespy-rule-body-proof/`. They use the real exported `createRenderer`
and `ruleMark`, existing series/value slots, normal/picking shaders and actual GPU
texture readback. No alternate shader is injected by the test, no CPU image is
substituted, no dependency is added, and no feature code enters this branch.

Chrome 156.0.8078.48 / Apple Metal-3, DPR 1/2: 150 occurrences per DPR (horizontal,
3:4 diagonal and reversed; three caps; fractional/pixel-center phases; widths
0.25/0.75/1 physical pixel and 4 logical pixels; minimum length 0/48; hidden zero/
negative neighbors). Thirteen border-width/alpha combinations per DPR give
**3,900 occurrence comparisons**. Zero-alpha and 1/255-alpha borders cannot hide
body geometry errors behind an opaque paint. Compare completed premultiplied
pixels with master plus independently computed outside coverage.

Final results: **zero changed fill bytes**, identical default six-vertex pixels,
maximum paint-oracle deviation **1.275/255**, no validation errors or skipped GPU
checks. The concrete GPU draft passes at both DPRs; existing rule placement and
neighboring mark-clamping GPU tests also pass: **4 tests passed, 0 skipped**.

Bounded performance: 800x400, five warmups, 30 alternating paired samples, CPU
submission through GPU queue completion (not submission alone). The 1,000-rule
scene has spaced 10px ribbons; the extra 100,000-rule diagnostic has densely
packed subpixel ribbons. Median/p95, milliseconds:

| Count   | DPR | Master default | Proof default (6 vertices) | Declared zero width (54) | Outside border (54) |
| ------- | --- | -------------- | -------------------------- | ------------------------ | ------------------- |
| 1,000   | 1   | 0.4 / 0.6      | 0.4 / 0.4                  | 0.4 / 0.5                | 1.0 / 1.1           |
| 1,000   | 2   | 0.6 / 0.7      | 0.5 / 0.6                  | 0.4 / 0.6                | 0.6 / 0.9           |
| 100,000 | 1   | 0.7 / 1.0      | 0.7 / 1.1                  | 2.0 / 2.4                | 8.2 / 8.5           |
| 100,000 | 2   | 1.8 / 1.9      | 1.8 / 2.0                  | 2.4 / 2.7                | 17.7 / 18.0         |

The default path is effectively unchanged in this run. Explicit dynamic border
capability has a cost even while width is zero; dense bordered scenes are not
free and the 100k DPR-2 case exceeds a 60fps frame budget before Core work. Keep
that limitation visible. Do not claim large-scene performance qualification from
the 1k result, or silently wire default Core rules to a dynamic border capability
in a later migration. No generic caching/batching framework is authorized to
answer the cost. Re-profile the actual first-PR candidate and its intended use.

Outside-Git evidence lives in this chat's `gpu-rule-body-proof/` artifacts:
`results.json`, `performance.json`, preserved failed `results-v1.json` and
`results-v2.json`, source/draft/runner copies and `manifest.json`. Raw readbacks
are diagnostics and must not enter the PR. Final feature checks still include all
three alignments, overlapping occurrence order and common opacity, retained
updates, declaration rejection, Core adapter compatibility, types/lint/build and
example/docs delivery. No first PR or full feature implementation is opened here.

Sources: [issue #604](https://github.com/genome-spy/genome-spy/issues/604),
[Vega-Lite rules](https://vega.github.io/vega-lite/docs/rule.html),
[Porter–Duff composition](https://www.w3.org/TR/compositing-1/#porterduffcompositingoperators).

## First slice implementation (2026-10-28)

Fresh-master base: `91ce56e3`. The old Canvas branch is reference only.
Implement the existing renderer rule program and its direct consumers within
the ten-file / 500-added-line delivery budget. No new dependencies.

- [x] Renderer paints, alignment, cap geometry and declaration boundary.
- [ ] Actual GPU regression tests, Core adapter and retained Rules example.
- [ ] Types, lint, builds, release assessment and exact delivery diff counts.
- [ ] Two independent Sol implementation reviews; resolve findings before PR.

The perimeter mesh is the bounded proof's local implementation, not a shared
geometry abstraction. Its unchanged default six-vertex path and declared-border
cost must remain explicit in docs and final review.

First implementation checkpoint: actual DPR-1/2 thin-body, aligned butt borders,
square/round ends, collapsed inset, translucent paint composition, crossed draw
order, retained scalar/series changes and border picking pass. The adjacent Core
adapter suite passes all 74 tests. Renderer type checking passes. The GPU test
allocation grew beyond 225 lines; runtime is smaller than allocated, and the
overall 500-line gate remains unchanged. No release fragment is required for
this unpublished renderer and experimental adapter-only change.
