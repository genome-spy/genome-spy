---
"@genome-spy/core": minor
"@genome-spy/app": minor
"@genome-spy/playground": minor
---

<!-- category: feature -->

Render experimental raster marks in WebGL2 and Canvas2D, including zoomable
HiGlass contact maps and categorical sequence strips. Raster cell boundaries
stay stable when zooming to individual bases. Raster dimension axes display
titles when specified.

Display decoded RGB and RGBA images as raster tiles using `color.scale: null`
and one packed RGBA8 value per cell.

Use a gradient legend brush to control the opacity of individual raster cells.
The HiGlass example makes contact values outside the brushed range transparent.

SVG exports embed raster marks as transparent images while keeping surrounding
vector layers editable.
