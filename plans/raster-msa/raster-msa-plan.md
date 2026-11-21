# Raster strips for the MSA alignment panel

The live FASTA contains 87 aligned sequences of 1,653 columns. The current lower
panel expands them into 143,811 records for each mark collector. The goal is to
draw the colored cells as one raster strip per sequence in a copy of the
example. Preserve the original example, the copy's sequence logo and base
labels, and their existing scales and navigation. This work targets the
experimental WebGPU renderer.

## Implementation

- Keep the FASTA parser and one flow record per sequence on the raster branch.
  Use existing formulas to provide the column dimension and the existing string
  as cell data. Run `flattenSequence` on the branches that already consume base
  records. Keep the existing sequence-logo processing and configuration after
  moving its flattening into that branch.
- Extend `raster` to draw an x-bound grid dimension across an ordinary
  categorical y band. Reuse rect band coverage for both y edges and reuse the
  same y scale and scroll layout as the labels. The WebGPU program can draw the
  strip as a grid with one row. For index strips, contribute the first and last
  covered index to the data extent and use band edges for placement. Preserve
  existing placement and extent behavior for two-dimensional tiles.
- Keep the MSA's explicit ordinal domain and palette. Pack stable categorical
  IDs in Core using the existing interner. Supply both the typed fragment input
  and the active ordinal domain map to the renderer. Gaps are palette entries.
  Unmapped bases remain transparent. Keep float cell storage and the existing
  continuous color behavior for quantitative data. A raster palette requires an
  explicit domain for this iteration.
- Use one retained cell buffer per mark as today. Cell format is a shader
  property. The low-level renderer accepts typed numeric cells and stays
  independent of strings, FASTA and categorical row layout. Keep picking at its
  current raster boundary.

## Verification

1. Use a small deterministic Core WebGPU example to check ordinal pixels,
   transparent unmapped bases, gap color, and exact placement in a spaced y
   band. Verify a strip-only index domain, including the last cell, and keep the
   existing quantitative raster test as a regression.
2. Open the copied MSA spec in Chrome. Verify strip and label collector
   cardinalities, shared x and y scales, first and last columns, and alignment
   after horizontal zoom and vertical scroll. Revalidate the generated schema
   and the HiGlass raster example.
3. Record findings and remaining parity or performance caveats in the journal.
   Have a subagent review the implementation before delivery.

Tentative commits are `docs(core): plan raster strips for sequence alignments`
and `feat(core): render sequence alignments as raster strips`.
