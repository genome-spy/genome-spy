# Raster integration boundaries

Keep raster-specific policy in the semantic mark and renderer adapters. The
grammar, tile format, renderer API, and hit payload retain their current
contracts. Field-driven opacity remains follow-up work.

## Scale domains

`domainPlanner.js` and `viewportDomain.js` currently recognize `RasterMark`. The
loaded domain bypasses the collector cache, and `domainInputs.js` subscribes
using the scalar accessor key. Give marks an optional internal domain binding
per channel. Raster supplies its value reader and its triangle viewport
restriction. The binding can be obtained during viewport validation without
resolving a scale. Read its cache key lazily so the current log-zero policy is
used after reconfiguration. Include the field, dimensions, and tile validation
mode so a rectangular read cannot hide stricter triangle coordinate checks. Use
the binding key for cached reads. Invalidation applies to the whole collector,
so each scale subscribes once per contributing collector. During a collector
reset, read the incomplete state rather than reusing the previous batch's cache.
Viewport domains continue to read the current cell window. Shared scale
ownership, accessor readiness, and feedback suppression stay in the existing
scale and dataflow code.

A specialized check in one scale helper would reduce duplication but preserve
the scale layer's dependence on the raster class. Expanding cells into scalar
records would add memory and move the work into the dataflow. The binding keeps
the existing cell reader and collector lifecycle.

Verify replacement of tiles, independent linear and log scales over shared
tiles, and identical viewport behavior. Add focused coverage for repeated domain
reads and invalidation as needed. Tentative commit subject follows.
`refactor(core): bind raster domain reads through marks`

## Picking and tooltips

Build the cell-hit resolver inside the rendering backend from the completed
layout. Build the raster-only lookup eagerly and release the layout commands.
Reuse the current pixel-center adjustment in each backend. Core's engine wires
the generic resolver into `InteractionController`. Preserve `undefined` for
regular hits, `null` for rejected cell hits, and the cell index for a refined
hit. Keep occurrences scoped to each layout and check lifecycle cleanup on
reinitialization.

Let raster provide the synthetic cell datum and coordinate intervals from the
selected tile. Use the same triangle axis mapping for the rows and for the
custom formatter callbacks. Tooltip code formats coordinates with its existing
helpers and preserves the public tooltip context, including `rasterCell`. This
keeps tile shape, projected axes, and cell metadata in the mark. Subclass
dispatch within drawing and picking adapters still identifies their concrete
mark inputs.

Verify tooltip rows, sample placement, transparent hits, and refined cell
picking across the three backends. Tentative commit subject follows.
`refactor(core): resolve raster cell hits at the renderer boundary`

## SVG and WebGPU adapters

Use the same renderer-local predicate to dispatch raster marks and classify
marks in the SVG preview and export runs. Preserve export paint order, vector
fallback for an optional rasterization run, and the error when a required
rasterizer is unavailable.

In `webGpuMarkAdapter.js`, have raster channel construction explicitly request
cell-bound interval projections and packed index positions. Use the same
selection translation and position packing for the rest of the work. Keep the
standalone renderer and its mark configuration stable.

Verify hybrid SVG export, inferred index domains, one-base zoom, and combined
positional and color brushes. Tentative commit subject follows.
`refactor(core): localize raster export and WebGPU setup`

## Final verification

Run focused Core tests and the raster browser suite across WebGL2, WebGPU, and
Canvas2D. Smoke-check the HiGlass lens, SELL contact track, and MSA strips.
Compare the runtime diff size and class checks. Success means the scale, engine,
and tooltip modules have no dependency on `RasterMark`, and the remaining class
checks identify concrete renderer dispatch or test fixtures. Preserve the
published specification and example behavior without a release-note or migration
change.

The plan review checked scale initialization and invalidation, occurrence
lifetime, tooltip compatibility, and renderer dispatch. The decisions above
incorporate its findings.

The refactor reduced production `instanceof RasterMark` checks from 15 to 7. All
remaining checks are in renderer dispatch and raster picking. The 33 raster
browser tests passed, as did the HiGlass lens, SELL contact track, and MSA strip
smoke checks. Core reported 4,515 passing tests. The Core type check and ESLint
on the changed JavaScript files passed.

The implementation review replaced keyed subscriptions with collector-wide
notifications, consolidated SVG rasterization checks, and simplified the tooltip
result. Those changes removed 59 non-comment production lines, leaving a net
increase of 11 against the pre-refactor revision. The WebGPU adapter still sets
cell interval and packed index behavior explicitly when it configures a raster.

## Field-driven opacity

Allow a quantitative cell field on `opacity` paired with a color value. A single
binding reads either paint field and supplies its scale domain. Preserve the
existing one-field tile upload and value conditions, using the scaled opacity as
the fallback. Keep the one-field rule while WebGL is supported. Reuse the Canvas
pixel cache and WebGPU cell inputs so image export and picking use the same
paint as the display.

Verify inferred domains, scaled and direct opacity, conditional overrides,
transparent picking, and SVG export. Preserve existing color and RGBA rasters.

The Core and WebGPU renderer unit suites passed, along with all 36 raster
browser tests. The opacity tests cover scalar and scaled alpha, selection
overrides, missing-cell picking, and hybrid SVG export. The initial change added
128 net production JavaScript lines against the boundary refactor commit.

Extend opacity to the continuous scale transforms shared by the renderers. For
piecewise linear scales, the WebGL emitter reads the numeric range endpoints of
each segment. The nonlinear WebGPU emitters still use two stops. Verify
ascending and descending stops, live range updates, nonlinear opacity, and
transparent cells with the raster browser tests.

All 36 raster browser tests and 4,841 Core and WebGPU renderer unit tests passed
after extending the scale support.

The trimming pass reuses the raster paint plan for solid color fallbacks and the
WebGPU numeric encoder for constant opacity. It removes 29 production lines,
leaving 132 net lines for field-driven opacity and scale support. All 36 raster
browser tests and 470 focused unit tests passed.
