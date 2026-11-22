---
"@genome-spy/core": minor
"@genome-spy/app": minor
"@genome-spy/playground": minor
---

<!-- category: feature -->

Render experimental raster marks in WebGL2 and Canvas2D, including zoomable
HiGlass contact maps and categorical sequence strips. Raster cell boundaries
stay stable when zooming to individual bases. Raster dimension axes display
titles when specified. HiGlass shows cached tiles on the next frame. Configure
the decoded tile cache with `cacheSizeMiB` and tune requests for missing tiles
with `debounce`.

Display decoded RGB and RGBA images as raster tiles using `color.scale: null`
and one packed RGBA8 value per cell.

Use the `icon` mark to anchor raster tiles to data positions and keep their
screen dimensions while panning or zooming. Encode `size` to vary the area per
source cell while preserving each icon's aspect ratio.

Use the raster mark's triangle projection to display a HiGlass contact map above
a single genomic axis. Track height controls the visible contact distance.

Use a gradient legend brush to control the opacity of individual raster cells.
The HiGlass example makes contact values outside the brushed range transparent.

SVG exports embed raster marks as transparent images while keeping surrounding
vector layers editable.
