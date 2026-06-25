# @genome-spy/inspector

Experimental developer inspector for GenomeSpy.

The inspector is a DevTools-like side panel for looking at GenomeSpy runtime
state while developing or debugging visualizations. It shows the view hierarchy,
encodings, scale/axis/legend resolutions, dataflow, params, and unit mark state.
The goal is to make the live runtime easier to understand without adding debug
UI or heavy inspection code to the default Core or App bundles.

This package is currently experimental. The initial implementation was largely
vibe-coded with Codex and should be treated as a useful development tool rather
than a stable public API.

## App Integration

The inspector currently integrates with GenomeSpy App through the App plugin
surface:

```js
import { genomeSpyInspector } from "@genome-spy/inspector";

await embed(element, spec, {
    plugins: [genomeSpyInspector()],
});
```

In the App development single-page entry, the inspector is installed
automatically so it is available from the App overflow menu during local
development.

The plugin uses App UI hooks to register a menu item and a side panel. It also
registers an inspector launcher so App-side development commands can open this
panel directly to a specific inspector view.

## Core And Playground

Core integration is intentionally indirect for now. Core exposes small debug
snapshot helpers under `@genome-spy/core/debug/...`, and the inspector loads
those helpers dynamically only when an inspector session is opened. This keeps
debug-only collection code out of normal startup paths.

Playground integration is planned after the App integration stabilizes. It
should reuse the same inspector session and Lit components through a small
Playground host adapter.

Direct Core embed integration should come last. If Core eventually grows a
plugin host, it should stay small: a `GenomeSpy` instance, a container or panel
attachment point, and lifecycle disposal are enough for this tool.

## Design Principles

- Keep most inspector code in this package.
- Keep Core and App hooks minimal, explicit, and debug-oriented.
- Prefer structured snapshot objects over exposing mutable runtime internals.
- Load debug helpers and UI lazily with dynamic imports.
- Use LitElement web components for UI.
- Keep the UI dense and DevTools-like: hierarchy on the left, details on the
  right, cross-links between views, resolutions, dataflow, and params.
- Bound potentially sensitive data previews. The inspector should summarize
  runtime data by default instead of copying full datasets into the UI.
- Treat debug ids as session-local. They are stable only for the current embed
  lifetime.

## Development

Run focused checks from the repository root:

```sh
npm -w @genome-spy/inspector run test:tsc
npm -w @genome-spy/inspector run build
```

The Core debug snapshot builders have focused tests under
`packages/core/src/debug/`.
