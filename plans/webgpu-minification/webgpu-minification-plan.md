# WebGPU renderer simplification and minification

Status: implementation in progress; milestone 1 complete.

## Goal and scope

Remove unused CPU paths and duplicate decisions in the unpublished renderer,
then use native JavaScript private members where ownership is local to a class.
Document real subclass contracts with JSDoc `@protected`. Preserve public
renderer behavior, Core integration, resource reuse, picking, text effects,
development oracle comparisons, and all vertex/fragment shader formulas.

The user requested a plan commit followed by one commit per milestone. Work
starts at `dca83c3ae` on `codex/webgpu-minification`. Core is the sole production
consumer, but public imports and custom mark/scale definitions remain usable.

Architecture references: `ARCHITECTURE.md`,
`packages/core/docs/architecture/rendering.md`, and the renderer's `AGENTS.md`.

## Decisions and guardrails

- Delete unreachable implementations before introducing abstractions. Share a
  helper only when it removes repeated logic and has fewer moving parts.
- Use `#private` for state and helpers accessed only by their declaring class.
  Preserve methods deliberately overridden by subclasses as `@protected`.
  Members used by peer modules are package internals, documented `@internal`;
  do not mislabel them protected or add forwarding accessors solely to hide them.
- Native private members are safely renamed by the installed esbuild. Existing
  bundle checks target ES2022, so no WeakMap-based lowering is required. This
  follows JavaScript private-element semantics and esbuild's normal minification,
  rather than broad unsafe property mangling.
  References: <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Private_elements>
  and <https://esbuild.github.io/api/#mangle-props>.
- Preserve the timing of overridden constructor hooks. Subclass fields and
  methods reached during `super()` cannot use native privacy because subclass
  branding has not occurred. Keep those ordinary members and their assignments
  in the hooks; subclass field initializers would overwrite hook-populated state.
  Use `@protected` for subclass contracts and `@internal` for hook-managed local
  state. Do not introduce two-phase construction solely for minification.
- Test real construction instead of fabricating branded objects with
  `Object.create`. Use one small constructor factory with existing GPU fakes;
  prohibit test-only getters, private-name reflection, and a mock framework.
- Preserve input validation, numeric representation, typed-array aliasing,
  batching, GPU lifetime, atlas growth notifications, and device-loss handling.
- Replace tests of retired internals with representative public/resource
  behavior assertions. Keep tests for algorithms and failure boundaries.
- Do not rewrite shader math, replace the MSDF implementation, remove features,
  introduce dependencies, or move Core grammar into the renderer.
- Defer the broader scale-pipeline rewrite and benchmark instrumentation move:
  their payoff is less certain and neither is needed for native privacy.
  The vendored text-shaper Reader is also excluded to keep this refactor within
  renderer-owned code and its existing adaptation boundary.
- Measure runtime source changes and the existing minified/gzip fixture matrix.
  Native field declarations may add source lines; explain that local growth
  with measured bundle savings and maintainability. Overall runtime source
  should decrease and every affected gzip fixture should decrease or remain
  effectively unchanged.
- Use one empty changeset for this internal refactor of an unpublished package.
  No release bump or public documentation migration is expected.

## Baseline

Renderer unit suite: 44 files, 315 tests passing. Renderer TypeScript passes.
Runtime JavaScript under `src/`, excluding tests: 22,192 physical lines,
including WGSL strings and comments. Production-token counts will be recorded
against the starting commit after implementation.

| Fixture            | Minified bytes | Gzip bytes |
| ------------------ | -------------: | ---------: |
| rendererOnly       |         29,121 |      8,896 |
| pointLinear        |        203,556 |     58,887 |
| pointOrdinal       |        205,993 |     59,681 |
| customIdentityMark |         29,270 |      8,974 |
| fontTrueType       |         14,277 |      4,938 |
| fontDefault        |         14,610 |      5,094 |
| textCustomFont     |        212,389 |     61,978 |

## Milestone 1: Remove unused normalization and texture work

- [x] Remove the unused stop normalization path, associated scale definition
      hooks/types, and unused coercion/inspection helpers. Preserve active stop
      length, domain, domain-map, and range update behavior.
- [x] Narrow color texture generation to interpolated array/function ramps;
      preserve custom interpolation and focused GPU test fixture needs.
- [x] Remove 256-byte row repacking from `queue.writeTexture` uploads and use
      one upload helper for scale textures. Keep buffer-copy alignment elsewhere.
- [x] Remove obsolete tests and preserve representative contracts through live
      initialization/update tests.

Affected: scale definitions/stops, color/texture utilities, scale resources,
public ScaleDef declarations, and tests. Core adapter inputs remain unchanged.
Verify renderer unit/types/lint and bundle checks. No user docs change.
Commit: `refactor(webgpu-renderer): remove obsolete scale and texture paths`.

Verification: 309 renderer unit tests pass; renderer TypeScript and lint pass.
Point gzip fixtures decreased by 496–500 bytes and text by 475 bytes; other
fixtures are unchanged. Retired normalization tests were removed and direct
unpadded texture upload coverage was added.

## Milestone 2: Consolidate channel and resource descriptions

- [ ] Consume one channel normalization context per built-in mark; remove
      duplicated default maps and repetitive getters without a descriptor framework.
- [ ] Emit common scaled/conditional accessors once for all channel source
      kinds, retaining a separate series-buffer reader phase.
- [ ] Build one channel IR result and reuse its resource flags; delete redundant
      resource-requirement bookkeeping and scale-uniform wrappers.
- [ ] Simplify scale updater wiring and domain update composition while
      preserving allocation/rebind behavior.

Affected: built-in programs, channel normalization/IR, shader assembly scaffolding,
scale resources, and custom-definition tests. WGSL formulas remain unchanged.
Verify focused channel/scale tests, all renderer unit/types, lint, and bundles.
Commit: `refactor(webgpu-renderer): consolidate channel resource planning`.

## Milestone 3: Simplify program updates and declare subclass contracts

- [ ] Resolve replacement series once for ordinary and text marks. Preserve
      complete replacement, text count validation, and update order.
- [ ] Remove duplicate conditional-channel validation, unused `updateValues`,
      duplicate picking geometry submission, and redundant slot dirty flags.
- [ ] Remove the test-only eager pipeline field; keep real pipelines lazy.
- [ ] Convert BaseProgram and subclass-local helpers/state to native privacy;
      annotate overridden/shared subclass members `@protected` and genuine peer
      access `@internal`, including the property-slot compiler boundary.
- [ ] Replace direct private state assertions with resource/public behavior;
      preserve meaningful pipeline reuse, text replacement, and batching tests.

Affected: BaseProgram, built-in programs, property slots, MarkProgram declarations,
and renderer draw dispatch. Downstream custom programs/tests migrate together.
Verify renderer unit/types/lint/bundles and focused Core WebGPU adapter tests.
Exercise both path-point oracle subclasses and text/rule/link construction,
draw, and retained updates alongside the affected normal/picking paths.
Independent review gate: inspect subclass initialization, custom programs,
series replacement, picking, and text effects before committing.
Commit: `refactor(webgpu-renderer): simplify program updates and member contracts`.

## Milestone 4: Encapsulate resource managers and font helpers

- [ ] Convert class-local state/methods in series, scale, and selection resource
      managers, the uniform buffer, and template cache to native private members.
- [ ] Privatize font/atlas-local state where consumers do not need it; preserve
      renderer-owned sharing and atlas update subscriptions.
- [ ] Remove retirement sets that have no consumer while preserving deferred
      resource destruction. Replace test-only batch tracking with cleanup evidence.
- [ ] Adapt resource tests to the real initialization/update API instead of
      exposing private methods. Preserve byte-limit, reallocation, and disposal tests.

Affected: resource managers, uniform/template utilities, outline font atlas and
MSDF texture storage, unit/GPU stress tests. No public API migration.
Verify renderer unit/types/lint/bundles and atlas/text GPU suites.
Commit: `refactor(webgpu-renderer): encapsulate resource and font state`.

## Milestone 5: Encapsulate renderer orchestration and atlas generation

- [ ] Privatize renderer-local picking/frame/uniform/compositing state and
      helpers. Keep the narrow program/resource collaborator contract explicit.
- [ ] Privatize placement/compositing/pass-state internals where local; preserve
      submission order, detached targets, picking serialization, and device loss.
- [ ] Privatize generator state, replacing reflected private buffer names with
      a smaller explicit representation if necessary. Preserve queue completion,
      oracle subclass hooks, atlas caches, and growth behavior.
- [ ] Rework constructor-bypassing renderer tests to initialize actual instances
      and verify GPU calls/results without private-field escape hatches.

Affected: renderer, render groups/pass state, MSDF generator, development oracle
programs/benchmarks, and tests. Core continues using documented public imports.
Verify renderer unit/types/lint/bundles and relevant picking/group/atlas GPU tests,
including detached targets, picking serialization/invalidation, device loss,
compositing, and atlas growth/cleanup.
Independent review gate: inspect the completed refactor and actual downstream
consumers; incorporate useful KISS/correctness feedback before committing.
Commit: `refactor(webgpu-renderer): encapsulate renderer and atlas orchestration`.

## Milestone 6: Validate complete integration and record outcomes

- [ ] Run the complete renderer unit and GPU suites, workspace TypeScript checks,
      root lint, renderer build/package verification, and bundle fixture matrix.
- [ ] Run `npm -w @genome-spy/core run smoke:examples:webgpu`, which exercises
      every discovered Core/docs example, awaits visible lazy data, audits default
      WebGPU limits, captures output, and records uncaptured GPU validation errors.
      Inspect every failure rather than hiding it with exclusions. Reproduce any
      apparently unrelated failure against `dca83c3ae` under the same conditions.
      Record selected/passed/failed totals and the report location.
- [ ] Run representative point/text/index-gap/lollipop examples at DPR 2,
      including sequence logos, grouping gaps, and layered lollipops; use the
      existing runner and inspect reports/screenshots as needed.
- [ ] Record fixture byte deltas and production-token added/deleted/net counts
      against `dca83c3ae`; explain any growth or unchanged fixture.
- [ ] Update `MIGRATION_PLAN.md` with the completed cleanup outcome, reconcile
      every checkbox in this plan, and verify the empty changeset and release status.

The broad example audit is explicitly the last milestone requested by the user.
It is a startup/data/GPU smoke test, not exhaustive interaction or pixel parity.
Commit: `test(webgpu-renderer): validate minification across Core examples`.

## Acceptance and retirement

All six milestones have their own commits after the reviewed plan commit.
All meaningful contracts pass, runtime source decreases, bundles improve, and
eligible members in affected classes use native privacy. Remaining ordinary
internals have documented consumer or constructor-hook reasons. Shared
subclass/peer contracts are explicit without a new layer of forwarding APIs.
No shader formulas or unrelated renderer behavior change.

The completed plan remains on this branch as requested. Before any future PR or
merge, delete it in a later commit after its reconciled state is committed.

## Independent plan review

The review confirmed milestone ordering and added explicit subclass-branding
exceptions, bounded constructor-based test migration, oracle/subclass checks,
baseline reproduction for unrelated example failures, and the vendored Reader
exclusion. The less certain emitter/instrumentation rewrites remain deferred.
