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

The SIL Open Font License in this directory covers both the original Lato font
software and the renamed subset.

## Legacy SDF font

The json metadata and SDFs were taken from https://github.com/etiennepinchon/aframe-fonts
