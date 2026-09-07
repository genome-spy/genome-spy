# Selection-union conditional predicates

Related issues: #507 (this implementation), #517 (future predicate extension).

## Goals and scope

Support a flat, nonempty union of named selections in conditional encodings:

```json
{
  "color": {
    "condition": {
      "test": {
        "selection": { "or": ["svSelect", "svRegion"] },
        "empty": true
      },
      "field": "svType",
      "type": "nominal"
    },
    "value": "#cbd2d6"
  }
}
```

The condition matches when `(empty && all selections empty) || any membership`.
Empty selections contribute false to membership. With the default `empty: true`,
all-empty groups use the field/scale branch; otherwise only selected rows do.
With `empty: false`, all-empty groups use the fallback.

Keep existing condition-level `param` and its `empty` semantics. `param` and
`test` are mutually exclusive. In the new form, `empty` belongs inside `test`;
reject condition-level `empty` with `test`. Reject malformed tests, empty lists,
non-string members, and unsupported selection kinds explicitly. Deduplicate
repeated names without changing semantics. Preserve lazy CPU initialization and
scoped parameter resolution.

Support Core CPU encoders (Canvas2D/SVG), WebGL, and WebGPU. Do not add field
comparisons, arbitrary Boolean composition, expressions, GPU filter grammar,
multiple nonconstant branches, or new selection types. No application changes
or WebGL implementation of #517's future quantitative predicates are intended.

## Architectural grounding and decisions

- Core `encoder/encoder.js` creates ordered accessor/predicate branches and
  rejects multiple nonconstant accessors. Keep this model and its scale mapping.
- Add a small structured selection predicate representation plus shared leaf
  enumeration, normalizing legacy single selection and the new union where
  useful. Leave an explicit kind boundary for future predicates without
  implementing a general expression framework.
- Audit predicate consumers, including `marks/mark.js` rendering revisions,
  CPU exports, selection resource discovery, and semantic-zoom membership.
  Export one shared selection-name traversal and use it in these consumers,
  `rendering/immediate/linkFading.js`, and WebGPU adapter translation.
  Update `view/gridView/gridChildLegends.js` to recognize group-level emptiness
  when selecting inactive legend styling.
- WebGL `rendering/webgl/marks/webGlMark.js` owns selection uniforms/textures;
  `gl/glslScaleGenerator.js` emits conditional branch tests. Reuse per-selection
  resources, add explicit emptiness checks, and emit the group Boolean test.
- Core's `rendering/webgpu/webGpuMarkAdapter.js` translates to a renderer-generic
  selection-union contract. The renderer must not import Core grammar/types.
- Extend renderer condition validation, resource discovery, and WGSL emission
  through its public API. Share suitable selection traversal with visibility
  predicates. Support the same union node in renderer visibility predicates
  so semantic-zoom bypass preserves the new partial-interval membership
  semantics. Core gains no new public GPU-filter grammar.
- The renderer condition `when` accepts its existing single-selection form or
  `{ selectionUnion: [leaf, ...], empty?: boolean }`. Each leaf identifies a
  selection and its fixed kind/interval targets; leaf-level `empty` is not
  accepted inside a union. The union defaults `empty` to false like the existing
  renderer contract; Core always passes its resolved default explicitly.
  This node means selection union, not arbitrary Boolean OR.
- Renderer conditional scale/value slots currently use `when.selection` as a
  key. Replace this assumption with zero-based indices in `channel.conditions`
  (e.g. `handle.scales.fill.conditions[0]`) in the public slot
  contract and update all adapter, test, story, and documentation consumers.
  The unpublished renderer does not need a legacy slot compatibility path.
- Preserve semantic zoom's actual-membership aggregate: an empty union that
  matches its color branch must not exempt every point from semantic zoom.
- Parameter changes must reuse data buffers and existing selection resources
  where applicable; no synthetic union texture or CPU row mask is needed.

Vega-Lite's local `tmp/vega-lite/src/predicate.ts` and `logical.ts` separate
predicate leaves from composition. Borrow this design direction, not its code
or expression compilation. Its per-leaf `empty` does not express our all-empty
union rule. Source: https://github.com/vega/vega-lite/blob/main/src/predicate.ts.
No third-party implementation is copied. Future operators can use the familiar
field comparison grammar described in #517 under `test`.

## Risks and boundaries

- Interval selection emptiness and partial dimensions differ in existing CPU
  and GPU implementations. For the new union, define empty as all configured
  dimensions inactive; active dimensions constrain membership while inactive
  dimensions impose no constraint. All-inactive membership is false. Preserve
  legacy single-selection behavior; test the new contract across backends.
- Preserve existing interval target and mark hit-test semantics (including
  ranged marks) rather than implementing an unrelated selection overhaul.
  Explicitly resolve any mismatch that prevents union parity for supported marks.
- Track all group members for resource updates and repaint requests, including
  clearing the last active selection and restoring scoped selections.
- Reject unsupported grammar at a shared boundary, even if a renderer would
  otherwise ignore it. Schema/types must agree with runtime validation.
- Conditional branch slot migration must cover dynamic scale/value changes,
  multiple branches, and repeated references to the same selection.

## Milestones

### M1: Core grammar and CPU semantics

- [x] Add public types/schema and normalized predicate metadata/evaluation.
- [x] Update shared dependency discovery and CPU consumers.
- [x] Verify all-empty/one-active/both-active, `empty: false`, legacy shorthand,
  malformed grammar, duplicate names, scoped dependencies, and interval cases.
- [x] Add generated-schema acceptance/rejection tests in `spec/schema.test.js`
  covering mutual exclusion, misplaced `empty`, and malformed union groups.
  Add regressions for immediate link fading and inactive legend styling.
- [x] Update user-facing conditional-encoding documentation and regenerate the
  schema using the repository workflow; read the documentation skill first.
- Commit: `feat(core): add selection-union conditional predicates`

### M2: WebGL union compilation

- [x] Enumerate leaves, deduplicate resources, emit empty and membership tests.
- [x] Preserve actual-membership semantic zoom and existing branch/scale logic.
- [x] Test generated GLSL and representative selection updates; run focused
  Core checks and verify legacy consumers still work.
- Commit: `feat(core): render selection-union conditions with WebGL`

### M3: WebGPU renderer and Core adapter

- [x] Add the generic union condition API, validation, resource discovery, and
  WGSL generation; migrate conditional slots to branch indices.
- [x] Translate Core groups and update resource bindings/semantic zoom.
- [x] Test union truth table, partial intervals, invalid input, deduplication,
  live selection updates, and dynamic conditional scale/value slot updates.
- [x] Update renderer README and a focused renderer-generic Storybook example.
- Commit: `feat: render selection-union conditions with WebGPU`

### M4: Integration verification and final review

- [x] Add a small self-contained point-plus-interval example (follow
  `examples/README.md`) demonstrating the scale color and gray fallback.
- [x] Exercise initial emptiness, point selection, brush selection, their union,
  and clearing each selection in both GPU backends. Include ranged/link marks
  representative of #507, CPU conditional-color export parity, and existing
  GPU point semantic-zoom membership bypass coverage. Do not change the existing
  CPU point renderer's separate semantic-zoom behavior.
- [x] Use the browser-debug skill for live checks and view-testing skill if
  structured export/layout testing is appropriate. Run relevant GPU tests,
  Core/renderer typechecks, lint, schema checks, and Storybook build.
- [x] Review the final diff and downstream consumers, fix actionable findings,
  rerun affected checks, and record evidence and any actual limitations below.
- Commit: `test: verify selection-union rendering across backends`

## Review gates and delivery

Luna (xhigh) reviews this plan before implementation, focusing on shared
contracts and downstream consumers. Revise and commit the plan first. Luna
(high) implements milestones, verifies them, and commits after each milestone.
The primary agent performs the final implementation review and integration
audit. Apply correctness and simplification fixes before finishing.

Record completed tasks in the plan with milestone commits. Retain the reconciled
plan on this branch; remove it in a later commit before a future PR or merge.
No PR, push, or merge is requested here.

## Evidence and unresolved questions

No user input is required. Plan review may refine the internal representation
and interval implementation while preserving the public scope and semantics.
Verification results and review resolutions will be recorded during work.

Implementation evidence:

- M1 `bbb1a70ec`: Core schema, lazy CPU union predicates, link fading, legends,
  docs, and schema tests. Core typecheck and 67 focused Core tests passed.
- M2 `fc9e21fe1`: WebGL union resources, membership/emptiness GLSL, and shader
  tests. Legacy shader snapshots and focused WebGL tests passed.
- M3 `014320f5f`: WebGPU renderer contract, WGSL union visibility and channels,
  indexed conditional slots, Core adapter translation, and overlap regressions.
  Core/renderer typechecks and 148 focused unit tests passed; Chrome WebGPU
  readback covered union values, all-empty behavior, visibility, and interval,
  single, and multi selections.
- M4: `examples/core/selection/selection_union.json`, SVG all-empty export
  coverage, and renderer Storybook scene. Core examples (198 tests), WebGL and
  WebGPU browser smoke checks, WebGL/WebGPU comparison, and Storybook build pass.
  Live browser interaction checks covered initial emptiness, point and brush
  activation, union behavior, and clearing each selection in both backends.
- The implementation keeps the existing CPU point semantic-zoom behavior
  separate and leaves quantitative test predicates out of scope.

Luna's plan review identified the immediate link-fading and legend consumers,
requested concrete renderer union and indexed-slot contracts, and called for
schema rejection tests and explicit partial-interval semantics. All findings
are incorporated above. The existing CPU semantic-zoom limitation is excluded.

Baseline: Core typecheck passes; focused encoder/adapter tests pass (75 tests);
the WebGPU renderer unit suite passes (232 tests). Before implementation, the
encoder, WebGL mark, WebGPU adapter, and WGSL builder total 5,615 lines. Measure
the final focused diff and reconsider unnecessary complexity during review.


Primary final review:

- Fixed resource discovery for unions used only in renderer visibility trees;
  conditional channels had previously masked the missing registration.
- Reject ambiguous and nested renderer union nodes at validation, and cover
  null leaves. Updated the Core surface test to use indexed conditional slots.
- Added Canvas2D/SVG link-fading coverage for union endpoint membership and
  partially active intervals, plus inactive legend symbol fallback coverage.
- Live WebGL and WebGPU checks passed for point/brush unions and ranged links:
  an interval crossing only a link interior does not match endpoint hit testing;
  a selected second endpoint does. Point selection and brush membership combine,
  and clearing the last selection restores all scale colors.
- Final full unit suite: 471 files passed, 4,048 tests passed, one skipped and
  two todo. All seven Chrome GPU selection tests passed. Workspace typechecks
  and lint passed after correcting the legend fixture's tuple annotation.
- The four measured implementation files total 5,840 lines, up 225 from 5,615.
  Growth supports explicit group emptiness and preserved legacy interval behavior.
  Review removed duplicate interval shader generation and per-row allocations;
  no general predicate engine or quantitative grammar was introduced.
- All review findings are resolved. No further implementation work is pending.
