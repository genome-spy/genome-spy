# Bounded outside text-stroke contract proof — failed

Reference only, not a product PR or approved implementation. Base is historical
#671 `aff20e18445a9e6794a2291011e6c0f269f7f64e`. No new dependencies. Runtime
changes apply #693's full-tile coordinates consistently, then replace round
per-glyph bands with sharp RGB pseudo-distance union-exterior coverage. The
ordinary production renderer remains unchanged.

## Contract and independent reference

At each existing quarter-offset sample, take the maximum nominal glyph coverage
Cf and the maximum sharp expanded coverage Co, enforce Co>=Cf, and resolve
`Cf * premultipliedFill + (Co-Cf) * premultipliedStroke`; apply common opacity
once. Width zero gives Co=Cf. Transparent stroke leaves nominal fill unchanged.
Use fontSize32, neutral fill (gamma1/no stem darkening), fractional anchors,
DPR1/2, widths0/.25/1/4, opaque and fractional paint/common alpha.

Original font `|` and `_` paths are actual rectangles, recorded in
source-glyphs.json. Bounds, advances and pair positioning define references
independently of atlas tiles. The test's M/L/Z check alone is not a general
rectangle validator. Keep the documented four-sample filter; union before
averaging. Inspect all pixels against the unchanged two-premultiplied-byte gate.

For neighboring-fill witnesses, two bars are spaced1.5barWidths apart, so a
width4 outside band crosses the other bar. Full nominal fill must protect it.
Sharp-vs-round witnesses require >.2 coverage difference; those pixels
separately compare the prototype to sharp geometry. Coincident duplicate bars
must be idempotent. Transparent stroke frames must match zero-width frames
exactly.

## Reproduction

Use existing workspace dependencies and installed Chrome; do not install
anything. From repository root:

```
node node_modules/playwright/cli.js test -c plans/text-stroke-contract-proof/proof.config.mjs
```

The two tests intentionally fail their final unchanged geometry gate. They first
save every result row in Playwright's per-test output directory. For the
negative control, restore textProgram.js from historical aff20e184 and apply
coordinate-convention.patch, run the same test, then restore the prototype. That
control includes #693 placement corrections but preserves #671's
round/original-band semantics. It is not untouched master.

## Results and disposition

Hardware Chrome156/Metal on integrated Apple M5. Both DPRs complete with no GPU
validation errors; duplicate and transparent-stroke differences are exactly
zero. No discrete GPU was available. This is correctness evidence, not
performance data.

At width4, neighboring-fill witnesses number29/348 (DPR1/2). The old shader's
maximum error there is128bytes; the prototype's is0. Sharp corner witnesses also
improve: isolated `|` maximum229/255 becomes4/14; `_`220/255 becomes4/17. But
the unchanged two-byte geometry gate fails at both DPRs. Width1 errors reach
14/22 for `|`,3/25 for `_`, and7/35 for paired bars. Width-zero corner residuals
already reach4/7 for `|`; do not attribute all error to expansion.

Both independent Sol reviews approve this interpretation: union-exterior paint
semantics are better specified, while nominal/offset atlas accuracy and
label-wide architecture costs remain independent unresolved requirements. Stop
this failed candidate. Do not alter tolerance, add compensating compositor
branches, or extend it to alignment modes. Shadow/picking, clipping,
reversed-order and performance qualification were not performed after the
geometry gate failed. Passing this proof would not qualify arbitrary glyph
offsets or the label-wide architecture; the prior cost assessment already argues
against global adoption.

## Complete result matrix

All rows below are retained, including nominal and transparent cases. Values are
maximum absolute premultiplied-channel differences in bytes, not mean errors.

| DPR | Glyphs       | Width | Fill alpha | Stroke alpha | Common alpha | Max | Pixels >2 | Neighbor witnesses/error | Sharp-v-round witnesses/error |
| --- | ------------ | ----- | ---------- | ------------ | ------------ | --- | --------- | ------------------------ | ----------------------------- |
| 1   | &#124;       | 0     | 1          | 1            | 1            | 4   | 4         | 0/0                      | 0/0                           |
| 1   | &#124;       | 0     | 0.6        | 0.4          | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 1   | &#124;       | 0     | 0.6        | 0            | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 1   | &#124;       | 0.25  | 1          | 1            | 1            | 5   | 4         | 0/0                      | 0/0                           |
| 1   | &#124;       | 0.25  | 0.6        | 0.4          | 0.5          | 2   | 0         | 0/0                      | 0/0                           |
| 1   | &#124;       | 0.25  | 0.6        | 0            | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 1   | &#124;       | 1     | 1          | 1            | 1            | 14  | 8         | 0/0                      | 0/0                           |
| 1   | &#124;       | 1     | 0.6        | 0.4          | 0.5          | 3   | 3         | 0/0                      | 0/0                           |
| 1   | &#124;       | 1     | 0.6        | 0            | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 1   | &#124;       | 4     | 1          | 1            | 1            | 4   | 4         | 0/0                      | 25/4                          |
| 1   | &#124;       | 4     | 0.6        | 0.4          | 0.5          | 1   | 0         | 0/0                      | 25/1                          |
| 1   | &#124;       | 4     | 0.6        | 0            | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 1   | _            | 0     | 1          | 1            | 1            | 2   | 0         | 0/0                      | 0/0                           |
| 1   | _            | 0     | 0.6        | 0.4          | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 1   | _            | 0     | 0.6        | 0            | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 1   | _            | 0.25  | 1          | 1            | 1            | 2   | 0         | 0/0                      | 0/0                           |
| 1   | _            | 0.25  | 0.6        | 0.4          | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 1   | _            | 0.25  | 0.6        | 0            | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 1   | _            | 1     | 1          | 1            | 1            | 3   | 3         | 0/0                      | 0/0                           |
| 1   | _            | 1     | 0.6        | 0.4          | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 1   | _            | 1     | 0.6        | 0            | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 1   | _            | 4     | 1          | 1            | 1            | 4   | 5         | 0/0                      | 21/4                          |
| 1   | _            | 4     | 0.6        | 0.4          | 0.5          | 1   | 0         | 0/0                      | 21/1                          |
| 1   | _            | 4     | 0.6        | 0            | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 1   | &#124;&#124; | 0     | 1          | 1            | 1            | 1   | 0         | 0/0                      | 0/0                           |
| 1   | &#124;&#124; | 0     | 0.6        | 0.4          | 0.5          | 0   | 0         | 0/0                      | 0/0                           |
| 1   | &#124;&#124; | 0     | 0.6        | 0            | 0.5          | 0   | 0         | 0/0                      | 0/0                           |
| 1   | &#124;&#124; | 0.25  | 1          | 1            | 1            | 7   | 2         | 0/0                      | 0/0                           |
| 1   | &#124;&#124; | 0.25  | 0.6        | 0.4          | 0.5          | 2   | 0         | 0/0                      | 0/0                           |
| 1   | &#124;&#124; | 0.25  | 0.6        | 0            | 0.5          | 0   | 0         | 0/0                      | 0/0                           |
| 1   | &#124;&#124; | 1     | 1          | 1            | 1            | 7   | 8         | 0/0                      | 0/0                           |
| 1   | &#124;&#124; | 1     | 0.6        | 0.4          | 0.5          | 2   | 0         | 0/0                      | 0/0                           |
| 1   | &#124;&#124; | 1     | 0.6        | 0            | 0.5          | 0   | 0         | 0/0                      | 0/0                           |
| 1   | &#124;&#124; | 4     | 1          | 1            | 1            | 1   | 0         | 29/0                     | 25/1                          |
| 1   | &#124;&#124; | 4     | 0.6        | 0.4          | 0.5          | 1   | 0         | 29/0                     | 25/1                          |
| 1   | &#124;&#124; | 4     | 0.6        | 0            | 0.5          | 0   | 0         | 29/0                     | 0/0                           |
| 2   | &#124;       | 0     | 1          | 1            | 1            | 7   | 4         | 0/0                      | 0/0                           |
| 2   | &#124;       | 0     | 0.6        | 0.4          | 0.5          | 2   | 0         | 0/0                      | 0/0                           |
| 2   | &#124;       | 0     | 0.6        | 0            | 0.5          | 2   | 0         | 0/0                      | 0/0                           |
| 2   | &#124;       | 0.25  | 1          | 1            | 1            | 3   | 4         | 0/0                      | 0/0                           |
| 2   | &#124;       | 0.25  | 0.6        | 0.4          | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 2   | &#124;       | 0.25  | 0.6        | 0            | 0.5          | 2   | 0         | 0/0                      | 0/0                           |
| 2   | &#124;       | 1     | 1          | 1            | 1            | 22  | 18        | 0/0                      | 4/22                          |
| 2   | &#124;       | 1     | 0.6        | 0.4          | 0.5          | 5   | 10        | 0/0                      | 4/5                           |
| 2   | &#124;       | 1     | 0.6        | 0            | 0.5          | 2   | 0         | 0/0                      | 0/0                           |
| 2   | &#124;       | 4     | 1          | 1            | 1            | 14  | 16        | 0/0                      | 76/14                         |
| 2   | &#124;       | 4     | 0.6        | 0.4          | 0.5          | 3   | 4         | 0/0                      | 76/3                          |
| 2   | &#124;       | 4     | 0.6        | 0            | 0.5          | 2   | 0         | 0/0                      | 0/0                           |
| 2   | _            | 0     | 1          | 1            | 1            | 4   | 2         | 0/0                      | 0/0                           |
| 2   | _            | 0     | 0.6        | 0.4          | 0.5          | 2   | 0         | 0/0                      | 0/0                           |
| 2   | _            | 0     | 0.6        | 0            | 0.5          | 2   | 0         | 0/0                      | 0/0                           |
| 2   | _            | 0.25  | 1          | 1            | 1            | 10  | 9         | 0/0                      | 0/0                           |
| 2   | _            | 0.25  | 0.6        | 0.4          | 0.5          | 2   | 0         | 0/0                      | 0/0                           |
| 2   | _            | 0.25  | 0.6        | 0            | 0.5          | 2   | 0         | 0/0                      | 0/0                           |
| 2   | _            | 1     | 1          | 1            | 1            | 25  | 12        | 0/0                      | 6/25                          |
| 2   | _            | 1     | 0.6        | 0.4          | 0.5          | 5   | 6         | 0/0                      | 6/5                           |
| 2   | _            | 1     | 0.6        | 0            | 0.5          | 2   | 0         | 0/0                      | 0/0                           |
| 2   | _            | 4     | 1          | 1            | 1            | 17  | 8         | 0/0                      | 76/17                         |
| 2   | _            | 4     | 0.6        | 0.4          | 0.5          | 3   | 4         | 0/0                      | 76/3                          |
| 2   | _            | 4     | 0.6        | 0            | 0.5          | 2   | 0         | 0/0                      | 0/0                           |
| 2   | &#124;&#124; | 0     | 1          | 1            | 1            | 2   | 0         | 0/0                      | 0/0                           |
| 2   | &#124;&#124; | 0     | 0.6        | 0.4          | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 2   | &#124;&#124; | 0     | 0.6        | 0            | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 2   | &#124;&#124; | 0.25  | 1          | 1            | 1            | 8   | 12        | 0/0                      | 0/0                           |
| 2   | &#124;&#124; | 0.25  | 0.6        | 0.4          | 0.5          | 2   | 0         | 0/0                      | 0/0                           |
| 2   | &#124;&#124; | 0.25  | 0.6        | 0            | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 2   | &#124;&#124; | 1     | 1          | 1            | 1            | 35  | 8         | 0/0                      | 4/35                          |
| 2   | &#124;&#124; | 1     | 0.6        | 0.4          | 0.5          | 7   | 4         | 0/0                      | 4/7                           |
| 2   | &#124;&#124; | 1     | 0.6        | 0            | 0.5          | 1   | 0         | 0/0                      | 0/0                           |
| 2   | &#124;&#124; | 4     | 1          | 1            | 1            | 13  | 12        | 348/0                    | 72/13                         |
| 2   | &#124;&#124; | 4     | 0.6        | 0.4          | 0.5          | 3   | 6         | 348/0                    | 72/3                          |
| 2   | &#124;&#124; | 4     | 0.6        | 0            | 0.5          | 1   | 0         | 348/0                    | 0/0                           |
