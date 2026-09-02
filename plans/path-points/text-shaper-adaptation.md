# Focused `text-shaper` adaptation notes

## Intent

Do not use `text-shaper` as the MSDF generator. The path-point experiment found
that its focused rasterizer omitted correctness-critical parts of canonical
msdfgen and produced acute-corner seams. The adapted rasterizer has been
removed in favor of the original msdfgen v1.13 core compiled to WASM.

Preserve `text-shaper` only as the source boundary for the selected static
TrueType outline and metrics code. A focused GenomeSpy-authored positioning
extension in the same subtree now provides basic kerning. This remains a small
adaptation, not an all-or-nothing dependency or a complete shaping engine.

Upstream: [wiedymi/text-shaper](https://github.com/wiedymi/text-shaper)

Reference version: npm `text-shaper@0.1.28`, repository revision
`0109a4a6d089bce63fafafcdaae1a10c75773b1b`.

## Required directory boundary

Every copied or materially adapted `text-shaper` file must live below:

```text
packages/webgpu-renderer/src/vendor/textShaper/
```

Current layout:

```text
src/vendor/textShaper/
    LICENSE
    NOTICE.md
    README.md
    font/
        reader.js
        trueType.js
        positioning.js
```

The directory is a provenance boundary, not the renderer's public abstraction.
Keep these GenomeSpy-owned concerns outside it:

- SVG path syntax and public validation;
- normalization to point-symbol coordinates;
- atlas sizing, packing, caching, and GPU upload;
- WebGPU textures, buffers, bind groups, and lifecycle;
- shader code and mark programs;
- text runs, fallback policy, and Core integration; and
- renderer-specific errors and diagnostics.

The narrow adapter outside the vendor tree converts vendor font data to
renderer-owned outlines, metrics, and pair adjustments. This prevents vendor
types and implementation details from spreading through the package.

If Vega's parser or built-in paths are adapted, put them under a distinct
`src/vendor/vegaScenegraph/` boundary with the BSD-3-Clause notice. Do not mix
code from the two upstream projects in one vendor subtree.

## Provenance requirements

Before the first adapted-code commit:

- copy the applicable upstream license text;
- record the repository URL, full revision, package version, and retrieval
  date;
- map each local file to its upstream source path;
- identify files or algorithms that upstream says derive from FreeType and
  preserve the relevant notices;
- record material changes such as removed formats, rewritten types, or altered
  module boundaries; and
- retain notices in distributed package artifacts where required.

The adaptation should remain reviewable against upstream. Avoid unrelated
rewrites in the initial import; make mechanical import and GenomeSpy-specific
changes separable in history where practical.

## Proof-of-concept outcome

A focused adaptation of the `text-shaper` rasterizer was implemented inside the
required vendor boundary and exercised with the PathPoint story. It established
that the renderer-side atlas, shader, stroke, rotation, and picking route works,
but it required replacing edge coloring and adding partial perpendicular-distance
handling. White seams remained at acute corners because robust selection and
canonical interpolation error correction were absent.

Continuing the rasterizer adaptation would have recreated msdfgen piecemeal.
That rasterizer and its implementation-detail tests were therefore removed
after canonical msdfgen produced artifact-free stress output. The retained
font-only adaptation reads static TrueType outlines, metrics, printable-ASCII
mapping, and basic pair positioning; it contains no text-shaper rasterizer.

## Why MSDF rather than ordinary SDF

An ordinary signed-distance field stores one closest-edge distance. Near a
corner, offsetting that distance naturally rounds the join. An MSDF stores
several edge distances in color channels and reconstructs the boundary from
their median, retaining corner information over a useful scale range.

For this project, that means one atlas can provide:

- antialiased fill;
- a dynamic outer outline with variable width;
- miter-like sharp corners for point shapes and glyphs; and
- future halo, shadow, and focus effects.

It does not provide exact SVG stroking. The supported outline width is bounded
by the stored distance range and padding, and a very acute miter can still be
truncated. Exact miter limits, caps, dashes, and open-path strokes require a
geometric stroker.

## Implemented static TrueType slice

All adapted font code stays in `src/vendor/textShaper/font/` and is exposed
through the narrow GenomeSpy-owned `src/fonts/trueTypeFont.js` adapter.

The smallest useful static-TrueType subset is:

- SFNT table directory and bounds validation;
- `head`, `maxp`, `hhea`, `hmtx`, `loca`, and `glyf`;
- `cmap` formats needed by current Unicode fonts;
- simple and compound glyph outlines and transforms;
- advances, bearings, ascender, descender, and line gap;
- legacy `kern` pair lookup as a fallback; and
- GPOS pair positioning for basic kerning.

This should support many static TrueType Google Fonts for Latin-oriented
GenomeSpy labels. It is not equivalent to supporting all Google Fonts. Some use
CFF/CFF2, variable axes, WOFF2 packaging, color glyphs, or complex-script
shaping that this subset intentionally omits.

The earlier source-level estimates are superseded by measured bundles recorded
in the main plan. The positioning implementation is intentionally limited to
the tables and lookup forms below rather than importing full GPOS machinery.

## Basic GPOS kerning strategy

GPOS is an OpenType _glyph positioning_ table. For basic kerning, only Pair
Adjustment lookups are needed. GSUB is _glyph substitution_ and is not required
to adjust the spacing between already selected Latin glyphs.

The implemented subset is:

- ScriptList, FeatureList, and LookupList traversal sufficient to select the
  `kern` feature;
- Lookup Type 2 Pair Adjustment, both explicit pair sets and class-based pairs;
- Lookup Type 9 extension wrappers when they target pair adjustment;
- horizontal advance and placement adjustments used for kerning; and
- legacy `kern` fallback when usable GPOS pair data is absent.

The parser prefers the default `latn` language system, then `DFLT`, and finally
the first script. It applies all selected `kern` lookups in order. Lookup flags
and device/variation table offsets are parsed structurally but their behavior
is ignored; `dist`, alternate language systems, vertical positioning, and mark
filtering are deferred until real fixtures require them.

## Explicitly deferred text capabilities

- GSUB ligatures, contextual substitutions, and script-specific forms;
- Arabic, Indic, and other complex-script shaping;
- bidi ordering and Unicode line breaking;
- fallback across several fonts;
- variable-font interpolation;
- CFF/CFF2 outlines;
- WOFF2 decompression;
- color fonts, hinting, and bitmap strikes; and
- browser-persistent glyph atlas caching.

These can be added independently or delegated to a dedicated shaping library
if product requirements justify their cost.

## Adaptation acceptance criteria

- All upstream-derived code and notices are confined to the documented vendor
  directories.
- Renderer modules import only a narrow GenomeSpy-owned adapter, not scattered
  vendor internals.
- Bundle reports separate optional font-vendor code, adapters, atlas generation,
  and GPU program cost.
- Focused tests cover every adapted capability and representative failure
  boundaries.
- The source mapping makes an upstream comparison or later update practical.
- No font or shaping code is bundled into the path-point entry until it is used.
- No `text-shaper` rasterizer is reintroduced alongside canonical msdfgen or the
  planned WGSL generator.
