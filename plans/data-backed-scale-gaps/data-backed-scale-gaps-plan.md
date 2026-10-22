# Complete transform outputs and dataflow branches

Status: completion plan for [PR #575](https://github.com/genome-spy/genome-spy/pull/575),
on `codex/transform-value-outputs`. Implementation and final integration are complete. The reconciled record below
is ready for retirement in the next commit. Base: `05045f01f`.

## Goal and completion boundary

Finish the existing publication foundation and demonstrate
[#513](https://github.com/genome-spy/genome-spy/issues/513): a lazy genomic track
publishes a row count that an ordinary expression uses to display an empty-track
message after a successfully empty window.

Complete means the lazy example, supported source lifecycle, existing eager
heatmap behavior, documentation, and final integration checks are ready for
review and merge. It does not mean implementing every possible flow output.

Keep these outside this increment: dedicated extent outputs, named derived
datasets, output-consuming data sources/transforms, exact viewport counting,
incremental tuples, a new scheduler, or an async resource framework. Output
pushing and categorical dendrograms belong to the stacked
[#600](https://github.com/genome-spy/genome-spy/pull/600). Expression-scope redesign
and named-template scope rules remain in #599 for v2.0.

## Existing implementation and concrete gaps

Paths below are relative to `packages/core/`, unless stated otherwise.
Architecture: `ARCHITECTURE.md`, `docs/architecture/views-and-dataflow.md`, and
`docs/architecture/reactivity.md`.

- `src/data/flowOutput.js` stages immutable array candidates and publishes after
  successful source completion or cached replay. Equality suppresses unchanged
  arrays. `FlowOutput.ready` is internal, nonreactive bookkeeping.
- `src/data/sources/dataSource.js` already wraps completion in
  `runFlowPublication`; `collector.js` uses the same boundary for replay.
- `SingleAxisLazySource.publishData()` already publishes complete row snapshots
  with loaded coverage. Readiness rejects initial and invalidated snapshots.
  However, its dummy `load()` resets/completes while retaining prior coverage:
  after a successful load, simply removing the allowlist could publish false
  emptiness. Initialization/invalidation must remain nonpublishing.
- `IntervalUrlSource` coordinates cancellation, coverage, descriptor reuse, and
  loading status. Tabix publishes per-file batches through a separate override;
  all these paths need output verification, not a second loading mechanism.
- `ValuesTransform.initialize()` admits only URL, inline, and named sources,
  including side-input dependencies. It excludes lazy sources and even ordinary
  sequence generation. Source eligibility needs a shared, explicit contract.
- Local outputs start at `[]`. A message using `length(values) === 0` would look
  empty before any successful load; first successful empty `[]` does not change
  the array value. Internal readiness alone cannot solve this expression case.
- Lazy requests read scale domains implicitly; BigWig also reads axis length.
  Their actual loading inputs need dependency provenance so a published output
  cannot change its own requested domain or loading resolution unnoticed.

The eager foundation already provides `values`, structural `branch`, independent
branch inputs, cached ordinary-parameter replay, feedback guards, read-only API
access, and producer teardown. Preserve those contracts and the root-owned
metadata pipelines in the clustered heatmap.

## Design references

Retain Vega's separation between row propagation and transform value outputs.
The local checkout `tmp/vega` at `c03b7d0fe369be1a6e81d23dc899aef6eb7da967` was
inspected again: [transform output parsing](https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-parser/src/parsers/transform.js)
binds a producer through a dependency-backed proxy; its
[Values operator](https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-transforms/src/Values.js)
projects prepared rows, while
[Extent](https://github.com/vega/vega/blob/c03b7d0fe369be1a6e81d23dc899aef6eb7da967/packages/vega-transforms/src/Extent.js)
has a value independent of its outgoing rows. GenomeSpy keeps its existing
whole-snapshot completion model instead of importing Vega's pulse scheduler.
The reference license is BSD-3-Clause, compatible with MIT; no source copying is
planned. Preserve attribution and notices if implementation later adapts code.

## Public API and snapshot semantics

### Keep values; add a small count producer

Existing `values.param`, local ownership, initial immutable `[]`, order,
duplicates, scalar-field validation, and array equality stay unchanged.

Add a pass-through transform:

```json
{ "type": "count", "param": "recordCount" }
```

`count` counts its incoming rows with O(1) accumulator state and passes every row
onward. It counts the completed snapshot across file chunks and facets, resets
only for a new flow result, and publishes a nonnegative integer. Put it after any
filters that define the intended feature population; a branch is optional when
the summary needs different filters from the feature marks.

The count parameter starts at `null`, meaning no successful result has been
published. Successful empty input publishes `0`, including the first lazy
window. This observable `null` to `0` change avoids inventing a separate ready
parameter or collecting every feature ID just to count it. The local parameter
is declared by the transform, is read-only, and is excluded from bookmarks.

Extend the existing output binding to scalar-or-array values with an explicit
initial value supplied by known producer declarations. Use scalar identity
comparison and the existing shallow array comparison. Preserve declaration
order, single-writer checks, bound provenance, cached replay, and disposal; do
not introduce another registry or a generic callback on every FlowNode.

A count summarizes rows in the last successfully published loaded window/bin,
which may include prefetching. It is not a whole-file total, a distinct-feature
count, or an exact viewport intersection. Loading, invalidation, cancellation,
and failure retain the last successful parameter value; before any success it
stays `null`. They must not publish a synthetic zero.

### Empty-track presentation

Keep lazy data and `count` on an always-configured-visible parent layer. One
child draws inherited signal rows. A second child has independent singleton
input (`data: { values: [{}] }`) and a text mark with:

```json
{
  "type": "text",
  "text": "No data in the last loaded region",
  "opacity": { "expr": "recordCount === 0 ? 1 : 0" }
}
```

No `filter` or `formula` reads the output. Only the message presentation changes;
the parent producer stays active, so an empty result cannot stop future loads.
The complete example must supply its genomic scale, placement, and a real
supported lazy source; the fragment above only illustrates the consumer. Give
the message view-relative positions instead of inherited signal-field encodings.

The message describes the last successfully published window. During a pending
or failed replacement it retains that previous message state, alongside existing
loading/error presentation; it must not be documented as proof that a newly
requested, unfinished viewport is empty. Current-request-only readiness exposure
is a separate feature. #513 permits window/bin counting; retaining the previous
message is an explicit presentation choice, qualified by the visible wording.

### BigWig example in the Values documentation

Embed `examples/docs/grammar/transform/lazy-empty-data.json` in
`docs/grammar/transform/values.md`, in a section demonstrating empty lazy data.
Link the count reference to this workflow rather than duplicating the example.

Use one file from the existing multi-URL BigWig example: **Forebrain E12.5 R1**,
the H3K27ac track at
`https://data.genomespy.app/datasets/encode-mouse-fetal-development-mm10/v4/bigwigs/forebrain-e12-5-rep1.bigWig`.
No facet or multi-URL selection is needed.

| State       | mm10 domain, zero-based half-open |
| ----------- | --------------------------------- |
| Signal data | `chr10:82400000–82500000`         |
| Empty data  | `chr10:100000000–100100000`       |

Direct full-resolution queries verify records in the first window and no
records in the second. Start in the empty window so the message appears after
the first successful load. Add an ordinary region-selector parameter for easy
switching between the two domains; it drives the scale, while the count only
drives the message. Verify that prefetching and zoom-level selection retain the
intended empty/nonempty distinction. Count records/bins, including zero-valued
records; do not interpret zero signal as missing data or assert a fixed positive
record count across rendering resolutions.

Credit ENCODE, the Bing Ren laboratory, and Gorkin et al. (2020), identifying
source file `ENCFF549YDI` and experiment `ENCSR966AIB`. The versioned
[dataset README](https://data.genomespy.app/datasets/encode-mouse-fetal-development-mm10/v4/README.md)
and [provenance](https://data.genomespy.app/datasets/encode-mouse-fetal-development-mm10/v4/provenance.json)
confirm this is a regional derivative retaining four mm10 windows, not a
whole-genome signal track. Missing records outside those windows demonstrate
empty data in the extract, not biological absence of H3K27ac. Add concise
provenance beside the rendered example and correct the existing v4 BigWig
disclaimers in `docs/grammar/facet.md` and `docs/grammar/data/multi-url.md`, which
still claim only the displayed ten-megabase region was retained.

## Source lifecycle and dependency boundaries

1. Centralize eligibility for both publishers and walk actual primary/side
   dependencies. Use a small explicit source capability for successful snapshot
   publication, defaulting to unsupported. Opt in audited inline/named/URL and
   sequence sources plus the shared interval-source family (BAM, BigWig, BigBed,
   Tabix, and indexed FASTA). Do not silently enable every internal guide or
   custom lazy source. This replaces a fragile list of diagnostic labels. An
   override inheriting this capability must preserve the successful-snapshot
   contract; document that obligation at the source boundary.
2. Distinguish initialization and invalidation completion from real successful
   snapshots, including warm dummy loads. Reuse the existing successful-
   completion/publication mechanism and coverage state. Preserve startup layout
   behavior, source sharing, and row-completion callbacks; add no transaction
   layer or recovery state machine.
3. Publish once after a complete successful replacement, covering all chunks and
   source descriptors. A late processing exception must discard candidates.
   Preserve existing abort/stale-response/disposal protections; a failed or
   superseded load cannot publish either zero or partial results.
4. Cached replay may recompute a count after ordinary parameters change, without
   fetching again when an upstream completed collector can replay the snapshot.
   Require successful source state and consumed side-input revisions before
   publication. A lazy side input must not release an output from stale primary
   rows before its required replay settles.
5. Register the real lazy domain and relevant layout/resolution dependencies
   with existing bound-provenance guards, at binding boundaries rather than per
   row. Reject direct and indirect output-to-own-loading feedback, including
   later dependency rebinding. Preserve independent eager outputs beside lazy
   tracks and safe visual consumers. Do not ban all expressions in lazy views.
6. Output consumption by another transform or data source remains explicitly
   rejected. Successful lazy publication does not establish general producer-
   before-consumer scheduling. No output-derived URL or filter is enabled by
   this work.

## Milestones and commit strategy

### 1. Publish scalar counts through the shared binding

Outcome: a local `count` output distinguishes unknown from zero and preserves
main rows for eager data and cached replay.

Affected areas: `src/spec/transform.d.ts`, transform factory/new `count.js`,
`data/flowOutput.js`, declaration discovery in `view/view.js`, and output binding
in `paramRuntime/viewParamRuntime.js`. Share source validation between producers.

Verification: real spec-to-count-to-text-expression tests for initial `null`,
first empty `0`, nonempty input, unchanged counts, ordinary-parameter replay,
read-only access, scope/name conflicts, pass-through rows, and disposal. Include
a representative result spanning file/facet batches, including empty batches,
to verify whole-result totals. Retain existing values tests; avoid duplicating
their complete lifecycle matrix.

Docs/release: document count and initialization, regenerate schema/type links,
and extend the existing Core minor changeset. No separate release note for each
implementation commit. Tentative commit:
`feat(core): publish completed row counts as parameters`.

### 2. Support audited lazy snapshots and the empty-track example

Outcome: the public count and values producers work on supported lazy paths, and
one real lazy track drives the message with the semantics above.

Affected areas: source capability/validation, `SingleAxisLazySource`,
`IntervalUrlSource`, relevant source overrides, existing completion/replay and
provenance boundaries, headless integration tests, and the single-BigWig example
and Values documentation specified above. Follow `examples/README.md`. Keep
offline lifecycle tests deterministic with controlled sources and the existing
small indexed fixtures; public documentation uses the hosted BigWig. Do not
make offline tests depend on that external service or duplicate large assets.

Verification:

- Controlled spec-to-source-to-count-to-message integration: startup, populated
  and successfully empty windows, replacement/reload, equal results, invalidated
  data, failed processing/fetch, a stale response, and disposal. Assert rows,
  published value, notifications, and actual message opacity/text.
- Warm dummy `load()` after success and backing-data invalidation do not publish
  false empty values. Retained-count/message behavior during pending and failed
  replacement is explicit in assertions, including a previous successful zero.
- Cached lazy-row replay changes the output without an unnecessary fetch; a
  lazy side-input join respects consumed revisions and coherent publication.
- Exercise differing production paths with a BigWig multi-descriptor test and a
  Tabix multi-file/chunk test. Reuse family loading/cancellation tests for shared
  mechanics; extend other families only where their publication path differs.
- Reject output feedback into its source's domain or relevant layout/axis
  length, including indirect and rebound inputs; independent outputs still work.

Use `test-genomespy-views` for SVG message/presentation assertions and
`debug-genomespy-web` for the actual hosted BigWig example, including both region
choices and the first empty publication. Docs explain loaded-window and
retained-value semantics. Tentative commit:
`feat(core): publish transform outputs from lazy windows`.

Review gate: public count/initialization contract, lazy completion/failure and
replay, real loading dependencies, and the complete message example together.
Measure affected runtime size before/after and simplify duplicate source or
publisher paths before committing.

### 3. Complete integration and prepare #575 for merge

Outcome: this PR has a reviewed bounded API and current acceptance evidence;
remaining future work is clearly excluded rather than hidden in unchecked tasks.

Affected areas: output/branch/count docs, shared examples, existing heatmap
checks, changeset, this plan, PR notes, and subsequent stack coordination.

Verification: preserve exact heatmap cuts x `[29, 36, 41, 46, 53]` and y
`[24, 42, 52]`, all 4,320 cells, labels/annotations, and alignment through pan,
zoom, reset, reverse-y, resize, grouping gaps/pointer inversion, and dendrogram
viewport fitting. Verify the lazy message example plus existing branch-values
and DepMap examples in WebGL and SVG; smoke Canvas/WebGPU where available.
Reuse existing renderer harnesses and add only focused scenarios as needed.

Run focused Vitest suites with `--reporter=agent`, then the full suite because
source/publication contracts are shared. Run workspace types, lint, schema and
example validation, generated-doc consistency, docs build, and release checks.
Review related tests for overlap and retain meaningful regression coverage.
Obtain a final independent integration review and resolve material findings.

Reconcile completed tasks in this plan, commit the final record, and delete the
plan in a later commit before merging. Update #575's description and acceptance
status using the final implementation; the existing feature changeset stays
minor. Tentative delivery commit: `chore: retire transform output completion plan`.

After #575's implementation is committed, rebase #600 as a separate follow-up.
Adapt its bare-output claiming, domainParam discovery, and source validator to
the shared scalar/array contract, preserving count's initial `null` and values'
initial `[]`. Rerun its pushed-output, hidden-producer, categorical, and renderer
checks. Do not pull #600's ownership/scoping changes into this completion task.

## Acceptance and remaining risks

- [x] Eager value publication, branches, metadata-derived heatmap gaps, existing
      feedback guards, and the initial independent prototype review are complete.
- [x] Count publishes `null` before success and correct totals including zero;
      existing values and main rows retain their contracts.
- [x] Supported lazy sources publish coherent successful snapshots, with no
      false empty startup/warm reload, failed, stale, or disposed publication.
- [x] The single-BigWig message example in `values.md` demonstrates the verified
      signal/empty windows, starts empty, and documents retained presentation
      and regional-extract provenance.
- [x] Cached replay, lazy side-input revisions, and implicit loading dependency
      guards are verified without a new scheduler or per-row dependency work.
- [x] Existing heatmap navigation, gaps, source sharing, disposal, and supported
      renderers pass final integration; applicable checks and review are clean.
- [x] Docs/schema/example and the existing minor changeset describe the final
      API; all implementation tasks are reconciled and this plan is ready for retirement.

The main risks are accidentally treating dummy completion as success, admitting
an untested source override, missing implicit scale/layout feedback, and confusing
retained summary values with current-request freshness. The decisions above
bound those risks. A user-facing current-request readiness API and additional
producer types remain explicit follow-ups, not prerequisites disguised as
implementation details.

## Plan review

The independent subagent reviewed the plan against the implementation and found
no architectural blocker. Incorporated its suggestions to qualify the retained
message visibly, name a representative file/facet count check, and document the
source-capability inheritance obligation. It endorsed the bounded count API and
reuse of existing publication machinery. The completed implementation and final
integration review are recorded below.

The user's subsequent dataset/placement choice is incorporated above. Direct
BigWig queries and the v4 provenance manifest verify the two example windows
and selected ENCODE source; the publication API and review boundary are unchanged.

## Completion record (2026-10-22)

Milestone 1 is committed as `203f60509`. Milestone 2 and the final verification
below accompany this record; the next commit removes this temporary plan.

- Count uses the shared scalar/array binding, starts at `null`, and publishes
  whole-result totals including first-empty zero. Values retain immutable array
  semantics; both preserve rows, replay, ownership, and read-only access.
- Audited eager/sequence and interval sources opt into snapshot publication.
  Dummy load/invalidation, failed processing, superseded requests, and disposal
  cannot publish false emptiness. Existing side-input revision/replay machinery
  remains the publication ordering boundary.
- Independent review found sibling viewport sizing, shadowed sibling width,
  and legend visibility feedback into BigWig resolution. Semantic layout
  dependencies now cover those routes and measured guides, including later
  independent sibling additions. Paint-only consumers, fixed-extent axes, and
  corner legends remain supported. The final independent review has no
  remaining actionable findings.
- The hosted BigWig example passes empty `0` -> signal `2842` -> empty `0` in
  WebGL, Canvas, and WebGPU, with settled successful loads, no source/browser
  errors, and successful SVG export. The positive count is observed evidence,
  not a fixed renderer-independent assertion. Screenshots were visually checked.
- Branch-values and DepMap pass all three renderers with both row directions.
  Exact cuts, all 4,320 cells, 72 genes, 60 samples, labels, and three annotation
  strips are preserved. SVG leaf alignment stays within 0.05 px during zoom,
  pan, resize, and reset; five-pixel gaps invert correctly, native picking
  identifies the expected cell, and both tree height domains fit and reset.
  Raster exports were smoke checked; no pixel-equality claim is made.
- The stable final tree passes 550 Vitest files and 5,224 tests, with one skip
  and two TODOs; all workspace TypeScript and lint checks pass. Schema/example
  validation, generated-doc consistency, docs build, formatting, diff checks,
  and release checks pass. The existing Core changeset stays minor (fixed
  package group to 1.3.0).
- Affected runtime JavaScript measures 13,005 -> 13,213 physical lines across
  20 files (+208), including the count producer and explicit source/layout
  boundaries. The added layout provenance closes confirmed feedback paths;
  there is no new scheduler, output registry, or per-row reactive work.

Dedicated extent outputs, output-consuming dataflow, named datasets, exact
viewport freshness/counting, and #599 remain outside this increment. Adapting
and rebasing the #600 stack is explicitly deferred to that separate follow-up;
it does not add ownership/scoping changes to #575. All tasks in this completion
increment are complete; no unresolved implementation work is hidden by retirement.
