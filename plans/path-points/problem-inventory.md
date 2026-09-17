# Path points, outline fonts, and text effects: problem inventory

Status: complete and reconciled for branch retirement

Related issues: [#236](https://github.com/genome-spy/genome-spy/issues/236),
[#362](https://github.com/genome-spy/genome-spy/issues/362),
[#105](https://github.com/genome-spy/genome-spy/issues/105), and
[#474](https://github.com/genome-spy/genome-spy/issues/474).

## Problems now addressed

### Point symbols

- Built-in names and user SVG paths no longer require one hard-coded WGSL
  distance function per shape.
- Non-circle paths share one MSDF decoder and support fill, centered or inward
  stroke, vertex rotation, holes, picking, and miter-like corners.
- A fixed circle keeps the faster and smoother analytic shader.
- Finite variable shape domains are interned into numeric GPU values.
- Path-specific bounds and miter metadata avoid universally oversized quads.
- Regression fixtures cover the earlier seams, detached spikes, false-inside
  regions, clipped strokes, and rotation-sensitive artifacts.

### Fonts and text

- Static TrueType fonts generate glyphs lazily into GPU atlases rather than
  requiring a pre-generated full bitmap atlas.
- The focused reader supports Unicode mapping, metrics, composites, GPOS pair
  adjustment, and legacy kerning for common Latin fonts.
- A stripped Default Font plus explicit application/Core catalogs provide
  API-key-free, lazy font loading.
- RGBA16F MSDF, gamma/stem adjustment, and 2 by 2 supersampling improve small
  and large text quality.
- Atlas growth preserves glyph coordinates and shared mark bindings.
- Program reuse and retained updates keep label content out of per-frame
  identity work.

### Text effects

- MSDF outlines and scalar-SDF shadow/glow can be rendered from glyph quads in
  label-major order with one draw call.
- Effect-free text retains the one-quad-per-glyph fast path.
- Dynamic effects do not require a whole-label scratch atlas.

## Deferred product and engineering problems

All items in this section are explicitly discarded from the current branch's
scope. They may be reconsidered as independent work after this renderer and
WebGPU-integration infrastructure has merged.

### Public path contract

- Define the exact fill rule, normalization/size semantics, maximum unique path
  count, and behavior when a data update introduces a new path.
- Decide which invalid, open, self-intersecting, or degenerate paths fail and
  which can be normalized safely.
- General SVG caps, dashes, configurable joins, and open strokes remain out of
  scope unless a concrete mark needs them.

### Small stroked points

One ordinary atlas distance range cannot simultaneously maximize detail for
large shapes and reserve a large relative stroke around tiny shapes. A compact
wide-range tier should cover useful small strokes without increasing the
texture footprint or quad size of common stroke-free points.

### Portability and compatibility

- Validate RGBA16F capabilities across target WebGPU adapters.
- Calibrate DPR, atlas resolution, supersampling, and filtering on more than one
  adapter family.
- Define portable Core text-effect semantics for Canvas2D and SVG. WebGL can
  remain limited while it is phased out, but the difference must be explicit.

### Performance and memory

- Record MSA zoom/pan CPU profiles after the constant-time program-key fix.
- Re-run five-million-point draw benchmarks for analytic, fixed-path, and
  variable-path routes.
- Measure font parsing, cold generation, warm glyph additions, atlas growth,
  scratch peaks, texture cache behavior, and bundle/package deltas.
- Bound path-table and font-atlas growth. Persistent cross-session caches are
  not currently justified.

### Text scope

The current font support is deliberately not a general shaping engine. GSUB,
complex scripts, bidi, fallback runs, variable fonts, CFF/CFF2, WOFF2, color
fonts, and hinting need separate product requirements and cost evaluation.
Core also continues to use BMFont measurement until renderer-specific
measurement is addressed independently.

## Accepted limitations

- Minor convex-corner differences and isolated acute-tip blemishes remain.
- Atlas circles are slightly rougher than analytic circles.
- SDF shadow blur is not Gaussian.
- Translucent glyph effects can accumulate where quads overlap.
- Canonical msdfgen is a development oracle, not a production fallback.

## Primary risks

- Solving rare extremes could make common points or text slower and larger.
- Atlas growth or tier selection could create avoidable rebinding and cache
  pressure.
- A partial shaping implementation could silently render unsupported scripts
  incorrectly; explicit capability boundaries are safer.
- Prototype APIs could become compatibility obligations before normalization,
  error behavior, and resource limits are specified.

The merge decision and complete deferral list are recorded in
[`production-integration-plan.md`](production-integration-plan.md).
