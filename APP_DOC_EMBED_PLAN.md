# Plan: Embed GenomeSpy App examples in the documentation

## Goal

Allow a documentation page to render an App specification, such as
`examples/app/copy-numbers.json`, with the existing `EXAMPLE` macro. App embeds
must behave as independent documentation widgets: they must not alter the docs
page URL, restore state from another embed, create persistent bookmarks, or
leave listeners behind after the page is removed.

The proposed authoring form is:

```md
EXAMPLE examples/app/copy-numbers.json runtime=app height=460 spechidden
```

`runtime` defaults to `core`, preserving every existing Core embed unchanged.

## Implementation status

Implemented on `docs/app-embed`:

- ESM documentation bundles and lazy App runtime: `2cd2ee065`, `d8ed413b6`
- lifecycle-safe embedded App mode: `e595962a7`
- `runtime=app` macro support and live copy-number example: `6dd0854ae`,
  `ae1962ff3`
- cache-safe documentation builds and browser-compatible App bundling:
  `be1bfc92e`, `c304bd9e8`

The copy-number example was smoke-tested in a clean, built static site. It
loads the visualization and embedded toolbar without browser-console errors.

## Findings and decisions

### What already works

- `scripts/prepare-docs-assets.mjs` copies the complete `examples/` tree to
  `docs/examples/`. Therefore `examples/app/copy-numbers.json` is already
  available to the built site at `examples/app/copy-numbers.json`.
- The Markdown preprocessor already removes `$schema` from `EXAMPLE` files,
  reads the JSON, passes `base-url="examples/"`, and creates a Playground
  link. The current URL mapping supports `/examples/app/`.
- The copy-number spec has inline data. It needs no data staging, URL rewrite,
  or special App configuration beyond selecting the App runtime.
- Zensical caches transformed Markdown in `.cache` without invalidating it for
  Markdown-extension changes. The full docs build therefore uses `--clean`.

### Why selecting the App runtime is not sufficient

- `packages/doc-embed/index.js` imports only `@genome-spy/core` and always
  calls Core's `embed` function.
- `packages/app/src/app.js` always renders an App shell containing a toolbar.
  Its provenance controls are useful in an embedded App, but its bookmark and
  sharing controls currently assume that the App owns persistent browser and
  URL state.
- During `launch()`, App reads `window.location.hash`, subscribes to the App
  store and zoomable scales, registers a `hashchange` listener, and writes
  provenance and zoom state back using `window.history.replaceState(...)`.
  Multiple documentation widgets would share that one state channel.
- `App` has no application-level teardown. The public App embed finalizer only
  destroys `genomeSpy`, so App-owned subscriptions/listeners need an explicit
  disposal path before this runtime is used in documentation navigation.
- `doc-embed` is currently emitted as a UMD library. The docs configuration
  loads `app/index.js` as a classic script. UMD cannot give this feature a
  useful dynamically imported App chunk. The requested ESM migration enables
  the Core runtime to remain the initial download and loads App only when an
  App example enters the viewport.
- The App stylesheet is not currently staged for documentation. The document
  component links to `/app/style.css`, but the generated `docs/app/` directory
  currently contains only `doc-embed`'s JavaScript. This must be replaced with
  a real, tested style-loading contract.

### Recommended embedded-App contract

Add the following public App embedding mode, with the existing behavior as the
default:

```ts
embedMode?: "standalone" | "embedded";
```

`"embedded"` means that App is one component in a host page rather than the
page owner. It has these intentionally bundled semantics:

- render the visualization workspace with an embedded-safe App toolbar, but
  without the side-panel shell;
- keep App's view factory, SampleView, reducers, transforms, selections, and
  normal Core interactions;
- do not create IndexedDB bookmark databases or load remote bookmarks;
- do not read, listen to, or write the browser URL hash;
- retain provenance and view-visibility controls, including undo/redo, while
  omitting controls that persist or share host-page state;
- scope App keyboard shortcuts to the focused visualization rather than
  claiming shortcuts from the host page;
- dispose App-owned subscriptions/listeners and UI resources when the embed is
  finalized.

This is preferable to making `doc-embed` reach into App internals or exposing
several loosely related booleans. It also leaves room for a future
`"compact"` App mode if documentation later needs selected App controls.

The first implementation will include the toolbar because App interactions
produce provenance actions that users need to undo and redo. Embedded mode must
instead give the existing toolbar an explicit, safe feature set:

- keep search, provenance history/undo/redo, and view settings;
- omit bookmark storage and sharing, because they persist data or encode state
  in the host page URL;
- retain the overflow menu only for operations that work on an embedded
  instance, such as PNG export and fullscreen, after browser verification;
- ensure menus and dialogs that deliberately use `document.body` receive the
  App stylesheet when the App runtime is loaded.

This avoids a docs-only toolbar and makes embedded mode suitable for dashboards
and other host pages. A future overlay-host API can make menus and dialogs
per-instance, but it is not required for the initial integration.

## Step-by-step implementation plan

### 1. Make the documentation embed bundle ESM and preserve lazy App loading

**Files:**

- `packages/doc-embed/vite.config.js`
- `packages/doc-embed/package.json`
- `zensical.toml`
- `package.json`
- `scripts/prepare-docs-assets.mjs`

1. Change the `doc-embed` library build from UMD to ESM, keeping a stable
   `docs/app/index.js` entry path and emitting hashed JavaScript/CSS chunks
   beneath that directory.
2. Change Zensical's `extra_javascript` entry to its structured form with
   `type = "module"`. The installed Zensical version normalizes
   `extra_javascript` items to `{ path, type, async, defer }`, so this is a
   supported configuration rather than a template workaround.
3. Add `@genome-spy/app` as a `doc-embed` dependency. Keep Core as a direct
   dependency because it remains the default runtime.
4. Add a small App-runtime loader module used only by the App path. It should
   dynamically import `@genome-spy/app`, rather than statically importing it
   from the main custom-element module.
5. Update `build:docs:prepare` so the App distributable is built before the
   doc-embed bundle resolves its App dependency. Consolidate the existing App
   schema build into that step rather than producing it twice.
6. Continue staging all `doc-embed/dist` files, not only `index.js`, because
   the ESM build will contain chunks and CSS assets. Do not commit staged
   `docs/app/` output; it is already ignored.
7. Build once and inspect the emitted import graph. The initial `index.js`
   must not contain App-only modules; an App chunk and its CSS must be fetched
   only after a `runtime="app"` element becomes visible. Confirm that Rollup
   creates shared Core chunks instead of shipping two complete Core runtimes.

**Tentative commit:**

`build(doc-embed): ship documentation embeds as ES modules`

### 2. Add a lifecycle-safe App embedding mode

**Files:**

- `packages/app/src/appTypes.d.ts`
- `packages/app/src/embedTypes.d.ts`
- `packages/app/src/app.js`
- `packages/app/src/index.js`
- `packages/app/src/components/toolbar/toolbar.js`
- `packages/app/src/components/toolbar/bookmarkButton.js`
- `packages/app/src/app.test.js`
- `packages/app/src/index.test.js`
- focused toolbar tests as needed
- related focused tests for subscriptions/UI disposal, if extracting helpers
  makes those tests clearer

1. Add the documented `embedMode` option to the App embed types, defaulting to
   `"standalone"`. Keep normal App embeds byte-for-byte behaviorally
   compatible where possible.
2. Split App launch responsibilities into local setup and standalone-only
   state persistence. In embedded mode, skip:

   - bookmark database setup and remote bookmark fetch;
   - initial URL-hash restoration;
   - the `hashchange` listener;
   - the debounced store/scale listeners that call `_updateStateToUrl()`;
   - page-level keyboard handling; only attach shortcuts while the embedded
     visualization has focus.

3. Render the regular `genome-spy-toolbar` in embedded mode and omit only the
   side-panel host. The shell must still include `.genome-spy-container`, which
   provides layout sizing to Core.
4. Give the toolbar an explicit embedded configuration, derived from the App
   mode rather than inferred from missing bookmark databases. It must retain:

   - provenance undo, redo, and history;
   - search when a genome scale makes it applicable;
   - view visibility/settings controls.

   It must omit the bookmark/share button as a whole, including its current
   unconditional Share action. The overflow menu should retain Save PNG and
   Fullscreen only after verifying that they operate on the embed container;
   retain About and Help if their body-level dialogs/links work cleanly in the
   docs host.
5. Add `App.finalize()` (or a clearly named equivalent) which is idempotent.
   Track and release the hash listener, Redux subscription, scale-domain
   listeners, `AppUiRegistry` observers, and any embedded-mode resources.
   Keep view-root disposers under Core's existing destruction path.
6. Call the App finalizer from `@genome-spy/app`'s public embed result before
   destroying the Core instance and clearing the host element. Preserve the
   current reverse-order plugin disposer behavior.
7. Add focused jsdom tests using the existing App mock pattern to prove that
   embedded mode reaches App with the correct option and finalization delegates
   to App cleanup. Add toolbar tests that embedded mode renders provenance
   controls but no bookmark/share control. Add App-level tests that embedded
   mode neither updates `window.history` nor registers URL persistence.

**Tentative commit:**

`feat(app): add lifecycle-safe embedded mode`

### 3. Teach `doc-embed` to dispatch Core and App specifications

**Files:**

- `packages/doc-embed/index.js`
- `packages/doc-embed/appEmbedRuntime.js` (new; exact filename flexible)
- `packages/doc-embed/README.md`
- `packages/doc-embed/*.test.js` (new)

1. Add a reflected `runtime` property to `GenomeSpyDocEmbed`, with `"core"` as
   its default and only `"core"`/`"app"` as accepted values. Fail visibly and
   specifically for another value instead of silently using Core.
2. Retain the existing IntersectionObserver behavior. On first intersection,
   parse the slotted JSON, resolve `baseUrl`, and choose the runtime:

   - `core`: use the existing Core embed call;
   - `app`: await the App-runtime chunk and call App `embed` with
     `{ embedMode: "embedded" }`.

3. Retain the returned handle and implement `disconnectedCallback()` to call
   `finalize()` once. Guard against the async load completing after disconnect:
   immediately finalize that late result instead of reviving a removed embed.
4. Load App CSS only with the App runtime. Verify the ESM build's CSS handling
   in the production site. If Vite does not attach a dynamically imported
   chunk's stylesheet automatically in library mode, make the loader append a
   single deduplicated `<link rel="stylesheet">` using the emitted CSS URL.
   The stylesheet must be available both to the custom-element shadow tree and
   to intentional body-level toolbar menus and dialogs.
5. Remove or correct the unconditional `/app/style.css` link in the current
   component; it currently targets a file that asset preparation does not
   create.
6. Add jsdom tests that mock both embed functions and assert runtime dispatch,
   `baseUrl`, embedded-mode options, invalid-runtime error reporting, and
   finalization on disconnect. Keep WebGL out of these unit tests.

**Tentative commit:**

`feat(doc-embed): support lazy App documentation embeds`

### 4. Add `runtime=app` to the documentation macro

**Files:**

- `utils/markdown_extension/extension/extension.py`
- a new or existing unit test under `utils/markdown_extension/tests/`
- `packages/doc-embed/README.md`

1. Extend `EXAMPLE` token parsing with `runtime=core|app`; preserve the
   default `core` output and existing `height`/`spechidden` options.
2. Emit `runtime="app"` on the generated custom element only when requested,
   so existing Markdown snapshots/output stay stable.
3. Return a clear preprocessor error for invalid runtime values. Continue to
   reject unknown tokens.
4. Add Python unit tests for default Core output, App output, and invalid
   runtime. Use temporary example files as the gallery tests do, rather than
   depending on the checkout's staged assets.
5. Document the option beside the custom-element example so direct HTML and
   macro authors use the same terminology.

**Tentative commit:**

`feat(docs): allow EXAMPLE macros to select the App runtime`

### 5. Add the copy-number documentation example

**Files:**

- `docs/sample-collections/visualizing.md`

1. Add the live example immediately after the `aggregateSamples` explanation,
   replacing or supplementing the current link-only list. Use:

   ```md
   EXAMPLE examples/app/copy-numbers.json runtime=app height=460 spechidden
   ```

2. Explain in one concise paragraph that the example uses App's SampleView and
   `aggregateSamples`; the hidden specification remains available via the
   existing “Show specification” link.
3. Verify the fixed height accounts for the 38-pixel toolbar as well as the
   workspace, without clipping the summary track or sample rows.

**Tentative commit:**

`docs(app): embed the copy-number aggregation example`

### 6. Verify the built site and add browser coverage

**Files:**

- a focused Playwright test location to be chosen after inspecting the current
  docs test harness, or a new docs smoke-test script if no harness exists
- potentially `package.json` for a named verification command

1. Run the focused App and macro unit tests, then run
   `npm run build:docs:prepare` and the Zensical build.
2. Serve the built site with a static server and use Playwright to open the
   sample-collection page. Assert that the App widget contains both a canvas
   and the App toolbar, including undo/redo controls but excluding bookmark and
   share controls.
3. Verify the network log: the Core-only home page must not request the App
   chunk or App CSS; the copy-number page must request each when its embed
   becomes visible.
4. Exercise a zoom/pan interaction in the App widget and assert that the
   documentation page's URL (including its hash) has not changed.
5. Navigate away or remove the widget, then verify no App-owned hash listener
   or URL update runs. If realistic navigation is impractical in the first
   browser test, assert the same contract through the public handle's
   `finalize()` plus the App unit tests.
6. Check the built-page console for unresolved module, stylesheet, custom
   element, or WebGL errors. Run `npm run lint` and the relevant TypeScript
   checks.

**Tentative commit:**

`test(docs): cover App example embedding in the built site`

## Acceptance criteria

- Existing Core documentation embeds render unchanged and continue to use
  `runtime="core"` implicitly.
- `copy-numbers.json` renders interactively in
  `docs/sample-collections/visualizing.md` from the built site.
- Its inline specification is shown/hidden by the existing control and its
  Playground link still targets the staged App example.
- An App documentation example includes provenance undo/redo and applicable
  view controls, but does not create bookmarks, expose sharing, touch
  URL hash/history, or interfere with another example.
- Removing the element or navigating away releases the App resources.
- The initial docs payload excludes App JavaScript and App CSS on Core-only
  pages; App assets load lazily only after an App embed is needed.
- Docs build, focused unit tests, browser smoke test, lint, and relevant type
  checks pass.

## Scope deliberately deferred

- Bookmark storage, sharing, remote bookmark tours, and any other controls
  that persist or encode state in the host page URL.
- A general body-overlay host that would make all App menus and dialogs scoped
  to a particular embedded instance.
- Gallery cards/thumbnails for App examples. The live `EXAMPLE` macro is the
  first integration target.
- Changing core `embed` behavior or the existing Core documentation examples.
