# Expression-Driven Dynamic Opacity Plan

## Rationale

GenomeSpy currently has two related zoom mechanisms with different authoring ergonomics:

1. Lazy sources (for example `bigbed`) can already use expression-driven `windowSize`.
2. `opacity.unitsPerPixel` and `multiscale.stops.values` are currently static arrays.

This makes it hard to keep lazy loading thresholds and semantic zoom transitions aligned. In practice, users must manually maintain two separate threshold systems:

- data availability threshold (`windowSize`, in domain units)
- visibility threshold (`unitsPerPixel`, in units per pixel)

For responsive layouts and faceted views, the relationship depends on view size:

- `unitsPerPixel ~= domainSpan / axisLengthPx`
- `windowSize ~= unitsPerPixel * axisLengthPx`

Because `width` and `height` are already exposed as runtime params, expression-driven opacity/stops is a feasible and practical way to wire these together without introducing new high-level syntax.

## Goals

- Make `DynamicOpacity.unitsPerPixel` accept expression-based arrays.
- Make `multiscale.stops.values` accept expression-based arrays.
- Make top-level `multiscale.stops` shorthand accept expression forms:
  - `stops: { "expr": "..." }` (expression returns an array)
  - `stops: [{ "expr": "..." }, ...]` (per-stop expressions)
- Allow users to derive stop thresholds from `windowSize` and view size params.
- Preserve existing static behavior and backward compatibility.

## Non-goals

- New top-level semantic-zoom operator beyond current `multiscale`.
- New lazy-source API just for multiscale coupling.
- Automatic `windowSize` inference from stops.

## Step-by-step implementation plan

### 1. Extend spec types (Core + App)

Update `packages/core/src/spec/view.d.ts`:

- Introduce a reusable array-def type:
  - `type NumericArrayExprDef = number[] | ExprRef`
- Introduce a shorthand stop-item type:
  - `type NumericStopDef = number | ExprRef`
- Use it in:
  - `DynamicOpacity.unitsPerPixel`
  - `MultiscaleStops.values`
- Keep `DynamicOpacity.values` as static `number[]`.
- Extend multiscale shorthand type:
  - from `MultiscaleStopsDef = number[] | MultiscaleStops`
  - to `MultiscaleStopsDef = number[] | ExprRef[] | ExprRef | MultiscaleStops`

Update JSDoc:

- Clarify that expression values must evaluate to numeric arrays.
- Keep existing constraints documented (positive values, decreasing `unitsPerPixel`, equal array lengths).

App typing:

- `packages/app/src/spec/view.d.ts` mostly reuses core types, so verify no additional changes are needed beyond import propagation.

### 2. Add runtime support for expression arrays in dynamic opacity

Implement in `packages/core/src/view/view.js` (`createViewOpacityFunction` path):

- Add resolver logic for `unitsPerPixel`:
  - static `number[]` -> use directly
  - `ExprRef` -> evaluate via `watchExpression`, request render on updates
- Rebuild the log interpolator whenever `unitsPerPixel` changes.
- Validate on every rebuild:
  - both arrays exist (`unitsPerPixel` resolved, `values` static from spec)
  - equal length
  - finite numbers only
  - `unitsPerPixel` strictly positive
  - `unitsPerPixel` strictly decreasing (required by log interpolation semantics here)
- Fail loudly with a clear `ViewError` if expression output is invalid.

Performance notes:

- Recompute only on expression invalidation, not per frame.
- Keep no extra allocations in render-time hot path.

### 3. Support expression-driven `multiscale.stops.values`

Implement in `packages/core/src/view/multiscale.js`:

- Keep current static-number path unchanged.
- Add expression-aware path for `stops.values: ExprRef`.
- Add expression-aware path for top-level `stops` shorthand:
  - `stops: ExprRef` (must evaluate to numeric array at runtime)
  - `stops: ExprRef[]` (evaluate each item expression into a number)

Normalization strategy:

- `multiscale` remains sugar for generated `layer` + generated dynamic opacities.
- For expression-driven shorthand or `stops.values`, generate
  `opacity.unitsPerPixel` as expression refs for each generated child layer.
- Generated expressions compute transition edges from stop values and `fade`:
  - `hi = s * (1 + fade)`
  - `lo = s * (1 - fade)`

Validation model:

- Keep compile-time validation for static stops.
- For expression-driven shorthand and `stops.values`, defer stop-array validation
  to runtime (in dynamic opacity validation step), including:
  - expression returns array (for `stops: ExprRef`)
  - per-item expressions resolve to finite numbers (for `stops: ExprRef[]`)

### 4. Tests

Add/extend tests in:

- `packages/core/src/view/view.test.js`
- `packages/core/src/view/multiscale.test.js`

Test matrix:

1. Static arrays still work exactly as before.
2. `DynamicOpacity` with expression arrays evaluates and updates on param change.
3. Invalid expression output throws clear errors:
   - non-array
   - non-numeric values
   - unequal lengths
   - non-positive or non-decreasing `unitsPerPixel`
4. `multiscale` with expression-based stops generates expected opacity defs and updates with param changes.
5. Top-level shorthand cases are covered:
   - `stops: ExprRef` returning array works
   - `stops: ExprRef[]` works
   - invalid shapes throw clear runtime errors

### 5. Documentation updates

Update docs to reflect expression capability:

- `docs/grammar/composition/multiscale.md`
- relevant opacity section (where `DynamicOpacity` is described)

Include one concise wiring example:

- stops derived from `windowSize` and `width`
- mention that `unitsPerPixel` can be interpreted as base pairs per pixel in genomic views

### 6. Revise `packages/core/examples/lazy-data/bigbed.json`

Revise the example to demonstrate the intended wiring:

- Keep lazy data source with expression-driven `windowSize`.
- Convert the track to `multiscale` (2 levels):
  1. zoomed-out hint text layer
  2. zoomed-in bigBed detail layer
- Derive stop values from `windowSize` and `width` using top-level shorthand:
  - example shape: `stops = { "expr": "[windowSize / max(width, 1)]" }`
  - optional alternative: `stops = [{ "expr": "windowSize / max(width, 1)" }]`
- Keep behavior robust under layout changes (width changes should shift transition naturally).

This demonstrates the exact coupling discussed:

- one user-controlled `windowSize`
- one derived semantic stop threshold
- no manual duplication of raw thresholds in the spec

### 7. Build and verification

Run:

- `npm test` (or at minimum focused view tests)
- `npm run lint`
- docs build if docs changed

Manual checks:

- `bigbed` example shows hint when zoomed out and detail when zoomed in.
- Changing `windowSize` updates both loading behavior and transition threshold consistently.
- No regressions in existing multiscale/static opacity examples.

## Risks and mitigations

- Risk: expression output shape changes unexpectedly at runtime.
  - Mitigation: strict runtime validation with explicit error messages.

- Risk: multiscale expression generation becomes hard to debug.
  - Mitigation: keep generated expression forms simple and deterministic.

- Risk: author confusion around units.
  - Mitigation: docs explicitly state `unitsPerPixel` meaning and the `windowSize / width` relationship.

## Acceptance criteria

- Users can set `opacity.unitsPerPixel` via expressions.
- `opacity.values` remains static numeric array.
- Users can set `multiscale.stops.values` via expressions.
- Users can set top-level `multiscale.stops` using `ExprRef` or `ExprRef[]`.
- `examples/lazy-data/bigbed.json` demonstrates `windowSize -> stops` coupling.
- Existing static specs remain valid and behaviorally unchanged.
