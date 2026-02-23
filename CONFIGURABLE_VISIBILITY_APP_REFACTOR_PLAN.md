# Refactor Plan: Move `configurableVisibility` Ownership to App

## Goal
Move `configurableVisibility` from Core spec/policy ownership to App ownership, while keeping only essential selector/addressing primitives in Core.

## Constraints
1. Keep bookmark and provenance state structure unchanged.
2. Preserve existing selector behavior for scope/addressing.
3. Keep Core usable without App-specific visibility semantics.
4. Keep App behavior unchanged for end users.

## Current Coupling Map
1. Core spec defines `configurableVisibility` in `packages/core/src/spec/view.d.ts`.
2. Core selector validation uses it in `packages/core/src/view/viewSelectors.js`.
3. Core launch logs selector warnings via `validateSelectorConstraints` in `packages/core/src/genomeSpy.js`.
4. Core internal helper views explicitly set `configurableVisibility: false` in multiple files (`axisGridView`, `gridChild`, `scrollbar`, `selectionRect`, `separatorView`, `title`).
5. App uses `configurableVisibility` in UI/menu logic (`packages/app/src/components/toolbar/viewSettingsButton.js`) and state-driven visibility behavior.

## Target Architecture
1. Core owns only selector/addressing primitives:
   - import scope registration
   - non-addressable markers
   - selector creation/parsing/resolution
   - scope traversal utilities
   - generic selector validation not tied to App UI semantics
2. App owns `configurableVisibility`:
   - spec typing/schema exposure
   - selector-constraint checks related to configurable view visibility
   - visibility-menu behavior
3. App visibility menu must be based on Core addressability primitives, not on
   Core helper-view `configurableVisibility` flags.

## Detailed Steps

### Phase 0: Safety Net Before Refactor
1. Add/expand tests to lock current behavior where needed:
   - Core selector scope resolution and import naming.
   - App selector warnings for configurable view naming rules.
   - App view settings UI behavior with configurable views.
2. Ensure there is explicit test coverage for:
   - duplicate configurable names warning
   - unnamed configurable views warning
   - non-configurable views ignored by that warning

### Phase 1: Split Validation Responsibilities
1. In Core, extract or separate App-specific configurable-visibility checks from `packages/core/src/view/viewSelectors.js`.
2. Keep Core validation focused on generic selector integrity:
   - ambiguous selectors
   - bookmarkable param naming constraints
   - import scope uniqueness for addressable instances
3. Introduce an App-side validator module, for example:
   - `packages/app/src/viewSelectorConstraints.js`
4. App validator should:
   - call Core generic validator
   - run additional checks for configurable-visibility naming/uniqueness
5. Update App usage in `packages/app/src/app.js`:
   - use App validator in `#showSelectorConstraintWarnings`.

### Phase 2: Move Spec Ownership to App
1. Remove `configurableVisibility` from `packages/core/src/spec/view.d.ts`.
2. Add App-side typing for the property in `packages/app/src/spec/view.d.ts`.
3. Thread App-side property through all App view unions:
   - `AppUnitSpec`
   - `AppLayerSpec`
   - `AppMultiscaleSpec`
   - `AppVConcatSpec`
   - `AppHConcatSpec`
   - `AppConcatSpec`
   - ensure `SampleSpec` still supports it where needed
4. Ensure generated App schema still documents/validates the property.
5. Ensure Core schema no longer exposes the property.

### Phase 3: Remove Core Runtime Mentions of App Property
1. Before removing Core helper assignments, switch App menu traversal in
   `packages/app/src/components/toolbar/viewSettingsButton.js` to
   `visitAddressableViews(...)` (or equivalent addressable-only traversal).
2. Ensure App filtering (`isIncluded` and related logic) is applied only to the
   addressable subset.
3. Verify internal helper views (axes/grid helpers/scrollbars/titles) are
   excluded solely via `markViewAsNonAddressable`.
4. Remove Core internal helper view assignments of `configurableVisibility: false` from:
   - `packages/core/src/view/axisGridView.js`
   - `packages/core/src/view/gridView/gridChild.js`
   - `packages/core/src/view/gridView/scrollbar.js`
   - `packages/core/src/view/gridView/selectionRect.js`
   - `packages/core/src/view/gridView/separatorView.js`
   - `packages/core/src/view/title.js`
5. Confirm these views remain excluded from App menu via non-addressable behavior (`markViewAsNonAddressable`) and App menu filtering.

### Phase 4: App Logic Alignment
1. Keep `isVisibilityConfigurable` logic in App UI (`viewSettingsButton.js`) as App-owned source of truth.
2. If needed, centralize App configurable-visibility helper into a single App utility and use it in:
   - App selector-constraint validator
   - App view settings menu logic
3. Verify no App menu path depends on Core helper specs setting `configurableVisibility: false`.
4. Verify no Core component reads `view.spec.configurableVisibility` after refactor.

### Phase 5: Schema, Docs, and Build Artifacts
1. Rebuild schemas:
   - `npm -w @genome-spy/core run build:schema`
   - `npm -w @genome-spy/app run build:schema`
2. Rebuild docs if schema snapshots are embedded:
   - `npm run build:docs`
3. Update App-facing docs in `docs/sample-collections/visualizing.md`:
   - document `configurableVisibility` as an App feature
   - explain defaults and naming/scope constraints
   - keep visibility-menu behavior examples in this page
4. Update any remaining mentions to clarify ownership:
   - App docs remain authoritative for this property
   - Core/grammar docs should avoid presenting it as a core-only concern

### Phase 6: Compatibility Validation
1. Bookmark compatibility:
   - verify state payload remains `viewSettings.visibilities` only.
   - verify old bookmarks still load and apply visibilities.
2. Forward compatibility:
   - App schema accepts `configurableVisibility`.
   - Core schema intentionally rejects/ignores it as non-core field.
3. Runtime behavior:
   - no change in menu behavior in App.
   - no regression in selector resolution/provenance.
4. Documentation behavior:
   - `docs/sample-collections/visualizing.md` reflects final property ownership and behavior.

### Phase 7: Cleanup and API Communication
1. Keep stable Core exports for selector primitives used by App.
2. If Core `validateSelectorConstraints` semantics change, document it in changelog.
3. Add migration note for users validating specs directly against Core schema.

## Testing Matrix
1. Core:
   - `packages/core/src/view/viewSelectors.test.js` (updated scope-only expectations)
2. App:
   - `packages/app/src/viewSettingsUtils.test.js`
   - App-side selector warning tests (new or moved from Core assertions)
   - App view-settings traversal tests proving non-addressable helper views are excluded without relying on `configurableVisibility: false` in helper specs
   - relevant sample view/provenance tests touching selectors
3. End-to-end sanity:
   - load spec with configurable visibilities
   - show/hide views through menu
   - restore bookmark with visibility overrides

## Execution Strategy (Commit Plan)
1. Commit 1: Add App-side selector constraint module + tests, keep old Core behavior.
2. Commit 2: Switch App warning path to App validator.
3. Commit 3: Switch App visibility-menu traversal to addressable views + tests.
4. Commit 4: Remove configurableVisibility checks from Core validator; keep generic checks.
5. Commit 5: Move type property from Core spec to App spec types.
6. Commit 6: Remove Core helper-view property assignments and update tests/schema artifacts.
7. Commit 7: Update docs (`docs/sample-collections/visualizing.md`) and regenerate docs artifacts.

## Risks and Mitigations
1. Risk: accidental selector warning behavior drift.
   - Mitigation: preserve message content in tests where intended.
2. Risk: App schema misses property in some union branch.
   - Mitigation: add explicit schema assertion tests or snapshot checks.
3. Risk: external users relying on Core schema with App specs.
   - Mitigation: changelog/migration note and docs clarification.
4. Risk: App menu accidentally re-includes helper views after removing Core helper flags.
   - Mitigation: make addressable-view traversal mandatory before removal and cover it with dedicated tests.
