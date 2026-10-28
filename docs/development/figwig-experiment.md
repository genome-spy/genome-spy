# Local Figwig experiment

This experiment integrates the `@genome-spy/figwig` reader into
GenomeSpy and compares a single multitrack file with the ENCODE mouse fetal
development regional BigWigs. It is a local experiment on
`experiment/figwig-integration`, based on GenomeSpy
`91ce56e30eeb08f30e63fca518935d386e7f00f1`. The measurements below describe
local runs; the reader is now published on npm.

## Implementation

`FigWigSource` extends `IntervalUrlSource`. The base owns URL resolution, handle
caching, cancellation, window tracking, debounce, genomic discretization,
readiness and publication. A dynamic import loads one reader for one resolved
URL. Public `FigWigData` supports omitted, literal and reactive `tracks`, reactive
`mode: "exact" | "fast"`, and the normal channel, debounce and pixels-per-bin
options. Track and mode changes invalidate data and reuse the reader, metadata
and indexes. URL changes use the normal
descriptor path. Empty selections publish ready empty data.

The source derives integer genomic bin widths from the actual axis length and
`pixelsPerBin`. Fetch windows provide a small pan buffer, bounded to 32 bins
and one eighth of the viewport per edge. Published bin resolution is tracked
separately from spatial coverage so resize and failed-query retries still reload.
Exact mode, the default, uses mean aggregation, `missing: "omit"`, and
`useSummaries: false`. Fast mode uses the same exact queries below the file's
tile resolution. At coarser scales it rounds bin widths up to power-of-two tile
multiples, aligns chromosome queries, and requires rounded summaries with
`missing: "zero"`. Unavailable summaries cause an error before raw chunk reads.
Finite values,
including measured zeros and signed signals, become ordinary
`chrom/start/end/score/sampleId` rows. Track names supply sample IDs; URL descriptor
field conflicts raise errors. Requests clip to the file's chromosome bounds.
Figwig track metadata stays in the reader rather than being copied onto rows.

The public Core and App schemas and declarations were generated. Grammar docs
and schema-derived type links include the new source. An existing App bug found
in the original BigWig visualization was also fixed: group rows omitted `title`
when it equaled the name, but their formula required the field. The fix always
publishes it, with a regression assertion and a separate changeset.

## Reader dependency

Core and App use the published [`@genome-spy/figwig`](https://www.npmjs.com/package/@genome-spy/figwig)
package, currently `^0.1.0`. Install dependencies normally:

```sh
npm ci
```

No reader checkout, local tarball or source patch is required. The reader and its
`pako-esm2` inflater remain behind dynamic imports. The inflater is shared with
the GMOD dependencies when their versions align.

Version 0.1.0 exposes `useSummaries`, which can fall back to raw values, but not
the experiment's `requireSummaries` option. Before a coarse fast query,
`FigWigSource` checks the coarsest compatible summary for each selected group
and region through `getZoomLevels()` and `getSummary()`. An unavailable summary
fails before the bin query, preserving bounded work without patching the reader.

Earlier measurements used a locally patched reader. Its optimization and
required-summary changes were committed in the reader repository as
`64f6e2c`; the historical timings below are not new measurements of npm 0.1.0.

## Local dataset

The Figwig recipe was committed in the separate recipes repository at
`f88b5ac737dd77d26eaebbcf7310e280237cf375`. Additions under
`recipes/encode-mouse-fetal-development-mm10/`:

- `scripts/prepare_figwig.py` and `validate_figwig.py`, with uv script locks.
- `specs/spec-figwig.json`, `samples-figwig.json` and
  `h3k27ac-signal-figwig.json`, plus `metadata-figwig.json`.

The conversion reads `output/samples.tsv` in its established order and records
the same sample IDs as track names, with tissue, stage, replicate and ENCODE
accession metadata. It converts the existing regional BigWigs; no genome-wide
BigWigs were downloaded. Python Figwig 0.2.0 used eight threads, groups of eight,
tile size 16384, four zoom levels, mm10 and `--missing nan`.

The two-track trial took 7.55 seconds and produced 6,671,557 bytes. The full panel
took 31.02 seconds. Conversion timings were exploratory, not controlled speed
comparisons. The main file is
`output/figwig/h3k27ac.fw`; all generated files and reports are ignored locally.

| Input/layout                 |       Bytes | Relative to BigWigs |
| ---------------------------- | ----------: | ------------------: |
| 24 original regional BigWigs | 111,314,653 |                100% |
| Figwig, 1 track/group        | 109,129,191 |              98.04% |
| Figwig, 4 tracks/group       |  92,687,108 |              83.27% |
| Figwig, 8 tracks/group       |  89,734,106 |              80.61% |
| Figwig, 24 tracks/group      |  86,460,086 |              77.67% |

The original specs, generated BigWigs, provenance, rights, manifests, artifact
identities and output hashes were preserved. No recipe files or data were
committed, staged or uploaded. The experimental signal view retains the name
`h3k27ac-signal`, and otherwise preserves the original transforms and encodings.
The local Figwig signal variant now selects `mode: "fast"`; its README explains
the approximate coarse means and brush statistics.

## Embedded sample metadata

The local converter now embeds all 41 columns of `samples.tsv` in each of the
24 track records. Its typed records contain 27 numeric fields and preserve
sample IDs, accessions and technical-replicate labels as strings. The pinned
Python converter helper accepts these records directly. No string parsing or
type inference is performed by the App's Figwig backend.

The updated file is 89,771,464 bytes; the size comparisons above describe the
original conversion. The compressed signal payload, track identities,
statistics and all 15 group/summary levels match the previous file exactly.
All 984 embedded metadata values and types were verified, and the 81 exact
common-bin cases still pass with zero error.

The App's `figwig` metadata backend uses `getTracks()` and caches ordinary
metadata rows through the existing eager table adapter. It closes its own
short-lived header reader and never decodes signal chunks. The shared table
adapter has 349 lines and the separate Figwig adapter has 45, compared with the
original data adapter's 344. Table selection, validation, exclusions, grouping
and publication remain shared with the data backend. Reserved track fields and
the App's canonical `sample` field cannot be imported as attributes.

The mouse Figwig variant imports `metadata-figwig.json`, preserving the original
attribute definitions and excluding duplicate helper aliases. Its
`samples.identity` references that source and uses `displayNameField: "rowLabel"`.
The adapter reads all 24 IDs and labels from the same cached header as metadata
columns, including the excluded `rowLabel` field. A Chromium check blocked every
`samples.tsv` request and verified all IDs, labels and 936 displayed values
across 39 attributes and 24 samples, with zero TSV requests. Grouping,
filtering, brush-derived metadata, scatterplots, actual bookmark buttons and
mouse panning passed. No loading or console errors were observed.

The original BigWig variant, accepted v4 artifacts and publication records are
unchanged. Generated Figwig data and benchmark outputs remain ignored local artifacts.

## Optional dependency loading

Core's minimal entry excludes the Figwig source, reader and pako from every
emitted chunk. Register the optional signal source alongside
`@genome-spy/core/minimal` with its ordinary module import:

```js
import "@genome-spy/core/data/sources/lazy/figWigSource.js";
```

Its reader still loads on demand. In the App, configuring `backend: "figwig"`
loads the metadata adapter through a dynamic import; no separate metadata
import is needed. The shared table adapter contains no Figwig dependency.

Metadata runtime state caches adapter-creation promises. Bootstrap skips source
definitions with `initialLoad: false`, and dialog/import/summary operations await
the adapter when needed. Selecting a source for sample identity reads its IDs
and labels during startup even when columns are deferred. A real browser test
configured a deferred Figwig source without an identity reference
and verified zero adapter, reader, pako or Figwig-file requests during startup.
The mouse metadata and UI checks also pass through the asynchronous path.

The Core bundle verification checks both bare minimal and explicitly enabled
Figwig builds. The App production build inspects emitted ESM module graphs and
rejects eager adapter, reader or pako dependencies. Fat UMD bundles intentionally
include these implementations; the user explicitly accepted that distribution.

## Numerical validation

The repeatable Python validator computes reference means directly from original
BigWig intervals using overlap-weighted sums and covered-base counts. Its 81
cases include all 24 tracks and four chromosomes, random retained windows,
published enhancer intervals, region/tile boundaries, missing positions, explicit
zeros, single bases and coarse common bins.

- 3,991,536 base comparisons preserved float32 values and NaNs exactly.
- 62,712 common-bin comparisons passed in Python and JavaScript with maximum
  absolute and relative error zero. JavaScript checked 57,720 finite bins and
  4,992 NaN bins, including 7,276 measured-zero bins. Its acceptance tolerance
  was `1e-9 + 1e-10 × abs(reference)`; observed agreement was exact.
- All four grouping variants passed the same JavaScript references.
- 19,711,386 original records were checked for finite nonnegative signal;
  439,599 records contained genuine zero values.
- Track names, ordering, metadata and original chromosome lengths matched.
  Tested uncovered positions outside the four retained regions remained NaN.

The brush bookmark compares the exact interval chr10:87446400–87448800. The
original BigWig-derived values equaled direct reference means. Figwig's rendered
bin-weighted means matched 22 samples exactly. The other two differed by at most
0.00006289999 absolute, or 0.0010554% relative. E12.5 forebrain means were
7.946000738 and 6.341376698, heart 0.512839329 and 0.689250708, and limb
1.970166287 and 2.651535737 in both variants. Raw comparisons are in the ignored
`output/figwig/brush-comparison.json`.

This small difference is bin-edge weighting, not a reader precision error.
Existing weighted-mean analysis treats each displayed bin as constant.
Arbitrary brush endpoints or partly missing bins can therefore differ from a
base-resolution covered-base mean. Exact reader-bin correctness does not make
every downstream interval statistic exact. Stored Figwig summaries cannot
recover NaN-aware coverage counts. Exact mode therefore leaves them disabled;
fast mode explicitly accepts zero-filled approximate means at coarse scales.

## Browser and bookmark validation

The current local App runs with `npm start` at `http://127.0.0.1:8080/`.
The existing Express static route served both formats with actual HTTP 206,
`Content-Range` and bounded response bodies; no fallback full-file server was
needed. A 64-byte Figwig probe returned exactly bytes 0–63/89734106.

Both variants completed all six bookmarks with no console or data-loading
errors. Assertions checked sample identities, 24/6/24/6/6/24 selected signal
tracks, finite intervals, successful intent completion, 24 derived metadata
values and successful scatterplot rebuilding. Figwig retained one reader across
the sequence and both passes. Screenshots confirmed group labels, sample
alignment, the genomic brush and scatterplot. Actual Next/Previous buttons,
opening the scatterplot larger, and mouse-drag panning after filtering also
passed. Ungrouping, regrouping and descending replicate sorting after filtering
also preserved the six selected tracks. Recorded artifacts are under ignored
`output/playwright/`.

## Initial App performance, before the performance fixes

Chromium ran at 1440 × 1000 over localhost with browser HTTP caching disabled.
Each format used a fresh browser context; the warm pass reused its readers and
visited all bookmarks again. Bytes below are transferred signal-response bodies,
excluding JavaScript, annotations, HTTP headers and metadata tables from other
sources. A bookmark's first visit after overview is not an independently cold
reader. Times include the actual App restoration, animations, lazy readiness
and two animation frames, so they are not isolated decoder throughput. The table
records one tour per format; the grouping benchmark below has three repetitions.

| App operation                       | BigWig ms / requests / bytes | Figwig ms / requests / bytes |
| ----------------------------------- | ---------------------------: | ---------------------------: |
| Initial 10 Mb overview              |        6,094 / 168 / 373,186 |     16,675 / 40 / 30,186,213 |
| Six-track Ascl1, first visit        |           430 / 22 / 532,942 |            291 / 3 / 902,448 |
| Brush/scatter bookmark, first visit |        2,684 / 110 / 873,576 |           3,034 / 3 / 86,393 |
| Heart, first visit                  |         1,594 / 12 / 181,801 |          1,635 / 3 / 318,304 |
| Limb, first visit                   |            684 / 9 / 471,466 |          611 / 3 / 1,018,240 |
| 24-track mEN886, first visit        |           507 / 47 / 946,972 |            662 / 3 / 526,036 |
| Overview after full tour            |           305 / 24 / 300,842 |      7,078 / 22 / 29,003,019 |
| Brush/scatter after full tour       |         2,962 / 48 / 784,380 |                3,117 / 0 / 0 |
| Revisit filter then pan             |            868 / 6 / 473,075 |                  333 / 0 / 0 |

First signal publication occurred at 3,797 ms for BigWig and 16,509 ms for
Figwig after navigation. This is a publication marker, not an independently
observed GPU-presentation timestamp. The largest end-of-operation CDP
`JSHeapUsedSize` samples were about 114.7 MB BigWig and 117.0 MB Figwig. These
samples do not establish actual peaks or account for all typed-array backing
storage, process and GPU memory, so they do not establish lower total memory use
for Figwig. CDP ScriptDuration is recorded but does not isolate
all decoder CPU time. The reader-specific measurements below provide that
separation for Figwig.

These initial measurements exposed a serious integration problem, diagnosed
below. They remain the baseline rather than describing the corrected source.
Exact Figwig queries still transfer far more data than BigWig zoom summaries.

## Performance follow-up

The user's DevTools profile identified representability checks on every decoded
value, including eager error-string construction. A separate CPU profile exposed
the main cause of the long overview delay: the source fetched 28,056,576 bases
for a 10,000,001-base viewport. This added 3309 dense missing-data chunks outside
the retained region. Only 1,770,315 compressed bytes expanded to 1,734,868,992
bytes (1.62 GiB); checksum, numeric validation and binning loops then processed
those unnecessary NaNs. The exact viewport contained 1833 run chunks and only
70,563,784 inflated bytes.

Bounded prefetch now loads chr10:82212077–92441037 for the same
chr10:82400000–92400001 viewport: 10,228,960 bases, 2.29% extra. With the original
reader unchanged, the profiled App query dropped from 12.815 seconds to
1.172 seconds and decoded chunks fell from 5142 to 1878. Querying only the
viewport with that reader took about 0.9 seconds. Spatial quantization remains
owned by `IntervalUrlSource`; a small optional force flag allows resolution
changes to reload an otherwise cached spatial window.

The standalone reader patch skips representability scans when decoding already
proves the result: float32 storage into float32 tracks, and decoded values into
float64 tracks. Error text is built only on failure. Narrowing, signedness,
integer, NaN and infinity validation remain enforced. Its 154 unit tests and
three Chromium conformance tests passed, including deliberately malformed files.
An exploratory Node comparison on the original padded query measured decoding
at 2564 ms before, 2243 ms with lazy error text alone, and 869 ms with both
changes. The source fetch-window fix accounts for most of the end-to-end gain.

The final Chromium run confirmed the patched reader in Vite's optimized module:

| Measurement                               | Original integration |      Both fixes |
| ----------------------------------------- | -------------------: | --------------: |
| Profiled overview signal query            |            12,815 ms |        1,068 ms |
| Query decoding diagnostic                 |             2,346 ms |           80 ms |
| Total cold App startup                    |            16,675 ms |        5,506 ms |
| Initial signal HTTP requests / body bytes |      40 / 30,186,213 | 14 / 28,439,973 |
| Overview after the full tour              |             7,078 ms |        1,325 ms |

The earlier unpatched-reader run with the corrected source measured 181 ms
decoding, versus 80 ms with the patched reader, using the same 1878 chunks.
The exact query with the final reader took 849 ms. These are exploratory local
measurements rather than throughput guarantees. Reducing padding removes CPU
work far more than network traffic: almost all 28 MB of real signal data remains
necessary for exact overview means. The default decoded cache still cannot
retain the entire overview working set, so returning to it transfers data again.
Both full bookmark passes, expanded scatterplot, filtering, ungrouping,
regrouping, sorting and mouse panning passed with the patched browser package.

All 81 common-bin references still pass with zero error after installing the
patched package. Both cold and warm brush-derived means retain the earlier
maximum absolute difference 0.00006289999 (0.0010554%) from exact interval means.
These earlier optimizations preserve exact missing-aware aggregation. Fast mode
is a separate, explicit policy described below; neither mode uses dataset masks.

## Whole-genome fast mode

The whole-genome Chromium run used the real mouse App at 1440 × 1000, a fresh
context, disabled browser HTTP caching, and the entire mm10 domain. The local
file contains four chromosomes, so absent chromosomes remain empty. All 24
sample tracks rendered aligned, and all published intervals were finite.

| Operation                    | App completion | Signal requests / bytes | Raw chunks |
| ---------------------------- | -------------: | ----------------------: | ---------: |
| Cold whole-genome startup    |       3,413 ms |             5 / 269,949 |          0 |
| Warm whole-genome request    |          22 ms |                   0 / 0 |          0 |
| Filter to six tracks         |       1,467 ms |                   0 / 0 |          0 |
| Pan within the loaded genome |          33 ms |                   0 / 0 |          0 |

The initial source query took 28 ms after reader initialization; the six-track
query took less than 1 ms. App completion includes module loading, other data,
rendering and interaction work. The table records the final local run; an
earlier run measured 3,370 ms startup and a 31 ms source query. These are not
frame-time or remote-network guarantees. All five signal responses were HTTP 206. Reader
diagnostics reported 269,949 index/summary bytes, zero raw data bytes, zero
fetched/decompressed chunks and zero decoding time. Bins were 4,194,304 bases;
every region returned `source: "summary"` with summary-only queries.

Returning to the 10 Mb bookmark switched to exact 9,175-base bins because they
are finer than the 16,384-base tile size. Both passes of all six bookmarks,
24/six-track selection, brush-derived metadata and scatterplot rebuilding passed
with one cached reader and no console or loading errors. Detailed views retain
the raw-query cost documented above.

The fast coarse mean divides rounded sums by the full bin width, including
missing bases. Gaps therefore dilute the signal, and brush statistics reuse
these displayed approximations. The source checks summary availability
before bin queries; it does not infer missing coverage counts or add a
new format. The exact common-bin oracle still passes with zero error.

The benchmark records query policies, returned summary/value sources and reader
diagnostics in `output/playwright/benchmark-results-whole-genome-figwig.json`.
The corresponding rendered overview is `output/playwright/figwig-whole-genome.png`.

## Initial grouping benchmark, before the reader patch

An independent browser reader benchmark ran three repetitions for each grouping,
selection, window and cold/warm combination: 96 samples. It excludes Vite imports
and App rendering, uses 1000 exact missing-aware bins, separates initial metadata
loading, and validates every HTTP partial response. Metadata initialization cost
two requests, approximately 5.1–5.3 kB and 2 ms per fresh reader.

Median cold 10 Mb query costs, excluding metadata:

| Tracks/group | All 24: ms / requests / bytes | Six E12.5: ms / requests / bytes |
| ------------ | ----------------------------: | -------------------------------: |
| 1            |       1,230 / 49 / 30,877,582 |             365 / 12 / 8,714,214 |
| 4            |       1,007 / 17 / 28,768,005 |             424 / 7 / 11,911,355 |
| 8            |         999 / 12 / 28,410,807 |            946 / 12 / 28,410,807 |
| 24           |          940 / 9 / 27,258,144 |             874 / 9 / 27,258,144 |

The established sample order spreads E12.5 tracks across every eight-track group,
so selecting six tracks cannot save transfer in that layout. One- and four-track
groups trade larger indexes/more requests for lower subset transfer.

For the eight-track layout, the 210 kb focused query took 48 ms, six requests and
800,498 bytes cold; the same query warm took 1.7 ms and zero requests. The 10 Mb
warm query still took 810 ms and transferred 23,227,756 bytes in seven requests:
decoded chunks exceed the default 64 MiB chunk cache and evict one another.
Median cold 10 Mb diagnostics reported approximately 656 ms decompression and
126 ms decoding, 78.4 MB estimated retained caches and a 128.6 MB sampled JS heap.
These exploratory shared-workstation timings have three repetitions; they do
not establish network-latency, frame-time or process-memory guarantees.

## Reproduction

From the recipes repository:

```sh
uv run --locked --script recipes/encode-mouse-fetal-development-mm10/scripts/prepare_figwig.py
uv run --locked --script recipes/encode-mouse-fetal-development-mm10/scripts/validate_figwig.py
```

To generate the additional layouts for the grouping benchmark, also run from
the recipes repository:

```sh
for group in 1 4 24; do
  uv run --locked --script recipes/encode-mouse-fetal-development-mm10/scripts/prepare_figwig.py \
    --groups "$group" --name "h3k27ac-g$group"
done
```

The converter refuses to overwrite an existing file. Use `--name another-name`
for an additional conversion. From GenomeSpy, after dependency setup:

```sh
npm start
```

Open the original or experimental App:

```text
http://127.0.0.1:8080/?spec=private/genomespy-dataset-recipes/recipes/encode-mouse-fetal-development-mm10/specs/spec.json
http://127.0.0.1:8080/?spec=private/genomespy-dataset-recipes/recipes/encode-mouse-fetal-development-mm10/specs/spec-figwig.json
```

Repeat JavaScript numeric validation from GenomeSpy:

```sh
node scripts/validateFigwigExperiment.mjs \
  private/genomespy-dataset-recipes/recipes/encode-mouse-fetal-development-mm10/output/figwig/h3k27ac.fw \
  private/genomespy-dataset-recipes/recipes/encode-mouse-fetal-development-mm10/output/figwig/numeric-reference.json
node scripts/benchmarkFigwigApp.mjs
FIGWIG_WHOLE_GENOME=1 node scripts/benchmarkFigwigApp.mjs figwig
node scripts/benchmarkFigwigGroups.mjs \
  http://127.0.0.1:8080/private/genomespy-dataset-recipes/recipes/encode-mouse-fetal-development-mm10/output/figwig/ \
  private/genomespy-dataset-recipes/recipes/encode-mouse-fetal-development-mm10/output/figwig/browser-grouping-benchmark.json
```

The grouping benchmark additionally requires the g1/g4/g24 local conversions;
the main App experiment needs only `h3k27ac.fw`.

## Verification and limitations

The full unit suite passed 558 files and 5,316 tests, with one skipped and two
todo. Narrow source and App regression tests, generated-schema tests, upstream
numerical validation, and real-browser checks passed.
Workspace typechecks, lint, the complete workspace build and the documentation
build passed. The npm 0.1.0 migration also passed an ordinary `npm ci`, all 81 exact
numerical cases with zero error, and the 17-stage mouse browser check. The
whole-genome stages fetched no raw bytes or chunks. Metadata and identity
loaded all 24 samples without sample-TSV requests; bundle checks retained lazy
reader/inflater imports.

Release fixtures now distinguish actual workspace packages from external npm
packages sharing the `@genome-spy` scope. They no longer need local tarball
copying. The full suite runs with four workers to avoid resource-sensitive
schema timeouts.

The original recipe's verification and targeted recipe checks passed. Whole
recipe-repository validation still reports an unrelated incomplete
`encode-a549-dexamethasone-grch38` recipe; it was not changed.
No Firefox/WebKit, remote high-latency network, continuous frame profiler or
process peak-memory measurement was tested. Exact mode preserves missing-aware
bin means; fast mode explicitly trades coarse missingness semantics for bounded
summary work.
