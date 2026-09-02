# Fonts

`DefaultFont.ttf` is a build-time subset of Lato Regular that is internally
renamed to **Default Font**. It is intended for the path-text pipeline and
contains a compact plotting-oriented character repertoire with GPOS kerning.
Regenerate it with `npm run build:default-font`. See
[`../../scripts/README.md`](../../scripts/README.md) for details.

TrueType outlines are rasterized lazily by the shared GPU MSDF generator. Each
renderer keeps one append-only RGBA16F atlas per exact font object. A text mark
requests only the glyphs present in its strings. Later marks and retained text
replacement append missing glyphs in batches of at most 32; geometric texture
growth copies old texels at unchanged coordinates and synchronously rebinds
every borrower. No CPU bitmap, GPU readback, or full-font atlas is involved.

The font allocator starts with a 512-by-128 texture and grows dimensions by
1.5 times when needed. This keeps enough horizontal room for ordinary glyph
shelves without forcing power-of-two height jumps. In a local Chrome/Metal
measurement, the 43-glyph story occupied 512 by 972 pixels (3,981,312 bytes),
and all 94 printable ASCII outlines occupied 512 by 2,187 pixels (8,957,952
bytes). The earlier 256-pixel-wide, doubling policy used 8,388,608 and
16,777,216 bytes for the same sets.

The SIL Open Font License in this directory covers both the original Lato font
software and the renamed subset.

## Legacy SDF font

The json metadata and SDFs were taken from https://github.com/etiennepinchon/aframe-fonts
