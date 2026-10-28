# Searching loaded records

The optional `@genome-spy/core/search` entry matches terms against fields declared
through `encoding.search`. It returns bounded, detached matches and their
record-derived navigation targets. Lookup does not navigate, select, brush, fetch,
or parse coordinate input. Coordinate-looking terms are ordinary strings.

```js
import { createDatumSearch } from "@genome-spy/core/search";

const search = createDatumSearch(api.views);
const result = search.findDatums("TP53", { limit: 20 });
for (const match of result.matches) {
  console.log(match.view.selector, match.datum, match.targets);
}
```

Matching uses English search collation with base sensitivity, so case and accents
are ignored. Exact matching is the default; `mode: "prefix"` matches the start of
a stringified non-null field value. A row matching several search fields appears
once, with those fields listed in `match.fields`.

`view` scopes lookup to a live unit or container handle. `field` restricts matching
to that declared field; other views are excluded. An unknown field, a foreign or
removed handle, or an explicitly scoped unit without search fields throws.
Container scopes without searchable descendants return no matches.

`limit` is a required nonnegative safe integer and bounds rows returned, not rows
examined. `truncated` means at least one additional match exists. Zero performs
an existence check. Results follow hierarchy and collector order, without stable
row identity across updates. Distinct transcripts, views, and loci remain distinct
matches. `facetId` preserves a record's facet membership when present.

## Targets and caller navigation

A match can have x and y targets on independent scales, or no supported target.
Each target contains a public scale capability, channel, interval, `zoomable`,
and `kind: "locus" | "numeric"`. Conditional positions, missing numeric endpoint
pairs, and invalid coordinates produce `targetIssues` rather than guessed targets.
Locus points without an explicit secondary position represent one base. Reversed
encoded endpoints are normalized; locus intervals are checked against the resolved
assembly. Numeric intervals require explicit endpoints.

The caller chooses a match and target. Locus target intervals are continuous
whole-genome **half-open** values, while existing locus `zoomTo()` takes an
inclusive upper endpoint:

```js
const target = selectedMatch.targets.find((candidate) => candidate.zoomable);
if (target) {
  const [begin, end] = target.interval;
  await target.scale.zoomTo([begin, target.kind === "locus" ? end - 1 : end]);
}
```

Padding, animation, candidate ranking, and selection belong to the caller.
`target: "zoomable"` filters out matches without a zoomable target **before**
applying the row limit, so a non-navigable first match cannot hide a later one.

## Loaded coverage, revisions, and suggestions

Every result includes `sources`: participating view handles, collector
`dataRevision`, readiness, scan status, and `rowsExamined`. Pending views are
reported and skipped. An early result bound leaves later sources `unscanned`;
field restrictions mark other sources `excluded`. These statuses describe
**currently loaded transformed records**, not complete lazy-source coverage.
Execution is synchronous, and the row limit does not bound elapsed time.

Rows use the same structured-clone contract as [data readback](views.md#reading-transformed-records),
without picking identifiers. Lookup never clones all scanned input rows.

```js
const sources = search.listSearchableViews({ exampleLimit: 3 });
for (const source of sources) {
  console.log(source.view, source.fields, source.source.dataRevision);
}
```

Metadata refreshes against the current publication. Set `exampleLimit: 0` to
inspect handles, declared fields, readiness, and revisions without scanning rows.
Examples are bounded suggestions, not a vocabulary index.

A typeahead can read complete bounded snapshots with
`view.data.read({scope: "all", limit})`, extract symbols, and build its own sorted
array or other index. Handle truncation and loaded-only coverage explicitly, and
refresh when source revisions change. Sorting, normalization, prefix rules,
deduplication, and ranking are consumer choices. On selection, call `findDatums()`
in the original source/field scope to obtain current records and targets. No
built-in index or typeahead UI is provided.

Search is independent of [coordinate parsing](coordinates.md). A combined input
field decides which operation to invoke and whether to navigate. Cytoband parent
resolution and provenance replay are separate features.

See the [datum-search example](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples/src/datumSearch).
