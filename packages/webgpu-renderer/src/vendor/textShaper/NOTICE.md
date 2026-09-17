# Provenance

- Upstream: [wiedymi/text-shaper](https://github.com/wiedymi/text-shaper)
- Revision: `0109a4a6d089bce63fafafcdaae1a10c75773b1b`
- Upstream package version: `0.1.28`
- Retrieved: 2026-09-01
- License: MIT; reproduced in `LICENSE`

## Adapted material

- `font/reader.js` is adapted from `src/font/binary/reader.ts`.
- `font/trueType.js` is a reduced adaptation of `src/font/tables/sfnt.ts`,
  `head.ts`, `maxp.ts`, `hhea.ts`, `hmtx.ts`, `loca.ts`, `cmap.ts`, and
  `glyf.ts`.
- `font/positioning.js` is a GenomeSpy-authored focused OpenType positioning
  extension. It shares the adapted reader and directory boundary but does not
  copy upstream text-shaper source.

The TypeScript modules were combined into small ES modules, types were changed
to JSDoc, bounds validation was added at every binary-reader boundary, parsing
was limited to tables needed by the ASCII proof of concept, and unsupported
font formats now fail explicitly. No text-shaper rasterizer or FreeType-based
code is included. The positioning extension supports only the `latn`/`DFLT`
basic-kerning path documented in the adjacent README.
