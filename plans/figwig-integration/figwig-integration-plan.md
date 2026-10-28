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
- Exact means currently cost substantially more than BigWig zoom summaries for
  broad overview loading. No approximate mode was added; this is a measured
  limitation, not a production rollout.
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
in temporary storage; the standalone working-tree edits remain separate and
uncommitted. All data and recipe changes remain local and uncommitted.
