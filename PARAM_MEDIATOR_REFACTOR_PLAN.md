# Param Runtime Redesign Plan

## Background

### Why this redesign is needed

GenomeSpy parameters are currently doing too much through one class
(`ParamMediator`): scoped storage, expression compilation/caching, listener
dispatching, and integration with rendering/dataflow/provenance call sites.

The current design works but has accumulated structural issues:

1. DAG propagation is not robust enough for non-tree dependency graphs
   (diamond paths can cause duplicate trigger patterns and inconsistent
   intermediate observation order).
2. Subscription lifecycle ownership is inconsistent across call sites.
3. Expression listener invalidation semantics are too coarse in some paths.
4. Parameter identity is name-based and scope lookup is implicit.
5. Behavior contracts (derived param mutability, teardown guarantees) are not
   explicit enough.

### Scope of this plan

This is a **full internal redesign** of parameter reactivity/runtime in Core,
and replaces the current `ParamMediator`-centric architecture.

Key constraints:

1. No separate package.
2. No hypothetical extension hooks/plugin systems.
3. Keep architecture purpose-built for GenomeSpy.
4. Make the independently testable signal/runtime part live in one folder:
   `packages/core/src/paramRuntime/`.

### Relation to Vega-like signals

GenomeSpy params are conceptually signal-like (named reactive runtime values
feeding expressions/effects). The redesign adopts fine-grained reactive graph
principles (topological scheduling, batching, explicit dependencies) while
preserving GenomeSpy’s own expression/spec semantics.

---

## Design

### High-level architecture

Use a layered internal architecture:

1. New runtime internals live in `packages/core/src/paramRuntime/`.
2. A new first-class API (`paramRuntime`) replaces `ParamMediator` usage.
3. Runtime is split into narrowly scoped modules with explicit contracts.

### Folder and module layout

All runtime internals are in:

- `packages/core/src/paramRuntime/graphRuntime.js`
- `packages/core/src/paramRuntime/paramStore.js`
- `packages/core/src/paramRuntime/expressionCompiler.js`
- `packages/core/src/paramRuntime/selectionStore.js`
- `packages/core/src/paramRuntime/lifecycleRegistry.js`
- `packages/core/src/paramRuntime/invalidationBridge.js`
- `packages/core/src/paramRuntime/paramRuntime.js`
- `packages/core/src/paramRuntime/index.js`

### `paramMediator.js` transition policy (explicit)

`packages/core/src/view/paramMediator.js` is treated as a **temporary migration
shim only**, not a long-term API.

Rules:

1. Phase 1: file may still contain legacy code while runtime modules are added.
2. Phase 2: file must be reduced to a thin delegate/re-export to
   `paramRuntime`, with no new business logic.
3. Phase 3: remaining imports/call sites must be migrated off
   `view/paramMediator.js`.
4. Phase 4: `packages/core/src/view/paramMediator.js` is deleted.

Acceptance guard:

1. No new code may be added to `view/paramMediator.js` after Phase 2 starts.
2. Any bug fix touching parameter logic must target `paramRuntime` modules.

### Responsibilities by module

#### `graphRuntime.js`

Purpose:

- DAG-safe propagation and scheduling.

Responsibilities:

1. Track dependency edges between source/computed/effect nodes.
2. Batch updates via transactions.
3. Recompute dirty computeds in topological order.
4. Ensure each computed runs at most once per flush epoch.
5. Run effects after compute stabilization.
6. Expose sync barrier `whenPropagated`.

Policy:

1. Internal priority queue can use `flatqueue` (by topo rank + sequence id).
2. No cycle tolerance; cycles fail fast with clear errors.

#### `paramStore.js`

Purpose:

- Scoped param registration and identity.

Responsibilities:

1. Create scope ids and parent chains.
2. Register base, derived, and selection params.
3. Resolve params through scope chain.
4. Enforce mutability contract.

Identity:

1. `ParamId = ScopeId + ":" + ParamName`
2. Resolution caches are allowed for performance but must invalidate correctly
   on scope disposal.

#### `expressionCompiler.js`

Purpose:

- Compile/evaluate expressions and expose dependency metadata.

Responsibilities:

1. Compile once per expression + mode.
2. Extract globals/fields.
3. Distinguish:
   - datum-free computed expressions (graph nodes)
   - datum-dependent evaluators (hot-path accessors)

#### `selectionStore.js`

Purpose:

- Selection domain objects and update operations.

Responsibilities:

1. Create single/multi/interval selections.
2. Provide controlled update APIs (`add/remove/toggle/clear/setInterval`).
3. Maintain reactivity-safe versioning semantics.

#### `lifecycleRegistry.js`

Purpose:

- Owner-scoped subscription/effect teardown.

Responsibilities:

1. Register owner ids for views/marks/transforms/sources.
2. Bind every runtime subscription/effect to an owner.
3. Dispose all owner resources automatically.

#### `invalidationBridge.js`

Purpose:

- Connect runtime changes to render/dataflow invalidations.

Responsibilities:

1. Render invalidation requests.
2. Dataflow repropagation requests.
3. Scale/domain/range invalidation requests.
4. Keep scheduling semantics deterministic.

#### `paramRuntime.js`

Purpose:

- Public internal facade for parameter operations in Core.

Responsibilities:

1. Compose `paramStore`, `graphRuntime`, expression integration, and lifecycle.
2. Expose explicit operations for registering params, reading values, updating
   values, and waiting for propagation.
3. Provide small helper methods for common call-site patterns (for example
   expr-backed invalidation wiring) with owner-scoped cleanup.

### API shape (target)

```ts
type ScopeId = string;
type ParamId = string;
type ParamKind = "base" | "derived" | "selection";

interface ParamRef<T> {
    id: ParamId;
    name: string;
    kind: ParamKind;
    get(): T;
    subscribe(listener: () => void): () => void;
}

interface WritableParamRef<T> extends ParamRef<T> {
    set(value: T): void;
}
```

```ts
interface ParamStore {
    createScope(parent?: ScopeId): ScopeId;
    registerBase<T>(scope: ScopeId, name: string, initial: T): WritableParamRef<T>;
    registerDerived<T>(scope: ScopeId, name: string, expr: string): ParamRef<T>;
    registerSelection<T>(scope: ScopeId, name: string, initial: T): WritableParamRef<T>;
    resolve<T>(scope: ScopeId, name: string): ParamRef<T> | undefined;
}
```

```ts
interface GraphRuntime {
    inTransaction<T>(fn: () => T): T;
    flushNow(): void;
    // Sync barrier only: resolves when DAG propagation/effects have flushed.
    // Must NOT be broadened to temporal/animation convergence semantics.
    // `whenConverged()` may be added later as a strictly stronger barrier.
    whenPropagated(options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<void>;
    computed<T>(ownerId: string, deps: ParamRef<any>[], fn: () => T): ParamRef<T>;
    effect(ownerId: string, deps: ParamRef<any>[], fn: () => void): () => void;
}
```

```ts
interface ParamRuntime {
    createScope(parent?: ScopeId): ScopeId;
    registerBase<T>(scope: ScopeId, name: string, initial: T): WritableParamRef<T>;
    registerDerived<T>(scope: ScopeId, name: string, expr: string): ParamRef<T>;
    registerSelection<T>(scope: ScopeId, name: string, initial: T): WritableParamRef<T>;
    resolve<T>(scope: ScopeId, name: string): ParamRef<T> | undefined;
    inTransaction<T>(fn: () => T): T;
    flushNow(): void;
    whenPropagated(options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<void>;
}
```

```ts
interface LifecycleRegistry {
    createOwner(kind: "view" | "mark" | "transform" | "source", key: string): string;
    addDisposer(ownerId: string, disposer: () => void): void;
    disposeOwner(ownerId: string): void;
}
```

### Core behavior contracts

1. Derived (`expr`) params are read-only from public setter API.
2. Every runtime subscription has an owner-bound disposer.
3. Recompute order is deterministic and DAG-safe.
4. `whenPropagated` means sync graph settled only.
5. `whenConverged` is intentionally out of scope now, but API-compatible for
   later addition.

### Non-goals (explicit)

1. No plugin/provider architecture.
2. No runtime backend abstraction layer.
3. No public packaging split.
4. No spec language rewrite.
5. No legacy `ParamMediator` compatibility layer.

---

## What Successful Outcome Looks Like

### Functional outcomes

1. Parameter propagation is stable and deterministic in DAG graphs.
2. No duplicate recompute storms for diamond dependency shapes.
3. No cross-consumer listener teardown side effects.
4. Bookmark/provenance restore can reliably wait on `whenPropagated`.

### Reliability outcomes

1. All parameter-related subscriptions are automatically disposed with owner.
2. Disposal behavior is uniform across views/marks/transforms/scales/sources.
3. Error messages for invalid parameter operations are explicit and actionable.

### Performance outcomes

1. No regressions in common rendering/dataflow hot paths.
2. Expression compilation remains cached and low-overhead.
3. Scheduler overhead is bounded and validated by benchmarks.

### API outcomes

1. Core call sites use the new `paramRuntime` API directly.
2. Legacy `ParamMediator` internals are removed.
3. Contract for `whenPropagated` remains stable and documented.

### Documentation and testing outcomes

1. Architecture docs reflect new runtime model.
2. Regression tests cover identified bug classes.
3. CI-level suite passes for Core/App affected areas.

---

## Step-by-Step Implementation Plan

This plan is sequenced to keep the repository shippable at each checkpoint.

### Phase 0: Baseline and guardrails

1. Create branch and capture current baseline behavior.
2. Add/confirm failing tests for known issues before runtime changes.

Add tests first for:

1. DAG/diamond propagation dedupe and deterministic order.
2. Shared-expression invalidation isolation.
3. Owner-scoped teardown guarantees.
4. Derived param mutability contract.
5. `push: "outer"` explicit error path.

Run tests:

1. Focused suites for new tests as you add them:
   - `npx vitest run <new test file>`
2. Then run broader affected area:
   - `npx vitest run packages/core/src/view`
   - `npx vitest run packages/core/src/scales`
   - `npx vitest run packages/core/src/marks`

Commit:

1. Commit test scaffolding once failing tests demonstrate current gaps.
2. Conventional commit example: `test(core): add param runtime regression specs`.

### Phase 1: Introduce runtime skeleton

1. Add `packages/core/src/paramRuntime/` with initial modules and interfaces.
2. Implement minimal `graphRuntime` transaction + flush + topo scheduling.
3. Implement `paramStore` with scope and identity model.
4. Add `lifecycleRegistry`.
5. Add `paramRuntime` facade.

Run tests:

1. Unit tests for each new module in isolation.
2. Keep unaffected Core suites green.

Commit:

1. Commit runtime skeleton after unit tests pass.
2. Example: `feat(core): add paramRuntime skeleton modules`.

### Phase 2: Replace `ParamMediator` call sites with `paramRuntime`

1. Update view-level param registration and lookup flows.
2. Replace expression listener wiring in core call sites with runtime-owned
   subscriptions.
3. Replace `view/paramMediator.js` internals with thin delegation only.
4. Remove direct usage of old setter/listener maps.

Run tests:

1. `npx vitest run packages/core/src/view`
2. `npx vitest run packages/core/src/data/transforms`
3. `npx vitest run packages/core/src/scales`

Commit:

1. Commit call-site replacement in small subsystem-scoped commits.
2. Example: `refactor(core): move view param flows to paramRuntime`.
3. Add one explicit shim commit:
   - `refactor(core): reduce paramMediator to migration shim`

### Phase 3: Migrate high-risk listener call sites

Migrate in this order:

1. Scale range expression listeners.
2. Mark expression listeners.
3. View opacity expression listeners.
4. Expression-based transform listeners.
5. `activateExprRefProps` cleanup/disposer integration.

For each sub-step:

1. Migrate one call-site family.
2. Add/adjust targeted disposal + behavior tests.
3. Run focused tests immediately.
4. Commit immediately after green focused tests.
5. Ensure migrated files import from `paramRuntime` paths directly (not
   `view/paramMediator.js`).

Suggested commit granularity:

1. One commit per subsystem migration.
2. Examples:
   - `refactor(core): migrate scale range listeners to paramRuntime`
   - `refactor(core): migrate mark expr listeners to owner-scoped runtime`

### Phase 4: Enforce contracts and delete legacy architecture

1. Enforce read-only derived params in setter access path.
2. Remove old listener map paths and invalidation semantics.
3. Delete `packages/core/src/view/paramMediator.js` and remaining references.
4. Finalize `whenPropagated` behavior and docs.

Run tests:

1. Full Core unit suite:
   - `npm test -- packages/core`
   - If workspace filtering is not configured, run full:
   - `npm test`
2. Type checks:
   - `npm -ws run test:tsc --if-present`
3. Lint:
   - `npm run lint`

Commit:

1. Commit cleanup and contract enforcement separately from migration commits.
2. Example: `refactor(core): remove legacy ParamMediator architecture`.
3. Deletion commit should be explicit:
   - `refactor(core): delete view-level ParamMediator shim`

### Phase 5: App integration verification and provenance pathways

1. Verify App provenance bridge behavior with restored param states.
2. Confirm bookmark restoration works with `whenPropagated` barriers.
3. Verify no regression in interaction workflows.

Run tests:

1. `npx vitest run packages/app/src/state/paramProvenanceBridge.test.js`
2. Additional affected App suites as needed.

Commit:

1. Commit App-side adjustments and tests.
2. Example: `refactor(app): align provenance bridge with paramRuntime propagation`.

### Phase 6: Final validation and merge prep

1. Run full test suite from repo root:
   - `npm test`
2. Run type checks:
   - `npm -ws run test:tsc --if-present`
3. Run lint:
   - `npm run lint`
4. Update docs if behavior contracts changed visibly.

Final commit expectations:

1. Small final docs/changelog commit if needed.
2. Keep migration commits readable and subsystem-scoped.

---

## Test Strategy Details

### When to write tests

1. Before each behavior change (regression spec first).
2. During module implementation (unit tests per new module).
3. During each migration step (integration tests for affected subsystem).
4. Before merge (end-to-end regression pass).

### Minimum required new test classes

1. GraphRuntime DAG ordering and once-per-flush recompute.
2. Nested transactions with `inTransaction`.
3. `whenPropagated` semantics and timeout behavior.
4. Owner disposal teardown guarantees.
5. ParamStore scope resolution and identity uniqueness.
6. Cross-subsystem integration tests using new `paramRuntime` flows.

### Test execution cadence

1. Tight loop:
   - edit
   - focused test
   - commit
2. Milestone loop:
   - subsystem suite
   - commit
3. Release loop:
   - full test + lint + typecheck

---

## Commit Strategy

### Principles

1. Commit by architectural step, not by file count.
2. Keep each commit independently green on focused tests.
3. Avoid mixed “behavior + massive cleanup” in same commit.

### Suggested commit sequence

1. Tests exposing current issues.
2. Runtime skeleton.
3. View-level migration.
4. Scale migration.
5. Mark migration.
6. Transform migration.
7. Contract enforcement + `paramMediator.js` deletion.
8. App/provenance integration.
9. Final cleanup/docs.

### Conventional commit examples

1. `test(core): add DAG propagation regression coverage`
2. `feat(core): add paramRuntime graph and store primitives`
3. `refactor(core): migrate view param flows to paramRuntime`
4. `refactor(core): migrate mark expression listeners`
5. `refactor(app): synchronize provenance restore with whenPropagated`
6. `refactor(core): delete view-level ParamMediator shim`

---

## Risks and Mitigations

Risk: propagation order changes reveal latent assumptions.  
Mitigation: explicit ordering tests and staged migration by subsystem.

Risk: lifecycle tightening uncovers missing owner disposal in call sites.  
Mitigation: owner-scoped leak tests and incremental migration commits.

Risk: performance regression from scheduler overhead.  
Mitigation: focused benchmarks on interaction-heavy views and expression-heavy
dataflows at each phase.

Risk: accidental semantic drift of `whenPropagated`.  
Mitigation: explicit contract tests and inline comment guard in API definition.

---

## Exit Criteria (Go/No-Go)

All of the following must be true:

1. New runtime modules are in `packages/core/src/paramRuntime/`.
2. `packages/core/src/view/paramMediator.js` has been deleted.
3. Legacy `ParamMediator` architecture is removed from active core flows.
4. DAG propagation correctness tests pass.
5. Lifecycle/disposal tests pass for migrated subsystems.
6. App provenance/bookmark restore pathways pass with propagation barrier usage.
7. Full repo tests, lint, and type checks pass.
