# Separate coordinate and datum-search utilities for Core embedders

Status: implemented and verified on 2026-10-28; milestones committed separately.
Retained on the feature branch for review; remove before merge.
Issue: [#612](https://github.com/genome-spy/genome-spy/issues/612).
Baseline: `origin/master` at `91ce56e30` (2026-10-28).

## Outcome and scope

A Core embedder can build a location/gene field using supported optional imports,
the assembly already resolved for a particular locus scale, and non-mutating
lookup of loaded records declared with `encoding.search`. The caller chooses
whether and where to navigate. Ordinary and minimal embeds include none of the
optional parsing, matching, or indexing implementation.

These are independent utilities, not two modes of one resolver. Coordinate
utilities own user-supplied coordinate syntax, validation, and formatting. Datum
search owns matching terms against `encoding.search` records. Search never
parses or classifies user-supplied coordinates, invokes coordinate utilities,
or provides a coordinate-to-datum fallback. A combined field composes them in
the embedding application or App UI. Each utility can ship independently.

Goals:

- Validate and format chromosome, position, same-chromosome range, and
  cross-chromosome range queries with documented coordinate conventions.
- Parse explicit coordinate syntax without an assembly, and optionally validate
  against custom contigs or a chosen scale's already-resolved assembly.
- Return bounded, detached datum matches with all applicable locus targets.
- Consolidate App toolbar and App Agent matching while preserving caller policy.
- Prove package exports, DOM-free coordinates, and bundle isolation.

Non-goals: shared input UI, autocomplete/ranking, remote gene lookup, loading
unloaded genomic data, persistent indices, arbitrary predicates or expressions,
cytoband parent synthesis, brushing, new provenance actions, or expanding App's
toolbar availability to specifications without a zoomable locus scale. Preserve
App's existing numeric-track navigation with explicitly typed numeric targets;
do not extend target projection to categorical scales or arbitrary geometry.

## Architecture check and current evidence

Read `ARCHITECTURE.md`, `packages/core/ARCHITECTURE.md`, Core's
`docs/architecture/views-and-dataflow.md`, package instructions, and
`packages/app/APP_ARCHITECTURE.md`.

- **Assembly and coordinate owner:** `src/genome/genomeStore.js` resolves named,
  inline, built-in, and URL assemblies. `src/scales/scaleInstanceManager.js`
  attaches the resolved `Genome` to each locus scale. Use that scale's genome;
  never choose a global default or infer assembly from a matching row.
- **Navigation owner:** `src/scales/scaleResolution.js` and
  `scaleInteractionController.js` own domains and zoom. Search returns intervals
  and supported `ScaleResolutionApi` capabilities; navigation continues through
  `zoomTo`, with caller-supplied padding and animation.
- **Data owner:** `src/view/unitView.js` owns compiled search accessors;
  `src/data/collector.js` owns loaded transformed rows, facet batches, and
  `dataRevision`. Reuse those accessors and data-readiness checks; do not
  reinterpret raw field names or scan source records before transforms.
- **Public runtime boundary:** `src/embedApi.js` builds `EmbedResult`;
  `src/view/viewMutationApi.js` builds live `ViewApi`/`ViewHandle` capabilities.
  A private policy-free runtime bridge is needed only for datum search.
  Coordinates are stateless parsing/formatting functions over structured values;
  a small native scale getter supplies optional assembly context. Scale discovery
  remains with existing scale APIs/caller policy. The independent search utility
  owns searchable-view discovery, matching, and record-derived targets.
- **Existing query behavior:** `ViewHandle.data.read()` and `.transform()` in
  `viewMutationApi.js` provide readiness/lifecycle checks, detached results,
  bounded output, and no implicit fetching. Reuse these contracts and narrowly
  extract a row-copy helper if useful. Do not implement search by reading and
  cloning every row, or by invoking the isolated transform runner.
- **Important issue reconciliation:** [#538](https://github.com/genome-spy/genome-spy/issues/538)
  was closed through [#578](https://github.com/genome-spy/genome-spy/pull/578).
  The merged implementation is scoped readback and isolated transforms, not the
  originally proposed optional introspection/search module. There is no existing
  optional search entry to import. This change adds the narrow bounded lookup
  operation; it does not resurrect #538's full statistics/query proposal.
- **Consumers:** `packages/app/src/components/toolbar/searchField.js` currently
  picks the first zoomable locus scale and the first matching x/x2 datum, pads
  by 1.2, and handles sample metadata commands. Its help also scans collectors.
  `packages/app-agent/src/agent/searchViewDatumsTool.js` duplicates matching,
  supports exact/prefix modes, and returns up to ten live datum objects.
  `contextBuilder.js` separately samples searchable fields for agent context.
- **Bundle owner:** `packages/core/package.json`, `scripts/prepack.mjs`, and
  `scripts/verifyMinimalBundle.mjs` govern explicit exports and graph checks.
  No reverse imports from ordinary/minimal entries into either optional utility.

Paths above beginning with `src/` are relative to `packages/core/`.

Shared assembly conversion and existing rendering formatting remain in `Genome`,
`scaleLocus.js`, and `locusFormat.js`; optional coordinate operations reuse the
relevant helpers. The existing locus complex-domain path gains correct covering
integer rounding for viewport labels. Move `Genome.parseInterval()` out of the
always-loaded class: its only production caller in this tree is the toolbar.
Replace its parser tests with tests of the optional coordinate contract when
migrating App's coordinate caller in the same coordinate deliverable. This removes the
legacy parser rather than adding a second parser beside it. The undocumented
deep-import method changes; record that in release notes. Existing supported
scale/domain APIs and specification coordinate conventions remain unchanged.

Relevant size baseline (`wc -l`): `genome.js` 450, `locusFormat.js` 37,
toolbar `searchField.js` 443, agent `searchViewDatumsTool.js` 209. Measure these
and new optional modules after extraction; growth must pay for validation and
the supported boundary, not duplicate matching or generic frameworks.

## Comparable designs and provenance

[igv.js's Browser API](https://igv.org/doc/igvjs/Browser-API/) accepts coordinate
and gene queries but its `search()` also navigates.
[Its search configuration](https://igv.org/doc/igvjs/Browser-Creation/#search-object-details)
declares coordinate conventions and returns chromosome/start/end records.
Reuse the familiar locus syntax and explicit coordinate convention, while
keeping resolution separate from navigation to satisfy GenomeSpy's multiple
scales, caller policy, and future provenance requirements. GenomeSpy's
cross-chromosome continuous intervals remain a deliberate extension.
The combined coordinate/gene behavior of igv.js is not the proposed utility
boundary: GenomeSpy's caller alone composes the independent utilities.

This is a design comparison only: no external code will be copied or closely
adapted. If that changes, verify the source license and add durable provenance
and required notices before using the code.

## Proposed API and module boundary

Provide two independent optional entries:

- `@genome-spy/core/coordinates`: `parseCoordinates(text, assembly?)` and
  `formatCoordinates(interval)`. No DOM, View, collector, renderer registration,
  datum-search dependency, runtime service, or context factory.
- `@genome-spy/core/search`: datum lookup and searchable-view metadata. It neither
  imports nor re-exports the coordinate utility, and treats coordinate-looking
  search terms literally.

Coordinate input parsing is not a scale-discovery operation. Embedders address a
scale through existing `getScaleResolutionByName()`. App retains its existing
internal primary-locus-scale discovery and UI availability policy. There is no
`/coordinates/runtime` entry, `createCoordinateTools`, `forScale`, coordinate
ViewApi registry, or coordinate-driven App initialization change.

```ts
import {
  parseCoordinates,
  formatCoordinates,
} from "@genome-spy/core/coordinates";

// Syntax-only parsing works without an embed or assembly.
const parsed = parseCoordinates("chr1:10-20");
// { kind: "coordinate", interval: [
//     { chrom: "chr1", pos: 9 }, { chrom: "chr1", pos: 20 }
// ] }
if (parsed.kind === "coordinate") {
  formatCoordinates(parsed.interval); // "chr1:10-20"
}

// Embedders opt into validation against the chosen scale's resolved assembly.
const scale = api.getScaleResolutionByName("genome");
const result = parseCoordinates(input, scale.getAssembly());
if (result.kind === "coordinate") {
  const [begin, end] = result.interval;
  // Existing zoomTo uses a zero-based inclusive upper endpoint.
  await scale.zoomTo([begin, { chrom: end.chrom, pos: end.pos - 1 }]);
}
const [begin, end] = scale.getComplexDomain(); // narrowed locus scale
const label = formatCoordinates([
  begin,
  { chrom: end.chrom, pos: end.pos + 1 },
]);

// Standalone callers can provide the same plain assembly shape.
parseCoordinates("scaffold_12:10-20", { contigs });
```

All calls above are proposed; narrow/check the selected scale in actual examples.
Return values are chromosome-relative, not whole-genome numeric offsets. Their
half-open upper endpoint differs from existing scale APIs' inclusive upper
endpoint. The example deliberately adapts that convention at the caller boundary;
passing the parsed interval directly to `zoomTo()` would include one extra base.

### Minimal assembly access

Add `ScaleResolutionApi.getAssembly()` as a small synchronous, renderer-neutral
getter on an initialized locus scale. Its result is a detached read-only snapshot
of ordered contigs, using `{ contigs: readonly { name: string; size: number }[] }`.
It reads the assembly already resolved by `ScaleInstanceManager`; there is no
second genome configuration, assembly loader, or exposed mutable `Genome`.
Non-locus scales and unavailable assemblies fail clearly. The getter adds no
optional parser or formatter imports to default/minimal entries.

Read the getter when validation is needed so an old snapshot is not mistaken for
an automatically updating scale binding. Retained snapshots remain usable as
standalone data after a scale/view is removed or an embed is finalized. Parsing
and formatting own no subscriptions, disposal, navigation, or live capabilities.
Validate explicit dictionaries for unique nonempty names, positive safe-integer
sizes, and a safe-integer cumulative length. Reuse shared contig-name resolution;
do not introduce a second assembly class or copy conversion/indexing machinery.

### Search runtime boundary only

Datum search still needs supported access to loaded data behind opaque handles.
For that utility alone, use the private policy-free WeakMap registry keyed by
`ViewApi`, registered by `createViewMutationApi`, supplying root access, existing
handle identities, and active/live validation. It contains no matcher, parser,
index, feature cache, renderer loader, or App imports. Type-only references must
not import optional implementation. This bridge is not a coordinate dependency.

Only the datum-search deliverable creates App's shared `ViewApi` after successful
`genomeSpy.launch()` and before `lifecycle.setInitialized()`, reusing it in
`createEmbedResult` to avoid duplicate handle identities. Verify both direct and
embedded App startup. App owns datum search outside `agentApi` exposure modules;
the toolbar shell keeps its existing lifecycle gate. Coordinate-only delivery
requires none of these ViewApi/App initialization changes.

## Coordinate contract

### Stable structured result

Parsing returns a discriminated union:

- `{ kind: "coordinate", interval: [begin, end] }`, with chromosome-relative
  `{ chrom, pos }` endpoints in zero-based, half-open coordinates. Both positions
  are explicit safe integers; the shape is identical with or without assembly.
- `{ kind: "not-coordinate" }`, for unrecognized input; callers may try a
  separate datum-search or metadata operation.
- `{ kind: "invalid-coordinate", code, message }`, for recognizable coordinate
  syntax with invalid syntax/positions, or failed assembly validation. The
  caller decides how to present it; Core does not trigger a search fallback.

Example: `chr1:10` returns `[{chrom: "chr1", pos: 9}, {chrom: "chr1", pos: 10}]`;
`chr1:10-20` returns positions `[9, 20)`. Returned endpoints never change to
continuous whole-genome offsets when an assembly is supplied. Existing scale
conversion owns numeric navigation after the caller translates the half-open
upper endpoint to the native inclusive domain convention.

### Parsing without an assembly

Trim surrounding whitespace. Recognize `contig:position`, `contig:start-end`, and
`contig:start-otherContig:end`, including custom contig names. Positions are
positive safe integers with optional correctly grouped thousands commas. Reject
zero, negative, fractional, overflow, malformed numbers, and reversed intervals
on the same contig. A repeated contig on both endpoints counts as same-contig
syntax. Without a dictionary, preserve contig spelling and do not claim to know
contig existence, bounds, aliases, or cross-contig order. No lexical/numeric
chromosome-order heuristics.

Arbitrary bare names are ambiguous without an assembly. Without assembly,
`chr1`, `scaffold_12`, and `TP53` all return `not-coordinate`; bare-contig shorthand
requires assembly-aware recognition. Explicit `unknown:10` can parse without an
assembly, while `chr1:0` remains invalid. `TP53` and cytoband terms such as `17q21`
are never inferred as positions or semantic regions.

### Additional validation with an assembly

Use the actual ordered dictionary. Resolve and canonicalize named contigs,
validate existence and endpoint bounds, and check cross-contig ordering. A known
bare contig resolves to `[{chrom, pos: 0}, {chrom, pos: size}]`; no optional endpoint
state is needed. Unknown bare conventional chromosome tokens such as `chr99` are
invalid coordinates when an assembly is supplied; unknown arbitrary bare names
remain `not-coordinate` for caller composition. Unknown explicit names such as
`unknown:10` are invalid. Syntax-only success never promises navigability in an
unspecified assembly.

Canonical names take precedence over compatible `chr` prefix variants; aliases
must be unambiguous. Do not accept ordinal chromosome-number aliases as custom
names. Try an exact whole-name match before interpreting delimiters; parse
endpoint candidates structurally and reject genuine delimiter ambiguity rather
than choosing arbitrarily. Include scaffold/accession/hyphenated names and
canonical/alias collisions in coverage. No new quoting language in v1.

Correct shared `Genome.setChromSizes()` resolution so later aliases cannot
replace canonical names in `chromosomesByName` or `cumulativeChromPositions`.
Canonical names are authoritative; omit ambiguous noncanonical named aliases.
Keep historical ordinal aliases only for existing conversion callers. Use the
same named resolution for optional validation and real locus encodings so query
navigation and rendered records cannot disagree. This compatibility fix belongs
with coordinate delivery, independently of datum search.

### Assembly-free formatting and existing domain conversion

`formatCoordinates(interval)` accepts structured chromosome-relative endpoints
and emits one-based inclusive display syntax. It does not accept whole-genome
numeric intervals, infer an assembly, or validate contig existence/order/bounds.
Require finite nonnegative positions, a strictly positive upper position, and
nonempty same-contig ordering. A cross-contig upper endpoint at position zero
requires assembly-aware canonicalization before formatting; without an assembly,
the formatter cannot replace it with the preceding contig's unknown length.
Retain the outward covering
integer display convention for fractional structured endpoints: floor the lower
position and ceil the upper position. Integer parse/format round trips preserve
meaning; formatting is not exact float serialization. Cross-contig endpoint
order is caller-provided when no assembly is available.

For current viewport labels, the native locus `getComplexDomain()` returns
zero-based inclusive endpoints, as explicitly tested in
`scaleResolution.domain.test.js`. Caller code adds one to the upper position
before `formatCoordinates()`, just as it subtracts one from a parsed upper
position before `zoomTo()`. Parse results always have a positive explicit upper
position, so this navigation adaptation also works for chromosome starts,
whole-contig results, and cross-contig queries without knowing a previous contig's
length. Do not change the existing specification or scale API endpoint convention.

Correct narrow fractional/chromosome-boundary behavior within the existing locus
`getComplexDomain()` conversion path. Its present use of the half-open
`Genome.toChromosomalInterval()` after shrinking the upper bound is inappropriate
for inclusive endpoints and can produce a reversed label or fail for a one-base
interval. Take the locus numeric half-open domain's covering inclusive integer
endpoints `[floor(start), ceil(end) - 1]` and convert those two positions
independently through the existing point conversion. For `[0.75, 1.25)`, the native
result is positions `[0, 1]`; caller adaptation gives formatter positions `[0, 2)`
and the label `chr1:1-2`. Assert exact one-base results and both sides of a contig
boundary. Preserve existing integer inclusive output, whole-genome extent, and
index/non-locus semantics. Review existing consumers/tests for this rounding fix;
no new optional formatter import, public numeric converter, or general domain
migration is required.

## Datum lookup contract

`findDatums(query, { limit, view?, field?, mode? })` searches ready, currently
loaded transformed unit-view records whose `encoding.search` is declared.
Its query is always a datum-matching term: `findDatums("chr1:0", ...)` searches
that literal string in declared fields, just as it searches `TP53`. It neither
validates the string as a genomic coordinate nor navigates to its apparent
location. Coordinate errors and coordinate/non-coordinate classification are
absent from this API and its result types.
`view` is an optional live `ViewHandle` subtree; `field` must be a declared
search field; `mode` defaults to exact and also supports the agent's prefix
mode. Reject empty queries and invalid limits. Match stringified non-null
values using existing English search collation with base sensitivity. One row
matching several declared fields is one match, with matched-field metadata.

Container handles are valid subtree scopes. With `field`, inspect only descendant
unit views declaring that field and report other views as excluded; reject the
request if no searchable view in the scope declares it. A unit scope without
`encoding.search`, a foreign/dead handle, or an invalid field is an error. A
container with no searchable descendants returns an empty result without
`field`; pending declared views count for field validation even before loading.

Return `{ matches, truncated, sources }`. Each match contains its source
`ViewHandle`, a detached datum without picking IDs, matched fields, and a
`targets` array. Each target contains its `ScaleResolutionApi`, channel, and
continuous interval, with `kind: "locus" | "numeric"` distinguishing genomic
from continuous numeric coordinates. Handle targets in both x/x2 and y/y2, including two
independent locus scales in the same view. Never pick a first scale or union
distinct records into one implied location. Do not coalesce separate transcript
rows or identical records from different views; callers can present or group
them. Preserve facet identity where the collector supplies it.

Target extraction uses the real numeric encoding accessors (including existing
chromosomal-to-continuous transforms), not guessed chromosome/start/end field
names. Support unconditional positional accessors on locus and continuous numeric scales;
for locus targets, a missing secondary position means a one-base interval.
Numeric targets require an explicit start/end pair; do not invent a unit-wide
interval for a numeric point. Normalize reversed
encoded endpoints for datum targets (strand-oriented records can be reversed),
but validate finite in-assembly results. Conditional, datum-independent, or
otherwise unsupported projections return an explicit no-target reason instead
of fabricated coordinates. A datum can match without a navigation target.
These targets come from matched records and existing scale machinery; deriving
them does not use the optional user-input coordinate parser or formatter.

Numeric target intervals preserve App's existing x/x2 navigation and receive the
same explicit numeric discriminator. Validate finite numeric endpoints without
applying assembly bounds. Keep logarithmic padding decisions in App. Each target
also reports zoomability; absence of a target is different from a valid target
on a non-zoomable scale.

Scan without copying inputs or building an index. Copy only returned matches
using readback's structured-clone semantics; its documented nested/shared-memory
limits apply. The global `limit` counts datum matches, not targets. Stop at the
first additional match to set `truncated`; this distinguishes exactly-limit
from overflow and makes limit zero a useful existence check. Ordering is
hierarchy traversal followed by collector order, stable for one publication,
with no cross-update identity guarantee.

`sources` reports the participating view, captured collector `dataRevision`,
readiness, rows examined, and whether its scan completed. Pending/uninitialized
views are reported and skipped, with no fetching or initialization; a scoped
invalid handle or explicitly scoped non-searchable unit is a request error.
Successfully loaded lazy rows
are searchable even when they are not complete source coverage. State explicitly
that results cover loaded records only, never all genomic features. If an early
global limit stops traversal, report remaining sources as unscanned, not empty.
Use existing readiness/coverage facts; do not invent full-source coverage or add
a new source scheduler. Execution is synchronous in v1, with no cancellation
promise or elapsed-time bound. Large scans remain a documented limitation.

Offer `listSearchableViews({ exampleLimit })` with bounded examples per field,
labels, and source status for toolbar help and agent context. Reuse existing
sampling where appropriate and refresh against current publications; avoid
`contextBuilder`'s permanent view-only example cache. This metadata operation
does not expose collectors or materialize all rows.

### Future consumer-owned typeahead (implementation out of scope)

The scan-based `findDatums()` operation must not be the only way for a consumer
to obtain searchable values. `listSearchableViews()` supplies public view handles,
declared fields, source identity, readiness, and publication revisions without
requiring a matching query. A consumer can use existing
`view.data.read({ scope: "all", limit })` to extract symbols and build a sorted
array, trie, or another index. Truncated reads and loaded-only coverage must be
handled explicitly; bounded examples cannot be mistaken for a complete index.

The consumer owns normalization, sorting/prefix compatibility, deduplication,
ranking, suggestion limits, and refreshing its index when source revisions
change. On selection, it can resolve a symbol in its original source/field scope
with `findDatums()` to obtain current matching records and targets. It need not
scan through Core on every keystroke or retain stale targets in its index.

No index, typeahead UI, pluggable search-strategy framework, change subscription,
or searchable-value snapshot API is implemented here. A compact projected-value
snapshot or publication subscription can be added later without changing the
coordinate utility or coupling suggestions to Core's initial scan algorithm.

## Consumer behavior and compatibility

App toolbar composes the two utilities in UI code. Its existing internal helper
chooses the primary zoomable locus scale in traversal order, preserving current
availability and selection policy. It passes that scale's current `getAssembly()`
result to parsing and uses `getComplexDomain()` for formatting. It invokes coordinate
parsing first; a coordinate result is handled by caller navigation, an invalid
coordinate is shown as a caller error, and only a not-coordinate result leads
the caller to invoke independent datum lookup. No combined resolver or automatic
fallback is exported by Core. App retains first-navigable-match
selection, 1.2 padding, animation, focus/keyboard behavior, help presentation,
and sample-metadata fallback. Search for the first _navigable_ match must not be
implemented with limit one followed by filtering: a non-navigable row must not
hide a later valid match. Provide a narrow public `target: "zoomable"` option
that filters to matches with at least one zoomable target before applying the
result limit; it introduces no arbitrary predicate API. The toolbar requests
this with limit one. Invalid
coordinates report a useful error and leave the domain unchanged. Gene lookup
remains available through the public lookup API even when no genomic scale is
present; App retains its zoomable-locus visibility gate and
`findGenomeScaleResolution` helper. Coordinate delivery does not replace that
helper with public coordinate-scale discovery or rewire toolbar startup.

App Agent's existing search tool calls only datum search via App's exposure
adapter, preserving selector, field, exact/prefix modes, and its ten-result
policy. Return detached records; add truncation/status metadata without changing
intent or provenance semantics. Reuse shared searchable metadata in agent context
where this deletes collector scans and stale example caching. Read applicable
App Agent instructions before implementation.

[#125](https://github.com/genome-spy/genome-spy/issues/125) remains open:
plain prefix mode is not semantic cytoband resolution. Do not publish a generic
serialized search-spec, opaque result ID, or region-synthesis framework here.
Future semantic results can consume the same targets and explicit source
selectors; provenance must eventually store and re-resolve deterministic query
specifications, not persist these transient handles.

## Independent deliverables

Coordinate utilities and datum search are separate PR-sized deliverables, each
including its consumer migration, documentation, example, release note, and
bundle checks. Neither requires implementing or importing the other. Only datum
search needs the ViewApi runtime bridge and associated App initialization work.

### A. Coordinate utilities and coordinate-only App migration

Outcome: standalone users parse explicit syntax without an assembly, optionally
validate with an explicit dictionary, and format structured endpoints. Embedders
and App validate with their chosen scale's already-resolved assembly and adapt
only the endpoint convention before navigation through existing `zoomTo()`.

Affected areas: the single coordinate entry and types, shared Genome canonical
name/alias correction, `ScaleResolutionApi.getAssembly()`, the existing locus
complex-domain rounding path, toolbar coordinate parsing/formatting, package
exports, coordinate docs, and a coordinate-only embed example. Preserve existing
App scale discovery, UI initialization, and datum matching; leave App Agent alone.
No ViewApi registry, runtime-coordinate entry, context factory, or coordinate
service. Remove `Genome.parseInterval()` and migrate its tests in the same commit
as its App caller, keeping every commit functional. Review existing consumers of
`getComplexDomain()` for the rounding correction without changing renderer
registration or non-locus scale semantics.

Verification: focused DOM-free Node tests cover parsing with and without an
assembly, identical structured result shapes, optional existence/bounds/order
validation, same-contig ordering without assembly, cross-contig syntax whose
order can only be validated with assembly, bare-name recognition policy,
one-base and contig-end boundaries, custom names/aliases/collisions, malformed
numbers, integer round trips, and fractional structured formatting. Verify
canonical-name collisions through real locus encodings as well as parsing.
Headless tests cover `getAssembly()` for named, inline, built-in, and loaded URL
assemblies; independent x/y locus scales; caller-adapted parsed intervals navigating
exactly the intended one-base, ranged, whole-contig, and cross-contig domains;
detached assembly snapshot semantics; and narrow/cross-chromosome fractional
`getComplexDomain()` results under its existing inclusive convention. Preserve existing integer/index domain
contracts. Coordinate operations do not require live handles after snapshots
have been obtained. No datum search is needed in these tests.

Import the coordinate subpath in a DOM-free subprocess. Build declarations and
verify packed exports. Assert ordinary/minimal outputs exclude the optional and
removed legacy parser; coordinate-only builds exclude datum search, hierarchy
runtime implementation, App, and renderer registration. Smoke-test App coordinate
entry and viewport labels after manual pan/zoom under WebGL and Canvas2D.

Documentation and migration: syntax-only versus assembly-validated parsing,
chromosome-relative zero-based half-open results, bare-name ambiguity, explicit
assembly access, caller translation to/from inclusive scale endpoints, independent
entry points, coordinate-only navigation, and the
custom-contig/domain-rounding compatibility corrections. Add an appropriate Core
changeset and assess App's validation/formatting behavior.
Tentative commit: `feat(core): expose optional coordinate utilities`.

### B. Datum search and shared App/agent matching

Outcome: embedders obtain bounded, detached matching records and record-derived
targets; App toolbar and agent reuse matching while retaining caller policy.
The utility works with the existing shared scale machinery regardless of whether
deliverable A has shipped. It does not fix or depend on the coordinate parser.

Affected areas: independent search modules/types, the search-only runtime bridge
and shared ViewApi/App initialization, toolbar datum matching
and help, App exposure adapter, agent tool/context, package exports, search docs,
and a datum-only embed example. Do not change user-coordinate parsing as part of
this deliverable. Reuse selectors, handles, compiled accessors, readiness, and
bounded row-copy behavior.

Verification: real-spec/headless dataflow tests cover multiple matching
transcripts/loci, independent x/y targets, faceted loaded rows, transformed search
fields, exact/prefix modes, subtree/field filtering, exactly-limit/overflow/zero,
non-navigable matches, pending sources, data replacement, dynamic insertion/removal,
stale/foreign handles, and finalization. Assert detached results and unchanged
domains, selections, and live records. Include declared field values such as
`chr1:0` and `chr1:1-100`: search matches these literal terms, produces no
coordinate parse result/error, and does not navigate. Assert search-only builds
exclude the optional coordinate entry and its parsing implementation.
Ordinary/minimal builds exclude search. Test useful datum-only lookup without a
locus scale, as well as existing numeric interval targets. Consolidate duplicated
toolbar/agent matcher tests around the shared contract.

Documentation and migration: loaded-only semantics, bounded matches, record
targets, and a gene-navigation example with only the search import. Keep
Core/App capability work, including conservative `AgentApi` exposure, in a
separate commit from App Agent consumer changes as required by
`packages/app-agent/src/agent/AGENTS.md`. This plan is the cross-package
capability discussion; no host implementation goes into the agent adapter or
exposure module. Add a Core changeset and assess App/agent release impact.

Tentative commits:

- `feat(core): expose optional datum search for embedders and App`
- `refactor(app-agent): use shared host datum search`

### Caller composition and integration

After both utilities exist, a small example may combine them in a location/gene
field. Its UI code owns routing, coordinate errors, datum fallback, candidate
selection, and `zoomTo`. This example is not a prerequisite for either utility
to ship, and does not justify a combined Core resolver or umbrella search API.

Use `write-genomespy-docs`, `debug-genomespy-web`, and
`write-genomespy-changeset` during implementation; `test-genomespy-views` if
generated hierarchy assertions are required. Use `prepare-genomespy-change`
for final commit/PR preparation and plan retirement.

For each deliverable, inspect all emitted chunks, including dynamically reachable
chunks, and type-check imports from a packed/installed fixture. The tiny neutral
registry and existing rendering coordinate modules are allowed in ordinary
embeds. The single coordinate build excludes runtime discovery, collectors,
matching, App, and renderer registration; search excludes optional coordinate
parsing/formatting. The native assembly getter may be present in ordinary embeds
but must not introduce an optional-implementation dependency.
Do not ban dependencies already required by rendering merely because a utility
also uses them. Independently verify each deliverable's browser example and App
migration; add a combined App/example smoke test when both have landed.

## Final integration and acceptance

- [x] The single coordinate entry works in Node without an assembly or runtime.
- [x] Optional assembly validation and structured result/formatting conventions
      hold for custom contigs and a chosen scale's resolved assembly.
- [x] Coordinate delivery adds no service, hierarchy registry, context factory,
      runtime subpath, or App initialization changes.
- [x] Default and minimal embed production graphs exclude optional implementation.
- [x] Coordinate-only and search-only consumers work independently; neither
      utility imports or re-exports the other.
- [x] Datum search treats coordinate-looking field values as literal search
      terms and never parses, validates, or classifies user coordinates.
- [x] Separate examples navigate coordinates and multiple gene matches using only
      public APIs, with the currently resolved scale assembly.
- [x] Browser smoke-test the example and App with the RefSeq gene example and a
      small composed x/y, two-assembly fixture under WebGL and Canvas2D. Test
      coordinate error, chromosome boundary, duplicate symbol, domain display
      after manual pan/zoom, repeated queries after data replacement, and
      sample-metadata fallback. No search action implicitly selects or brushes.
- [x] Headless tests verify lookup independently of renderer registration; no
      mark/render/picking/SVG code path changes are needed. SVG geometry tests
      are unnecessary unless implementation changes those paths.
- [x] Focused Vitest suites pass with `--reporter=agent`, workspace TypeScript
      checks and lint pass, documentation/API declarations and example builds
      pass, and optional-bundle checks pass. Run the full unit suite before PR
      delivery because lifecycle/API changes span Core, App, and App Agent.
- [x] Review implementation at the runtime/lifecycle boundary and after final
      consumer integration, checking downstream App startup as well as embeds.
- [x] Reconcile completed/discarded plan items; retain the plan for draft review
      and retire it before merge according to the planning skill.

## Risks, alternatives, and remaining decisions

- A search-only registry is necessary because supported handles hide runtime
  objects. Extending `EmbedResult` with search methods or importing search from
  it would break the primary opt-in requirement. Exposing raw Views/Collectors
  or relying on debug hooks would break the supported boundary.
- Datum search's shared ViewApi construction must be verified in direct and
  embedded App startup. Coordinate delivery uses the existing scale APIs and
  retains current toolbar startup; it needs no shared ViewApi construction.
- Copying all `data.read()` rows would reuse a public API but violate the bounded
  search goal. A narrow internal scan of existing collectors is the coherent
  extension; a new query language or persistent index is disproportionate.
- Custom aliases and delimiter-containing contigs are a correctness risk. Keep
  canonical-name precedence and reject ambiguity; do not silently inherit
  ordinal alias collisions from Genome's historical lookup map.
- Source statuses describe the observed loaded publication. They cannot promise
  whole-genome results for a lazy source. No implicit fetch or readiness wait.
- The synchronous scan can block on very large collections. Document it and
  measure representative loaded gene data; introduce cooperative scheduling
  only with a supported requirement and a separately reviewed contract.
- Assembly-free parsing cannot establish contig existence, bounds, or cross-
  chromosome ordering. Keep structured return values and document the validation
  limit instead of guessing. Bare contig names require assembly recognition.
- Source status and target-issue vocabulary are defined in `src/types/search.d.ts`.
  Coordinate parsing/formatting require no additional service API.

## Plan review and current decisions

Earlier independent reviews covered separation of utilities, bounded search,
App/agent boundaries, fractional formatting, canonical aliases, and functional
commit boundaries. Their still-applicable findings are reflected above: remove
the old parser with its caller migration, cover alias collisions through real
encodings, define subtree/field behavior, preserve App's toolbar scope, require
numeric start/end pairs, and split host and agent adaptation commits.

The user's accepted KISS revision supersedes the coordinate service design:

- One optional coordinate entry; two operations; no context/tools factories,
  runtime subpath, view registry, discovery service, or App startup restructuring.
- Optional assembly argument for parsing and stable structured endpoints in
  every successful result; plain formatting needs no assembly.
- Small native scale assembly access, with existing complex domains and `zoomTo`
  handling conversion/navigation. Assembly snapshots have no runtime lifecycle.
- Coordinate parsing/classification stays separate from literal datum matching.

This revision also records the agreed extension path for consumer-owned typeahead
in its own subsection. Independent re-review found an existing inclusive-domain
contract that the earlier proposal had overlooked. The plan now documents caller
translation between half-open coordinate results and inclusive scale endpoints,
and corrects locus complex-domain rounding through point conversion while
preserving native endpoint semantics. A focused re-review confirmed no remaining
blockers in this simplified design or its independent search/typeahead boundary.
Implementation and runtime verification are complete; results are recorded below.

## Implementation progress

- [x] A. Coordinate utilities, App migration, docs/example, and verification.
      Focused suites: 125 tests; Core/App/example types, lint, declarations/Core build,
      example build, generated API docs, optional bundle checks, Node import, and
      packed export/declaration checks pass. Browser checks cover WebGL coordinate
      example and Canvas App one-base/cross-contig navigation and invalid input.
      Existing example favicon 404 is unrelated to rendering or data loading.
      Release policy passes; the fixed group is a minor release.
- [x] B1. Core datum search and App host migration, docs/example, and verification.
      Focused runtime/readback/API suites pass (94 tests, plus unsupported-projection
      coverage). Workspace types, lint, Core/declaration and example builds, packed
      exports/types, generated docs, release policy, and separate optional bundle
      checks pass. WebGL/Canvas examples and Canvas App checks confirm non-mutating
      lookup, candidate navigation, shared handle identity, coordinate composition,
      data-replacement revisions/help, and finalized-service rejection.
- [x] B2. App Agent consumer migration and verification.
      The tool preserves selector, wildcard/field, exact/prefix, and ten-result
      behavior through the host API, returning detached rows and serializable
      truncation/coverage metadata. Context examples refresh from current data.
      Duplicated matcher/context code shrank from 480 to 168 lines. Regeneration
      synchronized agent action/tool schemas with current Core scale definitions;
      generated-file checks pass.
- [x] Final caller composition and integration verification.
      Final full suite: 5,284 passed, one skipped, two todo in 558 files. All workspace
      TypeScript checks, lint, full workspace build, example builds, API-reference
      checks, generated-agent checks, optional bundle checks, and Zensical docs build
      pass. Packed coordinate/search imports and declarations were verified.
      Real RefSeq lookup/navigation, composed independent x/y assemblies, App/agent
      lookup and data replacement, coordinate routing, boundary padding, and sample
      metadata fallback pass browser checks under WebGL and/or Canvas as applicable.
      Changesets validates a minor fixed-group release to 1.3.0. No versions were
      changed and nothing was published.

The optional additional combined-field example is deferred: App provides the
caller-composition integration case, while the two standalone examples remain
independent. Typeahead indexing, cytoband semantics, and remote search remain
explicit non-goals. Plan retirement is future PR/merge work, not part of this
local implementation request.

### Final review corrections

The independent implementation review found two edge cases. App now clamps
padded locus navigation to the target assembly before inclusive-end conversion;
real App tests cover first/last-base records without invalid viewport labels.
Assembly-aware parsing now considers every dictionary-valid start-name prefix,
including `a:1-b:2-c:3` for contigs `a` and `b:2-c`, while still rejecting genuine
ambiguity. Focused regressions and Core/App type checks pass. The reviewer
confirmed both corrections without expanding the utility APIs.

### Follow-up: simplify the App consumer

Architecture check: App continues to own query routing, navigation padding,
keyboard/focus behavior, example presentation, and sample commands. Core's two
independent utilities and the native inclusive scale contract stay unchanged.
The shared ViewApi startup and agent exposure remain necessary for supported
handle ownership; no new public adapter or service will be introduced.

Remove the component's passthrough genomeSpy getter, reassigned default-value
callback, nested async search wrapper, and boolean-returning lookup wrapper.
Keep endpoint adaptation local and explicit. Render the supplied examples by
field instead of flattening/deduplicating them again. Reactive focus refreshes
help against current source revisions without scanning rows on ordinary renders.
Cover coordinate errors, boundary padding, and changed examples through the real
Core-to-App component path. Initial App runtime delta is +5 production SLOC;
`searchField.js` is 405 physical lines before this pass.

- [x] Implement and verify the App consumer simplification.
      The component shrank from 405 to 367 physical lines. All 652 App tests,
      App source/test TypeScript checks, focused lint, and the production App
      build pass. WebGL and Canvas browser checks cover Enter submission,
      boundary navigation, per-field help, and refreshed examples after data
      replacement without a domain change. Changeset validation passes; the
      existing feature still plans a minor fixed-group release. This follow-up
      removes 25 production JavaScript lines (72 added, 97 deleted). Against
      origin/master, App now removes 20 lines overall instead of adding five;
      the complete feature adds 244 runtime lines across Core, App, and App Agent.
      Counts exclude tests, declarations, comments, blanks, and examples.
