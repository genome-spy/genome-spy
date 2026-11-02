# SDF fonts

The json metadata and SDFs were taken from https://github.com/etiennepinchon/aframe-fonts

The default atlas is encoded as lossless WebP from the original `Lato-Regular.png`
using cwebp 1.6.0:

```sh
cwebp -lossless -exact -m 6 -q 100 Lato-Regular.png -o Lato-Regular.webp
```

Preserve all RGB channels: they encode the glyph distance field. The font remains
licensed under the SIL Open Font License in `OFL.txt`.
