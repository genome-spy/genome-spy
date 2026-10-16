# Examples for inspecting and annotating visualization data

Design three standalone examples for `packages/embed-examples/src` that show
what an embedding application can read and do through the hooks in
[PR 537](https://github.com/genome-spy/genome-spy/pull/537). Each page answers one
user question with a small synthetic omics dataset, a chart, and an ordinary HTML
results panel. Implementation is based on PR 537 commit `0cc5a115`. The examples use the
optional query API from that branch.

## Goals and boundaries

- Make returned data useful outside the chart: a regional summary, a shortlist
  of findings, or a table of records omitted by a display filter.
- Cover the new hooks without duplicating the existing selection forms,
  persistent annotation editor, view mutation example, or runtime inspector.
- Keep every example self-contained and readable. Use local fixed fixtures,
  ordinary controls, the existing package styles, and no additional dependency.
- Obtain results through the public API. Do not compute a second answer by
  filtering the original fixture in application code.
- Use prepared toy scores and lane assignments. There is no statistical
  inference, model integration, real biological claim, or network dataset.
- Demonstrate loaded-data contracts. Lazy loading, multiple facets, unsupported
  annotation geometries, and large-data benchmarks are outside these examples.

## Shared page design

Keep the current per-directory `index.html`, `index.js`, and optional
`style.scss` structure. A small `data.js` may hold a fixture when that makes the
entry module easier to read; avoid a shared demo framework.

Put the chart beside its results panel on wide screens and stack them on narrow
screens. Start with a task title, a one-sentence instruction, and useful initial
data. Put a reset control near the task controls. Keep the API explanation and
captured metadata in a small expandable section below the working example.
Primary controls use task language rather than API method names.

Import `embed` from `@genome-spy/core/minimal`, register WebGL as in neighboring
examples, and import `createViewQuery` from `@genome-spy/core/view-query` from
the same installed module instance. Use named unit views and public handles.
Do not combine the standalone browser bundle with a separate query bundle.

Use numeric positions in kilobases on an explicitly synthetic locus for the two
track examples. This avoids implying that invented genes or alterations belong
to a real reference assembly. Fixed unconditional quantitative positions also
keep the point example within the annotation contract.

Each page includes: “Synthetic data for demonstrating the embedding API.”
Prepared scores and lane assignments live in the fixture. Explain which
transforms GenomeSpy executes in the browser and which result formatting the
embedding application performs. Show captured scope beside results; a loaded
row is not a guarantee of visible pixels or complete biological-source coverage.

## Example 1 Summarize a copy number region

Directory: `regionSummary`.

User question: “How many observations are in this region, and what is their
average signal?”

### Data and chart

Use 120 synthetic copy number observations. For zero-based index `i`, set
`positionKb = 5 + 10 * i`. Set `log2Ratio` to `0.6` for indices 30 through 49,
`-0.8` for indices 80 through 94, and `0` otherwise. Include a stable `id` and
prepared `state` of gain, loss, or neutral.

Draw a point track named `copyNumber`, with position on x, log2 ratio on y, and
state as color. Start at x domain `[0, 1200]`; y includes all observations.
Use an unnamed zoomable x scale and an x-only interval selection named `region`.

### Interaction and useful output

- Pan or zoom, or choose “Whole locus”, “Gain region”, or “Loss region”.
- Choose scope “Viewport” or “Viewport and brush”. Commit a brush to refine the
  region. A cleared brush in the latter mode produces an explicit empty result.
- Show count, mean, minimum, and maximum from all matching loaded observations.
- Show a five-row preview and wording such as “Showing 5 of 20 matching bins”.
- Display the captured x range and, when used, the brush range.

Refresh on domain changes and committed selection changes. Cancel superseded
queries and prevent an older response from replacing the current result. During
an update, distinguish pending results from a completed empty result.

### API connection

Resolve the track with `api.views.get`, describe it with `query.describe`, and
obtain its x scale with `track.getScaleResolution("x")`. Use the scale's
`zoomTo` and domain events for the preset controls and refreshes. Check the exact
scope with `query.assessQuery`, then call `query.queryData` with `channels: ["x"]`,
`limit: 5`, selected fields, and count/mean/min/max aggregates. Include
`selection: "region"` only in the brush mode. The application formats API
results; GenomeSpy performs the scoped scan and aggregation.

Keep encoding, readiness, revision, and source description details expandable.
Do not describe the five-row preview as the population used for the statistics.

### Acceptance examples

- Gain preset `[300, 500)` returns 20 matches, five preview rows, mean/min/max
  `0.6`, and `truncated: true`.
- Intersecting that viewport with brush `[350, 450)` returns ten matches.
- An empty region shows count zero and an unavailable mean rather than an old
  result or a fabricated zero mean.
- All preset navigation works without assigning a scale name in the spec.

## Example 2 Find and label expression hits

Directory: `expressionFindings`.

User question: “Which strong expression changes should I inspect in each
pathway, and where are they in the plot?”

### Data and chart

Use twelve invented genes in three toy pathway groups. These are prepared
illustrative scores, not results of a differential expression analysis.

| gene  | pathway    | log2FoldChange | negLog10Padj |
| ----- | ---------- | -------------: | -----------: |
| IFN01 | Interferon |            2.4 |          6.0 |
| IFN02 | Interferon |           -1.8 |          4.0 |
| IFN03 | Interferon |            0.4 |          3.0 |
| IFN04 | Interferon |            1.3 |          1.2 |
| CYC01 | Cell cycle |            1.6 |          5.0 |
| CYC02 | Cell cycle |           -2.1 |          5.0 |
| CYC03 | Cell cycle |            0.2 |          0.8 |
| CYC04 | Cell cycle |           -0.6 |          2.5 |
| MET01 | Metabolism |           -1.5 |          3.5 |
| MET02 | Metabolism |            1.2 |          2.5 |
| MET03 | Metabolism |            0.5 |          4.0 |
| MET04 | Metabolism |           -1.8 |          1.0 |

Draw a volcano-like scatterplot named `expression`, with log2 fold change on x,
prepared negative log10 adjusted p-value score on y, and pathway as color. Use
initial domains `[-3, 3]` and `[0, 7]`, a two-axis brush, one facet, and simple
unconditional point encodings. Keep threshold controls out of positional
encodings and scale expressions so annotations remain supported.

### Interaction and useful output

- Set minimum absolute fold change and minimum score; defaults are 1 and 2.
- Choose the viewport or its intersection with a brush.
- Click “Find and label representatives” to show one qualifying gene per pathway
  in a table and attach its gene label, connector, and outline to the point.
- Include each pathway's qualifying population in the table.
- Pan, zoom, and resize to see the applied labels follow their points.
- Click “Clear labels” independently of clearing the brush.
- Switch “Toy contrast A/B” to replace the named dataset. Contrast B changes
  IFN01's score to 1.5. Previous findings clear; a new query selects IFN02.

Label the results with their captured query scope. If the viewport, brush, or
thresholds change, mark the table as needing a new query; applied annotations
can remain until replaced or cleared. Source replacement clears both the old
result presentation and applied findings.

### API connection

Check `assessQuery` and `assessAnnotations` before enabling the action. Query with
`channels: ["x", "y"]`, explicitly disclosed fields, `limit: null`, and
`includeAnnotationTargets: true`. Execute this restricted `analysis` pipeline:

1. Numeric filter: absolute `log2FoldChange >= 1` (or the chosen threshold).
2. Numeric filter: `negLog10Padj >= 2` (or the chosen threshold).
3. Full-partition window grouped by pathway: `row_number` and `count`, sorted
   by score descending and gene ascending, yielding `rank` and `eligibleCount`.
4. Numeric filter: `rank == 1`.

Use `frame: [null, null]` for the window. Do not combine `analysis` with the
separate `aggregate` option. `rowsMatched` counts scoped input observations;
`outputRows` counts representatives after analysis. Window sorting controls
rank, not the order of the returned table.

Pair each returned row with its aligned opaque annotation reference and call
`query.annotations.replace`. Keep the original pathway colors; use an outline
for emphasis. Use `inspect` for applied-count/invalidation status and `clear`
for the clear control. Dataset replacement uses `api.datasets.set` with the
top-level declaration. The application formats rows and labels, while GenomeSpy
executes the filter/group/rank pipeline. This is a deterministic analysis demo,
with no model involved.

### Acceptance examples

- At the initial scope and default thresholds, six genes qualify and the three
  representatives are IFN01, CYC01, and MET01; each has `eligibleCount: 2`.
- CYC01 wins the tied score by the documented gene-name tie breaker.
- The three labels appear in the rendered chart and an SVG export.
- Raising a threshold can produce an empty result and clear the previous set.
- Dataset replacement invalidates the applied set; a new query on contrast B
  selects IFN02 for Interferon.
- No aggregate stage is used to produce point references.

## Example 3 Inspect genes hidden by a display filter

Directory: `retainedGeneData`.

User question: “Did these genes disappear from the data, or did the chart only
stop displaying their lanes?”

### Data and chart

Use eight invented gene intervals on the toy locus, with preassigned lanes:

| gene  | startKb | endKb | lane |
| ----- | ------: | ----: | ---: |
| geneA |      40 |   220 |    0 |
| geneB |     160 |   330 |    1 |
| geneC |     280 |   470 |    2 |
| geneD |     420 |   600 |    0 |
| geneE |     550 |   730 |    1 |
| geneF |     670 |   850 |    2 |
| geneG |     800 |   980 |    0 |
| geneH |     920 |  1100 |    1 |

Draw ranged rules on three prepared lanes in a unit view named `genes`. Set
`retainForInspection: true` on its data declaration. A variable parameter
`shownLanes` drives a browser-side filter `datum.lane < shownLanes`; default to
two lanes. Lanes are fixture values rather than a packing algorithm.

### Interaction and useful output

- Choose one, two, or three displayed lanes through an ordinary HTML control.
- Compare “Loaded before the display filter” and “After the display filter”
  tables, with counts and stable gene identifiers.
- Mark which retained genes were removed by this filter. Both tables show the
  complete tiny collection, so the identifier comparison is exact.
- Zoom to see that reading all loaded transformed rows is different from
  querying rows within a viewport. Neither inspection table is viewport-filtered.

Use `api.params.get("shownLanes").setValue` for the control. Render refreshed
tables after the filter publication is ready, rather than immediately reading
the previous collector revision.

### API connection

Use `query.describe` for encoding/readiness/revision details, `describeSource`
for retention/readiness/coverage, `readSourceData(genes, { limit: null })` for
the retained table, and `readData(genes, { limit: 1000 })` for transformed rows.
The source is retained before view transforms; it is not an unparsed file.
Compare returned identifiers only after both reads succeed, with no truncated
result. Keep the dataflow explanation next to the two tables.

### Acceptance examples

- One, two, and three lanes produce 3, 6, and 8 transformed rows respectively.
- The retained table contains eight rows in every setting.
- At two lanes, geneC and geneF are absent from transformed rows and present in
  retained rows. Increasing the setting restores them without reloading data.
- Source metadata reports retention enabled and complete eager-source coverage.
- Zooming does not turn either whole-loaded-data inspection table into a
  viewport query. Presentation says “after the filter”, not “visible pixels”.

## Package integration and alternatives

Add an “Inspect data and show findings” section to the package catalog and
update its example count. Link each page to the view-query guide and provide
brief usage instructions in the existing README. Follow neighboring example
structure and styles rather than redesigning the package.

Cars data could demonstrate grouping and ranking, but the copy number, gene,
and expression fixtures directly explain the omics workflows and need no
external download or attribution. A single large dashboard would hide which
hook enables each task. A fourth generic inspector would overlap the existing
inspector example. A lazy-source coverage demo is a possible later example
when a small reliable fixture and a separate teaching goal justify it.

The established reference pattern is a public runtime API connecting a chart
to host-owned controls and tables, as in the existing package and
[Vega's View API](https://vega.github.io/vega/docs/api/view/#data-and-scales).
No external code or datasets need to be copied.

## Delivery milestones and verification

1. **Regional inspection.** Add `regionSummary` with its fixture, summary, row
   preview, presets, and scoped-query explanation. Verify the 20-bin gain result,
   brush intersection, cleared selection, and rapid scope changes in a browser.
   Tentative commit: `feat(embed-examples): demonstrate regional data summaries`.
2. **Findings and annotations.** Add `expressionFindings`, the deterministic
   pipeline, annotation controls, and named-data replacement. Verify tied ranking,
   output/reference alignment, rendered labels, navigation, resize, clear, and
   source invalidation. Tentative commit:
   `feat(embed-examples): demonstrate expression findings and labels`.
3. **Source inspection and catalog.** Add `retainedGeneData`, both tables, filter
   controls, and catalog/README links for all three examples. Verify 3/6/8 versus
   eight rows, publication timing, and loaded-versus-viewport wording. Tentative
   commit: `feat(embed-examples): demonstrate retained source inspection`.

Keep verification focused on public behavior, not new tests for Core internals.
Use the existing package type check and smoke build, repository lint/formatting
for changed files, and focused browser scenarios for the interactions above.
Check WebGL and Canvas rendering with their corresponding registrations;
WebGPU is not required for these example pages. Include the annotation SVG
export, narrow-layout readability, and clean page disposal in final integration.
Review the three examples together after the milestones; no Core API changes
are planned.

## Risks and open decisions

The implementation targets the current PR 537 hook contracts. Retention has a memory cost,
so opt in only in the source-inspection example. Annotated geometry must remain
within the current point contract. Query cancellation is cooperative; the host
must not present an obsolete response as a current result. Small fixed datasets
make outcomes inspectable but do not demonstrate scale or biological inference.

There are no blocking product decisions: start with the datasets, three pages,
and browser-only workflows specified here. Any later Python bridge or agent
integration is a separate consumer of these same hooks.

## Implementation references

- [Current embedding package](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples/src)
- [PR hook guide](https://github.com/genome-spy/genome-spy/blob/0cc5a115345f96f161a0bdd27e7d35985bfedb12/docs/api/views.md#choosing-a-hook)
- [Query types](https://github.com/genome-spy/genome-spy/blob/0cc5a115345f96f161a0bdd27e7d35985bfedb12/packages/core/src/types/viewQueryApi.d.ts)
- [Public API browser workflow](https://github.com/genome-spy/genome-spy/blob/0cc5a115345f96f161a0bdd27e7d35985bfedb12/packages/playground/tests/viewQuery.playwright.js)

## Expanded hook coverage

Keep the three workflows. Make `describe` and `describeSource` useful through
readable track and source information beside each chart, with exact returned
metadata expandable. These panels expose field encodings, data readiness and
revision, configured visibility/opacity, retention, loading status, and known
source coverage. Configured visibility is not proof of visible pixels.

Add a second expression query that filters qualifying genes and aggregates by
pathway, returning count and mean fold change. The grouped table has no point
references. Run a separate row-preserving window/rank query to obtain the
representatives and their annotation targets. Both queries use the same captured
scope; cancel superseded requests and publish their results together.

Use assessment results to enable actions or explain pending/unsupported states.
Show annotation count and invalidation through `inspect`, expose `clear` as a
user action, and demonstrate `dispose`, unsubscribing, and embed finalization in
page teardown. Cancellation and captured scope/revision metadata belong in the
example code and API explanation rather than additional standalone pages.

A lazy-source loading and coverage example is explicitly deferred: these fixed
eager fixtures demonstrate complete loaded sources, not lazy publication bounds.

## Implementation status

- [x] Regional summary, track information, source information, and cancellation.
- [x] Expression pathway summary, representative labels, and data invalidation.
- [x] Retained source and transformed-row tables with settled filter updates.
- [x] Catalog, build entry points, README, and focused browser regression tests.
- [x] Package types, build, lint, formatting, and WebGL/Canvas browser verification.

## Completed verification

Implemented all three pages on `codex/embed-query-examples`, based directly on
PR 537 commit `0cc5a115345f96f161a0bdd27e7d35985bfedb12`. The primary checkout's
existing changes were not included.

- All six focused Playwright scenarios pass, covering the three workflows on
  WebGL and Canvas. They exercise real brushing, superseded regional queries,
  complete-population aggregation with limited output, grouped summaries,
  deterministic ranking, rendered SVG labels and download, annotation clearing,
  source replacement, empty results, lane filtering, reset, page-exit disposal,
  and narrow layouts.
- The package's five existing unit tests pass across three files.
- Package TypeScript, repository source lint, focused test/config lint, and
  Prettier checks pass.
- The production smoke build includes all eighteen examples and the catalog.
- Desktop and phone-width screenshots were inspected. The visual review removed
  an obsolete initial message from the findings panel and restricted lane axis
  labels to the three prepared lanes.

No Core implementation changes or new dependencies were needed. The lazy-source
coverage example remains deferred as described above. Keep this completed plan
until change delivery; reconcile and retire it before opening a PR.
