# View / Parameter Selector Refactor Plan

## Rationale

GenomeSpy currently relies on `view.name` behaving like a globally-unique identifier in several places (notably the App’s view visibility persistence and a few view lookups). This breaks down when view subtrees are reused via templates or URL imports, because importing the same template multiple times naturally produces duplicate names.

At the same time, parameter state is scoped and shadowable: parameter lookup walks the view’s ancestor chain (nearest definition wins). Duplicate parameter names are both allowed and useful during spec construction, but user-facing parameters (bound inputs and selections) create an expectation of bookmarkability/shareability.

The goal of this refactor is to:

- Stop requiring globally-unique `name` across the entire view specification.
- Make shareable/bookmarkable state robust when templates are imported multiple times.
- Define a stable, spec-author-controlled addressing scheme for:
  - toggleable view visibility (`configurableVisibility`)
  - user-facing parameter state (bound inputs and selection parameters)

A key observation from the spec and real-world usage is:

- In practice, problematic name duplication primarily arises from importing the same template subtree multiple times.
- The spec already has an import-site override name: `ImportSpec.name` overrides the imported spec’s `name`.
- Templates themselves can import additional content (nested imports), so an addressing scheme must support nested scopes.

This plan intentionally avoids converting view visibility into parameters (for now). Instead, it introduces selector keys that are compatible with the current bookmark model while enabling a future migration toward a more parameter-centric state model.

## Current Semantics (Imports & Types)

This plan is grounded in the existing spec and docs:

- Import docs: [docs/grammar/import.md](../../docs/grammar/import.md)
  - Templates are reused via `templates` + `{ "import": { "template": "..." } }`.
  - Import-site parameters (`ImportSpec.params`) override imported spec parameters.
- Type definition: [packages/core/src/spec/view.d.ts](src/spec/view.d.ts)
  - `ImportSpec.name` overrides the name specified in the imported specification.
  - `ImportSpec.params` supports both `Parameter[]` and an object shorthand.
- Implementation: view creation/import: [packages/core/src/view/viewFactory.js](src/view/viewFactory.js)
  - `applyParamsToImportedSpec` sets `importedSpec.name = importSpec.name`.
  - Templates are resolved by ascending the `dataParent` chain.

Implication: `ImportSpec.name` already behaves like an “instance name” at the root of the imported subtree.

## Proposed Model: Import Scopes + Local Uniqueness

### Core idea

Treat each import instantiation as a **scope frame**. A selector key is primarily:

- an **import-scope chain** (nesting-aware), plus
- a **local identifier** within the final scope.

This eliminates the need for order-based selectors and avoids relying on internal runtime nodes.

### What forms a scope frame?

A scope frame is created by every `ImportSpec` instantiation.

- If `ImportSpec.name` is provided, that string becomes the scope’s name.
- If `ImportSpec.name` is omitted, the scope is _unnamed_.

Nested imports naturally produce a scope chain.

### Local uniqueness rules

Within a single scope instance, explicitly specified names need only be unique **within that scope**, not globally.

To reduce author burden, enforce uniqueness only for elements that are expected to be bookmarkable.

#### Addressable / bookmark-relevant features

A scope is considered “addressable” if it contains any of:

- a view with `configurableVisibility: true`
- a parameter with binding (`bind`) (user-facing widget)
- a selection parameter (`select`) (user-facing interactive state)

#### Enforcement rules

1. **Within a single scope instance**

- All views with `configurableVisibility: true` must have an explicitly specified `name`.
- Those names must be unique within the scope.

2. **Within a single scope instance: user-facing parameters**

- Parameter names that are user-facing (bound or selection) must be unambiguous.
- Recommended rule: a user-facing parameter is identified by `(definingViewName, paramName)` within the scope.
  - Therefore, if a scope contains user-facing params, the _defining view_ should have an explicit `name`.
  - Duplicate user-facing parameter names under different defining views are allowed only if the defining views are uniquely named.

3. **Across sibling import instances**

- If multiple sibling import instances under the same parent contain addressable features, each such import instance must have a unique `ImportSpec.name`.
- If there is only a single addressable import instance at that level, it may remain unnamed (no ambiguity).

This satisfies: “don’t require naming every import, but require it when the subtree contains bookmarkable state and could be duplicated.”

### Compatibility with current docs

Currently, docs and types say `configurableVisibility` requires `name` unique “within the view hierarchy/specification”. This plan changes that contract to:

- unique within the relevant **import scope**
- and additionally requires disambiguating import instances only when multiple addressable instances exist.

Docs and type comments will need to be updated accordingly.

## View Selector

### Selector data model

A **ViewSelector** identifies an addressable view for visibility toggling and other UI-driven operations.

Recommended logical form (language-agnostic):

- `scope: string[]` — the chain of named import instances
- `view: string` — the explicitly specified view name (unique within the scope)

Example:

- `scope: ["patientPanel", "cnvTracks"], view: "coverage"`

### Serialization format for bookmarks

Bookmarks require string keys. Use a reversible format.

Recommended:

- `JSON.stringify({ s: scopeArray, v: viewName })`

Optionally add a prefix for quick discrimination (not required if parsing is robust):

- `"v:" + JSON.stringify({ s, v })`

### Resolution algorithm (runtime)

Given `viewRoot` and a selector `{s, v}`:

1. Traverse into the view tree by following the import scope chain.
   - Each `ImportSpec` that had a `name` becomes the root view’s `name` for that imported subtree (per `applyParamsToImportedSpec`).
   - Traversal should follow **import boundaries**, not arbitrary descendants.
2. Within the target scope instance, find the uniquely named view `v`.

If zero matches → selector is stale; ignore entry.
If multiple matches → selector is ambiguous; ignore entry and (optionally) surface a warning.

### What counts as “import boundary” in runtime?

Implementation detail: the runtime view tree may include wrapper nodes (e.g. `implicitRoot`) and decoration nodes (axes, scrollbars).

The selector system must operate on a logical “addressable tree” that:

- includes imported subtree roots and explicit spec views
- excludes decoration/implementation-only views

The plan includes introducing a dedicated traversal helper that yields “addressable descendants” without relying on the existing `findDescendantByName` global lookup.

## Parameter Names & Parameter Selectors

### Parameter identity

Parameter lookup is scoped by ancestor chain; therefore, parameter identity for bookmarking should refer to the **definition site** rather than the consumer.

Recommended **ParamSelector** logical form:

- `scope: string[]` — named import instance chain
- `view: string` — name of the view that defines the parameter
- `param: string` — parameter name

Example:

- `scope: ["patientPanel", "cnvTracks"], view: "coverage", param: "brush"`

### Serialization format

- `JSON.stringify({ s: scopeArray, v: viewName, p: paramName })`

Optional prefix:

- `"p:" + JSON.stringify({ s, v, p })`

### Enforcing bookmarkability expectations

Because end users can manipulate bound and selection parameters, treat these as bookmark-relevant:

- If a scope contains any bound/selection parameters, ensure they can be uniquely addressed using `(definingViewName, paramName)`.
- If the defining view lacks a name, either:
  - require a name (for user-facing params), or
  - promote the parameter to a named ancestor that already has a stable identity.

### Import overrides

Import overrides (`ImportSpec.params`) are applied by replacing/adding params by name in the imported spec.

For identity:

- The parameter still “belongs” to the imported subtree instance.
- The definition view is the view whose `params` array ended up containing the parameter after override application.

This makes parameter state stable under template reuse, as long as the import instance is disambiguated when necessary.

## State Persistence (Bookmarks, URL Hash)

### New bookmarks should always use selectors

The App currently stores `viewSettings.visibilities` keyed by `view.name` and includes this in shareable links/bookmarks.

Target behavior:

- When saving/sharing state, always write selector keys for:
  - configurable visibilities
  - bookmarkable parameter state

### Legacy restore must still work

Restoration must accept legacy `{ [name: string]: boolean }` (view name keys). Plan:

- On restore:
  - If a key parses as a selector → resolve it.
  - Else treat as legacy name → apply legacy behavior (current semantics).

This approach does not require migrating legacy keys in Redux state.

### Two-phase restore consideration

The App performs an “early restore” of view visibility before initial data/scale initialization.

- Selector resolution may require a built view tree.
- If early restore happens before the tree exists, defer selector application until after launch, but still apply legacy name keys early if needed.

Plan includes defining when selectors are applied to satisfy both correctness and performance.

## Implementation Plan (Phased)

### Phase 0 — Spec contract and terminology

- Define “import scope”, “scope chain”, “addressable/bookmark-relevant feature”.
- Update type docs and end-user docs to reflect scoped uniqueness.

### Phase 1 — Core selector utilities (Core package)

Add utilities that:

- build scope-chain information for views created via `ImportSpec`
- enumerate “addressable” views (exclude decoration/internal nodes)
- resolve a selector `{s, v}` to a unique runtime view
- resolve a selector `{s, v, p}` to a unique parameter definition / mediator entry

These utilities should be pure and testable without App.

### Phase 2 — Validation of naming constraints

Introduce validation (likely at spec validation boundary or view creation):

- For each scope instance:
  - detect addressable features
  - if addressable and ambiguous:
    - require unique `ImportSpec.name` for sibling instances
  - ensure uniqueness of:
    - configurable view names within scope
    - defining view names for user-facing params

Validation should fail fast with actionable error messages:

- “Multiple imported instances with configurable visibility require distinct import names”
- “View with configurableVisibility must have an explicit name”
- “User-facing parameter ‘brush’ must be defined in a named view”

### Phase 3 — App integration (persistence)

- Change bookmark/URL serialization to emit selector keys for new bookmarks.
- Keep legacy restore compatibility.
- Update the visibility predicate and UI toggle logic to consult selector keys.

### Phase 4 — Parameter state persistence

- Define what parameter state is persisted:
  - bound inputs: current value
  - selections: selection value/state
- Add bookmark serialization/deserialization using ParamSelector keys.
- Ensure scoping/override behavior is preserved.

### Phase 5 — Cleanup and deprecation

- Deprecate any global “find by name” mechanisms used for bookmark/state features.
- Keep legacy restore paths, but consider removing legacy _writing_ over time.

## Testing

### Core tests (Vitest)

Add tests near relevant code (Core package) for:

- Template import scoping:
  - import the same template twice with different `ImportSpec.name`
  - ensure selectors resolve to different instances
- Unnamed import instance behavior:
  - single instance without addressable features → allowed
  - multiple instances with addressable features → error
- Scoped uniqueness:
  - duplicate view names across different import scopes → allowed
  - duplicate configurable view names within same scope → error
- Parameter selectors:
  - bound param and selection param are uniquely resolvable by `(scope, view, param)`
  - override via `ImportSpec.params` still yields stable identity

### App tests

Add tests for:

- Legacy bookmark restore still applies visibilities keyed by plain `view.name`.
- New bookmark save emits selector keys.
- Round-trip: save → restore yields same visible views and parameter states.

## Documentation

Update docs to match the new contract:

- [docs/grammar/import.md](../../docs/grammar/import.md)
  - Clarify that `ImportSpec.name` names the imported instance and participates in bookmark addressing.
  - Recommend naming imports when importing the same template multiple times and exposing bookmarkable state.
- [docs/grammar/parameters.md](../../docs/grammar/parameters.md)
  - Explain bookmarkability expectations for bound/selection parameters.
  - Describe scoping/override implications for persisted state.
- [docs/sample-collections/visualizing.md](../../docs/sample-collections/visualizing.md)
  - Update the “unique within the view specification” statement to “unique within the import scope instance”.
- Type comments in [packages/core/src/spec/view.d.ts](src/spec/view.d.ts)
  - Update `ViewSpecBase.name` and `configurableVisibility` docs to mention scoped uniqueness.
  - Optionally add clarifying notes to `ImportSpec.name` about scope/instance naming.

## Risks & Mitigations

- **Ambiguity when imports are unnamed**
  - Mitigation: require import instance naming only when multiple addressable instances exist.
- **Refactors that rename import instance names or view names break bookmarks**
  - Mitigation: treat these names as part of a public contract; document clearly; provide actionable error/warning messages.
- **Runtime tree contains implementation nodes that shift with refactors**
  - Mitigation: selector resolution operates on an addressable/logical tree, not the raw runtime view tree.
- **Early restore ordering (before view tree exists)**
  - Mitigation: define a two-phase restore pipeline; allow deferral for selector-based state.
- **Performance in large view trees**
  - Mitigation: precompute scope/lookup maps once after view creation; avoid repeated DFS per lookup.

## Definition of Success

A successful outcome looks like:

- New shareable URLs and saved bookmarks persist state using selector keys that remain stable under template reuse.
- The same template can be imported multiple times without requiring globally-unique names throughout the imported subtree.
- Naming constraints are minimal but strict where needed:
  - configurable visibility and user-facing parameters are always unambiguous.
  - importing the same bookmark-relevant subtree multiple times requires explicit import instance names.
- Legacy bookmarks that store visibilities keyed by plain `view.name` still restore sensibly.
- Tests cover:
  - nested imports
  - import-site name overrides
  - scoped uniqueness enforcement
  - bookmark round-trips for both visibilities and parameter states
