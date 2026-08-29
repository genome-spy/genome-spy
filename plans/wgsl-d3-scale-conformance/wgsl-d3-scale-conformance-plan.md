# WGSL–d3 scale conformance plan

## Goal

Establish an executable conformance matrix showing that renderer-generated WGSL
matches d3-scale for the mapping behavior that the WebGPU renderer claims to
share with d3. Exercise both the low-level math helpers and the generated scale
accessors where code generation changes semantics.

## Non-goals

- Do not test d3 runtime APIs that the renderer does not implement, including
  ticks, nice, invert, copy, and unknown-value configuration.
- Do not claim d3 equivalence for the renderer-specific high-precision `index`
  scale.
- Do not require d3's implicit ordinal-domain growth or `undefined` unknown
  values; categorical domains and missing-category behavior are explicit GPU
  contracts.
- Do not require d3 band rounding, which is not part of the renderer's band
  contract. Retain the intentional singleton-band padding behavior documented
  in the WGSL implementation as a tested renderer deviation.
- Do not compare JavaScript `f64` and WGSL `f32` bit-for-bit. Use tight,
  scale-appropriate numerical tolerances and representative precision cases.

## Key decisions

1. Use d3-scale as the independent oracle rather than duplicating its formulas
   in test helpers.
2. Prefer deterministic scenario matrices over random property tests. They are
   reproducible, provide useful failure names, and cover each semantic axis
   without making the browser suite flaky.
3. Test raw WGSL helpers for continuous-scale transforms and band positioning.
   Test generated accessors for clamping, rounding, piecewise interpolation,
   threshold, quantize, and categorical resource wiring.
4. Cover ascending and descending domains, forward and reverse ranges,
   interpolation and extrapolation, negative values where the scale supports
   them, non-default parameters, and exact discrete breakpoints.
5. If a supported scenario disagrees with d3, make the smallest production fix
   that restores the stated semantics. Document an intentional deviation when
   matching d3 would conflict with the renderer architecture.
6. Treat finite monotone domains and documented parameter ranges as the
   conformance contract. Match d3 for a two-point degenerate continuous domain,
   but exclude interior duplicate piecewise stops and reversed/degenerate
   quantize domains until the renderer defines those contracts explicitly.
   Threshold domains must be sorted, but duplicate breakpoints are supported
   and tested because their right-bisect behavior maps naturally to WGSL.
7. Compare d3 using `Math.fround`-normalized inputs and parameters. Use exact
   comparisons for discrete outputs and scale-specific absolute tolerances for
   continuous f32 results.

## Alternatives considered

- **Large seeded random sweeps:** broader numerical sampling, but poorer failure
  diagnostics and more GPU-test cost. A compact deterministic cross-product is
  easier to maintain and review.
- **Only test raw helper functions:** isolates arithmetic well but misses
  clamping, rounding, piecewise stops, casts, and generated resource access.
- **Only test complete mark shaders:** validates integration but makes transform
  failures harder to localize. Keeping both layers gives clearer ownership.

## Risks

- d3 computes in `f64`, while WGSL uses `f32`; values near logarithmic or
  symlog singularities need relative/absolute tolerances that still catch real
  regressions.
- Degenerate domains and descending piecewise domains may expose existing
  semantic differences. Fixes must preserve shader simplicity and avoid adding
  runtime branches outside the scale accessors.
- Too many separate GPU cases can slow the Playwright suite. Batch inputs for a
  configuration into one compute pass and keep the configuration matrix small.
- The existing log helper cannot handle negative domains, the rounding helper
  disagrees with d3 at negative half ties, and the piecewise selector assumes
  ascending domains. These are expected implementation fixes, not grounds for
  silently narrowing the compatibility claim.

## Milestone 1: Continuous and band conformance

### Intended outcome

The low-level WGSL suite compares linear, pow, sqrt, log, symlog, and band
results against d3 across their meaningful supported configurations. Existing
high-precision index tests remain renderer-reference tests because d3 has no
equivalent scale.

### Affected areas and downstream consumers

- `packages/webgpu-renderer/tests/scale-wgsl-functions.gpu.test.js`
- Continuous and band WGSL snippets under
  `packages/webgpu-renderer/src/marks/scales/defs/` only if tests expose a
  supported mismatch
- All marks using numeric or band-scaled channels benefit from the verified
  shared helpers

### Verification

- Linear: ordinary and extrapolated values, reversed domain, reversed range,
  non-unit domains/ranges, and the d3 midpoint result for a two-point
  degenerate domain.
- Pow and sqrt: positive and negative inputs, fractional/integer exponents,
  asymmetric and reversed domains/ranges.
- Log: positive and negative domains, bases 2, 10, and e, plus reversed
  domains/ranges. Never cross or include zero.
- Symlog: negative/zero/positive values, asymmetric and reversed domains,
  multiple constants, and small values around zero with f32-aware tolerances.
- Band: a compact cross-product of direction, padding, alignment, non-zero
  domain starts, and band offsets; compare `band = 0` to d3 positions and other
  offsets to d3 position plus bandwidth fraction.
- Preserve focused tests for large packed indices and the intentional singleton
  band deviation.
- Declare `d3-scale` as a direct development dependency of the renderer test
  package instead of relying on workspace hoisting.

### Documentation and migration

No user-facing change unless a newly identified limitation remains intentional;
then add it to the README scale constraints.

### Tentative commit

`test(webgpu-renderer): expand WGSL scale conformance coverage`

## Milestone 2: Generated-accessor conformance

### Intended outcome

The codegen integration suite proves that renderer options which wrap or
compose scale math retain d3 behavior.

### Affected areas and downstream consumers

- `packages/webgpu-renderer/tests/scale-codegen-integration.gpu.test.js`
- Test utilities may be factored only when this reduces duplication
- `scalePipeline.js` or individual scale emitters only if a test exposes a
  supported mismatch

### Verification

- Continuous clamp behavior for forward and reversed domains.
- d3 `rangeRound` tie behavior for positive and negative outputs.
- Numeric piecewise interpolation for ascending and descending domains,
  including exact stops and extrapolation/clamping.
- Threshold with several breakpoints, sampling immediately below, exactly at,
  and immediately above each boundary, plus duplicate breakpoints.
- Quantize with multiple range cardinalities and every computed boundary,
  including values outside the domain.
- Retain existing color-ramp comparisons; texture discretization is compared
  with its existing lower precision rather than treated as scalar WGSL math.
- Exercise generated ordinal and band accessors with sparse explicit domain
  maps, cyclic ranges, reverse ranges, and missing categories. Compare known
  categories to d3; assert the renderer's documented zero/range-start sentinel
  directly for missing categories.
- Include a retained-resource update case that changes a scale domain and range
  through renderer-owned update machinery, proving that normalization and
  resource updates feed the same generated accessor semantics.

### Documentation and migration

No migration work. Update scale constraints only if a deliberate difference is
confirmed.

### Tentative commit

`test(webgpu-renderer): verify generated scale accessors against d3`

## Final verification and acceptance criteria

- The focused Playwright scale suites pass on the repository's WebGPU test
  project.
- WebGPU renderer unit tests, type checks, and lint pass.
- Each d3-like built-in scale has either direct d3 mapping coverage or an
  explicit rationale for exclusion: identity is pass-through, index is
  renderer-specific, and ordinal/band unknown-category behavior is a documented
  GPU contract.
- Supported transform families cover direction, sign, parameter, boundary, and
  interpolation axes without relying on a mirrored implementation as oracle.
- Any remaining intentional mismatch is named in tests or user-facing scale
  constraints; the final report does not overstate conformance.

## Implementation outcome

- Completed continuous and band conformance coverage, including the planned
  direction, sign, parameter, extrapolation, degenerate-domain, precision, and
  renderer-deviation cases.
- Completed generated-accessor coverage for reversed clamping, d3 rounding,
  descending piecewise domains, threshold and quantize boundaries, explicit
  ordinal/band maps, and retained domain/range updates.
- Fixed the supported mismatches exposed by the matrix: wholly negative log
  domains, negative `rangeRound` ties, degenerate linear domains, descending
  piecewise domains, and near-zero symlog precision.
- Kept renderer-only behavior explicit: the index scale uses renderer reference
  tests, singleton bands intentionally ignore inner padding, and missing
  categorical values use GPU-safe sentinels.
- Declared `d3-scale` as a direct package development dependency.
