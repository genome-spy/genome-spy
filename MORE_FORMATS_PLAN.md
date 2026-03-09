# More Formats Support Plan

## Goal

Add robust (non-lazy) support for:

- SEG
- MAF
- CN
- BEDPE
- BED

with explicit handling for headerless inputs where column names must be provided externally.

## Scope and outcomes

- New tabular format handlers in Core data loading.
- Shared normalization into GenomeSpy canonical genomic fields.
- BED parsing based on `@gmod/bed` (matching the parser model used by `bigBedSource.js`).
- BEDPE parsing via a dedicated parser path (not `@gmod/bed`).
- Delimited text parsing based on `d3-dsv` whenever possible (no ad-hoc line split parsers by default).
- Minimal user-facing schema support for headerless parsing (`columns`).
- Parser-level validation that fails fast when required columns are missing.
- Pre-filtering for BED control lines (`track`, `browser`, `#`) before parsing.
- End-to-end example specs and docs for each format.
- Unit tests for parsing, normalization, and failure cases.

## Proposed architecture

1. Add a shared tabular ingestion layer used by SEG, MAF, CN, and BEDPE, built on `d3-dsv`.
2. Implement BED parsing through `@gmod/bed` for consistency with BigBed handling.
3. Add BED-specific pre-processing and post-normalization around `@gmod/bed`.
4. Add per-format adapters that map source columns into canonical internal fields.
5. Centralize genomic coordinate normalization to one internal convention.
6. Keep the implementation non-lazy: parse and normalize all rows on ingest.

## Alignment with current Vega/Vega-Lite-style `data` config

The current eager URL path in GenomeSpy is:

- `UrlSource` fetches content and calls `read(content, format)` from `vega-loader`.
- `format` is taken directly from `data.format` via `getFormat(...)`.
- Custom formats are integrated by registering loaders using `vegaFormats(type, parser)` in `genomeSpy.js`.

Implications for this plan:

- New eager formats (`bed`, `maf`, `seg`, `cn`, `bedpe`) should be implemented as custom `vega-loader` formats.
- Users should configure these through standard `data.url` + `data.format.type` style.
- Because URL-based type inference currently recognizes only `.csv/.tsv/.json`, users must explicitly set `format.type` for these new formats.
- `format.parse` remains available, but only as an explicit user override.
- Auto type inference must not rewrite parser-produced fields for these formats.
- Parser backend policy:
  - `bed`: `@gmod/bed`
  - `bedpe`, `seg`, `maf`, `cn`: `d3-dsv` (tab-delimited by default)

Schema implications:

- `DataFormat` currently permits arbitrary `type` strings, but `OtherDataFormat` allows only `type`.
- To support minimal typed options, add explicit format interfaces:
  - `BedDataFormat`
  - `BedpeDataFormat`
  - `SegDataFormat`
  - `MafDataFormat`
  - `CnDataFormat`
- Update the `DataFormat` union and schema so these options are valid and documented.

## Minimal user-facing config policy

- Keep user-facing options to the smallest practical set:
  - `format.type` (required)
  - `format.columns` (only when there is no usable header row)
  - existing Vega `format.parse` (only when user explicitly wants additional coercion)
- Prefer format defaults and deterministic parser behavior over extra format knobs.
- Avoid introducing optional feature flags unless they are required by real file variability.

## Parser backend policy

- Use `d3-dsv` for delimited text parsing whenever format semantics allow it.
- Do not introduce ad-hoc text parsers (`split("\\n")`, `split("\\t")`, custom tokenizers) for normal paths.
- Keep `@gmod/bed` as the BED parser due to BED/autoSql semantics and alignment with existing BigBed code.
- Any performance-motivated custom parser must be benchmarked and justified against `d3-dsv` before adoption.

## Verified `@gmod/bed` capabilities and constraints (v2.1.7)

- Public API is line-oriented (`new BED(...).parseLine(line)`), with `autoSql` or built-in `type`.
- Works best for BED3/BED6/BED12 and autoSql-driven BigBed-style schemas.
- In default mode it uses a BED12 heuristic; non-BED12 extended records can fall back to generic `fieldN` names.
- Numeric conversion is not universal for all autoSql numeric types, so adapters may need explicit numeric coercion for known fields.
- It decodes `chrom` with `decodeURIComponent`, so malformed encoded chromosome names should fail fast with clear errors.
- It is not a BEDPE parser and assumes BED-like `chrom/chromStart/chromEnd` semantics.

## Canonical internal fields

Use consistent internal names regardless of source format:

- `chrom`
- `start`
- `end`
- `sample` (when applicable)
- format-specific payload fields (for example `segmentMean`, `Hugo_Symbol`, `score`, `strand1`)

Coordinate target: 0-based, half-open intervals.

## Format-specific plan

## 1) BED

- Use `@gmod/bed` as the parser backend (same library family as `bigBedSource.js`).
- Follow the `bigBedSource.js` integration style:
  - dynamic import in source initialization
  - parser-driven field object output
  - optional fast-path parsing only if benchmarked and justified
- Support BED3 required fields.
- Support BED4-12 with explicit mapping behavior:
  - BED3/BED4/BED5/BED6 parsed as expected
  - BED7-BED11 and BED12 parsed with deterministic naming (no leaked `fieldN` names in published rows)
- Default assumption: headerless BED with positional columns.
- Allow overriding names when a header is present or custom columns are used.
- Filter out control/comment lines before handing records to `@gmod/bed`.
- Add strict validation for malformed URI-encoded chromosome names.

## 2) BEDPE

- Do not use `@gmod/bed` for BEDPE.
- Implement in the shared `d3-dsv` parser path with explicit BEDPE column contracts.
- Support paired interval core fields:
  - `chrom1`, `start1`, `end1`
  - `chrom2`, `start2`, `end2`
- Support common optional fields (`name`, `score`, `strand1`, `strand2`).
- Normalize BEDPE unknown sentinels to missing values:
  - `.` -> `null` for string-like fields (`chrom*`, `name`, `strand*`)
  - `-1` -> `null` for coordinate fields (`start*`, `end*`)
- Normalize for paired-event rendering tracks.

## 3) SEG

- Start from IGV-style SEG conventions.
- Parse rows via `d3-dsv` and map columns to required SEG fields.
- Required mapping:
  - `sample`, `chrom`, `start`, `end`, `numMarkers`, `segmentMean`
- Handle both headered and headerless variants with explicit column mapping.
- Convert coordinates when needed.

## 4) MAF

- Start from GDC-required columns for practical interoperability.
- Parse rows via `d3-dsv` and map required MAF columns.
- Required ingest subset:
  - `Hugo_Symbol`, `Chromosome`, `Start_Position`, `End_Position`
  - `Reference_Allele`, `Tumor_Seq_Allele2`, `Tumor_Sample_Barcode`
- Keep additional columns as pass-through payload for downstream encodings.
- Apply coordinate normalization from MAF conventions into canonical interval fields.

## 5) CN

- Support GenePattern CN conventions with deterministic column contracts.
- Parse rows via `d3-dsv`; apply layout-specific mapping after parsing.
- Cover both:
  - segment-like CN rows
  - matrix-like CN tables (unpivot to long form)
- Define strict required-column contracts per supported CN layout.

## Spec and schema changes

Extend `data.format` schema with:

- `type`: add `seg`, `maf`, `cn`, `bed`, `bedpe`
- `columns`: explicit ordered column names for headerless files
- `parse`: existing Vega parse mapping, supported as-is for explicit user coercions

Validation rules:

- If there is no usable header row, `columns` is required.
- Required logical fields per format must resolve unambiguously.
- Unresolved required fields fail with clear errors.
- `bedpe` requires both interval triplets to resolve (`chrom1/start1/end1` and `chrom2/start2/end2`).

## Parsing and validation behavior

- Offensive style: fail fast with descriptive errors.
- No silent field guessing when mappings are ambiguous.
- Deterministic precedence:
  1. explicit `columns` and mapping
  2. header-derived names
- `parse` policy:
  1. for `bed`, `bedpe`, `seg`, `maf`, `cn`, do not force `parse: "auto"`
  2. apply `format.parse` only when explicitly provided by user
- BED-specific behavior:
  1. pre-filter comments/control lines
  2. parse with `@gmod/bed`
  3. canonicalize optional BED fields to stable names
  4. reject malformed percent-encoded chromosome names with source line context
- BEDPE-specific behavior:
  1. parse tabular rows with `d3-dsv`
  2. resolve positional fields according to BEDPE column order
  3. map unknown sentinels (`.`, `-1`) to `null`
 
- SEG/MAF/CN-specific behavior:
  1. parse tabular rows with `d3-dsv`
  2. apply format-specific required-field mapping and validation

## Config/spec examples

These examples follow GenomeSpy's current eager URL source shape (`data.url` + `data.format`).

### BED example

```json
{
  "data": {
    "url": "regions.bed",
    "format": {
      "type": "bed"
    }
  },
  "mark": "rect",
  "encoding": {
    "x": { "chrom": "chrom", "pos": "start", "type": "locus" },
    "x2": { "chrom": "chrom", "pos": "end" },
    "color": { "field": "name", "type": "nominal" }
  }
}
```

### MAF example

```json
{
  "data": {
    "url": "mutations.maf",
    "format": {
      "type": "maf"
    }
  },
  "mark": "point",
  "encoding": {
    "x": { "chrom": "chrom", "pos": "start", "type": "locus" },
    "color": { "field": "Variant_Classification", "type": "nominal" },
    "tooltip": [
      { "field": "Hugo_Symbol", "type": "nominal" },
      { "field": "Tumor_Sample_Barcode", "type": "nominal" }
    ]
  }
}
```

### SEG example (headerless with explicit columns)

```json
{
  "data": {
    "url": "segments.seg",
    "format": {
      "type": "seg",
      "columns": [
        "sample",
        "chrom",
        "start",
        "end",
        "numMarkers",
        "segmentMean"
      ]
    }
  }
}
```

### BEDPE example

```json
{
  "data": {
    "url": "sv_events.bedpe",
    "format": {
      "type": "bedpe",
      "columns": [
        "chrom1",
        "start1",
        "end1",
        "chrom2",
        "start2",
        "end2",
        "name",
        "score",
        "strand1",
        "strand2"
      ]
    }
  }
}
```

### CN example

```json
{
  "data": {
    "url": "copy_number.cn",
    "format": {
      "type": "cn"
    }
  }
}
```

### Optional `parse` override example

```json
{
  "data": {
    "url": "mutations.maf",
    "format": {
      "type": "maf",
      "parse": {
        "t_alt_count": "number",
        "t_ref_count": "number"
      }
    }
  }
}
```

## Test plan

Add unit tests next to parser/format modules:

- Happy-path parsing for each format.
- BED test scope in GenomeSpy is integration-only; rely on `@gmod/bed` upstream tests for parser internals.
- BED control-line filtering tests (`track`, `browser`, `#`).
- BED7-BED11 canonical naming tests (ensure no user-facing `fieldN` leakage).
- Tests covering `@gmod/bed` decode failures for invalid chromosome encoding.
- BED `UrlSource` smoke test with `data.url` + `format.type: "bed"`.
- Headerless parsing with explicit `columns`.
- Coordinate conversion checks.
- Failure tests for missing required columns and malformed values.
- CN matrix-to-long transformation tests.
- Parse-policy tests:
  - `parse` omitted -> parser-native types preserved
  - explicit `parse` mapping -> selected fields are coerced
- BEDPE unknown-value normalization tests (`.` and `-1` -> `null`).

Add fixture files for minimal and representative examples per format.

BED fixtures should be minimal and targeted to GenomeSpy wrapper behavior, not full BED grammar conformance.

## Documentation plan

- Update `docs/grammar/data/eager.md` with new eager `format.type` values: `bed`, `bedpe`, `seg`, `maf`, `cn`.
- Add one minimal, runnable config example per format in docs.
- Add a dedicated headerless-data subsection that explains:
  - when `format.columns` is required
  - BEDPE positional column order
  - BEDPE unknown sentinel normalization (`.`/`-1` -> `null`)
- Add a short `parse` subsection that explains explicit opt-in mappings and why `parse: "auto"` is not the default for these formats.
- Link to official format specs from the docs page, not only from this plan.
- Ensure schema-derived docs include the new format interfaces and properties.
- Regenerate artifacts after schema/type changes (`npm run build && npm run build:docs`) if docs macros/types are missing.
- Add at least one docs embed example (`genome-spy-doc-embed`) for BED and one for MAF.

## Documentation acceptance criteria

- A user can copy a BED example and a MAF example from docs and load data without extra hidden settings.
- Headerless usage is documented with a concrete `format.columns` example.
- BEDPE handling of unknown values is explicitly documented.
- All new `data.format` options appear in generated schema/docs.

## File format references

- SEG (IGV): <https://igv.org/doc/desktop/#FileFormats/DataTracks/#seg>
- MAF (GDC): <https://docs.gdc.cancer.gov/Data/File_Formats/MAF_Format/>
- CN (GenePattern): <https://www.genepattern.org/file-formats-guide/#CN>
- BED (UCSC): <https://genome.ucsc.edu/FAQ/FAQformat#format1>
- BEDPE (bedtools): <https://bedtools.readthedocs.io/en/latest/content/general-usage.html#bedpe-format>

## Delivery phases

1. Foundation:
   - shared tabular ingest helpers
   - schema additions
   - validation framework
2. BED + BEDPE:
   - BED source path using `@gmod/bed` wrapper logic
   - BEDPE parser adapter on shared tabular parser
   - tests
   - docs snippets
3. SEG:
   - parser adapter
   - tests
   - docs snippet
4. MAF:
   - parser adapter
   - required subset validation
   - tests and docs
5. CN:
   - layout handling and transformations
   - tests and docs
6. Integration polish:
   - end-to-end examples
   - error-message cleanup
   - final docs pass

## Risks and mitigations

- Ambiguous column naming in real-world files:
  - Mitigation: explicit `columns` contracts, fail-fast errors.
- `@gmod/bed` default BED12 heuristic can produce unstable optional-field names for BED7-BED11:
  - Mitigation: canonical post-mapping layer and dedicated tests.
- Coordinate convention drift across sources:
  - Mitigation: centralized conversion with format-specific defaults.
- CN format variability:
  - Mitigation: explicit layout contracts and targeted fixtures.
- BEDPE parser mismatch if routed through BED tooling:
  - Mitigation: dedicated BEDPE parser path and explicit contracts.
- Drift into ad-hoc parser implementations over time:
  - Mitigation: explicit `d3-dsv`-first policy in implementation and code review.

## Definition of done

- All five formats parse into canonical fields with non-lazy ingestion.
- Headerless files are supported via explicit configuration.
- Tests cover both success and failure paths.
- Docs include format examples, headerless guidance, and explicit BEDPE unknown-value behavior.
