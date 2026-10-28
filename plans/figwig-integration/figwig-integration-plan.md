# Experimental Figwig integration

## Architecture check

Core owns the lazy-source grammar and dataflow. `FigWigSource` extends
`IntervalUrlSource`, following `BigWigSource` without changing BigWig behavior.
The existing base owns descriptor normalization, cached handles, cancellation,
window quantization, genomic discretization, readiness and publication. Scoped
`activateExprRefProps` bindings own reactive configuration. The App consumes
ordinary rows and sample IDs; no new mark, transform or sample state is needed.

The standalone reader at commit
`df1d737e5503c0463a35e94cf0b4d922a076ea91` provides batched exact bins with
missing-aware means. Unlike BigWig zoom summaries, stored Figwig sums cannot
recover valid-base counts. Use full-value aggregation, preserving measured zero
and omitting nonfinite output. See `packages/core/docs/architecture/reactivity.md`,
`views-and-dataflow.md`, and the Figwig README/types. The dependency is MIT; no
standalone implementation code is copied.

## Decisions and scope

- One resolved URL and one cached reader, with `tracks` omitted, names, or ExprRef.
- Use `getBinsMulti` with viewport-derived integer bin size, mean, missing omit,
  and summaries disabled. Convert numeric arrays to existing signal rows only at
  the dataflow boundary. Clip discrete requests to file chromosome bounds.
- Track/resolution changes invalidate current coverage and abort obsolete work,
  retaining the reader; URL changes use normal descriptor reload.
- Quantized fetch windows retain small-pan coverage while bounding padding on
  each side to one eighth of the viewport (apart from the one-base minimum).
  Resolution is tracked separately at successful publication, so resizing must
  reload even when the bounded spatial window remains unchanged. The base
  `getChangedWindow` accepts an optional force flag for this independent cache
  contract, preserving all existing callers. Signed finite signals remain valid;
  missing and infinite values are omitted.
- Descriptor attachment rejects collisions with chrom/start/end/score/sampleId.
- Install the unpublished reader reproducibly with a pinned portable dependency
  if its build lifecycle permits; otherwise document local packing.
- Keep ENCODE recipes and data local and uncommitted. Preserve original specs,
  BigWigs, provenance, rights and distribution records. No upload, push or PR.

Alternatives: feature objects allocate missing rows before filtering; summary
means alter missingness semantics; per-track readers duplicate file metadata.
These are unnecessary for the experiment. Track grouping benchmarks are secondary
to correctness. Exact aggregation can cost more than BigWig zoom queries.

## Milestones

1. Integrate reader/source, public types, generated schema, focused lifecycle
   tests, docs and changeset. Verify cancellation, failures, empty selection,
   handle reuse, reactive URL/tracks/resolution and cross-chromosome bins.
   Tentative commit: `feat(core): add experimental multitrack Figwig source`.
2. Convert the regional ENCODE panel with deterministic metadata, validate against
   original BigWigs, and create separate local visualization specs. Verify all
   tracks/chromosomes, missingness, measured zeros, common bins and boundaries.
   Recipe work remains uncommitted.
3. Run both App variants over HTTP ranges, exercise all six bookmarks and brush
   metadata, revisit/pan after selection changes, and measure cold/warm bytes,
   requests, timing, memory and reader diagnostics. Record limitations and exact
   reproduction commands. Run relevant suites, types, lint and builds.

## Acceptance and risks

Acceptance follows the attached task: all 24 aligned sample IDs, same-reader
reactivity, true partial responses, scientifically valid missing-aware bins,
working brush-derived metadata, six bookmarks, repeatable numeric/performance
evidence, and clean separation of local data from GenomeSpy Git changes.
Full-chromosome NaN representation may make conversion expensive; test a subset
first. Bin alignment/coarse aggregation differences must be quantified rather
than hidden. Browser interactions and metadata are final integration gates.

## Status

- Initial GenomeSpy worktree clean; pre-existing recipe work was preserved. Base HEAD
  `91ce56e30eeb08f30e63fca518935d386e7f00f1`.
- Created local branch `experiment/figwig-integration`.
- Implemented the source, reactive public grammar, schema generation, docs,
  changesets and reproducible unpublished-package setup. Independent review
  found no remaining material lifecycle defects.
- Converted all 24 regional tracks with NaN missingness and generated separate
  local specs. Python and JavaScript common-bin comparisons passed with zero
  error; grouping variants passed the same references.
- Both App variants passed all six bookmarks, derived metadata/scatterplots,
  real HTTP range checks and cold/warm measurements. Actual bookmark buttons,
  expanded scatterplot and mouse panning after filtering passed.
- Full unit suite: 5,288 passed; workspace types, lint, complete build and docs
  build passed. The existing release fixture now preserves local tarballs.
- Exact means cost substantially more than BigWig zoom summaries for broad
  overview loading. The initial integration had no approximate mode; the
  follow-up below adds an explicit fast policy.
- Optional grouping measurements completed. Continuous frame-time profiling,
  process peak-memory measurement, remote latency tests and non-Chromium tests
  were excluded from this experiment; sampled heap and timings are reported.
- The existing App group-title bug was fixed with focused regression coverage.
  Build-generated App-agent schema drift unrelated to this feature was restored
  to its original state.
- Full results and reproduction: `docs/development/figwig-experiment.md`.
  Recipe changes, data and benchmark outputs remain local and uncommitted.
- Independent plan review completed: retain the native source lifecycle and
  register through `lazy/registerBuiltInLazySources.js`. Profiling established
  that coarse spatial quantization decoded 28.06 Mb for a 10 Mb viewport,
  including dense NaN-only gaps. Bounded windows plus the optional base force
  flag separate spatial coverage from source resolution without duplicating
  quantization or caching state.

## Performance follow-up

The user's browser profile exposed per-value representability validation in the
standalone reader. Independent App profiling also found excessive source
overfetch: a 10,000,001-base viewport at 1095 pixels loaded 28,056,576 bases.
This decoded 5142 chunks and took 12.8 seconds; querying only the viewport with
the same reader after clearing caches took 0.90 seconds and 1833 chunks.

The source owns overscan policy. Reduce its quantization padding while retaining
the base's coverage, cancellation and handle ownership. Keep bin resolution
invalidation explicit in the quantization key. A regression must bound genomic
overfetch, rather than assert an arbitrary internal window constant.

The standalone reader owns binary type validation. Eliminate eager failure text
and redundant scans only where the chunk storage type proves representability
in the declared track dtype. Preserve checks for narrowing and signedness,
nonfinite rejection, NaNs and float precision. Keep these changes isolated in
the Figwig repository, now explicitly authorized for editing by the user.

Verify the two changes independently before combining them: actual browser
query timing and decoded chunks for source overscan; corruption/conformance and
before/after timing for the reader. Re-run all six bookmarks and common-bin
references with the final installed package. Exact missing-aware means remain
required; no approximate summary mode or dataset-specific masks are introduced.

Follow-up complete: the original reader with bounded source windows measured
1.172 seconds per overview query. With both fixes installed in Vite, the query
took 1.068 seconds and decoding fell to 80 ms. Cold App startup measured 5.506
seconds versus the original 16.675 seconds. All six bookmarks, UI interactions,
81 numeric cases and the full unit suite passed. The standalone reader's 154
tests and three Chromium tests passed. Its reviewed runtime patch is committed
with the experiment setup, which archives the public base and applies the patch
in temporary storage. The standalone validation optimization was committed as
`5416c0600075abea4a5a72f3664612daaaecac3e`. All data and recipe changes remain
local and uncommitted.

## Exact and fast modes

The user requests two source modes and accepts approximate brush statistics.
Keep viewport decisions in Core's source and binary summary capability in the
standalone reader. Reuse existing expression activation, handle ownership,
cancellation and spatial/resolution tracking. No separate analysis data path,
coverage sidecar, dataset mask or binary format change is needed.

- Add `mode: "exact" | "fast"` (default exact) to the public source grammar.
  Follow existing reactive property handling if the mode is an expression.
- Exact mode retains current full-value, NaN-omitting means.
- Fast mode retains exact queries below the file tile resolution. At coarser
  scales, choose tile-aligned bins, expand chromosome query bounds to that grid,
  and use rounded summary means with missing values treated as zero. Preserve
  valid zeros and describe dilution across gaps explicitly.
- Add `requireSummaries` to the reader's binned query contract. It enables
  summary use and rejects unavailable/incompatible summaries before raw chunk
  decoding. Preserve opportunistic `useSummaries` behavior for existing callers.
  Apply the same no-fallback promise to binned feature queries if exposed there.
- Keep reactive track/mode/resolution changes on the same cached reader. The
  existing publication guard remains authoritative for obsolete requests.
- Switch only the local mouse Figwig signal variant to fast mode. Preserve the
  original BigWig spec, view name, dataset files and published v4 records.
- Update the reproducible reader patch, types/schema, focused tests, grammar
  documentation and existing feature changeset. Preserve prior uncommitted
  findings and recipe README work.

Verification: reader tests prove successful required summaries use no raw data
and rejected unaligned/missing-summary/incompatible-policy batch requests never
fall back. Source tests cover mode selection, chromosome edges, fine/coarse
transitions, reactive invalidation and handle reuse. In the real App, measure
whole-genome overview cold/warm bytes, requests and chunk decoding; test all 24
and six selected tracks, panning, zooming back into detail, and all bookmarks.
Scientific brush output may be approximate in fast mode and must remain finite
and functional. Test exact mode against the existing common-bin oracle.

Tentative commit: `feat(core): add fast summary mode for Figwig overview`.
Standalone reader changes and GenomeSpy changes remain separate; no push or
publication, and recipe changes remain uncommitted.

Implemented and independently reviewed: exact remains the default; fast uses
required summaries for tile-scale bins and exact raw queries at finer scales.
The reader preflights the whole batch before any raw fallback. Reactive changes
retain the existing reader and publication lifecycle. The source grew from 241
to 280 lines; the added policy and alignment logic stay local to the source.

The real whole-genome App rendered all 24 tracks with five partial responses,
269,949 bytes and no raw chunks. Cold App completion was 3.413 seconds; the
summary source query itself was 28 ms. Warm loading, filtering to six tracks and
panning needed no further transfer. Both passes of all six bookmarks switched
to exact detail queries as expected and completed brush/scatterplot analysis
without errors. The exact oracle still passes all 81 cases with zero error.
Full GenomeSpy tests pass 5,293 cases in 555 files; reader checks pass 160 unit
and three Chromium tests. All planned mode work is complete; continuous frame
profiling, remote latency and other browser engines remain outside this task.
