# text-shaper adaptation

This directory contains the small, dependency-free part of text-shaper needed
by the WebGPU renderer's TrueType outline proof of concept. It is deliberately
not a text shaping library.

The current adaptation reads an SFNT TrueType font, Unicode `cmap` formats 4
and 12, horizontal metrics, glyph locations, and simple or composite quadratic
`glyf` outlines. Its focused positioning extension reads the basic-Latin GPOS
`kern` feature, Pair Adjustment formats 1 and 2, type-9 extension wrappers, and
legacy horizontal `kern` format 0.

It is still not a complete shaping engine. CFF, WOFF/WOFF2, variable fonts,
hinting, GSUB, complex scripts, bidirectional layout, and line breaking remain
outside this proof of concept.

Renderer-specific contour conversion and layout live outside this directory.
See `NOTICE.md` for exact provenance and modifications.
