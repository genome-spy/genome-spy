# Playground documentation links

## Scope and current status

The base URL notice has been replaced with documentation links in the working
tree. Its component, display state, and Clear action have been removed. Base URL
inference, persistence, and data/import resolution remain in place.

The goal is to show links to every documentation page that embeds the loaded
example, above the specification editor. Keep this metadata outside example
specifications and derive it from documentation sources. Do not add runtime
crawling, a backend, content matching, or App rendering support to Playground.

## Findings

- `utils/markdown_extension/extension/extension.py` expands `EXAMPLE` macros
  into live embeds. For Core examples it supplies a `playground-url` containing
  `/docs/example-specs/<group>/<path>.json`. App examples deliberately omit that
  link because Playground embeds Core.
- An inspection of `docs/**/*.md` found 125 distinct examples in `EXAMPLE`
  macros and 131 distinct example/page pairs: 118 docs examples and seven App
  examples. Five examples appear on multiple pages. All referenced specs exist.
- `examples/docs/grammar/mark/rule/synteny-hg38-mm10.json` appears on the
  Genomic Coordinates, Rule, and Scales pages. The example's directory alone
  cannot identify all of its documentation.
- `packages/playground/exampleCatalog.mjs` already derives a catalog keyed by
  stable example IDs such as `docs/grammar/mark/rule/synteny-hg38-mm10`.
  `vite.config.js` serves it in development and emits it for production.
- Catalog URLs differ between development (`/examples/`) and deployment
  (`/docs/example-specs/`). Example identity must account for both roots.
- `src/index.js` loads the catalog only when opening the picker. It removes the
  `spec` query parameter on edits and saves only specification text and the
  inherited base URL. The source example therefore needs its own saved identity.
- `EXAMPLE_GALLERY` cards link to detailed docs pages; they are navigation,
  rather than live uses of the example. The initial index should cover `EXAMPLE`
  embeds, avoiding redundant links to gallery landing pages.

## Implementation

Extend the existing catalog generator with a reverse index of documentation
references. Scan canonical Markdown under `docs/` for `EXAMPLE` directives,
excluding fenced code blocks and generated asset directories. Parse the path
token according to the macro's quoted-argument syntax; options such as height
and runtime do not change identity. Validate referenced examples, deduplicate
pages, and sort results deterministically.

Each catalog entry includes `documentation: { title: string, url: string }[]`.
Use the page's first H1 for the concise label, falling back to its frontmatter
title and then a filename label. Link to the nearest preceding heading using
the existing Python-Markdown TOC conventions, including explicit IDs and
numbered duplicates. If there is no preceding heading, or it is the page's first
heading, link to the page itself without a hash. Still reserve the first
heading's ID so later duplicate headings receive the correct suffix.
Keep one link per page, targeting the example's first occurrence. No new anchors
or macro arguments are needed. Map `index.md` to its containing directory and
other `.md` files to directory URLs, matching the current Zensical output.
Resolve these paths against `https://genomespy.app/docs/`; the Playground dev
server does not serve the documentation site. Verify that route mapping against
rendered docs during integration.

Track an optional `sourceExampleId` when a same-origin URL under either known
example root is loaded successfully. Do not match arbitrary external URLs by
their path alone. Preserve this ID on edits, formatting, renderer/layout changes,
and reloads, and replace or clear it when another spec is loaded. Persist it with
the existing stored state; older saved states simply have no source identity.
The references describe the original example, including after edits; they do
not claim that the current text is still identical.

Load the catalog whenever there is a source example ID, using the existing
shared loading path. Catalog failure must leave editing and rendering usable;
the picker can retain its existing error display. Derive links from the current
source ID rather than copying them into a second state variable.

Render a wrapping bar above the editor labeled **Described in documentation:**,
followed by page-title links with outbound-link icons. Open links in a new tab to preserve
the current editing session. Hide the entire bar for unknown examples, examples
without references, and saved specs without a source identity. Keep the toolbar's
general Docs link available.

## Alternatives and tradeoffs

- A `from` query parameter supplied by the docs is small but only identifies
  the originating page; it misses other uses and examples opened from the picker.
- Scraping generated `site/` HTML gives authoritative routes and titles and
  avoids parsing Markdown macros, but makes standalone Playground development
  and builds depend on a fresh documentation build. Reconsider if routes or
  macro expansion become more complex. Deployment already builds docs first.
- Collecting references inside the Python Markdown extension avoids a second
  directive parser but needs a reliable build-wide aggregation lifecycle across
  pages. That machinery is unnecessary for the current explicit source format.
- Manually adding documentation URLs to specs duplicates information and will
  drift when pages move or examples are reused.
- [Vega Embed](https://github.com/vega/vega-embed#readme) provides an established
  embedded-example-to-editor action, comparable to the existing docs action.
  GenomeSpy additionally needs a reverse, many-page index. No external code is
  copied or adapted by this proposal.

Risks are source parsing diverging from the macro, future nonstandard page
routes, and stale source identity when loading a different specification. Keep
the parser limited to the actual directive contract and verify these boundaries.
Gallery-only references remain outside this change's scope.

## Implementation milestone

Outcome: known examples display all relevant documentation links from direct
URLs and picker selections, and retain them while editing and after reload.
Affected areas: catalog generator, Vite catalog wiring, Playground source state
and editor template, and their focused tests. No Core or specification API change
is needed. Update the Playground changeset for the combined feature and document
the bar in the existing Playground introduction in `docs/getting-started.md`.

Verification: test catalog generation with reused specs, duplicate uses,
`index.md`, macro options, and fenced directives. Check source identity for both
URL roots, external URLs, replacement, editing, reload, and legacy saved state.
Use a browser integration check for the actual catalog-to-bar flow, including
catalog failure, keyboard links, and narrow layouts. Run Playground TypeScript,
focused tests, build, lint, and changeset checks.

Final integration acceptance: open the synteny example from both a docs page and
the picker and see Genomic Coordinates, Rule, and Scales links; follow them to
the correct pages. Confirm the six-frame translation example links to its
example page and Window; edit and reload it without losing those references.
Open a Core-only example and see no empty bar. Relative data URLs must still
load. Tentative commit: `feat(playground): link examples to their documentation`.

- [x] Inspect source identity, catalog, macros, and deployment integration.
- [x] Remove the base URL notice and its unused code.
- [x] Implement and verify documentation references and the conditional bar.
- [x] Include the nearest existing section anchor in each documentation link.

Verification completed: 34 Playground unit tests and three focused browser tests
pass for section links; the full 14-test browser suite passed for the bar itself.
Playground TypeScript, repository lint, production build, and changeset checks
pass. All 131 indexed references resolve to generated documentation routes and
heading IDs; each Core link targets the heading preceding its first embed.
The synteny visualization and its three links were also inspected in the browser.
The docs build succeeds with an existing stale-anchor warning in
`docs/sample-collections/visualizing.md:17`, outside this change. The feature's
minor changeset keeps the pending synchronized release at 1.2.0.

Final review: an independent subagent found no actionable issues and verified
all 131 documentation routes and anchors against the built site. The final
working tree passes all 34 Playground unit tests, all 14 browser tests,
Playground TypeScript and production build, repository lint, and release checks.
The proposed shared header height was discarded at the user's request; both
bars retain their previous natural sizes.

Before PR creation, reconcile this checklist, commit the record, and delete the
temporary plan in a later commit as required by the repository workflow.
