# Plan: Embed GenomeSpy App examples in the documentation

## Goal

Allow a documentation page to render an App specification, such as
`examples/app/copy-numbers.json`, with the existing `EXAMPLE` macro. App embeds
must behave as independent documentation widgets: they must not alter the docs
page URL, restore state from another embed, create persistent bookmarks, or
leave listeners behind after the page is removed.

The proposed authoring form is:

```md
EXAMPLE examples/docs/app/copy-numbers.json runtime=app height=420 spechidden
```

`runtime` defaults to `core`, preserving every existing Core embed unchanged.

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

### Why selecting the App runtime is not sufficient

- `packages/doc-embed/index.js` imports only `@genome-spy/core` and always
  calls Core's `embed` function.
- `packages/app/src/app.js` always renders an App shell containing a toolbar.
  That toolbar includes bookmark and menu controls which are inappropriate for
  a small in-document example.
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
embedMode?: "standalone" | "document";
```

`"document"` has these intentionally bundled semantics:

- render only the visualization workspace, without the App toolbar or
  side-panel shell;
- keep App's view factory, SampleView, reducers, transforms, selections, and
  normal Core interactions;
- do not create IndexedDB bookmark databases or load remote bookmarks;
- do not read, listen to, or write the browser URL hash;
- do not install App-only global keyboard shortcuts; canvas-local Core
  interactions remain available;
- dispose App-owned subscriptions/listeners and UI resources when the embed is
  finalized.

This is preferable to making `doc-embed` reach into App internals or exposing
several loosely related booleans. It also leaves room for a future
`"compact"` App mode if documentation later needs selected App controls.

The first implementation will deliberately be content-only. Toolbar menus,
dialogs, and context menus currently append elements to `document.body`; adding
full chrome would require a separate overlay-host design and broader visual
testing. It is not needed to demonstrate `aggregateSamples` or other
App-specific view behavior.

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

### 2. Add a lifecycle-safe, content-only App embedding mode

**Files:**

- `packages/app/src/appTypes.d.ts`
- `packages/app/src/embedTypes.d.ts`
- `packages/app/src/app.js`
- `packages/app/src/index.js`
- `packages/app/src/app.test.js`
- `packages/app/src/index.test.js`
- related focused tests for subscriptions/UI disposal, if extracting helpers
  makes those tests clearer

1. Add the documented `embedMode` option to the App embed types, defaulting to
   `"standalone"`. Keep normal App embeds byte-for-byte behaviorally
   compatible where possible.
2. Split App launch responsibilities into local setup and standalone-only
   state persistence. In document mode, skip:

   - bookmark database setup and remote bookmark fetch;
   - initial URL-hash restoration;
   - the `hashchange` listener;
   - the debounced store/scale listeners that call `_updateStateToUrl()`;
   - App global keyboard shortcuts.

3. Render a workspace-only shell in document mode. It must still include the
   `.genome-spy-container` that provides layout sizing to Core, but omit
   `genome-spy-toolbar` and the side-panel host.
4. Add `App.finalize()` (or a clearly named equivalent) which is idempotent.
   Track and release the hash listener, Redux subscription, scale-domain
   listeners, `AppUiRegistry` observers, and any document-mode resources.
   Keep view-root disposers under Core's existing destruction path.
5. Call the App finalizer from `@genome-spy/app`'s public embed result before
   destroying the Core instance and clearing the host element. Preserve the
   current reverse-order plugin disposer behavior.
6. Add focused jsdom tests using the existing App mock pattern to prove that
   document mode reaches App with the correct option and finalization delegates
   to App cleanup. Add App-level tests that document mode neither updates
   `window.history` nor registers URL persistence.

**Tentative commit:**

`feat(app): add lifecycle-safe document embedding mode`

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
     `{ embedMode: "document" }`.

3. Retain the returned handle and implement `disconnectedCallback()` to call
   `finalize()` once. Guard against the async load completing after disconnect:
   immediately finalize that late result instead of reviving a removed embed.
4. Load App CSS only with the App runtime. Verify the ESM build's CSS handling
   in the production site. If Vite does not attach a dynamically imported
   chunk's stylesheet automatically in library mode, make the loader append a
   single deduplicated `<link rel="stylesheet">` using the emitted CSS URL.
   The stylesheet must be available both to the custom-element shadow tree and
   to any intentional body-level overlay. The initial content-only mode should
   not open those overlays, but the CSS contract should not leave them
   unstyled.
5. Remove or correct the unconditional `/app/style.css` link in the current
   component; it currently targets a file that asset preparation does not
   create.
6. Add jsdom tests that mock both embed functions and assert runtime dispatch,
   `baseUrl`, document-mode options, invalid-runtime error reporting, and
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
   EXAMPLE examples/docs/app/copy-numbers.json runtime=app height=420 spechidden
   ```

2. Explain in one concise paragraph that the example uses App's SampleView and
   `aggregateSamples`; the hidden specification remains available via the
   existing “Show specification” link.
3. Verify the fixed height accounts for the workspace only. It should not
   reserve toolbar space in document mode.

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
   sample-collection page. Assert that the App widget contains a canvas and
   does not contain the App toolbar.
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
- An App documentation example does not show the toolbar, create bookmarks,
  touch URL hash/history, or interfere with another example.
- Removing the element or navigating away releases the App resources.
- The initial docs payload excludes App JavaScript and App CSS on Core-only
  pages; App assets load lazily only after an App embed is needed.
- Docs build, focused unit tests, browser smoke test, lint, and relevant type
  checks pass.

## Scope deliberately deferred

- Full App toolbar, bookmarks, sharing, remote bookmark tours, and App dialogs
  in documentation embeds.
- A general body-overlay host that would make all App menus and dialogs scoped
  to a particular embedded instance.
- Gallery cards/thumbnails for App examples. The live `EXAMPLE` macro is the
  first integration target.
- Changing core `embed` behavior or the existing Core documentation examples.
