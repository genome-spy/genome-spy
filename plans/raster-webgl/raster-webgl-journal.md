# WebGL raster journal

## Dataflow and resources

The WebGL delegate consumes the collector's tile records. A HiGlass publication
creates fresh records even when the decoded numerical array was cached upstream.
Rebuilding the current set of textures on publication also allows an embedding
application to republish a record after changing its cells. Brush and scale
mapping updates leave the tile textures resident.

A per-datum cache across publications would save little for HiGlass. Caching
numerical textures by buffer identity could help overlapping windows, but it
would need an explicit payload revision for mutable data and a lifetime policy.
WebGL texture arrays or an atlas could reduce draw calls for many similar
strips. One texture and one quad per tile worked for the supplied examples. A
tile must fit the device's maximum texture dimension. Packing oversized strips
into more texture rows is an option if a real dataset needs it.

## Color and precision

WebGL can apply its existing fragment-compatible scale functions and ramp or
palette textures directly to integer texel lookups. Continuous color always maps
through a unit range in the shader, so expressions in the color range only
update the shared ramp texture. Log cells are checked in data space, and
collapsed domains use the shared scale helper's midpoint. The brush uses the
next representable Float32 bound when needed to preserve inclusive lower and
exclusive upper endpoints. String tiles use the same indexed access as Canvas
and WebGPU, including how UTF-16 code units are counted.

Core's edge projection can run in JavaScript at double precision. Sending
clipped quad coordinates and a nearby cell anchor avoids interpolation over very
large projected tiles. The same quad supports the four-sample filter. Weighted
premultiplied colors preserve transparent and unknown cells at internal edges.
Tile seams and heavy minification use the same approximation as WebGPU.

## Export and follow-up

Raster PNG export uses the WebGL delegate. The existing hybrid SVG tests still
pass with WebGL selected. Exporting a spec containing a raster mark reaches
SVG's unsupported-mark check during instance counting. Supporting it needs a
decision about when to embed a bitmap, how to report it alongside
threshold-selected runs, and how to handle an unavailable rasterizer.

The implementation review caught brush upload, dynamic color range, and string
indexing issues. Packing the anchor into one uniform removes a per-tile upload
call. Reusing the occurrence visitor and removing renderer-specific screenshot
filters reduces duplicate setup. The remaining performance question is CPU draw
and upload cost with larger numbers of strips or rapid tile-window changes.

Chrome loaded both public examples through the default WebGL2 renderer.
Navigation fetched HiGlass levels 10 and 12, and the log color domain changed
after zoom and pan. After the viewport-domain debounce settled, brush reset
restored the same map pixels. Waiting for visible tile data alone can precede
the independently scheduled color-domain update.
