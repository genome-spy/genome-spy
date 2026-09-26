# Inspect live GenomeSpy views

Start with serializable snapshots. If they lack the needed detail, traverse
runtime objects in the browser context and return compact projections to the
browser tool.

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
