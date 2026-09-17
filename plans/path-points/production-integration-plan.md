# Production integration record for GPU paths and outline fonts

Status: complete and reconciled for branch retirement

## Merge decision

This branch will merge the renderer infrastructure and the existing WebGPU
integration without exposing new path, font-selection, or text-effect
properties in GenomeSpy's public grammar.

The intentionally limited scope avoids carrying a large feature branch while
the WebGPU renderer is still evolving. It does not make the prototype renderer
APIs a cross-backend compatibility contract.

## Included outcome

- One renderer-owned sparse WebGPU MSDF generator serves SVG paths and static
  TrueType glyphs using bounded scratch resources and `rgba16float` output.
- A fixed regular circle retains the analytic point fast path. Other fixed
  named shapes and finite path tables can use generated atlases.
- Path-specific bounds and miter extents minimize quad expansion. Centered and
  inward strokes have explicit representability clamps.
- Outline text supports lazy glyph generation, atlas growth, replacement,
  picking, baselines, ranged text, basic kerning, and small-text supersampling.
- The focused static-TTF reader supports `glyf` outlines, composites, Unicode
  `cmap`, horizontal metrics, GPOS Pair Adjustment, and legacy `kern` fallback.
- The Lato-derived Default Font remains a separate renderer entry so
  point-only bundles exclude it and the parser.
- Core retains BMFont measurement. Its dynamically loaded WebGPU adapter uses
  a temporary lazy catalog for fonts required by examples. WebGL-only use does
  not load that integration.
- Canonical msdfgen lives in the separate `msdfgen-oracle` repository and is
  fetched only by explicit comparison tooling. Production exports and bundles
  contain no msdfgen binary or source.
- Glyph-based outline and SDF shadow/glow rendering remains a renderer-level
  proof of concept. Effect-free text keeps its direct glyph fast path.

## Verification accepted for merge

- Focused unit and GPU regressions cover parsing, atlas generation and growth,
  paths, glyphs, strokes, effects, picking, rotation, corner topology, and
  retained updates.
- Stress coverage grows and rebinds an outline atlas across thousands of
  labels and verifies stable reuse during repeated replacements.
- Browser smoke tests rendered the required lollipop, text-quality,
  text-baseline, plenty-of-points, sequence-logo, and MSA examples at DPR 1
  and 2. MSA and lollipop zoom/pan interactions repainted successfully.
- Manual MSA profiling after constant-time text program-key lookup found
  interaction performance acceptable.
- The available Apple Metal 3 adapter accepted the exact `rgba16float`
  storage, linear sampling, render, and copy usage without validation errors.
  These operations are core WebGPU and require no optional feature.
- Package and tree-shaking checks keep Default Font, TrueType parsing, and the
  development oracle out of consumers that do not request them.

## Accepted limitations

- Minor convex-corner differences and isolated acute-tip stroke blemishes can
  remain at particular rotations and widths.
- Atlas circles are slightly rougher than the analytic circle.
- Small points with disproportionate strokes are clamped to the ordinary
  atlas range.
- The font reader is not a general shaping engine. GSUB, complex scripts,
  bidi, fallback runs, variable fonts, CFF/CFF2, WOFF2, color fonts, and
  hinting are unsupported.
- SDF shadow blur is not Gaussian, and translucent per-glyph effects can
  accumulate where glyph quads overlap.
- Exact rendering parity between WebGPU, WebGL, Canvas2D, and SVG is not part
  of this renderer-infrastructure merge.

## Deferred outside this branch

Every item below is explicitly discarded from this branch's scope and may be
reconsidered as separate product work with its own requirements and plan:

- Exposing SVG point paths, outline-font selection, or text effects in the
  public Core grammar.
- Defining backend-neutral Canvas2D/SVG outline and shadow semantics or adding
  equivalent behavior to the retiring WebGL renderer.
- Adding a compact wide-range atlas tier for unusually small, heavily stroked
  point marks or unusually wide text effects.
- Replacing Core BMFont measurement with renderer-provided measurement.
- Defining public path normalization, fill-rule, unique-path-limit, and
  incremental unseen-path contracts.
- Expanding the focused reader into full shaping or broader font-container
  support.
- Additional five-million-point, supersampling-cost, package-size, cold-font,
  peak-memory, or cross-adapter benchmarks beyond the accepted coverage.
- Testing another adapter family, persistent atlas caches, atlas repacking,
  device-loss recovery beyond existing infrastructure, and hosted font
  resolution.

These are follow-up opportunities, not merge blockers. Any future public API
must be designed independently rather than inferred from the current low-level
renderer interfaces or temporary WebGPU font catalog.

## Retirement

The sibling files are completed feasibility and provenance records. After this
reconciliation is committed, the entire temporary `plans/path-points/`
directory can be deleted in a later commit. Durable implementation details and
attribution remain in package documentation and adjacent source notices.
