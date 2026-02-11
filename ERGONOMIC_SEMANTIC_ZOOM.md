# Ergonomic Semantic Zoom Plan

## Objective

Introduce a first-class `multiscale` composition operator that removes repeated
"Zoom in to see" boilerplate while preserving compatibility with current dynamic
opacity behavior.

This is a syntax/authoring improvement, not a rendering rewrite.

## Current pain point

Many track specs repeat the same pattern manually:

1. Zoomed-out hint layer
2. Mid-level aggregated layer
3. Zoomed-in detailed layer

This is currently encoded as hand-written mirrored `opacity.unitsPerPixel`
arrays, repeated across many specs.

## Decisions locked for v1

1. New composition verb is `multiscale`.
2. `multiscale` should support essentially the same pass-through properties as
   `LayerSpec`.
3. `multiscale` compiles to regular `layer` + generated wrapper opacities.
4. Stop units must be explicit in object form and extensible for future metrics.
5. `fade` belongs inside `stops`.
6. Channel inference is deferred until scales are resolved.
7. Only scales visible at the `multiscale` scope are eligible.
8. Independent/excluded descendant-only scales are skipped.
9. For 2D zoom, use one shared `stops` list and average axis metrics. No
   per-channel stop arrays or combine modes in v1.

## Proposed API

### Minimal shorthand (ergonomic default)

```json
{
  "multiscale": [
    { "mark": { "type": "text", "text": "Zoom in to see" } },
    { "import": { "template": "aggregatedTrack" } },
    { "import": { "template": "detailedTrack" } }
  ],
  "stops": [20000, 2000]
}
```

Defaults for shorthand:

1. `metric = "unitsPerPixel"`
2. `channel = "auto"`
3. `fade = defaultFade`

### Extended form

```json
{
  "multiscale": [ ... ],
  "stops": {
    "metric": "unitsPerPixel",
    "values": [20000, 2000],
    "channel": "auto",
    "fade": 0.15
  }
}
```

`channel` values in v1:

1. `"auto"` (default): use eligible `x`/`y` scales at multiscale scope; if both
   exist, average axis metrics.
2. `"x"`: force x scale.
3. `"y"`: force y scale.

## Semantics

1. Children are ordered zoomed-out -> zoomed-in.
2. `multiscale.length === stopCount + 1`.
3. Stop values for `unitsPerPixel` must be strictly decreasing in v1.
4. Each adjacent pair of stages cross-fades at one stop.
5. `fade` defines transition width around each stop.
6. Non-transition regions are fully opaque for the active stage.
7. Manual opacity inside children remains valid and multiplies naturally.

## Scale eligibility and inference

## Why deferred inference is required

At normalization time, child views/scales are not fully created/resolved. Scale
selection must happen in the existing post-resolve opacity pass.

## Eligibility rule

A scale is eligible only if it is resolvable from the `multiscale` wrapper
view via existing ancestor-based lookup.

Practical consequence:

1. Shared/forced scales are eligible.
2. Independent/excluded descendant-local scales are not eligible and are
   ignored for inference.

## Inference behavior

1. `channel = "x"` -> require eligible x scale.
2. `channel = "y"` -> require eligible y scale.
3. `channel = "auto"`:
   - if both x and y eligible: use averaged metric
   - if only one eligible: use that one
   - if none eligible: fail fast with clear error

## Compatibility strategy

Implement `multiscale` as sugar:

1. Normalize `multiscale` spec into a standard `LayerSpec`.
2. Wrap each stage in an auto-generated layer that carries generated dynamic
   opacity.
3. Leave original child content unchanged inside the wrapper.

This reuses the current opacity mechanism and avoids rewriting mark logic.

## Dynamic opacity update required for 2D averaging

Current dynamic opacity evaluates one channel at a time. To support `channel:
"auto"` with both x and y available, extend dynamic opacity evaluation to
compute a single metric from both axes by arithmetic mean.

For `unitsPerPixel`:

1. `m_x = span(domain_x) / width_px`
2. `m_y = span(domain_y) / height_px`
3. `m = (m_x + m_y) / 2`

Then evaluate generated opacity ramps against `m`.

No per-axis stop arrays are introduced in v1.

## Opacity generation algorithm

Inputs:

1. `N = multiscale.length` stages
2. `K = N - 1` stops
3. `fade` in `[0, 0.5)` (relative stop width)

For each boundary stop `s_i`, derive two transition points:

1. `s_i_hi = s_i * (1 + fade)`
2. `s_i_lo = s_i * (1 - fade)`

For `unitsPerPixel`, keep the generated domain strictly decreasing.

Per stage:

1. Stage 0: 1 above first boundary, fades to 0 across first transition.
2. Middle stage j: fades in at boundary `j-1`, stays 1 between boundaries,
   fades out at boundary `j`.
3. Last stage: fades in at last boundary, 1 below it.

Generated wrapper opacities are piecewise-linear via `unitsPerPixel` + `values`
arrays.

## Validation and fail-fast behavior

Normalize-time validation:

1. `multiscale` must be a non-empty array of view/import children.
2. `stops` must parse into at least one value when stage count > 1.
3. Stage/stop count must match exactly.
4. `metric` must be recognized.
5. `fade` must be finite and within allowed range.
6. Stop ordering must be valid for the chosen metric.

Runtime validation (post-resolve):

1. Requested channel(s) must resolve to eligible quantitative scales.
2. If channel inference finds no eligible scale, throw clear error naming
   `multiscale` view.

## Type and schema changes

Target file: `packages/core/src/spec/view.d.ts`

1. Add `MultiscaleStopsObject`:
   - `metric`
   - `values`
   - optional `channel` (`"auto" | "x" | "y"`)
   - optional `fade`
2. Add `MultiscaleStopsDef = number[] | MultiscaleStopsObject`.
3. Add `MultiscaleSpec extends ViewSpecBase`:
   - includes `DynamicOpacitySpec` (pass-through parity with layer behavior)
   - `multiscale: (LayerSpec | UnitSpec | ImportSpec)[]`
   - `stops: MultiscaleStopsDef`
   - optional `view` background like `LayerSpec`
4. Include `MultiscaleSpec` in `CoreViewSpec` union.

## Implementation changes

### `packages/core/src/view/viewFactory.js`

1. Add `isMultiscaleSpec` guard.
2. Normalize `multiscale` specs before view creation to canonical `layer`.
3. Keep ambiguity checks strict (`mark` + `multiscale`, `layer` + `multiscale`,
   etc. should fail).

### `packages/core/src/view/multiscale.js` (new helper)

1. Parse shorthand/object stops.
2. Validate stop semantics.
3. Build wrapper layers with generated dynamic opacity definitions.
4. Return canonical `LayerSpec`.

### `packages/core/src/view/view.js`

1. Extend dynamic opacity evaluation to support averaged 2D metric for
   `channel: "auto"` when both x and y are eligible.
2. Preserve current behavior for explicit single-channel definitions.

## Documentation changes

1. Add `docs/grammar/composition/multiscale.md`:
   - concise genome-track example
   - three-stage hint + aggregated + detailed example
   - shorthand and object form
   - explanation of `channel: "auto"` and 2D averaging
2. Link from:
   - `docs/grammar/composition/index.md`
   - `docs/grammar/composition/layer.md`
3. Keep existing dynamic opacity docs as low-level manual escape hatch.

## Testing plan

### New tests

1. `packages/core/src/view/multiscale.test.js`
   - parsing shorthand/object forms
   - stop/stage validation
   - generated wrapper shape
   - fade behavior on generated arrays

### Existing test files to extend

1. `packages/core/src/view/viewFactory.test.js`
   - `isViewSpec` with `multiscale`
   - ambiguity failures
2. `packages/core/src/view/view.test.js`
   - initialization/render sanity for multiscale
   - opacity composition with child manual opacity
   - runtime errors when no eligible scales
3. Add 2D-specific test:
   - both x/y scales eligible, shared stops, averaged metric path is exercised

## Rollout plan

1. Implement types + normalization + tests.
2. Add docs.
3. Convert one representative private track (sequence) as smoke test.
4. Convert additional repeated tracks incrementally (`genes`, `pfam`,
   `uniprot-locations`, `cCREs`).

## Open items

1. Select `defaultFade` value.
2. Decide whether to allow stop auto-normalization in v1 (current plan: strict).
3. Decide initial metric set beyond `unitsPerPixel` (keep minimal in v1).
