# Minimal embed data readback and selection writes

## Goal and boundary

PR #537 adds only two primitives: `ViewHandle.readData({limit})` and
`PointSelectionApi.setValue(keys)`. Existing named scales, parameters, datasets,
view operations, loading observations, and exports supply the other controls.
Application code owns analysis and may compose those controls into agent tools.
Core does not gain an orchestration or combined analysis API.

## Decisions and alternatives

- Read only the unit view's current transformed collector. Return `{rows,
truncated}` synchronously, with an explicit nonnegative safe integer limit.
  Values are detached and omit internal picking identifiers. No source retention,
  extra metadata model, factory/module, query assessment, field projection,
  revisions, or viewport/brush querying is needed for this boundary.
- Apps already know their authored specs and may read existing named scale domains
  and interval parameters. They interpret their own coordinates, overlap rules,
  thresholds, coverage requirements, and analysis. Readback does not fetch data,
  recover filtered-out input, or establish pixel visibility or source coverage.
- Keep native key-based point-selection writes. Keys resolve atomically through
  the source unit's `encoding.key` against its ready current collector, including
  inherited selections. Missing/ambiguous keys reject the write. Empty input
  clears; single selections accept at most one key. Existing conditional encodings
  render the same selection across point, text, and rectangle marks.
- Membership follows the current publication. Apps clear/reapply when replacing
  a dataset; Core does not add persistent key rebinding.
- Ordinary parameter-driven custom highlighting was already possible. The setter
  is needed for assigning native selection membership, with its existing reads,
  subscriptions, and condition semantics, rather than for every highlight effect.
- Discard the earlier analysis/ranking and annotation controller, optional query
  module, source retention, metadata/assessment APIs, scoped query engine, and
  per-view scale accessor. Existing public controls plus these two additions cover
  the intended examples with a much smaller Core surface.

This follows GenomeSpy's existing dataset-write and parameter-write separation:
read records, make an explicit app decision, then write data or membership. It
introduces no dependency on another project's query framework or renderer geometry.

## Why the additions are needed

Old scale/brush APIs return bounds, not all records in a region. Old dataset APIs
accept input, not the output of Core's filters/formulas/lazy publications. Picking
returns individual hits and point snapshots contain selected rows; neither
enumerates arbitrary loaded transformed records. Debug view access could expose
internal collectors but is not a detached, bounded public record contract.
Apps owning all input and reproducing every transform can avoid readback, but that
duplicates Core's pipeline and cannot generally inspect its current publication.

Old point selections could be read, observed, and cleared, but not assigned by
key. Custom variable parameters could reproduce highlighting appearances without
changing native point-selection membership. The new setter fills that specific gap.

## Examples

All three use tiny generic JSON files loaded by Core, not arrays imported into
the page controller. The page explains the old API's gap and each addition's role.

1. `transformedData/`: existing parameter writes change a filter; readback shows
   the resulting records and a Core-derived length without repeating the pipeline.
2. `regionSummary/`: read transformed records, use existing named scales/brush
   snapshots to filter numeric point coordinates in app code, calculate statistics
   over every match, and show a five-row preview. Reject truncation first.
3. `recordSelection/`: app thresholds and range filtering choose every qualifying
   key; the setter publishes native membership and conditional size/opacity render
   it. Clicking records and the subscribed table share that membership. Both
   thresholds at zero select all 12 records in the whole viewport.

## Genome browser workflow

An app resolves a gene through its annotation index and navigates the existing
named locus scale. A brush is read through the interval-selection snapshot, or
written through the existing parameter API using linear assembly coordinates.
Chromosome-to-linear conversion requires the app's assembly metadata; the embed
API has no public genome-coordinate converter or gene-name resolver.

After awaiting current visible lazy requests, read a reference unit that actually
contains loaded sequence bases. The app filters to its chosen half-open brush,
sorts and verifies complete base coverage, analyzes the sequence, and writes
`{chrom,pos,base,score}` rows into an existing empty named dataset. A predeclared
text track with `logoLetters`, `fitToBand`, `y=0`, and `y2=score` displays dynseq
heights. The app can alternatively insert such a track through the existing view
API. Composite `[chrom,pos]` keys set membership in that track and conditional
encodings highlight its original letters.

These primitives cover the workflow for an app-authored browser with reference
data and gene/assembly metadata. Missing bases must be fetched by the app's
reference provider or loaded by the configured source; readback does not fetch
them. Analysis execution, cancellation/stale-result policy, and agent tools remain
app responsibilities. A browser integration exercises a second contig to verify
linear brush coordinates, exact sequence extraction, an initially empty logo
dataset, score updates, and native selection on the resulting text marks.

## Milestones and acceptance

- [x] **Minimal Core contract:** remove the broader query/retention paths; keep
      detached loaded-record reads and mark-independent keyed selection writes.
      Verify limits/truncation, transforms, facet batches, cloning, readiness,
      lifecycle, selection errors, inheritance, and source updates. Update types,
      API docs and the minor changeset.
      Tentative commit: `refactor(core): narrow embed additions to readback and selection`.
- [x] **Focused examples:** convert fixtures to Core-loaded URLs, use existing
      named scales and parameters, make app filtering/analysis explicit, and explain
      why readback/native selection writes fill gaps. Remove the retained-source demo.
      Tentative commit: `refactor(embed-examples): demonstrate minimal data primitives`.
- [x] **Integration and delivery:** verify Core suites, workspace types, emitted
      consumer types, bundle checks, API generation, lint/format, all-example build,
      WebGL/Canvas workflows, and reference-to-logo analysis integration. Measure the
      reduction, update the existing PR body/API table, and deliver without rewriting
      history. Tentative commit: `refactor(core): keep minimal embed data primitives`.

## Risks and non-goals

Limits bound record count, not nested value size or analysis runtime. Apps must
reject truncation when completeness matters. Loaded data need not cover a whole
region; hidden/filtered-out records cannot be recovered from transformed readback.
Reads throw while data is unready. For asynchronous work, apps capture the relevant
scope and cancel or discard stale results. Keys are explicit, unique scalars and
membership is tied to a publication.

No genomic query service, gene resolver, reference fetch API, generic coordinate
converter, rendering annotation API, or native agent toolkit is added. No design
questions remain for this scope. This temporary plan is retained while updating
the existing PR and must be reconciled and deleted in a later commit before merge.

## Verification record

- Full unit suite: 527 files, 4,983 passed, two skipped and two todo. The final
  publication-only readiness simplification also passes the focused read suite.
- All six example workflows pass across WebGL and Canvas, including zero
  thresholds selecting all 12 records, manual picking, SVG styling/export,
  viewport/brush filtering, reactive URL-backed filtering and narrow layouts.
- All four playground browser integrations pass: point/text/rectangle selection
  with picking disabled, and the reference-brush-analysis-logo-selection flow.
- Workspace types, lint, Core build and strict emitted consumer types, all-example
  smoke build, API reference generation, bundle boundaries, and minor release
  policy/status pass.
- Core production source shrank by 887 physical lines versus the previous PR
  version (41 added, 928 removed), excluding test files. The optional query
  types/engine and source-retention branch were deleted with their tests/docs.
- The three previously requested Sol reviews completed; the inherited WebGL
  selection fix and its cross-mark browser coverage remain in scope. The revised
  PR overview and existing API-table comment describe only the two additions.

The earlier verification of the discarded query/source-retention surface is
superseded by this revision. Temporary plan retirement is required before merge;
no merge is requested here.
