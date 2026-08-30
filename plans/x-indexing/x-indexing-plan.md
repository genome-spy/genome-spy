# Renderer-neutral x-indexing plan

Status: Completed

## Outcome

GenomeSpy now uses a shared mark-level x-index contract for sorted point and
rectangle data. Canvas indexes stable source batches, while the Core WebGPU
adapter indexes packed instance ranges. Both normal rendering and picking use
the same conservative query envelope.

The dataflow reads normalized mark encoding when deciding whether indexing
requires collector sorting. Rewritten locus fields remain the actual sort key.

## Completed milestones

- [x] Reuse the existing binned-range implementation for shared x indexing.
- [x] Centralize mark eligibility and conservative visible/picking queries.
- [x] Cull Canvas point and rectangle traversal using stable source-row ranges.
- [x] Share the Canvas index cache between visible rendering and picking.
- [x] Narrow WebGPU point and rectangle draws using packed instance ranges.
- [x] Rebuild adapter indexes when data, encoders, topology, or zoom extent
      changes.
- [x] Preserve complete traversal for SVG and transient Canvas `facetIndex`
      groups.
- [x] Add focused contract, adapter, lifecycle, and dataflow coverage.
- [x] Review the branch for KISS, redundant allocations, and duplicate tests.

## Discarded work

- A new general-purpose range-index implementation was discarded in favor of
  Core's existing `createBinningRangeIndexer`.
- A module-global cache was discarded because Canvas and WebGPU own different
  native ranges and lifecycles.
- Full WebGL migration to the shared mark-query policy was discarded. WebGL
  keeps its established vertex-range index and shares only the conservative
  offset-bound helper, avoiding a wider behavioral change in this branch.
- Persistent indexing for transient Canvas `facetIndex` groups was discarded;
  these groups safely use complete traversal.

## Verification

- Full unit suite: 445 files, 3,713 tests passed.
- Workspace TypeScript checks and lint passed.
- The MCCA exon layer sorted 290,812 rows and built its index without a local
  specification workaround.
- A close-zoom MCCA query reduced the candidate range from 290,812 rows to
  1,866 with no browser errors.
