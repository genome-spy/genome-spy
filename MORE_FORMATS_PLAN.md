# More Formats Plan (Remaining Work)

## Goal

Finalize genomic text-format support with a minimal and predictable model:

- keep custom eager source formats only where they are truly needed (`bed`, `bedpe`)
- use plain `tsv` + transforms for semantic normalization of `maf` and `seg`
- avoid source-level column canonicalization that duplicates semantic fields

## Updated approach

- `BED`: keep custom source parser (`@gmod/bed`), because plain TSV is not sufficient.
- `BEDPE`: keep custom source parser, because paired-interval semantics and sentinel handling are format-specific.
- `MAF` and `SEG`: move semantic mapping to transforms, not source formats.
  - ingest as `format.type: "tsv"`
  - normalize in transform stage (coordinates, required fields, canonical output fields)

## Remaining scope

1. Introduce transform(s) for `maf` and `seg` normalization.
2. Remove source-level canonicalization flow for `maf` and `seg`.
3. Keep docs/examples minimal and transform-first for `maf`/`seg`.
4. Revisit `cn` after `maf`/`seg` migration and decide whether to keep it as source format or move to transform as well.

## Transform contracts (proposed)

### `mafToGenomic`

- Input: row objects from TSV with standard MAF header names.
- Required fields:
  - `Hugo_Symbol`
  - `Chromosome`
  - `Start_Position`
  - `End_Position`
  - `Reference_Allele`
  - `Tumor_Seq_Allele2`
  - `Tumor_Sample_Barcode`
- Output fields:
  - `chrom`, `start`, `end`, `sample`
- Coordinate convention:
  - `start = Start_Position - 1`
  - `end = End_Position`
- Invalid numeric values map to `null` (no per-cell throw in hot path).

### `segToGenomic`

- Input: row objects from TSV with SEG-style headers.
- Required logical fields:
  - `sample` (`ID` or `sample`)
  - `chrom`
  - `start`
  - `end`
  - `numMarkers`
  - `segmentMean`
- Output fields:
  - `chrom`, `start`, `end`, `sample`, `numMarkers`, `segmentMean`
- Coordinate convention:
  - `start = inputStart - 1`
  - `end = inputEnd`
- Invalid numeric values map to `null`.

## Open decision

MAF meta/comment lines that begin with `#`:

- Option A: require pre-cleaned MAF for transform-first path.
- Option B (preferred): add a generic comment-line stripping mechanism for delimited eager sources and use it with `tsv`.

## Execution plan

### Phase 1: Add transforms and tests

- Implement:
  - `mafToGenomic` transform
  - `segToGenomic` transform
- Tests:
  - happy path for both transforms
  - required-field failures
  - coordinate normalization
  - invalid-number coercion to `null`

### Phase 2: Migrate specs/docs to transform-first usage

- Update docs examples:
  - `maf`: `format.type: "tsv"` + `mafToGenomic`
  - `seg`: `format.type: "tsv"` + `segToGenomic`
- Keep user-facing config minimal (no new knobs unless required).

### Phase 3: Remove source-level MAF/SEG path

- Remove/de-register eager `maf` and `seg` source formats.
- Remove MAF/SEG source-format schema/docs entries if they become obsolete.
- Keep `bed`/`bedpe` source formats unchanged.

### Phase 4: CN follow-up decision

- Evaluate whether current `cn` source format should:
  - stay as source format, or
  - be migrated to `tsv` + transform for consistency.
- Make decision based on real config complexity and performance tradeoffs.

## Test and verification checklist (remaining)

- `npx vitest run` for new transform test files
- `npx vitest run packages/core/src/data/sources/urlSource.test.js`
- `npm test`
- `npm -ws run test:tsc --if-present`
- `npm run lint`

## Documentation tasks (remaining)

- Update `docs/grammar/data/eager.md` examples for transform-first `maf`/`seg`.
- Add short transform usage examples to transform docs.
- Keep BED/BEDPE docs and examples as source-format examples.

## File format references

- SEG (IGV): <https://igv.org/doc/desktop/#FileFormats/DataTracks/#seg>
- MAF (GDC): <https://docs.gdc.cancer.gov/Data/File_Formats/MAF_Format/>
- CN (GenePattern): <https://www.genepattern.org/file-formats-guide/#CN>
- BED (UCSC): <https://genome.ucsc.edu/FAQ/FAQformat#format1>
- BEDPE (bedtools): <https://bedtools.readthedocs.io/en/latest/content/general-usage.html#bedpe-format>

## PR notes (draft)

This work added robust eager genomic text-format support and related docs/tests, then tightened parser behavior and examples. The remaining follow-up is to move `maf`/`seg` semantics from source formats to transforms to avoid source-level canonicalization and duplicate semantic columns.

Already done:

- eager format scaffolding and `format.parse` handling updates for genomic custom formats
- eager `bed` loader using `@gmod/bed` with control-line filtering
- eager `bedpe` loader with sentinel normalization (`.` and `-1` -> `null`)
- eager `seg`, `maf`, and `cn` loaders with tests
- docs for eager genomic formats and format reference links
- stricter alias cleanup and template-literal style cleanup
- parser hot-path performance pass (reduced validation overhead)
- new `packages/core/examples/genomic/` examples for BED and BEDPE (including link-mark BEDPE examples)

Planned follow-up for this PR series:

- implement and adopt `mafToGenomic` / `segToGenomic` transforms
- migrate docs/spec examples to transform-first `maf`/`seg`
- remove/deprecate source-level `maf`/`seg` canonicalization path
