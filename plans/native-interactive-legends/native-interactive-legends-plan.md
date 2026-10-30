# Native interactive legends

Status: implementation complete and automatically verified; reconciled for retirement.
User-owned manual testing is tracked as a PR follow-up.

Branch: `codex/native-interactive-legends`, rebased onto master at `bb361bfc7`.
This includes categorical point selections (#614) and WebGPU picking parity (#636).

## Outcome and scope

Implement [#609](https://github.com/genome-spy/genome-spy/issues/609): categorical
symbol legends become input sources for existing category point selections.
Selecting cell type and activation state in two legends highlights their
intersection through ordinary authored predicates. Each legend displays only
its own selection's membership. API changes, undo/redo, and bookmark restoration
update the same state and feedback.

The public addition is `bind: "legend"` on a categorical point parameter:

```json
{
  "name": "cell_types",
  "select": { "type": "point", "encodings": ["shape"] },
  "bind": "legend"
}
```

Support shape and normalized color/fill/stroke symbol legends from the outset.
Categorical x/y point selections remain supported by the prerequisite, but axes
are not symbol legends: binding them without a corresponding supported legend
must fail. Binding does not inject chart opacity, filters, or domain policies.

Not included: gradient/quantitative legends, record or interval binding,
multi-channel projections, field-based bindings, object-valued legend binding,
custom legend click streams, automatic chart highlighting, or keyboard navigation.
Do not port the PoC's ordinary array parameter, focus mirrors, or alternate grammar.

## Architecture check and existing code

Core owns grammar, scoped selections, legend generation, and input dispatch.
Renderers own picking and retained resources. App already persists category
selections; the agent already accepts their payloads. No new selection value,
persistence format, App action, or membership resource is needed.

| Contract                              | Current owner and implication                                                                                                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parameter classification and defaults | `packages/core/src/paramRuntime/paramUtils.js`, `viewParamRuntime.js`, and `selection/selection.js`. `isSelectionParameter` currently rejects every parameter with `bind`; update that shared guard and audit its callers rather than introducing a legend-only classifier. |
| Category updates and predicates       | `selection/categorySelection.js`, `selection/selectionPredicateTree.js`. Reuse `updateCategorySelection`, `clearPointSelection`, typed raw values, and existing CPU/GPU membership.                                                                                         |
| Plot source participation             | `view/unitView.js` installs handlers from local declarations. Keep explicit participation; an ancestor parameter alone must not activate descendant input.                                                                                                                  |
| Semantic legend identity              | `scales/legendResolution.js` emits definitions with contributor view and exact scale resolution. `getLegendDefs` can deduplicate shared scales and merge shape into a color legend; inspect contributors before that information is lost.                                   |
| Placement versus scope                | `view/gridView/legendCollection.js` preserves semantic resolution while collection changes layout. `gridChildLegends.js` passes `definition.view` as the legend's data parent and already scopes styling expressions to their contributors.                                 |
| Generated guide lifecycle             | `view/gridView/guideViewSync.js`, `view/legendView.js`. Startup and dynamic guide refresh share these hooks. Generated chrome is nonaddressable and does not contribute domains or generate guides.                                                                         |
| Entry geometry and identity           | `data/transforms/packLegendLabels.js` produces entry bounds; `data/sources/lazy/legendEntriesSource.js` keeps raw `value` separate from formatted `label`. Reuse both.                                                                                                      |
| Input and picking                     | `genomeSpy/interactionController.js` and `utils/interaction.js` own renderer-neutral delivery. `LegendView` and `LegendRegionView` currently disable picking; mark picking also gates record identity.                                                                      |
| Rendered feedback                     | Existing conditional encoders, WebGL membership textures, WebGPU integer-set inputs, Canvas, and SVG already implement category predicates. Labels lack the categorical input that symbols already encode.                                                                  |

The baseline `legendView.js` is 1,678 lines and `unitView.js` is 463 lines.
These are context, not a size budget. Measure runtime and test changes separately
at each implementation milestone and review growth against the native contract.

## Design decisions

### 1. Bind declarations to semantic legends once during guide preparation

Resolve each explicit `bind: "legend"` declaration using its declaring scope's
categorical component, actual parameter ref, and actual scale resolution.
Do this alongside existing guide resolution, before generated children initialize.
Avoid independent resolution during rendering or per-entry interaction.

Use a small binding descriptor passed into legend creation: the canonical
selection owner/ref, logical component, normalized selection settings, and target
scale. This describes a connection, not copied selection state. Prefer existing
resolution members and guide arguments over a persistent global binding registry.

Multiple declarations contributing to one shared legend must resolve to the same
selection ref. Deduplicate compatible outer aliases by ref identity; reject two
different refs competing for one legend. One ref may drive several compatible
legends. Independent legends stay independent unless local declarations explicitly
push to a compatible outer selection.

An ancestor binding needs one unambiguous scale/legend in its scope. Do not search
independent descendants and select the first field/name match. Detect disabled or
missing legends even if no generated legend view will be constructed. Include
merged color/shape legends: a shape binding can target the merged symbol legend,
but separate color and shape refs cannot both own that one legend.

Collection must not change the descriptor's owner. Start with the semantic data
parent already preserved by `gridChildLegends.js` and `getParamRef()`, which
resolves compatible outer aliases to their canonical ref. Preserve lexical
shadowing and existing scale/style scope. Do not change layout parents or mirror
values to make name lookup work. A new alias API is not part of the initial design.
Before adding one, demonstrate an exact shared-contributor composition that the
existing scope chain cannot represent, then add only the missing owner-bound
primitive and its focused regression. No binding framework or parallel alias paths.

### 2. Preserve native defaults and keep input sources explicit

Keep authored `select.on` available when deciding whether to install plot input;
`asSelectionConfig` currently fills in click and must not erase that distinction.
Derive participation from the authored parameter at wiring time rather than
storing another mutable source-policy object.

Derive plot handler installation and picking participation from this same rule.
`Mark.isPickingParticipant()` currently treats any local point declaration as an
input source, which in turn enables record identity through
`requiresRecordIdentity()`. A legend-only category declaration with `tooltip: null`
must not allocate chart picking IDs or attributes. One real-spec test should
verify that explicit plot input restores picking and an independent record
selection still gets the identity it needs. Keep capability discovery and public
selection APIs independent of whether a plot is an input source.

| Configuration or event              | Required behavior                                                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Legend binding, omitted `select.on` | Only legend entries are input sources; no default plot update or clear handler. Native click default still makes toggling enabled.     |
| Authored `select.on`                | Add plot input with the existing event/filter semantics. Legend updates still use click.                                               |
| Entry click / Shift-click           | Replace / toggle using the shared category update operation and normalized `toggle`. With `toggle: false`, both replace.               |
| Default double-click                | Clear only this entry's bound selection.                                                                                               |
| `select.clear: false`               | No gesture clearing; API clearing remains available.                                                                                   |
| Custom `select.clear`               | Apply existing event/filter parsing at this legend's entry targets and explicitly enabled plot input. Outside-entry events do nothing. |
| Other legend, title, padding        | Do not update or clear this selection.                                                                                                 |

An authored plot hover event keeps its existing single-value toggle default.
For mixed hover and multi-category legend input, explicitly use `toggle: true`:
hover replaces; legend Shift-click toggles. Do not add special hover defaults.
Check conflicts where update and clear use the same event against the existing
point-source ordering rather than silently creating a second policy.

Wire the adapter to the existing category update/clear operations and
`createEventPredicate`. Do not duplicate tuple validation, Set membership logic,
or a full point-interaction controller. Route entry input so an enabled plot
source cannot also consume the same event. Do not depend on a stale global hover
datum, distinguish sources by display names, or delay clicks to detect double-click.

### 3. One reliable entry hit target, independent of appearance

Generate one invisible rectangle per entry from packed entry bounds, spanning
the symbol, label, and whitespace between them. It carries the raw entry datum
and is the only interaction target for that entry; symbols/labels remain visual.
Titles and outer padding remain inert. Dimmed entries remain pickable.

Enable picking through the existing legend and legend-region ancestry gates
only for bound legends. Keep generated targets out of user view addressability,
domain contributions, tooltip content, and inherited chart selections. Picking
IDs for small entry targets are legitimate; chart-sized record IDs are not needed
merely because a legend-bound category selection exists.

Use ordinary transparent rectangles on WebGPU. The renderer's mark-specific hit
coverage ignores paint opacity while retaining shape boundaries, matching WebGL
(#636). No picking mode or Core-side hit-geometry flag is needed. Verify the
default renderer behavior and real legend gestures without DOM overlays or
access to renderer private state.

Async click and double-click picks must dispatch selection effects in native
event order. Test reversed pick completion before modifying the controller. If
necessary, order only pick-dependent discrete dispatch in `InteractionController`,
preserving synchronous delivery, hover coalescing, scene invalidation, and disposal.
No legend-local timers, click recovery, retries, or general event scheduler.

### 4. Use conditional encodings for feedback

Generated symbols and labels use an ordinary category predicate for the bound
logical component and the entry's raw `value`. Empty membership shows all entries
normally; selected entries keep their normal appearance; other entries multiply
their resolved base opacity by 0.35.

Build feedback after existing representative-style selection and legend overrides
in `gridChildLegends.js` / `createSymbolLegendSpec`. Preserve reactive opacity,
fill/stroke opacity, configured label styling, and the legend's normal styling
precedence. Do not copy the chart's compound condition into a legend or replace
its base opacity with fixed 1/0.35 constants.

Symbols already encode raw categories. Reuse their categorical input. Labels need
one nonvisual raw-category input without replacing their label color or encoding
the same categorical attribute twice. Keep the bridge internal to generated
units and predicate input resolution: logical component to existing field/scale
input, using the same resolved predicate representation as authored marks.
Do not expose arbitrary-field `project` grammar or add a second predicate compiler.
Use WebGPU's existing nonvisual scalar `inputs` contract for label categories.
`packages/webgpu-renderer/tests/input-set.gpu.test.js` already verifies a `u32`
input driving conditional color through native multi-selection membership;
no renderer predicate extension is needed. Only Core's generated-unit input
bridge needs to be added. WebGL must likewise reuse its attribute deduplication
and membership resources.

State remains solely in the native selection ref. Normal propagation drives
encoders and exports; no legend-specific appearance subscriptions or focus arrays.
Unbound legends retain their existing behavior and resource costs.

## Alternatives and provenance

- [Vega-Lite legend binding](https://vega.github.io/vega-lite/docs/bind.html#legend-binding)
  provides the established single-projection, symbol-legend, opt-in direct-input
  model. Its [compiler](https://github.com/vega/vega-lite/blob/main/src/compile/selection/legends.ts)
  separates entry input from direct manipulation. Reuse those semantics, not its
  scenegraph signal plumbing. GenomeSpy already has typed raw selection state
  and a different view/rendering architecture.
- [PoC #605](https://github.com/genome-spy/genome-spy/pull/605) and its
  [initial native-selection commit](https://github.com/genome-spy/genome-spy/commit/6263d500b0a6f4b917a162b09092d8be37bf75a6)
  provide interaction/layout evidence. Do not cherry-pick the combined projection
  implementation or the later array-binding design; #614 supplies membership now.
- A new focus array, hand-written membership expressions, a global binding service,
  or generic source-policy framework would duplicate existing ownership and is
  rejected. Per-symbol and per-label handlers would duplicate targets and are
  unnecessary when entry bounds already exist.
- Renderer-neutral geometric entry testing through existing legend routing and
  packed bounds could avoid GPU hit geometry. It is a plausible native view path,
  but does not by itself establish the issue's required WebGPU hit-region picking
  contract. Keep the small renderer hit-target approach; do not silently replace
  that requirement with a backend fallback.

No third-party implementation is copied by this plan. Vega-Lite is BSD-3-Clause
([license](https://github.com/vega/vega-lite/blob/main/LICENSE)); this repository
and the in-repository PoC are MIT. If implementation closely adapts external code,
retain its license notices and add a durable provenance comment at the adaptation.

## One implementation milestone, with internal checkpoints

Outcome: bound categorical legends provide native input and feedback together,
with correct scope, retained chart resources, and consistent renderer behavior.
Deliver one complete feature commit; do not ship an input-only intermediate
feature or repeat the final backend verification at each checkpoint.

1. Build a complete two-legend slice: `bind?: "legend"`, shared classification,
   the derived participation rule, semantic binding, one entry target, generated
   category inputs, and conditional opacity composition. Reuse native updates,
   existing membership, and WebGPU scalar inputs. Keep structural validation in
   JSON Schema and resolved scale/legend/ref checks at the guide boundary. Prove
   input and feedback together on WebGL, WebGPU, Canvas, and SVG early.
2. Extend real-spec coverage to shared scales with outer aliases, independent
   collected legends with shadowed names, merged color/shape, and meaningful
   rejection boundaries. Cover explicit plot input, mixed hover, custom filters
   and clearing, invisible targets, and reversed async pick completion. Change a
   renderer/controller contract only where a focused failure demonstrates the
   missing capability. Verify reactive base style, typed values, duplicate labels,
   domain updates, API writes, undo/redo, bookmark restore, and brush/record
   coexistence. Audit App callers of the shared classifier; preserve payloads.
3. Finish the polished synthetic immune-cell example, mixed-input supplemental
   spec, grammar docs, generated schemas, and Core minor changeset as part of the
   same feature. Reuse synthetic fixture data where practical and follow
   `examples/README.md`. Document the workflow in `docs/grammar/legend.md` and
   cross-link parameter docs. Use the docs, changeset, and generated-view testing
   skills when applicable. Run the final integration checks below once the
   complete change is ready.

Tentative commit: `feat(core): bind categorical legends to native point selections`.
Keep a renderer/controller fix separate only when it is independently useful.

## Final acceptance and verification

- Two-legend example: T cell plus activated highlights activated T cells only;
  Shift-toggling B cell preserves activation selection, and changing activation
  preserves the complete selected cell-type set.
- WebGL and WebGPU real gestures work on symbols, labels, whitespace, and dimmed
  entries, including rapid click/double-click and input switching between legends
  and explicitly enabled plots. Canvas interaction and SVG appearance agree.
- Linked/collected views preserve exact selection and scale identity; shadowed
  names cannot redirect input. Removed/replaced subtrees dispose listeners,
  aliases, pick targets, and retained resources through the existing lifecycle.
- An independent record selection and positional brush retain membership/counts;
  category focus does not change semantic-zoom sample membership.
- Extend the existing renderer integration harness and retained-update probe.
  Repeated focus changes on a large point chart must show zero chart geometry
  uploads, record scans, dataflow replay, sample changes, or pipeline rebuilds;
  only bounded guide/selection updates are permitted. Explicit filtering remains
  an ordinary authored dataflow operation with its normal domain effects.
- Keep existing stable noninteractive legend tests. Assert semantic output and
  observable interactions, not large snapshots of generated spec internals.
- Run focused Vitest suites with `--reporter=agent`, native browser integration,
  workspace type checks, lint, schema/docs freshness and release checks. Broaden
  tests only for concrete shared-path risks. No new benchmark framework.

## KISS review and implementation decisions

The requested independent review focuses on minimum machinery, not speculative
extensibility. Check particularly whether owner aliases, the generated label
input bridge, hit geometry, and event ordering can reuse existing contracts more
directly. Every added helper or stateful structure needs one concrete caller.
Do not trade away the issue's shared/collected ownership or WebGPU requirements
to reduce line count.

The two implementation questions are resolved:

1. Generated labels add one internal `Mark.nonvisualInputs` categorical field.
   Its definition lives in the normalized encoding; a set tracks input names.
   WebGL includes it in ordinary geometry/attribute generation; Core's WebGPU
   adapter translates it to the renderer's existing scalar inputs. Symbols reuse
   their existing category channel. Both use native conditional predicates and
   membership resources. The existing `registerScopedExpression` represents the
   owner-bound alias, including shared-contributor shadowing; no alias API or
   mirrored selection state was necessary.
2. Master's `15e596ad9` (#636) provides WebGL-compatible WebGPU hit coverage,
   independent of paint opacity. Rebasing drops the temporary geometry-picking
   prerequisite and removes its Core flag and adapter hook. Transparent legend
   entries now use the renderer's default picking contract; this branch adds no
   renderer API, picking shader, or redundant renderer regression test.
   Native browser checks also exposed asynchronous event/pick ordering: interactions
   now carry their own picked mark and discrete effects preserve input order while
   readbacks remain concurrent. Ordinary synchronous delivery and hover coalescing
   remain intact. Custom clear events without renderer picks hit-test the same
   packed entry bounds, avoiding stale hover; click and double-click use renderer
   picking on every supported backend.

Independent KISS review completed on 2026-10-30 with no blocking findings.
Applied all four recommendations: select existing WebGPU scalar inputs, derive
plot handlers and picking together, require an actual scope failure before a new
alias primitive, and combine delivery into one complete feature milestone.

## Completed milestone and evidence

- [x] Complete legend input and native conditional feedback, with one semantic
      binding descriptor and one transparent target per entry.
- [x] Shared and collected scope ownership, shadowing, merged legends, explicit
      plot input, filtered hover/clear, single-value mode, disabled clearing, typed
      values, domain changes, and reactive style covered through real-spec tests.
- [x] API/history/bookmark integration uses existing category values and the
      existing App provenance test. No persistence format or agent payload changed.
- [x] Documentation, synthetic two-legend example and inspected PNG, mixed-hover
      supplemental spec, schema validation, and Core minor changeset included.
- [x] Final KISS review: no separate membership engine, focus array, alias API,
      source-policy state, subscriptions, DOM overlay, or legend-local event scheduler.
      The runtime addition is concentrated in semantic binding, native feedback
      wiring, entry picking, and the renderer-neutral event/pick contract.
      Initial feature commit in Core runtime JavaScript: +442/-47, net +395 raw lines,
      including comments and blank lines, excluding tests and specification types.
- [x] Full unit suite: 571 files passed; 5,428 tests passed, one skipped and two
      todo. Subsequent focused checks cover the final edge-case additions: 564 tests
      across eight files passed, including examples/schema validation and existing
      shader/geometry coverage.
- [x] Native browser integration on Canvas, WebGL, and WebGPU at DPR 1 and 2:
      symbols, labels, whitespace, Shift-toggle, double-click clear, independent
      membership, inert title/plot events, native raster opacity, and SVG agreement.
      Master's picking-coverage GPU test verifies transparent hit surfaces, shape
      boundaries, minimum point picking size, and clipping independently.
- [x] WebGL/WebGPU 100,000-row retained-update probe: 12 selection changes cause
      zero chart geometry uploads, collector completions, series extractions, or
      pipeline rebuilds. Record and brush values and semantic samples stay unchanged.
- [x] Workspace TypeScript, lint, schema and agent artifact regeneration,
      documentation type freshness, and release checks. The Core minor fragment
      advances the fixed release group to 1.3.0.
- Discarded from the implementation task list: user-owned manual testing,
  including the supplemental mixed-hover example. Track it as a PR follow-up.

The subsequent KISS review fixes reject inconsistent clear settings on a shared
legend, retain equivalent normalized bindings once, use packed pixel bounds for
unpicked custom clears, and remove duplicated nonvisual-input storage. The
duplicate picking-ID assertion is removed while its dedicated regression stays.
Verification after these fixes: 251 focused tests, Core types, lint, and release
checks pass. Native browser integration passes on all three backends at DPR 1
and 2, including retained updates. The browser check now waits for the canvas's
loading transition before reading entry coordinates, correcting a demonstrated
startup click race in the test.

Rebase verification on `bb361bfc7`: 347 focused tests, all workspace type checks,
lint, and release checks pass. Native legend checks pass on Canvas, WebGL, and
WebGPU at DPR 1 and 2, including retained updates; master's picking-coverage GPU
tests pass at both pixel ratios. There is no remaining diff in the WebGPU
renderer package. Runtime impact against this master is +371/-41, net +330
non-comment JavaScript lines in Core, excluding tests and declaration files.

The implementation tasks are complete. Preserve this reconciled plan in branch
history and remove it from the PR diff in the next cleanup commit.
