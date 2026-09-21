---
name: debug-genomespy-web
description: Reproduce, diagnose, and smoke-test GenomeSpy browser behavior with Playwright or an interactive browser. Use for UI bugs, interaction problems, rendered-output checks, dev-server testing, or browser-console/network inspection; prefer unit tests for behavior that does not require a browser.
---

# Debug GenomeSpy in a browser

1. Prefer a focused Vitest test when it can reproduce the behavior reliably.
2. Use Playwright for real browser automation. An interactive browser or Chrome
   DevTools integration is also suitable when inspecting live state is useful.
3. For a focused Core WebGL smoke test, run
   `npm -w @genome-spy/core run capture:screenshots -- --check <example paths>`.
   It checks browser rendering errors but not pixel correctness; reserve
   `npm run smoke:examples` for broad coverage because Playwright is slow.
4. Open `http://127.0.0.1:8080/`.
5. If the development server is not running, start `npm start` from the
   repository root and keep the session available while testing.
6. The root page lists example and private specs; the first example is usually
   the quickest smoke test.
7. For live hierarchy, names, scales, parameters, or dataflow, start with the
   Inspector snapshot helpers below. Use direct runtime traversal when the
   snapshots do not expose the needed detail. Keep live objects in the browser
   context; return compact, serializable projections to browser tools.
8. Reproduce the smallest relevant flow and inspect visible output, console
   errors, and network behavior as appropriate. The Inspector UI presents the
   same snapshots when interactive exploration is useful.
9. After a fix, repeat the reproduction and add durable automated coverage when
   the behavior warrants it.

Development routes live in package `vite.config.js` files and share helpers in
the repository-root `devServerRoutes.mjs`.

## Development runtime objects

- `window.__genomeSpy.api` is the `EmbedResult` returned by App's `embed()`.
- `api.debug.getViewRoot()` returns the live root; App also exposes it as
  `window.__genomeSpy.viewRoot`. Treat runtime objects as read-only unless the
  debugging task specifically requires mutation.
- `window.__genomeSpy.viewRoot.context.dataFlow` is the live `DataFlow`.
- `window.__genomeSpy.api.debug.getModules()` loads Core's serializable snapshot
  helpers, which are also used by the GenomeSpy Inspector.

## Snapshot-first inspection

First obtain the retained `EmbedResult`, load the helpers, and create a shared
ID allocator in the browser context. This example captures the view hierarchy:

```js
const api = window.__genomeSpy.api; // Or the standalone embed's retained API.
const root = api.debug.getViewRoot();
const debug = await api.debug.getModules();
/** @type {WeakMap<object, string>} */
const ids = new WeakMap();
let nextId = 0;
const options = {
  /** @param {object} object */
  getDebugId(object) {
    let id = ids.get(object);
    if (id === undefined) {
      id = "debug-" + nextId++;
      ids.set(object, id);
    }
    return id;
  },
};
const views = debug.createViewDebugSnapshot(root, options);
```

Reuse the ID allocator across helpers and repeated snapshots to join records
and compare state. The IDs identify live objects, not persistent bookmarks.

With that setup, choose only the snapshot helpers relevant to the question:

| Helper                          | Useful information                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `createViewDebugSnapshot`       | Ordered `childIds`, explicit/default names, scoped selectors, bounds, full view specs                                         |
| `createMarkDebugSnapshot`       | Readiness, picking participation, current `dataCount`, property previews                                                      |
| `createResolutionDebugSnapshot` | Shared scale/axis/legend identities, member views, domains and ranges                                                         |
| `createParamDebugSnapshot`      | Parameter scopes, kinds, values, writability and configuration                                                                |
| `createDataflowDebugSnapshot`   | Sources, transforms, previews and domain-sensitive channels; pass `root.context.dataFlow` and add `rootView: root` to options |

View snapshots omit axes and other UI decorations by default; use
`includeChrome: true` when investigating them. Mark properties are bounded
previews: use a view node's `spec` for complete declared settings, or inspect
runtime state when a resolved value is missing.

For maintainers: [issue #503](https://github.com/genome-spy/genome-spy/issues/503)
tracks a proposed API for easier agent inspection and future MCP considerations.
The example above uses the currently available snapshot helpers.

For naming and hierarchy questions, inspect snapshots before exporting SVG.
When actual paint order, clipping, or emitted geometry needs verification, use
`api.imageExport.svg()` and inspect `data-name` / `data-view-path` groups; see
`test-genomespy-views`. Screenshots and interaction checks remain necessary for
shader appearance, blending, and picking behavior.

## Focused view capture

When a large visualization makes a rendering problem hard to inspect, capture
the current canvas region of one view or layout subtree. A unit view's bounds
focus on that view; a container view's bounds cover its laid-out subtree. This
is a crop of the live frame, not an independent layout, so it preserves shared
scales, zoom state, parameters, parent clipping, and renderer-specific output.

Prefer a named view selector because it can be resolved again after Playground
re-embeds an edited specification. For an anonymous or repeated runtime view,
use the `id` of a `ViewHandle` obtained from `api.views.root()` and its
`children()` in the current embed only. Resolve the handle inside the browser
context; do not try to serialize a `ViewHandle`.

With a Playwright `page`, compute a document-relative screenshot clip from the
public layout bounds and the live canvas:

```js
const address = { scope: [], view: "detail" };
// For an exact runtime instance instead, use: { id: "current-handle-id" }
const clip = await page.evaluate((requestedAddress) => {
  /**
   * Converts canvas-coordinate layout bounds to viewport-relative CSS bounds.
   * This generic DOM helper is intentionally local to the browser workflow.
   *
   * @param {{ x: number, y: number, width: number, height: number }} bounds
   * @param {HTMLCanvasElement} canvas
   */
  function viewLayoutBoundsToClientBounds(bounds, canvas) {
    const canvasBounds = canvas.getBoundingClientRect();
    if (canvas.offsetWidth <= 0 || canvas.offsetHeight <= 0) {
      throw new Error("Cannot convert bounds for a canvas with no layout.");
    }

    const scaleX = canvasBounds.width / canvas.offsetWidth;
    const scaleY = canvasBounds.height / canvas.offsetHeight;
    const contentX = canvasBounds.left + canvas.clientLeft * scaleX;
    const contentY = canvasBounds.top + canvas.clientTop * scaleY;

    return {
      x: contentX + bounds.x * scaleX,
      y: contentY + bounds.y * scaleY,
      width: bounds.width * scaleX,
      height: bounds.height * scaleY,
    };
  }

  const api = window.__genomeSpy.api;
  if (!api) {
    throw new Error("GenomeSpy has not finished embedding.");
  }

  let address = requestedAddress;
  if ("id" in requestedAddress) {
    const pending = [api.views.root()];
    let handle;
    while (pending.length > 0) {
      const candidate = pending.pop();
      if (candidate.id === requestedAddress.id) {
        handle = candidate;
        break;
      }
      pending.push(...candidate.children());
    }
    if (!handle) {
      throw new Error("The view handle is stale or does not exist.");
    }
    address = handle;
  }

  const bounds = api.views.getLayoutBounds(address);
  if (!bounds) {
    throw new Error("The view has no rendered layout bounds.");
  }

  const canvas = document.querySelector(".canvas-wrapper > canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("GenomeSpy canvas not found.");
  }

  const left = Math.max(0, bounds.x);
  const top = Math.max(0, bounds.y);
  const right = Math.min(canvas.clientWidth, bounds.x + bounds.width);
  const bottom = Math.min(canvas.clientHeight, bounds.y + bounds.height);
  if (right <= left || bottom <= top) {
    throw new Error("The view is outside the visible canvas.");
  }

  const clientBounds = viewLayoutBoundsToClientBounds(
    {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    },
    canvas
  );

  return {
    x: window.scrollX + clientBounds.x,
    y: window.scrollY + clientBounds.y,
    width: clientBounds.width,
    height: clientBounds.height,
  };
}, address);

await page.screenshot({ path: "view.png", clip });
```

Wait for the relevant render or completed layout update before capturing. Keep
the full-visualization screenshot as context when the bug may involve a parent,
shared guide, sibling overlap, or surrounding layout. The crop includes every
pixel painted inside the rectangle; it does not isolate paint ownership, and
guides or shadows extending outside the view bounds are omitted. Use structured
SVG groups when the distinction between overlapping view subtrees matters.
