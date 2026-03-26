# XIndex Plan

## Goal

Replace the current live, accessor-driven x-index construction with a post-pass that scans the generated vertex buffers and builds viewport-culling ranges from geometry metadata.

The index is only used to answer: "which contiguous vertex range should be drawn for the current x-domain?"
It does not need datum identity, a datum map, or a separate instance table.

## Why this is feasible

This is feasible because the renderer already consumes `offset,count` ranges, and `xIndex` is only an optimization layer that narrows the range before draw submission.

The generated geometry already contains the data needed for culling:

- the emitted vertex buffers,
- the channels that contribute to x visibility (`x` and optional `x2`),
- and enough metadata to know how the generated arrays should be interpreted.

For the common cases, the geometry is already strongly structured:

- rects emit a fixed six-vertex run per mark item,
- points emit a single vertex,
- links emit a single vertex,
- text emits variable-length runs, but the vertices are still contiguous and can be scanned directly.

This means the new x-index builder can operate on the finished buffers instead of calling datum accessors in the hot path.

## Correctness conditions

The replacement is correct if the following remain true:

- the x-index stores vertex ranges, not datum identities,
- the scan is conservative, meaning anything that overlaps the visible x-domain is retained,
- consecutive vertices that have the same effective x-interval may be merged,
- the emitted vertex order remains contiguous within each range that the renderer needs to draw,
- shared channel sources are deduplicated before indexing so the same underlying field is not decoded multiple times,
- high-precision x values are decoded consistently with the data that the GPU receives.

The last item matters because `getAttributeAndArrayTypes()` can produce `float`, `uint`, or split `uvec2`-style storage depending on the scale and domain.
The x-index builder must handle those emitted representations explicitly.

The `uvec2` path is the main remaining caveat. It exists to preserve enough precision for genomic coordinates, and decoding those split values back into comparable x-domain numbers adds overhead. That path is only needed for very large genomes, so it can be slower than the common-case path as long as it remains correct.

## Files to modify

- `packages/core/src/gl/dataToVertices.js`
- `packages/core/src/gl/dataToVertices.test.js`

Optional later cleanup:

- `packages/core/src/utils/binnedIndex.js`
- `packages/core/src/utils/binnedIndex.test.js`

## Files to add

- `packages/core/src/gl/vertexRangeIndex.js`
- `packages/core/src/gl/vertexRangeIndex.test.js`
- `packages/core/src/gl/vertexRangeIndex.bench.js` or an equivalent trace harness if the decode cost needs isolated measurement

## File-by-file plan

### `packages/core/src/gl/dataToVertices.js`

This file should stop being responsible for live x-index population in the inner per-datum loop.

Concrete changes:

- keep `ArrayBuilder` / geometry emission here,
- collect the x-index metadata needed by the post-pass,
- build the x-index after the vertex arrays have been finalized,
- attach the resulting `Lookup` function to the existing `RangeEntry.xIndex` slot,
- preserve the current `rangeMap` and render contract unchanged.

The metadata produced here should identify:

- which generated arrays carry the x channel,
- which generated arrays carry `x2` when present,
- whether the channel is fixed-width, shared, or split into multiple array components,
- how to decode each stored x value back into the numeric domain used for culling.

This file will still need to own the special handling for fixed-stride builders and variable-stride builders, but only as geometry metadata, not as live x-index bookkeeping.

### `packages/core/src/gl/vertexRangeIndex.js`

Add a new helper that builds the lookup from generated vertex buffers.

Expected responsibilities:

- scan the emitted arrays in vertex order,
- compare each vertex’s effective x-interval with the previous one,
- extend the current run when the interval stays the same,
- emit a lookup function compatible with `Lookup(start, end, arr)`,
- collapse contiguous repeated vertices into one range entry,
- decode high-precision storage formats when the x channel is emitted as a split representation.

This helper should be geometry-focused and should not know about datums, encoders, or mark classes.
Its only inputs should be:

- the generated arrays,
- the metadata describing which arrays map to x and x2,
- and a small decoder contract for the stored representation.

The helper should expose a fast path for non-split storage and a separate path for `uvec2`-based coordinates. The split-precision path can be slower, because it is only relevant for rare large-genome cases.

### `packages/core/src/gl/dataToVertices.test.js`

Expand the current regression tests so they no longer only verify the fixed-stride bookkeeping helper.

Add coverage for:

- the x-index metadata emitted by the builder,
- fixed-stride marks using the new post-pass path,
- variable-stride text still producing a valid range entry,
- deduplication when the same source field feeds both `x` and `x2`.

Keep the tests close to the builder contract, because this file is where the geometry-to-range handoff now lives.

### `packages/core/src/gl/vertexRangeIndex.test.js`

Add focused tests for the new helper.

The test set should cover:

- a run of vertices with the same x interval collapsing to one range,
- a domain query that partially overlaps a run,
- a query that skips an entire run,
- fixed-stride inputs,
- variable-length inputs,
- high-precision or split-value decoding if the first implementation supports it.

This file should prove that the new helper reproduces the same culling semantics as the current live path.

### `packages/core/src/utils/binnedIndex.js`

Keep this file unchanged for the first migration step if the new helper fully replaces its x-index use site.

If the post-pass proves stable, this file becomes a candidate for simplification:

- remove the live datum-accessor dependency from the x-range path,
- keep only the generic range lookup behavior that is still useful elsewhere,
- or retire it entirely if nothing else uses it.

Do not touch this file before the new helper is validated.

### `packages/core/src/marks/mark.js`

This file should not need a functional change if the new helper still returns the same `Lookup` contract.

The render path already expects:

- a `RangeEntry`,
- an optional `xIndex`,
- and a contiguous vertex range to draw.

Only change this file if the lookup contract itself changes. The current plan does not require that.

## Implementation steps

### Phase 1. Add the post-pass helper

- Create `packages/core/src/gl/vertexRangeIndex.js`.
- Implement a vertex-run scan over the generated arrays.
- Keep the helper independent of datum accessors.
- Make the helper return the existing `Lookup` shape.

### Phase 2. Carry x-index metadata out of geometry generation

- Update `packages/core/src/gl/dataToVertices.js` so it records the minimal metadata needed by the helper.
- Include the x and x2 source mapping and the stored representation details.
- Keep the geometry builders responsible for generating vertices, not for building the index inline.

### Phase 3. Wire the helper into the builder lifecycle

- Call the new helper after the typed arrays have been finalized.
- Store the resulting lookup on the existing `RangeEntry`.
- Leave `packages/core/src/marks/mark.js` unchanged unless the lookup contract needs an adjustment.

### Phase 4. Preserve shared-field deduplication

- Reuse the same source metadata when one field feeds multiple channels.
- Ensure the helper does not rescan aliased channels.
- Keep the x-index focused on the effective x interval only.

### Phase 5. Verify correctness and performance

- Add unit tests for the new helper.
- Expand the geometry builder tests to cover metadata emission and range attachment.
- Re-profile the same trace scenario and verify that accessor reads disappear from the x-index path.

## Feasibility assessment

Overall, this is a good fit for the codebase.

The current live path is already narrowed to x-domain culling, so moving the work to a geometry post-pass preserves the actual behavior while removing the expensive datum-accessor layer.

The main implementation risk is not the culling logic itself. The risk is making sure the post-pass understands the emitted representation for all x-bearing channels, especially when the storage is split for high-precision scales.

That risk is manageable because the metadata already exists at geometry-construction time, and the lookup contract does not need to change. The open question is performance only for the common-case path; `uvec2` may be slower, but that is acceptable because it is rare and needed mainly for very large genomes.

## Expected outcome

If this lands, the x-index path should:

- stop paying accessor overhead in the hot loop,
- operate on generated vertex buffers instead of source datums,
- keep the current rendering contract intact,
- and make x-culling cost scale with emitted geometry rather than object-field access.

The remaining decision point after implementation is whether the `uvec2` path stays correct and maintainable as a slow fallback, not whether it needs to match the common-case speed.
