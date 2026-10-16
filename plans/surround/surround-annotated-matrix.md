# Nested mutation distributions in the annotated matrix

Status: implemented, verified, and reconciled for retirement on 2026-10-16.
The canonical specification is
`examples/docs/grammar/composition/surround/annotated-matrix.json`.

## Final result

The center is a growing categorical expression matrix with three genes
(ESR1, ERBB2, MKI67) and three samples (Tumor 1, Tumor 2, Tumor 3).
It has nine cells and no explicit width or height. Top and left summaries show
mean expression by gene and sample. The title is "Expression and Mutations in
Synthetic Tumors"; the short description continues to explain the layout.

The right track is a nested surround containing a mutation matrix for TP53
and PIK3CA. Its six records use `gene`, `sample`, and `category`, with statuses
WT and Mutated. Its center has `width: { step: 35 }` and inherits the outer
sample interval. Its top track draws one normalized stacked distribution per
gene, with a right percentage axis titled Fraction and ticks at 0%, 50%, 100%.
Axes have a 10px offset and explicit gene/sample/measurement titles. Legends
are collected to the right.

The data are synthetic. The biological labels replace the earlier Alpha/Beta/
Gamma, One/Two/Three, Q/W, and A/B sketches while preserving their layout roles.
The original single-column metadata-strip sketch is superseded by two mutation
columns; its fixed 14px width and no-x-scale assertions are discarded.

## Data and scale contracts

There are two primary sources: nine expression records and six mutation
records. Mutation data are declared once on the nested surround. Only its
top branch aggregates by gene/status and normalizes stacks by gene.
Descending category sort puts WT before Mutated in each stack.

| Gene | Status | Count | Normalized interval |
| --- | --- | ---: | --- |
| TP53 | WT | 2 | [0, 2/3] |
| TP53 | Mutated | 1 | [2/3, 1] |
| PIK3CA | WT | 1 | [0, 1/3] |
| PIK3CA | Mutated | 2 | [1/3, 1] |

Outer categorical x/y domains are authoritative. The mutation center exports
the shared sample y scale while its top chart owns a distinct, non-zoomable
percentage y scale. Mutation columns and stacks share their local TP53/PIK3CA
x scale, distinct from the expression-gene scale. Both mutation plots share
one category color resolution and Mutation status legend; expression color
and its log2(TPM + 1) legend remain independent. Shared scales live at the
owning scope, while unshared scale settings live on the encoding.

## Geometry, occupancy, and visibility

Top summaries each have 60px thickness and an 8px gap to their center.
Both upper panels fit beside each other, so structural headroom is 68px,
not 136px. Actual axes, offsets, legends, and padding add ordinary chrome.
Matrix/sample intervals stay equal as the center grows; mutation columns and
stacked bars have matching x intervals and band centers.

Hiding either upper summary retains the headroom required by the other.
Hiding both collapses structural headroom. Hiding the nested center hides
its complete surround. Collision checks reject intersecting occupied panels
with a located error and preserve harmless overlap between empty corners of
composite bounds. No automatic rearrangement is introduced.

## Completed acceptance and verification

- [x] Verify the two sources, nine expression cells, six mutation cells, and
      four derived stacked segments with the counts/proportions above.
- [x] Verify shared sample y, separate expression/mutation x, local percentage
      y, shared mutation colors, and independent expression color.
- [x] Verify axis labels/titles, normalized segment geometry, column band
      centers, local guide spans, collected legends, and 10px axis offsets.
- [x] Verify growing central layout, maximum headroom, visibility collapse/
      restoration, and located structural collision errors.
- [x] Inspect browser WebGL/Canvas rendering, clipping, matrix picking, and
      resizing. Retain the separate continuous-x fixture for local wheel/pan
      navigation isolation; categorical bands do not replace that probe.

Behavior is covered in `surroundView.nested.test.js` and structured SVG
assertions in `rendering/svg/examples.test.js`. No obsolete strip-only
acceptance condition remains pending. See [the nesting contract](
surround-nesting.md) for implementation and deferred scrolling details.
