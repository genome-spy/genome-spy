# Surround composition: literature and system survey

Researched 2026-10-15; Marsilea comparison added 2026-10-16. Focus: a central plot with aligned marginal plots, and
recursive compositions in which a marginal plot has marginal plots of its own.
The remembered Python package has not been identified conclusively.

## Most useful precedents

| System                                      | What is demonstrated                                                                                                                          | Recursive/coordinate caveat                                                                                                                                                                 | Relevance                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Marsilea (Python)                           | Compose annotated cross-layout boards around a main board, aligning their main rectangles and measuring outward side extents                  | The reviewed `CompositeCrossLayout.append` accepts ordinary cross-layouts and rejects another composite cross-layout; figure composition does not establish unlimited recursive API support | Direct precedent for the user's figure, separate main anchors, and free-corner occupancy      |
| patchworklib (Python)                       | Nested Matplotlib plot assemblies; attach another assembly beside a named subpanel using `target`/label indexing                              | Its layout API documents geometric placement and sizing. That alone does not establish automatic shared data domains or coordinated navigation                                              | Strong candidate for the remembered visual impression; explicit inner-panel alignment targets |
| cowpatch (Python)                           | Nested plotnine/SVG assemblies, layout matrices/strings, unequal rows/columns and empty regions                                               | Nested figure arrangement is demonstrated; automatic shared scales are not established by the reviewed layout guide                                                                         | Another plausible remembered package, especially for irregular publication figures            |
| PyComplexHeatmap (Python)                   | Compose independently annotated heatmaps horizontally or vertically; coordinate row/column ordering through a designated main heatmap         | This is demonstrated composition of annotated matrices; arbitrary recursive side-panel support was not verified                                                                             | Strong candidate if the remembered figures were biological heatmap assemblies                 |
| HoloViews (Python)                          | Marginal plots through `AdjointLayout`, plus layouts/overlays and dimension-based linked axes in the Bokeh backend                            | `AdjointLayout` has main/top/right slots, not an unrestricted recursive four-sided grammar                                                                                                  | Separates semantic coordinate linking from physical figure layout                             |
| CoolBox (Python)                            | `JointView(center, top=..., right=..., bottom=..., left=...)`, with composite genomic-track frames around a contact matrix                    | Reviewed joint-view examples show one central contact matrix; arbitrary recursive JointViews were not verified                                                                              | Direct Python precedent for the five-region API                                               |
| HiGlass (JavaScript, with Python authoring) | A view contains center/top/right/bottom/left track lists, coordinated positional scales, and separate inter-view navigation locks/projections | Multiple coordinated views are not the same as recursive side-region nesting                                                                                                                | Closest existing interactive genomic precedent                                                |
| ggalign (R)                                 | Data-aware quad/stack layouts, nested annotated heatmaps, common observation ordering, and continuous/discrete alignment modes                | Its nesting guide explicitly restricts a stack containing a quad inside another quad's annotation                                                                                           | Most instructive documented nesting contract, including its limitations                       |
| codaplot (Python)                           | General cross plots with multiple central plots, marginal annotations, group spacers, and configurable plotting callbacks                     | Source examples demonstrate data/coordinate preparation; recursive marginal nesting was not verified                                                                                        | Supports a generic composition concept instead of a heatmap-only API                          |
| Matplotlib axes_grid1 (Python toolkit)      | `AxesDivider.append_axes` attaches axes to any of four sides; `sharex`/`sharey` links coordinates; drawing-time sizing                        | It is a low-level host/attachment mechanism, not evidence that an arbitrary recursive arrangement is automatically correct                                                                  | Useful model for distinguishing attachment geometry and shared scales                         |

Capability statements above are limited to the primary documentation/source
reviewed. Appearance in a static figure is not evidence of common domains,
matching pixel projections, or linked pan/zoom.

## Primary documentation and source

### Marsilea

[Concatenation tutorial](https://marsilea.readthedocs.io/en/stable/tutorial/concatenation.html),
[layout implementation](https://github.com/Marsilea-viz/marsilea/blob/main/src/marsilea/layout.py),
and [paper, Figure 1d](https://doi.org/10.1186/s13059-024-03469-3).

`CompositeBoard` composes boards that already have their own side annotations.
With default `align_main=True`, the appended main plot's height is adjusted for
left/right attachment, or its width for top/bottom attachment. Geometry is
anchored to the main plotting rectangle, not the complete decorated footprint.

`CompositeCrossLayout.get_side_size` takes the maximum of the extent built
outward on that side and the annotations extending there from perpendicular
boards. This lets panels occupy free corners. The reviewed placement code
computes bounds and anchors; it does not establish a general collision solver.
Maximum extents alone therefore do not prove arbitrary combinations collision-free.
The paper discusses recursion conceptually, while the reviewed concatenation
method rejects appending a composite cross-layout. Record that API limit
separately from its support for composing individually annotated boards.

For GenomeSpy, this supports maximum outward extents plus explicit structural
collision validation, while preserving local scale ownership and navigation as
separate contracts. No Marsilea implementation code is copied.

### patchworklib

[API: hstack/vstack with a named target](https://github.com/ponnhide/patchworklib/blob/main/API.md)
and [examples / advanced label indexing](https://github.com/ponnhide/patchworklib).

The API can attach a plot to a specific Brick or Bricks assembly inside a larger
assembly. Nested arithmetic and inner-target attachment make it a plausible
match for side panels with side panels. The important design lesson is that an
attachment target can be an inner plotting panel rather than the complete
decorated figure. Shared scales must be assessed separately.

### cowpatch

[Layout and nested arrangements](https://benjaminleroy.github.io/cowpatch/guides/Layout.html).

The guide explicitly nests one complete patch inside another and supports
relative sizing, spanning layout cells, and empty space. It builds composed SVG
figures from plotnine plots. This establishes layout recursion; it does not by
itself establish interactive coordinate sharing.

### PyComplexHeatmap

[Composite heatmap example](https://dingwb.github.io/PyComplexHeatmap/build/html/notebooks/composite_heatmaps.html),
[composite API](https://dingwb.github.io/PyComplexHeatmap/build/html/PyComplexHeatmap.clustermap.html),
and [composite implementation](https://dingwb.github.io/PyComplexHeatmap/build/html/_modules/PyComplexHeatmap/clustermap.html).

`composite` assembles ClusterMapPlotter objects that may already carry their own
annotations. Horizontal composition shares the main heatmap's row ordering;
vertical composition shares its column ordering. This can produce the visual
impression of annotated side panels even without an unrestricted recursive
annotation grammar. It is especially relevant to preserving an aligned body
inside independently decorated components.

### HoloViews

[AdjointLayout reference](https://holoviews.org/reference_manual/holoviews.core.layout.html)
and [linking plots](https://holoviews.org/user_guide/Linking_Plots.html).

AdjointLayout supplies a primary plot plus top/right marginal plots. HoloViews
also links Bokeh ranges using matching dimensions. Its dimensions provide
semantic coordinate identity independently of how plots are arranged.

### CoolBox

[JointView gallery](https://gangcaolab.github.io/CoolBox/_gallery/joint_view.html).

The gallery constructs four composite frames around a matrix using exactly the
center/top/right/bottom/left vocabulary. Genomic x and y ranges can differ.
This is a direct authoring precedent for region-specific coordinate roles.

### HiGlass

[View configuration](https://docs.higlass.io/view_config.html),
[view-wide scales](https://docs.higlass.io/views.html), and
[Python view authoring](https://docs-python.higlass.io/getting_started.html).

The configuration has five track regions. Center tracks navigate two positional
dimensions; horizontal and vertical tracks expose their corresponding aligned
dimension. Per-view positional coordinates and inter-view zoom/location locks
are separate concepts. This is more relevant to GenomeSpy interactions than a
static publication-figure composer.

### ggalign

[Quad/heatmap layout](https://yunuuuu.github.io/ggalign-book/heatmap-layout.html),
[nested layouts](https://yunuuuu.github.io/ggalign-book/multiple-quad-layouts.html),
and [alignment/guide schemes](https://yunuuuu.github.io/ggalign-book/schemes.html).

Stack and quad layouts can nest with compatible alignment modes and shared
observation order. Parent layout sizing can take precedence over nested sizing.
The nesting guide also explicitly prohibits putting a quad-containing stack in
another quad's annotation, so it must not be cited as proof of unrestricted
annotations-of-annotations. Its explicit constraints are useful design evidence.

### codaplot

[Cross-plot examples](https://github.com/stephenkraemer/codaplot/blob/main/doc/examples_nb.py)
and [API rationale](https://github.com/stephenkraemer/codaplot/blob/main/doc/api_design_decisions.org).

The author's rationale explicitly favors the general cross-plot API over a
nearly identical annotated-heatmap API. Examples include multiple central
matrices, surrounding measurements, and shared ordering/spacing preparation.
These are source-level examples; a polished recursive-layout gallery was not
verified.

### Matplotlib

[axes_grid1 / AxesDivider](https://matplotlib.org/stable/users/explain/toolkits/axes_grid.html).

The documented marginal-histogram example combines four-sided attachment with
explicit `sharex`/`sharey`. The toolkit computes geometry at drawing time and
distinguishes fixed physical padding from scale-dependent plot dimensions.

## Papers to retain in the design bibliography

- Zheng et al. (2025), **Marsilea: an intuitive generalized paradigm for
  composable visualizations**, Genome Biology 26:5.
  [Paper](https://doi.org/10.1186/s13059-024-03469-3).
  Figure 1d is the user's concrete precedent for attaching independently
  annotated main plots around a central board and occupying free corners.
- Javed and Elmqvist (2012), **Exploring the Design Space of Composite
  Visualization**, IEEE PacificVis, pp. 1–8.
  [Author manuscript](https://www.cs.au.dk/~elm/pdf/compvis.pdf),
  [DOI](https://doi.org/10.1109/PacificVis.2012.6183556).
  Provides a broader taxonomy of visual composition, including juxtaposition,
  superimposition, overloading, nesting, and integration. Its nesting category
  should not be equated automatically with recursive marginal-layout APIs.
- Kerpedjiev et al. (2018), **HiGlass: web-based visual exploration and analysis
  of genome interaction maps**, Genome Biology 19:125.
  [Paper](https://link.springer.com/article/10.1186/s13059-018-1486-1).
  Relevant evidence for interactive 1D/2D track composition and coordinated
  navigation.
- Xu et al. (2021), **CoolBox: a flexible toolkit for visual analysis of genomics
  data**, BMC Bioinformatics 22:489.
  [Paper](https://doi.org/10.1186/s12859-021-04408-w).
  Describes composable track elements and joint viewing of contact matrices.
- Ding, Goldberg, and Zhou (2023), **PyComplexHeatmap: a Python package to
  visualize multimodal genomics data**, iMeta e115.
  [Paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC10919210/),
  [DOI](https://doi.org/10.1002/imt2.115).
  Relevant evidence for multiple annotation types and composed annotated
  heatmaps.
- Peng et al. (2025), **ggalign: Bridging the Grammar of Graphics and Biological
  Multilayered Complexity**, Advanced Science 12:e07799.
  [Paper](https://advanced.onlinelibrary.wiley.com/doi/10.1002/advs.202507799).
  Relevant evidence for data-aware stack/quad/circular layouts and heterogeneous
  relationships. Use documentation to establish exact supported nesting.

## Implications for GenomeSpy

These are design deductions from the survey, not claims made by the sources.

1. Keep the composition generic. HiGlass, CoolBox, and codaplot support the
   center-and-sides vocabulary without defining the center exclusively as a
   heatmap.
2. Make recursive alignment an explicit contract before promising it. A
   composite component has a full layout footprint and an inner plot alignment
   anchor. A parent may need to align the anchor while reserving the child's own
   side panels outside it. Equal outer rectangles do not establish that contract.
3. Scope validation by exported coordinate participation. Example: the outer
   matrix's right bar chart shares row y; a histogram above that bar chart shares
   its measurement x and owns a different y. Rejecting every descendant with a
   different y would incorrectly reject the histogram. Silently ignoring every
   independent y would also conceal accidental disconnections of the bar chart.
   A nested surround needs a structural boundary defining which plots export
   the outer aligned coordinate and which own local perpendicular coordinates.
4. Specify which scale a nested annotation follows. Continuing the example,
   the histogram's x must use the right bar chart's measurement scale, not the
   original matrix's column scale. Perpendicular isolation must become the
   nested composition's local coordinate owner.
5. Test body alignment with asymmetric inner decorations and actual side plots,
   plus pan/zoom. A picture with aligned edges is insufficient verification.
6. Keep static layout assembly, common row/column ordering, shared domains,
   matching screen projections, and linked interaction separate in the API and
   acceptance criteria. Existing systems offer different subsets of these.
7. Let nested structural panels occupy free corners, as illustrated by Marsilea.
   Use maximum outward extents for enclosing bounds and validate actual occupied
   panels separately. Avoid adding headroom for panels that fit beside each other.

The existing plan covers the first center-and-sides composition and ordinary
unit/layer children; authored concat children are deferred. A general nested-surround promise needs the anchor,
participation, and local-coordinate contracts above; it is not established by
adding SurroundSpec to the recursive union. Record that design gap explicitly
before widening the first-version guarantee. The first implementation deliberately keeps those nested layouts out of scope.

No external implementation code was copied. Any future code adaptation needs a
separate license/provenance check.
