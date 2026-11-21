# Raster marks in SVG export

Embed visible raster marks as transparent PNGs in every SVG export. The optional
instance threshold also selects dense vector marks. Preserve vector paint order,
clipping, opacity scopes, and sample-facet grouping.

## Approach

- In the asynchronous SVG exporter, let the existing SVG context queue raster
  marks. For counting and bounds, reuse the same occurrence and tile projection
  helpers used by Canvas and WebGL. Count tiles for raster layers and keep the
  default SVG traversal to one pass. Preserve the synchronous vector helper for
  headless use and the existing fallback for exports with only optional
  rasterization.
- Use the existing ordered runs, the registered rasterizer, and its cropped PNG
  placeholders. Adjacent raster marks and threshold-selected marks can share a
  run. Report required rasterization in analysis and export metadata. Let
  callers set the image pixel ratio independently of the vector threshold. App
  and Playground previews include required layers even when the threshold is
  disabled.
- Propagate an explicit error if a required run cannot be rasterized after the
  existing Canvas2D fallback. Keep PNGs embedded as data URLs. SVG's existing
  groups retain view opacity. The
  [SVG image element](https://www.w3.org/TR/SVG2/embedded.html#ImageElement)
  supplies the placement and alpha semantics.
- Correct the two alignment issues from the Chrome probe. Raster quads use the
  actual WebGL target dimensions. WebGPU hybrid draws use the same zero
  logical-pixel offset as WebGL hybrid draws. Regular screen and PNG rendering
  retain their pixel placement.
- The alternative of embedding one PNG per source tile would move color and
  brush handling into an export-specific implementation and add SVG elements.
  Reusing the run path also preserves the backend's antialiasing and batching.

## Delivery and verification

Extend focused headless SVG coverage for default raster export with interleaved
vectors, analysis, and fallback errors. Exercise the export previews with and
without a vector threshold. Use a browser fixture to inspect decoded pixels and
placement with WebGL2, Canvas2D, and development WebGPU. Include fractional
export pixel ratio, a clipped raster, and a vector overlay. Update the existing
raster changeset and the API export documentation. Tentative commit subject is
`feat(core): embed raster marks in SVG exports`.

## Verification

Chrome exported the public HiGlass and MSA specs through WebGL2 with an embedded
image and editable text in each. The HiGlass brush produced a transparent image
when it selected no visible values. Browser regressions exercise fractional
pixel ratios on all three renderers. Headless checks cover optional fallback,
required runs, paint order, and both export previews.
