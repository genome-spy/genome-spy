# Multi-Field Key Plan

## Goal

Support composite keys in `encoding.key` so point selections can be persisted/restored with stable identities based on multiple fields (for example: `sampleId`, `chrom`, `pos`), while keeping current single-field behavior intact.

In parallel, make handling of non-visual channels explicit so future channels like `tooltip` can be added without encoder-side breakage.

## Scope

- Core spec/types/schema for `encoding.key`
- Core normalization and validation of key definitions
- Core point-selection helper compatibility
- Core non-visual encoding channel handling in encoder construction
- App provenance bridge payload shape and restore logic for multi-field keys
- Tests across Core and App

## Non-Goals

- Public API redesign of selection runtime objects in `selectionTypes` (keep lightweight internal representations as-is)
- Multi-field `encoding.key` UX docs in this branch (can follow once behavior is stable)
- Changing bookmark compression strategy

## Current Baseline

- `encoding.key` currently accepts one field definition (`FieldDefWithoutScale`)
- Core helper `getEncodingKeyFields()` returns a normalized `string[]`, but currently only from one field def
- Collector already supports tuple lookup (`findDatumByKey(keyFields, keyTuple)`)
- App provenance bridge currently enforces one key field for persisted point selections

## Design Decisions

1. `encoding.key` shape:
- Accept both:
  - `{"field":"id"}`
  - `[{"field":"sampleId"},{"field":"chrom"},{"field":"pos"}]`

2. Internal normalization:
- Normalize key definitions once in Core (`getEncodingKeyFields`) to `string[]`.
- All callers operate on normalized `string[]`.

3. Validation:
- Fail fast for invalid key definitions:
  - non-field-def entries
  - empty key array
  - duplicate field names within key definition

4. Non-visual channels:
- Treat `key` as a non-visual encoding channel in encoder construction.
- Introduce shared channel classification helper so `tooltip` can reuse it later.

5. Provenance payload:
- Move point payload from single-field shape to generalized shape:
  - from `{ keyField: string, keys: Scalar[] }`
  - to `{ keyFields: string[], keys: Scalar[][] }`

## Affected Files (Expected)

Core:
- `packages/core/src/spec/channel.d.ts`
- `packages/core/src/selection/selection.js`
- `packages/core/src/selection/selection.test.js`
- `packages/core/src/encoder/encoder.js`
- `packages/core/src/data/collector.js` (likely no functional changes, verify only)
- `packages/core/src/data/collector.test.js`
- `packages/core/src/view/view.test.js`

App:
- `packages/app/src/state/paramProvenanceBridge.js`
- `packages/app/src/state/paramProvenanceBridge.test.js`

Potentially (if helper placement requires):
- `packages/core/src/spec/channel.js` (generated/compiled output, if applicable in current pipeline)

## Step-by-Step Implementation

### Step 1: Spec and Normalization in Core

Changes:
- Update `Encoding.key` type in `packages/core/src/spec/channel.d.ts` to accept single or array form.
- Update JSDoc to mention single-field and multi-field key support and order significance.
- Extend `getEncodingKeyFields()` in `packages/core/src/selection/selection.js` to:
  - accept both shapes
  - normalize to ordered `string[]`
  - validate shape and duplicates

Tests:
- `packages/core/src/selection/selection.test.js`:
  - single field key extraction
  - multi-field extraction in order
  - empty array fails
  - non-field-def entry fails
  - duplicate field names fail

Gate:
- `npx vitest run packages/core/src/selection/selection.test.js`

Commit:
- `feat(core): support normalized multi-field encoding key definitions`

### Step 2: Non-Visual Channel Handling in Encoder Path

Changes:
- Introduce explicit non-visual channel classification helper (for now: includes `key`).
- Use it in `createEncoders()` so non-visual channels are skipped from accessor creation.
- Preserve inheritance behavior (`UnitView.getEncoding()` should still carry `key`).

Tests:
- Add/update tests ensuring:
  - inherited `key` remains available on unit view encodings
  - encoder creation does not fail when `key` is an array

Gate:
- `npx vitest run packages/core/src/view/view.test.js`
- Any direct encoder test impacted by channel iteration

Commit:
- `fix(core): treat key as non-visual channel during encoder creation`

### Step 3: Core Key Tuple Roundtrip Validation

Changes:
- Verify `getPointSelectionKeyTuples()` and `resolvePointSelectionFromKeyTuples()` behavior with multi-field tuples.
- Keep collector optimized single-field fast path; no regression.
- Ensure duplicate-key error messages retain field list context.

Tests:
- `packages/core/src/selection/selection.test.js`:
  - serialize/resolve point selections with multi-field tuples
- `packages/core/src/data/collector.test.js`:
  - lookup by two-field key tuple
  - duplicate detection by multi-field tuple
  - tuple length mismatch error

Gate:
- `npx vitest run packages/core/src/selection/selection.test.js packages/core/src/data/collector.test.js`

Commit:
- `test(core): cover multi-field key tuple selection and collector lookup`

### Step 4: App Provenance Payload Migration to `keyFields`

Changes:
- Update point selection serialization in `paramProvenanceBridge`:
  - store `keyFields: string[]`
  - store `keys: Scalar[][]`
- Update restore path:
  - validate stored `keyFields` vs current normalized `keyFields`
  - resolve tuples without single-field assumptions
- Update warning text to report full key field list.

Tests:
- `packages/app/src/state/paramProvenanceBridge.test.js`:
  - persist single-field and multi-field cases
  - restore single-field and multi-field cases
  - mismatch between stored/current key field sets
  - duplicate-key warning includes field list

Gate:
- `npx vitest run packages/app/src/state/paramProvenanceBridge.test.js`

Commit:
- `feat(app): persist point selections with multi-field key tuples`

### Step 5: Integration Sweep and Regression Checks

Changes:
- Remove stale single-field-only checks.
- Ensure all code paths consistently use normalized `string[]` from Core helper.
- Keep error messages actionable and concise.

Tests:
- Run focused suites touched by this work:
  - `npx vitest run packages/core/src/selection/selection.test.js`
  - `npx vitest run packages/core/src/data/collector.test.js`
  - `npx vitest run packages/core/src/view/view.test.js`
  - `npx vitest run packages/app/src/state/paramProvenanceBridge.test.js`
- Run type checks:
  - `npm -ws run test:tsc --if-present`

Commit:
- `refactor(core): centralize key-field normalization usage`

### Step 6: Full Validation Before PR

Validation:
- `npm test`
- `npm -ws run test:tsc --if-present`

If failures:
- Fix incrementally with focused commits.

### Step 7: Documentation Update (After Feature Works)

Timing:
- Perform documentation updates only after Step 6 passes and behavior is verified in real usage.

Docs scope:
- User-facing grammar docs for encoding channels:
  - Add/update `encoding.key` examples for both single-field and multi-field forms.
  - Explain that field order in composite keys is significant.
  - Document key uniqueness expectation for stable point-selection persistence.
- If relevant in current docs structure, add a short note in App/provenance docs:
  - Point selections persist via `encoding.key`
  - Multi-field keys are supported

Suggested doc locations (confirm exact pages during implementation):
- `docs/grammar/marks.md` or `docs/grammar/encoding.md` (where encoding channels are documented)
- `docs/grammar/parameters.md` (selection persistence context, if currently covered there)

Validation:
- Build/check docs navigation and links (`mkdocs.yml` consistency, no broken references).

Commit:
- `docs: document multi-field encoding key for stable point selections`

## Risk Notes

1. Encoder iteration risk:
- If non-visual channel skipping is incomplete, array-form `encoding.key` can trigger accessor errors.

2. Schema/type drift:
- Because spec `.d.ts` are schema sources, key type updates must be consistent with runtime validation.

3. Payload compatibility:
- This branch can intentionally skip backward compatibility for old point payload shape if release policy allows.

## Open Questions

1. Backward compatibility for existing bookmark payloads:
- keep compatibility layer for old `{ keyField, keys: Scalar[] }`, or intentionally drop?

2. Future `tooltip` channel timing:
- include non-visual helper now with only `key`, or include `tooltip` preemptively once channel is added to spec?

3. Error strictness for missing key values:
- should undefined/null key parts throw, warn+skip, or be treated as valid scalar components?
