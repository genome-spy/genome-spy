# BAM Alignment Support Plan

## Rationale

GenomeSpy was originally designed around higher-level genomic data such as
copy-number segments, variant calls, annotations, and cohort metadata. It is
also a general declarative visualization system with enough flexibility to build
custom genomic views from lower-level data.

BAM read alignments are standard evidence tracks in genome browsers. GenomeSpy
does not need to become an IGV replacement, but it should provide enough
grammar-level building blocks to make IGV-like alignment evidence views possible
when users need custom pileup or coverage visualizations.

The target users are tool builders, computational biologists, and visualization
developers who already build custom GenomeSpy specs. These users may want to
change how BAM evidence is filtered, grouped, colored, summarized, or combined
with assay-specific metadata. A closed, fixed "BAM track" would be less useful
than reusable alignment-derived data rows that work with ordinary marks,
transforms, encodings, parameters, and composition.

## Objective

Add an incremental foundation for BAM alignment visualizations by exposing
standard alignment evidence as composable GenomeSpy data:

- read-level rows from the BAM source
- CIGAR operation rows for aligned blocks, indels, skips, and clipping
- sparse mismatch rows for per-base variant evidence
- base-aware coverage or pileup summaries for depth and allele composition

The initial feature set should be useful for short-read local inspection around
SNVs and small indels. It should demonstrate that the grammar can express an
IGV-like coverage plus read pileup view while still allowing users to customize
the view.

## Non-Goals for the Initial Version

- Full IGV interaction parity.
- A monolithic built-in alignment track renderer.
- Complete structural-variant analysis from paired reads.
- Complete split-read or chimeric-read workflows.
- Complete RNA-seq junction visualization.
- Long-read-specific conventions such as base modifications.
- A guarantee that every BAM/SAM edge case is displayed identically to IGV.

These can be added later if the foundational transforms prove useful.

## Existing Conventions and Specifications

Two kinds of reference material should guide this work.

### Data Semantics

The formal SAM/BAM specifications define the meaning of the alignment fields and
should be treated as the source of truth for parsing:

- SAMv1 specification: https://samtools.github.io/hts-specs/SAMv1.pdf
- SAM optional tags: https://samtools.github.io/hts-specs/SAMtags.pdf
- HTS specifications repository: https://github.com/samtools/hts-specs

Important concepts:

- `CIGAR` maps read positions to reference positions.
- `M` consumes both read and reference but does not distinguish match from
  mismatch.
- `=` and `X` explicitly distinguish sequence match and mismatch when present.
- `I` consumes read sequence only.
- `D` and `N` consume reference sequence only.
- `S` consumes read sequence and represents soft-clipped bases.
- `H` and `P` consume neither read nor reference.
- `MD` and `NM` tags provide mismatch and edit information. `MD` is especially
  useful when CIGAR uses `M`.
- `MAPQ` is a Phred-scaled estimate of mapping-placement confidence, with
  aligner-dependent interpretation.
- SAM text is 1-based for positions, while the current `@gmod/bam` API exposes
  0-based coordinates.

### Display Conventions

IGV is the most useful reference implementation for familiar alignment display
conventions:

- Alignment basics:
  https://igv.org/doc/desktop/UserGuide/tracks/alignments/viewing_alignments_basics/
- Paired-end alignments:
  https://igv.org/doc/desktop/UserGuide/tracks/alignments/paired_end_alignments/
- Chimeric reads:
  https://igv.org/doc/desktop/UserGuide/tracks/alignments/chimeric_reads/
- RNA-seq alignments:
  https://igv.org/doc/desktop/UserGuide/tracks/alignments/rna_seq/

Initial GenomeSpy behavior should follow familiar conventions where practical:

- coverage bars above read alignments
- gray read bodies by default
- colored mismatch bases
- black deletion markers
- insertion markers, optionally labeled by inserted length at high zoom
- clipped-end markers
- lower opacity or hollow styling for low or zero MAPQ reads

These conventions are not normative standards. The GenomeSpy documentation
should describe them as IGV-like alignment evidence conventions, not as strict
IGV compatibility.

## What `@gmod/bam` Offers

GenomeSpy already uses `@gmod/bam` for lazy BAM loading. The package exposes the
raw fields needed for alignment-derived visualization:

- `record.start` and `record.end`
- `record.name`
- `record.CIGAR`
- `record.NUMERIC_CIGAR`
- `record.mq`
- `record.strand`
- `record.seq`
- `record.seqAt(index)`
- `record.qual`
- `record.flags`
- `record.getTag("MD")`
- `record.getTagRaw("MD")`
- `record.NUMERIC_MD`
- mate fields such as `next_refid`, `next_pos`, `template_length`
- flag helpers such as `isPaired()`, `isDuplicate()`, and `isSupplementary()`
- pair orientation for same-reference mapped mates

The package does not directly expose a GenomeSpy-ready table of CIGAR operations
or mismatch rows. GenomeSpy should derive those rows in transforms so they can be
used with ordinary marks and encodings.

## Current GenomeSpy Support

At the start of this feature branch, the lazy BAM source was intentionally
minimal and published only read-level fields such as:

- `chrom`
- `start`
- `end`
- `name`
- `cigar`
- `mapq`
- `strand`

Milestone 1 added richer read fields, shared CIGAR parsing helpers, and the
`flattenCigar` transform. The BAM example now renders two tracks:

- coverage computed from aligned CIGAR blocks
- read pileup rendered as strand-colored arrow marks with CIGAR overlays

Existing transform patterns that are relevant:

- `coverage` computes interval coverage from sorted segments.
- `pileup` assigns lanes to interval rows.
- `flattenSequence`, `flattenDelimited`, and `flattenCompressedExons` expand one
  input row into several cloned output rows.
- `aggregate` buffers rows per batch and emits summaries.
- modifying transforms are preceded by defensive clones when needed.

This suggests that BAM-derived data should be added as ordinary transforms, not
as a special-purpose renderer. However, these transforms are domain-specific
alignment transforms rather than generic table reshaping utilities. Their output
field names should be fixed and semantic. Users can use `project` or `formula`
afterward if they need renamed or derived fields.

## Proposed Initial Scope

The first useful milestone should support short-read local inspection around
SNVs and small indels:

1. Expose richer read-level BAM fields from the lazy BAM source.
2. Add CIGAR-derived row expansion.
3. Add sparse mismatch extraction.
4. Add a base-aware coverage or pileup summary.
5. Update the BAM example to demonstrate an IGV-like but customizable alignment
   evidence view.

The example should prove utility, not just visual polish. A useful first view
would include:

- CIGAR-aware read bodies
- deletions
- insertion markers
- clipped-end markers
- mismatch overlays
- MAPQ opacity
- coverage depth with allele-colored evidence
- at least one customization hook such as a MAPQ filter or a color-by mode

## BAM Source Changes

The BAM source should remain a source of read-level rows. It should not emit all
derived rows by default because per-base and per-CIGAR expansion can multiply
row counts substantially.

Tentative source output additions:

```ts
interface BamReadDatum {
    chrom: string;
    start: number;
    end: number;
    name: string;
    cigar: string;
    mapq?: number;
    strand: "+" | "-";

    seq?: string;
    qual?: number[];
    md?: string;
    flags?: number;

    mateChrom?: string;
    mateStart?: number;
    templateLength?: number;
    pairOrientation?: string;

    isPaired?: boolean;
    isProperPair?: boolean;
    isDuplicate?: boolean;
    isQcFail?: boolean;
    isSecondary?: boolean;
    isSupplementary?: boolean;
}
```

The initial implementation can expose only the fields required by the first
transforms. Mate fields can be added later if pair visualization is deferred.

## Transform: `flattenCigar`

`flattenCigar` should follow the style of existing flatten transforms. It takes
one alignment row and emits one row per CIGAR operation, cloning the input datum
and adding operation-specific fields.

Tentative props:

```ts
export interface FlattenCigarParams extends TransformParamsBase {
    type: "flattenCigar";

    /**
     * The read's reference start coordinate.
     *
     * Default: "start"
     */
    start?: Field;

    /**
     * The CIGAR string or numeric CIGAR field.
     *
     * Default: "cigar"
     */
    cigar?: Field;
}
```

The transform should emit fixed output fields:

```ts
interface CigarOperationDatum extends BamReadDatum {
    cigarOp: "M" | "I" | "D" | "N" | "S" | "H" | "P" | "=" | "X";
    cigarLength: number;
    cigarStart: number;
    cigarEnd: number;
    readStart: number;
    readEnd: number;
    cigarType:
        | "aligned"
        | "insertion"
        | "deletion"
        | "skip"
        | "softClip"
        | "hardClip"
        | "padding";
}
```

Suggested `cigarType` values:

- `"aligned"` for `M`, `=`, and `X`
- `"insertion"` for `I`
- `"deletion"` for `D`
- `"skip"` for `N`
- `"softClip"` for `S`
- `"hardClip"` for `H`
- `"padding"` for `P`

Example transform chain for CIGAR-aware read bodies:

```json
[
  { "type": "pileup", "start": "start", "end": "end", "as": "_lane" },
  { "type": "flattenCigar", "start": "start", "cigar": "cigar" },
  { "type": "filter", "expr": "datum.cigarType == 'aligned'" }
]
```

Example transform chain for CIGAR-aware coverage:

```json
[
  { "type": "flattenCigar", "start": "start", "cigar": "cigar" },
  { "type": "filter", "expr": "datum.cigarType == 'aligned'" },
  {
    "type": "coverage",
    "chrom": "chrom",
    "start": "cigarStart",
    "end": "cigarEnd",
    "as": "coverage"
  }
]
```

Ordering matters. For read pileups, `pileup` should generally run before
`flattenCigar` so all CIGAR operation rows from the same read inherit the same
lane.

## Transform: `alignmentMismatches`

`alignmentMismatches` should emit sparse per-base mismatch rows. It should not
emit every aligned base because that would produce much larger data than most
views need.

It should parse `CIGAR + MD + SEQ + QUAL`. `MD` is required because CIGAR
strings that use `M` do not distinguish matches from mismatches. Explicit `X`
CIGAR operations can identify mismatches directly, but the transform should
still require `MD` so `refBase` semantics remain consistent.

Tentative props:

```ts
export interface AlignmentMismatchesParams extends TransformParamsBase {
    type: "alignmentMismatches";

    /**
     * The read's reference start coordinate.
     *
     * Default: "start"
     */
    start?: Field;

    /**
     * The CIGAR string or numeric CIGAR field.
     *
     * Default: "cigar"
     */
    cigar?: Field;

    /**
     * Read sequence field.
     *
     * Default: "seq"
     */
    sequence?: Field;

    /**
     * Base quality field.
     *
     * Default: "qual"
     */
    quality?: Field;

    /**
     * MD tag field.
     *
     * Default: "md"
     */
    md?: Field;
}
```

The transform should emit fixed output fields:

```ts
interface AlignmentMismatchDatum extends BamReadDatum {
    mismatchStart: number;
    mismatchEnd: number;
    readOffset: number;
    base: "A" | "C" | "G" | "T" | "N" | string;
    refBase: "A" | "C" | "G" | "T" | "N" | string;
    baseQuality?: number;
}
```

Example mismatch overlay transform chain:

```json
[
  { "type": "pileup", "start": "start", "end": "end", "as": "_lane" },
  {
    "type": "alignmentMismatches",
    "start": "start",
    "cigar": "cigar",
    "sequence": "seq",
    "quality": "qual",
    "md": "md"
  }
]
```

The transform should fail fast when required fields are missing. Reference
FASTA-backed mismatch extraction is out of scope for this feature.

## Transform: Base-Aware Coverage or Pileup

The current `coverage` transform counts interval depth. BAM alignment coverage
needs a richer summary for variant evidence:

- total depth
- base counts for A, C, G, T, N
- optional strand-split counts
- optional quality-weighted counts
- deletion and insertion support counts

There are two viable directions:

1. Add a new transform such as `alignmentCoverage`.
2. Add lower-level mismatch/indel rows and rely on existing aggregate
   transforms.

The first version should probably add a dedicated `alignmentCoverage` transform
because coverage semantics are common, performance-sensitive, and easy to get
wrong if every spec author must reconstruct them.

Tentative props:

```ts
export interface AlignmentCoverageParams extends TransformParamsBase {
    type: "alignmentCoverage";

    chrom?: Field;
    start?: Field;
    cigar?: Field;
    sequence?: Field;
    quality?: Field;
    md?: Field;
    strand?: Field;

    /**
     * Minimum base quality included in base counts.
     *
     * Default: 0
     */
    minBaseQuality?: number;

    /**
     * If true, base counts are weighted by base quality.
     *
     * Default: false
     */
    qualityWeighted?: boolean;
}
```

The transform should emit fixed output fields:

```ts
interface AlignmentCoverageDatum {
    chrom?: string;
    start: number;
    end: number;
    depth: number;
    A: number;
    C: number;
    G: number;
    T: number;
    N: number;
    deletionCount: number;
    insertionCount: number;
    forwardCount?: number;
    reverseCount?: number;
}
```

This transform can be deferred until after `flattenCigar` and
`alignmentMismatches` if implementation needs to be split into smaller pieces.
However, a base-aware coverage summary is important for an initial version that
is useful rather than merely decorative.

## Example Spec Direction

The updated BAM example should be structured as an ordinary layered and
concatenated GenomeSpy spec.

High-level layout:

```json
{
  "vconcat": [
    {
      "name": "coverage",
      "layer": [
        "depth bars",
        "base-composition overlays for loci with non-reference support"
      ]
    },
    {
      "name": "reads",
      "layer": [
        "CIGAR-aware read blocks",
        "deletion markers",
        "insertion markers",
        "soft-clipping markers",
        "mismatch base overlays"
      ]
    }
  ]
}
```

Useful customization controls:

```json
{
  "params": [
    {
      "name": "minMapq",
      "value": 0,
      "bind": { "input": "range", "min": 0, "max": 60, "step": 1 }
    },
    {
      "name": "laneHeight",
      "value": 12,
      "bind": { "input": "range", "min": 2, "max": 30, "step": 1 }
    }
  ]
}
```

Example read filter:

```json
{ "type": "filter", "expr": "datum.mapq == null || datum.mapq >= minMapq" }
```

Example MAPQ opacity:

```json
{
  "fillOpacity": {
    "field": "mapq",
    "type": "quantitative",
    "scale": { "domain": [0, 60], "range": [0.12, 1], "clamp": true }
  }
}
```

The example should make the composability explicit. It should not only show a
fixed IGV-like rendering. It should include at least one visible customization,
such as filtering by MAPQ or switching read coloring between strand and MAPQ.

## Implementation Notes

### Shared CIGAR Walker

`flattenCigar`, `alignmentMismatches`, and `alignmentCoverage` should share a
small CIGAR walking helper. The helper should maintain both cursors:

```text
refPos  = read alignment start
readPos = offset into SEQ
```

Consumption rules:

```text
M, =, X consume read and reference
I, S    consume read only
D, N    consume reference only
H, P    consume neither
```

The helper should be tested independently. Production transforms should focus
on field access, output rows, and flow behavior.

### Flow Behavior

Likely flow behaviors:

- `flattenCigar`: `BEHAVIOR_CLONES`
- `alignmentMismatches`: `BEHAVIOR_CLONES`
- `alignmentCoverage`: probably `BEHAVIOR_CLONES` if it emits new summary rows,
  but it may need batch or sorted-stream state similar to `coverage`

The transforms should follow existing conventions:

- use field accessors from `utils/field.js`
- use fixed semantic output field names for BAM-specific derived rows
- fail loudly on invalid or unsupported input
- keep JSDoc docs user-facing in `packages/core/src/spec/transform.d.ts`
- add focused Vitest tests next to the transform code

## Documentation Plan

Documentation should be updated with:

- BAM lazy source field descriptions
- new transform docs generated from `transform.d.ts`
- a revised BAM example under `examples/docs/grammar/data/lazy/`
- a short user-facing explanation that BAM support is a set of composable
  alignment evidence building blocks
- explicit limitations of the initial release

The current `docs/grammar/data/lazy.md` says the BAM source is work in progress.
That section should be revised once the first useful feature set lands.

## Testing Strategy

Tests should focus on behavior and contracts rather than reproducing internal
implementation details:

- CIGAR walker tests for every operation type.
- `flattenCigar` row output for representative CIGARs.
- `alignmentMismatches` output for `M + MD`, explicit `X`, insertion-adjacent
  mismatches, deletion-adjacent mismatches, and soft clipping.
- `alignmentCoverage` summaries for simple reads, indels, base qualities, and
  strand splits.
- BAM source tests for exposed fields if a small fixture is practical.
- Layout/example smoke test only if the docs example is expected to remain
  stable.

The first implementation should not add broad snapshot tests until the output
shape has stabilized.

## Suggested Milestones

### Milestone 1: Raw BAM Fields and CIGAR Rows

- Expose `seq`, `qual`, `md`, `flags`, and selected flag booleans from
  `bamSource`.
- Add a shared CIGAR walker.
- Add `flattenCigar`.
- Update the example to show CIGAR-aware read bodies, deletions, insertions, and
  clipping.

### Milestone 2: Mismatch Evidence

- Add `alignmentMismatches`.
- Add mismatch overlays colored by base.
- Add base-quality opacity or filtering.
- Ensure the example supports local SNV inspection.

### Milestone 3: Base-Aware Coverage

- Add `alignmentCoverage`.
- Add allele-colored coverage bars and depth summaries.
- Support quality thresholds and possibly strand-split counts.

### Milestone 4: Customization and Documentation

- Add one or two visible customization controls to the example.
- Update user-facing docs.
- Document limitations and future directions.

### Later Milestones

- Paired-read derived fields and pair anomaly coloring.
- Supplementary and chimeric-read support from `SA` tags.
- Downsampling indicators.
- RNA-seq-specific split/skipped-region and junction summaries.
- Long-read-specific display conventions.

## Open Design Questions

- Should `bamSource` expose both string CIGAR and numeric CIGAR, or should the
  source normalize to string only and let transforms parse it?
- Should base qualities remain a numeric array on the datum, or should they be
  encoded more compactly for memory?
- Should `alignmentCoverage` require `MD` too, or should it count only depth and
  defer allele composition when reference-base evidence is unavailable?
- Should insertion positions be represented as zero-width loci or one-base
  anchored intervals for mark compatibility?
- Should initial docs use the current UCSC BAM example or a different BAM with
  clearer mismatches and indels?

## Success Criteria for the Initial Version

The first version is successful if:

- an IGV-like local BAM pileup and coverage view can be expressed as a normal
  GenomeSpy spec
- the view is useful for inspecting read support around SNVs and small indels
- the spec demonstrates at least one meaningful customization of the BAM pileup
  or coverage semantics
- the new transforms are independently tested and documented
- limitations are clear enough that users do not mistake the feature for full
  IGV parity

## Initial Planning Commit Messages

Use these commit messages for the planning-only changes before implementation
starts:

1. `docs: add BAM alignment support plan`
2. `docs: detail BAM alignment milestone 1 plan`
3. `docs: detail BAM alignment milestone 2 plan`

## Detailed Milestone 2 Plan: Mismatch Evidence

Milestone 2 should add sparse, reference-positioned mismatch rows that can be
layered on top of the CIGAR-aware read pileup from Milestone 1. It should make
local SNV inspection useful without expanding every aligned base into a row.

### Milestone 2 Goal

After Milestone 2, a GenomeSpy spec should be able to:

- derive one row per mismatching aligned base
- preserve read-level fields and the pileup lane assigned before mismatch
  extraction
- color mismatch marks by observed read base
- optionally filter or fade mismatch marks by base quality
- keep deletions, insertions, skips, and soft clips represented by
  `flattenCigar` rather than mixing them into mismatch rows

Milestone 2 should not implement base-aware coverage summaries. That remains
Milestone 3.

### Milestone 2 Scope Decisions

- Use the SAM optional `MD` tag as the reference-base source for ordinary `M`
  CIGAR operations.
- Require `MD` for all reads processed by the transform, including reads with
  explicit `X` CIGAR operations, so mismatch rows have consistent reference-base
  semantics.
- Do not emit rows for matches, deletions, insertions, skipped regions, hard
  clips, padding, or soft clips.
- Require read sequence when a mismatch row is emitted because the displayed
  base comes from the read.
- Treat base qualities as optional. If `qual` is absent, emit mismatch rows
  without `baseQuality`.
- Fail fast when `MD` is missing or malformed. Users can filter to reads with
  `datum.md != null` before the transform if they want to skip missing tags.
- Keep output field names fixed and semantic. Users can rename fields with
  `project` after the transform if needed.

### Milestone 2 Files

Create:

- `packages/core/src/data/transforms/mdUtils.js`
  - Parse MD tags into reference-offset mismatch and deletion events.
- `packages/core/src/data/transforms/mdUtils.test.js`
  - Cover MD parsing, adjacent mismatches, deletion tokens, and malformed tags.
- `packages/core/src/data/transforms/alignmentMismatches.js`
  - Transform read rows into sparse mismatch rows.
- `packages/core/src/data/transforms/alignmentMismatches.test.js`
  - Verify row output and failure modes.
- `docs/grammar/transform/alignment-mismatches.md`
  - User-facing transform documentation.

Modify:

- `packages/core/src/data/transforms/transformFactory.js`
  - Register `alignmentMismatches`.
- `packages/core/src/spec/transform.d.ts`
  - Add `AlignmentMismatchesParams` and include it in `TransformParams`.
- `docs/grammar/data/lazy.md`
  - Update the BAM section to mention mismatch rows.
- `examples/docs/grammar/data/lazy/bam-read-alignments.json`
  - Add a mismatch overlay layer and a base-quality customization hook.

### Milestone 2 Output Contracts

#### MD Events

The MD helper should parse the SAM optional `MD` tag according to the SAMtags
specification:

- numbers advance along the reference
- letters identify reference bases at mismatching reference positions
- `^` followed by bases identifies deleted reference bases

Suggested internal event shape:

```ts
interface MdMismatchEvent {
    type: "mismatch";
    refOffset: number;
    refBase: string;
}

interface MdDeletionEvent {
    type: "deletion";
    refOffset: number;
    refBases: string;
}
```

For example, `10A5^AC6` should produce:

```ts
[
    { type: "mismatch", refOffset: 10, refBase: "A" },
    { type: "deletion", refOffset: 16, refBases: "AC" }
]
```

The helper should allow zero-length match counts where the MD grammar uses them
to separate adjacent events, such as `0A0C10`.

#### Mismatch Rows

`alignmentMismatches` should clone each input read row and add:

```ts
interface AlignmentMismatchDatum extends BamReadDatum {
    mismatchStart: number;
    mismatchEnd: number;
    readOffset: number;
    base: string;
    refBase: string;
    baseQuality?: number;
}
```

Coordinate rules:

- `mismatchStart` is the 0-based reference coordinate of the mismatching base.
- `mismatchEnd` is `mismatchStart + 1`.
- `readOffset` is the 0-based offset into `seq`.
- `base` is `seq[readOffset]`.
- `refBase` comes from `MD`.
- `baseQuality` is `qual[readOffset]` when `qual` exists.

### Milestone 2 Transform Props

```ts
export interface AlignmentMismatchesParams extends TransformParamsBase {
    type: "alignmentMismatches";

    /**
     * The read's reference start coordinate.
     *
     * __Default value:__ `"start"`
     */
    start?: Field;

    /**
     * The CIGAR string.
     *
     * __Default value:__ `"cigar"`
     */
    cigar?: Field;

    /**
     * Read sequence field.
     *
     * __Default value:__ `"seq"`
     */
    sequence?: Field;

    /**
     * Base quality field.
     *
     * __Default value:__ `"qual"`
     */
    quality?: Field;

    /**
     * MD tag field.
     *
     * __Default value:__ `"md"`
     */
    md?: Field;
}
```

No `as` parameter is needed. The transform is BAM-specific and should emit the
fixed fields listed above.

### Milestone 2 Algorithm

1. Read `start`, `cigar`, `seq`, `qual`, and `md` using field accessors.
2. Return no rows for unavailable CIGAR values (`"*"`), matching
   `flattenCigar`.
3. Parse the CIGAR with the existing shared CIGAR helper.
4. Parse `MD`.
5. If `MD` is absent, throw a clear error explaining that
   `alignmentMismatches` requires the `MD` tag.
6. For each `M` operation, find MD mismatch events whose reference position
   falls inside the operation interval. For each event, compute:

   ```text
   readOffset = operation.readStart + (mismatchStart - operation.cigarStart)
   ```

7. For each `X` operation, emit one mismatch row per base in the operation,
   use `MD` to fill `refBase`, and fail if `MD` does not provide a reference
   base for the same position.
8. Ignore `=` operations because they explicitly represent sequence matches.
9. Ignore `I`, `D`, `N`, `S`, `H`, and `P` for mismatch output.
10. Clone the input datum for every emitted mismatch row and add the fixed
    mismatch fields.

The implementation should preserve the lane assigned by an upstream `pileup`
transform because each emitted row clones the original read datum.

### Milestone 2 Example Direction

The read track should keep the Milestone 1 structure: assign lanes before any
row-expanding transform, draw the read backbone, draw CIGAR overlays, and add a
separate mismatch layer.

Example transform chain for the read track:

```json
[
  { "type": "filter", "expr": "datum.mapq == null || datum.mapq >= minMapq" },
  {
    "type": "formula",
    "expr": "datum.mapq == null ? 0 : datum.mapq",
    "as": "mapqOrZero"
  },
  { "type": "pileup", "start": "start", "end": "end", "as": "_lane" }
]
```

Example mismatch layer:

```json
{
  "name": "mismatches",
  "title": "Mismatch",
  "transform": [
    { "type": "alignmentMismatches" },
    {
      "type": "filter",
      "expr": "datum.baseQuality == null || datum.baseQuality >= minBaseQuality"
    }
  ],
  "mark": {
    "type": "text",
    "font": "PT Serif",
    "fontWeight": "bold",
    "size": { "expr": "laneHeight * 0.75" }
  },
  "encoding": {
    "x": {
      "chrom": "chrom",
      "pos": "mismatchStart",
      "type": "locus",
      "band": 0.5
    },
    "text": { "field": "base", "type": "nominal" },
    "color": {
      "field": "base",
      "type": "nominal",
      "scale": {
        "domain": ["A", "C", "G", "T", "N"],
        "range": ["#4daf4a", "#377eb8", "#ff7f00", "#e41a1c", "#777777"]
      }
    },
    "opacity": {
      "field": "baseQuality",
      "type": "quantitative",
      "scale": { "domain": [0, 40], "range": [0.35, 1], "clamp": true }
    }
  }
}
```

The example should include a `minBaseQuality` parameter. If the mismatch layer
uses text marks, the layer should stay visually subordinate to the read
backbone and CIGAR evidence rather than becoming the dominant visual element.

### Milestone 2 Tests

`mdUtils.test.js` should verify:

- `101` produces no events.
- `10A5^AC6` produces one mismatch and one deletion event.
- `0A0C10` supports adjacent mismatches.
- malformed tags such as `""`, `"10^5"`, `"10A^"`, and `"10a5"` fail clearly.

`alignmentMismatches.test.js` should verify:

- `10M` with `MD:Z:4A5` emits one row at reference offset 4.
- `5S10M2I4M3D6M1S` with an MD mismatch inside each `M` block computes correct
  `mismatchStart`, `mismatchEnd`, and `readOffset`.
- `4=1X5=` with a matching `MD` tag emits one row for the explicit `X`
  operation.
- deletion tokens in `MD` do not produce mismatch rows.
- input fields such as `chrom`, `name`, and `_lane` are preserved.
- missing sequence fails only when the transform would emit a mismatch row.
- missing `MD` fails with a message that names the `MD` requirement.
- unavailable CIGAR (`"*"`) emits no rows.

Focused test command:

```sh
npx vitest run packages/core/src/data/transforms/mdUtils.test.js packages/core/src/data/transforms/alignmentMismatches.test.js
```

Schema and example checks:

```sh
npx vitest run packages/core/src/spec/schema.test.js
```

Validate `examples/docs/grammar/data/lazy/bam-read-alignments.json` against the
generated schema after adding the mismatch layer.

### Milestone 2 Documentation

The transform docs should explain:

- mismatch rows are sparse and emitted only for non-reference aligned bases
- `M` operations require `MD` to distinguish matches from mismatches
- explicit `X` operations still require `MD` so `refBase` is available
- insertions, deletions, and soft clips are represented through `flattenCigar`
- `baseQuality` comes from the BAM quality array when available

The BAM lazy-source docs should say that GenomeSpy now exposes CIGAR-derived
rows and mismatch rows, while allele-aware coverage and full IGV parity remain
out of scope.

### Milestone 2 Commit Sequence

Use small commits so review can separate parsing, transform behavior, docs, and
example work:

1. `feat(core): add MD tag parsing helpers`
2. `feat(core): add alignmentMismatches transform`
3. `docs(core): document BAM mismatch rows`
4. `docs: show BAM mismatch overlays`

The exact commit messages can be adjusted to match the final file scope.
