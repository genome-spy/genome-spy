# Sample identity from metadata sources — alternatives

## Status and architecture

Implemented and verified after the user selected alternative 1 with the
sole-source `"metadata"` shorthand from alternative 3. The user explicitly
confirmed `displayNameField: "rowLabel"` on the metadata-source identity form.
The goal is to remove a separate sample-list artifact when an existing metadata
source already defines the complete sample set.

App owns identity and metadata state. Core owns dataflow readiness and the
optional signal source. Existing metadata adapters expose `listSampleIds()`:
table sources preserve row order, Figwig preserves header track order, and Zarr
returns row identifiers without reading matrix values. `MetadataSourceRuntime`
already caches resolved source definitions, adapter promises and underlying
rows. Reuse those resources; no Figwig-specific identity path or new reader API
is needed.

Current identity setup lives in `sampleView.js`'s constructor and
`#loadSampleIdentity()`. It creates a dataflow source and a `ProcessSampleIdentity`
node, publishes `setSamples`, and resets the provenance baseline. Metadata
bootstrap runs after Core launch and currently waits for nonempty sample ids.
Removing the existing TSV without another identity path cannot resolve that
dependency. The signal source starts with `visibleSamples: []`; its empty output
can trigger signal-derived sample extraction. The sample reducer allows only
one initialization, so metadata identity must own readiness and suppress that
fallback while loading.

Related files:

- `packages/app/src/spec/sampleView.d.ts`
- `packages/app/src/sampleView/sampleView.js`
- `packages/app/src/app.js`
- `packages/app/src/sampleView/metadata/metadataSourceRuntimeState.js`
- `packages/app/src/sampleView/metadata/metadataSourceBootstrap.js`
- `packages/app/src/sampleView/metadata/adapters/`

The existing Zarr row-ID adapter supplies a neighboring matrix case: identity
enumeration must not require expression columns. The existing explicit data
identity and signal-channel inference remain supported. No external code is
copied or adapted.

## Alternative 1: reference a metadata source from identity

Recommended: keep the choice of sample universe in `samples.identity` and
reference the source that already contains it.

```json
{
  "samples": {
    "identity": {
      "metadataSource": "fetal-tissues",
      "displayNameField": "rowLabel"
    }
  },
  "metadata": {
    "sources": [{ "import": { "url": "metadata-figwig.json" } }]
  }
}
```

The imported definition already has `id: "fetal-tissues"` and a Figwig backend.
There is no additional sample list or repeated file URL. Existing
`identity.data` remains a separate union variant, mutually exclusive with
`metadataSource`. A metadata identity does not accept `idField`: canonical ids
come from the backend's existing ID contract.

This is explicit with multiple metadata sources and lets different views use
the same source without changing which samples they display. It adds one source
reference, while making membership and labels an identity concern.

## Alternative 2: a metadata source declares that it defines identity

```json
{
  "samples": {},
  "metadata": {
    "sources": [
      {
        "id": "fetal-tissues",
        "sampleIdentity": { "displayNameField": "rowLabel" },
        "backend": { "backend": "figwig", "url": "h3k27ac.fw" }
      }
    ]
  }
}
```

Presence of `sampleIdentity` marks one source as authoritative. Startup resolves
that source and follows the same identity-loading path as alternative 1. The
declaration can live in the imported metadata definition, making it self-contained.
At most one source may declare this role; combining it with explicit
`samples.identity` should be rejected as conflicting configuration.

This is convenient for a reusable whole-panel definition. It also gives a
metadata import authority over the sample universe, which can be surprising
when the same source is reused only to annotate another cohort.

## Alternative 3: infer the sole metadata source

```json
{
  "samples": { "identity": "metadata" },
  "metadata": {
    "sources": [{ "import": { "url": "metadata-figwig.json" } }]
  }
}
```

The shorthand selects the sole configured metadata source and uses its
canonical ids as default labels. Resolve it to the same normalized identity
contract as alternative 1. Require an explicit source reference when there are
multiple sources; never choose the first source or silently union sample sets.
Use alternative 1 when a display-name field or a specific source is required.

A fully implicit variant could apply this rule whenever identity is omitted.
That is less verbose, but changes existing signal-channel inference and can
change the sample set merely by adding metadata. Prefer the opt-in shorthand
if this convenience is added at all.

## Shared wiring and contracts

1. Resolve identity mode while constructing the SampleView. For a metadata
   identity, use the view's existing `MetadataSourceRuntime.getSource(id)` and
   `getAdapter(source)` so later metadata imports reuse the same objects/cache.
2. Register an App-owned metadata-identity data source alongside the current
   explicit identity data source. It resolves the adapter asynchronously and
   feeds the existing identity publication path. This keeps loading errors,
   cancellation, dataflow readiness and provenance initialization in their
   existing ownership boundaries. Identity failures must fail initialization;
   ordinary optional metadata failures can retain their current warning policy.
3. Extend adapters with an identity-facing method such as
   `listSamples({ displayNameField }, signal)`, returning ordered
   `{ id, displayName }` records. Reuse `listSampleIds()` where no label field is
   requested. Table/Figwig implementations extract labels from cached raw rows,
   independently of metadata-column exclusions. A backend unable to supply a
   configured label field must report that limitation; Zarr ids alone already
   support default labels without matrix reads.
4. Validate unique, nonempty canonical ids and assign sequential indices in
   adapter order. Reuse/extract the existing string conversion and display-name
   fallback from `ProcessSampleIdentity`. A resolved empty set must be distinct
   from loading; it should yield an empty view rather than a ten-second wait.
5. Publish identity once, update `visibleSamples`, and allow dependent signal
   queries to proceed. Disable signal-derived identity extraction whenever a
   configured identity source owns initialization. Membership must not depend
   on viewport, selected tracks, metadata exclusions or later column imports.
6. Import configured metadata columns against that fixed set using the same
   cached adapter. `initialLoad` controls columns only: selecting a source for
   identity necessarily reads its IDs even when `initialLoad: false`.

`rowLabel` may remain excluded from displayed metadata while supplying sample
labels. For Figwig, identity and labels require only the header; signal loading
still owns its separate reader. The existing lazy adapter import and Core
minimal bundle boundaries remain intact.

## Suggested implementation boundary and verification

Implement alternative 1 and the opt-in `"metadata"` shorthand. A coherent change
includes the identity schema union, the App-owned dataflow bridge, adapter identity/label extraction,
normalization and readiness guards, and removal of the mouse TSV identity
reference. Update sample-identity and metadata documentation and add an App
changeset for this generic identity feature. Tentative message:
`feat(app): derive sample identity from metadata sources`.

Verify imported relative URLs, duplicate or missing source ids, labels excluded
from metadata columns, native string IDs such as `001`, numeric attributes,
deterministic order, empty/failed/aborted identity loads and the existing data
identity path. Include a Zarr IDs-only case to protect the generic contract.
The mouse App must load without requesting `samples.tsv`, retain all 24 samples,
and pass grouping, filtering, bookmarks, plots and panning. Verify the metadata
header is reused for identity and columns, and bundle guards still pass.

Do not implement implicit unions, intersection policies, live changes to the
sample universe, or a new Core tabular format for this task. Alternative 2
remains unselected. Alternative 3's explicit shorthand is selected; automatic
metadata identity merely because identity was omitted is not selected.

## Implementation and verification outcome

The single implementation milestone is complete. `MetadataIdentitySource`
registers with native dataflow initialization and publishes through the existing
identity processor and provenance path. Table/Figwig adapters return IDs and
optional labels from cached raw rows. Zarr reads only row IDs and rejects an
unsupported label-field request. Existing explicit data identity and omitted
identity retain their previous behavior. No Core or figwig-js changes were
needed.

An independent plan review preceded implementation. The final implementation
review checked shared adapter contracts, startup ordering, source/row caching,
empty collections and disposal. Its one finding added an abort check before
creating an adapter after an asynchronous source-definition read; the focused
identity suite passed again. There are no open implementation tasks.

Verification:

- The composed identity tests exercise real SampleView/dataflow initialization,
  imported relative URLs, cached rows shared with metadata bootstrap, excluded
  labels, source ordering, invalid IDs, empty sets, errors and disposal. Zarr
  tests verify that identity does not read matrix values.
- All 558 test files passed: 5,316 tests passed, one skipped and two todo.
  Workspace types (with the App rerun after its fixture cast correction), lint,
  Core/App production builds, minimal/optional bundle checks and docs passed.
- All seven experimental mouse specs validate against the new App schema.
  Chromium loaded all 24 IDs/labels and 936 values across 39 metadata attributes
  with every sample-TSV request blocked; zero such requests occurred.
- All 17 whole-genome/bookmark benchmark stages passed, plus actual bookmark
  buttons, grouping/sorting, expanded scatterplot and mouse-panning checks.
  Whole-genome queries used required summaries with zero raw bytes/chunks;
  warm overview, six-track filtering and panning needed zero signal requests.
- Release checks pass. This backward-compatible App feature requests a minor
  bump; the current fixed release group resolves from 1.2.0 to 1.3.0.

The mouse recipe workflow was committed as `f88b5ac` in the nested recipes
repository; generated artifacts remain local. Alternative 2, automatic metadata identity on omission, set-union
policies and live membership changes are explicitly discarded for this scope.

The subsequent KISS review retained the streaming identity processor to avoid
retaining complete raw table rows. Its applied cleanups reuse reducer-owned
duplicate-ID validation, map ID-only adapter queries directly from cached rows,
and remove duplicate schema setup and overlapping adapter tests. The 52 affected
tests, App source/test types and focused lint pass after these changes. The
existing feature changeset remains accurate; this cleanup adds no release note.
