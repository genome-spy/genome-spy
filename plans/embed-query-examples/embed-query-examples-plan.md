# Embed data access and selection examples

## Goal and boundary

Simplify PR #537 so consuming GenomeSpy apps, including apps with agents, can
inspect the visualization and change record membership through small primitives.
Core does not expose a second API that chains its existing controls together.

Existing scale navigation, parameters, dataset updates, view operations, and
exports remain direct controls. The new optional query entry returns detached
metadata and loaded records. A point selection setter resolves record keys
against a unit view's loaded transformed data, independently of its mark type.

Thresholds, summaries, rankings, representative selection, and callout composition
belong in the consuming app. Apps may expose their own agent tools that combine
these primitives and implement application policy. That composition is outside
the GenomeSpy package API. Example controllers demonstrate ordinary application
code, not a reusable orchestration layer.

## Decisions

- Keep `createViewQuery(api.views)`, `describe`, `describeSource`, `readData`,
  `readSourceData`, `assessQuery`, and `queryData` in the optional `view-query`
  entry. The entry stays outside the default/minimal bundles.
- Scope queries retain viewport/interval membership, field projection, output
  limits, cancellation, and captured data/scope revisions. These depend on Core's
  actual scales, encoded positions, interval hit policies, and publication state.
  They read loaded records; they neither fetch missing records nor promise pixel
  visibility or complete lazy-source coverage.
- Remove query aggregation, analysis pipelines, ranks, annotation references,
  annotation assessments, and the specialized point annotation controller.
- Add `PointSelectionApi.setValue(keys)` alongside `getValue`, `subscribe`, and
  `clear`. Each key is a tuple in the source unit view's `encoding.key` order.
  Empty input clears membership. Nonempty writes require ready loaded records,
  unique scalar keys, and complete resolution; invalid input leaves membership
  unchanged. Single selections accept at most one key.
- Obtain the setter through the source unit view's parameter namespace, including
  when the declaration lives in an ancestor or uses `push: "outer"`. The view
  determines which records supply membership. No mark geometry is involved.
- Membership uses the current data publication, just like interactive picking.
  There is no persistent key subscription or automatic rebinding after updates.
  Apps explicitly clear or reapply their selection when replacing data.
- Styling stays in the spec's conditional encodings. Additional labels/callouts
  can be authored as ordinary application-controlled data/layers if needed.

## Three examples

1. **Copy number region summary:** read every scoped toy bin, compute count,
   mean, minimum, and maximum in the page's JavaScript, show five preview rows.
   Demonstrate scale navigation, viewport/brush scope, and cancellation.
2. **Expression record selection:** read the scoped expression records, apply
   both thresholds in page code, and select every qualifying gene by key.
   Conditional size and opacity highlight the original records while retaining
   pathway colors. The table subscribes to the same selection as mouse picking.
   Both thresholds zero in the whole viewport must select all 12 toy records.
3. **Retained gene data:** compare retained source rows with transformed display
   rows while an ordinary parameter changes a display filter. Explain source
   retention and coverage without confusing loaded source rows with all data.

The fixtures are explicitly synthetic. No biological inference or server/model
integration is part of these examples.

## Alternatives and scope changes

The earlier grouped query/ranking pipeline and point-only callout controller are
discarded. They combined analysis and presentation decisions that consuming apps
can make explicitly, and introduced renderer-specific annotation geometry.
Reusing existing key resolution and conditional encodings provides the needed
selection behavior across mark types without those extra concepts.

Data access was missing before this PR; the old controls could change the view
but could not enumerate its loaded transformed/source observations. Keep that
capability rather than forcing agents to inspect private view/dataflow objects.

## Milestones and acceptance

- [x] **Core boundary:** remove combined analysis and annotations; add the key
      setter using existing selection/key infrastructure. Verify point, text and
      rectangle membership, composite keys, missing/ambiguous keys, single-selection
      limits, subscriptions, lifecycle, and source updates through public handles.
      Update public types, optional bundle guards, docs and the minor changeset.
      Tentative commit: `feat(core): simplify data access and add keyed selection writes`.
- [x] **Examples:** revise region summary and expression selection; retain the
      source-data example. Remove obsolete callout lifecycle code and explanation.
      Verify zero thresholds select all 12 records, manual membership shares the
      table, brush scoping, navigation, replacement, clearing, and SVG styling.
      Tentative commit: `feat(embed-examples): highlight every qualifying expression record`.
- [x] **Integration:** run focused Core suites, type/public API and bundle checks,
      docs generation, lint/format, example builds, and WebGL/Canvas interaction tests.
      Inspect the diff for duplicate paths and measure size before/after.
      Deliver through the existing PR without rewriting its history.

## Risks and non-goals

`limit: null` returns all matching loaded records and can be large. The examples
use tiny fixed fixtures; consuming apps choose read limits deliberately. Reads
can become invalid when scope/data changes and callers must handle cancellation.
Keys must be authored, unique, and non-null. Record identity follows the current
publication rather than a persistent cross-publication selection contract.

There is no Core agent toolkit, tool-call chaining, arbitrary analysis execution,
automatic representative selection, callout geometry extension, or new renderer
overlay. No unresolved design questions remain for this scope.

This temporary plan records the PR's revised scope. Reconcile it after
verification and remove it in a later commit before merge.

## Verification record

- 530 unit-test files passed: 5,039 tests passed, two skipped, two todo.
- All six example interaction tests passed across WebGL and Canvas. Verified all
  12 records at zero thresholds, mouse picking, SVG styling/export, clearing,
  brush scope, contrast replacement, and narrow layouts.
- The playground public-API integration passed with its generated schema.
- Workspace TypeScript checks, lint, Core build/emitted consumer typings,
  all-example smoke build, API-reference generation, and optional/minimal bundle
  checks passed. Release policy/status confirm a minor Core change, propagated
  through the fixed release group (1.1.1 → 1.2.0).
- Desktop and narrow screenshots were inspected. The expression table and the
  original conditional marks agree on all 12 selected records.
- Relative to the previous example implementation, Core production source is
  reduced by 967 physical lines (+137 / −1,104). Obsolete analysis/annotation
  tests and generated API pages were removed with their implementations.

The earlier annotation and analysis milestones are discarded as described above;
the three revised implementation milestones are complete. Plan retirement remains
part of preparing the existing PR for merge, outside this update request.
