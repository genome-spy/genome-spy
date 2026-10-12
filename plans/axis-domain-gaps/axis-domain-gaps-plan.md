# Axis domain lines with grouping gaps

Status: closed; implementation discarded at the user's request. Gapped axis
domain lines remain unsupported. This document records the investigation and
the decision; it does not propose further implementation.

## Decision and supported workaround

AxisView continues to draw a continuous domain line when grouping gaps are
enabled on an index or locus scale. Authors can disable the line with
`axis: { domain: false }` on the positional encoding. Grouping gaps in plotted
marks retain their existing behavior.

Splitting the generated domain line is feasible, but its benefit does not
justify the extra guide structure or shared rendering capabilities required.
The user chose to leave this feature unsupported rather than implement either
of the viable approaches below.

No implementation changes were made. Production SLOC effect: zero. The
implementation estimate was not measured because implementation was cancelled.
This internal decision record has no release impact.

## Objective investigated

Automatically split the domain line at grouping gaps for index and locus scales,
while preserving the existing continuous line when gaps are disabled. Avoid
adding an axis option or changing the scale grammar.

Ordinary ranged marks crossing a gap would retain their existing behavior.
Ticks, labels, gap mapping, inversion, and viewport clipping were outside the
proposed change.

## Findings in the current implementation

- `packages/core/src/view/axisView.js`, in `createAxis()`, generates the domain
  as one rule with `data: { values: [{}] }` and `clip: false`. Its main-axis
  endpoints use viewport coordinates, so the line crosses every gap.
  `createGenomeAxis()` builds on the same function.
- AxisView and plotted marks share a resolved scale. Setting `clamp: true` on
  that scale would move offscreen endpoints before ordinary viewport clipping.
  This changes diagonal rule slopes and link geometry, so shared scale clamping
  is unsuitable for this feature.
- A shared AxisView can occur at different extents in one completed layout.
  Its collectors are shared across these occurrences. Detached exports can
  also arrange a different size without broadcasting `layoutComputed`.
  A single CPU-preprojected dataset cannot represent these occurrences.
- Existing rule encodings support half-open cut-to-cut intervals, a scaled
  primary endpoint paired with a literal viewport secondary endpoint,
  CSS-pixel offsets, and clipping along just one axis.
- Index projection floors data coordinates, and GPU index inputs use finite
  unsigned packing. Negative indices or infinities would require a new input
  contract; they are unnecessary with the accepted finite-extent semantics.
- `ScaleResolution.observeMapping()` observes completed mappings, including
  reactive gap changes and scale replacement. Its zoom-extent subscription
  also signals reference and loaded-extent changes.

## Viable approaches considered

### Four ordinary rule layers

A small internal guide source would emit role-tagged rows for four fixed layers:

1. The existing continuous fallback when gaps are disabled.
2. The exterior interval before the first cut.
3. All intervals between adjacent cuts.
4. The exterior interval after the last cut.

Interior intervals use ordinary half-open endpoint affinity. Exterior rules
pair a scaled cut with a literal viewport endpoint. The existing CSS offset
expresses the before side of the first cut. Overshooting viewport anchors and
directional clipping handle offscreen cuts and partial gaps.

This approach reuses existing renderer contracts but adds guide-source
lifecycle, several encoding shapes, exterior offsets, reversal handling, and
clipping/cap details. It was rejected as too much machinery for this feature.

### Finite intervals with local clamping and collapsed-rule suppression

Given a stable finite reference extent `[a,b)` and internal cuts `c0 ... cn`,
generate ordinary half-open intervals:

```text
[a, c0), [c0, c1), ..., [cn, b)
```

Use one enabled rule layer and retain the original continuous fallback for
disabled gaps. Existing endpoint affinity places each start after its gap and
each end before its gap. Clamp the final projected endpoints to the occurrence
viewport, then suppress rules whose projected endpoints coincide. Suppression
must precede minimum-length expansion, caps, and tangent normalization.

The user accepted leaving outer padding uncovered when gaps are enabled. The
domain line can start and end at the true finite extent, including when panning
beyond it. No infinities, integer sentinels, mixed coordinate spaces, or special
exterior affinity are necessary.

This is a clean geometry model, but requires additional shared behavior:

- Define and observe a stable full/reference extent independent of navigation:
  the genome span for locus, and a configured/full extent for index. The exact
  index extent policy and read API were not finalized.
- Clamp only the generated domain rules, preserving shared scale behavior for
  ordinary marks. Projection must use each occurrence's viewport.
- Add explicit collapsed-rule suppression consistently to WebGL, WebGPU,
  Canvas2D, SVG, and applicable picking paths. Existing zero-length rules may
  intentionally produce visible marks, so changing every rule is unsuitable.
- Switch the generated source between segments and the continuous fallback
  when reactive gap width or positions enable or disable gaps. Navigation and
  resized exports should retain data-domain interval rows.

An independent subagent agreed this approach is feasible without additional
architectural blockers. A numerical check covered 32 combinations of domain,
range direction, occurrence extent, and outer padding. This was a geometry
probe, not a renderer or integration test. The user rejected proceeding with
the additional rendering behavior for this use case.

## Other alternatives

- **CPU projection and interval subtraction:** simple in isolation, but needs
  occurrence-specific data for shared axes and resized exports.
- **Secondary `scale: null` or explicit endpoint-side metadata:** broadens the
  encoding contract across projection and packing paths for a small guide
  feature. It does not remove all exterior-endpoint complexity.
- **Infinite outer endpoints:** unnecessary after accepting finite bounds and
  outer padding; would add packing and projection contracts.
- **Shader masking:** needs fragment gap queries and resources, matching
  Canvas/SVG behavior, and stroke-cap decisions.
- **Background-colored covers:** fails on transparent or nonuniform backgrounds
  and adds ordering constraints.

Comparable established designs informed the investigation:
[D3 axes](https://d3js.org/d3-axis) own a separate domain path;
[D3FC discontinuous scales](https://github.com/d3fc/d3fc/blob/master/packages/d3fc-discontinuous-scale/README.md)
remove data intervals;
[Matplotlib broken axes](https://matplotlib.org/stable/gallery/subplots_axes_and_figures/broken_axis.html)
compose axes and spines. Their contracts differ from fixed-output-width gaps.
No implementation code was copied.

## Final task disposition

- Completed: investigate existing axis, scale, source, and renderer contracts.
- Completed: compare the four-layer and simpler endpoint alternatives.
- Completed: independent subagent review of feasibility and simplification.
- Completed: record the unsupported-feature decision and existing workaround.
- Discarded: add an internal guide source, descriptor, and generated layers.
- Discarded: add local endpoint clamping or collapsed-rule suppression.
- Discarded: finalize a finite reference-extent API and index extent policy.
- Discarded: implement axis geometry, lifecycle, shared-placement, export, and
  reactive-gap regression tests.
- Discarded: add user-facing feature documentation and release notes.
- Discarded: perform browser integration checks and a post-implementation
  subagent review/fixing pass; there is no implementation to verify or review.

Keep this reconciled record in Git history. Follow the repository's later plan
retirement workflow before creating a PR or merging; no implementation work
remains authorized by this plan.
