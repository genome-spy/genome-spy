# Scoped Named Data

Status: planned

Branch: `feat/scoped-named-data`

## Problem

GenomeSpy currently registers `datasets` only from the visualization root.
Imported specifications retain their root-level `datasets` property, but named
data references inside the imported subtree use the embed-wide provider and
therefore receive empty data when the importing root does not declare the same
name.

For example, importing
`indexed-fasta-six-frame-translation.json` into `genome-browser.json` loses the
`geneticCode` and `nucleotideComplements` lookup datasets.

Named sources also use the bare dataset name as their dataflow optimization
identity. Supporting shadowed names without changing that identity would merge
independent datasets incorrectly.

## Settled design

### Declaration and lookup

- Allow `datasets` on every view specification by moving it from `RootConfig`
  to `ViewSpecBase`.
- A `datasets` entry declares a dataset owned by that exact view.
- Resolve `data.name` and named lookup inputs lexically:
  1. Check the referencing view.
  2. Walk outward through `dataParent`.
  3. During the compatibility period, fall back to the existing embed-wide
     provider/global named-data binding.
- An empty array is a valid declaration and explicitly establishes local
  ownership.
- A child declaration shadows an ancestor declaration with the same name.
- Sibling declarations are independent.
- Each import or template instance receives independent bindings, even when
  the source specification is reused.
- Runtime lookup follows `dataParent`, not `layoutParent` or selector/import
  scopes. Selector scopes are only a durable JavaScript addressing mechanism.

### Runtime updates

Add write-only methods directly to `ViewHandle`:

```ts
interface ViewHandle {
    setNamedData: <T = unknown>(name: string, data: T[]) => void;
    resetNamedData: (name: string) => void;
}
```

The view handle identifies the dataset owner:

- `setNamedData()` operates only on a dataset declared in that exact view's
  `datasets` object.
- It does not search ancestors and does not create an implicit local binding.
- If an ancestor owns the requested dataset, throw an error that identifies
  that the caller must use the owner's handle.
- If no declaration exists, throw an error that recommends adding a
  `datasets` entry.
- `resetNamedData()` removes the runtime override and restores the rows from
  the declaration.
- Runtime updates never mutate the specification object.
- Do not add dataset handles, dataset selectors, subscriptions, or a read API.

Example:

```js
const translation = api.views.get({
    scope: ["translationA"],
    view: "translationA",
});

translation.setNamedData("geneticCode", customGeneticCode);
translation.resetNamedData("geneticCode");
```

### Initial and asynchronous data

Hosts can supply initial rows directly through the JavaScript specification:

```js
spec.datasets.results = initialRows;
const api = await embed("#container", spec);
```

Asynchronous data can use an explicit empty declaration followed by a dynamic
update:

```js
const api = await embed("#container", spec);
const owner = api.views.get({ scope: [], view: "resultsOwner" });
owner.setNamedData("results", await loadResults());
```

GenomeSpy's dynamic dataflow update support makes a synchronous provider
unnecessary for the recommended API.

## Runtime representation

Introduce a stable dataset binding for each declaring view and dataset name.
A binding contains:

- The dataset name.
- The owning view.
- The declared/default rows.
- An optional runtime override.
- Live/disposed state.

Each view owns a small dataset scope linked to its `dataParent` scope. Named
sources resolve and retain a binding when the dataflow is built.

The compatibility layer also retains an embed-wide binding per undeclared name
while legacy provider and update behavior remains supported.

## Dataflow sharing

Separate human-readable source identity from optimization identity:

- Keep the dataset name available for diagnostics.
- Add an opaque sharing key used by dataflow optimization.
- For a named source, the sharing key is its resolved dataset binding.
- References resolving to one binding share one canonical source.
- Shadowed bindings and repeated import instances never merge.
- Named lookup side inputs use the same resolution and sharing rules as primary
  data sources.

Dynamic insertion of another consumer may initially reload/repropagate an
existing shared source. This is correct and matches the current subtree
initialization model. Optimizing targeted propagation is separate work.

## Legacy compatibility and deprecation

Keep these APIs functional during the compatibility period:

- `EmbedOptions.namedDataProvider`
- `api.updateNamedData(name, data?)`
- Undeclared named-data references that resolve through the embed-wide fallback

Mark `namedDataProvider` and `updateNamedData()` deprecated in TypeScript,
JSDoc, and user-facing documentation. The recommended migration is:

1. Add a `datasets` declaration to the intended owner view.
2. Resolve that owner through `api.views`.
3. Use `setNamedData()` and `resetNamedData()`.

The deprecated global update should retain its existing behavior where
possible. If scoped bindings make a bare name ambiguous, it must throw an
actionable error rather than update multiple independent datasets silently.

## Required future-removal TODOs

Add a small number of concise TODO comments at the central compatibility
boundaries. Do not scatter deprecation comments throughout the dataflow.

The TODOs must describe the eventual removal work:

- Remove `namedDataProvider` and the provider chain from embed options,
  `GenomeSpy`, view context creation, and headless bootstrap helpers.
- Remove the embed-wide fallback binding for undeclared names.
- Require every named-data reference to resolve to a lexical `datasets`
  declaration.
- Make unresolved named data fail fast instead of loading empty rows.
- Remove `updateNamedData()` and global name-based source lookup.
- Remove compatibility tests and documentation after the deprecation window.

The TODOs must also state the expected benefits:

- One explicit dataset ownership model.
- No global name ambiguity.
- Predictable repeated-import and shadowing behavior.
- Simpler named-source construction, update routing, and disposal.
- Safer dataflow sharing based solely on binding identity.

Likely central locations are the undeclared-name fallback resolver and the
legacy methods/options themselves.

## Implementation sequence

### 1. Grammar and bindings

- Move `datasets?: Record<string, any[]>` to `ViewSpecBase`.
- Remove the duplicate root-only declaration.
- Add dataset binding and per-view scope modules.
- Initialize a scope in the base `View` constructor.
- Dispose locally owned bindings with the view.
- Remove root-spec registration as a normal provider from browser and headless
  initialization.

### 2. Binding-aware named sources

- Resolve bindings from the referencing view in `flowBuilder`.
- Apply the same logic to primary and auxiliary/lookup sources.
- Store runtime overrides on bindings rather than individual `NamedSource`
  instances.
- Reload all live canonical sources attached to an updated binding.
- Add a distinct data-source sharing key and update optimizer bookkeeping.
- Replace binding-sensitive name lookups in `DataFlow`.

### 3. Public API

- Extend `ViewHandle` with `setNamedData()` and `resetNamedData()`.
- Resolve only declarations owned by the handle's exact view.
- Validate arrays at the runtime API boundary.
- Request the necessary render/layout/domain refresh after propagation.
- Add clear errors for missing, ancestor-owned, disposed, and ambiguous legacy
  targets.
- Add deprecation annotations to the old update API and provider option.

### 4. Dynamic lifecycle

- Preserve overrides when consumers are hidden or not yet initialized.
- Ensure newly inserted descendants consume the latest override.
- Share an ancestor-owned binding when inserting another consumer.
- Keep an ancestor binding alive when one descendant is removed.
- Invalidate owner-based updates after the owning subtree is removed.
- Roll back bindings and dataflow branches after failed insertion.
- Ensure final embed destruction releases declaration and compatibility
  bindings.

### 5. Documentation, schema, and examples

- Regenerate schema artifacts after moving `datasets`.
- Update named-data grammar documentation to explain declaration, lexical
  lookup, ownership, shadowing, and reset behavior.
- Update runtime-state documentation to recommend the view-handle API.
- Move provider and global update documentation into a deprecation/migration
  section.
- Update relevant `packages/embed-examples` specs to declare their datasets.
- Replace calls to `updateNamedData()` with owner-handle calls.
- Supply initial rows through `spec.datasets` where available.
- Use empty declarations followed by `setNamedData()` for asynchronous data.
- Keep a legacy example only if explicit deprecated-API coverage is valuable.

## Focused tests

### Resolution and dataflow

- A declaration is visible to its own view.
- Descendants inherit declarations through `dataParent`.
- A child declaration shadows an ancestor.
- Sibling declarations with the same name are independent.
- Empty arrays shadow outer declarations.
- Primary and lookup inputs use identical resolution.
- References to one binding share a canonical source.
- Different bindings with the same name do not merge.

### Imports

- An imported subtree resolves its own `geneticCode` and
  `nucleotideComplements`.
- The same import instantiated twice receives independent bindings.
- Updating one instance does not affect the other.
- Multiple references inside one imported instance still share dataflow.
- Anonymous imports remain lexically correct even when they are not durable
  selector scopes.

### Runtime API

- The exact owner can set and reset its dataset.
- Reset restores declared rows.
- A descendant handle cannot update an ancestor-owned dataset.
- An undeclared name produces an actionable error.
- A removed owner handle cannot update its former binding.
- Non-array input fails at the API boundary.
- The deprecated flat update remains functional for an unambiguous legacy
  source and throws for ambiguous scoped bindings.
- The deprecated provider remains functional during compatibility.

### Mutation and disposal

- Updating before a hidden consumer is initialized is retained.
- An inserted consumer sees the current override.
- Removing one consumer preserves remaining branches.
- Removing the owner removes its binding and final source branches.
- Failed insertion leaves no binding, source, collector, or live handle.

### Documentation examples

- Add a focused synthetic regression test for imported named lookup data
  without depending on remote FASTA access.
- Validate the genome-browser and translation example specifications against
  the generated schema.
- Smoke-test migrated embed examples where existing package infrastructure
  permits.

## Verification

Run focused suites first:

```sh
npx vitest run packages/core/src/data/flowInit.test.js
npx vitest run packages/core/src/data/flowOptimizer.test.js
npx vitest run packages/core/src/view/viewFactory.test.js
npx vitest run packages/core/src/view/viewMutationApi.test.js
npx vitest run packages/core/src/view/viewMutationApi.acid.test.js
```

Then run:

```sh
npm --workspaces run test:tsc --if-present
npm run lint
npm test
```

Regenerate and verify schema/docs artifacts using the repository's established
build commands when the type changes require it.

Before committing, inspect the full diff and verify that temporary
compatibility code is clearly isolated and covered by the required TODOs.

## Tentative commits

The exact boundaries may be consolidated if intermediate commits would not
build or pass tests.

1. `feat(core): add lexically scoped named datasets`

   Add view-owned bindings, lexical resolution, binding-aware source sharing,
   import regression coverage, and schema changes.

2. `feat(core): add owner-scoped named data updates`

   Add `ViewHandle.setNamedData()` and `resetNamedData()`, lifecycle handling,
   exact-owner validation, and focused API/mutation tests.

3. `refactor(core): isolate deprecated global named data support`

   Preserve the provider and flat update compatibility layer, add deprecation
   annotations and future-removal TODOs, and cover ambiguity behavior.

4. `refactor(embed-examples): use scoped named data updates`

   Add explicit dataset declarations and migrate runtime updates to view
   handles.

5. `docs: document scoped named data ownership`

   Document lexical lookup, owner-based updates, reset behavior, migration from
   deprecated APIs, and the imported-genome-browser use case.
