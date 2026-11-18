# WebGPU text composition for #671

Status — revised after two Sol reviews. The next step is a bounded diagnostic.
The initial compositor proposal is discarded. #672 waits for a qualified #671.

## Scope

Common opacity should fade each completed label once. Its outside contrast
border should surround the combined label fill and protect neighboring letter
fills. Separate labels retain their paint order. Preserve the current outside
reach of `strokeWidth / 2` while investigating this correction. Full-width bands
and alignment belong to #672. Fill-opacity support has already merged
separately.

The maintainer requested these decisions be separated and asked for evidence
before replacing ordinary glyph rendering. The old label-rectangle experiment
failed performance comparisons. Its rounded expansion and internal glyph bands
also failed the requested appearance.

- [Blocking review](https://github.com/genome-spy/genome-spy/pull/671#issuecomment-6654314428)
- [Recorded rendering costs](https://github.com/genome-spy/genome-spy/pull/671#issuecomment-6655859622)
- [Failed sharp-border proof](https://github.com/genome-spy/genome-spy/pull/671#issuecomment-6656390094)
- [Shared paint contract](https://github.com/genome-spy/genome-spy/issues/604)

## Architectural direction

Keep font measurement and glyph placement in `buildOutlineTextLayout`,
font-image ownership in `OutlineFontAtlas`, and drawing/shading in
`TextProgram`. `textRenderItems` retains label ordering and shadow scheduling.
Core supplies logical-label channels through its existing adapter.

Prefer the existing glyph-sized drawing and ordinary-text path. A replacement
needs a concrete operation for union coverage and for writing it once. Establish
those operations before choosing buffers, shader variants or draw scheduling.
Keep all renderer resources behind the existing backend boundary.

## Findings from the two reviews

The initial alternative kept glyph rectangles, queried nearby glyphs through the
draft's horizontal index, and selected one rectangle to paint each pixel. Both
reviewers rejected it before implementation.

1. Taking the maximum of smoothed glyph coverages fails at touching edges. Two
   complementary half-planes can each have 0.5 coverage while their union covers
   the entire pixel footprint. Their maximum leaves an internal seam.
2. Selecting a painter with local half-open rectangle tests can disagree with
   hardware rasterization after rotation. A fragment can defer to a glyph whose
   fragment the GPU never invokes.
3. Linear index storage permits long candidate lists. Extra preparation,
   allocations and upload volume require a per-workload byte ledger. The
   proposed percentage and file-count limits did not establish simplicity or
   affordability.

These failures are independent of #693's atlas coordinates and #711's sampling
positions. Existing render scopes would add per-label isolation and still leave
neighboring-fill coverage unresolved. Those approaches are discarded.

## Small next deliverable

Create one temporary reference fixture using the existing actual WebGPU text
rendering path and controlled rectangular font glyphs. Reuse the earlier proof
setup and existing workspace dependencies.

- Exercise isolated bars, overlapping bars, touching bars and a narrow gap.
- Include an isolated sharp corner at fractional placement and rotation. Form
  each sharp outer rectangle by expanding its local axes by `strokeWidth / 2`
  before rotation; calculate rotated pixel intersections as clipped polygon
  area.
- Check DPR 1 and 2, current outside reach, zero/transparent stroke, translucent
  fill and common opacity. Keep gamma and stem-darkening choices explicit.
- Derive expected coverage from the original glyph outlines using analytic
  rectangle/pixel intersection and inclusion-exclusion for the union. Record the
  current smoothing filter separately so a filter change cannot become an
  incidental compositor change.
- Compare all pixels with the previous two-premultiplied-byte accuracy gate.
  Record baseline failures as findings. This investigation does not require
  master to pass an unimplemented label-union contract.
- Keep #693/#711 controls explicit and separate from the mathematical union
  counterexample. Shared-font-image and sampling failures belong to their
  owners.

Stop after recording the reference and baseline results. The resulting decision
must identify either a localized defect in the existing contour path or a
precise coverage/ownership operation that warrants a separate bounded GPU proof.
Neither review approves a production compositor yet.

## Gate for a production proposal

A subsequent proposal must demonstrate one painter per intended coverage,
protect neighboring fills, preserve sharp corners and apply common opacity once.
It must preserve each paint's gamma, independent alpha, shadow order,
transparent picking policy, draw subranges, placement clipping, viewport fade
and scope opacity.

Use independent geometry to qualify changed overlap output. Use current master
for ordinary/isolated parity and performance, and the failed PR only for cost
attribution. Measure creation, replacement, retained scalar updates, steady
redraw, upload bytes, allocations and GPU time separately. Include ordinary,
stroked, long, spaced, dense and fitted-logo labels at both DPRs. Establish cost
limits against the concrete resource representation before implementation.

No new dependencies. Any source adaptation requires license verification and
provenance. Existing architectural references include
[Nehab and Hoppe](https://www.microsoft.com/en-us/research/publication/random-access-rendering-of-general-vector-graphics/)
and [Slug's glyph geometry](https://sluglibrary.com/#glyph-rendering). They do
not qualify a GenomeSpy implementation.

## Tasks

- [x] Read the architecture, current renderer and maintainer review.
- [x] Obtain two independent Sol reviews and discard the invalid shortcut.
- [ ] Run the bounded reference fixture and record baseline findings.
- [ ] Review a concrete production operation and its cost before GPU changes.
- [ ] Implement the smallest qualified correction with actual rendering tests,
      types, lint and the existing Text Effects story. Assess release impact for
      the unpublished renderer. Keep documentation concise.
- [ ] Retire this temporary plan before merge and refresh the PR demonstration.
- [ ] Continue #672 only after #671's final contract and implementation qualify.
