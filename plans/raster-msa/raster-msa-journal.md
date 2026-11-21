# MSA raster strips journal

## Dataflow and grammar

- The live alignment contains 87 sequences of 1,653 columns, including 18,709
  gaps and 16 symbols outside the explicit palette. The copied example's color
  collector now holds 87 records. Its label collector still holds 143,811 base
  records. The logo and labels read a single publication of flattened bases, as
  the plan reviewer suggested. The named collector adds a materialization
  boundary, so geometry counts alone do not establish a memory or frame-time
  improvement.
- A strip is one sampled x dimension placed in one ordinary y band. The existing
  FASTA string is indexed by UTF-16 code unit, matching `flattenSequence` and
  preserving alignment gaps. Formulas add the grid metadata and expose the
  string under `fields`. A sequence-specific parser or transform would duplicate
  work already expressible in the grammar.
- A whole alignment could be one two-dimensional tile. One strip per identifier
  preserves the shared band scale and its row placement during scrolling and
  reordering. Upper and lower index anchors follow the axis direction. For the
  live alignment, observations end at 1652 and drawing ends at the edge at 1653.

## Renderer implementation

- Pack ordinal cells using the existing stable category IDs. Palette slots come
  from the active domain mapping, which keeps unmapped codes transparent. A
  direct array of RGBA values would require recoloring the packed cells when the
  palette changes. A byte-packed base format remains an option if upload
  profiling shows a worthwhile saving.
- The first ordinal draw rendered blank because the shared scale tables were
  visible in vertex and compute stages. Continuous colors had used texture
  bindings that were already visible in the fragment stage. The shader builder
  now uses the fragment input declaration to expose the ordinal table at the
  stage that consumes it. The retained cell buffer uses the same lifecycle for
  floats and category IDs. Changing the array's numeric type recreates the
  program.

## Verification and remaining work

- Chromium checked a nonzero index origin, a two-index cell width, reversed x,
  spaced y bands, a gap, and an unmapped symbol. The existing browser test still
  covers continuous colors on two-dimensional raster tiles.
- The original and copy kept the initial x domain `[190, 231)`, full extent
  `[0, 1653)`, and 87 shared y bands. WebGPU exports matched pixel for pixel at
  columns 0–4. At columns 1648–1652 after vertical scrolling by 260 px, the two
  exports had no pixels colored as different palette entries. There were 1,826
  differing pixels, concentrated along two horizontal edges of a row, consistent
  with the rect and raster paths' different edge treatment. The live HiGlass
  example still loaded four tiles and obtained a positive logarithmic color
  domain.
- The implementation review also caught the WebGL default in the batch
  screenshot check. It now selects the two raster specs for WebGPU batches.
- Base labels still dominate row count. Per-cell picking, packed byte values,
  viewport-windowed labels, and GPU throughput measurements remain useful
  follow-ups if interaction or profiling calls for them.
