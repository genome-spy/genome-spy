---
"@genome-spy/core": patch
---

Improve thin link and arc rendering in Canvas and exported SVG by clamping
stroke widths and reducing opacity to preserve their visual weight. Canvas
uses one physical pixel; SVG assumes a device pixel ratio of 2 and uses a
minimum width of 0.5 CSS pixels.
