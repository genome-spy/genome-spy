# Coordinate parsing and formatting

The optional `@genome-spy/core/coordinates` entry parses location input and formats
chromosome-relative intervals. It works without a browser, visualization, or
configured assembly. Datum matching is a separate utility.

```js
import {
  parseCoordinates,
  formatCoordinates,
} from "@genome-spy/core/coordinates";

const result = parseCoordinates("chr1:10-20");
if (result.kind === "coordinate") {
  console.log(result.interval); // [{chrom: "chr1", pos: 9}, {chrom: "chr1", pos: 20}]
  console.log(formatCoordinates(result.interval)); // chr1:10-20
}
```

Input positions are **one-based and inclusive**. Parsed endpoints are always
**zero-based and half-open**, including single positions: `chr1:10` becomes
`[9, 10)`. Commas may group thousands. Ranges may cross chromosomes, such as
`chr1:100-chr2:20`; custom contig names are supported.

Without an assembly, parsing checks syntax, positive safe-integer positions, and
same-contig ordering. It cannot establish contig existence, bounds, aliases, or
cross-contig ordering. Bare names, including `chr1`, return `not-coordinate`.

Pass `{contigs: [{name, size}, ...]}` to validate an ordered assembly dictionary.
This additionally checks contig existence, endpoint bounds, and chromosome order,
canonicalizes unambiguous `chr` prefix aliases, and recognizes bare contig names
as their full extents. Unknown bare names return `not-coordinate`, allowing the
caller to try datum search. Canonical names take precedence over aliases. Ordinal
chromosome-number aliases are not accepted. Invalid dictionaries throw.

A result is one of:

- `coordinate`, with a structured `interval`;
- `not-coordinate`, for input the parser does not recognize;
- `invalid-coordinate`, with a `code` and `message` for malformed coordinates or
  failed assembly validation.

For example, `TP53` is unrecognized unless configured as a contig, while `chr1:0`
is invalid. The caller decides whether to try datum search or display an error.
Parsing never fetches data, performs datum search, or navigates.

## Navigating an embedded locus scale

`getAssembly()` returns detached ordered contigs from the addressed locus scale's
resolved assembly, including custom or URL-backed assemblies loaded during
startup. It throws for non-locus scales. There is no need to configure a second
genome in the embedding application.

```js
const scale = api.getScaleResolutionByName("genome");
const result = parseCoordinates(input, scale.getAssembly());
if (result.kind === "coordinate") {
  const [begin, end] = result.interval;
  // Existing scale APIs use zero-based inclusive upper endpoints.
  await scale.zoomTo([begin, { chrom: end.chrom, pos: end.pos - 1 }]);
}
```

Translate the upper endpoint back when formatting the current locus domain:

```js
const [begin, end] = scale.getComplexDomain();
const label = formatCoordinates([
  begin,
  { chrom: end.chrom, pos: end.pos + 1 },
]);
```

Formatting needs no assembly. It rounds fractional structured endpoints outward
to cover integer bases; it does not validate chromosome order or contig bounds.
Numeric whole-genome offsets must first be converted through the locus scale.
An upper endpoint at position zero on another contig must be canonicalized with
assembly context before formatting. Assembly snapshots remain usable independently
of the embed; obtain a new snapshot when the scale's assembly changes.

See the [coordinate navigation example](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples/src/coordinates).
